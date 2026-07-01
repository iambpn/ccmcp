import type { Command } from "commander";
import { resolveProjectLocation } from "../git.js";
import { loadRegistry, setScope } from "../registry.js";
import { persist } from "./_shared.js";

export function registerScope(program: Command): void {
  program
    .command("scope")
    .description("Change a server's scope (global or project)")
    .argument("<name>", "Server name")
    .option("--global", "Scope to global (user) scope")
    .option("--project <path...>", "Scope to project path(s)")
    .action((name: string, opts, command: Command) => {
      if (opts.global && opts.project) {
        throw new Error("Use either --global or --project, not both.");
      }
      const reg = loadRegistry();
      if (opts.global) {
        setScope(reg, name, "global");
        console.log(`"${name}" is now global.`);
      } else {
        const projects = (opts.project as string[] | undefined)?.length
          ? (opts.project as string[]).map((p) => resolveProjectLocation(p))
          : [];
        setScope(reg, name, "project", projects);
        console.log(
          projects.length
            ? `"${name}" is now scoped to:\n  ${projects.join("\n  ")}`
            : `"${name}" is now project-scoped but not linked to any project (use --project to link one).`,
        );
      }
      persist(reg);
    });
}
