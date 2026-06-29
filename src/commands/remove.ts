import type { Command } from "commander";
import { loadRegistry, removeServer } from "../registry.js";
import { persist } from "./_shared.js";

export function registerRemove(program: Command): void {
  program
    .command("remove")
    .alias("rm")
    .description("Remove an MCP server from the registry")
    .argument("<name>", "Server name")
    .action((name: string) => {
      const reg = loadRegistry();
      removeServer(reg, name);
      console.log(`Removed "${name}" from the registry.`);
      persist(reg);
    });
}
