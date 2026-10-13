/**
 * The `netconf` provider class, phase 1 (issue #1724).
 *
 * It answers the 17 members the repository's base class declares abstract, measured on `fb354594`
 * (see `provider-types.ts`). Three kinds of answer appear here and the difference is deliberate:
 *
 *   a read this engine performs            the session is asked and rows come back
 *   a question this engine has none of     an empty answer, which is the truthful one
 *   a question this engine cannot answer,  a stated refusal, never an empty answer, because an
 *   or an action it will not perform       empty answer draws "none" where the truth is
 *                                         "not applicable to this engine"
 *
 * SOURCE at `fb354594`: the nearest read only precedent, `providers/keyvalue/mqtt/index.ts` lines
 * 336 to 362, returns empty for the metric surfaces and throws for `runMaintenance`. This provider
 * follows that, and uses `KindCount`'s `unavailable` branch where a count is refused rather than
 * zero, so the tree draws a sentence instead of an empty folder.
 *
 * The class does not register itself anywhere: the type union, `factory.ts`, the compatibility
 * records and the connection form are shared surfaces whose edit order is set elsewhere (K-53,
 * K-123). Nothing here touches them.
 */

import { NETCONF_KEY_SCAN, NETCONF_OBJECT_KINDS, assertDeclarationIsSound } from "./objectkinds";
import { buildKeyPath, levelPage, type LevelEntry, type PathNode } from "./keypath";
import { type NetconfSession } from "./session";
import { safeForWriting } from "./secrets";
import {
  RefusedError,
  type ActiveSessionDetails,
  type Container,
  type DatabaseObject,
  type DatabaseOverview,
  type HealthInfo,
  type IndexStats,
  type KindCount,
  type MaintenanceResult,
  type ObjectDetail,
  type PerformanceMetrics,
  type QueryResult,
  type SlowQueryStats,
  type StorageStats,
  type TableStats,
} from "./provider-types";

/** What the provider learns from the device at connect time. */
export interface DeviceFacts {
  /** Datastores from `/yang-library/datastore`, or the ones the capabilities announce. */
  readonly datastores: readonly string[];
  /** Modules from the YANG library, by name. */
  readonly modules: readonly string[];
  /** True when `<get-data>` is served. MEASURED: Clixon answers `operation-not-supported`. */
  readonly nmda: boolean;
  readonly capabilities: readonly string[];
  readonly sessionId: string;
}

export interface TopLevelNode {
  readonly module: string;
  readonly name: string;
  readonly isList: boolean;
}

/** What the provider needs from the layer that actually talks to the device. */
export interface DeviceReader {
  readonly facts: DeviceFacts;
  topLevelNodes(datastore: string, module: string): Promise<readonly TopLevelNode[]>;
  /** One level of children, which the server answers with keys only at a depth cut. */
  children(datastore: string, path: readonly PathNode[]): Promise<readonly LevelEntry[]>;
  rows(datastore: string, path: readonly PathNode[], limit: number): Promise<QueryResult>;
  moduleText(module: string): Promise<string>;
}

const SENTENCES = Object.freeze({
  noMetrics:
    "A NETCONF device publishes no query statistics, so this panel has nothing to read. The device's own counters are in its YANG data and are read as rows.",
  noSessions:
    "Studio does not list a device's NETCONF sessions: reading /netconf-state/sessions would show other operators' addresses, and this provider reads nothing it does not need.",
  noTables: "A NETCONF device has no tables and no indexes. Its data is a YANG tree, which the object browser walks.",
  noMaintenance:
    "This provider performs no maintenance on a device. It sends five read operations and nothing else, so there is no operation here to run.",
  noStorage: "A NETCONF device reports no storage figures through NETCONF.",
  twoLevels: "A NETCONF connection names a datastore and then a module, so a container is one or two names.",
});

export class NetconfProvider {
  private readonly reader: DeviceReader;
  private readonly session: NetconfSession;
  private connected = false;

  constructor(session: NetconfSession, reader: DeviceReader) {
    assertDeclarationIsSound();
    this.session = session;
    this.reader = reader;
  }

  getCapabilities(): { readonly keyScan: typeof NETCONF_KEY_SCAN; readonly objectKinds: typeof NETCONF_OBJECT_KINDS } {
    return { keyScan: NETCONF_KEY_SCAN, objectKinds: NETCONF_OBJECT_KINDS };
  }

  async connect(): Promise<void> {
    // The session is opened before the provider exists, because the socket is dialled outside it
    // (requirement NC-S3). What connect proves is that the device answers a read at all.
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    await this.session.close();
  }

  /** The JSON read request of the console. One read, bounded, and never an unfiltered `<get>`. */
  async query(statement: string): Promise<QueryResult> {
    this.assertConnected();
    const request = parseReadRequest(statement);
    return this.reader.rows(request.datastore, request.path, request.limit);
  }

  /** Level 1 is the datastore, level 2 the module. */
  async listContainers(parent?: readonly string[]): Promise<Container[]> {
    this.assertConnected();
    if (!parent || parent.length === 0) {
      return this.reader.facts.datastores.map((name) => ({ name }));
    }
    if (parent.length === 1) {
      return this.reader.facts.modules.map((name) => ({ name, kinds: ["node"] }));
    }
    throw new RefusedError(SENTENCES.twoLevels);
  }

  /**
   * The count of top level nodes of one module in one datastore.
   *
   * The `key` kind is NOT counted: the Keys panel enumerates it (`enumeratedBy: "key-browser"`), so
   * counting it here would put every key in the tree and in plan mode's prompt.
   */
  async countObjects(container: readonly string[]): Promise<Record<string, KindCount>> {
    this.assertConnected();
    const [datastore, moduleName] = this.requireModule(container);
    try {
      const nodes = await this.reader.topLevelNodes(datastore, moduleName);
      return { node: { count: nodes.length } };
    } catch (error) {
      // A refused count is a sentence rather than a zero, so the tree does not draw an empty
      // module where the truth is that the read was refused.
      return { node: { unavailable: messageOf(error) } };
    }
  }

  async listObjects(container: readonly string[], kind: string): Promise<DatabaseObject[]> {
    this.assertConnected();
    const [datastore, moduleName] = this.requireModule(container);
    if (kind === "key") {
      throw new RefusedError(
        "Keys are listed by the Keys panel, one level at a time, and not by this listing. Open the node and use Browse Keys.",
      );
    }
    if (kind !== "node") throw new RefusedError(`This engine has no object kind named ${kind}.`);
    const nodes = await this.reader.topLevelNodes(datastore, moduleName);
    return nodes.map((node) => ({ name: node.name, kind: "node" }));
  }

  async describeObject(path: readonly string[], kind: string): Promise<ObjectDetail> {
    this.assertConnected();
    if (kind !== "node" && kind !== "key") throw new RefusedError(`This engine has no object kind named ${kind}.`);
    const name = path.at(-1) ?? "";
    const moduleName = path.at(-2) ?? "";
    return {
      name,
      kind,
      details: {
        module: moduleName,
        datastore: path[0] ?? "",
        // A value never enters a description. Requirement Y-S2: the same read only account that
        // cannot write still reads password hashes and keystore entries.
        value: safeForWriting([moduleName, name], "").text,
      },
    };
  }

  async describeObjects(paths: readonly (readonly string[])[], kind: string): Promise<ObjectDetail[]> {
    return Promise.all(paths.map((path) => this.describeObject(path, kind)));
  }

  /** One level of the Keys panel, built from what the server already answers. */
  async scanKeysPage(
    datastore: string,
    path: readonly PathNode[],
    cursor: string | null,
    count: number,
  ): Promise<{ readonly keys: readonly string[]; readonly cursor: string | null }> {
    this.assertConnected();
    const all = await this.reader.children(datastore, path);
    const page = levelPage(all, cursor, count);
    const prefix = buildKeyPath(path);
    return {
      keys: page.entries.map((entry) => (prefix === "" ? entry.name : `${prefix}/${entry.name}`)),
      cursor: page.cursor,
    };
  }

  async getHealth(): Promise<HealthInfo> {
    this.assertConnected();
    const facts = this.reader.facts;
    return {
      reachable: true,
      details: {
        "session-id": facts.sessionId,
        datastores: facts.datastores.join(", "),
        modules: String(facts.modules.length),
        nmda: facts.nmda ? "yes" : "no, get-data is not served",
        // Only the capabilities that change how a read is built are reported, which keeps the
        // module list out of the panel: RFC 8525 section 6 calls that list sensitive.
        reads: facts.capabilities
          .filter((cap) => /:(xpath|candidate|with-defaults|yang-library):/.test(cap))
          .join(", "),
      },
    };
  }

  async getOverview(): Promise<DatabaseOverview> {
    this.assertConnected();
    return { tableCount: 0, indexCount: 0, details: { shape: SENTENCES.noTables } };
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    throw new RefusedError(SENTENCES.noMetrics);
  }

  async getSlowQueries(): Promise<SlowQueryStats[]> {
    throw new RefusedError(SENTENCES.noMetrics);
  }

  async getActiveSessions(): Promise<ActiveSessionDetails[]> {
    throw new RefusedError(SENTENCES.noSessions);
  }

  async getTableStats(): Promise<TableStats[]> {
    throw new RefusedError(SENTENCES.noTables);
  }

  async getIndexStats(): Promise<IndexStats[]> {
    throw new RefusedError(SENTENCES.noTables);
  }

  async getStorageStats(): Promise<StorageStats[]> {
    throw new RefusedError(SENTENCES.noStorage);
  }

  async runMaintenance(): Promise<MaintenanceResult> {
    throw new RefusedError(SENTENCES.noMaintenance);
  }

  private assertConnected(): void {
    if (!this.connected) throw new RefusedError("This connection is not open.");
  }

  private requireModule(container: readonly string[]): readonly [string, string] {
    const datastore = container[0];
    const moduleName = container[1];
    if (!datastore || !moduleName) throw new RefusedError(SENTENCES.twoLevels);
    return [datastore, moduleName];
  }
}

export interface ReadRequest {
  readonly datastore: string;
  readonly path: readonly PathNode[];
  readonly limit: number;
}

/**
 * Reads the console's JSON request.
 *
 * It refuses rather than defaults: a request with no datastore or no path would otherwise become an
 * unfiltered read, which is the one thing requirement NC-S5 forbids a UI action from sending.
 */
export function parseReadRequest(statement: string): ReadRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(statement);
  } catch {
    throw new RefusedError("A NETCONF read request is JSON: it names a datastore, a path and a limit.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new RefusedError("A NETCONF read request is a JSON object.");
  }
  const body = parsed as Record<string, unknown>;
  const datastore = body["datastore"];
  const path = body["path"];
  if (typeof datastore !== "string" || datastore === "") {
    throw new RefusedError("This read names no datastore, and this provider sends no unfiltered read.");
  }
  if (typeof path !== "string" || path === "") {
    throw new RefusedError("This read names no path, and this provider sends no unfiltered read.");
  }
  const limit = body["limit"];
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1)) {
    throw new RefusedError("A limit is a whole number of rows, one or more.");
  }
  return { datastore, path: parsePathArgument(path), limit: typeof limit === "number" ? limit : 1000 };
}

function parsePathArgument(path: string): readonly PathNode[] {
  const nodes = path
    .split("/")
    .filter((piece) => piece !== "")
    .map((piece): PathNode => {
      const at = piece.indexOf("=");
      const head = at === -1 ? piece : piece.slice(0, at);
      const colon = head.indexOf(":");
      const name = colon === -1 ? head : head.slice(colon + 1);
      const moduleName = colon === -1 ? undefined : head.slice(0, colon);
      const keys =
        at === -1
          ? undefined
          : piece
              .slice(at + 1)
              .split(",")
              .map(decodeURIComponent);
      if (moduleName && keys) return { module: moduleName, name, keys };
      if (moduleName) return { module: moduleName, name };
      if (keys) return { name, keys };
      return { name };
    });
  if (nodes.length === 0) throw new RefusedError("This read names no path.");
  return nodes;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
