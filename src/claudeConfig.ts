import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { claudeConfigPath } from "./paths.js";
import { loadState, saveState } from "./registry.js";
import type {
  AppliedLocation,
  AppliedState,
  McpServerConfig,
  Registry,
} from "./types.js";

/** Shape of the parts of ~/.claude.json we touch. All other keys are preserved. */
interface ClaudeConfig {
  mcpServers?: Record<string, McpServerConfig>;
  projects?: Record<
    string,
    { mcpServers?: Record<string, McpServerConfig>; disabledMcpServers?: string[] } & Record<string, unknown>
  >;
  disabledMcpServers?: string[];
  [key: string]: unknown;
}

export interface ReconcileChange {
  name: string;
  location: AppliedLocation;
}

export interface ReconcileResult {
  written: ReconcileChange[];
  removed: ReconcileChange[];
  changed: boolean;
  configPath: string;
}

/** Read Claude Code's full config, or {} if it doesn't exist yet. */
export function readClaudeConfig(): ClaudeConfig {
  const path = claudeConfigPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as ClaudeConfig;
}

/**
 * Write Claude Code's config back: atomic (temp file + rename), refreshing a
 * `.bak` of the pre-write version each time, preserving every key we don't manage.
 */
function writeClaudeConfig(config: ClaudeConfig): void {
  const path = claudeConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) copyFileSync(path, path + ".bak");
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

/**
 * Compute name -> set of locations that should be applied to Claude Code:
 * every location declared on an enabled entry, plus any location explicitly
 * attached via `ccmcp link` (state.linked) even while the entry is disabled.
 * Linked locations are still capped to the entry's own projects/scope, so
 * dropping a project from `projects[]` (or removing the server) drops it too.
 */
function computeDesired(
  reg: Registry,
  state: AppliedState,
): Map<string, Set<AppliedLocation>> {
  const desired = new Map<string, Set<AppliedLocation>>();
  for (const [name, entry] of Object.entries(reg.servers)) {
    const registryLocations = new Set<AppliedLocation>(
      entry.scope === "global" ? ["global"] : entry.projects ?? [],
    );
    const locations = new Set<AppliedLocation>();
    if (entry.enabled) {
      for (const loc of registryLocations) locations.add(loc);
    }
    for (const loc of state.linked?.[name] ?? []) {
      if (registryLocations.has(loc)) locations.add(loc);
    }
    if (locations.size) desired.set(name, locations);
  }
  return desired;
}

/** Get (creating if needed) the mcpServers object for a given location. */
function ensureMcpServers(
  config: ClaudeConfig,
  location: AppliedLocation,
): Record<string, McpServerConfig> {
  if (location === "global") {
    return (config.mcpServers ??= {});
  }
  config.projects ??= {};
  const project = (config.projects[location] ??= {});
  return (project.mcpServers ??= {});
}

/** Remove a server from a location; returns true if something was deleted. */
function removeMcpServer(
  config: ClaudeConfig,
  name: string,
  location: AppliedLocation,
): boolean {
  let bucket: Record<string, McpServerConfig> | undefined;
  if (location === "global") {
    bucket = config.mcpServers;
  } else {
    bucket = config.projects?.[location]?.mcpServers;
  }
  if (!bucket || !(name in bucket)) return false;
  delete bucket[name];
  // Tidy up an emptied mcpServers container (but never the project entry itself).
  if (Object.keys(bucket).length === 0) {
    if (location === "global") {
      delete config.mcpServers;
    } else if (config.projects?.[location]) {
      delete config.projects[location].mcpServers;
    }
  }
  return true;
}

/**
 * Get (creating if needed) the disabledMcpServers array for a location.
 * Claude Code keys this list per project (projects["/path"].disabledMcpServers)
 * rather than at the top level; only the "global" location uses the
 * top-level array.
 */
function ensureDisabledList(config: ClaudeConfig, location: AppliedLocation): string[] {
  if (location === "global") return (config.disabledMcpServers ??= []);
  config.projects ??= {};
  const project = (config.projects[location] ??= {});
  return (project.disabledMcpServers ??= []);
}

/** Add a server name to the location's disabledMcpServers if not already present. */
export function addToDisabled(name: string, location: AppliedLocation): void {
  const config = readClaudeConfig();
  const list = ensureDisabledList(config, location);
  if (!list.includes(name)) {
    list.push(name);
    writeClaudeConfig(config);
  }
}

/** Remove a server name from the location's disabledMcpServers if present. */
export function removeFromDisabled(name: string, location: AppliedLocation): void {
  const config = readClaudeConfig();
  const list =
    location === "global" ? config.disabledMcpServers : config.projects?.[location]?.disabledMcpServers;
  if (!list?.includes(name)) return;
  const filtered = list.filter((n) => n !== name);

  if (location === "global") {
    if (filtered.length === 0) delete config.disabledMcpServers;
    else config.disabledMcpServers = filtered;
  } else {
    const project = config.projects![location];
    if (filtered.length === 0) delete project.disabledMcpServers;
    else project.disabledMcpServers = filtered;
  }
  writeClaudeConfig(config);
}

/**
 * Write a single server into Claude Code's config at the given location and
 * record ownership in state.json (both as applied and as explicitly linked,
 * so a later `sync` won't remove it just because the entry is disabled).
 * Does not touch the ccmcp registry.
 */
export function writeOneServer(
  name: string,
  config: McpServerConfig,
  location: AppliedLocation,
): { changed: boolean; configPath: string } {
  const claudeConfig = readClaudeConfig();
  const bucket = ensureMcpServers(claudeConfig, location);
  const before = JSON.stringify(bucket[name]);
  bucket[name] = config;
  const changed = before !== JSON.stringify(config);
  if (changed) writeClaudeConfig(claudeConfig);

  const state = loadState();
  const locs = new Set(state.applied[name] ?? []);
  locs.add(location);
  state.applied[name] = [...locs];

  state.linked ??= {};
  const linkedLocs = new Set(state.linked[name] ?? []);
  linkedLocs.add(location);
  state.linked[name] = [...linkedLocs];

  saveState(state);

  return { changed, configPath: claudeConfigPath() };
}

/**
 * Remove a single server from Claude Code's config at the given location and
 * update state.json (both applied and linked). Does not touch the ccmcp
 * registry. Returns true if an entry was actually deleted.
 */
export function eraseOneServer(
  name: string,
  location: AppliedLocation,
): { removed: boolean; configPath: string } {
  const claudeConfig = readClaudeConfig();
  const removed = removeMcpServer(claudeConfig, name, location);
  if (removed) writeClaudeConfig(claudeConfig);

  const state = loadState();
  if (state.applied[name]) {
    const locs = new Set(state.applied[name]);
    locs.delete(location);
    if (locs.size === 0) {
      delete state.applied[name];
    } else {
      state.applied[name] = [...locs];
    }
  }
  if (state.linked?.[name]) {
    const linkedLocs = new Set(state.linked[name]);
    linkedLocs.delete(location);
    if (linkedLocs.size === 0) {
      delete state.linked[name];
    } else {
      state.linked[name] = [...linkedLocs];
    }
  }
  saveState(state);

  return { removed, configPath: claudeConfigPath() };
}

/**
 * Reconcile the registry into Claude Code's config:
 *  - enabled + global    -> top-level mcpServers
 *  - enabled + project   -> projects["/path"].mcpServers
 *  - explicitly linked   -> kept even while disabled, until unlinked or
 *                           dropped from the entry's projects[]
 *  - disabled & unlinked -> deleted (only entries ccmcp previously wrote)
 *
 * Only entries tracked in state.json are ever removed, so manual entries and
 * `claude mcp add` entries are never clobbered. State is updated to the new
 * applied/linked sets.
 */
export function reconcile(reg: Registry): ReconcileResult {
  const state = loadState();
  const desired = computeDesired(reg, state);
  const config = readClaudeConfig();

  const written: ReconcileChange[] = [];
  const removed: ReconcileChange[] = [];

  // Apply desired entries.
  for (const [name, locations] of desired) {
    const cfg = reg.servers[name].config;
    for (const location of locations) {
      const bucket = ensureMcpServers(config, location);
      const before = JSON.stringify(bucket[name]);
      bucket[name] = cfg;
      if (before !== JSON.stringify(cfg)) written.push({ name, location });
    }
  }

  // Remove previously-applied entries that are no longer desired.
  for (const [name, locations] of Object.entries(state.applied)) {
    const desiredLocs = desired.get(name) ?? new Set<AppliedLocation>();
    for (const location of locations) {
      if (!desiredLocs.has(location) && removeMcpServer(config, name, location)) {
        removed.push({ name, location });
      }
    }
  }

  const changed = written.length > 0 || removed.length > 0;
  if (changed) writeClaudeConfig(config);

  // Persist the new ownership set.
  const applied: Record<string, AppliedLocation[]> = {};
  for (const [name, locations] of desired) applied[name] = [...locations];

  // Keep `linked` in sync: drop locations that fell out of the entry's own
  // scope/projects (e.g. a project was removed from projects[]), and drop
  // servers that no longer exist in the registry at all.
  const linked: Record<string, AppliedLocation[]> = {};
  for (const [name, locs] of Object.entries(state.linked ?? {})) {
    const entry = reg.servers[name];
    if (!entry) continue;
    const registryLocations = new Set<AppliedLocation>(
      entry.scope === "global" ? ["global"] : entry.projects ?? [],
    );
    const kept = locs.filter((loc) => registryLocations.has(loc));
    if (kept.length) linked[name] = kept;
  }

  saveState({ version: state.version, applied, linked });

  return { written, removed, changed, configPath: claudeConfigPath() };
}
