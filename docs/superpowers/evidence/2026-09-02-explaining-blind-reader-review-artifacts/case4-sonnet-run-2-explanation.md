# How a write-ahead log keeps a database durable and crash consistent

A **write-ahead log (WAL)** is an append-only file that a database writes changes to *before* it modifies the actual data files. The name states the rule directly: write to the log first, ahead of writing anywhere else. Two properties fall out of that rule, and they're the reason every mainstream database (Postgres, MySQL/InnoDB, SQLite) uses this design:

- **Durability**: once a transaction is acknowledged as committed, it survives a crash — even if the change hasn't reached the actual table/index files yet.
- **Crash consistency**: after a crash, the database can be brought back to a state where every committed transaction is fully applied and every uncommitted one is fully absent — no partial writes left behind.

A companion diagram of this whole sequence — normal writes, a checkpoint, then a crash and recovery — is rendered at `wal-flow.html`, in the same directory as this file; open it alongside the sections below, each of which walks through one leg of it.

## What gets written, and in what order

The core invariant is: **a change to data must be described in the log, and that log record must be durable on disk, before the corresponding data page is allowed to be written to disk.** Note this is about the *data pages on disk*, not the in-memory copy — the database keeps its working set of table/index pages cached in memory (usually called the **buffer pool**), and updates that in-memory copy immediately for speed; only the write of that page back to disk is deferred.

Each record in the log is tagged with an **LSN — log sequence number** — a monotonically increasing offset into the log file, used later during recovery to say "I've applied everything up through here." A transaction's records typically look like this, in order:

```
LSN 101: BEGIN txn=7
LSN 102: UPDATE txn=7 page=42 offset=8  old="A" new="B"
LSN 103: UPDATE txn=7 page=17 offset=0  old="0" new="1"
LSN 104: COMMIT txn=7
```

Each `UPDATE` record carries enough information to redo the change (the `new` value) and, if the transaction never reaches its `COMMIT`, to undo it (the `old` value).

The commit record is the pivot point: a transaction only counts as durable once its `COMMIT` record has reached disk. Nothing before that point is guaranteed to survive a crash; everything from that point on is.

## What fsync actually guarantees

`write()` to a file on Linux or macOS does not mean the bytes are on the disk — it means they've been copied into the operating system's page cache, which the kernel will flush to the physical device on its own schedule (or never, if the machine loses power first). `fsync(fd)` is the call that blocks until the kernel has pushed both the file's data and its metadata to durable storage and the storage device has confirmed the write. Two things follow from that: a successful `fsync` on the log file really does mean "this is now safe from a crash," and it says nothing about any *other* file — calling `fsync` on the log gives you no guarantee whatsoever about the data files, which is exactly why they need their own `fsync` later, during a checkpoint.

This is why the WAL writer calls `fsync` on the log file right after writing the `COMMIT` record, and only then reports success to the client:

```
write(wal_fd, commit_record_bytes)
fsync(wal_fd)          // blocks until commit_record_bytes is durable
return "commit ok"      // only now is it safe to say so
```

If the database skipped this `fsync`, "commit ok" could be a lie — the OS might still be holding the commit record in memory when the power goes out. Because `fsync` is comparatively slow (it's a round trip to physical storage), most databases batch it: they let several transactions' log records accumulate for a few milliseconds and call `fsync` once for the whole batch (this is usually called **group commit**). All of those transactions become durable together, in one flush, instead of one flush per transaction.

Note that the *data pages* (the tables and indexes themselves) are not fsynced on every commit — only the log is. That's the entire point of the design: fsyncing a small, sequential, append-only log is cheap; fsyncing the actual (randomly-scattered) data pages on every transaction would be far slower. The data pages catch up later, during a checkpoint.

## Checkpoints and log truncation

If the log is the only thing being fsynced on commit, it grows forever, and a crash years into a database's life would require replaying years of history. A **checkpoint** is the mechanism that bounds this: periodically, a background process flushes all currently-dirty pages (pages changed in memory but not yet written to their data file) to disk, fsyncs the data file, and then writes a `CHECKPOINT` record to the log containing the LSN up to which it's now safe to say "everything before this point is already reflected on disk."

```
CP: flush all dirty pages to data file
CP: fsync(data_file)
CP: append "CHECKPOINT LSN=940" to WAL
CP: fsync(wal_file)
CP: log segments with LSN < 940 can now be deleted/recycled
```

Log truncation only follows the checkpoint — never precedes it. If the log were truncated before the checkpoint's data-page flush was confirmed durable, a crash in between would leave changes that exist nowhere: not in the (truncated) log, and not yet in the data file. The order data-flush → fsync → checkpoint record → truncate is what keeps that from happening.

One more constraint on truncation: it can't discard anything a still-open transaction might need to undo. If transaction 7 began at LSN 900 and is still running when the checkpoint at LSN 940 is taken, its `old`-value records back at LSN 900 have to survive — undo replays a transaction's own records in reverse, so deleting them would leave a rolled-back transaction with nowhere to roll back to. In practice the truncation floor is the *older* of the checkpoint's LSN and the earliest LSN belonging to any transaction still active at that moment, not the checkpoint's LSN alone.

## Recovery: replaying the log after a crash

On restart after a crash, the database doesn't trust the data files to be self-consistent — some committed transactions' changes may not have reached them yet (deferred by design), and some uncommitted transactions' partial changes might have. Recovery reconciles this in three passes, an approach popularized by IBM's **ARIES** algorithm (Mohan et al., 1992) that underlies recovery in Postgres, MySQL, and SQL Server alike:

1. **Analysis** — scan forward from the last checkpoint's LSN to the end of the log, to determine which transactions were in-flight (had a `BEGIN` but no `COMMIT`) at the moment of the crash.
2. **Redo** — replay *every* logged change from that same starting point forward, committed or not, reapplying each one to the data pages. This is safe even for changes that had already reached disk before the crash: reapplying "set offset 8 to B" when offset 8 is already `B` leaves the page exactly as it was, so redo doesn't need to first check whether a change already landed — it can simply replay the whole range unconditionally.
3. **Undo** — for each transaction identified in the analysis pass as never having committed, walk its log records in reverse and restore the `old` values, removing its partial effects.

After undo completes, the data files reflect exactly the set of transactions that reached a durable `COMMIT` — nothing more, nothing less — and the database can accept new connections.

## The shape of the guarantee

Put together, the invariant a WAL enforces is: *a data page write to disk is always preceded, on disk, by the log record that explains it.* Durability comes from fsyncing the commit record before acknowledging the client. Crash consistency comes from redo making the data files match the log, and undo removing anything the log shows was never finished. Checkpointing exists purely to keep recovery bounded, and its ordering — flush data, then record the checkpoint, then truncate — is what stops it from ever violating the invariant it's supposed to be maintaining.
