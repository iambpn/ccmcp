import { resolve } from "node:path";
import type { Command } from "commander";
import { getServer, loadRegistry, setEnabled, setScope } from "../registry.js";
import type { Scope } from "../types.js";
import { persist } from "./_shared.js";

function parseBool(value: string): boolean {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`Invalid value "${value}" for --enable. Use true or false.`);
}

export function registerUpdate(program: Command): void {
  program
    .command("update")
    .description("Update a server's registry settings (enabled flag, scope)")
    .argument("<name>", "Server name")
    .option("--enable <bool>", "Enable or disable the server (true|false)")
    .option("--scope <scope>", "Change scope: global or project")
    .option("--project <path...>", "Project path(s) when --scope project; defaults to cwd")
    .action((name: string, opts) => {
      if (opts.enable === undefined && opts.scope === undefined) {
        throw new Error("Specify at least one option: --enable or --scope.");
      }

      const reg = loadRegistry();
      getServer(reg, name); // validate existence

      if (opts.enable !== undefined) {
        const enabled = parseBool(opts.enable as string);
        setEnabled(reg, name, enabled);
        console.log(`  ${enabled ? "✓" : "✗"} ${name} ${enabled ? "enabled" : "disabled"}`);
      }

      if (opts.scope !== undefined) {
        const scope = opts.scope as string;
        if (scope !== "global" && scope !== "project") {
          throw new Error(`Invalid --scope "${scope}". Use global or project.`);
        }
        if (scope === "project") {
          const projects = (opts.project as string[] | undefined)?.length
            ? (opts.project as string[]).map((p) => resolve(p))
            : [process.cwd()];
          setScope(reg, name, "project", projects);
          console.log(`  scope → project\n    ${projects.join("\n    ")}`);
        } else {
          setScope(reg, name, scope as Scope);
          console.log(`  scope → global`);
        }
      }

      persist(reg);
    });
}
