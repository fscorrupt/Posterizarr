"""
Logs Router
============================================================

Logging endpoints and WebSocket

Endpunkte:
- POST /api/logs/ui
- POST /api/logs/ui/batch
- GET /api/logs
- GET /api/logs/{log_name}
- GET /api/logs/{log_name}/exists
- WebSocket /ws/logs (registered in main.py due to WebSocket routing requirements)
"""

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from pathlib import Path
import logging
import asyncio
from typing import Optional

from models.request_models import UILogEntry, UILogBatch

router = APIRouter(tags=["logs"])
logger = logging.getLogger(__name__)

# These will be injected by initialize_routers()
LOGS_DIR: Optional[Path] = None
UI_LOGS_DIR: Optional[Path] = None
current_mode: Optional[str] = None


def setup_dependencies(logs_dir: Path, ui_logs_dir: Path, current_mode_ref):
    """Setup router dependencies"""
    global LOGS_DIR, UI_LOGS_DIR, current_mode
    LOGS_DIR = logs_dir
    UI_LOGS_DIR = ui_logs_dir
    current_mode = current_mode_ref


# ============================================================================
# HTTP ENDPOINTS
# ============================================================================


@router.post("/api/logs/ui")
async def receive_ui_log(log_entry: UILogEntry):
    """
    Receives UI/Frontend logs and writes them to FrontendUI.log
    """
    try:
        ui_log_path = UI_LOGS_DIR / "FrontendUI.log"

        # Create log entry in the same format as backend logs
        timestamp = log_entry.timestamp
        level = log_entry.level.upper()
        message = log_entry.message
        source = log_entry.source if log_entry.source else "UI"

        # Format: [TIMESTAMP] [LEVEL] |UI| MESSAGE
        log_line = f"[{timestamp}] [{level:8}] |UI| {message}\n"

        # Write into FrontendUI.log
        with open(ui_log_path, "a", encoding="utf-8") as f:
            f.write(log_line)

        return {"success": True}

    except Exception as e:
        logger.error(f"Error writing UI log: {e}")
        return {"success": False, "error": str(e)}


@router.post("/api/logs/ui/batch")
async def receive_ui_logs_batch(batch: UILogBatch):
    """
    Receives multiple UI logs at once (better performance)
    """
    try:
        ui_log_path = UI_LOGS_DIR / "FrontendUI.log"

        log_lines = []
        for log_entry in batch.logs:
            timestamp = log_entry.timestamp
            level = log_entry.level.upper()
            message = log_entry.message

            log_line = f"[{timestamp}] [{level:8}] |UI| {message}\n"
            log_lines.append(log_line)

        # Batch-Write for better performance
        with open(ui_log_path, "a", encoding="utf-8") as f:
            f.writelines(log_lines)

        return {"success": True, "count": len(batch.logs)}

    except Exception as e:
        logger.error(f"Error writing UI logs batch: {e}")
        return {"success": False, "error": str(e)}


@router.get("/api/logs")
async def get_logs():
    """Get available log files from both Logs and UILogs directories"""
    log_files = []

    # Get logs from main Logs directory
    if LOGS_DIR.exists():
        for log_file in LOGS_DIR.glob("*.log"):
            stat = log_file.stat()
            log_files.append(
                {
                    "name": log_file.name,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "directory": "Logs",
                }
            )

    # Get logs from UILogs directory
    if UI_LOGS_DIR.exists():
        for log_file in UI_LOGS_DIR.glob("*.log"):
            stat = log_file.stat()
            log_files.append(
                {
                    "name": log_file.name,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "directory": "UILogs",
                }
            )

    return {"logs": sorted(log_files, key=lambda x: x["modified"], reverse=True)}


@router.get("/api/logs/{log_name}")
async def get_log_content(log_name: str, tail: int = 100):
    """Get log file content from either Logs or UILogs directory"""
    # Try Logs directory first
    log_path = LOGS_DIR / log_name

    # If not found, try UILogs directory
    if not log_path.exists():
        log_path = UI_LOGS_DIR / log_name

    if not log_path.exists():
        raise HTTPException(status_code=404, detail="Log file not found")

    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            return {"content": lines[-tail:] if tail else lines}
    except Exception as e:
        logger.error(f"Error reading log: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/logs/{log_name}/exists")
async def check_log_exists(log_name: str):
    """Check if a log file exists (for waiting until script creates log)"""
    # Try Logs directory first
    log_path = LOGS_DIR / log_name

    # If not found, try UILogs directory
    if not log_path.exists():
        log_path = UI_LOGS_DIR / log_name

    exists = log_path.exists()

    return {
        "exists": exists,
        "log_name": log_name,
        "path": str(log_path) if exists else None,
    }


# ============================================================================
# WEBSOCKET ENDPOINT (to be registered separately in main.py)
# ============================================================================


async def websocket_logs_handler(
    websocket: WebSocket,
    log_file: Optional[str] = Query("Scriptlog.log"),
    logs_dir: Path = None,
    ui_logs_dir: Path = None,
    current_mode_ref=None,
):
    """
    WebSocket endpoint for REAL-TIME log streaming
    This handler is called from main.py due to WebSocket routing requirements
    """
    await websocket.accept()
    logger.info(f"WebSocket connection established for log: {log_file}")

    # Determine which log file to monitor - check both directories
    log_path = logs_dir / log_file
    if not log_path.exists():
        log_path = ui_logs_dir / log_file

    # Track if user explicitly requested a specific log file
    user_requested_log = log_file != "Scriptlog.log"

    # Map modes to their log files for dynamic switching
    mode_log_map = {
        "normal": "Scriptlog.log",
        "testing": "Testinglog.log",
        "manual": "Manuallog.log",
        "backup": "Scriptlog.log",
        "syncjelly": "Scriptlog.log",
        "syncemby": "Scriptlog.log",
        "reset": "Scriptlog.log",
        "scheduled": "Scriptlog.log",
    }

    try:
        # Send initial logs (increased to 100 lines)
        if log_path.exists():
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()[-100:]
                for line in lines:
                    stripped = line.strip()
                    if stripped:
                        await websocket.send_json({"type": "log", "content": stripped})

        # Monitor log file for changes with dynamic log file switching
        last_position = log_path.stat().st_size if log_path.exists() else 0
        last_mode = current_mode_ref
        current_log_file = log_file

        while True:
            try:
                await asyncio.sleep(0.3)  # Fast polling
            except asyncio.CancelledError:
                logger.info("WebSocket log streaming cancelled (connection closed)")
                break

            # Only auto-switch if user didn't manually request a specific log
            if (
                not user_requested_log
                and current_mode_ref != last_mode
                and current_mode_ref in mode_log_map
            ):
                new_log_file = mode_log_map[current_mode_ref]

                if new_log_file != current_log_file:
                    logger.info(
                        f"WebSocket auto-switching from {current_log_file} to {new_log_file} (mode: {current_mode_ref})"
                    )

                    current_log_file = new_log_file
                    log_path = logs_dir / new_log_file
                    if not log_path.exists():
                        log_path = ui_logs_dir / new_log_file
                    last_position = log_path.stat().st_size if log_path.exists() else 0

                    await websocket.send_json(
                        {
                            "type": "log_file_changed",
                            "log_file": new_log_file,
                            "mode": current_mode_ref,
                        }
                    )

                last_mode = current_mode_ref
            elif user_requested_log and current_mode_ref != last_mode:
                last_mode = current_mode_ref

            # Monitor current log file
            if log_path.exists():
                try:
                    current_size = log_path.stat().st_size

                    # Handle log file truncation/rotation
                    if current_size < last_position:
                        last_position = 0
                        logger.info(
                            f"Log file {log_path.name} was truncated or rotated"
                        )

                    if current_size > last_position:
                        with open(
                            log_path, "r", encoding="utf-8", errors="ignore"
                        ) as f:
                            f.seek(last_position)
                            new_lines = f.readlines()

                            for line in new_lines:
                                stripped = line.strip()
                                if stripped:
                                    await websocket.send_json(
                                        {"type": "log", "content": stripped}
                                    )

                        last_position = current_size
                except OSError as e:
                    logger.warning(f"Error reading log file: {e}")
                    await asyncio.sleep(1)

    except WebSocketDisconnect as e:
        close_code = e.code if hasattr(e, "code") else None
        if close_code in [1000, 1001, 1005]:
            logger.info(f"WebSocket disconnected normally (code: {close_code})")
        else:
            logger.warning(f"WebSocket disconnected unexpectedly (code: {close_code})")

    except asyncio.CancelledError:
        logger.debug("WebSocket task cancelled during shutdown")

    except Exception as e:
        error_msg = str(e)
        if "1001" in error_msg or "1005" in error_msg or "going away" in error_msg:
            logger.info(f"WebSocket closed normally: {error_msg}")
        else:
            logger.error(f"WebSocket error: {e}")
            try:
                await websocket.send_json(
                    {"type": "error", "message": f"WebSocket error: {str(e)}"}
                )
            except:
                pass
    finally:
        logger.debug("WebSocket connection closed")
