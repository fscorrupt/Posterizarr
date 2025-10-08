from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import json
import subprocess
import asyncio
import os
import httpx
from pathlib import Path
from typing import Optional, List, Literal
import logging
import re
import time
import threading
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# Import config mapper for flat/grouped transformations
import sys

sys.path.insert(0, str(Path(__file__).parent))
try:
    from config_mapper import (
        flatten_config,
        unflatten_config,
        UI_GROUPS,
        DISPLAY_NAMES,
        get_display_name,
    )

    CONFIG_MAPPER_AVAILABLE = True
    logger.info("Config mapper loaded successfully")
except ImportError as e:
    CONFIG_MAPPER_AVAILABLE = False
    logger.warning(f"Config mapper not available: {e}. Using grouped config structure.")

# Import scheduler module
try:
    from scheduler import PosterizarrScheduler

    SCHEDULER_AVAILABLE = True
    logger.info("Scheduler module loaded successfully")
except ImportError as e:
    SCHEDULER_AVAILABLE = False
    logger.warning(
        f"Scheduler not available: {e}. Scheduler features will be disabled."
    )

# Check if running in Docker
IS_DOCKER = os.path.exists("/.dockerenv") or os.environ.get("DOCKER_ENV") == "true"

if IS_DOCKER:
    BASE_DIR = Path("/config")
    APP_DIR = Path("/app")
    ASSETS_DIR = Path("/assets")
    FRONTEND_DIR = Path("/app/frontend/dist")
    logger.info("Running in DOCKER mode")
else:
    # Local: webui/backend/main.py -> project root (3 levels up)
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    BASE_DIR = PROJECT_ROOT
    APP_DIR = PROJECT_ROOT
    ASSETS_DIR = PROJECT_ROOT / "assets"
    FRONTEND_DIR = PROJECT_ROOT / "webui" / "frontend" / "dist"
    ASSETS_DIR.mkdir(exist_ok=True)
    (BASE_DIR / "Logs").mkdir(exist_ok=True)
    (BASE_DIR / "temp").mkdir(exist_ok=True)
    (BASE_DIR / "test").mkdir(exist_ok=True)
    logger.info(f"Running in LOCAL mode: {BASE_DIR}")

CONFIG_PATH = BASE_DIR / "config.json"
CONFIG_EXAMPLE_PATH = BASE_DIR / "config.example.json"
SCRIPT_PATH = APP_DIR / "Posterizarr.ps1"
LOGS_DIR = BASE_DIR / "Logs"
TEST_DIR = BASE_DIR / "test"
TEMP_DIR = BASE_DIR / "temp"
RUNNING_FILE = TEMP_DIR / "Posterizarr.Running"

if not CONFIG_PATH.exists() and CONFIG_EXAMPLE_PATH.exists():
    logger.warning(f"config.json not found, using config.example.json as fallback")
    CONFIG_PATH = CONFIG_EXAMPLE_PATH

current_process: Optional[subprocess.Popen] = None
current_mode: Optional[str] = None
scheduler: Optional["PosterizarrScheduler"] = None

# Initialize cache variables early to prevent race conditions
cache_refresh_task = None
cache_refresh_running = False
cache_scan_in_progress = False


def parse_version(version_str: str) -> tuple:
    """
    Parse a semantic version string into a tuple of integers for comparison.
    Handles versions like "1.9.97", "2.0.0", "1.10.5", etc.

    Returns tuple of (major, minor, patch) or None if parsing fails
    """
    if not version_str:
        return None

    try:
        # Remove 'v' prefix if present
        version_str = version_str.strip().lstrip("v")

        # Split by '.' and convert to integers
        parts = version_str.split(".")

        # Pad with zeros if necessary (e.g., "2.0" becomes "2.0.0")
        while len(parts) < 3:
            parts.append("0")

        # Convert to integers
        major = int(parts[0])
        minor = int(parts[1])
        patch = int(parts[2])

        return (major, minor, patch)
    except (ValueError, IndexError) as e:
        logger.error(f"Failed to parse version '{version_str}': {e}")
        return None


def is_version_newer(current: str, remote: str) -> bool:
    """
    Compare two semantic versions.
    Returns True if remote version is newer than current version.

    Examples:
        is_version_newer("2.0.0", "1.9.97") -> False (2.0.0 is newer)
        is_version_newer("1.9.97", "2.0.0") -> True (2.0.0 is newer)
        is_version_newer("1.9.5", "1.9.97") -> True (1.9.97 is newer)
    """
    current_parsed = parse_version(current)
    remote_parsed = parse_version(remote)

    # If we can't parse either version, fall back to string comparison
    if current_parsed is None or remote_parsed is None:
        logger.warning(
            f"Version parsing failed, using string comparison: {current} vs {remote}"
        )
        return current != remote

    # Compare tuples (Python does lexicographic comparison)
    # (2, 0, 0) > (1, 9, 97) returns True
    is_newer = remote_parsed > current_parsed

    logger.info(
        f"Version comparison: {current} {current_parsed} vs {remote} {remote_parsed} -> newer: {is_newer}"
    )

    return is_newer


# ============================================================================
# Custom StaticFiles with caching for better performance
# ============================================================================
class CachedStaticFiles(StaticFiles):
    """StaticFiles with Cache-Control headers for browser caching"""

    def __init__(self, *args, max_age: int = 3600, **kwargs):
        self.max_age = max_age
        super().__init__(*args, **kwargs)

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = f"public, max-age={self.max_age}"
        return response


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
# DYNAMIC ASSET CACHING SYSTEM
# ============================================================================
CACHE_TTL_SECONDS = 300  # Cache data for 5 minutes (nur für Statistiken)
CACHE_REFRESH_INTERVAL = 600  # Refresh cache every 10 minutes (passt für große Assets)

asset_cache = {
    "last_scanned": 0,
    "posters": [],
    "backgrounds": [],
    "seasons": [],
    "titlecards": [],
    "folders": [],
}

# Background refresh control (already initialized above, see global variables)


def process_image_path(image_path: Path):
    """Helper function to process a Path object into a dictionary."""
    try:
        relative_path = image_path.relative_to(ASSETS_DIR)
        url_path = str(relative_path).replace("\\", "/")
        return {
            "path": str(relative_path),
            "name": image_path.name,
            "size": image_path.stat().st_size,
            "url": f"/poster_assets/{url_path}",
        }
    except Exception as e:
        logger.error(f"Error processing image path {image_path}: {e}")
        return None


def scan_and_cache_assets():
    """Scans the assets directory and populates/refreshes the cache."""
    global cache_scan_in_progress

    # Verhindere überlappende Scans
    if cache_scan_in_progress:
        logger.warning("Asset scan already in progress, skipping this request")
        return

    cache_scan_in_progress = True
    logger.info("Starting asset scan to refresh cache...")

    # Clear old data before re-scanning
    asset_cache["posters"].clear()
    asset_cache["backgrounds"].clear()
    asset_cache["seasons"].clear()
    asset_cache["titlecards"].clear()
    asset_cache["folders"].clear()

    if not ASSETS_DIR.exists() or not ASSETS_DIR.is_dir():
        logger.warning("Assets directory not found. Skipping cache population.")
        asset_cache["last_scanned"] = time.time()
        cache_scan_in_progress = False
        return

    try:
        all_images = (
            list(ASSETS_DIR.rglob("*.jpg"))
            + list(ASSETS_DIR.rglob("*.jpeg"))
            + list(ASSETS_DIR.rglob("*.png"))
            + list(ASSETS_DIR.rglob("*.webp"))
        )

        temp_folders = {}

        for image_path in all_images:
            image_data = process_image_path(image_path)
            if not image_data:
                continue

            folder_name = (
                Path(image_data["path"]).parts[0]
                if len(Path(image_data["path"]).parts) > 0
                else "root"
            )

            if folder_name not in temp_folders:
                temp_folders[folder_name] = {
                    "name": folder_name,
                    "path": folder_name,
                    "poster_count": 0,
                    "background_count": 0,
                    "season_count": 0,
                    "titlecard_count": 0,
                    "files": 0,
                    "size": 0,
                }

            # Zähle Dateien und Größe für den Ordner
            temp_folders[folder_name]["files"] += 1
            temp_folders[folder_name]["size"] += image_data["size"]

            if is_poster_file(image_path.name):
                asset_cache["posters"].append(image_data)
                temp_folders[folder_name]["poster_count"] += 1
            elif is_background_file(image_path.name):
                asset_cache["backgrounds"].append(image_data)
                temp_folders[folder_name]["background_count"] += 1
            elif is_season_file(image_path.name):
                asset_cache["seasons"].append(image_data)
                temp_folders[folder_name]["season_count"] += 1
            elif is_titlecard_file(image_path.name):
                asset_cache["titlecards"].append(image_data)
                temp_folders[folder_name]["titlecard_count"] += 1

        # Sort the image lists once by path
        for key in ["posters", "backgrounds", "seasons", "titlecards"]:
            asset_cache[key].sort(key=lambda x: x["path"])

        # Finalize folder data
        folder_list = list(temp_folders.values())
        for folder in folder_list:
            folder["total_count"] = (
                folder["poster_count"]
                + folder["background_count"]
                + folder["season_count"]
                + folder["titlecard_count"]
            )
        folder_list.sort(key=lambda x: x["name"])
        asset_cache["folders"] = folder_list

    except Exception as e:
        logger.error(f"An error occurred during asset scan: {e}")
    finally:
        asset_cache["last_scanned"] = time.time()
        cache_scan_in_progress = False  # Sperre freigeben
        logger.info(
            f"Asset cache refresh finished. Found {len(asset_cache['posters'])} posters, "
            f"{len(asset_cache['backgrounds'])} backgrounds, "
            f"{len(asset_cache['seasons'])} seasons, "
            f"{len(asset_cache['titlecards'])} titlecards, "
            f"{len(asset_cache['folders'])} folders."
        )


def background_cache_refresh():
    """Background thread that refreshes the cache periodically"""
    global cache_refresh_running

    logger.info(
        f"Background cache refresh started (interval: {CACHE_REFRESH_INTERVAL}s)"
    )

    while cache_refresh_running:
        try:
            # Warte bis zum nächsten Refresh
            time.sleep(CACHE_REFRESH_INTERVAL)

            if cache_refresh_running:  # Check again after sleep
                logger.info("🔄 Background cache refresh triggered")
                scan_and_cache_assets()
                logger.info("✅ Background cache refresh completed")
        except Exception as e:
            logger.error(f"Error in background cache refresh: {e}")
            # Continue running even if there's an error
            time.sleep(60)  # Wait a bit before retrying


def start_cache_refresh_background():
    """Start the background cache refresh thread"""
    global cache_refresh_task, cache_refresh_running

    if cache_refresh_task is not None and cache_refresh_task.is_alive():
        logger.warning("Background cache refresh is already running")
        return

    cache_refresh_running = True
    cache_refresh_task = threading.Thread(
        target=background_cache_refresh, daemon=True, name="CacheRefresh"
    )
    cache_refresh_task.start()
    logger.info("✅ Background cache refresh thread started")


def stop_cache_refresh_background():
    """Stop the background cache refresh thread"""
    global cache_refresh_running

    if cache_refresh_running:
        logger.info("Stopping background cache refresh...")
        cache_refresh_running = False
        if cache_refresh_task:
            cache_refresh_task.join(timeout=5)
        logger.info("Background cache refresh stopped")


def get_fresh_assets():
    """Returns the asset cache (always fresh thanks to background refresh)"""
    # Vertraue vollständig auf Background-Refresh!
    # Nur bei komplett leerem Cache (erster Start) wird synchron gescannt
    if asset_cache["last_scanned"] == 0:
        logger.info("First-time cache population...")
        scan_and_cache_assets()
    return asset_cache


# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    global scheduler

    # Startup: Pre-populate asset cache
    logger.info("Starting Posterizarr Web UI Backend")
    scan_and_cache_assets()

    # Start background cache refresh
    start_cache_refresh_background()

    # Initialize and start scheduler if available
    if SCHEDULER_AVAILABLE:
        try:
            scheduler = PosterizarrScheduler(BASE_DIR, SCRIPT_PATH)
            scheduler.start()
            logger.info("Scheduler initialized and started")
        except Exception as e:
            logger.error(f"Failed to initialize scheduler: {e}")
            scheduler = None
    else:
        logger.info("Scheduler module not available, skipping scheduler initialization")

    yield

    # Shutdown
    # Stop background cache refresh
    stop_cache_refresh_background()

    if scheduler:
        try:
            scheduler.stop()
            logger.info("Scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")

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


class ManualModeRequest(BaseModel):
    picturePath: str
    titletext: str
    folderName: str
    libraryName: str
    posterType: Literal["standard", "season", "collection", "titlecard"] = "standard"
    seasonPosterName: str = ""
    epTitleName: str = ""
    episodeNumber: str = ""


class ScheduleCreate(BaseModel):
    time: str  # Format: "HH:MM"
    description: Optional[str] = ""


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    schedules: Optional[List[dict]] = None
    timezone: Optional[str] = None
    skip_if_running: Optional[bool] = None


@app.get("/api")
async def api_root():
    return {"message": "Posterizarr Web UI API", "status": "running"}


@app.get("/api/config")
async def get_config():
    """Get current config.json - returns FLAT structure for UI when config_mapper available"""
    try:
        if not CONFIG_PATH.exists():
            error_msg = f"Config file not found at: {CONFIG_PATH}\n"
            error_msg += f"Base directory: {BASE_DIR}\n"
            error_msg += "Please create config.json from config.example.json"
            raise HTTPException(status_code=404, detail=error_msg)

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        # If config_mapper is available, transform to flat structure
        if CONFIG_MAPPER_AVAILABLE:
            flat_config = flatten_config(grouped_config)

            # Build display names for all keys in the config
            display_names_dict = {}
            for key in flat_config.keys():
                display_names_dict[key] = get_display_name(key)

            return {
                "success": True,
                "config": flat_config,
                "ui_groups": UI_GROUPS,  # Helps frontend organize fields
                "display_names": display_names_dict,  # Send display names to frontend
                "using_flat_structure": True,
            }
        else:
            # Fallback: return grouped structure as-is
            return {
                "success": True,
                "config": grouped_config,
                "using_flat_structure": False,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config")
async def update_config(data: ConfigUpdate):
    """Update config.json - accepts FLAT structure and saves as GROUPED when config_mapper available"""
    try:
        # If config_mapper is available, transform flat config back to grouped structure
        if CONFIG_MAPPER_AVAILABLE:
            grouped_config = unflatten_config(data.config)

            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(grouped_config, f, indent=2, ensure_ascii=False)

            logger.info(
                "Config saved successfully (flat -> grouped transformation applied)"
            )
        else:
            # Fallback: save as-is (assuming grouped structure)
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(data.config, f, indent=2, ensure_ascii=False)

            logger.info("Config saved successfully (grouped structure)")

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


@app.get("/api/system-info")
async def get_system_info():
    """Get system information (CPU, RAM, OS, Platform) - Windows Optimized"""
    import platform
    import os

    system_info = {
        "platform": platform.system(),
        "os_version": "Unknown",
        "cpu_model": "Unknown",
        "cpu_cores": 0,
        "total_memory": "Unknown",
        "used_memory": "Unknown",
        "free_memory": "Unknown",
        "memory_percent": 0,
    }

    try:
        # Get OS Version
        try:
            if platform.system() == "Linux":
                if Path("/etc/os-release").exists():
                    with open("/etc/os-release", "r") as f:
                        for line in f:
                            if line.startswith("PRETTY_NAME="):
                                system_info["os_version"] = (
                                    line.split("=")[1].strip().strip('"')
                                )
                                break

            elif platform.system() == "Windows":
                # Method 1: Try ctypes (most reliable)
                try:
                    import ctypes

                    class OSVERSIONINFOEXW(ctypes.Structure):
                        _fields_ = [
                            ("dwOSVersionInfoSize", ctypes.c_ulong),
                            ("dwMajorVersion", ctypes.c_ulong),
                            ("dwMinorVersion", ctypes.c_ulong),
                            ("dwBuildNumber", ctypes.c_ulong),
                            ("dwPlatformId", ctypes.c_ulong),
                            ("szCSDVersion", ctypes.c_wchar * 128),
                        ]

                    os_version = OSVERSIONINFOEXW()
                    os_version.dwOSVersionInfoSize = ctypes.sizeof(os_version)
                    retcode = ctypes.windll.Ntdll.RtlGetVersion(
                        ctypes.byref(os_version)
                    )
                    if retcode == 0:
                        system_info["os_version"] = (
                            f"Windows {os_version.dwMajorVersion}.{os_version.dwMinorVersion} Build {os_version.dwBuildNumber}"
                        )
                except Exception as e:
                    logger.debug(f"ctypes method failed: {e}")
                    # Method 2: Try platform
                    try:
                        system_info["os_version"] = (
                            f"{platform.system()} {platform.release()} {platform.version()}"
                        )
                    except Exception:
                        system_info["os_version"] = (
                            f"{platform.system()} {platform.release()}"
                        )

            elif platform.system() == "Darwin":
                system_info["os_version"] = f"macOS {platform.mac_ver()[0]}"
        except Exception as e:
            logger.error(f"Error getting OS version: {e}")
            system_info["os_version"] = f"{platform.system()} {platform.release()}"

        # Get CPU Model - Multiple Methods for Windows
        try:
            if platform.system() == "Linux":
                with open("/proc/cpuinfo", "r") as f:
                    for line in f:
                        if "model name" in line:
                            system_info["cpu_model"] = line.split(":")[1].strip()
                            break

            elif platform.system() == "Windows":
                cpu_found = False

                # Method 1: Try wmic (old but reliable)
                try:
                    result = subprocess.run(
                        ["wmic", "cpu", "get", "name"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        creationflags=(
                            subprocess.CREATE_NO_WINDOW
                            if hasattr(subprocess, "CREATE_NO_WINDOW")
                            else 0
                        ),
                    )
                    lines = result.stdout.strip().split("\n")
                    if len(lines) > 1 and lines[1].strip():
                        system_info["cpu_model"] = lines[1].strip()
                        cpu_found = True
                except Exception as e:
                    logger.debug(f"wmic method failed: {e}")

                # Method 2: Try PowerShell (modern Windows)
                if not cpu_found:
                    try:
                        result = subprocess.run(
                            [
                                "powershell",
                                "-Command",
                                "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty Name",
                            ],
                            capture_output=True,
                            text=True,
                            timeout=5,
                            creationflags=(
                                subprocess.CREATE_NO_WINDOW
                                if hasattr(subprocess, "CREATE_NO_WINDOW")
                                else 0
                            ),
                        )
                        cpu_name = result.stdout.strip()
                        if cpu_name:
                            system_info["cpu_model"] = cpu_name
                            cpu_found = True
                    except Exception as e:
                        logger.debug(f"PowerShell method failed: {e}")

                # Method 3: Try platform.processor() (fallback)
                if not cpu_found:
                    try:
                        cpu_name = platform.processor()
                        if cpu_name:
                            system_info["cpu_model"] = cpu_name
                            cpu_found = True
                    except Exception as e:
                        logger.debug(f"platform.processor failed: {e}")

                # Method 4: Try registry (last resort)
                if not cpu_found:
                    try:
                        import winreg

                        key = winreg.OpenKey(
                            winreg.HKEY_LOCAL_MACHINE,
                            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
                        )
                        cpu_name = winreg.QueryValueEx(key, "ProcessorNameString")[0]
                        winreg.CloseKey(key)
                        if cpu_name:
                            system_info["cpu_model"] = cpu_name.strip()
                    except Exception as e:
                        logger.debug(f"Registry method failed: {e}")

            elif platform.system() == "Darwin":
                result = subprocess.run(
                    ["sysctl", "-n", "machdep.cpu.brand_string"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                system_info["cpu_model"] = result.stdout.strip()
        except Exception as e:
            logger.error(f"Error getting CPU model: {e}")

        # Get CPU Cores
        try:
            system_info["cpu_cores"] = os.cpu_count() or 0
        except Exception as e:
            logger.error(f"Error getting CPU cores: {e}")

        # Get Memory Information - Multiple Methods
        try:
            if platform.system() == "Linux":
                with open("/proc/meminfo", "r") as f:
                    meminfo = f.readlines()
                    mem_total = 0
                    mem_available = 0
                    for line in meminfo:
                        if "MemTotal:" in line:
                            mem_total = int(line.split()[1])
                        elif "MemAvailable:" in line:
                            mem_available = int(line.split()[1])

                    if mem_total > 0:
                        mem_total_mb = mem_total // 1024
                        mem_available_mb = mem_available // 1024
                        mem_used_mb = mem_total_mb - mem_available_mb

                        system_info["total_memory"] = f"{mem_total_mb} MB"
                        system_info["used_memory"] = f"{mem_used_mb} MB"
                        system_info["free_memory"] = f"{mem_available_mb} MB"
                        system_info["memory_percent"] = round(
                            (mem_used_mb / mem_total_mb) * 100, 1
                        )

            elif platform.system() == "Windows":
                mem_found = False

                # Method 1: Try wmic
                try:
                    result = subprocess.run(
                        [
                            "wmic",
                            "OS",
                            "get",
                            "TotalVisibleMemorySize,FreePhysicalMemory",
                            "/VALUE",
                        ],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        creationflags=(
                            subprocess.CREATE_NO_WINDOW
                            if hasattr(subprocess, "CREATE_NO_WINDOW")
                            else 0
                        ),
                    )

                    total_kb = 0
                    free_kb = 0
                    for line in result.stdout.split("\n"):
                        if "TotalVisibleMemorySize=" in line:
                            total_kb = int(line.split("=")[1].strip())
                        elif "FreePhysicalMemory=" in line:
                            free_kb = int(line.split("=")[1].strip())

                    if total_kb > 0:
                        used_kb = total_kb - free_kb
                        total_mb = total_kb // 1024
                        used_mb = used_kb // 1024
                        free_mb = free_kb // 1024

                        system_info["total_memory"] = f"{total_mb} MB"
                        system_info["used_memory"] = f"{used_mb} MB"
                        system_info["free_memory"] = f"{free_mb} MB"
                        system_info["memory_percent"] = round(
                            (used_mb / total_mb) * 100, 1
                        )
                        mem_found = True
                except Exception as e:
                    logger.debug(f"wmic memory method failed: {e}")

                # Method 2: Try PowerShell (modern Windows)
                if not mem_found:
                    try:
                        ps_script = """
                        $os = Get-CimInstance Win32_OperatingSystem
                        $total = [math]::Round($os.TotalVisibleMemorySize / 1024)
                        $free = [math]::Round($os.FreePhysicalMemory / 1024)
                        $used = $total - $free
                        Write-Output "$total|$used|$free"
                        """
                        result = subprocess.run(
                            ["powershell", "-Command", ps_script],
                            capture_output=True,
                            text=True,
                            timeout=5,
                            creationflags=(
                                subprocess.CREATE_NO_WINDOW
                                if hasattr(subprocess, "CREATE_NO_WINDOW")
                                else 0
                            ),
                        )

                        values = result.stdout.strip().split("|")
                        if len(values) == 3:
                            total_mb = int(values[0])
                            used_mb = int(values[1])
                            free_mb = int(values[2])

                            system_info["total_memory"] = f"{total_mb} MB"
                            system_info["used_memory"] = f"{used_mb} MB"
                            system_info["free_memory"] = f"{free_mb} MB"
                            system_info["memory_percent"] = round(
                                (used_mb / total_mb) * 100, 1
                            )
                            mem_found = True
                    except Exception as e:
                        logger.debug(f"PowerShell memory method failed: {e}")

                # Method 3: Try ctypes (most reliable for modern Windows)
                if not mem_found:
                    try:
                        import ctypes

                        class MEMORYSTATUSEX(ctypes.Structure):
                            _fields_ = [
                                ("dwLength", ctypes.c_ulong),
                                ("dwMemoryLoad", ctypes.c_ulong),
                                ("ullTotalPhys", ctypes.c_ulonglong),
                                ("ullAvailPhys", ctypes.c_ulonglong),
                                ("ullTotalPageFile", ctypes.c_ulonglong),
                                ("ullAvailPageFile", ctypes.c_ulonglong),
                                ("ullTotalVirtual", ctypes.c_ulonglong),
                                ("ullAvailVirtual", ctypes.c_ulonglong),
                                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                            ]

                        meminfo = MEMORYSTATUSEX()
                        meminfo.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                        ctypes.windll.kernel32.GlobalMemoryStatusEx(
                            ctypes.byref(meminfo)
                        )

                        total_mb = meminfo.ullTotalPhys // (1024 * 1024)
                        avail_mb = meminfo.ullAvailPhys // (1024 * 1024)
                        used_mb = total_mb - avail_mb

                        system_info["total_memory"] = f"{total_mb} MB"
                        system_info["used_memory"] = f"{used_mb} MB"
                        system_info["free_memory"] = f"{avail_mb} MB"
                        system_info["memory_percent"] = round(
                            (used_mb / total_mb) * 100, 1
                        )
                    except Exception as e:
                        logger.error(f"ctypes memory method failed: {e}")

            elif platform.system() == "Darwin":
                # macOS memory info
                try:
                    result = subprocess.run(
                        ["sysctl", "-n", "hw.memsize"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    total_bytes = int(result.stdout.strip())
                    total_mb = total_bytes // (1024 * 1024)
                    system_info["total_memory"] = f"{total_mb} MB"

                    result = subprocess.run(
                        ["vm_stat"], capture_output=True, text=True, timeout=5
                    )
                    vm_lines = result.stdout.split("\n")
                    page_size = 4096
                    pages_free = 0
                    pages_inactive = 0

                    for line in vm_lines:
                        if "Pages free:" in line:
                            pages_free = int(line.split(":")[1].strip().rstrip("."))
                        elif "Pages inactive:" in line:
                            pages_inactive = int(line.split(":")[1].strip().rstrip("."))

                    free_bytes = (pages_free + pages_inactive) * page_size
                    free_mb = free_bytes // (1024 * 1024)
                    used_mb = total_mb - free_mb

                    system_info["used_memory"] = f"{used_mb} MB"
                    system_info["free_memory"] = f"{free_mb} MB"
                    system_info["memory_percent"] = round((used_mb / total_mb) * 100, 1)
                except Exception as e:
                    logger.error(f"Error getting macOS memory: {e}")

        except Exception as e:
            logger.error(f"Error getting memory info: {e}")

    except Exception as e:
        logger.error(f"Error getting system info: {e}")

    return system_info


@app.get("/api/status")
async def get_status():
    """Get script status with last log lines from appropriate log file"""
    global current_process, current_mode

    # Check if manual process is running
    manual_is_running = current_process is not None and current_process.poll() is None

    # Check if scheduler process is running
    scheduler_is_running = False
    scheduler_pid = None
    if SCHEDULER_AVAILABLE and scheduler:
        scheduler_is_running = scheduler.is_running
        if scheduler_is_running and scheduler.current_process:
            scheduler_pid = scheduler.current_process.pid

    # Combined running status
    is_running = manual_is_running or scheduler_is_running

    # Determine current mode
    effective_mode = current_mode
    if scheduler_is_running and not manual_is_running:
        effective_mode = "scheduled"  # Special mode for scheduler runs

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
        "scheduled": "Scriptlog.log",  # Scheduler runs use Scriptlog
    }

    # If script is running, use current mode
    if is_running and effective_mode:
        active_log = mode_log_map.get(effective_mode, "Scriptlog.log")
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

    # Determine PID to show
    display_pid = None
    if manual_is_running:
        display_pid = current_process.pid
    elif scheduler_is_running:
        display_pid = scheduler_pid

    return {
        "running": is_running,
        "last_logs": last_logs,
        "script_exists": SCRIPT_PATH.exists(),
        "config_exists": CONFIG_PATH.exists(),
        "pid": display_pid,
        "current_mode": effective_mode,
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


@app.post("/api/run-manual")
async def run_manual_mode(request: ManualModeRequest):
    """Run manual mode with custom parameters"""
    global current_process, current_mode

    # Check if already running
    if current_process and current_process.poll() is None:
        raise HTTPException(
            status_code=400,
            detail="Script is already running. Please stop the script first.",
        )

    if not SCRIPT_PATH.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    # Validate required fields
    if not request.picturePath or not request.picturePath.strip():
        raise HTTPException(status_code=400, detail="Picture path is required")

    if not request.titletext or not request.titletext.strip():
        raise HTTPException(status_code=400, detail="Title text is required")

    if not request.folderName or not request.folderName.strip():
        raise HTTPException(status_code=400, detail="Folder name is required")

    if not request.libraryName or not request.libraryName.strip():
        raise HTTPException(status_code=400, detail="Library name is required")

    # Validate season poster
    if request.posterType == "season" and (
        not request.seasonPosterName or not request.seasonPosterName.strip()
    ):
        raise HTTPException(
            status_code=400, detail="Season poster name is required for season posters"
        )

    # Validate title card
    if request.posterType == "titlecard":
        if not request.epTitleName or not request.epTitleName.strip():
            raise HTTPException(
                status_code=400, detail="Episode title name is required for title cards"
            )
        if not request.episodeNumber or not request.episodeNumber.strip():
            raise HTTPException(
                status_code=400, detail="Episode number is required for title cards"
            )
        if not request.seasonPosterName or not request.seasonPosterName.strip():
            raise HTTPException(
                status_code=400, detail="Season name is required for title cards"
            )

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

    # Build command based on poster type
    command = [
        ps_command,
        "-File",
        str(SCRIPT_PATH),
        "-Manual",
        "-PicturePath",
        request.picturePath.strip(),
    ]

    # Add poster type specific switches and parameters
    if request.posterType == "season":
        command.extend(
            [
                "-SeasonPoster",
                "-Titletext",
                request.titletext.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
                "-SeasonPosterName",
                request.seasonPosterName.strip(),
            ]
        )
    elif request.posterType == "collection":
        command.extend(
            [
                "-CollectionCard",
                "-Titletext",
                request.titletext.strip(),
                "-LibraryName",
                request.libraryName.strip(),
            ]
        )
    elif request.posterType == "titlecard":
        command.extend(
            [
                "-TitleCard",
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
                "-EPTitleName",
                request.epTitleName.strip(),
                "-SeasonPosterName",
                request.seasonPosterName.strip(),
                "-EpisodeNumber",
                request.episodeNumber.strip(),
            ]
        )
    else:  # standard
        command.extend(
            [
                "-Titletext",
                request.titletext.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
            ]
        )

    try:
        logger.info(f"Running manual mode with parameters:")
        logger.info(f"  Picture Path: {request.picturePath}")
        logger.info(f"  Type: {request.posterType}")
        if request.posterType == "titlecard":
            logger.info(f"  Folder: {request.folderName}")
            logger.info(f"  Library: {request.libraryName}")
            logger.info(f"  Episode Title: {request.epTitleName}")
            logger.info(f"  Season: {request.seasonPosterName}")
            logger.info(f"  Episode Number: {request.episodeNumber}")
        elif request.posterType == "season":
            logger.info(f"  Title: {request.titletext}")
            logger.info(f"  Folder: {request.folderName}")
            logger.info(f"  Library: {request.libraryName}")
            logger.info(f"  Season: {request.seasonPosterName}")
        elif request.posterType == "collection":
            logger.info(f"  Title: {request.titletext}")
            logger.info(f"  Library: {request.libraryName}")
        else:
            logger.info(f"  Title: {request.titletext}")
            logger.info(f"  Folder: {request.folderName}")
            logger.info(f"  Library: {request.libraryName}")
        logger.info(f"Running command: {' '.join(command)}")

        # Run the manual mode command
        current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        current_mode = "manual"  # Set current mode to manual

        logger.info(f"Started manual mode with PID {current_process.pid}")

        poster_type_display = {
            "standard": "standard poster",
            "season": "season poster",
            "collection": "collection poster",
            "titlecard": "episode title card",
        }

        return {
            "success": True,
            "message": f"Started manual mode for {poster_type_display.get(request.posterType, 'poster')}",
            "pid": current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH."
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error running manual mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/stop")
async def stop_script():
    """Stop running script gracefully - works for both manual and scheduled runs"""
    global current_process, current_mode

    # Check if manual process is running
    manual_running = current_process and current_process.poll() is None

    # Check if scheduler process is running
    scheduler_running = False
    if SCHEDULER_AVAILABLE and scheduler:
        scheduler_running = scheduler.is_running and scheduler.current_process

    # If nothing is running
    if not manual_running and not scheduler_running:
        return {"success": False, "message": "No script is running"}

    try:
        stopped_processes = []

        # Stop manual process if running
        if manual_running:
            try:
                current_process.terminate()
                current_process.wait(timeout=5)
                current_process = None
                current_mode = None
                stopped_processes.append("manual")
            except subprocess.TimeoutExpired:
                current_process.kill()
                current_process = None
                current_mode = None
                stopped_processes.append("manual (force killed after timeout)")

        # Stop scheduler process if running
        if scheduler_running:
            try:
                scheduler.current_process.terminate()
                scheduler.current_process.wait(timeout=5)
                scheduler.current_process = None
                scheduler.is_running = False
                stopped_processes.append("scheduled")
            except subprocess.TimeoutExpired:
                scheduler.current_process.kill()
                scheduler.current_process = None
                scheduler.is_running = False
                stopped_processes.append("scheduled (force killed after timeout)")
            except Exception as e:
                logger.error(f"Error stopping scheduler process: {e}")

        if stopped_processes:
            message = f"Stopped: {', '.join(stopped_processes)}"
            return {"success": True, "message": message}
        else:
            return {"success": False, "message": "Failed to stop processes"}

    except Exception as e:
        logger.error(f"Error stopping script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/force-kill")
async def force_kill_script():
    """Force kill running script immediately - works for both manual and scheduled runs"""
    global current_process, current_mode

    # Check if manual process is running
    manual_running = current_process and current_process.poll() is None

    # Check if scheduler process is running
    scheduler_running = False
    if SCHEDULER_AVAILABLE and scheduler:
        scheduler_running = scheduler.is_running and scheduler.current_process

    # If nothing is running
    if not manual_running and not scheduler_running:
        return {"success": False, "message": "No script is running"}

    try:
        killed_processes = []

        # Kill manual process if running
        if manual_running:
            try:
                current_process.kill()
                current_process.wait(timeout=2)
                current_process = None
                current_mode = None
                killed_processes.append("manual")
                logger.warning("Manual script was force killed")
            except Exception as e:
                logger.error(f"Error force killing manual process: {e}")
                current_process = None
                current_mode = None
                killed_processes.append("manual (cleared)")

        # Kill scheduler process if running
        if scheduler_running:
            try:
                scheduler.current_process.kill()
                scheduler.current_process.wait(timeout=2)
                scheduler.current_process = None
                scheduler.is_running = False
                killed_processes.append("scheduled")
                logger.warning("Scheduled script was force killed")
            except Exception as e:
                logger.error(f"Error force killing scheduler process: {e}")
                scheduler.current_process = None
                scheduler.is_running = False
                killed_processes.append("scheduled (cleared)")

        if killed_processes:
            message = f"Force killed: {', '.join(killed_processes)}"
            return {"success": True, "message": message}
        else:
            return {"success": False, "message": "Failed to kill processes"}

    except Exception as e:
        logger.error(f"Error force killing script: {e}")
        # Try to set to None anyway
        current_process = None
        current_mode = None
        if SCHEDULER_AVAILABLE and scheduler:
            scheduler.current_process = None
            scheduler.is_running = False
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
async def websocket_logs(
    websocket: WebSocket, log_file: Optional[str] = Query("Scriptlog.log")
):
    """
    WebSocket endpoint for REAL-TIME log streaming

    FIXED: Now properly accepts and respects the log_file query parameter
    - Frontend can specify which log file to watch
    - Backend won't override user's manual selection
    - Only auto-switches if user is watching the "active" log for current mode
    """
    await websocket.accept()
    logger.info(f"WebSocket connection established for log: {log_file}")

    # Determine which log file to monitor
    log_path = LOGS_DIR / log_file

    # ✨ NEW: Track if user explicitly requested a specific log file
    user_requested_log = log_file != "Scriptlog.log"  # User manually selected a log

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
                    if stripped:  # Only send non-empty lines
                        await websocket.send_json({"type": "log", "content": stripped})

        # Monitor log file for changes with dynamic log file switching
        last_position = log_path.stat().st_size if log_path.exists() else 0
        last_mode = current_mode
        current_log_file = log_file  # Track current log file being watched

        while True:
            try:
                # ⚡ FASTER POLLING: 0.3s instead of 1s
                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                logger.info("WebSocket log streaming cancelled (connection closed)")
                break

            # ⚡ FIX: Only auto-switch if user didn't manually request a specific log
            # AND the current mode changed
            if (
                not user_requested_log
                and current_mode != last_mode
                and current_mode in mode_log_map
            ):
                new_log_file = mode_log_map[current_mode]

                # Only switch if it's actually a different file
                if new_log_file != current_log_file:
                    logger.info(
                        f"WebSocket auto-switching from {current_log_file} to {new_log_file} (mode: {current_mode})"
                    )

                    current_log_file = new_log_file
                    log_path = LOGS_DIR / new_log_file
                    last_position = log_path.stat().st_size if log_path.exists() else 0

                    # Notify client about log file change
                    await websocket.send_json(
                        {
                            "type": "log_file_changed",
                            "log_file": new_log_file,
                            "mode": current_mode,
                        }
                    )

                last_mode = current_mode
            elif user_requested_log and current_mode != last_mode:
                # User manually requested a log, just update last_mode without switching
                last_mode = current_mode
                logger.debug(
                    f"Mode changed to {current_mode}, but user manually selected {log_file}, not auto-switching"
                )

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

                            # Send new lines immediately as they come
                            for line in new_lines:
                                stripped = line.strip()
                                if stripped:  # Only send non-empty lines
                                    await websocket.send_json(
                                        {"type": "log", "content": stripped}
                                    )

                        last_position = current_size
                except OSError as e:
                    logger.warning(f"Error reading log file: {e}")
                    await asyncio.sleep(1)  # Wait longer on file errors

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
    except asyncio.CancelledError:
        logger.info("WebSocket task cancelled during shutdown")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json(
                {"type": "error", "message": f"WebSocket error: {str(e)}"}
            )
        except:
            pass
    finally:
        logger.info("WebSocket connection closed")


@app.get("/api/gallery")
async def get_gallery():
    """Get poster gallery from assets directory (only poster.jpg) - uses cache"""
    try:
        cache = get_fresh_assets()
        # Return cached posters, limit to 200 for performance
        return {"images": cache["posters"][:200]}
    except Exception as e:
        logger.error(f"Error getting gallery from cache: {e}")
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

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {"success": True, "message": f"Poster '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting poster {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/backgrounds-gallery")
async def get_backgrounds_gallery():
    """Get backgrounds gallery from assets directory (only background.jpg) - uses cache"""
    try:
        cache = get_fresh_assets()
        return {"images": cache["backgrounds"][:200]}
    except Exception as e:
        logger.error(f"Error getting backgrounds from cache: {e}")
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

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

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
    """Get seasons gallery from assets directory (only SeasonXX.jpg) - uses cache"""
    try:
        cache = get_fresh_assets()
        return {"images": cache["seasons"][:200]}
    except Exception as e:
        logger.error(f"Error getting seasons from cache: {e}")
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

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {"success": True, "message": f"Season '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting season {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/titlecards-gallery")
async def get_titlecards_gallery():
    """Get title cards gallery from assets directory (only SxxExx.jpg - episodes) - uses cache"""
    try:
        cache = get_fresh_assets()
        return {"images": cache["titlecards"][:200]}
    except Exception as e:
        logger.error(f"Error getting titlecards from cache: {e}")
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

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {"success": True, "message": f"TitleCard '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting titlecard {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================


@app.get("/api/assets-folders")
async def get_assets_folders():
    """Get list of folders in assets directory with image counts per type - uses cache"""
    try:
        cache = get_fresh_assets()
        return {"folders": cache["folders"]}
    except Exception as e:
        logger.error(f"Error getting folders from cache: {e}")
        return {"folders": []}


@app.get("/api/assets-folder-images/{image_type}/{folder_path:path}")
async def get_assets_folder_images_filtered(image_type: str, folder_path: str):
    """Get filtered images from a specific folder - uses cache"""
    # Validate image_type
    valid_types = ["posters", "backgrounds", "seasons", "titlecards"]
    if image_type not in valid_types:
        raise HTTPException(
            status_code=400, detail=f"Invalid image type. Must be one of: {valid_types}"
        )

    try:
        cache = get_fresh_assets()

        # Get the appropriate image list from cache
        all_images = cache[image_type]

        # Filter images that belong to the specified folder
        # folder_path is like "4K" or "Movies/ActionMovies"
        filtered_images = [
            img
            for img in all_images
            if img["path"].startswith(folder_path + "/")
            or img["path"].startswith(folder_path + "\\")
        ]

        return {"images": filtered_images}
    except Exception as e:
        logger.error(f"Error getting folder images from cache: {e}")
        return {"images": []}


async def fetch_version(local_filename: str, github_url: str, version_type: str):
    """
    A reusable function to get a local version from a file and fetch the remote
    version from GitHub when running in a Docker environment.
    """
    local_version = None
    remote_version = None

    # --- 1. Get Local Version ---
    try:
        version_file = BASE_DIR / local_filename
        if version_file.exists():
            local_version = version_file.read_text().strip()
    except Exception as e:
        logger.error(f"Error reading local {version_type} version file: {e}")

    # --- 2. Get Remote Version (if in Docker) ---
    if IS_DOCKER:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(github_url, timeout=10.0)
                response.raise_for_status()
                remote_version = response.text.strip()
                logger.info(
                    f"Successfully fetched remote {version_type} version: {remote_version}"
                )
        except httpx.RequestError as e:
            logger.warning(
                f"Could not fetch remote {version_type} version from GitHub: {e}"
            )
        except Exception as e:
            logger.error(
                f"An unexpected error occurred while fetching remote {version_type} version: {e}"
            )

    return {"local": local_version, "remote": remote_version}


async def get_script_version():
    """
    Reads the version from Posterizarr.ps1 and compares with GitHub Release.txt
    Similar to the PowerShell CompareScriptVersion function

    NOW WITH SEMANTIC VERSION COMPARISON!
    """
    local_version = None
    remote_version = None

    # --- 1. Get Local Version from Posterizarr.ps1 ---
    try:
        # Use the already defined SCRIPT_PATH
        posterizarr_path = SCRIPT_PATH

        logger.info(f"Looking for Posterizarr.ps1 at: {posterizarr_path}")

        if posterizarr_path.exists():
            with open(posterizarr_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Extract version using regex: $CurrentScriptVersion = "1.9.95"
            match = re.search(r'\$CurrentScriptVersion\s*=\s*"([^"]+)"', content)
            if match:
                local_version = match.group(1)
                logger.info(
                    f"Local script version from Posterizarr.ps1: {local_version}"
                )
            else:
                logger.warning(
                    "Could not find $CurrentScriptVersion in Posterizarr.ps1"
                )
        else:
            logger.error(f"Posterizarr.ps1 not found at {posterizarr_path}")
    except Exception as e:
        logger.error(f"Error reading version from Posterizarr.ps1: {e}")

    # --- 2. Get Remote Version from GitHub Release.txt ---
    # Always fetch from GitHub (both Docker and local)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://raw.githubusercontent.com/fscorrupt/Posterizarr/refs/heads/main/Release.txt",
                timeout=10.0,
            )
            response.raise_for_status()
            remote_version = response.text.strip()
            logger.info(f"Remote version from GitHub Release.txt: {remote_version}")
    except httpx.RequestError as e:
        logger.warning(f"Could not fetch remote version from GitHub: {e}")
    except Exception as e:
        logger.error(f"Error fetching remote version: {e}")

    # --- 3. SEMANTIC VERSION COMPARISON ---
    is_update_available = False
    if local_version and remote_version:
        is_update_available = is_version_newer(local_version, remote_version)
        logger.info(
            f"Update available: {is_update_available} (local: {local_version}, remote: {remote_version})"
        )

    return {
        "local": local_version,
        "remote": remote_version,
        "is_update_available": is_update_available,  # NEU: Boolean für Update-Verfügbarkeit
    }


@app.get("/api/version")
async def get_version():
    """
    Gets script version from Posterizarr.ps1 and compares with GitHub Release.txt
    """
    return await get_script_version()


@app.get("/api/releases")
async def get_github_releases():
    """
    Holt alle Releases von GitHub und gibt sie formatiert zurück
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/repos/fscorrupt/Posterizarr/releases",
                headers={"Accept": "application/vnd.github.v3+json"},
                timeout=10.0,
            )
            response.raise_for_status()
            releases = response.json()

            # Formatiere die Releases für die Frontend-Anzeige
            formatted_releases = []
            for release in releases[:10]:  # Nur die letzten 10 Releases
                published_date = datetime.fromisoformat(
                    release["published_at"].replace("Z", "+00:00")
                )
                days_ago = (datetime.now(published_date.tzinfo) - published_date).days

                formatted_releases.append(
                    {
                        "version": release["tag_name"],
                        "name": release["name"],
                        "published_at": release["published_at"],
                        "days_ago": days_ago,
                        "is_prerelease": release["prerelease"],
                        "is_draft": release["draft"],
                        "html_url": release["html_url"],
                        "body": release["body"],  # Changelog-Text
                    }
                )

            return {"success": True, "releases": formatted_releases}

    except httpx.RequestError as e:
        logger.error(f"Could not fetch releases from GitHub: {e}")
        return {
            "success": False,
            "error": "Could not fetch releases from GitHub",
            "releases": [],
        }
    except Exception as e:
        logger.error(f"Error fetching releases: {e}")
        return {"success": False, "error": str(e), "releases": []}


@app.get("/api/assets/stats")
async def get_assets_stats():
    """
    Gibt Statistiken über die erstellten Assets zurück - verwendet Cache
    """
    try:
        # Nutze den vorhandenen Cache statt neu zu scannen
        cache = get_fresh_assets()

        # Berechne Gesamtgröße aus Cache
        total_size = sum(img["size"] for img in cache["posters"])
        total_size += sum(img["size"] for img in cache["backgrounds"])
        total_size += sum(img["size"] for img in cache["seasons"])
        total_size += sum(img["size"] for img in cache["titlecards"])

        sorted_folders = sorted(
            cache["folders"], key=lambda x: x["files"], reverse=True
        )

        stats = {
            "posters": len(cache["posters"]),
            "backgrounds": len(cache["backgrounds"]),
            "seasons": len(cache["seasons"]),
            "titlecards": len(cache["titlecards"]),
            "total_size": total_size,
            "folders": sorted_folders[:10],  # Top 10 Ordner nach Dateianzahl
        }

        return {"success": True, "stats": stats}

    except Exception as e:
        logger.error(f"Error getting asset stats: {e}")
        return {"success": False, "error": str(e), "stats": {}}


@app.post("/api/refresh-cache")
async def refresh_cache():
    """Manually refresh the asset cache"""
    try:
        scan_and_cache_assets()
        return {
            "success": True,
            "message": "Cache refreshed successfully",
            "posters": len(asset_cache["posters"]),
            "backgrounds": len(asset_cache["backgrounds"]),
            "seasons": len(asset_cache["seasons"]),
            "titlecards": len(asset_cache["titlecards"]),
            "folders": len(asset_cache["folders"]),
        }
    except Exception as e:
        logger.error(f"Error refreshing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cache/status")
async def get_cache_status():
    """Get detailed cache status including background refresh info"""
    try:
        now = time.time()
        last_scan = asset_cache.get("last_scanned", 0)
        age_seconds = now - last_scan if last_scan > 0 else 0

        # Robustes Thread-Checking
        thread_alive = False
        try:
            if cache_refresh_task is not None:
                thread_alive = cache_refresh_task.is_alive()
        except Exception:
            thread_alive = False

        return {
            "success": True,
            "cache": {
                "last_scanned": (
                    datetime.fromtimestamp(last_scan).isoformat()
                    if last_scan > 0
                    else None
                ),
                "age_seconds": int(age_seconds),
                "ttl_seconds": CACHE_TTL_SECONDS,
                "refresh_interval": CACHE_REFRESH_INTERVAL,
                "is_stale": False,  # TTL-Check entfernt, Cache ist immer gültig
                "posters_count": len(asset_cache.get("posters", [])),
                "backgrounds_count": len(asset_cache.get("backgrounds", [])),
                "seasons_count": len(asset_cache.get("seasons", [])),
                "titlecards_count": len(asset_cache.get("titlecards", [])),
                "folders_count": len(asset_cache.get("folders", [])),
            },
            "background_refresh": {
                "running": cache_refresh_running,
                "thread_alive": thread_alive,
                "scan_in_progress": cache_scan_in_progress,
            },
        }
    except Exception as e:
        logger.error(f"Error getting cache status: {e}")
        # Gib trotzdem eine gültige Response zurück
        return {
            "success": False,
            "error": str(e),
            "cache": {
                "posters_count": 0,
                "backgrounds_count": 0,
                "seasons_count": 0,
                "titlecards_count": 0,
                "folders_count": 0,
            },
            "background_refresh": {
                "running": False,
                "thread_alive": False,
                "scan_in_progress": False,
            },
        }


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
# Using CachedStaticFiles for better performance with browser caching
if ASSETS_DIR.exists():
    app.mount(
        "/poster_assets",
        CachedStaticFiles(directory=str(ASSETS_DIR), max_age=86400),  # 24h Cache
        name="poster_assets",
    )
    logger.info(f"Mounted /poster_assets -> {ASSETS_DIR} (with 24h cache)")

if TEST_DIR.exists():
    app.mount(
        "/test",
        CachedStaticFiles(directory=str(TEST_DIR), max_age=86400),  # 24h Cache
        name="test",
    )
    logger.info(f"Mounted /test -> {TEST_DIR} (with 24h cache)")

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    logger.info(f"Mounted frontend from {FRONTEND_DIR}")

# ============================================================================
# SCHEDULER API ENDPOINTS
# ============================================================================


@app.get("/api/scheduler/status")
async def get_scheduler_status():
    """Get current scheduler status and configuration"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        status = scheduler.get_status()
        return {"success": True, **status}
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/scheduler/config")
async def get_scheduler_config():
    """Get scheduler configuration"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        config = scheduler.load_config()
        return {"success": True, "config": config}
    except Exception as e:
        logger.error(f"Error loading scheduler config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/config")
async def update_scheduler_config(data: ScheduleUpdate):
    """Update scheduler configuration"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        updates = {}
        if data.enabled is not None:
            updates["enabled"] = data.enabled
        if data.schedules is not None:
            updates["schedules"] = data.schedules
        if data.timezone is not None:
            updates["timezone"] = data.timezone
        if data.skip_if_running is not None:
            updates["skip_if_running"] = data.skip_if_running

        config = scheduler.update_config(updates)

        # Restart scheduler if enabled
        if config.get("enabled", False):
            scheduler.restart()
        else:
            scheduler.stop()

        return {
            "success": True,
            "message": "Scheduler configuration updated",
            "config": config,
        }
    except Exception as e:
        logger.error(f"Error updating scheduler config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/schedule")
async def add_schedule(data: ScheduleCreate):
    """Add a new schedule"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        success = scheduler.add_schedule(data.time, data.description)
        if success:
            return {"success": True, "message": f"Schedule added: {data.time}"}
        else:
            raise HTTPException(
                status_code=400, detail="Invalid time format or schedule already exists"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/scheduler/schedule/{time}")
async def remove_schedule(time: str):
    """Remove a schedule by time"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        # Replace URL encoded colon if needed
        time = time.replace("%3A", ":")

        success = scheduler.remove_schedule(time)
        if success:
            return {"success": True, "message": f"Schedule removed: {time}"}
        else:
            raise HTTPException(status_code=404, detail="Schedule not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/scheduler/schedules")
async def clear_all_schedules():
    """Remove all schedules"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        scheduler.clear_schedules()
        return {"success": True, "message": "All schedules cleared"}
    except Exception as e:
        logger.error(f"Error clearing schedules: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/enable")
async def enable_scheduler():
    """Enable the scheduler"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        config = scheduler.update_config({"enabled": True})
        scheduler.restart()
        return {"success": True, "message": "Scheduler enabled", "config": config}
    except Exception as e:
        logger.error(f"Error enabling scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/disable")
async def disable_scheduler():
    """Disable the scheduler"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        config = scheduler.update_config({"enabled": False})
        scheduler.stop()
        return {"success": True, "message": "Scheduler disabled", "config": config}
    except Exception as e:
        logger.error(f"Error disabling scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/restart")
async def restart_scheduler():
    """Restart the scheduler with current configuration"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        scheduler.restart()
        status = scheduler.get_status()
        return {"success": True, "message": "Scheduler restarted", **status}
    except Exception as e:
        logger.error(f"Error restarting scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/scheduler/run-now")
async def run_scheduler_now():
    """Manually trigger a scheduled run immediately"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        # Run in background without waiting
        asyncio.create_task(scheduler.run_script())
        return {"success": True, "message": "Scheduled run triggered"}
    except Exception as e:
        logger.error(f"Error triggering scheduled run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
