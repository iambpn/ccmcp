/**
 * An MCP server definition, mirroring Claude Code's on-disk entry shape.
 * Only the common fields are typed explicitly; the index signature keeps any
 * extra keys (e.g. oauth, timeout, alwaysLoad) intact on round-trip.
 */
export interface McpServerConfig {
  type?: "stdio" | "http" | "sse" | "ws";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export type Scope = "global" | "project";

/** A single server entry in the ccmcp registry. */
export interface RegistryServer {
  config: McpServerConfig;
  /** On/off switch. Disabled servers stay in the registry but are removed from Claude Code's config. */
  enabled: boolean;
  /** Where an enabled server is synced: user scope ("global") or local project scope. */
  scope: Scope;
  /** Absolute project paths this server applies to when scope === "project". */
  projects?: string[];
}

/** The ccmcp registry — the source of truth at ~/.ccmcp/config.json. */
export interface Registry {
  version: number;
  servers: Record<string, RegistryServer>;
}

/**
 * A location an entry was written to in Claude Code's config: either the
 * top-level user scope ("global") or a specific project path.
 */
export type AppliedLocation = "global" | string;

/**
 * Ownership state at ~/.ccmcp/state.json. Maps a server name to the list of
 * locations ccmcp last wrote it to, so reconcile can clean up only its own
 * entries without ever touching un-managed ones.
 */
export interface AppliedState {
  version: number;
  applied: Record<string, AppliedLocation[]>;
}
