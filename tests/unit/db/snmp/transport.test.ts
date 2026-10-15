/**
 * The socket the client is given, and the two things it refuses (SN-S4, SN-S1).
 *
 * The guard lives in the `dgramModule` the client is handed, not in a patch on a socket's own
 * `send`. Measured on 13 October 2026 under Node 24.14.0 and Bun 1.4.2: a datagram sent before
 * a socket's bind completes is queued and flushed by re-entering the same public `send` with
 * the scatter and gather form, so a patch sits inside that path and sees a shape set that
 * depends on a race, while this facade sits above it. The facade still accepts both shapes and
 * joins a payload list before reading it, because the cost is small and the failure it prevents
 * is bytes reaching the wire unread.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import dgram from "node:dgram";
import { createGuardedSocketFactory, EgressRefusal } from "@/lib/db/providers/network/snmp/transport";
import { ValveRefusal } from "@/lib/db/providers/network/snmp/valve";

const PORT = 21245;
const GET = Buffer.from([
  0x30, 0x0e, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa0, 0x01, 0x00,
]);
const SET = Buffer.from([
  0x30, 0x0e, 0x02, 0x01, 0x01, 0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, 0xa3, 0x01, 0x00,
]);

let listener: dgram.Socket;
let socket: ReturnType<ReturnType<typeof createGuardedSocketFactory>["dgramModule"]["createSocket"]>;

beforeAll(async () => {
  listener = dgram.createSocket("udp4");
  await new Promise<void>((resolve) => listener.bind(PORT, "127.0.0.1", () => resolve()));
  const factory = createGuardedSocketFactory({
    target: { address: "127.0.0.1", port: PORT },
    createRawSocket: () => dgram.createSocket("udp4"),
  });
  socket = factory.dgramModule.createSocket("udp4");
  await factory.start();
});

afterAll(() => {
  socket.close();
  listener.close();
});

const send = (run: (callback: (error?: Error) => void) => void): Promise<string> =>
  new Promise((resolve) => {
    try {
      run((error) => resolve(error ? error.constructor.name : "sent"));
    } catch (error) {
      resolve(`threw ${(error as Error).constructor.name}`);
    }
  });

describe("the guard refuses a target that is not this connection's agent", () => {
  test("in the six argument shape", async () => {
    expect(await send((cb) => socket.send(GET, 0, GET.length, 9999, "203.0.113.254", cb))).toBe(EgressRefusal.name);
  });
  test("in the four argument shape, where the target sits in different positions", async () => {
    expect(await send((cb) => socket.send([GET], 9999, "203.0.113.254", cb))).toBe(EgressRefusal.name);
  });
});

describe("the valve runs on both shapes, not only the one the client uses", () => {
  test("a write PDU in the six argument shape", async () => {
    expect(await send((cb) => socket.send(SET, 0, SET.length, PORT, "127.0.0.1", cb))).toBe(ValveRefusal.name);
  });
  test("a write PDU hidden in a payload list", async () => {
    expect(await send((cb) => socket.send([SET], PORT, "127.0.0.1", cb))).toBe(ValveRefusal.name);
  });
});

describe("a read to the right target goes out", () => {
  test("the six argument shape the client actually uses", async () => {
    expect(await send((cb) => socket.send(GET, 0, GET.length, PORT, "127.0.0.1", cb))).toBe("sent");
  });
});
