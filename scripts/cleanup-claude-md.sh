#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $(basename "$0") [--dry-run]"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
elif [[ -n "${1:-}" ]]; then
  usage
  exit 1
fi

script_dir=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$script_dir/.." && pwd)

root_claude_upper="$repo_root/CLAUDE.md"
root_claude_lower="$repo_root/claude.md"

targets=()
while IFS= read -r file_path; do
  targets+=("$file_path")
done < <(
  find "$repo_root" \
    -type f \
    -iname 'claude.md' \
    ! -path "$root_claude_upper" \
    ! -path "$root_claude_lower" \
    -print
)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "No matching files found."
  exit 0
fi

if $DRY_RUN; then
  echo "Would delete:"
  printf '%s\n' "${targets[@]}"
  exit 0
fi

echo "Deleting:"
printf '%s\n' "${targets[@]}"

rm -f -- "${targets[@]}"
