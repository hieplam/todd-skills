# Write-Ahead Logs: Durability Without Losing Data

## The Problem: In-Memory Changes vs. Storage Reality

When a database modifies data—inserting a row, updating a column, deleting a record—that change lives in memory first. A **page** is a fixed-size chunk of disk data (typically 4–16 KB); the **buffer pool** is the in-memory cache where pages live while being read or modified. But if the process crashes, the OS reboots, or power fails before a modified page makes it to disk, the change vanishes. A write-ahead log solves this: it records *what changed* to persistent storage *before* applying the change in memory, so the database can recover and replay those changes after a crash.

## Core Mechanism: Write, Then Apply

The key insight is in the name: **write ahead**. Here's the order:

1. A transaction modifies a row (e.g., `UPDATE users SET age=30 WHERE id=5`)
2. Before the database changes the in-memory page, it writes a description of the change to the log file on disk
3. Once that log record is safely written to storage, the database applies the change in memory
4. Later, the page is written to disk (no urgency—the log has already saved the change)

If a crash happens between steps 2 and 4, the in-memory change is lost, but the log record survives. Recovery reads the log and replays that change.

**A concrete example:**

```
Initial state: disk has "age=25", memory has "age=25"

Step 1: Log entry written to disk
  Log entry: [txn_id=42, page_id=7, column=age, old_value=25, new_value=30]

Step 2: Memory modified (now diverges from disk)
  Memory: age=30
  Disk: age=25 (unchanged)

Step 3: Crash happens

Step 4: Recovery reads log entry [txn_id=42, ...], replays it
  Memory: age=30
  Disk: age=25 (still unchanged, but recovery knows to apply this)

Step 5: Recovery writes page to disk
  Disk: age=30 (restored to correct state)
```

## Order Matters: The Write Order Contract

Durability depends on a strict ordering rule: **the log must reach disk before the data page changes on disk.**

Here's what happens if you reverse that. Imagine a transaction that needs to make *two* changes atomically: `UPDATE account SET balance=balance-100 WHERE id=1; UPDATE account SET balance=balance+100 WHERE id=2` (a transfer between two accounts):

```
WRONG order (data before log):
1. Modify page 5 (account 1): balance=900 (was 1000), write page 5 to disk
2. Crash BEFORE writing page 6 (account 2) to disk AND before writing any log entries

Disk state after crash:
  Account 1: balance=900 (wrote early)
  Account 2: balance=1000 (never wrote)
  Log file: empty (no log entries)

Recovery:
  Recovery finds no log records for this transaction, so assumes nothing happened.
  Disk already shows inconsistent state: account 1 decreased but account 2 unchanged.
  Result: $100 disappeared. Database corrupted.


CORRECT order (WAL):
1. Write log entry: "account 1: balance=900, account 2: balance=1100"
   Call fsync() → log entry on disk
2. Modify page 5 (account 1): balance=900
3. Modify page 6 (account 2): balance=1100
4. Crash BEFORE writing pages 5 and 6 to disk

Disk state after crash:
  Account 1: balance=1000 (unchanged)
  Account 2: balance=1000 (unchanged)
  Log file: contains complete transaction record

Recovery:
  Recovery reads log and replays the transaction.
  Sets account 1 to 900, account 2 to 1100.
  Result: Both accounts correct; no data lost.
```

This ordering is enforced by the database code. The database explicitly writes log entries *before* modifying pages in memory, and ensures log entries are flushed to disk (via fsync) before acknowledging the transaction to the client.

## fsync: What the OS Promises

When a database writes to a file, the bytes initially land in the OS's page cache (memory). `fsync()` is a system call that says: "Push all buffered bytes for this file descriptor to physical storage right now, and don't return until they're durably written."

The OS guarantees that after `fsync()` returns successfully:
- The bytes are written to the storage device (SSD, HDD, or RAID array)
- If there's a power loss immediately after `fsync()` returns, those bytes will still be there when power is restored

**Important caveat:** `fsync()` does **not** guarantee that the *data layout* on disk matches what you wrote. For example, the storage device might cache the write in its own non-volatile buffer, or reorder writes internally. Most databases assume storage devices honor `fsync()` contracts, but some systems (like certain RAID controllers) have been known to lie, losing data.

**In practice:**

```c
// Pseudocode
char log_entry[] = "txn_id=42, age=30\n";
write(log_fd, log_entry, strlen(log_entry));  // Buffered in OS page cache
// At this point, crash = data loss (the buffer is lost)

fsync(log_fd);  // Block until safely on disk
// After this returns, crash = data is safe
// Now it's OK to modify the in-memory page
```

Most databases call `fsync()` on the log after every transaction (or group of transactions), which is expensive but necessary for durability guarantees.

## Checkpoints and Log Truncation

If the database never removes old log entries, the log file grows forever—consuming disk space and making recovery slower (recovery has to replay millions of old transactions). A **checkpoint** is a mechanism to stop this growth.

A checkpoint does two things:

1. **Flushes all dirty pages in memory to disk.** ("Dirty" means modified but not yet written to storage.) The database iterates through its buffer pool and writes every modified page.
2. **Records a checkpoint marker in the log.** This marker includes the log position (LSN, or Log Sequence Number) at which all pages were clean.

After a checkpoint, recovery only needs to replay log entries *after* the checkpoint—older entries are irrelevant because their changes are already on disk.

**Example timeline:**

```
LSN 0-100:     Old log entries (changes to pages A, B, C)
LSN 100:       CHECKPOINT marker written (all pages A, B, C now on disk)
LSN 100-200:   Newer log entries (changes to pages D, E)
LSN 150:       Crash happens

Recovery process:
1. Find the last checkpoint (LSN 100)
2. Pages A, B, C are already correct on disk (checkpoint guarantees this)
3. Replay log entries LSN 100-150 (the changes to D, E after checkpoint)
4. Skip entries LSN 0-100 (checkpoint already wrote them)
```

**Log truncation:** After a successful checkpoint, the log file is truncated (old entries deleted) up to the checkpoint position. This frees disk space. New log entries continue appending after the checkpoint marker.

The tricky part: checkpoints are expensive. Flushing all dirty pages to disk can stall transactions while I/O is in flight. Databases often use **fuzzy checkpoints**—allowing new transactions to modify pages even while the checkpoint I/O is in progress—or **incremental checkpoints**—flushing pages gradually over time instead of all at once.

## How Recovery Replays the Log

When the database starts after a crash, the recovery process:

1. **Find the last checkpoint.** Read the log from the end backward to locate the most recent checkpoint marker. This tells recovery: "Everything before this point is already on disk; start replaying from here."

2. **Read log entries from checkpoint to end.** Scan forward through log entries after the checkpoint.

3. **For each log entry, re-apply the change in memory.** If the log says "set age=30 on page 7," recovery loads page 7 into the buffer pool and applies that change.

4. **Flush modified pages to disk.** After replaying all log entries, recovery writes all modified pages to disk, ensuring the database is consistent.

5. **Truncate the log (optional).** Some databases create a new checkpoint right after recovery and discard the old log, freeing space.

**Why replay is safe:** The log records absolute values (e.g., "set age to 30"), not deltas (e.g., "add 5 to age"). If a page was already written to disk before the crash, replaying "set age to 30" again produces the same result—it's idempotent. The database doesn't need to track which pages made it to disk; it replays all log entries from the checkpoint onward, and idempotency ensures consistency.

## Putting It Together: A Complete Example

```
Time T0: Database starts, checkpoint at LSN 0
Memory:  [Page A: age=25, Page B: score=100]
Disk:    [Page A: age=25, Page B: score=100]

Time T1: Transaction modifies Page A (age → 30)
  Step 1a: Write log entry "age→30" to log buffer
  Step 1b: Call fsync() on log file → log entry now on disk
  Step 1c: Modify Page A in memory (age=30, now dirty)
Memory:  [Page A: age=30 (dirty), Page B: score=100]
Disk:    [Page A: age=25, Page B: score=100, Log: age→30]

Time T2: Transaction modifies Page B (score → 150)
  Step 2a: Write log entry "score→150" to log buffer
  Step 2b: Call fsync() on log file → log entry now on disk
  Step 2c: Modify Page B in memory (score=150, now dirty)
Memory:  [Page A: age=30, Page B: score=150 (both dirty)]
Disk:    [Page A: age=25, Page B: score=100, Log: age→30, score→150]

Time T3: Checkpoint starts
  Write all dirty pages to disk
Memory:  [Page A: age=30, Page B: score=150]
Disk:    [Page A: age=30, Page B: score=150, Log: age→30, score→150]
  Write checkpoint marker to log, fsync()
Disk:    [Page A: age=30, Page B: score=150, Log: age→30, score→150, CHECKPOINT LSN 2]

Time T4: New transaction modifies Page A (age → 35)
  Step 4a: Write log entry "age→35" to log buffer
  Step 4b: Call fsync() on log file
  Step 4c: Modify Page A in memory (age=35, now dirty again)
Memory:  [Page A: age=35 (dirty), Page B: score=150]
Disk:    [Page A: age=30, Page B: score=150, Log: ..., CHECKPOINT, age→35]

Time T5: CRASH (power loss)
Memory contents lost. Disk state:
  Page A: age=30
  Page B: score=150
  Log: age→30, score→150, CHECKPOINT LSN 2, age→35

Recovery (after restart):
  1. Scan log backward, find CHECKPOINT LSN 2
  2. Scan log forward from LSN 2
  3. Find entry "age→35", replay it: load Page A, set age=35
  4. Write Page A to disk: age=35
  5. Done. Final state matches what was in memory at crash time.
```

## Key Takeaway

A write-ahead log protects against data loss by recording changes before they're applied in memory. The log lives on persistent storage, so a crash can't lose it. Recovery reads the log and replays all recorded changes, bringing the database back to the state it was in just before the crash. Checkpoints let recovery skip replaying very old log entries and free disk space by truncating the log—but checkpoints are expensive, so databases tune the frequency to balance durability guarantees against performance.

The contract is simple: **log first, apply second, fsync after log, write data when convenient.**
