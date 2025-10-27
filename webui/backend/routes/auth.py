"""
Auth Router
============================================================

Authentication and root API endpoint
"""

from fastapi import APIRouter
import logging

router = APIRouter(prefix="/api", tags=["auth"])
logger = logging.getLogger(__name__)

# Module availability will be set by main.py
AUTH_MIDDLEWARE_AVAILABLE = False
CONFIG_PATH = None
load_auth_config = None


@router.get("")
async def api_root():
    """Root API endpoint"""
    return {"message": "Posterizarr Web UI API", "status": "running"}


@router.get("/auth/check")
async def check_auth():
    """
    Check if Basic Auth is enabled and if user is authenticated.
    This endpoint is always accessible (not protected by auth middleware).
    """
    if AUTH_MIDDLEWARE_AVAILABLE:
        try:
            auth_config = load_auth_config(CONFIG_PATH)
            return {
                "enabled": auth_config["enabled"],
                "authenticated": True,
            }
        except Exception as e:
            logger.error(f"Error checking auth config: {e}")
            return {"enabled": False, "authenticated": True, "error": str(e)}
    else:
        return {"enabled": False, "authenticated": True}
