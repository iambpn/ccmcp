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
  McpServerConfig,
  Registry,
} from "./types.js";

/** Shape of the parts of ~/.claude.json we touch. All other keys are preserved. */
interface ClaudeConfig {
  mcpServers?: Record<string, McpServerConfig>;
  projects?: Record<string, { mcpServers?: Record<string, McpServerConfig> } & Record<string, unknown>>;
  disabledMcpjsonServers?: string[];
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
 * Write Claude Code's config back: atomic (temp file + rename) with a one-time
 * `.bak` of the original, preserving every key we don't manage.
 */
function writeClaudeConfig(config: ClaudeConfig): void {
  const path = claudeConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const bak = path + ".bak";
  if (existsSync(path) && !existsSync(bak)) copyFileSync(path, bak);
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

/** Compute name -> set of locations the registry wants applied to Claude Code. */
function computeDesired(reg: Registry): Map<string, Set<AppliedLocation>> {
  const desired = new Map<string, Set<AppliedLocation>>();
  for (const [name, entry] of Object.entries(reg.servers)) {
    if (!entry.enabled) continue;
    const locations =
      entry.scope === "global" ? ["global"] : entry.projects ?? [];
    if (locations.length) desired.set(name, new Set(locations));
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

/** Add a server name to disabledMcpjsonServers if not already present. */
export function addToDisabled(name: string): void {
  const config = readClaudeConfig();
  const list = (config.disabledMcpjsonServers ??= []);
  if (!list.includes(name)) {
    list.push(name);
    writeClaudeConfig(config);
  }
}

/** Remove a server name from disabledMcpjsonServers if present. */
export function removeFromDisabled(name: string): void {
  const config = readClaudeConfig();
  if (!config.disabledMcpjsonServers?.includes(name)) return;
  config.disabledMcpjsonServers = config.disabledMcpjsonServers.filter((n) => n !== name);
  if (config.disabledMcpjsonServers.length === 0) delete config.disabledMcpjsonServers;
  writeClaudeConfig(config);
}

/**
 * Write a single server into Claude Code's config at the given location and
 * record ownership in state.json. Does not touch the ccmcp registry.
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
  saveState(state);

  return { changed, configPath: claudeConfigPath() };
}

/**
 * Remove a single server from Claude Code's config at the given location and
 * update state.json. Does not touch the ccmcp registry.
 * Returns true if an entry was actually deleted.
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
    saveState(state);
  }

  return { removed, configPath: claudeConfigPath() };
}

/**
 * Reconcile the registry into Claude Code's config:
 *  - enabled + global  -> top-level mcpServers
 *  - enabled + project -> projects["/path"].mcpServers
 *  - disabled / removed -> deleted (only entries ccmcp previously wrote)
 *
 * Only entries tracked in state.json are ever removed, so manual entries and
 * `claude mcp add` entries are never clobbered. State is updated to the new
 * applied set.
 */
export function reconcile(reg: Registry): ReconcileResult {
  const desired = computeDesired(reg);
  const state = loadState();
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
  saveState({ version: state.version, applied });

  return { written, removed, changed, configPath: claudeConfigPath() };
}
