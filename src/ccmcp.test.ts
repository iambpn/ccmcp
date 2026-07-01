import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eraseOneServer, readClaudeConfig, reconcile, writeOneServer } from "./claudeConfig.js";
import {
  addServer,
  getServer,
  loadRegistry,
  loadState,
  removeServer,
  saveRegistry,
  setEnabled,
  setScope,
} from "./registry.js";
import type { Registry } from "./types.js";

let dir: string;
let claudePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ccmcp-test-"));
  claudePath = join(dir, ".claude.json");
  process.env.CCMCP_HOME = join(dir, ".ccmcp");
  process.env.CCMCP_CLAUDE_CONFIG = claudePath;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CCMCP_HOME;
  delete process.env.CCMCP_CLAUDE_CONFIG;
});

function freshRegistry(): Registry {
  return { version: 1, servers: {} };
}

describe("registry CRUD", () => {
  it("round-trips servers and rejects duplicates", () => {
    const reg = freshRegistry();
    addServer(reg, { name: "a", config: { type: "http", url: "https://a" } });
    saveRegistry(reg);

    const reloaded = loadRegistry();
    expect(getServer(reloaded, "a").config.url).toBe("https://a");
    expect(getServer(reloaded, "a").enabled).toBe(false);
    expect(getServer(reloaded, "a").scope).toBe("global");

    expect(() => addServer(reloaded, { name: "a", config: {} })).toThrow(/already exists/);
    expect(() => getServer(reloaded, "missing")).toThrow(/not found/);

    removeServer(reloaded, "a");
    expect(reloaded.servers.a).toBeUndefined();
  });
});

describe("reconcile", () => {
  it("syncs enabled+global to top-level mcpServers", () => {
    const reg = freshRegistry();
    addServer(reg, { name: "g", config: { type: "http", url: "https://g" }, scope: "global", enabled: true });
    saveRegistry(reg);

    const result = reconcile(reg);
    expect(result.changed).toBe(true);
    expect(readClaudeConfig().mcpServers?.g).toEqual({ type: "http", url: "https://g" });
    expect(loadState().applied.g).toEqual(["global"]);
  });

  it("syncs enabled+project to projects[path].mcpServers", () => {
    const reg = freshRegistry();
    addServer(reg, {
      name: "p",
      config: { type: "stdio", command: "srv" },
      scope: "project",
      projects: ["/proj/one"],
      enabled: true,
    });
    saveRegistry(reg);
    reconcile(reg);

    const cfg = readClaudeConfig();
    expect(cfg.projects?.["/proj/one"].mcpServers?.p).toEqual({ type: "stdio", command: "srv" });
    expect(cfg.mcpServers).toBeUndefined();
  });

  it("removes a server from Claude config when disabled, keeps it in registry", () => {
    const reg = freshRegistry();
    addServer(reg, { name: "g", config: { type: "http", url: "https://g" }, enabled: true });
    saveRegistry(reg);
    reconcile(reg);
    expect(readClaudeConfig().mcpServers?.g).toBeDefined();

    setEnabled(reg, "g", false);
    saveRegistry(reg);
    const result = reconcile(reg);

    expect(result.removed).toEqual([{ name: "g", location: "global" }]);
    expect(readClaudeConfig().mcpServers).toBeUndefined();
    expect(getServer(loadRegistry(), "g").enabled).toBe(false); // still in registry
  });

  it("relocates a server when its scope changes", () => {
    const reg = freshRegistry();
    addServer(reg, { name: "s", config: { type: "http", url: "https://s" }, scope: "global", enabled: true });
    saveRegistry(reg);
    reconcile(reg);
    expect(readClaudeConfig().mcpServers?.s).toBeDefined();

    setScope(reg, "s", "project", ["/proj/x"]);
    saveRegistry(reg);
    reconcile(reg);

    const cfg = readClaudeConfig();
    expect(cfg.mcpServers).toBeUndefined();
    expect(cfg.projects?.["/proj/x"].mcpServers?.s).toBeDefined();
  });

  it("removes a project's entry when that project is dropped from projects[]", () => {
    const reg = freshRegistry();
    addServer(reg, {
      name: "p",
      config: { type: "stdio", command: "srv" },
      scope: "project",
      projects: ["/proj/one", "/proj/two"],
      enabled: true,
    });
    saveRegistry(reg);
    reconcile(reg);
    expect(readClaudeConfig().projects?.["/proj/one"].mcpServers?.p).toBeDefined();
    expect(readClaudeConfig().projects?.["/proj/two"].mcpServers?.p).toBeDefined();

    setScope(reg, "p", "project", ["/proj/one"]);
    saveRegistry(reg);
    const result = reconcile(reg);

    expect(result.removed).toEqual([{ name: "p", location: "/proj/two" }]);
    expect(readClaudeConfig().projects?.["/proj/two"].mcpServers).toBeUndefined();
    expect(readClaudeConfig().projects?.["/proj/one"].mcpServers?.p).toBeDefined();
  });
});

describe("link + sync interaction", () => {
  it("keeps a manually-linked location through sync even while the entry is disabled", () => {
    const reg = freshRegistry();
    addServer(reg, {
      name: "p",
      config: { type: "stdio", command: "srv" },
      scope: "project",
      projects: ["/proj/original"],
      enabled: false,
    });
    saveRegistry(reg);

    // Simulate `ccmcp link p` from /proj/extra: it records the new project on
    // the registry entry and writes straight into Claude's config.
    const entry = getServer(reg, "p");
    entry.projects = [...(entry.projects ?? []), "/proj/extra"];
    saveRegistry(reg);
    writeOneServer("p", entry.config, "/proj/extra");
    expect(readClaudeConfig().projects?.["/proj/extra"].mcpServers?.p).toBeDefined();

    const result = reconcile(loadRegistry());

    expect(result.removed).toEqual([]);
    expect(readClaudeConfig().projects?.["/proj/extra"].mcpServers?.p).toBeDefined();
    expect(readClaudeConfig().projects?.["/proj/original"]).toBeUndefined();
  });

  it("removes a linked location once it's explicitly unlinked", () => {
    const reg = freshRegistry();
    addServer(reg, {
      name: "p",
      config: { type: "stdio", command: "srv" },
      scope: "project",
      projects: [],
      enabled: false,
    });
    saveRegistry(reg);

    const entry = getServer(reg, "p");
    entry.projects = ["/proj/extra"];
    saveRegistry(reg);
    writeOneServer("p", entry.config, "/proj/extra");
    reconcile(loadRegistry());
    expect(readClaudeConfig().projects?.["/proj/extra"].mcpServers?.p).toBeDefined();

    // Simulate `ccmcp unlink p` from /proj/extra.
    eraseOneServer("p", "/proj/extra");
    const reg2 = loadRegistry();
    const entry2 = getServer(reg2, "p");
    entry2.projects = entry2.projects!.filter((loc) => loc !== "/proj/extra");
    saveRegistry(reg2);

    const result = reconcile(loadRegistry());
    expect(readClaudeConfig().projects?.["/proj/extra"]?.mcpServers).toBeUndefined();
    expect(result.removed).toEqual([]);
  });
});

describe("safety", () => {
  it("preserves unrelated keys and manual entries, and creates a .bak", () => {
    writeFileSync(
      claudePath,
      JSON.stringify({
        numStartups: 7,
        mcpServers: { manual: { type: "http", url: "https://manual" } },
      }),
      "utf8",
    );

    const reg = freshRegistry();
    addServer(reg, { name: "g", config: { type: "http", url: "https://g" }, enabled: true });
    saveRegistry(reg);
    reconcile(reg);

    const cfg = readClaudeConfig();
    expect(cfg.numStartups).toBe(7);
    expect(cfg.mcpServers?.manual).toEqual({ type: "http", url: "https://manual" });
    expect(cfg.mcpServers?.g).toBeDefined();
    expect(existsSync(claudePath + ".bak")).toBe(true);

    // Disabling our entry must not touch the manual one.
    setEnabled(reg, "g", false);
    saveRegistry(reg);
    reconcile(reg);
    expect(readClaudeConfig().mcpServers?.manual).toBeDefined();
    expect(readClaudeConfig().mcpServers?.g).toBeUndefined();
  });

  it("writes valid JSON atomically", () => {
    const reg = freshRegistry();
    addServer(reg, { name: "g", config: { type: "http", url: "https://g" }, enabled: true });
    saveRegistry(reg);
    reconcile(reg);
    expect(() => JSON.parse(readFileSync(claudePath, "utf8"))).not.toThrow();
  });
});
