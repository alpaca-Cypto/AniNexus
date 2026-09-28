import importlib.util
import io
import json
import subprocess
from pathlib import Path

import pytest


def _backup_module():
    path = Path(__file__).resolve().parents[2] / "ops" / "backup.py"
    spec = importlib.util.spec_from_file_location("aninexus_backup", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_backup_destination_requires_named_remote_directory() -> None:
    backup = _backup_module()
    assert backup.remote_destination("offsite:aninexus/daily", "dump.sql.age") == (
        "offsite:aninexus/daily/dump.sql.age"
    )
    for unsafe in ("", "offsite:", "C:\\local", ":folder", "offsite:folder\nother"):
        with pytest.raises(ValueError):
            backup.remote_destination(unsafe, "dump.sql.age")


def test_backup_dump_is_streamed_into_encryption() -> None:
    backup = _backup_module()
    assert "--single-transaction" in backup.DUMP_COMMAND
    assert "--no-tablespaces" in backup.DUMP_COMMAND
    assert "mysql_root_password" in backup.DUMP_COMMAND
    assert "--password=" not in backup.DUMP_COMMAND


def test_backup_uploads_only_encrypted_archive_and_verifies_size(monkeypatch) -> None:
    backup = _backup_module()
    monkeypatch.setattr(backup, "preflight", lambda: None)
    uploaded: list[str] = []

    class FakeDump:
        stdout = io.BytesIO(b"CREATE DATABASE aninexus;")

        def wait(self, timeout=None):
            return 0

        def kill(self):
            return None

    monkeypatch.setattr(backup.subprocess, "Popen", lambda *_args, **_kwargs: FakeDump())

    def fake_run(command, **_kwargs):
        if command[0] == "age":
            assert command[1] == "-r"
            assert command[3] == "-o"
            Path(command[4]).write_bytes(b"encrypted-backup")
            return subprocess.CompletedProcess(command, 0)
        if command[1] == "copyto":
            assert Path(command[2]).read_bytes() == b"encrypted-backup"
            uploaded.append(command[3])
            return subprocess.CompletedProcess(command, 0)
        if command[1] == "lsjson":
            return subprocess.CompletedProcess(
                command, 0, stdout=json.dumps({"Size": len(b"encrypted-backup")})
            )
        raise AssertionError(command)

    monkeypatch.setattr(backup.subprocess, "run", fake_run)
    destination = backup.backup(
        "offsite:aninexus", "age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"
    )
    assert uploaded == [destination]
    assert destination.startswith("offsite:aninexus/aninexus-")
