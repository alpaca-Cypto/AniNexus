from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

PASSWORD_ITERATIONS = 310_000
CAPTCHA_ITERATIONS = 20_000


def _hash_secret(secret: str, iterations: int) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, iterations)
    return "$".join(
        (
            "pbkdf2_sha256",
            str(iterations),
            base64.urlsafe_b64encode(salt).decode(),
            base64.urlsafe_b64encode(digest).decode(),
        )
    )


def _verify_secret(secret: str, encoded: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = base64.urlsafe_b64decode(salt_text)
        expected = base64.urlsafe_b64decode(digest_text)
    except (TypeError, ValueError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", secret.encode(), salt, iterations)
    return hmac.compare_digest(actual, expected)


def hash_password(password: str) -> str:
    return _hash_secret(password, PASSWORD_ITERATIONS)


def verify_password(password: str, encoded: str) -> bool:
    return _verify_secret(password, encoded)


def hash_captcha(answer: str) -> str:
    return _hash_secret(answer.upper(), CAPTCHA_ITERATIONS)


def verify_captcha(answer: str, encoded: str) -> bool:
    return _verify_secret(answer.upper(), encoded)


def new_session_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
