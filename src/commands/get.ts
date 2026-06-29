import type { Command } from "commander";
import { describeLocation } from "../output.js";
import { getServer, loadRegistry, loadState } from "../registry.js";

export function registerGet(program: Command): void {
  program
    .command("get")
    .description("Show a registry entry and where it is applied")
    .argument("<name>", "Server name")
    .action((name: string) => {
      const entry = getServer(loadRegistry(), name);
      console.log(`name:    ${name}`);
      console.log(`enabled: ${entry.enabled}`);
      console.log(`scope:   ${entry.scope}`);
      if (entry.scope === "project") {
        console.log(`projects:\n  ${(entry.projects ?? []).join("\n  ") || "(none)"}`);
      }
      console.log(`config:  ${JSON.stringify(entry.config, null, 2)}`);
      const applied = loadState().applied[name] ?? [];
      console.log(
        `applied: ${applied.length ? applied.map(describeLocation).join(", ") : "(not synced)"}`,
      );
    });
}
