"""
Basic Authentication Middleware for Posterizarr Web UI

"""

from fastapi import Request, HTTPException, status
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
import base64
import secrets
import logging
from pathlib import Path

auth_logger = logging.getLogger("posterizarr.auth")
auth_logger.setLevel(logging.WARNING)

if not auth_logger.handlers:
    try:
        if Path("/.dockerenv").exists():
            LOGS_DIR = Path("/config/UILogs")
        else:
            LOGS_DIR = Path(__file__).parent.parent.parent / "UILogs"

        LOGS_DIR.mkdir(exist_ok=True)
        auth_log_path = LOGS_DIR / "Auth.log"

        auth_handler = logging.FileHandler(auth_log_path, encoding="utf-8")
        auth_handler.setFormatter(
            logging.Formatter(
                "[%(asctime)s] [%(levelname)-8s] |AUTH| %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        auth_logger.addHandler(auth_handler)

        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.WARNING)
        auth_logger.addHandler(console_handler)

        print(f"✅ Auth logger initialized: {auth_log_path}")

    except Exception as e:
        print(f"⚠️ Could not initialize auth logger: {e}")

# Fallback logger für Kompatibilität
logger = auth_logger


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """
    Basic Authentication Middleware

    """

    def __init__(self, app, username: str, password: str, enabled: bool = False):
        super().__init__(app)
        self.username = username
        self.password = password
        self.enabled = enabled

        if self.enabled:
            auth_logger.info("🔒 Basic Auth ENABLED")
        else:
            auth_logger.info("🔓 Basic Auth DISABLED")

    async def dispatch(self, request: Request, call_next):
        # Wenn Basic Auth deaktiviert ist, einfach durchlassen
        if not self.enabled:
            return await call_next(request)

        # Auth-Check-Endpoint immer erlauben (für Frontend-Check)
        if request.url.path == "/api/auth/check":
            return await call_next(request)

        # Prüfe Authorization Header
        auth_header = request.headers.get("Authorization")
        client_ip = request.client.host if request.client else "unknown"

        if not auth_header or not auth_header.startswith("Basic "):
            auth_logger.warning(
                f"⚠️ Unauthorized access attempt | IP: {client_ip} | Path: {request.url.path}"
            )
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
                auth_logger.info(
                    f"✅ Successful authentication | User: {username} | IP: {client_ip} | Path: {request.url.path}"
                )
                response = await call_next(request)
                return response
            else:
                # Auth fehlgeschlagen
                auth_logger.warning(
                    f"❌ Failed authentication | User: {username} | IP: {client_ip} | Path: {request.url.path}"
                )
                return self._unauthorized_response()

        except Exception as e:
            auth_logger.error(f"⚠️ Auth error: {e}")
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
    Returns:
        dict mit 'enabled', 'username', 'password'
    """
    import json
    from pathlib import Path

    try:
        config_file = Path(config_path)
        if not config_file.exists():
            auth_logger.warning("Config file not found, using default auth settings")
            return {"enabled": False, "username": "admin", "password": "posterizarr"}

        with open(config_file, "r", encoding="utf-8") as f:
            config = json.load(f)

        # Suche nach WebUI-Section
        webui_config = config.get("WebUI", {})

        # Hole enabled Wert und konvertiere String-Booleans korrekt
        enabled_value = webui_config.get("basicAuthEnabled", False)

        # Behandle String-Werte explizit (für Rückwärtskompatibilität mit älteren Configs)
        if isinstance(enabled_value, str):
            # "true", "True", "1", "yes" -> True
            # "false", "False", "0", "no", "" -> False
            enabled = enabled_value.lower() in ["true", "1", "yes"]
            auth_logger.info(
                f"Converted string value '{enabled_value}' to boolean: {enabled}"
            )
        else:
            # Bereits ein Boolean oder anderer Typ
            enabled = bool(enabled_value)

        return {
            "enabled": enabled,  # Garantiert ein Boolean-Wert
            "username": webui_config.get("basicAuthUsername", "admin"),
            "password": webui_config.get("basicAuthPassword", "posterizarr"),
        }

    except Exception as e:
        auth_logger.error(f"Error loading auth config: {e}")
        return {"enabled": False, "username": "admin", "password": "posterizarr"}
