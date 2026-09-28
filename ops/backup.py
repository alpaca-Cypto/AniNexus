"""Encrypt a consistent AniNexus MySQL dump and upload it offsite.

Run this on the deployment host after configuring Docker Compose, age and
rclone. The unencrypted SQL is streamed directly into age, never written to
the host filesystem. This script does not delete any remote backups.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

COMPOSE_FILE = Path(__file__).resolve().parents[1] / "compose.production.yaml"
DUMP_COMMAND = (
    'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" '
    "exec mysqldump -uroot --single-transaction --quick --routines "
    "--triggers --events --no-tablespaces --set-gtid-purged=OFF "
    "--default-character-set=utf8mb4 --databases aninexus"
)


def remote_destination(remote: str, filename: str) -> str:
    name, separator, directory = remote.partition(":")
    if (
        not separator
        or not re.fullmatch(r"[A-Za-z0-9_-]{2,}", name)
        or not directory.strip("/")
        or directory.startswith("/")
        or "\\" in directory
        or ".." in directory.split("/")
    ):
        raise ValueError("--remote must be an rclone remote and directory, e.g. store:aninexus")
    if "\n" in directory or "\r" in directory:
        raise ValueError("--remote must not contain line breaks")
    return f"{name}:{directory.rstrip('/')}/{filename}"


def preflight() -> None:
    for command in ("docker", "age", "rclone"):
        if shutil.which(command) is None:
            raise RuntimeError(f"Required command is unavailable: {command}")
    if not COMPOSE_FILE.is_file():
        raise RuntimeError("Production Compose file is missing")
    for variable in ("ANINEXUS_MYSQL_PASSWORD_FILE", "ANINEXUS_MYSQL_ROOT_PASSWORD_FILE"):
        path = os.environ.get(variable, "")
        if not path or not Path(path).is_file():
            raise RuntimeError(f"{variable} must point to an existing secret file")


def backup(remote: str, recipient: str) -> str:
    if not re.fullmatch(r"age1[023456789acdefghjklmnpqrstuvwxyz]+", recipient):
        raise ValueError("--recipient must be an age public key")
    filename = f"aninexus-{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{secrets.token_hex(4)}.sql.age"
    destination = remote_destination(remote, filename)
    preflight()

    with tempfile.TemporaryDirectory(prefix="aninexus-encrypted-backup-") as temporary:
        encrypted_path = Path(temporary) / filename
        with tempfile.TemporaryFile() as dump_errors:
            dump = subprocess.Popen(
                ["docker", "compose", "-f", str(COMPOSE_FILE), "exec", "-T", "mysql", "sh", "-c", DUMP_COMMAND],
                stdout=subprocess.PIPE,
                stderr=dump_errors,
            )
            assert dump.stdout is not None
            try:
                encryption = subprocess.run(
                    ["age", "-r", recipient, "-o", str(encrypted_path)],
                    stdin=dump.stdout,
                    capture_output=True,
                    timeout=3600,
                    check=False,
                )
            except BaseException:
                dump.kill()
                dump.wait()
                raise
            finally:
                dump.stdout.close()
            dump_code = dump.wait(timeout=30)
            if dump_code != 0 or encryption.returncode != 0:
                raise RuntimeError(
                    f"Database dump or encryption failed (dump={dump_code}, age={encryption.returncode})"
                )

        local_size = encrypted_path.stat().st_size
        if local_size == 0:
            raise RuntimeError("Encrypted backup is empty")
        subprocess.run(
            ["rclone", "copyto", str(encrypted_path), destination, "--retries", "3"],
            capture_output=True,
            check=True,
            timeout=1800,
        )
        stat = subprocess.run(
            ["rclone", "lsjson", "--stat", destination],
            capture_output=True,
            text=True,
            check=True,
            timeout=60,
        )
        remote_size = json.loads(stat.stdout).get("Size")
        if remote_size != local_size:
            raise RuntimeError("Remote backup size differs from encrypted local archive")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--remote", required=True, help="rclone destination directory")
    parser.add_argument("--recipient", required=True, help="age public key (age1...)")
    args = parser.parse_args()
    try:
        destination = backup(args.remote, args.recipient)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        print(f"Backup failed: {exc}", file=sys.stderr)
        return 1
    print(f"Encrypted backup uploaded and size-verified: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
