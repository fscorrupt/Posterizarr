"""
Basic Authentication Middleware for Posterizarr Web UI
Einfache, schnelle Basic Auth Implementierung
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
import base64
import secrets
import logging

logger = logging.getLogger(__name__)


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """
    Basic Authentication Middleware

    Schützt alle Routen außer /api/auth/check mit Basic Auth.
    Kann in der config.json aktiviert/deaktiviert werden.
    """

    def __init__(self, app, username: str, password: str, enabled: bool = False):
        super().__init__(app)
        self.username = username
        self.password = password
        self.enabled = enabled

        if self.enabled:
            logger.info("🔒 Basic Auth is ENABLED")
        else:
            logger.info("🔓 Basic Auth is DISABLED")

    async def dispatch(self, request: Request, call_next):
        # Wenn Basic Auth deaktiviert ist, einfach durchlassen
        if not self.enabled:
            return await call_next(request)

        # Auth-Check-Endpoint immer erlauben (für Frontend-Check)
        if request.url.path == "/api/auth/check":
            return await call_next(request)

        # Prüfe Authorization Header
        auth_header = request.headers.get("Authorization")

        if not auth_header or not auth_header.startswith("Basic "):
            return self._unauthorized_response()

        try:
            # Dekodiere Base64 credentials
            credentials = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = credentials.split(":", 1)

            # Verwende secrets.compare_digest für timing-safe comparison
            username_match = secrets.compare_digest(username, self.username)
            password_match = secrets.compare_digest(password, self.password)

            if username_match and password_match:
                # Auth erfolgreich
                response = await call_next(request)
                return response
            else:
                return self._unauthorized_response()

        except Exception as e:
            logger.error(f"Basic Auth error: {e}")
            return self._unauthorized_response()

    def _unauthorized_response(self):
        """Gibt 401 Unauthorized Response zurück"""
        return Response(
            content="Unauthorized",
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": 'Basic realm="Posterizarr Web UI"'},
        )


def load_auth_config(config_path) -> dict:
    """
    Lädt Auth-Konfiguration aus config.json

    Returns:
        dict mit 'enabled', 'username', 'password'
    """
    import json
    from pathlib import Path

    try:
        config_file = Path(config_path)
        if not config_file.exists():
            logger.warning("Config file not found, using default auth settings")
            return {"enabled": False, "username": "admin", "password": "posterizarr"}

        with open(config_file, "r", encoding="utf-8") as f:
            config = json.load(f)

        # Suche nach WebUI-Section
        webui_config = config.get("WebUI", {})

        return {
            "enabled": webui_config.get("basicAuthEnabled", False),
            "username": webui_config.get("basicAuthUsername", "admin"),
            "password": webui_config.get("basicAuthPassword", "posterizarr"),
        }

    except Exception as e:
        logger.error(f"Error loading auth config: {e}")
        return {"enabled": False, "username": "admin", "password": "posterizarr"}
