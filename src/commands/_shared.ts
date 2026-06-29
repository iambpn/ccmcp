import { saveRegistry } from "../registry.js";
import type { McpServerConfig, Registry } from "../types.js";

/** Commander collector for repeatable options (e.g. --env, --header, --project). */
export function collect(value: string, previous: string[] = []): string[] {
  return previous.concat([value]);
}

/** Parse KEY=VALUE pairs into an object. */
export function parseEnv(pairs: string[] | undefined): Record<string, string> {
  const env: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const eq = pair.indexOf("=");
    if (eq === -1) throw new Error(`Invalid --env "${pair}" (expected KEY=VALUE).`);
    env[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return env;
}

/** Parse KEY:VALUE header pairs into an object. */
export function parseHeaders(pairs: string[] | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const colon = pair.indexOf(":");
    if (colon === -1) throw new Error(`Invalid --header "${pair}" (expected KEY:VALUE).`);
    headers[pair.slice(0, colon)] = pair.slice(colon + 1).trim();
  }
  return headers;
}

export interface BuildConfigOptions {
  transport?: string;
  command?: string;
  args?: string[];
  env?: string[];
  url?: string;
  header?: string[];
  json?: string;
}

/** Build an MCP server config from CLI flags (or raw --json). */
export function buildConfig(opts: BuildConfigOptions): McpServerConfig {
  if (opts.json) {
    const parsed = JSON.parse(opts.json) as McpServerConfig;
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("--json must be a JSON object.");
    }
    return parsed;
  }

  const type = opts.transport ?? (opts.url ? "http" : opts.command ? "stdio" : undefined);
  if (!type) {
    throw new Error(
      "Specify --transport, or provide --command (stdio) or --url (http/sse/ws), or use --json.",
    );
  }

  if (type === "stdio") {
    if (!opts.command) throw new Error("stdio servers require --command.");
    const config: McpServerConfig = { type: "stdio", command: opts.command };
    if (opts.args?.length) config.args = opts.args;
    const env = parseEnv(opts.env);
    if (Object.keys(env).length) config.env = env;
    return config;
  }

  if (type === "http" || type === "sse" || type === "ws") {
    if (!opts.url) throw new Error(`${type} servers require --url.`);
    const config: McpServerConfig = { type, url: opts.url };
    const headers = parseHeaders(opts.header);
    if (Object.keys(headers).length) config.headers = headers;
    return config;
  }

  throw new Error(`Unknown transport "${type}".`);
}

/**
 * Save the registry and, unless apply is disabled, reconcile into Claude Code's
 * config and print the result.
 */
export function persist(reg: Registry): void {
  saveRegistry(reg);
  console.log("Registry updated. Run `ccmcp sync` to sync to Claude Code.");
}
