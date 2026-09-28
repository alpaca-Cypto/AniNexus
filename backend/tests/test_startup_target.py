"""The one-click launcher must select the isolated production preview database."""

import os
import subprocess
from pathlib import Path

import pytest


@pytest.mark.skipif(os.name != "nt", reason="Windows launcher")
@pytest.mark.parametrize("launcher", ["start.cmd", "start-docker.cmd"])
def test_one_click_launcher_selects_production_compose(launcher: str, tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[2]
    password = tmp_path / "mysql_password"
    root_password = tmp_path / "mysql_root_password"
    password.write_text("test-only-password", encoding="utf-8")
    root_password.write_text("test-only-root-password", encoding="utf-8")
    env_file = tmp_path / ".env.production.local"
    env_file.write_text(
        f"ANINEXUS_MYSQL_PASSWORD_FILE={password}\n"
        f"ANINEXUS_MYSQL_ROOT_PASSWORD_FILE={root_password}\n"
        "OWNER_USER_ID=1\n",
        encoding="utf-8",
    )
    (tmp_path / "docker.cmd").write_text("@echo off\r\nexit /b 0\r\n", encoding="utf-8")
    environment = os.environ.copy()
    environment["PATH"] = f"{tmp_path}{os.pathsep}{environment['PATH']}"
    result = subprocess.run(
        ["cmd.exe", "/c", str(root / launcher), "-CheckOnly", "-EnvFile", str(env_file)],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "compose.production.yaml" in result.stdout
    assert "compose.production.local-secrets.yaml" in result.stdout
    assert ".env.production.local" in result.stdout

    (tmp_path / "docker.cmd").write_text(
        '@echo off\r\necho %* | findstr /C:" run " >nul\r\n'
        'if not errorlevel 1 exit /b 1\r\nexit /b 0\r\n',
        encoding="utf-8",
    )
    failed = subprocess.run(
        [
            "powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
            "-File", str(root / "scripts" / "start-docker.ps1"),
            "-CheckOnly", "-EnvFile", str(env_file),
        ],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert failed.returncode == 1
    assert "Docker cannot read the MySQL passwords from its private volume" in failed.stdout
