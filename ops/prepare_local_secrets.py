"""Create one-time database passwords for a local production preview.

The passwords are never printed and existing secret files are never replaced.
Run with a directory outside the repository, ideally in the user's profile.
"""

from __future__ import annotations

import argparse
import os
import secrets
from pathlib import Path


def create_secret(path: Path) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as secret_file:
            secret_file.write(secrets.token_urlsafe(48) + "\n")
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    arguments = parser.parse_args()
    if arguments.directory.is_symlink():
        parser.error("Secret directory must not be a symlink")
    directory = arguments.directory.resolve()
    directory.mkdir(parents=True, mode=0o700, exist_ok=True)
    paths = [directory / "mysql_password", directory / "mysql_root_password"]
    if any(path.exists() or path.is_symlink() for path in paths):
        parser.error("Secret files already exist; refusing to replace them")
    for path in paths:
        create_secret(path)
    print(f"Created two password files in {directory}; values were not displayed")


if __name__ == "__main__":
    main()
