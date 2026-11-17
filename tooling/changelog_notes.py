#!/usr/bin/env python3
"""Print one version's section of docs/changelog.md, for a GitHub release body.

docs/changelog.md is written one version after another, newest first, each
starting with `## <version> · <date>` and holding a `### 中文` and an
`### English` part. Its own header says the release body is that version's text
without the version heading line, which is what this prints.

    python3 tooling/changelog_notes.py 1.1.0-fork.1 > notes.md
    python3 tooling/changelog_notes.py 1.1.0-fork.1 --version   # tag-friendly name only

Exits 1 when the version has no section, so a release workflow can fall back
instead of publishing an empty body.
"""

import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHANGELOG = ROOT / "docs" / "changelog.md"
HEADING = re.compile(r"^##[ \t]+(\S+)(?:[ \t]*·.*)?$")


def sections(text: str) -> dict[str, str]:
    """{version: body} for every version heading in [text], body without the heading."""
    found: dict[str, str] = {}
    current: str | None = None
    body: list[str] = []
    for line in text.splitlines():
        match = HEADING.match(line)
        if match:
            if current is not None:
                found[current] = "\n".join(body).strip()
            current = match.group(1)
            body = []
            continue
        if current is not None:
            body.append(line)
    if current is not None:
        found[current] = "\n".join(body).strip()
    return found


def notes(version: str) -> str | None:
    """The release body for [version], or None when the changelog has no such section."""
    if not CHANGELOG.is_file():
        return None
    body = sections(CHANGELOG.read_text(encoding="utf-8")).get(version)
    return body or None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("version", nargs="?", help="version name as the changelog heading writes it, e.g. 1.1.0-fork.1")
    parser.add_argument("--list", action="store_true", help="list the versions the changelog has")
    args = parser.parse_args()

    if args.list:
        for version in sections(CHANGELOG.read_text(encoding="utf-8")):
            print(version)
        return 0
    if not args.version:
        parser.print_help(sys.stderr)
        return 2

    body = notes(args.version)
    if body is None:
        print(f"docs/changelog.md has no section for {args.version}", file=sys.stderr)
        return 1
    print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
