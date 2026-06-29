import { resolve } from "node:path";
import type { Command } from "commander";
import { addServer, loadRegistry } from "../registry.js";
import type { Scope } from "../types.js";
import { buildConfig, collect, persist } from "./_shared.js";

export function registerAdd(program: Command): void {
  program
    .command("add")
    .description("Add an MCP server to the ccmcp registry")
    .argument("<name>", "Unique server name")
    .option("--transport <type>", "stdio | http | sse | ws")
    .option("--command <command>", "Executable for stdio servers")
    .option("--args <arg...>", "Arguments for the command")
    .option("--env <KEY=VALUE>", "Environment variable (repeatable)", collect)
    .option("--url <url>", "URL for http/sse/ws servers")
    .option("--header <KEY:VALUE>", "HTTP header (repeatable)", collect)
    .option("--json <json>", "Raw MCP server config as JSON")
    .option("--scope <scope>", "global | project", "project")
    .option("--project <path...>", "Project paths (scope=project; defaults to cwd)")
    .option("--enabled", "Enable and sync to Claude Code immediately after adding")
    .action((name: string, opts) => {
      const scope = opts.scope as Scope;
      if (scope !== "global" && scope !== "project") {
        throw new Error(`--scope must be "global" or "project".`);
      }
      const config = buildConfig(opts);
      const projects =
        scope === "project"
          ? opts.project?.length
            ? (opts.project as string[]).map((p) => resolve(p))
            : [process.cwd()]
          : undefined;

      const reg = loadRegistry();
      addServer(reg, {
        name,
        config,
        enabled: opts.enabled ?? false,
        scope,
        projects,
      });
      console.log(`Added "${name}" (${scope}${opts.enabled ? "" : ", disabled"}).`);
      persist(reg);
    });
}
