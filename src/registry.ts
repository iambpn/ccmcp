import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ccmcpHome, registryPath, statePath } from "./paths.js";
import type {
  AppliedState,
  McpServerConfig,
  Registry,
  RegistryServer,
  Scope,
} from "./types.js";

const REGISTRY_VERSION = 1;
const STATE_VERSION = 1;

function emptyRegistry(): Registry {
  return { version: REGISTRY_VERSION, servers: {} };
}

function emptyState(): AppliedState {
  return { version: STATE_VERSION, applied: {} };
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function loadRegistry(): Registry {
  const reg = readJson<Registry>(registryPath(), emptyRegistry());
  if (!reg.servers) reg.servers = {};
  return reg;
}

export function saveRegistry(reg: Registry): void {
  mkdirSync(ccmcpHome(), { recursive: true });
  writeJson(registryPath(), reg);
}

export function loadState(): AppliedState {
  const state = readJson<AppliedState>(statePath(), emptyState());
  if (!state.applied) state.applied = {};
  return state;
}

export function saveState(state: AppliedState): void {
  mkdirSync(ccmcpHome(), { recursive: true });
  writeJson(statePath(), state);
}

// --- CRUD helpers -----------------------------------------------------------

export interface AddServerInput {
  name: string;
  config: McpServerConfig;
  enabled?: boolean;
  scope?: Scope;
  projects?: string[];
}

export function addServer(reg: Registry, input: AddServerInput): RegistryServer {
  if (reg.servers[input.name]) {
    throw new Error(`Server "${input.name}" already exists in the registry.`);
  }
  const entry: RegistryServer = {
    config: input.config,
    enabled: input.enabled ?? false,
    scope: input.scope ?? "global",
  };
  if (entry.scope === "project") entry.projects = input.projects ?? [];
  reg.servers[input.name] = entry;
  return entry;
}

export function getServer(reg: Registry, name: string): RegistryServer {
  const entry = reg.servers[name];
  if (!entry) throw new Error(`Server "${name}" not found in the registry.`);
  return entry;
}

export function removeServer(reg: Registry, name: string): void {
  getServer(reg, name); // throws if missing
  delete reg.servers[name];
}

export function setEnabled(reg: Registry, name: string, enabled: boolean): void {
  getServer(reg, name).enabled = enabled;
}

export function setScope(
  reg: Registry,
  name: string,
  scope: Scope,
  projects?: string[],
): void {
  const entry = getServer(reg, name);
  entry.scope = scope;
  if (scope === "project") {
    entry.projects = projects ?? entry.projects ?? [];
  } else {
    delete entry.projects;
  }
}

export function listServers(reg: Registry): Array<{ name: string } & RegistryServer> {
  return Object.entries(reg.servers).map(([name, entry]) => ({ name, ...entry }));
}
