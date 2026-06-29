#!/usr/bin/env node

import { Command } from "commander";
import { registerAdd } from "./commands/add.js";
import { registerApply } from "./commands/apply.js";
import { registerEnableDisable } from "./commands/enable.js";
import { registerGet } from "./commands/get.js";
import { registerImport } from "./commands/import.js";
import { registerList } from "./commands/list.js";
import { registerRemove } from "./commands/remove.js";
import { registerUpdate } from "./commands/update.js";

const program = new Command();

program
  .name("ccmcp")
  .description("Claude Code MCP manager — a registry with per-server enable/disable and scoping")
  .version("1.0.0");

registerAdd(program);
registerList(program);
registerGet(program);
registerRemove(program);
registerEnableDisable(program);
registerUpdate(program);
registerApply(program);
registerImport(program);

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
