Prepare a new release of ccmcp: figure out the right version bump, confirm with the user, then build and tag it via `scripts/release.sh`.

Arguments: `$ARGUMENTS` — optional explicit version (e.g. `1.2.0`) and/or `--push`. If omitted, infer the version and ask the user.

## Steps

1. **Survey what changed since the last release.**
   - Find the latest tag: `git tag -l | sort -V | tail -1`
   - Diff since that tag: `git log <last-tag>..HEAD --oneline` and `git diff <last-tag>..HEAD --stat`
   - Read the substantive diffs (not just filenames) for any new/changed `src/` files to understand whether changes are new backward-compatible features (minor), fixes/polish (patch), or breaking changes (major).

2. **Sanity-check the tree before proposing anything:**
   - `git status` — must be clean (no uncommitted changes). If dirty, stop and tell the user.
   - Confirm `package.json`'s current `version` field.

3. **Propose a version bump** using semver based on step 1's findings (major.minor.patch), unless the user already supplied one in `$ARGUMENTS`. If it's ambiguous or note-worthy, use AskUserQuestion to confirm the version with the user — don't just assume.

4. **Ask whether to publish**, unless `--push` was already given in `$ARGUMENTS`: build & tag locally only (default/safer), vs. build, tag, push the tag to origin, and create a GitHub Release via `gh` (this is a shared/remote action — always confirm before doing it, per the repo's normal push/publish conventions).

5. **Verify the build is healthy before cutting the release:**
   - `npm test`
   - `npm run build`
   Both must pass. Stop and report if either fails — don't force a release through a broken build.

6. **Run the release script:**
   - `./scripts/release.sh <version>` for a local-only build+tag
   - `./scripts/release.sh <version> --push` if the user opted to publish
   This bumps `package.json`, commits the bump, builds/bundles/packages binaries for linux/macos/win, assembles `releases/v<version>/` with a `SHA256SUMS.txt`, and creates an annotated git tag. With `--push` it also pushes the tag and creates a GitHub Release.

7. **Report the result:** the new version, the commit and tag created, the artifact directory, and — if not pushed — the exact follow-up commands to push/publish later (the script prints these).

## Notes
- Never push or publish without explicit confirmation for *this* release, even if a previous release was pushed.
- Don't hand-edit `package.json`'s version — let `scripts/release.sh` do it, so the version bump commit and the tag stay in sync.
- If `scripts/release.sh` reports the tag already exists, stop and ask the user how to proceed rather than deleting/recreating it yourself.
