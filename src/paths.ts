import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Directory holding ccmcp's own state. Overridable via CCMCP_HOME (used by
 * tests so they never touch the real ~/.ccmcp).
 */
export function ccmcpHome(): string {
  return process.env.CCMCP_HOME || join(homedir(), ".ccmcp");
}

/** Path to the ccmcp registry (source of truth). */
export function registryPath(): string {
  return join(ccmcpHome(), "config.json");
}

/** Path to the ownership/state file recording what ccmcp last applied. */
export function statePath(): string {
  return join(ccmcpHome(), "state.json");
}

/**
 * Path to Claude Code's config file. Honors CLAUDE_CONFIG_DIR (Claude Code's
 * own override); falls back to ~/.claude.json. CCMCP_CLAUDE_CONFIG takes
 * highest precedence and is intended for tests.
 */
export function claudeConfigPath(): string {
  if (process.env.CCMCP_CLAUDE_CONFIG) return process.env.CCMCP_CLAUDE_CONFIG;
  if (process.env.CLAUDE_CONFIG_DIR) {
    return join(process.env.CLAUDE_CONFIG_DIR, ".claude.json");
  }
  return join(homedir(), ".claude.json");
}
