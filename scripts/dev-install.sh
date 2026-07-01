#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# dev-install.sh — build ccmcp from local source and install it exactly like
# the prod install.sh does, so a dev build can be exercised end-to-end.
#
# Usage:
#   ./scripts/dev-install.sh              # build + install for this platform
#   ./scripts/dev-install.sh --skip-build # reuse existing bin/ccmcp-<platform>
#   ./scripts/dev-install.sh --uninstall  # remove the dev install
#
# Env:
#   CCMCP_INSTALL_DIR   install location (default: $HOME/.local/bin)
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

INSTALL_DIR="${CCMCP_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="ccmcp"

# ── helpers ──────────────────────────────────────────────────────────────────

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n'  "$*"; }
step()   { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die()    { red "error: $*" >&2; exit 1; }

# ── argument parsing ─────────────────────────────────────────────────────────

SKIP_BUILD=false
UNINSTALL=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --uninstall)  UNINSTALL=true ;;
    --help|-h)
      echo "Usage: dev-install.sh [--skip-build] [--uninstall]"
      echo ""
      echo "  --skip-build   Install the binary already in bin/ without rebuilding"
      echo "  --uninstall    Remove the dev install from $INSTALL_DIR"
      exit 0
      ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ── detect platform ──────────────────────────────────────────────────────────

detect_platform() {
  local os
  os="$(uname -s 2>/dev/null || echo "unknown")"
  case "$os" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    *)       die "Unsupported OS: $os. Build and install manually on Windows." ;;
  esac
}

PLATFORM="$(detect_platform)"

# ── uninstall ────────────────────────────────────────────────────────────────

uninstall() {
  local target="$INSTALL_DIR/$BINARY_NAME"
  if [[ ! -f "$target" ]]; then
    yellow "ccmcp is not installed at $target"
    exit 0
  fi
  step "Uninstalling ccmcp"
  rm -f "$target"
  green "Removed $target"
}

if $UNINSTALL; then
  uninstall
  exit 0
fi

# ── build ────────────────────────────────────────────────────────────────────

command -v node >/dev/null 2>&1 || die "node not found"
command -v npm  >/dev/null 2>&1 || die "npm not found"

if $SKIP_BUILD; then
  yellow "Skipping build — reusing existing bin/ccmcp-$PLATFORM"
else
  step "Installing dependencies"
  npm ci --prefer-offline 2>&1 | tail -3

  step "Compiling TypeScript"
  npm run build

  step "Bundling (esbuild)"
  npm run bundle

  step "Packaging standalone binaries (pkg)"
  npm run package
fi

BUILT_BINARY="bin/ccmcp-$PLATFORM"
[[ -f "$BUILT_BINARY" ]] || die "Expected binary '$BUILT_BINARY' not found. Run without --skip-build first."

# ── install ──────────────────────────────────────────────────────────────────

step "Installing dev build to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

chmod +x "$BUILT_BINARY"
cp "$BUILT_BINARY" "$INSTALL_DIR/$BINARY_NAME"

VERSION="$(node -p "require('./package.json').version")"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
DIRTY=""
git diff --quiet 2>/dev/null || DIRTY="-dirty"

green "Installed ccmcp $VERSION (dev build, $GIT_SHA$DIRTY) → $INSTALL_DIR/$BINARY_NAME"

# ── path hint ────────────────────────────────────────────────────────────────

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    yellow ""
    yellow "$INSTALL_DIR is not in your PATH."
    yellow "Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    yellow ""
    printf '    export PATH="%s:$PATH"\n' "$INSTALL_DIR"
    ;;
esac

printf '\n'
bold "Done! Run 'ccmcp --help' to try the dev build."
