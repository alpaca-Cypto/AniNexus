from __future__ import annotations

import os
from base64 import urlsafe_b64encode
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import HTTPException, status


def _cipher() -> Fernet:
    key_path = (
        os.getenv("BANGUMI_TOKEN_KEY_FILE", "").strip()
        or os.getenv("DATABASE_PASSWORD_FILE", "").strip()
    )
    if not key_path:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Bangumi Token 保存功能尚未配置")
    try:
        secret = Path(key_path).read_bytes().strip()
        if len(secret) < 32:
            raise ValueError("Secret must contain at least 32 bytes")
        key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"AniNexus Bangumi token storage v1",
            info=b"bangumi-credential-fernet",
        ).derive(secret)
        return Fernet(urlsafe_b64encode(key))
    except (OSError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Bangumi Token 加密密钥不可用"
        ) from exc


def encrypt_token(token: str) -> str:
    return _cipher().encrypt(token.encode("utf-8")).decode("ascii")


def decrypt_token(encrypted_token: str) -> str:
    try:
        return _cipher().decrypt(encrypted_token.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError) as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "已保存的 Bangumi Token 无法解密"
        ) from exc
