#!/usr/bin/env bash
# Copy every skill from ./skills into your personal Claude Code skills folder
# (~/.claude/skills), so they work in all your projects.
#   ./install.sh           add skills that aren't installed yet
#   ./install.sh --force   also overwrite skills with the same name
set -euo pipefail

src="$(cd "$(dirname "$0")" && pwd)/skills"
dest="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
force="${1:-}"

mkdir -p "$dest"
for dir in "$src"/*/; do
  name="$(basename "$dir")"
  if [ -e "$dest/$name" ] && [ "$force" != "--force" ]; then
    echo "skip   $name (already exists — run with --force to overwrite)"
    continue
  fi
  rm -rf "${dest:?}/$name"
  cp -R "$dir" "$dest/$name"
  echo "added  $name"
done
echo "Done: $dest. Start a new Claude Code session to use the skills."
