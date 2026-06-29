import type { Command } from "commander";
import type { McpServerConfig } from "../types.js";
import { listServers, loadRegistry, loadState } from "../registry.js";

function briefConfig(config: McpServerConfig): string {
  if (config.url) return `${config.type ?? "http"}: ${config.url}`;
  if (config.command) {
    const parts = [config.command, ...(config.args ?? [])].join(" ");
    return `stdio: ${parts}`;
  }
  return JSON.stringify(config);
}

export function registerList(program: Command): void {
  program
    .command("list")
    .alias("ls")
    .description("List MCP servers in the ccmcp registry")
    .action(() => {
      const servers = listServers(loadRegistry());
      if (servers.length === 0) {
        console.log("No servers in the registry. Add one with `ccmcp add`.");
        return;
      }
      const applied = loadState().applied;

      const SEP = "  ";
      const nameWidth = Math.max(4, ...servers.map((s) => s.name.length));
      const scopeWidth = 7;   // "project" = 7
      const enabledWidth = 7; // "enabled" = 7

      const headerCols = [
        "NAME".padEnd(nameWidth),
        "SCOPE".padEnd(scopeWidth),
        "ENABLED".padEnd(enabledWidth),
        "DEPLOYED TO",
      ];
      const headerLine = headerCols.join(SEP);
      console.log(headerLine);
      console.log("─".repeat(headerLine.length + 24));

      const indent = " ".repeat(nameWidth + scopeWidth + enabledWidth + SEP.length * 3);

      for (const s of servers) {
        const locs = applied[s.name] ?? [];
        const deployedLines = locs.length
          ? locs.map((l) => (l === "global" ? "global (user scope)" : l))
          : ["–"];

        // First row: name + scope + enabled + first deployed location
        console.log(
          [
            s.name.padEnd(nameWidth),
            s.scope.padEnd(scopeWidth),
            (s.enabled ? "yes" : "no").padEnd(enabledWidth),
            deployedLines[0],
          ].join(SEP),
        );

        // Overflow deployed locations on subsequent lines
        for (const loc of deployedLines.slice(1)) {
          console.log(indent + loc);
        }

        // Config summary line
        console.log(`  ${briefConfig(s.config)}`);
        console.log();
      }

      const enabledCount = servers.filter((s) => s.enabled).length;
      const deployedCount = servers.filter((s) => (applied[s.name] ?? []).length > 0).length;
      console.log(
        `${servers.length} server${servers.length === 1 ? "" : "s"}  ·  ${enabledCount} enabled  ·  ${deployedCount} deployed`,
      );
    });
}
