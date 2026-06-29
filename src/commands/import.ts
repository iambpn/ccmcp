import type { Command } from "commander";
import { readClaudeConfig } from "../claudeConfig.js";
import { loadRegistry, saveRegistry } from "../registry.js";
import type { McpServerConfig } from "../types.js";

export function registerImport(program: Command): void {
  program
    .command("import")
    .description("Import existing MCP servers from Claude Code into the registry")
    .option("--overwrite", "Overwrite registry entries that already exist")
    .action((opts) => {
      const config = readClaudeConfig();
      const reg = loadRegistry();
      let imported = 0;
      let skipped = 0;

      const tryAdd = (
        name: string,
        cfg: McpServerConfig,
        scope: "global" | "project",
        projectPath?: string,
      ) => {
        if (reg.servers[name] && !opts.overwrite) {
          skipped++;
          return;
        }
        if (reg.servers[name]?.scope === "project" && scope === "project") {
          const projects = reg.servers[name].projects ?? [];
          if (projectPath && !projects.includes(projectPath)) projects.push(projectPath);
          reg.servers[name].projects = projects;
          reg.servers[name].config = cfg;
        } else {
          reg.servers[name] = {
            config: cfg,
            enabled: true,
            scope,
            ...(scope === "project" ? { projects: projectPath ? [projectPath] : [] } : {}),
          };
        }
        imported++;
      };

      for (const [name, cfg] of Object.entries(config.mcpServers ?? {})) {
        tryAdd(name, cfg, "global");
      }
      for (const [path, project] of Object.entries(config.projects ?? {})) {
        for (const [name, cfg] of Object.entries(project.mcpServers ?? {})) {
          tryAdd(name, cfg, "project", path);
        }
      }

      saveRegistry(reg);
      console.log(
        `Imported ${imported} server(s)${skipped ? `, skipped ${skipped} existing` : ""}.`,
      );
      console.log("Registry updated. Existing Claude Code config left unchanged.");
    });
}
