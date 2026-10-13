/**
 * Provider tests. The device layer is faked, so every rule here is the class's own: which surface
 * answers, which refuses with a sentence, and which is empty because the engine truly has none.
 */
import { test } from "bun:test";
import { expectBe, expectEqual, expectMatch, expectRejects, expectThrows } from "./helpers";
import { NetconfProvider, parseReadRequest, type DeviceReader } from "@/lib/db/providers/network/netconf/provider";
import { RefusedError } from "@/lib/db/providers/network/netconf/provider-types";
import { NetconfProvider as RealNetconfProvider } from "@/lib/db/providers/network/netconf/index";
import type { NetconfSession } from "@/lib/db/providers/network/netconf/session";

const facts = {
  datastores: ["running", "candidate", "startup", "operational"],
  modules: ["ietf-interfaces", "ietf-system"],
  nmda: true,
  capabilities: [
    "urn:ietf:params:netconf:capability:xpath:1.0",
    "urn:ietf:params:netconf:capability:candidate:1.0",
    "urn:ietf:params:xml:ns:yang:ietf-netconf-monitoring",
    // A module URI, which a real hello carries 14 of. Without one here the assertion that the
    // health panel does not repeat the module list could not fail, whatever the filter did.
    "urn:ietf:params:xml:ns:yang:ietf-interfaces?module=ietf-interfaces&revision=2018-02-20",
  ],
  sessionId: "7",
};

function fakeReader(over: Partial<DeviceReader> = {}): DeviceReader {
  return {
    facts,
    topLevelNodes: async () => [{ module: "ietf-interfaces", name: "interfaces", isList: false }],
    children: async () => [
      { name: "ge-0%2F0%2F2", kind: "key" as const },
      { name: "ge-0%2F0%2F1", kind: "key" as const },
      { name: "ge-0%2F0%2F1", kind: "key" as const },
    ],
    rows: async () => ({ columns: ["name"], rows: [{ name: "ge-0/0/0" }], rowCount: 1 }),
    moduleText: async () => "module ietf-interfaces { }",
    ...over,
  };
}

const fakeSession = { close: async () => {} } as unknown as NetconfSession;

function provider(reader: DeviceReader = fakeReader()): NetconfProvider {
  const p = new NetconfProvider(fakeSession, reader);
  return p;
}

test("the container levels are the datastore and then the module, and a third is refused", async () => {
  const p = provider();
  await p.connect();
  expectEqual(
    (await p.listContainers()).map((c) => c.name),
    facts.datastores,
  );
  expectEqual(
    (await p.listContainers(["running"])).map((c) => c.name),
    facts.modules,
  );
  await expectRejects(p.listContainers(["running", "ietf-interfaces", "extra"]), RefusedError);
});

test("the key kind is not counted and not listed here, because the Keys panel enumerates it", async () => {
  const p = provider();
  await p.connect();
  const counts = await p.countObjects(["running", "ietf-interfaces"]);
  expectEqual(Object.keys(counts), ["node"]);
  await expectRejects(p.listObjects(["running", "ietf-interfaces"], "key"), /Browse Keys/);
});

test("a refused count is a sentence, not a zero", async () => {
  const p = provider(
    fakeReader({
      topLevelNodes: async () => {
        throw new Error("access-denied on this module");
      },
    }),
  );
  await p.connect();
  const counts = await p.countObjects(["running", "ietf-interfaces"]);
  expectEqual(counts["node"], { unavailable: "access-denied on this module" });
});

test("the surfaces this engine cannot answer refuse with a sentence rather than an empty list", async () => {
  const p = provider();
  await p.connect();
  await expectRejects(p.getPerformanceMetrics(), RefusedError);
  await expectRejects(p.getSlowQueries(), RefusedError);
  await expectRejects(p.getActiveSessions(), /other operators' addresses/);
  await expectRejects(p.getTableStats(), RefusedError);
  await expectRejects(p.getIndexStats(), RefusedError);
  await expectRejects(p.getStorageStats(), RefusedError);
  await expectRejects(p.runMaintenance(), /five read operations/);
});

test("the overview is empty where the engine truly has none, and says why", async () => {
  const p = provider();
  await p.connect();
  const overview = await p.getOverview();
  expectBe(overview.tableCount, 0);
  expectMatch(overview.details?.["shape"] ?? "", /YANG tree/);
});

test("health reports the capabilities that change a read and not the module list", async () => {
  const p = provider();
  await p.connect();
  const health = await p.getHealth();
  expectBe(health.details["session-id"], "7");
  expectBe(health.details["modules"], "2");
  expectMatch(health.details["reads"] ?? "", /xpath/);
  expectBe((health.details["reads"] ?? "").includes("ietf-interfaces"), false);
});

test("a key page removes repeats, sorts, and carries a start-after cursor", async () => {
  const p = provider();
  await p.connect();
  const page = await p.scanKeysPage("running", [{ module: "ietf-interfaces", name: "interfaces" }], null, 10);
  expectEqual(page.keys, ["ietf-interfaces:interfaces/ge-0%2F0%2F1", "ietf-interfaces:interfaces/ge-0%2F0%2F2"]);
  expectBe(page.cursor, "ge-0%2F0%2F2");
});

test("a describe never carries a value, because a read only account still reads secrets", async () => {
  const p = provider();
  await p.connect();
  const detail = await p.describeObject(["running", "ietf-system", "authentication"], "node");
  expectBe(detail.details["value"], "");
});

test("a read request with no datastore or no path is refused, never defaulted", () => {
  expectThrows(() => parseReadRequest("not json"), RefusedError);
  expectThrows(() => parseReadRequest("[]"), RefusedError);
  expectThrows(() => parseReadRequest('{"path":"a"}'), /names no datastore/);
  expectThrows(() => parseReadRequest('{"datastore":"running"}'), /names no path/);
  expectThrows(() => parseReadRequest('{"datastore":"running","path":"a","limit":0}'), /whole number/);
  const request = parseReadRequest(
    '{"datastore":"operational","path":"ietf-interfaces:interfaces/interface=ge-0%2F0%2F0"}',
  );
  expectBe(request.datastore, "operational");
  expectBe(request.limit, 1000);
  expectEqual(request.path[1], { name: "interface", keys: ["ge-0/0/0"] });
});

test("nothing answers before connect", async () => {
  const p = provider();
  await expectRejects(p.listContainers(), /not open/);
});

/**
 * The cost of shipping the class before the registration, held by a test rather than by a comment.
 *
 * `resolveTabType` gives every provider whose `queryLanguage` is `"json"` and which declares no
 * dialect of its own MongoDB's tab type, so until the registration lands this provider's console
 * reads as MongoDB's. That is a known, stated cost. What must not happen is a dialect appearing
 * here quietly before the registration is ready, because the dialect name has to be added to three
 * registries in the same change or the build breaks. So the absence is asserted: the day it
 * changes, it changes on purpose.
 */
test("no query dialect is declared yet, and the cost of that is stated rather than hidden", () => {
  const capabilities = new RealNetconfProvider({ type: "mongodb", name: "n", host: "h" } as never).getCapabilities();
  expectBe(capabilities.queryDialect, undefined);
  expectBe(capabilities.queryLanguage, "json");
  expectBe(capabilities.enforcesReadOnly, true);
  expectBe(capabilities.supportsMaintenance, false);
});

test("the container levels are declared as the datastore and then the module", () => {
  const capabilities = new RealNetconfProvider({ type: "mongodb", name: "n", host: "h" } as never).getCapabilities();
  expectEqual(
    capabilities.containerLevels?.map((level) => level.label),
    ["Datastore", "Module"],
  );
});
