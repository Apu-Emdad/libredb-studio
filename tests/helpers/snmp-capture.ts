/**
 * The key a recorded SNMP exchange is found by, and the two ends that use it.
 *
 * WHY A KEY AND NOT THE WHOLE DATAGRAM. Every request carries a request id that changes on every
 * run, so a recording matched byte for byte would never match twice. The key is therefore what the
 * request ASKS - the PDU type, the objects, and a GetBulk's max-repetitions - and the recorded
 * answer is replayed with the live request's id written into it. That is not imitating an
 * envelope: it is putting the recorded BODY in the right envelope, and the body is what the agent
 * decided.
 *
 * Max-repetitions is part of the key on purpose. It is the field that was being dropped on the way
 * to the wire until 14 October 2026, and a key that ignored it would match a broken request to a
 * healthy answer, which is the one thing these recordings must never do.
 */
import { readChildren, readField } from "@/lib/db/providers/network/snmp/ber";

export interface CapturedExchange {
  /** The key below, as text. */
  readonly key: string;
  /** The agent's datagram, base64, exactly as it arrived. */
  readonly answer: string;
  /** What the request asked, in words, so a reader of the file can see it without decoding. */
  readonly asked: string;
}

/** Where the request id sits inside a PDU, so a replay can write the live one into the answer. */
export interface RequestIdField {
  readonly start: number;
  readonly end: number;
}

/** The PDU tag, the asked OIDs and the PDU's third integer, read from a request datagram. */
export function readRequest(datagram: Uint8Array): {
  readonly pduTag: number;
  readonly oids: readonly string[];
  readonly thirdInteger: number;
  readonly requestId: RequestIdField;
} {
  const [, , pduField] = readChildren(datagram, readField(datagram, 0));
  const pdu = readChildren(datagram, pduField);
  const varbinds = readChildren(datagram, pdu[3]).map((entry) => readChildren(datagram, entry)[0]);
  return {
    pduTag: datagram[pduField.start - headerLength(datagram, pduField)],
    oids: varbinds.map((field) => decodeOid(datagram.slice(field.start, field.end))),
    thirdInteger: intOf(datagram, pdu[2]),
    requestId: { start: pdu[0].start, end: pdu[0].end },
  };
}

/** The key a request is recorded and found under. */
export function keyOf(request: ReturnType<typeof readRequest>): string {
  return `pdu=${request.pduTag} max=${request.thirdInteger} oids=${request.oids.join(",")}`;
}

/** The same answer with the live request's id written over the recorded one. */
export function withRequestId(answer: Uint8Array, idBytes: Uint8Array): Uint8Array {
  const [, , pduField] = readChildren(answer, readField(answer, 0));
  const pdu = readChildren(answer, pduField);
  const field = pdu[0];
  const out = Uint8Array.from(answer);
  if (field.end - field.start !== idBytes.length) {
    // Same width or nothing: a different width would move every field after it, and silently
    // re-encoding the whole datagram here would make the recording say something it did not.
    return out;
  }
  out.set(idBytes, field.start);
  return out;
}

function headerLength(buf: Uint8Array, field: { readonly start: number }): number {
  // The tag sits before the length octets, which are one byte under 0x80 and 1 + n above it.
  const lengthByte = buf[field.start - 1];
  return lengthByte < 0x80 ? 2 : 2 + (lengthByte - 0x80);
}

function intOf(buf: Uint8Array, field: { readonly start: number; readonly end: number }): number {
  let value = 0;
  for (const octet of buf.slice(field.start, field.end)) value = value * 256 + octet;
  return value;
}

export function decodeOid(bytes: Uint8Array): string {
  const out = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  for (const octet of bytes.slice(1)) {
    value = value * 128 + (octet & 0x7f);
    if ((octet & 0x80) === 0) {
      out.push(value);
      value = 0;
    }
  }
  return out.join(".");
}
