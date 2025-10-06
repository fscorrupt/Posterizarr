from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json
import subprocess
import asyncio
import os
from pathlib import Path
from typing import Optional
import logging
import re

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Check if running in Docker
IS_DOCKER = os.path.exists("/.dockerenv") or os.environ.get("DOCKER_ENV") == "true"

if IS_DOCKER:
    BASE_DIR = Path("/config")
    ASSETS_DIR = Path("/assets")
    FRONTEND_DIR = Path("/app/frontend/dist")
    logger.info("Running in DOCKER mode")
else:
    # Local: webui/backend/main.py -> project root (3 levels up)
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    BASE_DIR = PROJECT_ROOT
    ASSETS_DIR = PROJECT_ROOT / "assets"
    FRONTEND_DIR = PROJECT_ROOT / "webui" / "frontend" / "dist"
    ASSETS_DIR.mkdir(exist_ok=True)
    (BASE_DIR / "Logs").mkdir(exist_ok=True)
    (BASE_DIR / "temp").mkdir(exist_ok=True)
    (BASE_DIR / "test").mkdir(exist_ok=True)
    logger.info(f"Running in LOCAL mode: {BASE_DIR}")

CONFIG_PATH = BASE_DIR / "config.json"
CONFIG_EXAMPLE_PATH = BASE_DIR / "config.example.json"
SCRIPT_PATH = BASE_DIR / "Posterizarr.ps1"
LOGS_DIR = BASE_DIR / "Logs"
TEST_DIR = BASE_DIR / "test"
TEMP_DIR = BASE_DIR / "temp"
RUNNING_FILE = TEMP_DIR / "Posterizarr.Running"

if not CONFIG_PATH.exists() and CONFIG_EXAMPLE_PATH.exists():
    logger.warning(f"config.json not found, using config.example.json as fallback")
    CONFIG_PATH = CONFIG_EXAMPLE_PATH

current_process: Optional[subprocess.Popen] = None
current_mode: Optional[str] = None


# ============================================================================
# CORRECTED Helper functions for filtering images - supports BOTH naming schemes
# ============================================================================
def is_poster_file(filename: str) -> bool:
    """
    Check if file is a poster:
    - poster.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx].jpg (file-based, ends with .jpg, no underscore before .jpg)

    MUST EXCLUDE:
    - background.jpg
    - Season01.jpg (and all SeasonXX.jpg)
    - S01E01.jpg (and all SxxExx.jpg)
    - *_background.jpg
    - *_Season01.jpg
    - *_S01E01.jpg
    """
    # Exact match: poster.jpg
    if filename == "poster.jpg":
        return True

    # EXCLUDE specific folder-based files
    if filename == "background.jpg":
        return False
    if re.match(r"^Season\d+\.jpg$", filename):
        return False
    if re.match(r"^S\d+E\d+\.jpg$", filename):
        return False

    # File-based: Must end with .jpg but NOT with special patterns
    if filename.endswith(".jpg"):
        # Exclude files with underscore patterns for other types
        if re.search(r"_background\.jpg$", filename):
            return False
        if re.search(r"_Season\d+\.jpg$", filename):
            return False
        if re.search(r"_S\d+E\d+\.jpg$", filename):
            return False
        # If it's just *.jpg without those patterns, it's a poster
        return True

    return False


def is_background_file(filename: str) -> bool:
    """
    Check if file is a background:
    - background.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx]_background.jpg (file-based)

    MUST EXCLUDE:
    - poster.jpg
    - Season01.jpg
    - S01E01.jpg
    - Any other .jpg files
    """
    # Exact match: background.jpg
    if filename == "background.jpg":
        return True

    # File-based: ends with _background.jpg
    if re.search(r"_background\.jpg$", filename):
        return True

    return False


def is_season_file(filename: str) -> bool:
    """
    Check if file is a season poster (SeasonXX.jpg with capital S):
    - Season01.jpg, Season02.jpg, Season12.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx]_Season01.jpg (file-based)

    MUST EXCLUDE:
    - poster.jpg
    - background.jpg
    - S01E01.jpg
    - Any other .jpg files
    """
    # Folder-based: SeasonXX.jpg (capital S, digits)
    if re.match(r"^Season\d+\.jpg$", filename):
        return True

    # File-based: *_SeasonXX.jpg (capital S, digits)
    if re.search(r"_Season\d+\.jpg$", filename):
        return True

    return False


def is_titlecard_file(filename: str) -> bool:
    """
    Check if file is a title card / episode (SxxExx.jpg with capital S and E):
    - S01E01.jpg, S02E05.jpg, S12E10.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx]_S01E01.jpg (file-based)

    MUST EXCLUDE:
    - poster.jpg
    - background.jpg
    - Season01.jpg
    - Any other .jpg files
    """
    # Folder-based: SxxExx.jpg (capital S and E, digits)
    if re.match(r"^S\d+E\d+\.jpg$", filename):
        return True

    # File-based: *_SxxExx.jpg (capital S and E, digits)
    if re.search(r"_S\d+E\d+\.jpg$", filename):
        return True

    return False


# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    yield
    logger.info("Shutting down Posterizarr Web UI Backend")


app = FastAPI(title="Posterizarr Web UI", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConfigUpdate(BaseModel):
    config: dict


class ResetPostersRequest(BaseModel):
    library: str


@app.get("/api")
async def api_root():
    return {"message": "Posterizarr Web UI API", "status": "running"}


@app.get("/api/config")
async def get_config():
    """Get current config.json"""
    try:
        if not CONFIG_PATH.exists():
            error_msg = f"Config file not found at: {CONFIG_PATH}\n"
            error_msg += f"Base directory: {BASE_DIR}\n"
            error_msg += "Please create config.json from config.example.json"
            raise HTTPException(status_code=404, detail=error_msg)

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
        return {"success": True, "config": config}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config")
async def update_config(data: ConfigUpdate):
    """Update config.json"""
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(data.config, f, indent=2, ensure_ascii=False)
        return {"success": True, "message": "Config updated successfully"}
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_last_log_lines(count=25, mode=None, log_file=None):
    """Get last N lines from log files based on current mode or specific log file"""

    # Map modes to their log files
    mode_log_map = {
        "normal": "Scriptlog.log",
        "testing": "Testinglog.log",
        "manual": "Manuallog.log",
        "backup": "Scriptlog.log",
        "syncjelly": "Scriptlog.log",  # Added for Jellyfin sync
        "syncemby": "Scriptlog.log",  # Added for Emby sync
        "reset": "Scriptlog.log",
    }

    # If specific log file is provided, use that
    if log_file:
        log_files_to_check = [log_file]
    # If mode is specified, try that log file first
    elif mode and mode in mode_log_map:
        log_files_to_check = [mode_log_map[mode]]
    else:
        # Fallback: check all log files in order
        log_files_to_check = ["Scriptlog.log", "Testinglog.log", "Manuallog.log"]

    for log_filename in log_files_to_check:
        scriptlog_path = LOGS_DIR / log_filename
        if scriptlog_path.exists() and scriptlog_path.stat().st_size > 0:
            try:
                with open(scriptlog_path, "r", encoding="utf-8", errors="ignore") as f:
                    all_lines = f.readlines()
                    # Filter out empty lines and decorative lines
                    lines = []
                    for line in all_lines:
                        stripped = line.strip()
                        if (
                            stripped
                            and not stripped.startswith("=====")
                            and not stripped.startswith("_____")
                            and not all(c in "=-_| " for c in stripped)
                        ):
                            lines.append(stripped)

                    if lines:
                        return lines[-count:]  # Return last N lines
            except Exception as e:
                logger.error(f"Error reading log file {log_filename}: {e}")
                continue

    return []


@app.get("/api/status")
async def get_status():
    """Get script status with last log lines from appropriate log file"""
    global current_process, current_mode
    is_running = current_process is not None and current_process.poll() is None

    # Determine which log file to use
    # Map modes to their log files
    mode_log_map = {
        "normal": "Scriptlog.log",
        "testing": "Testinglog.log",
        "manual": "Manuallog.log",
        "backup": "Scriptlog.log",
        "syncjelly": "Scriptlog.log",
        "syncemby": "Scriptlog.log",
        "reset": "Scriptlog.log",
    }

    # If script is running, use current mode
    if is_running and current_mode:
        active_log = mode_log_map.get(current_mode, "Scriptlog.log")
    else:
        # Find the most recently modified log file
        log_files = ["Testinglog.log", "Manuallog.log", "Scriptlog.log"]
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

    # Get last 25 log lines from the active log file
    last_logs = get_last_log_lines(25, log_file=active_log)

    # Check for "already running" warning
    already_running = False
    for line in last_logs[-5:]:  # Check last 5 lines
        if "Another Posterizarr instance already running" in line:
            already_running = True
            break

    # Check if running file exists
    running_file_exists = RUNNING_FILE.exists()

    return {
        "running": is_running,
        "last_logs": last_logs,
        "script_exists": SCRIPT_PATH.exists(),
        "config_exists": CONFIG_PATH.exists(),
        "pid": current_process.pid if is_running else None,
        "current_mode": current_mode,
        "active_log": active_log,  # Which log file is being shown
        "already_running_detected": already_running,
        "running_file_exists": running_file_exists,
    }


@app.delete("/api/running-file")
async def delete_running_file():
    """Delete the Posterizarr.Running file"""
    try:
        if RUNNING_FILE.exists():
            RUNNING_FILE.unlink()
            logger.info("Deleted Posterizarr.Running file")
            return {"success": True, "message": "Running file deleted successfully"}
        else:
            return {"success": False, "message": "Running file does not exist"}
    except Exception as e:
        logger.error(f"Error deleting running file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/run/{mode}")
async def run_script(mode: str):
    """Run Posterizarr script in different modes"""
    global current_process, current_mode

    # Check if already running
    if current_process and current_process.poll() is None:
        raise HTTPException(status_code=400, detail="Script is already running")

    if not SCRIPT_PATH.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    # Determine PowerShell command
    import platform

    if platform.system() == "Windows":
        ps_command = "pwsh"
        try:
            subprocess.run([ps_command, "-v"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            ps_command = "powershell"
            logger.info("pwsh not found, using powershell instead")
    else:
        ps_command = "pwsh"

    # Determine command based on mode
    commands = {
        "normal": [ps_command, "-File", str(SCRIPT_PATH)],
        "testing": [ps_command, "-File", str(SCRIPT_PATH), "-Testing"],
        "manual": [ps_command, "-File", str(SCRIPT_PATH), "-Manual"],
        "backup": [ps_command, "-File", str(SCRIPT_PATH), "-Backup"],
        "syncjelly": [ps_command, "-File", str(SCRIPT_PATH), "-SyncJelly"],  # Added
        "syncemby": [ps_command, "-File", str(SCRIPT_PATH), "-SyncEmby"],  # Added
    }

    if mode not in commands:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")

    try:
        logger.info(f"Running command: {' '.join(commands[mode])}")
        current_process = subprocess.Popen(
            commands[mode],
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        current_mode = mode  # Set current mode
        logger.info(
            f"Started Posterizarr in {mode} mode with PID {current_process.pid}"
        )
        return {
            "success": True,
            "message": f"Started in {mode} mode",
            "pid": current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH. Error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error starting script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/reset-posters")
async def reset_posters(request: ResetPostersRequest):
    """Reset all posters in a Plex library"""
    global current_process, current_mode

    # Check if script is running
    if current_process and current_process.poll() is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot reset posters while script is running. Please stop the script first.",
        )

    if not SCRIPT_PATH.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    if not request.library or not request.library.strip():
        raise HTTPException(status_code=400, detail="Library name is required")

    # Determine PowerShell command
    import platform

    if platform.system() == "Windows":
        ps_command = "pwsh"
        try:
            subprocess.run([ps_command, "-v"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            ps_command = "powershell"
            logger.info("pwsh not found, using powershell instead")
    else:
        ps_command = "pwsh"

    # Build command with PosterReset switch and library parameter
    command = [
        ps_command,
        "-File",
        str(SCRIPT_PATH),
        "-PosterReset",
        "-LibraryToReset",
        request.library.strip(),
    ]

    try:
        logger.info(f"Resetting posters for library: {request.library}")
        logger.info(f"Running command: {' '.join(command)}")

        # Run the reset command
        current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        current_mode = "reset"  # Set current mode to reset

        logger.info(
            f"Started poster reset for library '{request.library}' with PID {current_process.pid}"
        )

        return {
            "success": True,
            "message": f"Started resetting posters for library: {request.library}",
            "pid": current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH. Error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error resetting posters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/stop")
async def stop_script():
    """Stop running script gracefully"""
    global current_process, current_mode

    if not current_process or current_process.poll() is not None:
        return {"success": False, "message": "No script is running"}

    try:
        current_process.terminate()
        current_process.wait(timeout=5)
        current_process = None
        current_mode = None  # Reset mode when script stops
        return {"success": True, "message": "Script stopped"}
    except subprocess.TimeoutExpired:
        current_process.kill()
        current_process = None
        current_mode = None  # Reset mode when script stops
        return {"success": True, "message": "Script force killed after timeout"}
    except Exception as e:
        logger.error(f"Error stopping script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/force-kill")
async def force_kill_script():
    """Force kill running script immediately"""
    global current_process, current_mode

    if not current_process or current_process.poll() is not None:
        return {"success": False, "message": "No script is running"}

    try:
        current_process.kill()
        current_process.wait(timeout=2)
        current_process = None
        current_mode = None  # Reset mode when script is killed
        logger.warning("Script was force killed")
        return {"success": True, "message": "Script force killed"}
    except Exception as e:
        logger.error(f"Error force killing script: {e}")
        # Try to set to None anyway
        current_process = None
        current_mode = None  # Reset mode when script is killed
        return {"success": True, "message": "Script process cleared"}


@app.get("/api/logs")
async def get_logs():
    """Get available log files"""
    if not LOGS_DIR.exists():
        return {"logs": []}

    log_files = []
    for log_file in LOGS_DIR.glob("*.log"):
        stat = log_file.stat()
        log_files.append(
            {"name": log_file.name, "size": stat.st_size, "modified": stat.st_mtime}
        )

    return {"logs": sorted(log_files, key=lambda x: x["modified"], reverse=True)}


@app.get("/api/logs/{log_name}")
async def get_log_content(log_name: str, tail: int = 100):
    """Get log file content"""
    log_path = LOGS_DIR / log_name

    if not log_path.exists():
        raise HTTPException(status_code=404, detail="Log file not found")

    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            return {"content": lines[-tail:] if tail else lines}
    except Exception as e:
        logger.error(f"Error reading log: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """WebSocket endpoint for real-time log streaming"""
    await websocket.accept()
    logger.info("WebSocket connection established")

    scriptlog_path = LOGS_DIR / "Scriptlog.log"

    try:
        # Send initial logs
        if scriptlog_path.exists():
            with open(scriptlog_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()[-50:]
                for line in lines:
                    await websocket.send_json({"type": "log", "content": line.strip()})

        # Monitor log file for changes
        last_position = scriptlog_path.stat().st_size if scriptlog_path.exists() else 0

        while True:
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                # This is expected when the connection is closed
                logger.info("WebSocket log streaming cancelled (connection closed)")
                break

            if scriptlog_path.exists():
                current_size = scriptlog_path.stat().st_size

                if current_size > last_position:
                    with open(
                        scriptlog_path,
                        "r",
                        encoding="utf-8",
                        errors="ignore",
                    ) as f:
                        f.seek(last_position)
                        new_lines = f.readlines()
                        for line in new_lines:
                            await websocket.send_json(
                                {"type": "log", "content": line.strip()}
                            )
                    last_position = current_size

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
    except asyncio.CancelledError:
        # Handle cancellation during shutdown gracefully
        logger.info("WebSocket task cancelled during shutdown")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        logger.info("WebSocket connection closed")


@app.get("/api/gallery")
async def get_gallery():
    """Get poster gallery from assets directory (only poster.jpg)"""
    if not ASSETS_DIR.exists():
        return {"images": []}

    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        for image_path in ASSETS_DIR.rglob("*"):
            if image_path.suffix.lower() in image_extensions:
                # Filter: Only include poster.jpg
                if is_poster_file(image_path.name):
                    try:
                        relative_path = image_path.relative_to(ASSETS_DIR)
                        # Create URL path with forward slashes
                        url_path = str(relative_path).replace("\\", "/")
                        images.append(
                            {
                                "path": str(relative_path),
                                "name": image_path.name,
                                "size": image_path.stat().st_size,
                                "url": f"/poster_assets/{url_path}",
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error processing image {image_path}: {e}")
                        continue

        # Sort by name and limit
        images.sort(key=lambda x: x["name"])
        return {"images": images[:200]}  # Limit to 200 for performance
    except Exception as e:
        logger.error(f"Error scanning gallery: {e}")
        return {"images": []}


@app.delete("/api/gallery/{path:path}")
async def delete_poster(path: str):
    """Delete a poster from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Poster not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted poster: {file_path}")

        return {"success": True, "message": f"Poster '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting poster {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/backgrounds-gallery")
async def get_backgrounds_gallery():
    """Get backgrounds gallery from assets directory (only background.jpg)"""
    if not ASSETS_DIR.exists():
        return {"images": []}

    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        for image_path in ASSETS_DIR.rglob("*"):
            if image_path.suffix.lower() in image_extensions:
                # Filter: Only include background.jpg
                if is_background_file(image_path.name):
                    try:
                        relative_path = image_path.relative_to(ASSETS_DIR)
                        # Create URL path with forward slashes
                        url_path = str(relative_path).replace("\\", "/")
                        images.append(
                            {
                                "path": str(relative_path),
                                "name": image_path.name,
                                "size": image_path.stat().st_size,
                                "url": f"/poster_assets/{url_path}",
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error processing background {image_path}: {e}")
                        continue

        # Sort by name and limit
        images.sort(key=lambda x: x["name"])
        return {"images": images[:200]}  # Limit to 200 for performance
    except Exception as e:
        logger.error(f"Error scanning backgrounds gallery: {e}")
        return {"images": []}


@app.delete("/api/backgrounds/{path:path}")
async def delete_background(path: str):
    """Delete a background from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Background not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted background: {file_path}")

        return {"success": True, "message": f"Background '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting background {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CORRECTED ENDPOINTS - Swapped functionality
# ============================================================================


@app.get("/api/seasons-gallery")
async def get_seasons_gallery():
    """Get seasons gallery from assets directory (only SeasonXX.jpg)"""
    if not ASSETS_DIR.exists():
        return {"images": []}

    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        for image_path in ASSETS_DIR.rglob("*"):
            if image_path.suffix.lower() in image_extensions:
                # Filter: Only include SeasonXX.jpg
                if is_season_file(image_path.name):
                    try:
                        relative_path = image_path.relative_to(ASSETS_DIR)
                        # Create URL path with forward slashes
                        url_path = str(relative_path).replace("\\", "/")
                        images.append(
                            {
                                "path": str(relative_path),
                                "name": image_path.name,
                                "size": image_path.stat().st_size,
                                "url": f"/poster_assets/{url_path}",
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error processing season {image_path}: {e}")
                        continue

        # Sort by name and limit
        images.sort(key=lambda x: x["name"])
        return {"images": images[:200]}  # Limit to 200 for performance
    except Exception as e:
        logger.error(f"Error scanning seasons gallery: {e}")
        return {"images": []}


@app.delete("/api/seasons/{path:path}")
async def delete_season(path: str):
    """Delete a season from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Season not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted season: {file_path}")

        return {"success": True, "message": f"Season '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting season {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/titlecards-gallery")
async def get_titlecards_gallery():
    """Get title cards gallery from assets directory (only SxxExx.jpg - episodes)"""
    if not ASSETS_DIR.exists():
        return {"images": []}

    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        for image_path in ASSETS_DIR.rglob("*"):
            if image_path.suffix.lower() in image_extensions:
                # Filter: Only include SxxExx.jpg (title cards / episodes)
                if is_titlecard_file(image_path.name):
                    try:
                        relative_path = image_path.relative_to(ASSETS_DIR)
                        # Create URL path with forward slashes
                        url_path = str(relative_path).replace("\\", "/")
                        images.append(
                            {
                                "path": str(relative_path),
                                "name": image_path.name,
                                "size": image_path.stat().st_size,
                                "url": f"/poster_assets/{url_path}",
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error processing titlecard {image_path}: {e}")
                        continue

        # Sort by name and limit
        images.sort(key=lambda x: x["name"])
        return {"images": images[:200]}  # Limit to 200 for performance
    except Exception as e:
        logger.error(f"Error scanning titlecards gallery: {e}")
        return {"images": []}


@app.delete("/api/titlecards/{path:path}")
async def delete_titlecard(path: str):
    """Delete a titlecard from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="TitleCard not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted titlecard: {file_path}")

        return {"success": True, "message": f"TitleCard '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting titlecard {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================


@app.get("/api/assets-folders")
async def get_assets_folders():
    """Get list of folders in assets directory with image counts per type"""
    if not ASSETS_DIR.exists():
        return {"folders": []}

    try:
        folders = []
        image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

        for item in ASSETS_DIR.iterdir():
            if item.is_dir():
                # Count different image types
                poster_count = 0
                background_count = 0
                season_count = 0
                titlecard_count = 0

                for image_path in item.rglob("*"):
                    if image_path.suffix.lower() in image_extensions:
                        if is_poster_file(image_path.name):
                            poster_count += 1
                        elif is_background_file(image_path.name):
                            background_count += 1
                        elif is_season_file(image_path.name):
                            season_count += 1
                        elif is_titlecard_file(image_path.name):
                            titlecard_count += 1

                folders.append(
                    {
                        "name": item.name,
                        "path": str(item.relative_to(ASSETS_DIR)),
                        "poster_count": poster_count,
                        "background_count": background_count,
                        "season_count": season_count,
                        "titlecard_count": titlecard_count,
                        "total_count": poster_count
                        + background_count
                        + season_count
                        + titlecard_count,
                    }
                )

        # Sort folders alphabetically
        folders.sort(key=lambda x: x["name"])
        return {"folders": folders}
    except Exception as e:
        logger.error(f"Error getting assets folders: {e}")
        return {"folders": []}


@app.get("/api/assets-folder-images/{image_type}/{folder_path:path}")
async def get_assets_folder_images_filtered(image_type: str, folder_path: str):
    """Get filtered images from a specific folder"""
    if not ASSETS_DIR.exists():
        return {"images": []}

    folder = ASSETS_DIR / folder_path

    # Security check
    try:
        folder = folder.resolve()
        folder.relative_to(ASSETS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied: Invalid path")

    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    # Validate image_type
    valid_types = ["posters", "backgrounds", "seasons", "titlecards"]
    if image_type not in valid_types:
        raise HTTPException(
            status_code=400, detail=f"Invalid image type. Must be one of: {valid_types}"
        )

    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        for image_path in folder.rglob("*"):
            if image_path.suffix.lower() in image_extensions:
                # Apply filter based on image_type
                include_image = False
                if image_type == "posters" and is_poster_file(image_path.name):
                    include_image = True
                elif image_type == "backgrounds" and is_background_file(
                    image_path.name
                ):
                    include_image = True
                elif image_type == "seasons" and is_season_file(image_path.name):
                    include_image = True
                elif image_type == "titlecards" and is_titlecard_file(image_path.name):
                    include_image = True

                if include_image:
                    try:
                        relative_path = image_path.relative_to(ASSETS_DIR)
                        url_path = str(relative_path).replace("\\", "/")
                        images.append(
                            {
                                "path": str(relative_path),
                                "name": image_path.name,
                                "size": image_path.stat().st_size,
                                "url": f"/poster_assets/{url_path}",
                            }
                        )
                    except Exception as e:
                        logger.error(f"Error processing image {image_path}: {e}")
                        continue

        # Sort by name
        images.sort(key=lambda x: x["name"])
        return {"images": images}
    except Exception as e:
        logger.error(f"Error scanning folder {folder_path}: {e}")
        return {"images": []}


@app.get("/api/version")
async def get_version():
    try:
        # Gehe ZWEI Verzeichnisse nach oben vom webui/backend-Ordner
        version_file = Path(__file__).parent.parent.parent / "Release.txt"

        if version_file.exists():
            version = version_file.read_text().strip()
            logger.info(f"Version loaded: {version} from {version_file}")
            return {"version": version}

        logger.warning(f"Version file not found at: {version_file}")
        return {"version": None}
    except Exception as e:
        logger.error(f"Error reading version: {e}")
        return {"version": None}


@app.get("/api/version-ui")
async def get_version_ui():
    try:
        # Gehe ZWEI Verzeichnisse nach oben vom webui/backend-Ordner
        version_file = Path(__file__).parent.parent.parent / "ReleaseUI.txt"

        if version_file.exists():
            version = version_file.read_text().strip()
            logger.info(f"UI Version loaded: {version} from {version_file}")
            return {"version": version}

        logger.warning(f"UI Version file not found at: {version_file}")
        return {"version": None}
    except Exception as e:
        logger.error(f"Error reading UI version: {e}")
        return {"version": None}


@app.get("/api/test-gallery")
async def get_test_gallery():
    """Get poster gallery from test directory with image URLs"""
    if not TEST_DIR.exists():
        return {"images": []}

    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        for image_path in TEST_DIR.rglob("*"):
            if image_path.suffix.lower() in image_extensions:
                try:
                    relative_path = image_path.relative_to(TEST_DIR)
                    # Create URL path with forward slashes
                    url_path = str(relative_path).replace("\\", "/")
                    images.append(
                        {
                            "path": str(relative_path),
                            "name": image_path.name,
                            "size": image_path.stat().st_size,
                            "url": f"/test/{url_path}",
                        }
                    )
                except Exception as e:
                    logger.error(f"Error processing test image {image_path}: {e}")
                    continue

        # Sort by name and limit
        images.sort(key=lambda x: x["name"])
        return {"images": images[:200]}  # Limit to 200 for performance
    except Exception as e:
        logger.error(f"Error scanning test gallery: {e}")
        return {"images": []}

# Mount static files in correct order: /assets, /test, then / (frontend)
if ASSETS_DIR.exists():
    app.mount("/poster_assets", StaticFiles(directory=str(ASSETS_DIR)), name="poster_assets")
    logger.info(f"Mounted /poster_assets -> {ASSETS_DIR}")

if TEST_DIR.exists():
    app.mount("/test", StaticFiles(directory=str(TEST_DIR)), name="test")
    logger.info(f"Mounted /test -> {TEST_DIR}")

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    logger.info(f"Mounted frontend from {FRONTEND_DIR}")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
