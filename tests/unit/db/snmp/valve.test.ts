/**
 * The one-way valve, against datagrams the real client produced (SN-S1).
 *
 * The buffers below were captured on 13 October 2026 from `net-snmp` 3.29.2 talking to that
 * library's own in-process agent on loopback, under Bun 1.4.2, by supplying a `dgramModule`
 * that recorded what was handed to the socket. They are replayed here rather than regenerated,
 * because the client is not a dependency of this package yet and because a captured message is
 * a fixed fact: a test that builds its own message tests the builder as well as the valve.
 *
 * The negative cases matter more than the positive ones. Two of them are real write paths, a
 * SetRequest and an SNMPv1 Get, produced by asking the client to send them; the valve has to
 * refuse both. The malformed cases include one, a valid v2c Get wrapped in a SET OF rather than
 * a SEQUENCE, that exists because a mutation run showed the outer tag check was not bound: every
 * other malformed input was being refused by a later check, so the suite stayed green when the
 * outer check was deleted.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  inspectOutbound,
  ValveRefusal,
  PDU_GET,
  PDU_GET_NEXT,
  PDU_GET_BULK,
} from "@/lib/db/providers/network/snmp/valve";
import { readChildren, readField } from "@/lib/db/providers/network/snmp/ber";

/**
 * Captured from net-snmp 3.29.2 on 13 October 2026; the file carries its own provenance, and it
 * lives under `tests/fixtures/` rather than beside this test because that is where the house
 * keeps captured wire data and because `tests/unit/db/` holds test files only.
 */
const CAPTURED: Record<string, number[]> = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../fixtures/snmp/captures/net-snmp-3.29.2.json"), "utf8"),
).sent;

const bytes = (octets: number[]): Uint8Array => new Uint8Array(octets);

describe("the valve reads the PDU type where the datagram carries it", () => {
  test("a v2c Get is allowed and named", () => {
    expect(inspectOutbound(bytes(CAPTURED.v2cGet))).toEqual({ kind: "allowed", pduType: PDU_GET });
  });
  test("a v2c GetNext is allowed and named", () => {
    expect(inspectOutbound(bytes(CAPTURED.v2cGetNext))).toEqual({ kind: "allowed", pduType: PDU_GET_NEXT });
  });
  test("a v2c GetBulk is allowed and named", () => {
    expect(inspectOutbound(bytes(CAPTURED.v2cGetBulk))).toEqual({ kind: "allowed", pduType: PDU_GET_BULK });
  });
  test("a v3 authNoPriv discovery is readable", () => {
    expect(inspectOutbound(bytes(CAPTURED.v3AuthNoPrivDiscovery))).toEqual({ kind: "allowed", pduType: PDU_GET });
  });
  test("a v3 authNoPriv authenticated request is readable", () => {
    expect(inspectOutbound(bytes(CAPTURED.v3AuthNoPrivRequest))).toEqual({ kind: "allowed", pduType: PDU_GET });
  });
  test("a v3 authPriv DISCOVERY is readable, because discovery is sent at noAuthNoPriv", () => {
    expect(inspectOutbound(bytes(CAPTURED.v3AuthPrivDiscovery))).toEqual({ kind: "allowed", pduType: PDU_GET });
  });
});

describe("the valve says so when the datagram does not carry the type", () => {
  test("a v3 authPriv authenticated request is opaque, not guessed at", () => {
    const verdict = inspectOutbound(bytes(CAPTURED.v3AuthPrivRequest));
    expect(verdict.kind).toBe("opaque");
  });
});

describe("the valve refuses what it can read and does not like", () => {
  test("a real SetRequest the client produced", () => {
    expect(() => inspectOutbound(bytes(CAPTURED.v2cSet))).toThrow(ValveRefusal);
  });
  test("a real SNMPv1 Get the client produced", () => {
    expect(() => inspectOutbound(bytes(CAPTURED.v1Get))).toThrow(ValveRefusal);
  });
});

describe("the valve refuses what it cannot parse", () => {
  const malformed: ReadonlyArray<readonly [string, Uint8Array]> = [
    ["an empty datagram", new Uint8Array(0)],
    ["an outer field that is not a SEQUENCE", new Uint8Array([0x04, 0x02, 0x01, 0x02])],
    ["a length that runs past the buffer", new Uint8Array([0x30, 0x7f, 0x02, 0x01, 0x01])],
    ["an indefinite length", new Uint8Array([0x30, 0x80, 0x02, 0x01, 0x01, 0x00, 0x00])],
    // Only the outer tag check catches this one: the content is a valid v2c Get.
    [
      "a valid Get wrapped in a SET OF",
      new Uint8Array([0x31, 0x0e, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x01, 0x00]),
    ],
  ];
  for (const [what, datagram] of malformed) {
    test(what, () => {
      expect(() => inspectOutbound(datagram)).toThrow(ValveRefusal);
    });
  }
});

/**
 * KURAL 84 and KURAL 112 together. A v1 datagram is refused, and so is a datagram carrying any
 * version this provider does not speak, so "it throws" cannot tell the two apart. Measured:
 * moving `VERSION_V1` off zero left the captured v1 datagram still refused, just by the
 * catch-all at the end of the dispatch, and nothing turned red.
 *
 * That difference is not cosmetic. A v1 message on this socket means something in here built one,
 * which is a defect in this provider; a version of 7 means something built nonsense. They send a
 * reader to two different places, so they may not arrive as one sentence.
 */
describe("version zero is refused as v1 and not as an unknown version", () => {
  /** The captured v1 request with its version octet replaced, so only that byte differs. */
  const withVersion = (value: number) => {
    const datagram = bytes(CAPTURED.v1Get);
    const fields = readChildren(datagram, readField(datagram, 0));
    const copy = Uint8Array.from(datagram);
    copy[fields[0].start] = value;
    return copy;
  };

  const refusalFor = (datagram: Uint8Array) => {
    try {
      inspectOutbound(datagram);
    } catch (error) {
      return error as Error;
    }
    throw new Error("expected a refusal");
  };

  test("both are refused, which is why the sentences have to differ", () => {
    expect(() => inspectOutbound(withVersion(0))).toThrow(ValveRefusal);
    expect(() => inspectOutbound(withVersion(7))).toThrow(ValveRefusal);
  });

  test("the v1 refusal names v1 and the unknown one names the number it saw", () => {
    expect(refusalFor(withVersion(0)).message).toContain("SNMPv1");
    expect(refusalFor(withVersion(7)).message).toContain("version 7");
    expect(refusalFor(withVersion(0)).message).not.toBe(refusalFor(withVersion(7)).message);
  });

  test("the version this provider does speak is not refused at all", () => {
    expect(() => inspectOutbound(bytes(CAPTURED.v2cGet))).not.toThrow();
  });
});
