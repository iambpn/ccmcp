import type { Command } from "commander";
import { reconcile } from "../claudeConfig.js";
import { printReconcile } from "../output.js";
import { loadRegistry } from "../registry.js";

export function registerApply(program: Command): void {
  program
    .command("sync")
    .description("Reconcile the registry into Claude Code's config")
    .action(() => {
      printReconcile(reconcile(loadRegistry()));
    });
}
