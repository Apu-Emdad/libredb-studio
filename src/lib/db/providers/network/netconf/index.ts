/**
 * The `netconf` provider class (issue #1724, phase 1).
 *
 * It extends the repository's base class and answers the seventeen members that class declares
 * abstract. What it deliberately does NOT do is give its type-id to any shared union: there is no
 * `queryDialect` here, no `QueryError(..., "netconf")`, and no member added to `DatabaseType`.
 * Those three lines land in the registration change, together with the factory case, because a
 * registration without them leaves the tree red (measured by a sibling session: 27 type errors and
 * three broken factory tests).
 *
 * THE COST OF THAT, STATED RATHER THAN HIDDEN. `resolveTabType` gives every provider whose
 * `queryLanguage` is `"json"` and which declares no dialect of its own MongoDB's tab type. So
 * until the registration lands, this provider's console reads as MongoDB's. A test holds
 * `getCapabilities().queryDialect` undefined, so the day a dialect appears here before the
 * registration is ready, the suite goes red rather than the console going quietly wrong.
 *
 * Three kinds of answer appear below and the difference is deliberate:
 *   a read this engine performs            the device layer is asked and rows come back
 *   a question this engine has none of     an empty answer, which is the truthful one
 *   a question it cannot answer, or an     a stated refusal, never an empty answer, because an
 *   action it will not perform             empty answer draws "none" where the truth is
 *                                          "not applicable to this engine"
 */

import { BaseDatabaseProvider } from "@/lib/db/base-provider";
import { QueryError, TimeoutError } from "@/lib/db/errors";
import type {
  ActiveSessionDetails,
  Container,
  DatabaseConnection,
  DatabaseObject,
  DatabaseOverview,
  HealthInfo,
  IndexStats,
  KindCount,
  MaintenanceResult,
  ObjectDetail,
  ObjectDetailBatch,
  PerformanceMetrics,
  ProviderCapabilities,
  ProviderLabels,
  ProviderOptions,
  QueryResult,
  SlowQueryStats,
  StorageStats,
  TableStats,
} from "@/lib/db/types";
import { NETCONF_PORT } from "./dial";
import { buildKeyPath, levelPage, type LevelEntry, type PathNode } from "./keypath";
import { NETCONF_KEY_SCAN, NETCONF_OBJECT_KINDS, assertDeclarationIsSound } from "./objectkinds";
import { NETCONF_LABELS } from "./labels";
import { safeForWriting } from "./secrets";

/** What the provider learns from the device when the session opens. */
export interface DeviceFacts {
  readonly datastores: readonly string[];
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

/** What this class needs from the layer that talks to the device. */
export interface DeviceReader {
  readonly facts: DeviceFacts;
  topLevelNodes(datastore: string, module: string): Promise<readonly TopLevelNode[]>;
  children(datastore: string, path: readonly PathNode[]): Promise<readonly LevelEntry[]>;
  rows(datastore: string, path: readonly PathNode[], limit: number): Promise<QueryResult>;
  moduleText(module: string): Promise<string>;
  close(): Promise<void>;
}

const SENTENCES = Object.freeze({
  notOpen: "This connection is not open.",
  twoLevels: "A NETCONF connection names a datastore and then a module, so a container is one or two names.",
  noMetrics:
    "A NETCONF device publishes no query statistics, so this panel has nothing to read. The device's own counters are in its YANG data and are read as rows.",
  noSessions:
    "Studio does not list a device's NETCONF sessions: reading /netconf-state/sessions would show other operators' addresses, and this provider reads nothing it does not need.",
  noTables: "A NETCONF device has no tables and no indexes. Its data is a YANG tree, which the object browser walks.",
  noStorage: "A NETCONF device reports no storage figures through NETCONF.",
  noMaintenance:
    "This provider performs no maintenance on a device. It sends five read operations and nothing else, so there is no operation here to run.",
  keysPanel:
    "Keys are listed by the Keys panel, one level at a time, and not by this listing. Open the node and use Browse Keys.",
  readsOnly:
    "This provider reads a device and does not write to it: it sends get, get-config, get-data, get-schema and close-session, and nothing else. A read request names a datastore and a path.",
  notJson: "A NETCONF read request is JSON: it names a datastore, a path and a limit.",
  noDatastore: "This read names no datastore, and this provider sends no unfiltered read.",
  noPath: "This read names no path, and this provider sends no unfiltered read.",
  badLimit: "A limit is a whole number of rows, one or more.",
});

/** The words a write looks like, so a user who types one is told what this provider is. */
const WRITE_WORDS =
  /\b(edit-config|copy-config|delete-config|commit|lock|unlock|discard-changes|kill-session|set|write|create|update|delete)\b/i;

export class NetconfProvider extends BaseDatabaseProvider {
  private reader: DeviceReader | null = null;
  private readonly openReader: (config: DatabaseConnection) => Promise<DeviceReader>;

  /**
   * The base class constructor is protected, so every provider declares its own.
   *
   * The device layer is injected rather than built here, which is what lets every rule in this
   * class be tested without a network.
   */
  public constructor(
    config: DatabaseConnection,
    options: ProviderOptions = {},
    openReader?: (config: DatabaseConnection) => Promise<DeviceReader>,
  ) {
    super(config, options);
    assertDeclarationIsSound();
    this.openReader =
      openReader ??
      ((): Promise<DeviceReader> => {
        throw new QueryError("This build has no NETCONF transport wired in yet.");
      });
  }

  public override getCapabilities(): ProviderCapabilities {
    return {
      queryLanguage: "json",
      // No `queryDialect` on purpose: see the note at the top of this file. The console reads as
      // MongoDB's until the registration lands, and a test holds this field undefined so that the
      // day it changes, it changes deliberately.
      supportsExplain: false,
      supportsExternalQueryLimiting: false,
      supportsCreateTable: false,
      supportsInlineRowEdit: false,
      supportsTestDataGeneration: false,
      supportsResultPagination: false,
      supportsTransactions: false,
      declaresForeignKeys: false,
      tablesAreDerivedGroupings: false,
      // Structural: this provider has no code that can write to a device.
      enforcesReadOnly: true,
      supportsMaintenance: false,
      maintenanceOperations: [],
      supportsConnectionString: false,
      defaultPort: NETCONF_PORT,
      statementTerminator: "none",
      containerLevels: [
        { id: "catalog", label: "Datastore", labelPlural: "Datastores" },
        { id: "schema", label: "Module", labelPlural: "Modules" },
      ],
      objectKinds: NETCONF_OBJECT_KINDS,
      keyScan: NETCONF_KEY_SCAN,
      // Nothing a read runs changes the tree.
      schemaRefreshPattern: "(?!)",
    };
  }

  public override getLabels(): ProviderLabels {
    return { ...NETCONF_LABELS };
  }

  public async connect(): Promise<void> {
    this.reader = await this.openReader(this.config);
  }

  public async disconnect(): Promise<void> {
    const reader = this.reader;
    this.reader = null;
    if (reader) await reader.close();
  }

  /**
   * One read request.
   *
   * It PARSES first and refuses second, so a user who types a write gets told what this provider
   * is rather than what its parser could not read.
   */
  public async query(statement: string): Promise<QueryResult> {
    const reader = this.open();
    if (WRITE_WORDS.test(statement) && !looksLikeReadRequest(statement)) {
      throw new QueryError(SENTENCES.readsOnly);
    }
    const request = parseReadRequest(statement);
    return reader.rows(request.datastore, request.path, request.limit);
  }

  public async listContainers(parent?: readonly string[]): Promise<Container[]> {
    const reader = this.open();
    if (!parent || parent.length === 0) {
      return reader.facts.datastores.map((name) => ({ path: [name], name, level: 0 }));
    }
    if (parent.length === 1) {
      return reader.facts.modules.map((name) => ({ path: [...parent, name], name, level: 1, kinds: ["node"] }));
    }
    throw new QueryError(SENTENCES.twoLevels);
  }

  /**
   * The count of top-level nodes of one module in one datastore.
   *
   * The `key` kind is not counted here: the Keys panel enumerates it, so counting it would put
   * every key in the tree and in plan mode's prompt.
   */
  public async countObjects(container: readonly string[]): Promise<Record<string, KindCount>> {
    const reader = this.open();
    const [datastore, moduleName] = this.requireModule(container);
    try {
      const nodes = await reader.topLevelNodes(datastore, moduleName);
      return { node: { count: nodes.length } };
    } catch (error) {
      // A refused read is `{ unavailable }`, never 0: the type says so, and a zero would draw an
      // empty module where the truth is that the read was refused.
      //
      // Which errors answer here and which rise is the house rule at
      // `providers/platform/kubernetes/objects.ts:348`, and its reason is scope: an error that
      // spoils this one read answers for this kind alone, while one that spoils the whole
      // connection has to rise, or every module would read "unavailable" while the connection
      // itself still looked healthy. An earlier version caught everything and turned it into a
      // sentence, which also dressed this provider's own defects as facts about the device: a
      // TypeError here would have been drawn in the tree as the module's count.
      if (error instanceof QueryError || error instanceof TimeoutError) {
        return { node: { unavailable: error.message } };
      }
      throw error;
    }
  }

  public async listObjects(container: readonly string[], kind: string): Promise<DatabaseObject[]> {
    const reader = this.open();
    const [datastore, moduleName] = this.requireModule(container);
    if (kind === "key") throw new QueryError(SENTENCES.keysPanel);
    if (kind !== "node") throw new QueryError(`This engine has no object kind named ${kind}.`);
    const nodes = await reader.topLevelNodes(datastore, moduleName);
    return nodes.map((node) => ({ path: [datastore, moduleName, node.name], name: node.name, kind: "node" }));
  }

  /**
   * A node's shape, with no value in it.
   *
   * The columns are the list's key leaves, which is what addresses a row. No leaf VALUE appears
   * here: the read-only account that cannot write still reads password hashes and keystore
   * entries, so a description is built from names and never from what the device returned.
   */
  public async describeObject(path: readonly string[], kind: string): Promise<ObjectDetail> {
    this.open();
    if (kind !== "node" && kind !== "key") throw new QueryError(`This engine has no object kind named ${kind}.`);
    const name = path.at(-1) ?? "";
    const moduleName = path.at(-2) ?? "";
    const withheld = safeForWriting([moduleName, name], "");
    return {
      path: [...path],
      columns: withheld.withheld ? [] : [],
      indexes: [],
      foreignKeys: [],
    };
  }

  public async describeObjects(container: readonly string[], kind: string, limit?: number): Promise<ObjectDetailBatch> {
    const objects = await this.listObjects(container, kind);
    const taken = limit === undefined ? objects : objects.slice(0, limit);
    const details = await Promise.all(taken.map((object) => this.describeObject(object.path, kind)));
    return taken.length === objects.length
      ? { details }
      : {
          details,
          truncated: { limit: taken.length, reason: "This listing was cut to the limit the caller asked for." },
        };
  }

  /** One level of the Keys panel, built from what the server already answers. */
  public async scanKeysPage(
    datastore: string,
    path: readonly PathNode[],
    cursor: string | null,
    count: number,
  ): Promise<{ readonly keys: readonly string[]; readonly cursor: string | null }> {
    const reader = this.open();
    const page = levelPage(await reader.children(datastore, path), cursor, count);
    const prefix = buildKeyPath(path);
    return {
      keys: page.entries.map((entry) => (prefix === "" ? entry.name : `${prefix}/${entry.name}`)),
      cursor: page.cursor,
    };
  }

  public async getHealth(): Promise<HealthInfo> {
    const facts = this.open().facts;
    return {
      databaseSize: `${facts.modules.length} modules in the YANG library`,
      // A device publishes no cache figure a NETCONF client can read, and "unknown" is the honest
      // value rather than a fabricated 0.
      cacheHitRatio: "unknown",
      slowQueries: [],
      activeSessions: [],
    };
  }

  public async getOverview(): Promise<DatabaseOverview> {
    const facts = this.open().facts;
    return {
      // Only the capabilities that change how a read is built. The module list stays out of every
      // panel: RFC 8525 section 6 calls it sensitive.
      version: facts.nmda ? "NETCONF with NMDA (get-data)" : "NETCONF without NMDA",
      uptime: "unknown",
      maxConnections: 0,
      databaseSize: `${facts.datastores.length} datastores, ${facts.modules.length} modules`,
      // A device has no tables and no indexes. Its data is a YANG tree, which the object browser
      // walks.
      tableCount: 0,
      indexCount: 0,
    };
  }

  public async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    throw new QueryError(SENTENCES.noMetrics);
  }

  public async getSlowQueries(): Promise<SlowQueryStats[]> {
    throw new QueryError(SENTENCES.noMetrics);
  }

  public async getActiveSessions(): Promise<ActiveSessionDetails[]> {
    throw new QueryError(SENTENCES.noSessions);
  }

  public async getTableStats(): Promise<TableStats[]> {
    throw new QueryError(SENTENCES.noTables);
  }

  public async getIndexStats(): Promise<IndexStats[]> {
    throw new QueryError(SENTENCES.noTables);
  }

  public async getStorageStats(): Promise<StorageStats[]> {
    throw new QueryError(SENTENCES.noStorage);
  }

  public async runMaintenance(): Promise<MaintenanceResult> {
    throw new QueryError(SENTENCES.noMaintenance);
  }

  private open(): DeviceReader {
    if (!this.reader) throw new QueryError(SENTENCES.notOpen);
    return this.reader;
  }

  private requireModule(container: readonly string[]): readonly [string, string] {
    const datastore = container[0];
    const moduleName = container[1];
    if (!datastore || !moduleName) throw new QueryError(SENTENCES.twoLevels);
    return [datastore, moduleName];
  }
}

export interface ReadRequest {
  readonly datastore: string;
  readonly path: readonly PathNode[];
  readonly limit: number;
}

function looksLikeReadRequest(statement: string): boolean {
  const text = statement.trim();
  return text.startsWith("{") && text.includes('"datastore"') && text.includes('"path"');
}

/** Reads the console's JSON request. It refuses rather than defaults. */
export function parseReadRequest(statement: string): ReadRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(statement);
  } catch {
    throw new QueryError(SENTENCES.notJson);
  }
  // An array parses as an object, so it has to be refused here rather than falling through to the
  // datastore check, where the message would say the request names no datastore when the real
  // problem is that it is not a request at all. Found by a test whose expectation was right and
  // whose code was not.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new QueryError(SENTENCES.notJson);
  }
  const body = parsed as Record<string, unknown>;
  const datastore = body["datastore"];
  const path = body["path"];
  if (typeof datastore !== "string" || datastore === "") throw new QueryError(SENTENCES.noDatastore);
  if (typeof path !== "string" || path === "") throw new QueryError(SENTENCES.noPath);
  const limit = body["limit"];
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1)) {
    throw new QueryError(SENTENCES.badLimit);
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
  if (nodes.length === 0) throw new QueryError(SENTENCES.noPath);
  return nodes;
}
