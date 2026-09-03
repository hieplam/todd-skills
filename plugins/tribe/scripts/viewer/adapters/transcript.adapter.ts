// adapters/transcript.adapter.ts — the ONLY viewer file, besides `serve.ts` and
// `poller.adapter.ts`, that touches the filesystem for the live view (spec §4/§7). Every read
// here is a plain, bounded read (statSync/readdirSync/openSync+readSync/realpathSync); nothing
// is ever written, renamed, deleted, locked, or executed (card G4). The `*OrNull`/`OrEmpty`
// primitives degrade a missing/unreadable artifact to `null`/`[]` — that is the NORMAL case for
// most of what this reads (a campaign that hasn't spawned a subagent yet, a sidecar not written
// yet). `readRange` and `readAsset` deliberately do NOT swallow their errors: they are the two
// primitives the poller calls while a file is actively changing underneath it, and a genuine
// read failure there must surface as a per-process `error` SSE frame (spec §5), never be
// silently rendered as an empty read.
import { closeSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface TranscriptStat {
  sizeBytes: number;
  mtimeIso: string;
  /** Used as `firstSeenIso` for a subagent sidecar (spec D3) — the filesystem's own record of
   * when the entry first appeared, needing no persisted bookkeeping of our own (card D5). */
  birthtimeIso: string;
}

export interface TranscriptIo {
  realpathOrNull(path: string): string | null;
  statFileOrNull(path: string): TranscriptStat | null;
  /** Reads exactly the bytes in `[start, end)` of `path`, RAW — never decoded here. A
   * multi-byte UTF-8 character can straddle two calls (this file is read while it's still being
   * appended, spec §4/§7); decoding each range independently would turn the split character
   * into `U+FFFD` on both sides and lose it permanently (F44). Decoding — with a streaming
   * `TextDecoder` that carries the incomplete trailing byte sequence forward — is the caller's
   * job, because only the caller (the poller, one `TrackedTranscript` per tailed file) has the
   * per-file state a stateful decoder must live alongside. Throws on a genuine read failure —
   * callers (the poller) catch it and turn it into an `error` frame. */
  readRange(path: string, start: number, end: number): Uint8Array;
  listDirOrEmpty(dir: string): string[];
  readJsonOrNull(path: string): unknown | null;
  /** Reads one of the two allowlisted browser client files, from the fixed sibling `client/`
   * directory next to this package — never from a request path (spec §4.2). */
  readAsset(name: 'app.js' | 'app.css'): string;
}

const CLIENT_DIR = join(import.meta.dir, '..', 'client');

export function createTranscriptIo(): TranscriptIo {
  return {
    realpathOrNull(path) {
      try {
        return realpathSync(path);
      } catch {
        return null;
      }
    },
    statFileOrNull(path) {
      try {
        const st = statSync(path);
        return {
          sizeBytes: st.size,
          mtimeIso: st.mtime.toISOString(),
          birthtimeIso: st.birthtime.toISOString(),
        };
      } catch {
        return null;
      }
    },
    readRange(path, start, end) {
      const length = Math.max(0, end - start);
      if (length === 0) return new Uint8Array(0);
      const buffer = Buffer.alloc(length);
      const fd = openSync(path, 'r');
      try {
        const bytesRead = readSync(fd, buffer, 0, length, start);
        return buffer.subarray(0, bytesRead);
      } finally {
        closeSync(fd);
      }
    },
    listDirOrEmpty(dir) {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    },
    readJsonOrNull(path) {
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        return null;
      }
    },
    readAsset(name) {
      return readFileSync(join(CLIENT_DIR, name), 'utf8');
    },
  };
}
