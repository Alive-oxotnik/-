#!/usr/bin/env python3
"""Pack every skill in ../skills into dist/<name>.zip for upload to claude.ai.

Each archive holds one skill folder at its root (<name>/SKILL.md, ...), which is
the layout claude.ai expects. Run after editing a skill:  python3 scripts/build_dist.py
"""
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS = ROOT / "skills"
DIST = ROOT / "dist"
SKIP_DIRS = {"__pycache__", "node_modules", ".git"}
SKIP_FILES = {".DS_Store"}


def check(skill: Path) -> str | None:
    """Return an error message if the skill would be rejected, else None."""
    md = skill / "SKILL.md"
    if not md.is_file():
        return "no SKILL.md"
    match = re.match(r"^---\n(.*?)\n---", md.read_text(encoding="utf-8"), re.S)
    if not match:
        return "SKILL.md has no YAML frontmatter"
    front = match.group(1)
    name = re.search(r"^name:\s*(.+)$", front, re.M)
    desc = re.search(r"^description:\s*(.+)$", front, re.M)
    if not name or not desc:
        return "frontmatter needs name and description"
    if name.group(1).strip() != skill.name:
        return f"name '{name.group(1).strip()}' differs from folder name"
    if len(desc.group(1).strip()) > 1024:
        return "description longer than 1024 characters"
    return None


def main() -> int:
    DIST.mkdir(exist_ok=True)
    for old in DIST.glob("*.zip"):
        old.unlink()
    failed = False
    for skill in sorted(p for p in SKILLS.iterdir() if p.is_dir()):
        error = check(skill)
        if error:
            print(f"✗ {skill.name}: {error}")
            failed = True
            continue
        target = DIST / f"{skill.name}.zip"
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
            for file in sorted(skill.rglob("*")):
                rel = file.relative_to(SKILLS)
                if file.is_dir() or file.name in SKIP_FILES or SKIP_DIRS & set(rel.parts):
                    continue
                zf.write(file, rel.as_posix())
        print(f"✓ {target.relative_to(ROOT)}  ({target.stat().st_size // 1024} KB)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
