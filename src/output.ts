import type { AppliedLocation } from "./types.js";
import type { ReconcileResult } from "./claudeConfig.js";

export function describeLocation(location: AppliedLocation): string {
  return location === "global" ? "global (user scope)" : `project ${location}`;
}

/** Print the outcome of a reconcile, including the restart reminder. */
export function printReconcile(result: ReconcileResult): void {
  if (!result.changed) {
    console.log("Claude Code config already in sync — no changes.");
    return;
  }
  for (const w of result.written) {
    console.log(`  + ${w.name} → ${describeLocation(w.location)}`);
  }
  for (const r of result.removed) {
    console.log(`  - ${r.name} (removed from ${describeLocation(r.location)})`);
  }
  console.log(`\nUpdated ${result.configPath}`);
  console.log(
    "Restart any running Claude Code sessions for changes to take effect.",
  );
}
