#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# release.sh — build, package, and tag a ccmcp release
#
# Usage:
#   ./scripts/release.sh [VERSION] [--push]
#
#   VERSION   semver string, e.g. 1.2.3 (without "v" prefix)
#             defaults to the version in package.json
#   --push    push the tag to origin and create a GitHub Release (requires gh)
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── helpers ─────────────────────────────────────────────────────────────────

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n'  "$*"; }
step()   { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die()    { red "error: $*" >&2; exit 1; }

# ── argument parsing ─────────────────────────────────────────────────────────

VERSION=""
PUSH=false

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    v*)     VERSION="${arg#v}" ;;   # strip leading "v" if provided
    [0-9]*) VERSION="$arg" ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# Fall back to package.json version
if [[ -z "$VERSION" ]]; then
  VERSION="$(node -p "require('./package.json').version")"
  yellow "No version supplied — using package.json version: $VERSION"
fi

TAG="v$VERSION"
RELEASE_DIR="releases/$TAG"

# ── pre-flight checks ────────────────────────────────────────────────────────

step "Pre-flight checks"

command -v node  >/dev/null 2>&1 || die "node not found"
command -v npm   >/dev/null 2>&1 || die "npm not found"
command -v git   >/dev/null 2>&1 || die "git not found"

if $PUSH; then
  command -v gh >/dev/null 2>&1 || die "--push requires the GitHub CLI (gh)"
fi

# Validate version format
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]] \
  || die "VERSION must be semver (e.g. 1.2.3 or 1.2.3-beta.1), got: $VERSION"

# Refuse to tag a dirty tree
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Working tree has uncommitted changes. Commit or stash them first."
fi

# Refuse to re-create an existing tag
if git tag | grep -qx "$TAG"; then
  die "Tag $TAG already exists. Delete it first: git tag -d $TAG"
fi

bold "Building release $TAG"

# ── update package.json version ──────────────────────────────────────────────

CURRENT_VERSION="$(node -p "require('./package.json').version")"
if [[ "$CURRENT_VERSION" != "$VERSION" ]]; then
  step "Updating package.json version: $CURRENT_VERSION → $VERSION"
  npm version "$VERSION" --no-git-tag-version --allow-same-version
  git add package.json package-lock.json
  git commit -m "chore: bump version to $VERSION"
fi

# ── build ────────────────────────────────────────────────────────────────────

step "Installing dependencies"
npm ci --prefer-offline 2>&1 | tail -3

step "Compiling TypeScript"
npm run build

step "Bundling (esbuild)"
npm run bundle

step "Packaging standalone binaries (pkg)"
npm run package

# ── assemble release artifacts ───────────────────────────────────────────────

step "Assembling release artifacts → $RELEASE_DIR"

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Platform archives
tar -czf "$RELEASE_DIR/ccmcp-$TAG-linux.tar.gz"  -C bin ccmcp-linux
tar -czf "$RELEASE_DIR/ccmcp-$TAG-macos.tar.gz"  -C bin ccmcp-macos
zip -j   "$RELEASE_DIR/ccmcp-$TAG-win.zip"            bin/ccmcp-win.exe

# Checksums
(cd "$RELEASE_DIR" && sha256sum ./* > SHA256SUMS.txt)

echo
printf '  %-40s %s\n' "File" "Size"
printf '  %-40s %s\n' "----" "----"
while IFS= read -r f; do
  printf '  %-40s %s\n' "$(basename "$f")" "$(du -sh "$f" | cut -f1)"
done < <(find "$RELEASE_DIR" -type f | sort)

# ── git tag ──────────────────────────────────────────────────────────────────

step "Creating annotated git tag $TAG"

CHECKSUMS="$(cat "$RELEASE_DIR/SHA256SUMS.txt")"

git tag -a "$TAG" -m "$(cat <<EOF
Release $TAG

Artifacts:
  ccmcp-$TAG-linux.tar.gz
  ccmcp-$TAG-macos.tar.gz
  ccmcp-$TAG-win.zip

SHA256 checksums:
$CHECKSUMS
EOF
)"

green "Tag $TAG created → $(git rev-parse "$TAG")"

# ── optional: push + GitHub Release ──────────────────────────────────────────

if $PUSH; then
  step "Pushing tag to origin"
  git push origin "$TAG"

  step "Creating GitHub Release"
  gh release create "$TAG" \
    "$RELEASE_DIR/ccmcp-$TAG-linux.tar.gz" \
    "$RELEASE_DIR/ccmcp-$TAG-macos.tar.gz" \
    "$RELEASE_DIR/ccmcp-$TAG-win.zip" \
    "$RELEASE_DIR/SHA256SUMS.txt" \
    --title "$TAG" \
    --notes "$(git tag -l --format='%(contents)' "$TAG")"

  green "GitHub Release published: $(gh release view "$TAG" --json url -q .url)"
fi

# ── summary ──────────────────────────────────────────────────────────────────

printf '\n'
bold "Release $TAG is ready."
echo "  Tag:      $(git rev-parse "$TAG")"
echo "  Artifacts: $RELEASE_DIR/"
if ! $PUSH; then
  echo
  yellow "To publish to GitHub:"
  echo "  git push origin $TAG"
  echo "  gh release create $TAG $RELEASE_DIR/* --title \"$TAG\""
fi
