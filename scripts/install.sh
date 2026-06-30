#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# install.sh — install or uninstall ccmcp
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/iambpn/ccmcp/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/iambpn/ccmcp/main/scripts/install.sh | bash -s -- --uninstall
# ---------------------------------------------------------------------------

REPO="iambpn/ccmcp"
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

UNINSTALL=false

for arg in "$@"; do
  case "$arg" in
    --uninstall) UNINSTALL=true ;;
    --help|-h)
      echo "Usage: install.sh [--uninstall]"
      echo ""
      echo "  --uninstall   Remove ccmcp from $INSTALL_DIR"
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
    *)       die "Unsupported OS: $os. Windows users: download the .exe from https://github.com/$REPO/releases" ;;
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

# ── detect if already installed ──────────────────────────────────────────────

already_installed() {
  [[ -f "$INSTALL_DIR/$BINARY_NAME" ]]
}

# ── fetch latest release info ────────────────────────────────────────────────

fetch_latest_version() {
  local api_url="https://api.github.com/repos/$REPO/releases/latest"
  local version

  if command -v curl >/dev/null 2>&1; then
    version="$(curl -fsSL "$api_url" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  elif command -v wget >/dev/null 2>&1; then
    version="$(wget -qO- "$api_url" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  else
    die "curl or wget is required to download releases"
  fi

  [[ -n "$version" ]] || die "Could not determine latest version. Check https://github.com/$REPO/releases"
  echo "$version"
}

download_file() {
  local url="$1"
  local dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --progress-bar -o "$dest" "$url"
  else
    wget -q --show-progress -O "$dest" "$url"
  fi
}

# ── install ──────────────────────────────────────────────────────────────────

install() {
  step "Fetching latest release"
  local version
  version="$(fetch_latest_version)"
  bold "Latest version: $version"

  local archive_name="ccmcp-${version}-${PLATFORM}.tar.gz"
  local download_url="https://github.com/$REPO/releases/download/${version}/${archive_name}"
  local checksum_url="https://github.com/$REPO/releases/download/${version}/SHA256SUMS.txt"

  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  step "Downloading $archive_name"
  download_file "$download_url" "$tmp_dir/$archive_name"

  step "Verifying checksum"
  download_file "$checksum_url" "$tmp_dir/SHA256SUMS.txt"

  # Verify — sha256sum on Linux, shasum on macOS
  local actual_sum
  if command -v sha256sum >/dev/null 2>&1; then
    actual_sum="$(sha256sum "$tmp_dir/$archive_name" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual_sum="$(shasum -a 256 "$tmp_dir/$archive_name" | awk '{print $1}')"
  else
    yellow "Warning: neither sha256sum nor shasum found — skipping checksum verification"
    actual_sum=""
  fi

  if [[ -n "$actual_sum" ]]; then
    local expected_sum
    expected_sum="$(grep "$archive_name" "$tmp_dir/SHA256SUMS.txt" | awk '{print $1}')"
    if [[ -z "$expected_sum" ]]; then
      yellow "Warning: checksum entry not found in SHA256SUMS.txt — skipping verification"
    elif [[ "$actual_sum" != "$expected_sum" ]]; then
      die "Checksum mismatch for $archive_name\n  expected: $expected_sum\n  got:      $actual_sum"
    else
      green "Checksum verified"
    fi
  fi

  step "Installing to $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"

  tar -xzf "$tmp_dir/$archive_name" -C "$tmp_dir"

  local binary_in_archive="ccmcp-${PLATFORM}"
  local extracted="$tmp_dir/$binary_in_archive"

  [[ -f "$extracted" ]] || die "Expected binary '$binary_in_archive' not found in archive"

  chmod +x "$extracted"
  mv "$extracted" "$INSTALL_DIR/$BINARY_NAME"

  green "Installed ccmcp $version → $INSTALL_DIR/$BINARY_NAME"
}

# ── path hint ────────────────────────────────────────────────────────────────

path_hint() {
  # Check if INSTALL_DIR is already on PATH
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) return ;;
  esac

  yellow ""
  yellow "$INSTALL_DIR is not in your PATH."
  yellow "Add the following line to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
  yellow ""
  printf '    export PATH="%s:$PATH"\n' "$INSTALL_DIR"
  yellow ""
  yellow "Then restart your shell or run:"
  yellow ""
  printf '    source ~/.bashrc   # or ~/.zshrc\n'
  yellow ""
}

# ── main ─────────────────────────────────────────────────────────────────────

if $UNINSTALL; then
  uninstall
  exit 0
fi

if already_installed; then
  local_version="$("$INSTALL_DIR/$BINARY_NAME" --version 2>/dev/null || echo "unknown")"
  yellow "ccmcp is already installed at $INSTALL_DIR/$BINARY_NAME (version: $local_version)"
  printf 'Reinstall / upgrade? [y/N] '
  read -r answer </dev/tty
  case "$answer" in
    [Yy]*) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

install
path_hint

printf '\n'
bold "Done! Run 'ccmcp --help' to get started."
