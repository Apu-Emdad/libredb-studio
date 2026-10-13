/**
 * The provider class. The device layer is injected, so every rule here is the class's own: which
 * surface answers, which refuses with a sentence, and which is empty because the engine truly has
 * none.
 *
 * These ran against a stand-in class with local type aliases until the real one landed. A mutation
 * run showed what that cost: two rules of the real class had no test at all, because the tests were
 * pointed at the stand-in. The stand-in is gone and these point at the class the repository loads.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectRejects, expectTruthy } from "./helpers";
import { NetconfProvider, parseReadRequest, type DeviceReader } from "@/lib/db/providers/network/netconf/index";
import type { DatabaseConnection } from "@/lib/db/types";
import { QueryError } from "@/lib/db/errors";
import { encodeSegment } from "@/lib/db/providers/network/netconf/keypath";
import { buildRpc } from "@/lib/db/providers/network/netconf/requests";

const facts = {
  datastores: ["running", "candidate", "startup", "operational"],
  modules: ["ietf-interfaces", "ietf-system"],
  nmda: true,
  capabilities: [
    "urn:ietf:params:netconf:capability:xpath:1.0",
    "urn:ietf:params:netconf:capability:candidate:1.0",
    "urn:ietf:params:xml:ns:yang:ietf-netconf-monitoring",
    // A module URI, which a real hello carries 14 of. Without one here the assertion that no panel
    // repeats the module list could not fail, whatever the filter did.
    "urn:ietf:params:xml:ns:yang:ietf-interfaces?module=ietf-interfaces&revision=2018-02-20",
  ],
  sessionId: "7",
};

function reader(over: Partial<DeviceReader> = {}): DeviceReader {
  return {
    facts,
    topLevelNodes: async () => [{ module: "ietf-interfaces", name: "interfaces", isList: false }],
    children: async () => [
      { name: "ge-0%2F0%2F2", kind: "key" as const },
      { name: "ge-0%2F0%2F1", kind: "key" as const },
      { name: "ge-0%2F0%2F1", kind: "key" as const },
    ],
    rows: async () => ({ columns: ["name"], rows: [{ name: "ge-0/0/0" }], rowCount: 1 }) as never,
    moduleText: async () => "module ietf-interfaces { }",
    close: async () => {},
    ...over,
  };
}

const connection = { type: "mongodb", name: "n", host: "h" } as unknown as DatabaseConnection;

async function open(device: DeviceReader = reader()): Promise<NetconfProvider> {
  const provider = new NetconfProvider(connection, {}, async () => device);
  await provider.connect();
  return provider;
}

test("no query dialect is declared yet, and the cost of that is stated rather than hidden", () => {
  const capabilities = new NetconfProvider(connection).getCapabilities();
  expectBe(capabilities.queryDialect, undefined);
  expectBe(capabilities.queryLanguage, "json");
  expectBe(capabilities.enforcesReadOnly, true);
  expectBe(capabilities.supportsMaintenance, false);
});

test("the container levels are declared as the datastore and then the module", () => {
  const capabilities = new NetconfProvider(connection).getCapabilities();
  expectEqual(
    capabilities.containerLevels?.map((level) => level.label),
    ["Datastore", "Module"],
  );
});

test("the container levels are answered as the datastore and then the module, and a third is refused", async () => {
  const provider = await open();
  expectEqual(
    (await provider.listContainers()).map((c) => c.name),
    facts.datastores,
  );
  expectEqual(
    (await provider.listContainers(["running"])).map((c) => c.name),
    facts.modules,
  );
  await expectRejects(provider.listContainers(["running", "ietf-interfaces", "extra"]), /datastore and then a module/);
});

test("a container carries its path and its level, which the tree addresses it by", async () => {
  const provider = await open();
  const modules = await provider.listContainers(["running"]);
  expectEqual(modules[0]?.path, ["running", "ietf-interfaces"]);
  expectBe(modules[0]?.level, 1);
});

test("the key kind is not counted and not listed here, because the Keys panel enumerates it", async () => {
  const provider = await open();
  expectEqual(Object.keys(await provider.countObjects(["running", "ietf-interfaces"])), ["node"]);
  await expectRejects(provider.listObjects(["running", "ietf-interfaces"], "key"), /Browse Keys/);
});

test("a refused count is a sentence, not a zero", async () => {
  const provider = await open(
    reader({
      topLevelNodes: async () => {
        throw new Error("access-denied on this module");
      },
    }),
  );
  expectEqual(await provider.countObjects(["running", "ietf-interfaces"]), {
    node: { unavailable: "access-denied on this module" },
  });
});

test("a write typed into the console is answered with what this provider is", async () => {
  const provider = await open();
  await expectRejects(provider.query("edit-config running"), /reads a device and does not write/);
  await expectRejects(provider.query("lock"), /reads a device and does not write/);
});

/**
 * The write check reads words, so it has to stand down for a request that is plainly a read. A
 * device's own data holds words like "delete" and "update", and refusing a valid read because a
 * note mentions one would be worse than the thing it guards against.
 */
test("a valid read request is not refused merely because it carries a word like delete", async () => {
  const provider = await open();
  const result = await provider.query('{"datastore":"running","path":"x","note":"please delete it"}');
  expectBe(result.rowCount, 1);
});

test("a read request is parsed after the write check, so a valid read still runs", async () => {
  const provider = await open();
  const result = await provider.query('{"datastore":"running","path":"ietf-interfaces:interfaces"}');
  expectBe(result.rowCount, 1);
});

test("the surfaces this engine cannot answer refuse with a sentence rather than an empty list", async () => {
  const provider = await open();
  await expectRejects(provider.getPerformanceMetrics(), /no query statistics/);
  await expectRejects(provider.getSlowQueries(), /no query statistics/);
  await expectRejects(provider.getActiveSessions(), /other operators' addresses/);
  await expectRejects(provider.getTableStats(), /no tables and no indexes/);
  await expectRejects(provider.getIndexStats(), /no tables and no indexes/);
  await expectRejects(provider.getStorageStats(), /no storage figures/);
  await expectRejects(provider.runMaintenance(), /five read operations/);
});

test("the overview says what the engine is, and counts no tables because it has none", async () => {
  const provider = await open();
  const overview = await provider.getOverview();
  expectBe(overview.tableCount, 0);
  expectBe(overview.indexCount, 0);
  expectTruthy(overview.version?.includes("NMDA"));
});

test("health omits what it cannot measure instead of sending a fabricated zero", async () => {
  const provider = await open();
  const health = await provider.getHealth();
  expectBe(health.cacheHitRatio, "unknown");
  expectBe(health.activeConnections, undefined);
  // The module list is sensitive (RFC 8525 section 6), so no panel repeats it.
  expectBe(JSON.stringify(health).includes("ietf-interfaces"), false);
});

test("a key page removes repeats, sorts, and carries a start-after cursor", async () => {
  const provider = await open();
  const page = await provider.scanKeysPage("running", [{ module: "ietf-interfaces", name: "interfaces" }], null, 10);
  expectEqual(page.keys, ["ietf-interfaces:interfaces/ge-0%2F0%2F1", "ietf-interfaces:interfaces/ge-0%2F0%2F2"]);
  expectBe(page.cursor, "ge-0%2F0%2F2");
});

test("a description carries no leaf value, because a read only account still reads secrets", async () => {
  const provider = await open();
  const detail = await provider.describeObject(["running", "ietf-system", "authentication"], "node");
  expectEqual(detail.columns, []);
  expectEqual(detail.path, ["running", "ietf-system", "authentication"]);
});

test("describeObjects answers a batch and says when it cut the listing", async () => {
  const provider = await open();
  const all = await provider.describeObjects(["running", "ietf-interfaces"], "node");
  expectBe(all.details.length, 1);
  expectBe(all.truncated, undefined);
  const cut = await provider.describeObjects(["running", "ietf-interfaces"], "node", 0);
  expectBe(cut.details.length, 0);
  expectTruthy(cut.truncated !== undefined);
});

test("a read request with no datastore or no path is refused, never defaulted", () => {
  expectRejectsSync(() => parseReadRequest("not json"), /is JSON/);
  expectRejectsSync(() => parseReadRequest("[]"), /is JSON/);
  expectRejectsSync(() => parseReadRequest('{"path":"a"}'), /names no datastore/);
  expectRejectsSync(() => parseReadRequest('{"datastore":"running"}'), /names no path/);
  expectRejectsSync(() => parseReadRequest('{"datastore":"running","path":"a","limit":0}'), /whole number/);
  const request = parseReadRequest(
    '{"datastore":"operational","path":"ietf-interfaces:interfaces/interface=ge-0%2F0%2F0"}',
  );
  expectBe(request.datastore, "operational");
  expectBe(request.limit, 1000);
  expectEqual(request.path[1], { name: "interface", keys: ["ge-0/0/0"] });
});

function expectRejectsSync(fn: () => unknown, pattern: RegExp): void {
  let message = "";
  try {
    fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expectTruthy(pattern.test(message));
}

test("nothing answers before connect", async () => {
  const provider = new NetconfProvider(connection, {}, async () => reader());
  await expectRejects(provider.listContainers(), /not open/);
});

/**
 * Every refusal a user can reach is a `QueryError`, and this test asserts the TYPE rather than the
 * message, because a message can be reworded and a type cannot.
 *
 * MEASURED on `origin/main`: the surfaces that turn a failure into a stated refusal check
 * `error instanceof QueryError` (`providers/platform/kubernetes/objects.ts:348`,
 * `errors.ts:244`). A refusal thrown as a plain `Error` is not converted: it passes as an
 * unexpected failure and the sentence it carries never reaches the user. The first version of this
 * provider had three such refusals, in `keypath.ts`, `yangkeys.ts` and `requests.ts`.
 */
test("every refusal a user can reach is a QueryError, measured by type and not by message", async () => {
  const provider = await open();
  const reached: unknown[] = [];
  const collect = async (run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      reached.push(error);
    }
  };
  await collect(() => provider.query("edit-config running"));
  await collect(() => provider.query("not json"));
  await collect(() => provider.query('{"datastore":"running"}'));
  await collect(() => provider.listContainers(["a", "b", "c"]));
  await collect(() => provider.listObjects(["running", "ietf-interfaces"], "key"));
  await collect(() => provider.getPerformanceMetrics());
  await collect(() => provider.getActiveSessions());
  await collect(() => provider.runMaintenance());
  expectBe(reached.length, 8);
  for (const error of reached) expectTruthy(error instanceof QueryError);
});

/**
 * The unknown-module refusal lives in the request builder rather than in the class, and a mutation
 * showed it had no test at all: turning it into a plain Error failed nothing. It is reachable
 * whenever a filter names a module the device's YANG library did not, which is the case the
 * sentence exists for, so a wrong namespace is not sent and answered with an empty document.
 */
test("a filter naming a module the library does not know is refused as a QueryError", () => {
  let caught: unknown;
  try {
    buildRpc({ operation: "get", filter: { nodes: [{ module: "no-such-module", name: "x" }] } }, 1);
  } catch (error) {
    caught = error;
  }
  expectTruthy(caught instanceof QueryError);
});

test("a key value that cannot be spelled as a path is refused as a QueryError too", () => {
  let caught: unknown;
  try {
    encodeSegment("\uD800");
  } catch (error) {
    caught = error;
  }
  expectTruthy(caught instanceof QueryError);
});
