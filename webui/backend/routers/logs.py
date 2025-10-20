"""
Log streaming router for Posterizarr Backend
Handles log file reading and WebSocket streaming
"""
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse

from core.config import LOGS_DIR, BASE_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["logs"])


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_last_log_lines(num_lines: int = 25, log_file: str = "Scriptlog.log") -> list:
    """
    Read last N lines from log file efficiently using deque.
    Returns list of log lines (newest last).
    """
    from collections import deque

    log_path = LOGS_DIR / log_file

    if not log_path.exists():
        return []

    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            # Use deque with maxlen to efficiently keep last N lines
            last_lines = deque(f, maxlen=num_lines)
            return list(last_lines)
    except Exception as e:
        logger.error(f"Error reading log file {log_file}: {e}")
        return []


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/logs")
async def get_logs(num_lines: int = 25, log_file: str = "Scriptlog.log"):
    """
    Get last N lines from a log file.

    Args:
        num_lines: Number of lines to return (default: 25, max: 500)
        log_file: Log filename (Scriptlog.log, Testinglog.log, Manuallog.log)
    """
    try:
        # Validate log file name (prevent directory traversal)
        allowed_logs = [
            "Scriptlog.log",
            "Testinglog.log",
            "Manuallog.log",
            "BackendLog.log",
            "BackendUILog.log",
        ]

        if log_file not in allowed_logs:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid log file. Allowed: {', '.join(allowed_logs)}",
            )

        # Limit num_lines to reasonable range
        num_lines = min(max(1, num_lines), 500)

        lines = get_last_log_lines(num_lines, log_file)

        return {"success": True, "lines": lines, "count": len(lines), "file": log_file}

    except Exception as e:
        logger.error(f"Error getting logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/download/{log_file}")
async def download_log(log_file: str):
    """
    Download complete log file.

    Args:
        log_file: Log filename to download
    """
    try:
        # Validate log file name
        allowed_logs = [
            "Scriptlog.log",
            "Testinglog.log",
            "Manuallog.log",
            "BackendLog.log",
            "BackendUILog.log",
        ]

        if log_file not in allowed_logs:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid log file. Allowed: {', '.join(allowed_logs)}",
            )

        log_path = LOGS_DIR / log_file

        if not log_path.exists():
            raise HTTPException(status_code=404, detail=f"Log file not found: {log_file}")

        return FileResponse(
            path=log_path,
            media_type="text/plain",
            filename=log_file,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading log: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs/list")
async def list_logs():
    """
    List all available log files with metadata.
    Returns file size, modification time, and line count.
    """
    try:
        if not LOGS_DIR.exists():
            return {"success": True, "logs": []}

        log_files = []

        for log_path in LOGS_DIR.glob("*.log"):
            try:
                stat = log_path.stat()

                # Count lines (for small files only, to avoid performance issues)
                line_count = None
                if stat.st_size < 1024 * 1024:  # Only for files < 1MB
                    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                        line_count = sum(1 for _ in f)

                log_files.append(
                    {
                        "name": log_path.name,
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                        "line_count": line_count,
                    }
                )
            except Exception as e:
                logger.warning(f"Error reading log file {log_path.name}: {e}")

        # Sort by modification time (newest first)
        log_files.sort(key=lambda x: x["modified"], reverse=True)

        return {"success": True, "logs": log_files}

    except Exception as e:
        logger.error(f"Error listing logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# WEBSOCKET LOG STREAMING
# ============================================================================

@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket, log_file: str = "Scriptlog.log"):
    """
    WebSocket endpoint for real-time log streaming.
    Sends new log lines as they are written to the log file.

    Usage (JavaScript):
        const ws = new WebSocket('ws://localhost:8000/api/ws/logs?log_file=Scriptlog.log');
        ws.onmessage = (event) => {
            console.log('New log line:', event.data);
        };
    """
    import asyncio

    await websocket.accept()

    # Validate log file
    allowed_logs = [
        "Scriptlog.log",
        "Testinglog.log",
        "Manuallog.log",
        "BackendLog.log",
        "BackendUILog.log",
    ]

    if log_file not in allowed_logs:
        await websocket.send_text(
            f"Error: Invalid log file. Allowed: {', '.join(allowed_logs)}"
        )
        await websocket.close()
        return

    log_path = LOGS_DIR / log_file

    # Send initial message
    await websocket.send_text(f"Connected to log stream: {log_file}")

    # Track last file position
    last_position = 0

    # If file exists, get current size (start from end)
    if log_path.exists():
        last_position = log_path.stat().st_size

    try:
        while True:
            try:
                # Check if file exists and has grown
                if log_path.exists():
                    current_size = log_path.stat().st_size

                    if current_size > last_position:
                        # Read new content
                        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                            f.seek(last_position)
                            new_content = f.read()

                            # Send new lines to client
                            if new_content:
                                for line in new_content.splitlines():
                                    if line.strip():
                                        await websocket.send_text(line)

                        last_position = current_size

                    elif current_size < last_position:
                        # File was truncated or recreated - start from beginning
                        logger.info(f"Log file {log_file} was reset, restarting stream")
                        last_position = 0

                # Wait before checking again (1 second interval)
                await asyncio.sleep(1)

            except WebSocketDisconnect:
                logger.info(f"Client disconnected from log stream: {log_file}")
                break

            except Exception as e:
                logger.error(f"Error in log streaming: {e}")
                # Continue streaming even if there's an error
                await asyncio.sleep(1)

    except Exception as e:
        logger.error(f"Fatal error in WebSocket log stream: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass


@router.get("/logs/active")
async def get_active_log():
    """
    Determine which log file is currently active based on:
    1. If script is running, use log for current mode
    2. Otherwise, use most recently modified log file

    Returns active log filename and metadata.
    """
    try:
        # Check if script is running and get current mode
        # (This would need access to execution state - simplified here)
        running_file = BASE_DIR / "Posterizarr.Running"
        is_running = running_file.exists()

        # Map modes to log files
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

        active_log = None

        if is_running:
            # Try to determine mode from last log lines
            # (Simplified - would need better mode detection)
            active_log = "Scriptlog.log"
        else:
            # Find most recently modified log
            log_files = ["Scriptlog.log", "Testinglog.log", "Manuallog.log"]
            newest_log = None
            newest_time = 0

            for log_file in log_files:
                log_path = LOGS_DIR / log_file
                if log_path.exists():
                    mtime = log_path.stat().st_mtime
                    if mtime > newest_time:
                        newest_time = mtime
                        newest_log = log_file

            active_log = newest_log if newest_log else "Scriptlog.log"

        # Get metadata for active log
        log_path = LOGS_DIR / active_log
        metadata = {
            "name": active_log,
            "exists": log_path.exists(),
            "size": log_path.stat().st_size if log_path.exists() else 0,
            "modified": log_path.stat().st_mtime if log_path.exists() else 0,
            "is_running": is_running,
        }

        return {"success": True, "active_log": active_log, "metadata": metadata}

    except Exception as e:
        logger.error(f"Error determining active log: {e}")
        raise HTTPException(status_code=500, detail=str(e))
