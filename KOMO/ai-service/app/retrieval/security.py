import hmac
import os

from fastapi import Header, HTTPException


def require_internal_token(x_internal_token: str = Header(default="")):
    expected = os.getenv("AI_INTERNAL_TOKEN", "")
    if len(expected) < 32:
        raise HTTPException(503, "Internal authentication is not configured")
    if not hmac.compare_digest(expected, x_internal_token):
        raise HTTPException(403, "Internal service access required")
