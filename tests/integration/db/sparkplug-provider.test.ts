/**
 * Sparkplug B provider, end to end (#1720), with no Docker and no network beyond loopback.
 *
 * The real provider runs: the production factory builds it, its own session dials a real TCP
 * socket, its own parser reads the packets, and its own fold and row builder answer. Only the
 * broker is replaced, and it is replaced by a RECORDING rather than by a mock: every PUBLISH
 * below is the byte-for-byte packet Eclipse Mosquitto sent, captured from the fixture by
 * `tests/live/sparkplug-evidence.ts`.
 *
 * NEITHER END OF THE FIXTURE SHARES CODE WITH THE PROVIDER. The publisher
 * (`docker/sparkplug/publisher.py`) builds the protobuf wire and the MQTT packets by hand, and
 * the capture records raw bytes without decoding any of them. A fixture encoded by the
 * provider's own encoder would agree with the provider whether or not either agreed with the
 * specification, and the suite would be measuring itself.
 *
 * The capture is pinned to the broker digest it came from, and the fixture's own README lists
 * what each edge node is there to answer.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import path from "node:path";

import { createDatabaseProvider } from "@/lib/db/factory";
import type { DatabaseConnection, QueryResult } from "@/lib/types";

const ROOT = path.join(import.meta.dir, "..", "..", "..");
const CAPTURE = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/sparkplug/plant.json"), "utf8")) as {
  readonly capturedAt: string;
  readonly broker: string;
  readonly publisher: string;
  readonly topics: readonly string[];
  readonly packets: readonly { readonly topic: string; readonly hex: string }[];
};

/** The digest `docker/sparkplug/compose-service.yml` pins, so a capture cannot drift from it. */
const BROKER_IMAGE = "eclipse-mosquitto:2.0.22@sha256:199ea8ef2e35ec2b1b37e59cfd1dbae538ed4dfa4a2251a121a52215a6248a21";

const CONNACK = [0x20, 0x03, 0x00, 0x00, 0x00];
/** Two reason codes, because the provider subscribes to two filters in one SUBSCRIBE. */
const SUBACK = [0x90, 0x05, 0x00, 0x01, 0x00, 0x00, 0x00];

interface Replay {
  readonly rows: readonly Record<string, unknown>[];
  readonly warnings: readonly string[];
  readonly filters: readonly string[];
}

/**
 * MQTT's own filter rule (3.1.1 section 4.7), because a fixture that is loose here measures
 * nothing about what the provider subscribed to.
 *
 * `+` matches exactly one level, `#` matches the rest and only as the last level, and neither
 * wildcard matches a topic beginning with `$` - which is why the certificate topic needs the
 * second filter the provider sends, and why a reader that only asked `spBv1.0/#` would see no
 * stored certificate at all.
 */
function matchesFilter(filter: string, topic: string): boolean {
  if (filter === topic) return true;
  const parts = filter.split("/");
  const levels = topic.split("/");
  if (topic.startsWith("$") && (parts[0] === "#" || parts[0] === "+")) return false;
  for (let at = 0; at < parts.length; at += 1) {
    const part = parts[at];
    if (part === "#") return at === parts.length - 1;
    if (at >= levels.length) return false;
    if (part !== "+" && part !== levels[at]) return false;
  }
  return parts.length === levels.length;
}

function readVarint(bytes: Buffer, from: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let at = from;
  for (;;) {
    const digit = bytes[at++] as number;
    value |= (digit & 0x7f) << shift;
    if ((digit & 0x80) === 0) return { value, next: at };
    shift += 7;
  }
}

/** The topic filters a SUBSCRIBE packet carries, which is how the Group field is measured. */
function filtersOf(packet: Buffer): string[] {
  const { next } = readVarint(packet, 1);
  let at = next + 2; // packet id
  const properties = readVarint(packet, at);
  at = properties.next + properties.value;
  const out: string[] = [];
  while (at < packet.length) {
    const length = ((packet[at] as number) << 8) | (packet[at + 1] as number);
    out.push(packet.subarray(at + 2, at + 2 + length).toString("utf8"));
    at += 2 + length + 1; // the filter and its options byte
  }
  return out;
}

/**
 * One read against a broker that answers with the recording.
 *
 * `group` is the connection's Database field, which the dialog draws as Group: empty means every
 * group, and the filters the provider sent are returned so the test can assert what that means.
 */
const answered = new Map<string, Promise<Replay>>();

/** One read per (statement, group), because every read waits out a real window on a real socket. */
function read(statement: string, group = ""): Promise<Replay> {
  const key = `${group}|${statement}`;
  const held = answered.get(key);
  if (held !== undefined) return held;
  const started = replay(statement, group);
  answered.set(key, started);
  return started;
}

async function replay(statement: string, group: string): Promise<Replay> {
  const seen: string[] = [];
  const server: Server = createServer((socket: Socket) => {
    socket.on("data", (chunk: Buffer) => {
      let buffered = chunk;
      while (buffered.length >= 2) {
        const { value: remaining, next } = readVarint(buffered, 1);
        const total = next + remaining;
        if (buffered.length < total) return;
        const packet = buffered.subarray(0, total);
        buffered = buffered.subarray(total);
        const kind = (packet[0] as number) >> 4;
        if (kind === 1) socket.write(Buffer.from(CONNACK));
        if (kind === 8) {
          const asked = filtersOf(packet);
          seen.push(...asked);
          socket.write(Buffer.from(SUBACK));
          // ONLY WHAT WAS SUBSCRIBED TO. Writing every captured packet to every SUBSCRIBE would
          // make a wrong subscription indistinguishable from a right one: every value assertion
          // below would pass while the provider asked the broker for the wrong filter. A broker
          // that answers what it was not asked is not a strict fixture, it is a generous one.
          for (const one of CAPTURE.packets) {
            if (asked.some((filter) => matchesFilter(filter, one.topic))) socket.write(Buffer.from(one.hex, "hex"));
          }
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const provider = await createDatabaseProvider({
    id: "sparkplug-integration",
    name: "fixture",
    type: "sparkplug",
    host: "127.0.0.1",
    port,
    database: group,
  } as DatabaseConnection);
  try {
    await provider.connect();
    const result: QueryResult = await provider.query(statement);
    return {
      rows: (result.rows ?? []) as readonly Record<string, unknown>[],
      warnings: (result.warnings ?? []).map((one) => (typeof one === "string" ? one : (one.message ?? ""))),
      filters: seen,
    };
  } finally {
    await provider.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const valueOf = (rows: Replay["rows"], metric: string, device: string | null = null): unknown =>
  rows.find((row) => row.metric === metric && (row.device ?? null) === device)?.value;

describe("the recording this file replays", () => {
  test("the compose block, the capture and this file all name one broker digest", () => {
    // Three places could drift apart: the fixture that runs, the recording that was taken from
    // it, and the constant this file holds. A capture taken from another build would replay
    // fine and prove nothing about the build the repository ships.
    const compose = readFileSync(path.join(ROOT, "docker/sparkplug/compose-service.yml"), "utf8");
    const pinned = /image: (eclipse-mosquitto:[\d.]+@sha256:[0-9a-f]{64})/.exec(compose)?.[1];
    expect(pinned).toBe(BROKER_IMAGE);
    expect(CAPTURE.broker).toBe(BROKER_IMAGE);
  });

  test("it came from the broker digest the fixture pins, and it is not empty", () => {
    // A capture that held nothing would make every assertion below pass on no evidence at all,
    // which is the one failure a replay suite cannot see from the inside.
    expect(CAPTURE.broker).toBe(BROKER_IMAGE);
    expect(CAPTURE.publisher).toBe("docker/sparkplug/publisher.py");
    expect(CAPTURE.packets.length).toBeGreaterThan(0);
  });

  test("every edge node the fixture is built around is in it", () => {
    // Each of these answers a different question, and a capture missing one would silently drop
    // the question with it. docker/sparkplug/README.md says what each is for.
    for (const topic of [
      "spBv1.0/SekoyaPlant/NBIRTH/Line1",
      "spBv1.0/SekoyaPlant/DBIRTH/Line1/Press01",
      "spBv1.0/SekoyaPlant/NDATA/Line1",
      "spBv1.0/SekoyaPlant/DDATA/Line1/Press01",
      "spBv1.0/SekoyaPlant/NDATA/Line2",
      "$sparkplug/certificates/spBv1.0/SekoyaPlant/NBIRTH/Line3",
      "spBv1.0/SekoyaPlant/NBIRTH/Line4",
      "spBv1.0/AnkaraPlant/NBIRTH/Mixer1",
    ]) {
      expect(CAPTURE.topics, topic).toContain(topic);
    }
  });
});

describe("a read of the whole plant", () => {
  test("the values the publisher wrote onto the wire are the values the rows carry", async () => {
    const { rows } = await read('{"seconds":1}');
    expect(rows.length).toBeGreaterThan(0);
    expect(valueOf(rows, "Temperature")).toBe("42.5");
    expect(valueOf(rows, "CycleCount")).toBe("1234567890123");
    expect(valueOf(rows, "MotorRunning")).toBe("true");
    expect(valueOf(rows, "BatchName")).toBe("BATCH-7781");
    // The device's own four, which only a DBIRTH and a DDATA can produce.
    expect(valueOf(rows, "PressForce", "Press01")).toBe("118.25");
    expect(valueOf(rows, "StrokeCount", "Press01")).toBe("98765");
    expect(valueOf(rows, "GripperClosed", "Press01")).toBe("false");
    expect(valueOf(rows, "RecipeName", "Press01")).toBe("RCP-ALPHA");
  });

  test("the data messages carry aliases only, so every name above came from a certificate", async () => {
    // The point of the previous test, stated as the fact that makes it load-bearing: the values
    // arrive with no names at all, and the names come from the births (6.4.6).
    const { rows } = await read('{"seconds":1}');
    const temperature = rows.find((row) => row.metric === "Temperature" && row.device === null);
    expect(temperature?.alias).toBe("1");
    expect(temperature?.definedBy).toBe("live");
  });

  test("the three edge nodes with no device and the one device are all seen", async () => {
    const { rows, warnings } = await read('{"seconds":1}');
    expect([...new Set(rows.map((row) => `${row.group}/${row.edgeNode}`))].sort()).toEqual([
      "AnkaraPlant/Mixer1",
      "SekoyaPlant/Line1",
      "SekoyaPlant/Line2",
      "SekoyaPlant/Line3",
      "SekoyaPlant/Line4",
    ]);
    expect(warnings.join(" ")).toContain("5 edge nodes and 1 devices");
  });
});

describe("the three edge nodes that are not an ordinary one", () => {
  test("a node that published only a BIRTH still shows its values (4.1.1)", async () => {
    /*
     * THIS TEST WAS RED THIS MORNING. `definitionsOf` kept the name, the alias and the datatype
     * of every birth metric and dropped the value, so Line4 - which publishes one NBIRTH and no
     * data at all - rendered as two rows with a datatype and an empty value, although the bytes
     * in this very capture carry 99.9 and "NIGHT-SHIFT". Reverting that fix turns this red again.
     */
    const { rows } = await read('{"group":"SekoyaPlant","edgeNode":"Line4","seconds":1}');
    expect(valueOf(rows, "Temperature")).toBe("99.9");
    expect(valueOf(rows, "ShiftName")).toBe("NIGHT-SHIFT");
    expect(rows.find((row) => row.metric === "Temperature")?.birthTime).toBe(true);
  });

  test("a node that published NO birth is reported as unnameable rather than left out", async () => {
    const { rows, warnings } = await read('{"group":"SekoyaPlant","edgeNode":"Line2","seconds":1}');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.metric).toBeNull();
      expect(row.datatype).toBeNull();
      expect(row.alias).toBe("7");
      expect(String(row.note)).toContain("no birth certificate to name it");
    }
    expect(warnings.join(" ")).toContain("values arrived under an alias no certificate in hand defines");
  });

  test("a STORED certificate names its metric and says its value may be stale (10.1.4)", async () => {
    const { rows } = await read('{"group":"SekoyaPlant","edgeNode":"Line3","seconds":1}');
    const humidity = rows.find((row) => row.metric === "Humidity");
    expect(humidity?.value).toBe("61");
    expect(humidity?.definedBy).toBe("stored");
    expect(String(humidity?.note)).toContain("cannot be expected to be the current ones");
  });
});

describe("the Group field, measured by what the provider subscribes to", () => {
  test("empty reads every group, and the filters say so", async () => {
    const { rows, filters } = await read('{"seconds":1}');
    // MEASURED, and not what this test first asserted: the provider subscribes TWICE, once while
    // connecting and once for the query, so the filters arrive in two identical SUBSCRIBEs. The
    // claim is about what it asks for, so the set is what matters.
    expect([...new Set(filters)]).toEqual(["spBv1.0/#", "$sparkplug/certificates/spBv1.0/#"]);
    expect(filters).toHaveLength(4);
    expect([...new Set(rows.map((row) => row.group))].sort()).toEqual(["AnkaraPlant", "SekoyaPlant"]);
  });

  test("a named group narrows the subscription itself, not only the rows", async () => {
    // The narrowing is sent to the broker, which is what makes the empty field a promise rather
    // than a filter applied after everything arrived.
    const { filters } = await read('{"seconds":1}', "SekoyaPlant");
    // The third filter is `spBv1.0/STATE/#`, and it is the one a group name must NOT narrow: a
    // host application's state is published outside every group, so narrowing it would hide the
    // one topic that says whether a host is online. The empty-group case needs no third filter
    // because `spBv1.0/#` already covers it.
    expect([...new Set(filters)]).toEqual([
      "spBv1.0/SekoyaPlant/#",
      "$sparkplug/certificates/spBv1.0/SekoyaPlant/#",
      "spBv1.0/STATE/#",
    ]);
  });

  test("a group the broker has nothing under answers no rows, and the filters say why", async () => {
    /*
     * THE CASE THAT MAKES EVERY VALUE ASSERTION ABOVE LOAD-BEARING. The replay used to write all
     * twenty-five captured packets to every SUBSCRIBE, so a provider that asked for the wrong
     * filter would still have been handed the whole plant and every value above would still have
     * passed. The fixture now answers only what it was asked, and this is the control: a group no
     * packet is published under answers nothing, and the filters the provider sent name that
     * group rather than the plant.
     */
    const { rows, filters } = await read('{"seconds":1}', "NoSuchPlant");
    expect(rows).toEqual([]);
    expect([...new Set(filters)]).toEqual([
      "spBv1.0/NoSuchPlant/#",
      "$sparkplug/certificates/spBv1.0/NoSuchPlant/#",
      "spBv1.0/STATE/#",
    ]);
  });

  test("a request that names the second group answers from it alone", async () => {
    const { rows } = await read('{"group":"AnkaraPlant","seconds":1}');
    expect(rows.length).toBeGreaterThan(0);
    expect([...new Set(rows.map((row) => row.group))]).toEqual(["AnkaraPlant"]);
    expect(valueOf(rows, "MixerSpeed")).toBe("1450");
  });
});
