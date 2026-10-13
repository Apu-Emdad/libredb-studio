/**
 * Local aliases for the repository shapes this provider answers with (issue #1724).
 *
 * This directory imports nothing from the repository, so the shapes it needs are declared here,
 * narrowed to the fields this provider sets. They are not a second source of truth: when the code
 * moves to `providers/network/netconf/` these aliases are deleted and the repository's own types
 * are imported. Until then they are what lets the class be type checked and tested at all.
 *
 * MEASURED on `90881379`: `src/lib/db/base-provider.ts` declares 17 abstract members, named
 * connect, disconnect, query, listContainers, countObjects, listObjects, describeObject,
 * describeObjects, getHealth, runMaintenance, getOverview, getPerformanceMetrics, getSlowQueries,
 * getActiveSessions, getTableStats, getIndexStats and getStorageStats. `getCapabilities` and
 * `getLabels` are concrete there, at lines 327 and 360, and every provider overrides them, so the
 * number a provider writes is 17 or 19 depending on which question is asked.
 */

export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly rowCount: number;
  /** Set when a cap ended the read, so the grid can say the answer is partial. */
  readonly warning?: string;
}

export interface Container {
  readonly name: string;
  readonly kinds?: readonly string[];
}

/**
 * A count, or a stated reason why there is none.
 *
 * The repository carries this distinction already, and it is the difference between "this engine
 * holds none of these" and "this engine cannot answer that question". A provider that returns 0 for
 * the second draws an empty folder where it should draw a sentence.
 */
export type KindCount = { readonly count: number } | { readonly unavailable: string };

export interface DatabaseObject {
  readonly name: string;
  readonly kind: string;
}

export interface ObjectDetail {
  readonly name: string;
  readonly kind: string;
  readonly details: Readonly<Record<string, string>>;
}

export interface HealthInfo {
  readonly reachable: boolean;
  readonly version?: string;
  readonly details: Readonly<Record<string, string>>;
}

export interface DatabaseOverview {
  readonly tableCount: number;
  readonly indexCount: number;
  readonly details?: Readonly<Record<string, string>>;
}

export type PerformanceMetrics = Readonly<Record<string, number>>;
export type SlowQueryStats = Readonly<Record<string, string>>;
export type ActiveSessionDetails = Readonly<Record<string, string>>;
export type TableStats = Readonly<Record<string, string>>;
export type IndexStats = Readonly<Record<string, string>>;
export type StorageStats = Readonly<Record<string, string>>;
export interface MaintenanceResult {
  readonly done: boolean;
  readonly message: string;
}

/** The error a refused surface raises. The repository's `QueryError` is its real counterpart. */
export class RefusedError extends Error {}
