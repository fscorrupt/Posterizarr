"""
Runtime statistics and history router for Posterizarr Backend
Handles runtime stats, history display, JSON import
"""
import json
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends

from core.config import CONFIG_PATH, LOGS_DIR
from core.dependencies import get_runtime_db
from core.cache import cached

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["runtime"])


# Check if runtime database module is available
try:
    from runtime_db import RuntimeDatabase, import_json_to_db

    RUNTIME_DB_AVAILABLE = True
    runtime_db = RuntimeDatabase()
except ImportError:
    RUNTIME_DB_AVAILABLE = False
    runtime_db = None
    logger.warning("runtime_db module not available - runtime statistics disabled")


# Check if scheduler is available
try:
    from scheduler import SchedulerManager

    SCHEDULER_AVAILABLE = True
    scheduler = SchedulerManager()
except ImportError:
    SCHEDULER_AVAILABLE = False
    scheduler = None
    logger.warning("scheduler module not available - scheduler features disabled")


@router.get("/runtime-stats")
@cached(ttl=10)  # Cache for 10 seconds
async def get_runtime_stats():
    """
    Get last runtime statistics from database.
    Includes total images, breakdown by type, errors, and scheduler info.
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
                "runtime": None,
                "total_images": 0,
                "posters": 0,
                "seasons": 0,
                "backgrounds": 0,
                "titlecards": 0,
                "collections": 0,
                "errors": 0,
            }

        latest = runtime_db.get_latest_runtime()

        if not latest:
            return {
                "success": False,
                "message": "No runtime data available. Please run the script or import JSON files.",
                "runtime": None,
                "total_images": 0,
                "posters": 0,
                "seasons": 0,
                "backgrounds": 0,
                "titlecards": 0,
                "collections": 0,
                "errors": 0,
            }

        # Get scheduler information if available
        scheduler_info = {
            "enabled": False,
            "schedules": [],
            "next_run": None,
            "timezone": None,
        }

        if SCHEDULER_AVAILABLE and scheduler:
            try:
                scheduler_config = scheduler.get_config()
                if scheduler_config and scheduler_config.get("enabled"):
                    scheduler_info["enabled"] = True
                    scheduler_info["schedules"] = scheduler_config.get("schedules", [])
                    scheduler_info["timezone"] = scheduler_config.get("timezone")
                    scheduler_info["next_run"] = scheduler.get_next_run_time()
            except Exception as e:
                logger.warning(f"Error getting scheduler info: {e}")

        return {
            "success": True,
            "runtime": latest["runtime"],
            "total_images": latest["total_images"],
            "posters": latest["posters"],
            "seasons": latest["seasons"],
            "backgrounds": latest["backgrounds"],
            "titlecards": latest["titlecards"],
            "collections": latest["collections"],
            "errors": latest["errors"],
            "timestamp": latest["timestamp"],
            "mode": latest.get("mode", "normal"),
            "scheduler": scheduler_info,
        }

    except Exception as e:
        logger.error(f"Error getting runtime stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runtime-history")
@cached(ttl=60)  # Cache for 1 minute
async def get_runtime_history(limit: int = 10):
    """
    Get runtime history from database.
    Returns last N runtime entries with timestamps.

    Args:
        limit: Number of entries to return (default: 10, max: 100)
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
                "history": [],
            }

        # Limit to reasonable range
        limit = min(max(1, limit), 100)

        history = runtime_db.get_runtime_history(limit=limit)

        return {"success": True, "history": history, "count": len(history)}

    except Exception as e:
        logger.error(f"Error getting runtime history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-runtime-json")
async def import_runtime_json():
    """
    Import runtime data from JSON files (normal.json, testing.json, etc.)
    Scans Logs directory and imports all found JSON runtime files.
    """
    try:
        if not RUNTIME_DB_AVAILABLE:
            return {
                "success": False,
                "message": "Runtime database not available",
            }

        # Import JSON files
        import_json_to_db(LOGS_DIR)

        return {
            "success": True,
            "message": "JSON files imported successfully",
        }

    except Exception as e:
        logger.error(f"Error importing JSON runtime data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runtime-migration-status")
@cached(ttl=300)  # Cache for 5 minutes
async def get_runtime_migration_status():
    """
    Check if runtime database migration is needed.
    Returns status and any pending JSON files that need importing.
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
                "migration_needed": False,
            }

        # Check if database has any data
        history = runtime_db.get_runtime_history(limit=1)
        db_has_data = len(history) > 0

        # Check for JSON files in Logs directory
        json_files = []
        if LOGS_DIR.exists():
            for json_file in LOGS_DIR.glob("*.json"):
                # Skip files that are not runtime logs
                if json_file.stem in ["normal", "testing", "manual", "backup"]:
                    json_files.append(json_file.name)

        migration_needed = len(json_files) > 0 and not db_has_data

        return {
            "success": True,
            "migration_needed": migration_needed,
            "db_has_data": db_has_data,
            "json_files_found": json_files,
            "message": (
                "Migration recommended - JSON files found but database is empty"
                if migration_needed
                else (
                    "Database already populated"
                    if db_has_data
                    else "No data available"
                )
            ),
        }

    except Exception as e:
        logger.error(f"Error getting migration status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/runtime-history")
async def clear_runtime_history(keep_last: int = 0):
    """
    Clear runtime history from database.

    Args:
        keep_last: Number of recent entries to keep (default: 0 = delete all)
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
            }

        # Get current count
        history = runtime_db.get_runtime_history(limit=9999)
        total_count = len(history)

        if keep_last > 0:
            # Delete all but last N entries
            to_delete = total_count - keep_last
            if to_delete > 0:
                runtime_db.clear_old_entries(keep_last=keep_last)
                return {
                    "success": True,
                    "message": f"Deleted {to_delete} entries, kept last {keep_last}",
                    "deleted": to_delete,
                }
            else:
                return {
                    "success": True,
                    "message": f"Nothing to delete, only {total_count} entries exist",
                    "deleted": 0,
                }
        else:
            # Delete all entries
            runtime_db.clear_all()
            return {
                "success": True,
                "message": f"Deleted all {total_count} runtime entries",
                "deleted": total_count,
            }

    except Exception as e:
        logger.error(f"Error clearing runtime history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
