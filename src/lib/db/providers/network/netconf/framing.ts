/**
 * RFC 6242 framing for the `netconf` provider, phase 1 (issue #1724).
 *
 * Both framings are spoken. A session starts on end-of-message framing, because the hello is sent
 * before the peer's base version is known, and moves to chunked framing when both sides offered
 * base:1.1. MEASURED 2026-10-13 against Netopeer2 2.8.7: the hello carries base:1.0 and base:1.1,
 * and Clixon 7.3.0 carries both as well once the client stops forcing a version.
 *
 * The decoder is incremental and bounded. It never holds a whole reply as one growing string:
 * a byte cap is counted as bytes arrive, so a peer that never terminates a message ends the read
 * at the cap rather than at the end of memory.
 *
 * What this file does NOT do: it does not parse XML. The reader is written once for the whole
 * repository and inherited here (decision K-10), so a message leaves this file as bytes.
 */

/** The end-of-message separator of RFC 6242 section 4.3. */
export const EOM = "]]>]]>";

/** RFC 6242 section 4.2 allows a chunk size of 1 to 4294967295. */
export const MAX_CHUNK_SIZE = 4294967295;

export type Framing = "eom" | "chunked";

export interface FrameLimits {
  /** Bytes a single message may hold. A message that passes it ends the read. */
  readonly maxMessageBytes: number;
  /** Bytes a session may hold undelivered. Guards a peer that never terminates. */
  readonly maxBufferBytes: number;
}

export type FrameFault =
  | { readonly kind: "message-too-large"; readonly bytes: number; readonly cap: number }
  | { readonly kind: "buffer-too-large"; readonly bytes: number; readonly cap: number }
  | { readonly kind: "chunk-header-malformed"; readonly header: string }
  | { readonly kind: "chunk-size-out-of-range"; readonly size: string }
  | { readonly kind: "chunk-size-leading-zero"; readonly size: string };

export interface FrameStep {
  /** Messages completed by the bytes just fed, in arrival order. */
  readonly messages: readonly string[];
  /**
   * Set when the stream broke a rule of RFC 6242. A fault ends the session: section 4.2 requires
   * the peer to close the channel, and MEASURED 2026-10-13 that Netopeer2 does not always do so,
   * so the client applies the rule itself.
   */
  readonly fault?: FrameFault;
}

/** Writes a request in the framing the session negotiated. */
export function frame(payload: string, framing: Framing): string {
  if (framing === "eom") return payload + EOM;
  const bytes = Buffer.byteLength(payload, "utf8");
  return `\n#${bytes}\n${payload}\n##\n`;
}

/**
 * Reads one framing incrementally.
 *
 * A reader instance belongs to one channel. `feed` is called with whatever arrived and answers
 * the messages that are now complete. Bytes are counted as they arrive, not after a message is
 * assembled, which is the only point at which an unterminated stream can still be stopped.
 */
export class FrameReader {
  private buffer = "";
  private framing: Framing;
  private readonly limits: FrameLimits;
  private faulted = false;

  constructor(framing: Framing, limits: FrameLimits) {
    this.framing = framing;
    this.limits = limits;
  }

  /** Moves the channel to chunked framing, after both hellos offered base:1.1. */
  useChunked(): void {
    this.framing = "chunked";
  }

  feed(chunk: string): FrameStep {
    if (this.faulted) return { messages: [] };
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer, "utf8") > this.limits.maxBufferBytes) {
      return this.fail({
        kind: "buffer-too-large",
        bytes: Buffer.byteLength(this.buffer, "utf8"),
        cap: this.limits.maxBufferBytes,
      });
    }
    return this.framing === "eom" ? this.readEom() : this.readChunked();
  }

  private fail(fault: FrameFault): FrameStep {
    this.faulted = true;
    this.buffer = "";
    return { messages: [], fault };
  }

  private readEom(): FrameStep {
    const messages: string[] = [];
    for (;;) {
      const at = this.buffer.indexOf(EOM);
      if (at === -1) return { messages };
      const message = this.buffer.slice(0, at);
      const bytes = Buffer.byteLength(message, "utf8");
      if (bytes > this.limits.maxMessageBytes) {
        return this.fail({ kind: "message-too-large", bytes, cap: this.limits.maxMessageBytes });
      }
      this.buffer = this.buffer.slice(at + EOM.length);
      messages.push(message);
    }
  }

  private readChunked(): FrameStep {
    const messages: string[] = [];
    let assembled = "";
    for (;;) {
      if (this.buffer.startsWith("\n##\n")) {
        this.buffer = this.buffer.slice(4);
        const bytes = Buffer.byteLength(assembled, "utf8");
        if (bytes > this.limits.maxMessageBytes) {
          return this.fail({ kind: "message-too-large", bytes, cap: this.limits.maxMessageBytes });
        }
        messages.push(assembled);
        assembled = "";
        continue;
      }
      const header = /^\n#(\d+)\n/.exec(this.buffer);
      if (!header) {
        // Either the header has not arrived in full, or it is not a header at all.
        if (/^\n#\d*$|^\n#?$|^$/.test(this.buffer)) return { messages };
        return this.fail({ kind: "chunk-header-malformed", header: this.buffer.slice(0, 16) });
      }
      const size = header[1] ?? "";
      // RFC 6242 section 4.2 prohibits a leading zero. MEASURED 2026-10-13: Netopeer2 accepts
      // `#0172`, which the same clause forbids, so the client refuses it on its own.
      if (size.length > 1 && size.startsWith("0")) {
        return this.fail({ kind: "chunk-size-leading-zero", size });
      }
      const value = Number(size);
      if (value < 1 || value > MAX_CHUNK_SIZE) {
        return this.fail({ kind: "chunk-size-out-of-range", size });
      }
      const start = header[0].length;
      const slice = this.buffer.slice(start);
      if (Buffer.byteLength(slice, "utf8") < value) return { messages };
      const body = takeBytes(slice, value);
      assembled += body;
      this.buffer = slice.slice(body.length);
    }
  }
}

/**
 * Takes exactly `count` UTF-8 bytes from the front of `text` and answers them as a string.
 *
 * A chunk size counts bytes, not characters, and a multi byte character can be split across two
 * reads. MEASURED 2026-10-13 against an in-process peer: a four byte character split across two
 * chunks decodes correctly only when the bytes are reassembled before they are decoded.
 */
function takeBytes(text: string, count: number): string {
  const bytes = Buffer.from(text, "utf8");
  return bytes.subarray(0, count).toString("utf8");
}
