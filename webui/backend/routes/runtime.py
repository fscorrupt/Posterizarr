"""
Runtime Router
============================================================

Runtime statistics and history management

Endpoints:
- GET /api/runtime-stats
- GET /api/runtime-history
- GET /api/runtime-summary
- DELETE /api/runtime-history/cleanup
- POST /api/runtime-history/migrate
- GET /api/runtime-history/migration-status
- POST /api/runtime-history/migrate-format
- POST /api/runtime-history/import-json
"""

from fastapi import APIRouter, HTTPException, Query
from pathlib import Path
import logging
from typing import Optional

router = APIRouter(tags=["runtime"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
RUNTIME_DB_AVAILABLE = False
runtime_db = None
SCHEDULER_AVAILABLE = False
scheduler = None
BASE_DIR = None
LOGS_DIR = None
parse_runtime_from_log = None


def setup_dependencies(dependencies: dict):
    """Initialize runtime router dependencies"""
    global RUNTIME_DB_AVAILABLE, runtime_db, SCHEDULER_AVAILABLE, scheduler
    global BASE_DIR, LOGS_DIR, parse_runtime_from_log

    RUNTIME_DB_AVAILABLE = dependencies.get("runtime_db_available", False)
    runtime_db = dependencies.get("runtime_db")
    SCHEDULER_AVAILABLE = dependencies.get("scheduler_available", False)
    scheduler = dependencies.get("scheduler")
    BASE_DIR = dependencies["base_dir"]
    LOGS_DIR = dependencies["logs_dir"]
    parse_runtime_from_log = dependencies.get("parse_runtime_func")


@router.get("/api/runtime-stats")
async def get_runtime_stats():
    """
    Get last runtime statistics from database
    """
    logger.info("=" * 60)
    logger.info("RUNTIME STATS REQUEST")
    logger.debug(f"Runtime DB available: {RUNTIME_DB_AVAILABLE}")
    logger.debug(f"Scheduler available: {SCHEDULER_AVAILABLE}")

    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            logger.warning("Runtime database not available")
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

        logger.debug("Fetching latest runtime entry from database...")
        latest = runtime_db.get_latest_runtime()

        if not latest:
            logger.info("No runtime data found in database")
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

        logger.debug(
            f"Latest runtime entry: ID={latest.get('id')}, Mode={latest.get('mode')}, Timestamp={latest.get('timestamp')}"
        )

        # Get scheduler information if available
        scheduler_info = {
            "enabled": False,
            "schedules": [],
            "next_run": None,
            "timezone": None,
        }

        if SCHEDULER_AVAILABLE and scheduler:
            try:
                logger.debug("Fetching scheduler status...")
                status = scheduler.get_status()
                scheduler_info = {
                    "enabled": status.get("enabled", False),
                    "schedules": status.get("schedules", []),
                    "next_run": status.get("next_run"),
                    "timezone": status.get("timezone"),
                }
                logger.debug(
                    f"Scheduler: enabled={scheduler_info['enabled']}, schedules={len(scheduler_info['schedules'])}"
                )
            except Exception as e:
                logger.warning(f"Could not get scheduler info: {e}")

        logger.info(
            f"Runtime stats retrieved: {latest.get('total_images', 0)} images, {latest.get('errors', 0)} errors"
        )
        logger.info("=" * 60)

        return {
            "success": True,
            "runtime": latest.get("runtime_formatted"),
            "total_images": latest.get("total_images", 0),
            "posters": latest.get("posters", 0),
            "seasons": latest.get("seasons", 0),
            "backgrounds": latest.get("backgrounds", 0),
            "titlecards": latest.get("titlecards", 0),
            "collections": latest.get("collections", 0),
            "errors": latest.get("errors", 0),
            "tba_skipped": latest.get("tba_skipped", 0),
            "jap_chines_skipped": latest.get("jap_chines_skipped", 0),
            "notification_sent": latest.get("notification_sent", 0) == 1,
            "uptime_kuma": latest.get("uptime_kuma", 0) == 1,
            "images_cleared": latest.get("images_cleared", 0),
            "folders_cleared": latest.get("folders_cleared", 0),
            "space_saved": latest.get("space_saved"),
            "script_version": latest.get("script_version"),
            "im_version": latest.get("im_version"),
            "start_time": latest.get("start_time"),
            "end_time": latest.get("end_time"),
            "mode": latest.get("mode"),
            "timestamp": latest.get("timestamp"),
            "fallbacks": latest.get("fallbacks", 0),
            "textless": latest.get("textless", 0),
            "truncated": latest.get("truncated", 0),
            "text": latest.get("text", 0),
            "scheduler": scheduler_info,
            "source": "database",
        }

    except Exception as e:
        logger.error(f"Error getting runtime stats: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "success": False,
            "message": str(e),
            "runtime": None,
            "total_images": 0,
            "posters": 0,
            "seasons": 0,
            "backgrounds": 0,
            "titlecards": 0,
            "collections": 0,
            "errors": 0,
        }


@router.get("/api/runtime-history")
async def get_runtime_history(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    mode: Optional[str] = Query(None),
):
    """
    Get runtime history with pagination

    Args:
        limit: Maximum number of entries to return (1-500)
        offset: Number of entries to skip
        mode: Filter by mode (optional)
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
                "history": [],
            }

        history = runtime_db.get_runtime_history(limit=limit, offset=offset, mode=mode)
        total = runtime_db.get_runtime_history_total_count(mode=mode)

        return {
            "success": True,
            "history": history,
            "count": len(history),
            "total": total,
            "limit": limit,
            "offset": offset,
            "mode_filter": mode,
        }

    except Exception as e:
        logger.error(f"Error getting runtime history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/runtime-summary")
async def get_runtime_summary(days: int = Query(30, ge=1, le=365)):
    """
    Get summary statistics for the last N days

    Args:
        days: Number of days to include (1-365)
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
                "summary": {},
            }

        summary = runtime_db.get_runtime_stats_summary(days=days)

        return {
            "success": True,
            "summary": summary,
        }

    except Exception as e:
        logger.error(f"Error getting runtime summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/runtime-history/cleanup")
async def cleanup_old_runtime_entries(days: int = Query(90, ge=30, le=365)):
    """
    Delete runtime entries older than specified days

    Args:
        days: Keep entries from the last N days (30-365)
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
            }

        deleted_count = runtime_db.delete_old_entries(days=days)

        return {
            "success": True,
            "deleted_count": deleted_count,
            "message": f"Deleted {deleted_count} entries older than {days} days",
        }

    except Exception as e:
        logger.error(f"Error cleaning up runtime history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/runtime-history/migrate")
async def migrate_runtime_data_from_logs():
    """
    Migrate runtime data from existing log files to database
    This endpoint can be used to manually trigger migration (automatic migration runs on first DB creation)
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
            }

        # Check if already migrated
        if runtime_db._is_migrated():
            return {
                "success": True,
                "already_migrated": True,
                "message": "Migration was already performed. Database contains migrated data.",
            }

        logger.info("Starting manual runtime data migration from logs...")

        # Import logs from current and rotated directories
        rotated_logs_dir = BASE_DIR / "RotatedLogs"
        log_files_to_check = []

        # Current logs
        current_logs = [
            ("Scriptlog.log", "normal"),
            ("Testinglog.log", "testing"),
            ("Manuallog.log", "manual"),
        ]

        for log_file, mode in current_logs:
            log_path = LOGS_DIR / log_file
            if log_path.exists():
                log_files_to_check.append((log_path, mode))

        # Rotated logs (if they exist)
        if rotated_logs_dir.exists():
            logger.info(f"Checking rotated logs in {rotated_logs_dir}")
            for rotation_dir in rotated_logs_dir.iterdir():
                if rotation_dir.is_dir():
                    for log_file, mode in current_logs:
                        log_path = rotation_dir / log_file
                        if log_path.exists():
                            log_files_to_check.append((log_path, mode))

        imported_count = 0
        skipped_count = 0
        error_count = 0

        if parse_runtime_from_log:
            for log_path, mode in log_files_to_check:
                try:
                    runtime_data = parse_runtime_from_log(log_path, mode)

                    if runtime_data:
                        runtime_db.add_runtime_entry(**runtime_data)
                        imported_count += 1
                    else:
                        skipped_count += 1

                except Exception as e:
                    logger.error(f"Error processing {log_path}: {e}")
                    error_count += 1

        logger.info(
            f"Migration complete: {imported_count} imported, {skipped_count} skipped, {error_count} errors"
        )

        # Mark as migrated
        runtime_db._mark_as_migrated(imported_count)

        return {
            "success": True,
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": error_count,
            "message": f"Migrated {imported_count} runtime entries from log files",
        }

    except Exception as e:
        logger.error(f"Error migrating runtime data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/runtime-history/migration-status")
async def get_migration_status():
    """
    Get migration status information
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
            }

        is_migrated = runtime_db._is_migrated()

        # Get migration info
        migration_info = {}
        try:
            import sqlite3

            conn = sqlite3.connect(runtime_db.db_path)
            cursor = conn.cursor()

            cursor.execute("SELECT key, value, updated_at FROM migration_info")
            for row in cursor.fetchall():
                migration_info[row[0]] = {"value": row[1], "updated_at": row[2]}

            conn.close()

        except Exception as e:
            logger.debug(f"Could not get migration info: {e}")

        return {
            "success": True,
            "is_migrated": is_migrated,
            "migration_info": migration_info,
        }

    except Exception as e:
        logger.error(f"Error getting migration status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/runtime-history/migrate-format")
async def migrate_runtime_format():
    """
    Migrate all runtime_formatted entries to new format (Xh:Ym:Zs)
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
            }

        updated_count = runtime_db.migrate_runtime_format()

        return {
            "success": True,
            "updated_count": updated_count,
            "message": f"Migrated {updated_count} runtime entries to new format (Xh:Ym:Zs)",
        }

    except Exception as e:
        logger.error(f"Error migrating runtime format: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/runtime-history/import-json")
async def import_json_runtime_data():
    """
    Import runtime data from JSON files in Logs directory

    Looks for and imports from:
    - normal.json
    - manual.json
    - testing.json
    - tautulli.json
    - arr.json
    - syncjelly.json
    - syncemby.json
    - backup.json
    - scheduled.json
    """
    try:
        if not RUNTIME_DB_AVAILABLE or not runtime_db:
            return {
                "success": False,
                "message": "Runtime database not available",
            }

        from runtime_parser import import_json_to_db

        # Import JSON files
        import_json_to_db(LOGS_DIR)

        return {
            "success": True,
            "message": "JSON files imported successfully",
        }

    except Exception as e:
        logger.error(f"Error importing JSON runtime data: {e}")
        raise HTTPException(status_code=500, detail=str(e))
