"""
Basic Authentication Middleware for Posterizarr Web UI
Version 2 - Blocks EVERYTHING including static files
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import Response, HTMLResponse
from starlette.middleware.base import BaseHTTPMiddleware
import base64
import secrets
import logging
from pathlib import Path
import json

# ============================================================================
# LOGGER SETUP
# ============================================================================
auth_logger = logging.getLogger("posterizarr.auth")
auth_logger.setLevel(logging.INFO)

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
        console_handler.setLevel(logging.INFO)
        auth_logger.addHandler(console_handler)

        print(f"✅ Auth logger initialized: {auth_log_path}")

    except Exception as e:
        print(f"⚠️ Could not initialize auth logger: {e}")

logger = auth_logger


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """
    Basic Authentication Middleware with dynamic config reload
    Blocks ALL requests including static files when enabled
    """

    def __init__(self, app, config_path: Path):
        super().__init__(app)
        self.config_path = config_path

        # Load initial config
        auth_config = self._load_config()
        self.username = auth_config["username"]
        self.password = auth_config["password"]
        self.enabled = auth_config["enabled"]

        if self.enabled:
            auth_logger.info("🔒 Basic Auth ENABLED on startup (Full blocking mode)")
            auth_logger.info(f"   Username: {self.username}")
        else:
            auth_logger.info("🔓 Basic Auth DISABLED on startup")

    def _load_config(self) -> dict:
        """
        Loads the auth config dynamically from config.json
        """
        try:
            if not self.config_path.exists():
                auth_logger.warning(
                    "Config file not found, using default auth settings"
                )
                return {
                    "enabled": False,
                    "username": "admin",
                    "password": "posterizarr",
                }

            with open(self.config_path, "r", encoding="utf-8") as f:
                config = json.load(f)

            webui_config = config.get("WebUI", {})
            enabled_value = webui_config.get("basicAuthEnabled", False)

            if isinstance(enabled_value, str):
                enabled = enabled_value.lower() in ["true", "1", "yes"]
            else:
                enabled = bool(enabled_value)

            return {
                "enabled": enabled,
                "username": webui_config.get("basicAuthUsername", "admin"),
                "password": webui_config.get("basicAuthPassword", "posterizarr"),
            }

        except Exception as e:
            auth_logger.error(f"Error loading auth config: {e}")
            return {"enabled": False, "username": "admin", "password": "posterizarr"}

    async def dispatch(self, request: Request, call_next):
        # Load config dynamically on every request
        current_config = self._load_config()
        current_enabled = current_config["enabled"]
        current_username = current_config["username"]
        current_password = current_config["password"]

        # Update internal variables if something has changed
        if current_enabled != self.enabled:
            self.enabled = current_enabled
            self.username = current_username
            self.password = current_password

            if self.enabled:
                auth_logger.info("🔄 Auth Status Changed: ENABLED (Full blocking mode)")
                auth_logger.info(f"   Username: {self.username}")
            else:
                auth_logger.info("🔄 Auth Status Changed: DISABLED")

        # If Basic Auth is disabled, allow through
        if not self.enabled:
            return await call_next(request)

        # ✅ Always allow auth-check endpoint (for frontend status check)
        if request.url.path == "/api/auth/check":
            return await call_next(request)

        # ✅ IMPORTANT: Block EVERYTHING - including static files!
        # No exceptions for HTML, JS, CSS, etc.
        client_ip = request.client.host if request.client else "unknown"

        # Check Authorization Header
        auth_header = request.headers.get("Authorization")

        if not auth_header or not auth_header.startswith("Basic "):
            auth_logger.warning(
                f"⚠️ Unauthorized access | IP: {client_ip} | Path: {request.url.path}"
            )
            return self._unauthorized_response()

        try:
            # Decode Base64 credentials
            credentials = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = credentials.split(":", 1)

            # Use secrets.compare_digest for timing-safe comparison
            username_match = secrets.compare_digest(username, current_username)
            password_match = secrets.compare_digest(password, current_password)

            if username_match and password_match:
                # Auth successful - only log on first successful login
                if request.url.path == "/":
                    auth_logger.info(
                        f"✅ Successful login | User: {username} | IP: {client_ip}"
                    )
                response = await call_next(request)
                return response
            else:
                # Auth failed
                auth_logger.warning(
                    f"❌ Failed login attempt | User: {username} | IP: {client_ip}"
                )
                return self._unauthorized_response()

        except Exception as e:
            auth_logger.error(f"⚠️ Auth error: {e}")
            return self._unauthorized_response()

    def _unauthorized_response(self):
        """
        Returns 401 Unauthorized Response
        Browser automatically shows the login popup
        """
        return Response(
            content="Unauthorized - Authentication required",
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={
                "WWW-Authenticate": 'Basic realm="Posterizarr Web UI"',
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        )


def load_auth_config(config_path) -> dict:
    """
    Legacy function for backward compatibility
    """
    try:
        config_file = Path(config_path)
        if not config_file.exists():
            auth_logger.warning("Config file not found, using default auth settings")
            return {"enabled": False, "username": "admin", "password": "posterizarr"}

        with open(config_file, "r", encoding="utf-8") as f:
            config = json.load(f)

        webui_config = config.get("WebUI", {})
        enabled_value = webui_config.get("basicAuthEnabled", False)

        if isinstance(enabled_value, str):
            enabled = enabled_value.lower() in ["true", "1", "yes"]
            auth_logger.info(
                f"Converted string value '{enabled_value}' to boolean: {enabled}"
            )
        else:
            enabled = bool(enabled_value)

        return {
            "enabled": enabled,
            "username": webui_config.get("basicAuthUsername", "admin"),
            "password": webui_config.get("basicAuthPassword", "posterizarr"),
        }

    except Exception as e:
        auth_logger.error(f"Error loading auth config: {e}")
        return {"enabled": False, "username": "admin", "password": "posterizarr"}
