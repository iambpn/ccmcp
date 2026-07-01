import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

/**
 * Resolve a project path the way Claude Code identifies a project. Claude
 * Code keys a linked git worktree's config off the *main* worktree's path,
 * not the worktree checkout's own path — so opening Claude Code inside a
 * worktree reads (and writes) the primary repo's entry in ~/.claude.json.
 * Mirror that here so ccmcp writes entries where Claude Code will actually
 * look for them. Falls back to the given path unchanged for non-worktree
 * repos, non-git directories, or if git isn't available.
 */
export function resolveProjectLocation(path: string): string {
  const cwd = resolve(path);
  try {
    const gitDir = execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const absGitDir = resolve(cwd, gitDir);
    const absCommonDir = resolve(cwd, commonDir);
    if (absGitDir === absCommonDir) return cwd; // not a linked worktree
    return dirname(absCommonDir); // main worktree's root
  } catch {
    return cwd;
  }
}
