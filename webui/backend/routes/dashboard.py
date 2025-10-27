"""
Dashboard Router
============================================================

Combined dashboard data endpoint

Endpoints:
- GET /api/dashboard/all
"""

from fastapi import APIRouter
import logging

router = APIRouter(tags=["dashboard"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
SCHEDULER_AVAILABLE = False
scheduler = None
get_status_func = None
get_version_func = None


def setup_dependencies(
    scheduler_available: bool, scheduler_instance, get_status, get_version
):
    """Initialize dashboard router dependencies"""
    global SCHEDULER_AVAILABLE, scheduler, get_status_func, get_version_func
    SCHEDULER_AVAILABLE = scheduler_available
    scheduler = scheduler_instance
    get_status_func = get_status
    get_version_func = get_version


@router.get("/api/dashboard/all")
async def get_dashboard_all():
    """
    Combined endpoint for all dashboard data - reduces HTTP requests from 4 to 1
    Returns: status, version, scheduler_status, system_info
    """
    result = {
        "success": True,
        "status": None,
        "version": None,
        "scheduler_status": None,
        "system_info": None,
    }

    # Fetch status (always required)
    try:
        status_response = await get_status_func()
        result["status"] = status_response
    except Exception as e:
        logger.error(f"Error fetching status in dashboard/all: {e}")
        result["status"] = {
            "running": False,
            "last_logs": [],
            "script_exists": False,
            "config_exists": False,
        }

    # Fetch version (cached, so fast)
    try:
        version_response = await get_version_func()
        result["version"] = version_response
    except Exception as e:
        logger.error(f"Error fetching version in dashboard/all: {e}")
        result["version"] = {"local": None, "remote": None}

    # Fetch scheduler status (if available)
    if SCHEDULER_AVAILABLE and scheduler:
        try:
            scheduler_status = scheduler.get_status()
            result["scheduler_status"] = {
                "success": True,
                "enabled": scheduler_status.get("enabled", False),
                "running": scheduler_status.get("running", False),
                "is_executing": scheduler_status.get("is_executing", False),
                "schedules": scheduler_status.get("schedules", []),
                "next_run": scheduler_status.get("next_run"),
                "timezone": scheduler_status.get("timezone"),
            }
        except Exception as e:
            logger.error(f"Error getting scheduler status in dashboard/all: {e}")
            result["scheduler_status"] = {
                "success": False,
                "enabled": False,
                "error": str(e),
            }
    else:
        result["scheduler_status"] = {
            "success": False,
            "enabled": False,
            "error": "Scheduler not available",
        }

    return result
