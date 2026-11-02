"""
Create the root .env for Glimpse from .env.example.

    uv run setup.py          # write .env with defaults, fill keys later
    uv run setup.py --it     # prompt for each value interactively

Existing values in .env are kept, so re-running is safe. Variables in .env
that are not in .env.example are preserved at the end of the file.
"""

import argparse
import getpass
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TEMPLATE = ROOT / ".env.example"
ENV_FILE = ROOT / ".env"

LINE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$")

# Template values starting with this are placeholders, not real defaults.
PLACEHOLDER_PREFIX = "your-"


def is_placeholder(value: str) -> bool:
    return not value or value.startswith(PLACEHOLDER_PREFIX)


def is_secret(key: str) -> bool:
    return key.endswith(("_KEY", "_SECRET", "_TOKEN"))


def read_env(path: Path) -> dict[str, str]:
    values = {}
    if not path.exists():
        return values

    for line in path.read_text(encoding="utf8").splitlines():
        match = LINE.match(line)
        if match:
            values[match.group(1)] = match.group(2).strip()
    return values


def ask(key: str, current: str) -> str:
    required = is_placeholder(current)
    secret = is_secret(key)

    if required:
        hint = " (required)"
    elif secret:
        hint = " [keep current]"
    else:
        hint = f" [{current}]"

    prompt = f"{key}{hint}: "

    while True:
        value = (getpass.getpass(prompt) if secret else input(prompt)).strip()

        if value:
            return value
        if not required:
            return current

        print(f"  {key} is required.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create the Glimpse .env file from .env.example.",
    )
    parser.add_argument(
        "--it",
        action="store_true",
        help="prompt for each value interactively",
    )
    args = parser.parse_args()

    if not TEMPLATE.exists():
        print(f"Template not found: {TEMPLATE}", file=sys.stderr)
        return 1

    existing = read_env(ENV_FILE)
    template_keys = set()
    output = []
    missing = []

    if args.it:
        print("Press Enter to keep the value in brackets.\n")

    for line in TEMPLATE.read_text(encoding="utf8").splitlines():
        match = LINE.match(line)
        if not match:
            output.append(line)
            continue

        key, default = match.group(1), match.group(2).strip()
        template_keys.add(key)

        # Prefer the user's existing value over the template default.
        current = existing.get(key, default)
        if key in existing and is_placeholder(existing[key]):
            current = default

        if args.it:
            current = ask(key, current)

        if is_placeholder(current):
            missing.append(key)

        output.append(f"{key}={current}")

    extra = {k: v for k, v in existing.items() if k not in template_keys}
    if extra:
        output.append("")
        output.append("# Kept from the previous .env")
        output.extend(f"{k}={v}" for k, v in extra.items())

    ENV_FILE.write_text("\n".join(output) + "\n", encoding="utf8")

    action = "Updated" if existing else "Created"
    print(f"\n{action} {ENV_FILE}")

    if missing:
        print("Fill in before running Glimpse: " + ", ".join(missing))

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print("\nAborted. .env not changed.")
        sys.exit(1)
