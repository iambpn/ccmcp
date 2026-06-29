import type { Command } from "commander";
import { addToDisabled, eraseOneServer, removeFromDisabled, writeOneServer } from "../claudeConfig.js";
import { describeLocation } from "../output.js";
import { getServer, loadRegistry } from "../registry.js";
import type { AppliedLocation } from "../types.js";

function resolveLocation(scope: string): AppliedLocation {
  return scope === "global" ? "global" : process.cwd();
}

export function registerEnableDisable(program: Command): void {
  program
    .command("link")
    .description("Add a server to Claude Code's config for the current project (or globally)")
    .argument("<name>", "Server name")
    .action((name: string) => {
      const reg = loadRegistry();
      const entry = getServer(reg, name);
      const location = resolveLocation(entry.scope);
      const { changed, configPath } = writeOneServer(name, entry.config, location);
      if (entry.enabled) {
        removeFromDisabled(name);
      } else {
        addToDisabled(name);
      }
      if (changed) {
        console.log(`  + ${name} → ${describeLocation(location)}${entry.enabled ? "" : " (disabled)"}`);
        console.log(`\nUpdated ${configPath}`);
      } else {
        console.log(`"${name}" already present in ${describeLocation(location)} — config unchanged.`);
      }
      console.log("Restart any running Claude Code sessions for changes to take effect.");
    });

  program
    .command("unlink")
    .description("Remove a server from Claude Code's config for the current project (or globally)")
    .argument("<name>", "Server name")
    .action((name: string) => {
      const reg = loadRegistry();
      const entry = getServer(reg, name);
      const location = resolveLocation(entry.scope);
      const { removed, configPath } = eraseOneServer(name, location);
      removeFromDisabled(name);
      if (removed) {
        console.log(`  - ${name} (removed from ${describeLocation(location)})`);
        console.log(`\nUpdated ${configPath}`);
        console.log("Restart any running Claude Code sessions for changes to take effect.");
      } else {
        console.log(`"${name}" was not found in ${describeLocation(location)} — nothing changed.`);
      }
    });

}
