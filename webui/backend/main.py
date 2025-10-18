from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    Query,
    Request,
    UploadFile,
    File,
)
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
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
import requests
import threading
from datetime import datetime
import xml.etree.ElementTree as ET
import sys

sys.path.insert(0, str(Path(__file__).parent))

# Check if running in Docker
IS_DOCKER = (
    os.path.exists("/.dockerenv")
    or os.environ.get("DOCKER_ENV", "").lower() == "true"
    or os.environ.get("POSTERIZARR_NON_ROOT", "").lower() == "true"
)

if IS_DOCKER:
    BASE_DIR = Path("/config")
    APP_DIR = Path("/app")
    ASSETS_DIR = Path("/assets")
    IMAGES_DIR = Path("/app/images")
    FRONTEND_DIR = Path("/app/frontend/dist")
else:
    # Local: webui/backend/main.py -> project root (3 levels up)
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    BASE_DIR = PROJECT_ROOT
    APP_DIR = PROJECT_ROOT
    ASSETS_DIR = PROJECT_ROOT / "assets"
    IMAGES_DIR = PROJECT_ROOT / "images"
    FRONTEND_DIR = PROJECT_ROOT / "webui" / "frontend" / "dist"
    ASSETS_DIR.mkdir(exist_ok=True)

# Ensure directories exist locally
SUBDIRS_TO_CREATE = [
    "Logs",
    "temp",
    "test",
    "UILogs",
    "uploads",
    "fontpreviews",
    "database",
]

# Creating all directories in a single loop
for subdir in SUBDIRS_TO_CREATE:
    (BASE_DIR / subdir).mkdir(parents=True, exist_ok=True)

CONFIG_PATH = BASE_DIR / "config.json"
CONFIG_EXAMPLE_PATH = BASE_DIR / "config.example.json"
SCRIPT_PATH = APP_DIR / "Posterizarr.ps1"
LOGS_DIR = BASE_DIR / "Logs"
TEST_DIR = BASE_DIR / "test"
TEMP_DIR = BASE_DIR / "temp"
UI_LOGS_DIR = BASE_DIR / "UILogs"
OVERLAYFILES_DIR = BASE_DIR / "Overlayfiles"
UPLOADS_DIR = BASE_DIR / "uploads"
FONTPREVIEWS_DIR = BASE_DIR / "fontpreviews"
DATABASE_DIR = BASE_DIR / "database"
RUNNING_FILE = TEMP_DIR / "Posterizarr.Running"
IMAGECHOICES_DB_PATH = DATABASE_DIR / "imagechoices.db"

# Clear UILogs on startup - remove all log files
import glob

for log_file in glob.glob(str(UI_LOGS_DIR / "*.log")):
    try:
        os.remove(log_file)
    except Exception as e:
        pass  # Ignore errors during cleanup

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    filename=UI_LOGS_DIR / "BackendServer.log",  # Main backend server log file
    filemode="w",  # Overwrite the log file on each startup
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logging.getLogger("httpx").setLevel(logging.INFO)
logger = logging.getLogger(__name__)

# Create Overlayfiles directory if it doesn't exist
OVERLAYFILES_DIR.mkdir(exist_ok=True)

# Create uploads directory if it doesn't exist
UPLOADS_DIR.mkdir(exist_ok=True)

if not CONFIG_PATH.exists() and CONFIG_EXAMPLE_PATH.exists():
    logger.warning(f"config.json not found, using config.example.json as fallback")
    CONFIG_PATH = CONFIG_EXAMPLE_PATH


def setup_backend_ui_logger():
    """Setup backend logger to also write to FrontendUI.log"""
    try:
        # Create UILogs directory if not exists
        UI_LOGS_DIR.mkdir(exist_ok=True)

        # CLEANUP: Delete old log files on startup
        backend_log_path = UI_LOGS_DIR / "FrontendUI.log"
        if backend_log_path.exists():
            backend_log_path.unlink()
            logger.info(f"🗑️  Cleared old FrontendUI.log")

        # Create File Handler for FrontendUI.log
        backend_ui_handler = logging.FileHandler(
            backend_log_path, encoding="utf-8", mode="w"
        )
        backend_ui_handler.setLevel(logging.DEBUG)  # All levels
        backend_ui_handler.setFormatter(
            logging.Formatter(
                "[%(asctime)s] [%(levelname)-8s] |BACKEND| %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )

        # Add handler to root logger (so all backend logs are captured)
        logging.getLogger().addHandler(backend_ui_handler)

        logger.info(f"✅ Backend logger initialized: {backend_log_path}")
        logger.info("Backend logging to FrontendUI.log enabled")

    except Exception as e:
        logger.warning(f"⚠️  Could not initialize backend UI logger: {e}")


# Initialize Backend UI Logger on startup
setup_backend_ui_logger()

try:
    from config_mapper import (
        flatten_config,
        unflatten_config,
        UI_GROUPS,
        DISPLAY_NAMES,
        get_display_name,
        get_tooltip,
    )

    # Import tooltips
    from config_tooltips import CONFIG_TOOLTIPS

    CONFIG_MAPPER_AVAILABLE = True
    logger.info("Config mapper loaded successfully")
except ImportError as e:
    CONFIG_MAPPER_AVAILABLE = False
    CONFIG_TOOLTIPS = {}  # Fallback if config_tooltips not available
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

# Import auth middleware for Basic Authentication
try:
    from auth_middleware import BasicAuthMiddleware, load_auth_config

    AUTH_MIDDLEWARE_AVAILABLE = True
    logger.info("Auth middleware loaded successfully")
except ImportError as e:
    AUTH_MIDDLEWARE_AVAILABLE = False
    logger.warning(f"Auth middleware not available: {e}. Basic Auth will be disabled.")

# Import database module
try:
    from database import init_database, ImageChoicesDB

    DATABASE_AVAILABLE = True
    logger.info("Database module loaded successfully")
except ImportError as e:
    DATABASE_AVAILABLE = False
    logger.warning(
        f"Database module not available: {e}. Database features will be disabled."
    )

# Import runtime database module
try:
    from runtime_database import runtime_db
    from runtime_parser import parse_runtime_from_log, save_runtime_to_db

    RUNTIME_DB_AVAILABLE = True
    logger.info("Runtime database module loaded successfully")
except ImportError as e:
    RUNTIME_DB_AVAILABLE = False
    runtime_db = None
    logger.warning(
        f"Runtime database not available: {e}. Runtime tracking will be disabled."
    )

current_process: Optional[subprocess.Popen] = None
current_mode: Optional[str] = None
scheduler: Optional["PosterizarrScheduler"] = None
db: Optional["ImageChoicesDB"] = None

# Initialize cache variables early to prevent race conditions
cache_refresh_task = None
cache_refresh_running = False
cache_scan_in_progress = False


def import_imagechoices_to_db():
    """
    Import ImageChoices.csv from Logs directory to database
    Only imports new records that don't already exist
    """
    if not DATABASE_AVAILABLE or db is None:
        logger.debug("Database not available, skipping CSV import")
        return

    csv_path = LOGS_DIR / "ImageChoices.csv"
    if not csv_path.exists():
        logger.debug("ImageChoices.csv does not exist yet, skipping import")
        return

    try:
        logger.info("📊 Importing ImageChoices.csv to database...")
        stats = db.import_from_csv(csv_path)

        if stats["added"] > 0:
            logger.info(
                f"✅ CSV import successful: {stats['added']} new record(s) added, "
                f"{stats['skipped']} skipped (already exist), "
                f"{stats['errors']} error(s)"
            )
        else:
            logger.debug(
                f"CSV import: No new records to add ({stats['skipped']} already exist)"
            )

        if stats["errors"] > 0:
            logger.warning(f"Import errors: {stats['error_details']}")

    except Exception as e:
        logger.error(f"❌ Error importing CSV to database: {e}")


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


class CachedStaticFiles(StaticFiles):
    """StaticFiles with Cache-Control headers for browser caching"""

    def __init__(self, *args, max_age: int = 3600, **kwargs):
        self.max_age = max_age
        super().__init__(*args, **kwargs)

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = f"public, max-age={self.max_age}"
        return response


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
CACHE_TTL_SECONDS = 180  # Cache data for 3 minutes (only for statistics)
CACHE_REFRESH_INTERVAL = 180  # Refresh cache every 3 minutes for faster gallery updates

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

    # Prevent overlapping scans (thread-safe)
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

            # Count files and size for the folder
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
        cache_scan_in_progress = False  # Release lock
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
            # Wait until the next refresh
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
    # Fully rely on background refresh!
    # Only perform a synchronous scan if the cache is completely empty (first startup)
    if asset_cache["last_scanned"] == 0:
        logger.info("First-time cache population...")
        scan_and_cache_assets()
    return asset_cache


def find_poster_in_assets(
    rootfolder: str,
    asset_type: str = "Poster",
    title: str = "",
    download_source: str = "",
) -> str:
    """
    Search recursively in ASSETS_DIR for a folder matching rootfolder and return image URL

    Args:
        rootfolder: The rootfolder name from ImageChoices.csv (e.g. "1 Million Followers (2024) {tmdb-1117126}")
        asset_type: Type of asset ("Poster", "Season", "TitleCard", "Title_Card", "Background", "Episode", "Show")
        title: Full title from CSV (used to extract Season/Episode info)
        download_source: Path from CSV (for manually created assets, contains actual file path)

    Returns:
        URL path to image or None if not found
    """
    if not ASSETS_DIR.exists():
        return None

    try:
        # If download_source is a local path, try to extract the filename from it
        image_filename = None
        if download_source and download_source != "N/A":
            # Check if it looks like a file path (has backslashes or forward slashes and contains a file extension)
            if (
                "\\" in download_source or "/" in download_source
            ) and "." in download_source:
                # Extract filename from path (e.g., "C:\...\S01E02.jpg" -> "S01E02.jpg")
                import os

                image_filename = os.path.basename(download_source)
                logger.info(
                    f"🔍 Extracted filename from download_source: {image_filename} (from: {download_source})"
                )

        # Search recursively for the folder
        for item in ASSETS_DIR.rglob("*"):
            if item.is_dir() and item.name == rootfolder:
                # Found the matching folder
                image_file = None

                # First priority: use filename from download_source if available
                if image_filename:
                    image_file = item / image_filename
                    logger.info(
                        f"🔍 Checking for file from download_source: {image_file}"
                    )
                    if not image_file.exists():
                        logger.warning(
                            f"❌ File from download_source not found: {image_file}"
                        )
                        image_file = None

                # Second priority: determine by asset type
                if not image_file:
                    if asset_type == "Season":
                        # Extract season number from title (format: "Show Name | Season 01" or "Title SEASON")
                        import re

                        match = re.search(r"Season\s*(\d+)", title, re.IGNORECASE)
                        if match:
                            season_num = match.group(1).zfill(2)  # Pad to 2 digits
                            image_file = item / f"Season{season_num}.jpg"
                            if not image_file.exists():
                                # Try without padding
                                image_file = item / f"Season{match.group(1)}.jpg"
                        else:
                            # If no season number in title, look for any Season*.jpg file
                            import glob

                            season_files = list(item.glob("Season*.jpg"))
                            if season_files:
                                # Use the first Season*.jpg file found
                                image_file = season_files[0]
                                logger.info(
                                    f"🔍 No season number in title, using first found: {image_file.name}"
                                )

                    elif asset_type in ["TitleCard", "Title_Card", "Episode"]:
                        # Extract episode info from title (format: "S01E01 | Episode Title" or just "Episode Title")
                        import re

                        match = re.search(r"(S\d+E\d+)", title, re.IGNORECASE)
                        if match:
                            episode_code = match.group(1).upper()  # e.g. "S01E01"
                            image_file = item / f"{episode_code}.jpg"

                    elif asset_type in [
                        "Background",
                        "Movie Background",
                        "Show Background",
                        "TV Background",
                        "Series Background",
                        "Episode Background",
                    ]:
                        # Look for background.jpg in the folder
                        image_file = item / "background.jpg"

                    else:
                        # Default: look for poster.jpg (for "Poster", "Show", or any other type)
                        image_file = item / "poster.jpg"

                # Check if the image file exists
                if image_file and image_file.exists() and image_file.is_file():
                    # Create relative path from ASSETS_DIR
                    relative_path = image_file.relative_to(ASSETS_DIR)
                    # Create URL path with forward slashes
                    url_path = str(relative_path).replace("\\", "/")
                    logger.info(f"✅ Found image: {url_path}")
                    return f"/poster_assets/{url_path}"

        logger.warning(
            f"❌ No image found for rootfolder: {rootfolder}, type: {asset_type}"
        )
        return None

    except Exception as e:
        logger.error(f"Error searching for {asset_type} in assets: {e}")
        return None


def parse_image_choices_csv(csv_path: Path) -> list:
    """
    Parse ImageChoices.csv file and return list of assets
    CSV format: "Title";"Type";"Rootfolder";"LibraryName";"Language";"Fallback";"TextTruncated";"Download Source";"Fav Provider Link"

    Skips empty rows where all fields are empty (no assets created during script run)
    """
    import csv

    assets = []

    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            # CSV uses semicolon as delimiter
            reader = csv.DictReader(f, delimiter=";")

            for row in reader:
                # Skip empty rows (all fields are empty or just semicolons)
                title = row.get("Title", "").strip('"').strip()
                rootfolder = row.get("Rootfolder", "").strip('"').strip()

                # If both title and rootfolder are empty, this is an empty row
                if not title and not rootfolder:
                    continue

                # Remove quotes from values if present
                download_source = row.get("Download Source", "").strip('"')
                provider_link = row.get("Fav Provider Link", "").strip('"')

                # Determine if manually created (download_source is N/A or a local path)
                is_manually_created = download_source == "N/A" or (
                    download_source
                    and (
                        download_source.startswith("C:")
                        or download_source.startswith("/")
                        or download_source.startswith("\\")
                    )
                )

                asset = {
                    "title": row.get("Title", "").strip('"'),
                    "type": row.get("Type", "").strip('"'),
                    "rootfolder": row.get("Rootfolder", "").strip('"'),
                    "library": row.get("LibraryName", "").strip('"'),
                    "language": row.get("Language", "").strip('"'),
                    "fallback": row.get("Fallback", "").strip('"').lower() == "true",
                    "text_truncated": row.get("TextTruncated", "").strip('"').lower()
                    == "true",
                    "download_source": download_source,
                    "provider_link": provider_link if provider_link != "N/A" else "",
                    "is_manually_created": is_manually_created,
                }
                assets.append(asset)

    except Exception as e:
        logger.error(f"Error parsing CSV {csv_path}: {e}")
        raise

    return assets


async def fetch_version(local_filename: str, github_url: str, version_type: str):
    """
    A reusable function to get a local version from a file and fetch the remote
    version from GitHub when running in a Docker environment.
    """
    local_version = None
    remote_version = None

    # Get Local Version
    try:
        version_file = BASE_DIR / local_filename
        if version_file.exists():
            local_version = version_file.read_text().strip()
    except Exception as e:
        logger.error(f"Error reading local {version_type} version file: {e}")

    # Get Remote Version (if in Docker)
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

    # Check if local version is greater than remote (development version)
    display_version = local_version
    if local_version and remote_version:
        local_parsed = parse_version(local_version)
        remote_parsed = parse_version(remote_version)

        if local_parsed and remote_parsed and local_parsed > remote_parsed:
            # Local version is ahead of GitHub - add -dev suffix
            display_version = f"{local_version}-dev"
            logger.info(
                f"Local {version_type} version {local_version} is ahead of remote {remote_version}, adding -dev suffix"
            )

    return {"local": display_version, "remote": remote_version}


async def get_script_version():
    """
    Reads the version from Posterizarr.ps1 and compares with GitHub Release.txt
    Similar to the PowerShell CompareScriptVersion function

    NOW WITH SEMANTIC VERSION COMPARISON!
    """
    local_version = None
    remote_version = None

    # Get Local Version from Posterizarr.ps1
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

    # Get Remote Version from GitHub Release.txt
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

    # SEMANTIC VERSION COMPARISON
    is_update_available = False
    display_version = local_version

    if local_version and remote_version:
        is_update_available = is_version_newer(local_version, remote_version)

        # Check if local version is GREATER than remote (development version)
        local_parsed = parse_version(local_version)
        remote_parsed = parse_version(remote_version)

        if local_parsed and remote_parsed and local_parsed > remote_parsed:
            # Local version is ahead of GitHub - add -dev suffix
            display_version = f"{local_version}-dev"
            logger.info(
                f"Local version {local_version} is ahead of remote {remote_version}, adding -dev suffix"
            )

        logger.info(
            f"Update available: {is_update_available} (local: {local_version}, remote: {remote_version})"
        )

    return {
        "local": display_version,
        "remote": remote_version,
        "is_update_available": is_update_available,  # Boolean for update availability
    }


class SPAMiddleware(BaseHTTPMiddleware):
    """
    Middleware for Single Page Application Support
    Catches 404 errors and returns index.html for React Router
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # If 404 and NOT an API route and NOT a static file
        if response.status_code == 404:
            path = request.url.path

            # Only for HTML routes (no API, no assets)
            if not path.startswith(("/api", "/poster_assets", "/test", "/_assets")):
                # Return index.html (React Router takes over)
                index_path = FRONTEND_DIR / "index.html"
                if index_path.exists():
                    return FileResponse(index_path)

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    global scheduler, db

    # Startup: Pre-populate asset cache
    logger.info("Starting Posterizarr Web UI Backend")
    scan_and_cache_assets()

    # Start background cache refresh
    start_cache_refresh_background()

    # Initialize database if available
    if DATABASE_AVAILABLE:
        try:
            logger.info("📊 Initializing imagechoices database...")

            # Check if database exists before initialization
            db_existed_before = IMAGECHOICES_DB_PATH.exists()

            # Initialize database (creates if not exists)
            db = init_database(IMAGECHOICES_DB_PATH)

            # If database was just created (first start), check for existing CSV to import
            if not db_existed_before:
                csv_path = LOGS_DIR / "ImageChoices.csv"
                if csv_path.exists():
                    logger.info(
                        "📥 Found existing ImageChoices.csv - importing to new database..."
                    )
                    try:
                        stats = db.import_from_csv(csv_path)
                        if stats["added"] > 0:
                            logger.info(
                                f"✅ Initialized database with {stats['added']} records from existing CSV"
                            )
                        else:
                            logger.info(
                                "ℹ️  No records imported from CSV (all empty or invalid)"
                            )
                    except Exception as csv_error:
                        logger.warning(f"⚠️  Could not import existing CSV: {csv_error}")
                else:
                    logger.info("ℹ️  No existing CSV found - database initialized empty")

            # Check if database has any records
            try:
                record_count = len(db.get_all_choices())
                logger.info(
                    f"✅ Database ready: {IMAGECHOICES_DB_PATH} ({record_count} records)"
                )
            except Exception:
                logger.info(f"✅ Database ready: {IMAGECHOICES_DB_PATH}")

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            db = None
    else:
        logger.info("Database module not available, skipping database initialization")

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

    if db:
        try:
            db.close()
            logger.info("Database connection closed")
        except Exception as e:
            logger.error(f"Error closing database: {e}")

    logger.info("Shutting down Posterizarr Web UI Backend")


app = FastAPI(title="Posterizarr Web UI", lifespan=lifespan)

# Add exception handler for validation errors
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Custom handler for validation errors with detailed logging"""
    logger.error(f"Validation error for {request.method} {request.url}")
    logger.error(f"Request body: {await request.body()}")
    logger.error(f"Validation errors: {exc.errors()}")
    return JSONResponse(
        status_code=400,
        content={"detail": exc.errors(), "body": str(exc.body)},
    )


# Basic Auth Middleware
if AUTH_MIDDLEWARE_AVAILABLE:
    try:
        # The middleware now loads the config dynamically with every request!
        app.add_middleware(
            BasicAuthMiddleware,
            config_path=CONFIG_PATH,  #  CHANGED: Only pass config_path
        )
        logger.info("Basic Auth middleware registered with dynamic config reload")
    except Exception as e:
        logger.error(f"Failed to initialize Basic Auth: {e}")
else:
    logger.info("Basic Auth middleware not available, skipping")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SPAMiddleware)
logger.info("✅ SPA Middleware enabled - React Router support active")


class ConfigUpdate(BaseModel):
    config: dict


class ResetPostersRequest(BaseModel):
    library: str


class ManualModeRequest(BaseModel):
    model_config = {"extra": "ignore"}  # Ignore extra fields from frontend

    picturePath: str
    titletext: str
    folderName: str
    libraryName: str
    posterType: Literal[
        "standard", "season", "collection", "titlecard", "background"
    ] = "standard"
    seasonPosterName: str = ""
    epTitleName: str = ""
    episodeNumber: str = ""


class UILogEntry(BaseModel):
    level: str  # "log", "warn", "error", "info", "debug"
    message: str
    timestamp: str
    source: str = "ui"


class UILogBatch(BaseModel):
    logs: list[UILogEntry]


class ScheduleCreate(BaseModel):
    time: str  # Format: "HH:MM"
    description: Optional[str] = ""


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    schedules: Optional[List[dict]] = None
    timezone: Optional[str] = None
    skip_if_running: Optional[bool] = None


class TMDBSearchRequest(BaseModel):
    query: str  # Can be title or TMDB ID
    media_type: str = "movie"  # "movie" or "tv"
    poster_type: str = "standard"  # "standard", "season", "titlecard"
    year: Optional[int] = None  # Year for search (required for numeric titles)
    season_number: Optional[int] = None  # For season posters and titlecards
    episode_number: Optional[int] = None  # For titlecards only


class PlexValidationRequest(BaseModel):
    url: str
    token: str


class JellyfinValidationRequest(BaseModel):
    url: str
    api_key: str


class EmbyValidationRequest(BaseModel):
    url: str
    api_key: str


class TMDBValidationRequest(BaseModel):
    token: str


class TVDBValidationRequest(BaseModel):
    api_key: str
    pin: Optional[str] = None


class FanartValidationRequest(BaseModel):
    api_key: str


class DiscordValidationRequest(BaseModel):
    webhook_url: str


class AppriseValidationRequest(BaseModel):
    url: str


class UptimeKumaValidationRequest(BaseModel):
    url: str


@app.get("/api")
async def api_root():
    return {"message": "Posterizarr Web UI API", "status": "running"}


@app.get("/api/auth/check")
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
                "authenticated": True,  # If this endpoint is reached, user is authenticated
            }
        except Exception as e:
            logger.error(f"Error checking auth config: {e}")
            return {"enabled": False, "authenticated": True, "error": str(e)}
    else:
        return {"enabled": False, "authenticated": True}


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
                "tooltips": CONFIG_TOOLTIPS,  # Send tooltips to frontend
                "using_flat_structure": True,
            }
        else:
            # Fallback: return grouped structure as-is
            return {
                "success": True,
                "config": grouped_config,
                "tooltips": {},  # Empty object as fallback
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


# ============================================================================
# OVERLAY FILES ENDPOINTS
# ============================================================================


@app.get("/api/overlayfiles")
async def get_overlay_files():
    """Get list of overlay files from Overlayfiles directory"""
    try:
        if not OVERLAYFILES_DIR.exists():
            OVERLAYFILES_DIR.mkdir(exist_ok=True)
            return {"success": True, "files": []}

        # Get all image and font files (png, jpg, jpeg, ttf, otf, woff, woff2)
        allowed_extensions = {
            ".png",
            ".jpg",
            ".jpeg",
            ".ttf",
            ".otf",
            ".woff",
            ".woff2",
        }
        files = []

        for f in OVERLAYFILES_DIR.iterdir():
            if f.is_file() and f.suffix.lower() in allowed_extensions:
                file_info = {
                    "name": f.name,
                    "type": (
                        "image"
                        if f.suffix.lower() in {".png", ".jpg", ".jpeg"}
                        else "font"
                    ),
                    "extension": f.suffix.lower(),
                    "size": f.stat().st_size,
                }
                files.append(file_info)

        # Sort alphabetically by name
        files.sort(key=lambda x: x["name"])

        logger.info(f"Found {len(files)} overlay files")
        return {"success": True, "files": files}

    except Exception as e:
        logger.error(f"Error getting overlay files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/overlayfiles/upload")
async def upload_overlay_file(file: UploadFile = File(...)):
    """Upload a new overlay file to Overlayfiles directory"""
    try:
        # Validate file type - images and fonts
        allowed_extensions = {
            ".png",
            ".jpg",
            ".jpeg",
            ".ttf",
            ".otf",
            ".woff",
            ".woff2",
        }
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Only PNG, JPG, JPEG, TTF, OTF, WOFF, and WOFF2 files are allowed.",
            )

        # Sanitize filename (remove dangerous characters)
        safe_filename = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        # Save file
        file_path = OVERLAYFILES_DIR / safe_filename

        # Check if file already exists
        if file_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"File '{safe_filename}' already exists. Please rename or delete the existing file first.",
            )

        # Write file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        logger.info(f"Uploaded overlay file: {safe_filename} ({len(content)} bytes)")

        return {
            "success": True,
            "message": f"File '{safe_filename}' uploaded successfully",
            "filename": safe_filename,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading overlay file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/overlayfiles/{filename}")
async def delete_overlay_file(filename: str):
    """Delete an overlay file from Overlayfiles directory"""
    try:
        # Sanitize filename
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        # Check if file is in use in config
        # TODO: Optional - check if file is referenced in config and warn user

        # Delete file
        file_path.unlink()

        logger.info(f"Deleted overlay file: {safe_filename}")

        return {
            "success": True,
            "message": f"File '{safe_filename}' deleted successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting overlay file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/overlayfiles/preview/{filename}")
async def preview_overlay_file(filename: str):
    """Serve overlay file for preview"""
    try:
        # Sanitize filename
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        # Serve file
        return FileResponse(
            file_path,
            media_type="image/png",  # Will auto-detect based on extension
            headers={"Cache-Control": "public, max-age=3600"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving overlay file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FONT FILES ENDPOINTS
# ============================================================================


@app.get("/api/fonts")
async def get_font_files():
    """Get list of font files from Overlayfiles directory"""
    try:
        if not OVERLAYFILES_DIR.exists():
            OVERLAYFILES_DIR.mkdir(exist_ok=True)
            return {"success": True, "files": []}

        # Get all font files (ttf, otf, woff, woff2)
        font_extensions = {".ttf", ".otf", ".woff", ".woff2"}
        files = [
            f.name
            for f in OVERLAYFILES_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in font_extensions
        ]

        # Sort alphabetically
        files.sort()

        logger.info(f"Found {len(files)} font files")
        return {"success": True, "files": files}

    except Exception as e:
        logger.error(f"Error getting font files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fonts/upload")
async def upload_font_file(file: UploadFile = File(...)):
    """Upload a new font file to Overlayfiles directory"""
    try:
        # Validate file type
        allowed_extensions = {".ttf", ".otf", ".woff", ".woff2"}
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Only TTF, OTF, WOFF, and WOFF2 files are allowed.",
            )

        # Sanitize filename (remove dangerous characters)
        safe_filename = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        # Save file
        file_path = OVERLAYFILES_DIR / safe_filename

        # Check if file already exists
        if file_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"File '{safe_filename}' already exists. Please rename or delete the existing file first.",
            )

        # Write file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        logger.info(f"Uploaded font file: {safe_filename} ({len(content)} bytes)")

        return {
            "success": True,
            "message": f"Font '{safe_filename}' uploaded successfully",
            "filename": safe_filename,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading font file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/fonts/{filename}")
async def delete_font_file(filename: str):
    """Delete a font file from Overlayfiles directory"""
    try:
        # Sanitize filename
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        # Delete file
        file_path.unlink()

        logger.info(f"Deleted font file: {safe_filename}")

        return {
            "success": True,
            "message": f"Font '{safe_filename}' deleted successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting font file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fonts/preview/{filename}")
async def preview_font_file(filename: str, text: str = "Aa"):
    """Generate a preview image for a font file"""
    try:
        # Sanitize filename
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        font_path = OVERLAYFILES_DIR / safe_filename

        if not font_path.exists():
            raise HTTPException(status_code=404, detail="Font file not found")

        # Validate font extension
        allowed_extensions = {".ttf", ".otf", ".woff", ".woff2"}
        if font_path.suffix.lower() not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Not a valid font file")

        # Sanitize preview text
        safe_text = "".join(c for c in text if c.isprintable())[:100] or "Aa"

        # Create font preview image with unique name based on content
        import hashlib

        cache_key = hashlib.md5(f"{safe_filename}_{safe_text}".encode()).hexdigest()
        font_preview = FONTPREVIEWS_DIR / f"font_preview_{cache_key}.png"

        # Return cached preview if it exists and is recent
        if font_preview.exists():
            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

        try:
            # Try using PIL/Pillow for font rendering (more reliable than ImageMagick for custom fonts)
            from PIL import Image, ImageDraw, ImageFont

            logger.info(f"Generating font preview for: {safe_filename}")
            logger.info(f"Font path: {str(font_path)}")
            logger.info(f"Font path exists: {font_path.exists()}")
            logger.info(f"Text: {safe_text}")

            # Adjust image size and font size based on text length
            text_length = len(safe_text)
            if text_length <= 6:
                # Short text (like "AaBbCc") - larger font, smaller canvas
                img_width, img_height = 400, 200
                font_size = 48
            elif text_length <= 20:
                # Medium text (like "The Quick Brown Fox")
                img_width, img_height = 600, 150
                font_size = 36
            else:
                # Long text (like full alphabet)
                img_width, img_height = 800, 150
                font_size = 32

            # Create image with better quality
            img = Image.new("RGB", (img_width, img_height), color=(42, 42, 42))
            draw = ImageDraw.Draw(img)

            # Load font - must succeed or raise error
            try:
                font = ImageFont.truetype(str(font_path.absolute()), font_size)
                logger.info(
                    f"✅ Font loaded successfully: {font.getname() if hasattr(font, 'getname') else 'Unknown'}"
                )
            except OSError as e:
                logger.error(f"❌ OSError loading font: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Cannot load font file: {e}"
                )
            except Exception as e:
                logger.error(f"❌ Error loading font: {e}")
                raise HTTPException(status_code=500, detail=f"Error loading font: {e}")

            # Calculate text position for centering
            bbox = draw.textbbox((0, 0), safe_text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (img_width - text_width) // 2
            y = (img_height - text_height) // 2 - bbox[1]  # Adjust for baseline

            # Draw text
            draw.text((x, y), safe_text, font=font, fill="white")

            # Save image
            img.save(font_preview, "PNG")

            logger.info(f"Font preview generated successfully: {font_preview}")

            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

        except ImportError:
            # Pillow not available, fall back to ImageMagick with different approach
            logger.warning("Pillow not available, using ImageMagick fallback")

            # Find magick executable
            if IS_DOCKER:
                magick_cmd = "magick"
            else:
                magick_exe = APP_DIR / "magick" / "magick.exe"
                if magick_exe.exists():
                    magick_cmd = str(magick_exe)
                else:
                    magick_cmd = "magick"

            absolute_output_path = str(font_preview.absolute()).replace("\\", "/")

            # Try copying font to a temp location that ImageMagick might handle better
            import shutil

            temp_font = TEMP_DIR / f"temp_{safe_filename}"
            shutil.copy2(font_path, temp_font)
            temp_font_path = str(temp_font.absolute()).replace("\\", "/")

            logger.info(f"Using temporary font copy: {temp_font_path}")

            # Generate preview using ImageMagick with temp font copy
            cmd = [
                magick_cmd,
                "-background",
                "#2A2A2A",
                "-fill",
                "white",
                "-font",
                temp_font_path,
                "-pointsize",
                "48",
                "-size",
                "400x200",
                "-gravity",
                "center",
                f"label:{safe_text}",
                absolute_output_path,
            ]

            logger.info(f"ImageMagick command: {' '.join(cmd)}")

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            # Clean up temp font
            if temp_font.exists():
                try:
                    temp_font.unlink()
                except:
                    pass

            if result.returncode != 0:
                logger.error(f"ImageMagick error: {result.stderr}")
                logger.error(f"ImageMagick stdout: {result.stdout}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to generate font preview: {result.stderr}",
                )

            if not font_preview.exists():
                raise HTTPException(
                    status_code=500,
                    detail="Preview image was not created",
                )

            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

        except subprocess.TimeoutExpired:
            logger.error("Font preview generation timed out")
            raise HTTPException(
                status_code=500, detail="Font preview generation timed out"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating font preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# VALIDATION ENDPOINTS
# ============================================================================


@app.post("/api/validate/plex")
async def validate_plex(request: PlexValidationRequest):
    """Validate Plex connection"""
    logger.info("=" * 60)
    logger.info("🔍 PLEX VALIDATION STARTED")
    logger.info(f"📍 URL: {request.url}")
    logger.info(
        f"🔑 Token: {request.token[:10]}...{request.token[-4:] if len(request.token) > 14 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/library/sections/?X-Plex-Token={request.token}"
            logger.info(f"🌐 Sending request to Plex API...")

            response = await client.get(url)
            logger.info(f"📥 Response received - Status: {response.status_code}")

            if response.status_code == 200:
                # Parse XML to check for libraries
                root = ET.fromstring(response.content)
                lib_count = int(root.get("size", 0))
                server_name = root.get("friendlyName", "Unknown")

                logger.info(f"✅ Plex validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Libraries: {lib_count}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f"Plex connection successful! Found {lib_count} libraries.",
                    "details": {"library_count": lib_count, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"❌Plex validation failed: Invalid token (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Invalid Plex token. Please check your token.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"❌ Plex validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Plex connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"⏱️  Plex validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": "Connection timeout. Check if Plex URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"💥 Plex validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error connecting to Plex: {str(e)}",
            "details": {"error": str(e)},
        }


@app.post("/api/validate/jellyfin")
async def validate_jellyfin(request: JellyfinValidationRequest):
    """Validate Jellyfin connection"""
    logger.info("=" * 60)
    logger.info("🔍 JELLYFIN VALIDATION STARTED")
    logger.info(f"📍 URL: {request.url}")
    logger.info(
        f"🔑 API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/System/Info?api_key={request.api_key}"
            logger.info(f"🌐 Sending request to Jellyfin API...")

            response = await client.get(url)
            logger.info(f"📥 Response received - Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                version = data.get("Version", "Unknown")
                server_name = data.get("ServerName", "Unknown")

                logger.info(f"✅ Jellyfin validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Version: {version}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f" Jellyfin connection successful! Version: {version}",
                    "details": {"version": version, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"❌ Jellyfin validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid Jellyfin API key. Please check your API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"❌ Jellyfin validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Jellyfin connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"⏱️  Jellyfin validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": " Connection timeout. Check if Jellyfin URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"💥 Jellyfin validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f" Error connecting to Jellyfin: {str(e)}",
            "details": {"error": str(e)},
        }


@app.post("/api/validate/emby")
async def validate_emby(request: EmbyValidationRequest):
    """Validate Emby connection"""
    logger.info("=" * 60)
    logger.info("🔍 EMBY VALIDATION STARTED")
    logger.info(f"📍 URL: {request.url}")
    logger.info(
        f"🔑 API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/System/Info?api_key={request.api_key}"
            logger.info(f"🌐 Sending request to Emby API...")

            response = await client.get(url)
            logger.info(f"📥 Response received - Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                version = data.get("Version", "Unknown")
                server_name = data.get("ServerName", "Unknown")

                logger.info(f"✅ Emby validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Version: {version}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f" Emby connection successful! Version: {version}",
                    "details": {"version": version, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"❌ Emby validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid Emby API key. Please check your API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"❌ Emby validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Emby connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"⏱️  Emby validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": " Connection timeout. Check if Emby URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"💥 Emby validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f" Error connecting to Emby: {str(e)}",
            "details": {"error": str(e)},
        }


@app.post("/api/validate/tmdb")
async def validate_tmdb(request: TMDBValidationRequest):
    """Validate TMDB API token"""
    logger.info("=" * 60)
    logger.info("🔍 TMDB VALIDATION STARTED")
    logger.info(
        f"🔑 Token: {request.token[:15]}...{request.token[-8:] if len(request.token) > 23 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "Authorization": f"Bearer {request.token}",
                "Content-Type": "application/json",
            }
            logger.info(f"🌐 Sending request to TMDB API...")

            response = await client.get(
                "https://api.themoviedb.org/3/configuration", headers=headers
            )
            logger.info(f"📥 Response received - Status: {response.status_code}")

            if response.status_code == 200:
                logger.info(f"✅ TMDB validation successful!")
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": " TMDB API token is valid!",
                    "details": {"status_code": 200},
                }
            elif response.status_code == 401:
                logger.warning(f"❌ TMDB validation failed: Invalid token (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid TMDB token. Please check your Read Access Token.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"❌ TMDB validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" TMDB validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"💥 TMDB validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f" Error validating TMDB token: {str(e)}",
            "details": {"error": str(e)},
        }


@app.post("/api/validate/tvdb")
async def validate_tvdb(request: TVDBValidationRequest):
    """Validate TVDB API key - with login flow"""
    logger.info("=" * 60)
    logger.info("🔍 TVDB VALIDATION STARTED")
    logger.info(
        f"🔑 API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )
    if request.pin:
        logger.info(f"📌 PIN provided: {request.pin}")

    max_retries = 6
    retry_count = 0
    success = False

    while not success and retry_count < max_retries:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                login_url = "https://api4.thetvdb.com/v4/login"

                # Request body with or without PIN
                if request.pin:
                    body = {"apikey": request.api_key, "pin": request.pin}
                    logger.info(
                        f"🌐 Attempting TVDB login with API Key + PIN (Attempt {retry_count + 1}/{max_retries})..."
                    )
                else:
                    body = {"apikey": request.api_key}
                    logger.info(
                        f"🌐 Attempting TVDB login with API Key only (Attempt {retry_count + 1}/{max_retries})..."
                    )

                headers = {
                    "accept": "application/json",
                    "Content-Type": "application/json",
                }

                # POST-Request zum Login
                login_response = await client.post(
                    login_url, json=body, headers=headers
                )

                logger.info(
                    f"📥 Login response received - Status: {login_response.status_code}"
                )

                if login_response.status_code == 200:
                    data = login_response.json()
                    token = data.get("data", {}).get("token")

                    if token:
                        success = True
                        pin_msg = f" (with PIN: {request.pin})" if request.pin else ""
                        logger.info(
                            f"🎟️  Successfully received TVDB token: {token[:15]}...{token[-8:]}"
                        )
                        logger.info(f"✅ TVDB validation successful!{pin_msg}")
                        logger.info(f"   Token is valid and working")
                        logger.info("=" * 60)

                        return {
                            "valid": True,
                            "message": f"TVDB API key is valid{pin_msg}!",
                            "details": {
                                "status_code": 200,
                                "has_pin": bool(request.pin),
                                "token_received": True,
                            },
                        }
                    else:
                        logger.warning(f"⚠️  No token in response data")
                        retry_count += 1
                        if retry_count < max_retries:
                            logger.info(f"⏳ Waiting 10 seconds before retry...")
                            await asyncio.sleep(10)

                elif login_response.status_code == 401:
                    logger.warning(f"❌ TVDB login failed: Invalid API key (401)")
                    logger.warning(
                        f"   You may be using a legacy API key. Please use a 'Project API Key'"
                    )
                    logger.info("=" * 60)
                    return {
                        "valid": False,
                        "message": "Invalid TVDB API key. Please use a 'Project API Key' (not legacy key).",
                        "details": {"status_code": 401, "legacy_key_hint": True},
                    }

                else:
                    logger.warning(
                        f"❌ TVDB login failed: Status {login_response.status_code}"
                    )
                    retry_count += 1
                    if retry_count < max_retries:
                        logger.info(f"⏳ Waiting 10 seconds before retry...")
                        await asyncio.sleep(10)

        except httpx.TimeoutException:
            logger.warning(
                f"⏱️  TVDB login timeout (Attempt {retry_count + 1}/{max_retries})"
            )
            retry_count += 1
            if retry_count < max_retries:
                logger.info(f"⏳ Waiting 10 seconds before retry...")
                await asyncio.sleep(10)

        except Exception as e:
            logger.error(f"💥 TVDB validation error: {str(e)}")
            logger.exception("Full traceback:")
            retry_count += 1
            if retry_count < max_retries:
                logger.info(f"⏳ Waiting 10 seconds before retry...")
                await asyncio.sleep(10)

    # If all retries failed
    if not success:
        logger.error(f"❌ TVDB validation failed after {max_retries} attempts")
        logger.error(
            f"   You may be using a legacy API key. Please use a 'Project API Key'"
        )
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Could not validate TVDB API key after {max_retries} attempts. You may be using a legacy API key - please use a 'Project API Key'.",
            "details": {"attempts": max_retries, "legacy_key_hint": True},
        }


@app.post("/api/validate/fanart")
async def validate_fanart(request: FanartValidationRequest):
    """Validate Fanart.tv API key"""
    logger.info("=" * 60)
    logger.info("🔍 FANART.TV VALIDATION STARTED")
    logger.info(
        f"🔑 API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            test_url = (
                f"https://webservice.fanart.tv/v3/movies/603?api_key={request.api_key}"
            )
            logger.info(
                f"🌐 Sending test request to Fanart.tv API (Movie ID: 603 - The Matrix)..."
            )

            response = await client.get(test_url)
            logger.info(f"📥 Response received - Status: {response.status_code}")

            if response.status_code == 200:
                logger.info(f"✅ Fanart.tv validation successful!")
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": " Fanart.tv API key is valid!",
                    "details": {"status_code": 200},
                }
            elif response.status_code == 401:
                logger.warning(f"❌ Fanart.tv validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid Fanart.tv API key. Please check your Personal API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"❌ Fanart.tv validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Fanart.tv validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"💥 Fanart.tv validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f" Error validating Fanart.tv key: {str(e)}",
            "details": {"error": str(e)},
        }


@app.post("/api/validate/discord")
async def validate_discord(request: DiscordValidationRequest):
    """Validate Discord webhook"""
    logger.info("=" * 60)
    logger.info("🔍 DISCORD WEBHOOK VALIDATION STARTED")
    logger.info(f"📍 Webhook URL: {request.webhook_url[:50]}...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "content": "✓ Posterizarr WebUI - Discord webhook validation successful!",
                "username": "Posterizarr",
            }
            logger.info(f"🌐 Sending test message to Discord webhook...")

            response = await client.post(request.webhook_url, json=payload)
            logger.info(f"📥 Response received - Status: {response.status_code}")

            if response.status_code == 204:
                logger.info(
                    f"✅ Discord webhook validation successful! Test message sent."
                )
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": " Discord webhook is valid! Test message sent.",
                    "details": {"status_code": 204},
                }
            elif response.status_code == 404:
                logger.warning(
                    f"❌ Discord webhook validation failed: Webhook not found (404)"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Discord webhook not found. Please check your webhook URL.",
                    "details": {"status_code": 404},
                }
            else:
                logger.warning(
                    f"❌ Discord webhook validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Discord webhook validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"💥 Discord webhook validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f" Error validating Discord webhook: {str(e)}",
            "details": {"error": str(e)},
        }


@app.post("/api/validate/apprise")
async def validate_apprise(request: AppriseValidationRequest):
    """Validate Apprise URL (basic format check)"""
    logger.info("=" * 60)
    logger.info("🔍 APPRISE URL VALIDATION STARTED")
    logger.info(f"📍 URL: {request.url}")

    try:
        valid_prefixes = [
            "discord://",
            "telegram://",
            "slack://",
            "email://",
            "mailto://",
            "pushover://",
            "gotify://",
            "ntfy://",
            "pushbullet://",
            "rocket://",
            "mattermost://",
        ]

        is_valid = any(request.url.startswith(prefix) for prefix in valid_prefixes)

        if is_valid:
            detected_service = next(
                (prefix for prefix in valid_prefixes if request.url.startswith(prefix)),
                None,
            )
            logger.info(
                f"✅ Apprise URL format valid! Detected service: {detected_service}"
            )
            logger.info("=" * 60)
            return {
                "valid": True,
                "message": " Apprise URL format looks valid!",
                "details": {"format_check": True, "service": detected_service},
            }
        else:
            logger.warning(f"❌ Apprise URL format invalid!")
            logger.warning(
                f"   URL must start with: {', '.join(valid_prefixes[:5])}..."
            )
            logger.info("=" * 60)
            return {
                "valid": False,
                "message": f" Invalid Apprise URL format. Must start with a valid service prefix (discord://, telegram://, etc.)",
                "details": {"format_check": False},
            }
    except Exception as e:
        logger.error(f"💥 Apprise URL validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f" Error validating Apprise URL: {str(e)}",
            "details": {"error": str(e)},
        }


@app.post("/api/validate/uptimekuma")
async def validate_uptimekuma(request: UptimeKumaValidationRequest):
    """Validate Uptime Kuma push URL"""
    logger.info("=" * 60)
    logger.info("🔍 UPTIME KUMA VALIDATION STARTED")
    logger.info(f"📍 Push URL: {request.url[:50]}...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            logger.info(f"🌐 Sending test push to Uptime Kuma...")

            response = await client.get(
                request.url,
                params={
                    "status": "up",
                    "msg": "Posterizarr WebUI validation test",
                    "ping": "",
                },
            )
            logger.info(f"📥 Response received - Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                logger.info(f"   Response data: {data}")

                if data.get("ok"):
                    logger.info(
                        f"✅ Uptime Kuma validation successful! Test ping sent."
                    )
                    logger.info("=" * 60)
                    return {
                        "valid": True,
                        "message": " Uptime Kuma push URL is valid!",
                        "details": {"status_code": 200},
                    }
                else:
                    logger.warning(f"❌ Uptime Kuma responded but 'ok' was false")
                    logger.info("=" * 60)
                    return {
                        "valid": False,
                        "message": " Uptime Kuma responded but validation failed.",
                        "details": {"response": data},
                    }
            else:
                logger.warning(
                    f"❌ Uptime Kuma validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Uptime Kuma validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"💥 Uptime Kuma validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f" Error validating Uptime Kuma URL: {str(e)}",
            "details": {"error": str(e)},
        }


# ============================================================================
# LIBRARY FETCHING ENDPOINTS
# ============================================================================


@app.post("/api/libraries/plex")
async def get_plex_libraries(request: PlexValidationRequest):
    """Fetch Plex libraries"""
    logger.info("📚 Fetching Plex libraries...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/library/sections/?X-Plex-Token={request.token}"
            response = await client.get(url)

            if response.status_code == 200:
                root = ET.fromstring(response.content)
                libraries = []

                for directory in root.findall(".//Directory"):
                    lib_title = directory.get("title", "")
                    lib_type = directory.get("type", "")
                    lib_key = directory.get("key", "")

                    # Only include movie and show libraries
                    if lib_type in ["movie", "show"]:
                        libraries.append(
                            {"name": lib_title, "type": lib_type, "key": lib_key}
                        )

                logger.info(f"✅ Found {len(libraries)} Plex libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(
                    f"❌ Failed to fetch Plex libraries: {response.status_code}"
                )
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"💥 Error fetching Plex libraries: {str(e)}")
        return {"success": False, "error": str(e)}


@app.post("/api/libraries/jellyfin")
async def get_jellyfin_libraries(request: JellyfinValidationRequest):
    """Fetch Jellyfin libraries"""
    logger.info("📚 Fetching Jellyfin libraries...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"X-Emby-Token": request.api_key}
            url = f"{request.url}/Library/VirtualFolders"
            response = await client.get(url, headers=headers)

            if response.status_code == 200:
                data = response.json()
                libraries = []

                for lib in data:
                    lib_name = lib.get("Name", "")
                    lib_type = lib.get("CollectionType", "mixed")

                    # Only include movies and tvshows
                    if lib_type in ["movies", "tvshows", "mixed"]:
                        libraries.append(
                            {
                                "name": lib_name,
                                "type": lib_type,
                                "id": lib.get("ItemId", ""),
                            }
                        )

                logger.info(f"✅ Found {len(libraries)} Jellyfin libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(
                    f"❌ Failed to fetch Jellyfin libraries: {response.status_code}"
                )
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"💥 Error fetching Jellyfin libraries: {str(e)}")
        return {"success": False, "error": str(e)}


@app.post("/api/libraries/emby")
async def get_emby_libraries(request: EmbyValidationRequest):
    """Fetch Emby libraries"""
    logger.info("📚 Fetching Emby libraries...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/Library/VirtualFolders?api_key={request.api_key}"
            response = await client.get(url)

            if response.status_code == 200:
                data = response.json()
                libraries = []

                for lib in data:
                    lib_name = lib.get("Name", "")
                    lib_type = lib.get("CollectionType", "mixed")

                    # Only include movies and tvshows
                    if lib_type in ["movies", "tvshows", "mixed"]:
                        libraries.append(
                            {
                                "name": lib_name,
                                "type": lib_type,
                                "id": lib.get("ItemId", ""),
                            }
                        )

                logger.info(f"✅ Found {len(libraries)} Emby libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(
                    f"❌ Failed to fetch Emby libraries: {response.status_code}"
                )
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"💥 Error fetching Emby libraries: {str(e)}")
        return {"success": False, "error": str(e)}


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


@app.post("/api/logs/ui")
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


@app.post("/api/logs/ui/batch")
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

    manual_is_running = False
    if current_process is not None:
        poll_result = current_process.poll()
        if poll_result is None:
            # Process is still running
            manual_is_running = True
        else:
            logger.info(
                f"Process finished with exit code {poll_result}, cleaning up..."
            )
            current_process = None
            current_mode = None
            manual_is_running = False

            # Auto-trigger cache refresh after script finishes
            logger.info("🔄 Triggering cache refresh after script completion...")
            try:
                scan_and_cache_assets()
                logger.info("✅ Cache refreshed successfully after script completion")
            except Exception as e:
                logger.error(f"❌ Error refreshing cache after script completion: {e}")

            # Import ImageChoices.csv to database
            try:
                import_imagechoices_to_db()
            except Exception as e:
                logger.error(f"❌ Error importing ImageChoices.csv to database: {e}")

            # Save runtime statistics to database
            if RUNTIME_DB_AVAILABLE:
                try:
                    # Determine which log file was used
                    mode_log_map = {
                        "normal": "Scriptlog.log",
                        "testing": "Testinglog.log",
                        "manual": "Manuallog.log",
                        "backup": "Scriptlog.log",
                        "syncjelly": "Scriptlog.log",
                        "syncemby": "Scriptlog.log",
                        "reset": "Scriptlog.log",
                    }
                    log_filename = mode_log_map.get(current_mode, "Scriptlog.log")
                    log_path = LOGS_DIR / log_filename

                    if log_path.exists():
                        save_runtime_to_db(log_path, current_mode or "normal")
                        logger.info(
                            f"✅ Runtime statistics saved to database for {current_mode} mode"
                        )
                except Exception as e:
                    logger.error(f"❌ Error saving runtime to database: {e}")

    scheduler_is_running = False
    scheduler_pid = None
    if SCHEDULER_AVAILABLE and scheduler:
        if scheduler.is_running and scheduler.current_process:
            poll_result = scheduler.current_process.poll()
            if poll_result is None:
                # Scheduler process is still running
                scheduler_is_running = True
                scheduler_pid = scheduler.current_process.pid
            else:
                # ✅ Scheduler process has finished - clean up!
                logger.info(
                    f"Scheduler process finished with exit code {poll_result}, cleaning up..."
                )
                scheduler.current_process = None
                scheduler.is_running = False
                scheduler_is_running = False

                # Auto-trigger cache refresh after scheduler finishes
                logger.info("🔄 Triggering cache refresh after scheduler completion...")
                try:
                    scan_and_cache_assets()
                    logger.info(
                        "✅ Cache refreshed successfully after scheduler completion"
                    )
                except Exception as e:
                    logger.error(
                        f"❌ Error refreshing cache after scheduler completion: {e}"
                    )

                # Import ImageChoices.csv to database
                try:
                    import_imagechoices_to_db()
                except Exception as e:
                    logger.error(
                        f"❌ Error importing ImageChoices.csv to database: {e}"
                    )

                # Save runtime statistics to database for scheduler runs
                if RUNTIME_DB_AVAILABLE:
                    try:
                        log_path = LOGS_DIR / "Scriptlog.log"
                        if log_path.exists():
                            save_runtime_to_db(log_path, "scheduled")
                            logger.info(
                                "✅ Runtime statistics saved to database for scheduled run"
                            )
                    except Exception as e:
                        logger.error(
                            f"❌ Error saving scheduler runtime to database: {e}"
                        )

    # Combined running status
    is_running = manual_is_running or scheduler_is_running

    # Determine current mode
    effective_mode = current_mode
    if scheduler_is_running and not manual_is_running:
        effective_mode = "scheduled"  # Special mode for scheduler runs
    elif not is_running:
        effective_mode = None

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
        "manual_running": manual_is_running,
        "scheduler_running": scheduler_is_running,
        "scheduler_is_executing": scheduler_is_running,
        "last_logs": last_logs,
        "script_exists": SCRIPT_PATH.exists(),
        "config_exists": CONFIG_PATH.exists(),
        "pid": (
            scheduler_pid
            if scheduler_is_running and scheduler_pid
            else (
                current_process.pid if manual_is_running and current_process else None
            )
        ),
        "current_mode": effective_mode,
        "active_log": active_log,
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


@app.get("/api/runtime-stats")
async def get_runtime_stats():
    """
    Get last runtime statistics from database
    Falls back to Scriptlog.log if database is not available
    """
    try:
        # Try to get from database first
        if RUNTIME_DB_AVAILABLE and runtime_db:
            latest = runtime_db.get_latest_runtime()

            if latest:
                # Get scheduler information if available
                scheduler_info = {
                    "enabled": False,
                    "schedules": [],
                    "next_run": None,
                    "timezone": None,
                }

                if SCHEDULER_AVAILABLE and scheduler:
                    try:
                        status = scheduler.get_status()
                        scheduler_info = {
                            "enabled": status.get("enabled", False),
                            "schedules": status.get("schedules", []),
                            "next_run": status.get("next_run"),
                            "timezone": status.get("timezone"),
                        }
                    except Exception as e:
                        logger.warning(f"Could not get scheduler info: {e}")

                return {
                    "success": True,
                    "runtime": latest.get("runtime_formatted"),
                    "total_images": latest.get("total_images", 0),
                    "posters": latest.get("posters", 0),
                    "seasons": latest.get("seasons", 0),
                    "backgrounds": latest.get("backgrounds", 0),
                    "titlecards": latest.get("titlecards", 0),
                    "errors": latest.get("errors", 0),
                    "mode": latest.get("mode"),
                    "timestamp": latest.get("timestamp"),
                    "scheduler": scheduler_info,
                    "source": "database",
                }

        # Fallback to log file parsing (legacy behavior)
        logger.warning(
            "Runtime database not available, falling back to log file parsing"
        )
        scriptlog_path = LOGS_DIR / "Scriptlog.log"

        if not scriptlog_path.exists():
            return {
                "success": False,
                "message": "Scriptlog.log not found",
                "runtime": None,
                "total_images": 0,
                "posters": 0,
                "seasons": 0,
                "backgrounds": 0,
                "titlecards": 0,
                "errors": 0,
            }

        # Read last 100 lines to find the runtime info
        with open(scriptlog_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            last_lines = lines[-100:] if len(lines) > 100 else lines

        runtime = None
        total_images = 0
        posters = 0
        seasons = 0
        backgrounds = 0
        titlecards = 0
        errors = 0

        # Parse from bottom to top to get latest run
        for line in reversed(last_lines):
            # Look for: "Script execution time: 0h 1m 23s"
            if "Script execution time:" in line and runtime is None:
                import re

                match = re.search(r"(\d+)h\s*(\d+)m\s*(\d+)s", line)
                if match:
                    hours = int(match.group(1))
                    minutes = int(match.group(2))
                    seconds = int(match.group(3))
                    runtime = f"{hours}h {minutes}m {seconds}s"

            # Look for: "Finished, Total images downloaded: 42" OR "Finished, Total images created: 42"
            if (
                "Total images downloaded:" in line or "Total images created:" in line
            ) and total_images == 0:
                import re

                match = re.search(r"Total images (?:downloaded|created):\s*(\d+)", line)
                if match:
                    total_images = int(match.group(1))

            # Look for: "Show/Movie Posters created: 127| Season images created: 0 | Background images created: 127 | TitleCards created: 0"
            # OR: "Show/Movie Posters downloaded: 10| Season images downloaded: 5 | Background images downloaded: 3 | TitleCards downloaded: 2"
            if (
                "Show/Movie Posters created:" in line
                or "Show/Movie Posters downloaded:" in line
            ) and posters == 0:
                import re

                # Posters (support both "created" and "downloaded")
                poster_match = re.search(
                    r"Show/Movie Posters (?:created|downloaded):\s*(\d+)", line
                )
                if poster_match:
                    posters = int(poster_match.group(1))

                # Seasons
                season_match = re.search(
                    r"Season images (?:created|downloaded):\s*(\d+)", line
                )
                if season_match:
                    seasons = int(season_match.group(1))

                # Backgrounds
                bg_match = re.search(
                    r"Background images (?:created|downloaded):\s*(\d+)", line
                )
                if bg_match:
                    backgrounds = int(bg_match.group(1))

                # TitleCards
                tc_match = re.search(
                    r"TitleCards (?:created|downloaded):\s*(\d+)", line
                )
                if tc_match:
                    titlecards = int(tc_match.group(1))

            # Look for: "During execution '5' Errors occurred"
            if "Errors occurred" in line and errors == 0:
                import re

                match = re.search(r"execution\s+'(\d+)'\s+Errors", line)
                if match:
                    errors = int(match.group(1))

            # Stop searching once we found everything from the same run
            if runtime and (
                total_images > 0 or (posters + seasons + backgrounds + titlecards) > 0
            ):
                break

        # If total_images was not found but we have individual counts, calculate it
        if total_images == 0 and (posters + seasons + backgrounds + titlecards) > 0:
            total_images = posters + seasons + backgrounds + titlecards

        # Get scheduler information if available
        scheduler_info = {
            "enabled": False,
            "schedules": [],
            "next_run": None,
            "timezone": None,
        }

        if SCHEDULER_AVAILABLE and scheduler:
            try:
                status = scheduler.get_status()
                scheduler_info = {
                    "enabled": status.get("enabled", False),
                    "schedules": status.get("schedules", []),
                    "next_run": status.get("next_run"),
                    "timezone": status.get("timezone"),
                }
            except Exception as e:
                logger.warning(f"Could not get scheduler info: {e}")

        return {
            "success": True,
            "runtime": runtime,
            "total_images": total_images,
            "posters": posters,
            "seasons": seasons,
            "backgrounds": backgrounds,
            "titlecards": titlecards,
            "errors": errors,
            "scheduler": scheduler_info,
            "source": "logfile",
        }

    except Exception as e:
        logger.error(f"Error getting runtime stats: {e}")
        return {
            "success": False,
            "message": str(e),
            "runtime": None,
            "total_images": 0,
            "posters": 0,
            "seasons": 0,
            "backgrounds": 0,
            "titlecards": 0,
            "errors": 0,
            "scheduler": {
                "enabled": False,
                "schedules": [],
                "next_run": None,
                "timezone": None,
            },
            "source": "error",
        }


@app.get("/api/runtime-history")
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

        return {
            "success": True,
            "history": history,
            "count": len(history),
            "limit": limit,
            "offset": offset,
            "mode_filter": mode,
        }

    except Exception as e:
        logger.error(f"Error getting runtime history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/runtime-summary")
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


@app.delete("/api/runtime-history/cleanup")
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


@app.post("/api/runtime-history/migrate")
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

        logger.info("🔄 Starting manual runtime data migration from logs...")

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
            f"✅ Migration complete: {imported_count} imported, {skipped_count} skipped, {error_count} errors"
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


@app.get("/api/runtime-history/migration-status")
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
            logger.debug(f"Could not fetch migration info: {e}")

        # Get current entry count
        entry_count = len(runtime_db.get_runtime_history(limit=1000000))

        return {
            "success": True,
            "is_migrated": is_migrated,
            "migration_info": migration_info,
            "total_entries": entry_count,
        }

    except Exception as e:
        logger.error(f"Error getting migration status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tmdb/search-posters")
async def search_tmdb_posters(request: TMDBSearchRequest):
    """
    Search TMDB for images by title or ID
    - Standard: Returns show/movie posters (filtered by PreferredLanguageOrder)
    - Season: Returns season-specific posters (filtered by PreferredSeasonLanguageOrder)
    - Titlecard: Returns episode stills (only 'xx' - no language/international)
    - Background: Returns show/movie backdrops (filtered by PreferredBackgroundLanguageOrder)
    - Collection: Returns collection posters (only 'xx' - no language/international)
    """

    def filter_and_sort_posters_by_language(posters_list, preferred_languages):
        """
        Filter and sort posters based on preferred language order.

        Args:
            posters_list: List of poster dicts from TMDB
            preferred_languages: List of language codes in order of preference (e.g., ['de', 'en', 'xx'])

        Returns:
            Filtered and sorted list of posters
        """
        if not preferred_languages:
            return posters_list

        # Normalize language codes to lowercase
        preferred_languages = [
            lang.lower().strip() for lang in preferred_languages if lang
        ]

        # Group posters by language
        language_groups = {lang: [] for lang in preferred_languages}
        language_groups["other"] = []  # For languages not in preferences

        for poster in posters_list:
            poster_lang = (poster.get("iso_639_1") or "xx").lower()

            # Check if poster language matches any preferred language
            if poster_lang in preferred_languages:
                language_groups[poster_lang].append(poster)
            else:
                language_groups["other"].append(poster)

        # Build result list in order of preference
        result = []
        for lang in preferred_languages:
            result.extend(language_groups[lang])

        # Optionally add other languages at the end (commented out to only show preferred)
        # result.extend(language_groups['other'])

        return result

    try:
        # Load config to get TMDB token
        if not CONFIG_PATH.exists():
            raise HTTPException(status_code=404, detail="Config file not found")

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        # Convert grouped config to flat structure
        if CONFIG_MAPPER_AVAILABLE:
            flat_config = flatten_config(grouped_config)
            tmdb_token = flat_config.get("tmdbtoken")
            preferred_language_order = flat_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = flat_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = flat_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )
        else:
            # Fallback: Try both structures
            tmdb_token = grouped_config.get("tmdbtoken")
            if not tmdb_token and isinstance(grouped_config.get("ApiPart"), dict):
                tmdb_token = grouped_config["ApiPart"].get("tmdbtoken")

            # Try to get language preferences from different possible locations
            preferred_language_order = grouped_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = grouped_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = grouped_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )

            # If not found at root, try in ApiPart
            if not preferred_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_language_order = grouped_config["ApiPart"].get(
                    "PreferredLanguageOrder", ""
                )
            if not preferred_season_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_season_language_order = grouped_config["ApiPart"].get(
                    "PreferredSeasonLanguageOrder", ""
                )
            if not preferred_background_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_background_language_order = grouped_config["ApiPart"].get(
                    "PreferredBackgroundLanguageOrder", ""
                )

        # Parse language preferences (handle both string and list formats)
        def parse_language_order(value):
            """Convert language order to list, handling both string and list inputs"""
            if not value:
                return []
            if isinstance(value, list):
                # Already a list, just clean up entries
                return [lang.strip() for lang in value if lang and str(lang).strip()]
            if isinstance(value, str):
                # String format, split by comma
                return [lang.strip() for lang in value.split(",") if lang.strip()]
            return []

        language_order_list = parse_language_order(preferred_language_order)
        season_language_order_list = parse_language_order(
            preferred_season_language_order
        )
        background_language_order_list = parse_language_order(
            preferred_background_language_order
        )

        logger.info(
            f"Language preferences - Standard: {language_order_list}, Season: {season_language_order_list}, Background: {background_language_order_list}"
        )

        if not tmdb_token:
            logger.error("TMDB token not found in config")
            logger.error(f"Config structure: {list(grouped_config.keys())}")
            raise HTTPException(status_code=400, detail="TMDB API token not configured")

        headers = {
            "Authorization": f"Bearer {tmdb_token}",
            "Content-Type": "application/json",
        }

        results = []
        tmdb_id = None

        # Log the incoming request for debugging
        logger.info(f"📥 TMDB Search Request:")
        logger.info(f"   Query: '{request.query}'")
        logger.info(f"   Media Type: {request.media_type}")
        logger.info(f"   Poster Type: {request.poster_type}")
        logger.info(f"   Year: {request.year}")
        logger.info(f"   Is Digit: {request.query.isdigit()}")

        # Step 1: Get TMDB ID (if not already provided)
        # Only treat as ID if it's purely numeric AND no year is provided
        # If year is provided, always search by title (even for numeric titles like "1917", "2012")
        if request.query.isdigit() and not request.year:
            # Query is a TMDB ID (only if no year specified)
            tmdb_id = request.query
            logger.info(f"🔢 Using query as TMDB ID: {tmdb_id}")
        else:
            # Query is a title - search for it (including numeric titles like "1917" if year provided)
            search_url = f"https://api.themoviedb.org/3/search/{request.media_type}"
            search_params = {"query": request.query, "page": 1}

            logger.info(
                f"🔍 Searching TMDB for: '{request.query}' (media_type: {request.media_type})"
            )

            # Add year parameter if provided
            if request.year:
                if request.media_type == "movie":
                    search_params["year"] = request.year
                    logger.info(f"   Adding year filter: {request.year}")
                elif request.media_type == "tv":
                    search_params["first_air_date_year"] = request.year
                    logger.info(f"   Adding first_air_date_year filter: {request.year}")

            search_response = requests.get(
                search_url, headers=headers, params=search_params, timeout=10
            )

            logger.info(f"   TMDB Response Status: {search_response.status_code}")

            if search_response.status_code == 200:
                search_data = search_response.json()
                search_results = search_data.get("results", [])
                logger.info(f"   Found {len(search_results)} results")
                if search_results:
                    tmdb_id = search_results[0].get("id")
                    result_title = search_results[0].get(
                        "title" if request.media_type == "movie" else "name"
                    )
                    logger.info(
                        f"   Using first result: ID={tmdb_id}, Title='{result_title}'"
                    )
                else:
                    logger.warning(f"   No results found for '{request.query}'")
                    return {
                        "success": True,
                        "posters": [],
                        "count": 0,
                        "message": "No results found",
                    }
            else:
                logger.error(f"TMDB search error: {search_response.status_code}")
                raise HTTPException(status_code=500, detail="TMDB search failed")

        if not tmdb_id:
            return {
                "success": True,
                "posters": [],
                "count": 0,
                "message": "No TMDB ID found",
            }

        # Step 2: Get item details (for title)
        media_endpoint = "movie" if request.media_type == "movie" else "tv"
        details_url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}"
        logger.info(f"📋 Fetching details from: {details_url}")
        details_response = requests.get(details_url, headers=headers, timeout=10)
        logger.info(f"   Response Status: {details_response.status_code}")

        if details_response.status_code == 200:
            details = details_response.json()
            base_title = (
                details.get("title") or details.get("name") or f"TMDB ID: {tmdb_id}"
            )
            logger.info(f"   Title: '{base_title}'")
        else:
            details = {}
            base_title = f"TMDB ID: {tmdb_id}"
            logger.warning(
                f"   Failed to fetch details: {details_response.status_code}"
            )
            if details_response.status_code == 404:
                logger.error(
                    f"   ❌ TMDB ID {tmdb_id} not found for media_type '{request.media_type}'"
                )
                return {
                    "success": True,
                    "posters": [],
                    "count": 0,
                    "message": f"TMDB ID {tmdb_id} not found. Make sure the media type (movie/tv) is correct.",
                }

        # Step 3: Fetch appropriate images based on poster_type
        if request.poster_type == "titlecard":
            # ========== TITLE CARDS (Episode Stills) ==========
            if not request.season_number or not request.episode_number:
                raise HTTPException(
                    status_code=400,
                    detail="Season and episode numbers required for titlecards",
                )

            # Get episode stills
            episode_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/episode/{request.episode_number}/images"
            episode_response = requests.get(episode_url, headers=headers, timeout=10)

            if episode_response.status_code == 200:
                episode_data = episode_response.json()
                stills = episode_data.get("stills", [])

                # Also get episode details for title
                ep_details_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/episode/{request.episode_number}"
                ep_details_response = requests.get(
                    ep_details_url, headers=headers, timeout=10
                )
                ep_details = (
                    ep_details_response.json()
                    if ep_details_response.status_code == 200
                    else {}
                )
                episode_title = ep_details.get(
                    "name", f"Episode {request.episode_number}"
                )

                title = f"{base_title} - S{request.season_number:02d}E{request.episode_number:02d}: {episode_title}"

                # Filter: Only 'xx' (no language/international) for title cards
                filtered_stills = [
                    still
                    for still in stills
                    if (still.get("iso_639_1") or "xx").lower() == "xx"
                ]

                logger.info(
                    f"Title cards: {len(stills)} total, {len(filtered_stills)} after filtering (xx only)"
                )

                for still in filtered_stills:  # Load all stills
                    results.append(
                        {
                            "tmdb_id": tmdb_id,
                            "title": title,
                            "poster_path": still.get("file_path"),
                            "poster_url": f"https://image.tmdb.org/t/p/w500{still.get('file_path')}",
                            "original_url": f"https://image.tmdb.org/t/p/original{still.get('file_path')}",
                            "language": still.get("iso_639_1"),
                            "vote_average": still.get("vote_average", 0),
                            "width": still.get("width", 0),
                            "height": still.get("height", 0),
                            "type": "episode_still",
                        }
                    )
            else:
                logger.warning(
                    f"No episode stills found for S{request.season_number}E{request.episode_number}"
                )

        elif request.poster_type == "season":
            # ========== SEASON POSTERS ==========
            if not request.season_number:
                raise HTTPException(
                    status_code=400, detail="Season number required for season posters"
                )

            # Get season posters
            season_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/images"
            season_response = requests.get(season_url, headers=headers, timeout=10)

            if season_response.status_code == 200:
                season_data = season_response.json()
                posters = season_data.get("posters", [])

                # Get season details for title
                season_details_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}"
                season_details_response = requests.get(
                    season_details_url, headers=headers, timeout=10
                )
                season_details = (
                    season_details_response.json()
                    if season_details_response.status_code == 200
                    else {}
                )
                season_name = season_details.get(
                    "name", f"Season {request.season_number}"
                )

                title = f"{base_title} - {season_name}"

                # Filter and sort by PreferredSeasonLanguageOrder
                filtered_posters = filter_and_sort_posters_by_language(
                    posters, season_language_order_list
                )

                logger.info(
                    f"Season posters: {len(posters)} total, {len(filtered_posters)} after filtering by language preferences"
                )

                for poster in filtered_posters:  # Load all posters
                    results.append(
                        {
                            "tmdb_id": tmdb_id,
                            "title": title,
                            "poster_path": poster.get("file_path"),
                            "poster_url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                            "original_url": f"https://image.tmdb.org/t/p/original{poster.get('file_path')}",
                            "language": poster.get("iso_639_1"),
                            "vote_average": poster.get("vote_average", 0),
                            "width": poster.get("width", 0),
                            "height": poster.get("height", 0),
                            "type": "season_poster",
                        }
                    )
            else:
                logger.warning(
                    f"No season posters found for Season {request.season_number}"
                )

        elif request.poster_type == "background":
            # ========== BACKGROUND IMAGES (Backdrops 16:9) ==========
            images_url = (
                f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
            )
            images_response = requests.get(images_url, headers=headers, timeout=10)

            if images_response.status_code == 200:
                images_data = images_response.json()
                backdrops = images_data.get("backdrops", [])

                # Filter and sort by PreferredBackgroundLanguageOrder
                # If background language order is empty or "PleaseFillMe", fall back to standard poster language order
                if not background_language_order_list or (
                    len(background_language_order_list) == 1
                    and background_language_order_list[0].lower() == "pleasefillme"
                ):
                    logger.info(
                        "Background language order not configured, using standard poster language order"
                    )
                    filtered_backdrops = filter_and_sort_posters_by_language(
                        backdrops, language_order_list
                    )
                else:
                    filtered_backdrops = filter_and_sort_posters_by_language(
                        backdrops, background_language_order_list
                    )

                logger.info(
                    f"Background images: {len(backdrops)} total, {len(filtered_backdrops)} after filtering by language preferences"
                )

                for backdrop in filtered_backdrops:  # Load all backdrops
                    results.append(
                        {
                            "tmdb_id": tmdb_id,
                            "title": base_title,
                            "poster_path": backdrop.get("file_path"),
                            "poster_url": f"https://image.tmdb.org/t/p/w500{backdrop.get('file_path')}",
                            "original_url": f"https://image.tmdb.org/t/p/original{backdrop.get('file_path')}",
                            "language": backdrop.get("iso_639_1"),
                            "vote_average": backdrop.get("vote_average", 0),
                            "width": backdrop.get("width", 0),
                            "height": backdrop.get("height", 0),
                            "type": "backdrop",
                        }
                    )
            else:
                logger.warning(f"No background images found for {base_title}")

        else:
            # ========== STANDARD POSTERS (Show/Movie) ==========
            images_url = (
                f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
            )
            images_response = requests.get(images_url, headers=headers, timeout=10)

            if images_response.status_code == 200:
                images_data = images_response.json()
                posters = images_data.get("posters", [])

                # Different filtering based on poster type
                if request.poster_type == "collection":
                    # Collections: Only 'xx' (no language/international)
                    filtered_posters = [
                        p
                        for p in posters
                        if (p.get("iso_639_1") or "xx").lower() == "xx"
                    ]
                    logger.info(
                        f"Collection posters: {len(posters)} total, {len(filtered_posters)} after filtering (xx only)"
                    )
                else:
                    # Standard posters: Filter and sort by PreferredLanguageOrder
                    filtered_posters = filter_and_sort_posters_by_language(
                        posters, language_order_list
                    )
                    logger.info(
                        f"Standard posters: {len(posters)} total, {len(filtered_posters)} after filtering by language preferences"
                    )

                for poster in filtered_posters:  # Load all posters
                    results.append(
                        {
                            "tmdb_id": tmdb_id,
                            "title": base_title,
                            "poster_path": poster.get("file_path"),
                            "poster_url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                            "original_url": f"https://image.tmdb.org/t/p/original{poster.get('file_path')}",
                            "language": poster.get("iso_639_1"),
                            "vote_average": poster.get("vote_average", 0),
                            "width": poster.get("width", 0),
                            "height": poster.get("height", 0),
                            "type": "show_poster",
                        }
                    )

        logger.info(
            f"TMDB search for '{request.query}' ({request.poster_type}) returned {len(results)} images"
        )
        return {"success": True, "posters": results, "count": len(results)}

    except requests.RequestException as e:
        logger.error(f"TMDB API error: {e}")
        raise HTTPException(status_code=500, detail=f"TMDB API error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching TMDB posters: {e}")
        import traceback

        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MANUAL RUN ENDPOINTS - Must be defined BEFORE generic /api/run/{mode}
# ============================================================================
@app.post("/api/run-manual")
async def run_manual_mode(request: ManualModeRequest):
    """Run manual mode with custom parameters"""
    global current_process, current_mode

    # Debug logging
    logger.info(f"Manual mode request received: {request.model_dump()}")

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

    # Title text is NOT required for titlecards (they use epTitleName instead)
    if request.posterType != "titlecard" and (
        not request.titletext or not request.titletext.strip()
    ):
        raise HTTPException(status_code=400, detail="Title text is required")

    # Folder name is NOT required for collection posters
    if request.posterType != "collection" and (
        not request.folderName or not request.folderName.strip()
    ):
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
    elif request.posterType == "background":
        command.extend(
            [
                "-BackgroundCard",
                "-Titletext",
                request.titletext.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
            ]
        )
    elif request.posterType == "titlecard":
        command.extend(
            [
                "-TitleCard",
                "-Titletext",
                request.epTitleName.strip(),  # Use episode title as the main title
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


@app.post("/api/run-manual-upload")
async def run_manual_mode_upload(
    file: UploadFile = File(...),
    picturePath: str = "",
    titletext: str = "",
    folderName: str = "",
    libraryName: str = "",
    posterType: str = "standard",
    seasonPosterName: str = "",
    epTitleName: str = "",
    episodeNumber: str = "",
):
    """Run manual mode with uploaded file"""
    global current_process, current_mode

    logger.info(f"Manual mode upload request received")
    logger.info(f"  File: {file.filename}")
    logger.info(f"  Poster Type: {posterType}")

    # Check if already running
    if current_process and current_process.poll() is None:
        raise HTTPException(
            status_code=400,
            detail="Script is already running. Please stop the script first.",
        )

    if not SCRIPT_PATH.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    # Validate file upload
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Validate file type
    allowed_extensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}",
        )

    # Validate required fields
    if posterType != "titlecard" and not titletext.strip():
        raise HTTPException(status_code=400, detail="Title text is required")

    if posterType != "collection" and not folderName.strip():
        raise HTTPException(status_code=400, detail="Folder name is required")

    if not libraryName.strip():
        raise HTTPException(status_code=400, detail="Library name is required")

    if posterType == "season" and not seasonPosterName.strip():
        raise HTTPException(
            status_code=400, detail="Season poster name is required for season posters"
        )

    if posterType == "titlecard":
        if not epTitleName.strip():
            raise HTTPException(
                status_code=400, detail="Episode title name is required for title cards"
            )
        if not episodeNumber.strip():
            raise HTTPException(
                status_code=400, detail="Episode number is required for title cards"
            )
        if not seasonPosterName.strip():
            raise HTTPException(
                status_code=400, detail="Season name is required for title cards"
            )

    try:
        # Create uploads directory if it doesn't exist
        UPLOADS_DIR.mkdir(exist_ok=True)

        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = f"{timestamp}_{file.filename}"
        upload_path = UPLOADS_DIR / safe_filename

        # Save uploaded file to uploads directory
        logger.info(f"Saving uploaded file to: {upload_path}")
        with open(upload_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        logger.info(f"File saved successfully: {upload_path} ({len(content)} bytes)")

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

        # Build command with uploaded file path
        command = [
            ps_command,
            "-File",
            str(SCRIPT_PATH),
            "-Manual",
            "-PicturePath",
            str(upload_path),  # Use the uploaded file path
        ]

        # Add poster type specific switches and parameters
        if posterType == "season":
            command.extend(
                [
                    "-SeasonPoster",
                    "-Titletext",
                    titletext.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                    "-SeasonPosterName",
                    seasonPosterName.strip(),
                ]
            )
        elif posterType == "collection":
            command.extend(
                [
                    "-CollectionCard",
                    "-Titletext",
                    titletext.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                ]
            )
        elif posterType == "background":
            command.extend(
                [
                    "-BackgroundCard",
                    "-Titletext",
                    titletext.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                ]
            )
        elif posterType == "titlecard":
            command.extend(
                [
                    "-TitleCard",
                    "-Titletext",
                    epTitleName.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                    "-EPTitleName",
                    epTitleName.strip(),
                    "-SeasonPosterName",
                    seasonPosterName.strip(),
                    "-EpisodeNumber",
                    episodeNumber.strip(),
                ]
            )
        else:  # standard
            command.extend(
                [
                    "-Titletext",
                    titletext.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                ]
            )

        logger.info(f"Running manual mode with uploaded file:")
        logger.info(f"  Picture Path: {upload_path}")
        logger.info(f"  Type: {posterType}")
        logger.info(f"Running command: {' '.join(command)}")

        # Run the manual mode command
        current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        current_mode = "manual"

        logger.info(f"Started manual mode with PID {current_process.pid}")

        # Schedule cleanup after process completes (in background)
        async def cleanup_upload():
            """Cleanup uploaded file after process completes"""
            try:
                # Wait for process to complete
                while current_process.poll() is None:
                    await asyncio.sleep(1)

                # Wait a bit more to ensure file operations are complete
                await asyncio.sleep(5)

                # Delete the uploaded file
                if upload_path.exists():
                    upload_path.unlink()
                    logger.info(f"Cleaned up uploaded file: {upload_path}")
            except Exception as e:
                logger.error(f"Error cleaning up uploaded file: {e}")

        # Start cleanup task in background
        asyncio.create_task(cleanup_upload())

        poster_type_display = {
            "standard": "standard poster",
            "season": "season poster",
            "collection": "collection poster",
            "titlecard": "episode title card",
            "background": "background poster",
        }

        return {
            "success": True,
            "message": f"Started manual mode for {poster_type_display.get(posterType, 'poster')}",
            "pid": current_process.pid,
            "upload_path": str(upload_path),
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH."
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error running manual mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GENERIC RUN ENDPOINT - Must be defined AFTER specific endpoints like /api/run-manual
# ============================================================================
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
        "syncjelly": [ps_command, "-File", str(SCRIPT_PATH), "-SyncJelly"],
        "syncemby": [ps_command, "-File", str(SCRIPT_PATH), "-SyncEmby"],
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


@app.get("/api/logs/{log_name}")
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


@app.get("/api/logs/{log_name}/exists")
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


@app.websocket("/ws/logs")
async def websocket_logs(
    websocket: WebSocket, log_file: Optional[str] = Query("Scriptlog.log")
):
    """
    WebSocket endpoint for REAL-TIME log streaming

    Now properly accepts and respects the log_file query parameter
    - Frontend can specify which log file to watch
    - Backend won't override user's manual selection
    - Only auto-switches if user is watching the "active" log for current mode
    """
    await websocket.accept()
    logger.info(f"WebSocket connection established for log: {log_file}")

    # Determine which log file to monitor - check both directories
    log_path = LOGS_DIR / log_file
    if not log_path.exists():
        log_path = UI_LOGS_DIR / log_file

    # Track if user explicitly requested a specific log file
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
                # FASTER POLLING: 0.3s instead of 1s
                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                logger.info("WebSocket log streaming cancelled (connection closed)")
                break

            # Only auto-switch if user didn't manually request a specific log
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
                    # Check both directories for the new log file
                    log_path = LOGS_DIR / new_log_file
                    if not log_path.exists():
                        log_path = UI_LOGS_DIR / new_log_file
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

    except WebSocketDisconnect as e:
        # Normal disconnect - check close code
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


class BulkDeleteRequest(BaseModel):
    paths: List[str]


@app.post("/api/gallery/bulk-delete")
async def bulk_delete_posters(request: BulkDeleteRequest):
    """Delete multiple posters from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted poster: {file_path}")
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting poster {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} poster(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete: {e}")
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


@app.post("/api/backgrounds/bulk-delete")
async def bulk_delete_backgrounds(request: BulkDeleteRequest):
    """Delete multiple backgrounds from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted background: {file_path}")
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting background {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} background(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete backgrounds: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@app.post("/api/seasons/bulk-delete")
async def bulk_delete_seasons(request: BulkDeleteRequest):
    """Delete multiple seasons from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted season: {file_path}")
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting season {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} season(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete seasons: {e}")
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


@app.post("/api/titlecards/bulk-delete")
async def bulk_delete_titlecards(request: BulkDeleteRequest):
    """Delete multiple titlecards from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted titlecard: {file_path}")
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting titlecard {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} titlecard(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete titlecards: {e}")
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


@app.get("/api/folder-view/items/{library_path:path}")
async def get_folder_view_items(library_path: str):
    """
    Get list of item folders (movies/shows) within a library for folder view navigation
    Returns folders like "Movie Name (Year) {tmdb-123}" within the specified library
    """
    try:
        if not ASSETS_DIR.exists():
            return {"folders": []}

        library_full_path = ASSETS_DIR / library_path
        if not library_full_path.exists() or not library_full_path.is_dir():
            return {"folders": []}

        folders = []
        for item in library_full_path.iterdir():
            if item.is_dir():
                # Count assets in this folder
                asset_count = 0
                for ext in ["*.jpg", "*.jpeg", "*.png", "*.webp"]:
                    asset_count += len(list(item.glob(ext)))

                folders.append(
                    {"name": item.name, "path": item.name, "asset_count": asset_count}
                )

        # Sort by name
        folders.sort(key=lambda x: x["name"])
        return {"folders": folders}

    except Exception as e:
        logger.error(f"Error getting folder view items: {e}")
        return {"folders": []}


@app.get("/api/folder-view/assets/{item_path:path}")
async def get_folder_view_assets(item_path: str):
    """
    Get all assets (poster, background, seasons, etc.) for a specific item in folder view
    item_path should be like "4K/Movie Name (Year) {tmdb-123}"
    """
    try:
        if not ASSETS_DIR.exists():
            return {"assets": []}

        item_full_path = ASSETS_DIR / item_path
        if not item_full_path.exists() or not item_full_path.is_dir():
            return {"assets": []}

        assets = []
        for ext in ["*.jpg", "*.jpeg", "*.png", "*.webp"]:
            for image_path in item_full_path.glob(ext):
                if image_path.is_file():
                    # Create relative path from ASSETS_DIR
                    relative_path = image_path.relative_to(ASSETS_DIR)
                    url_path = str(relative_path).replace("\\", "/")

                    assets.append(
                        {
                            "name": image_path.name,
                            "path": str(relative_path).replace("\\", "/"),
                            "url": f"/poster_assets/{url_path}",
                            "size": image_path.stat().st_size,
                        }
                    )

        # Sort by name
        assets.sort(key=lambda x: x["name"])
        return {"assets": assets}

    except Exception as e:
        logger.error(f"Error getting folder view assets: {e}")
        return {"assets": []}


@app.get("/api/recent-assets")
async def get_recent_assets():
    """
    Get recently created assets from the imagechoices database
    Returns the most recent assets with their poster images from assets folder

    Uses the imagechoices.db database instead of CSV files
    Assets are ordered by ID DESC (newest/highest ID first)
    """
    try:
        # Get all assets from database (already sorted by id DESC - newest first)
        db_records = db.get_all_choices()

        logger.info(f"📊 Found {len(db_records)} total assets in database")

        # If no assets found, return early
        if not db_records:
            logger.warning("⚠️  No assets found in database")
            return {
                "success": True,
                "assets": [],
                "total_count": 0,
            }

        # Convert database records to asset format and find poster files
        recent_assets = []
        max_assets = 100  # Limit to 100 most recent assets

        for record in db_records[:max_assets]:  # Only process the first 100
            # Convert database record (sqlite3.Row) to dict
            asset_dict = dict(record)

            rootfolder = asset_dict.get("Rootfolder", "")
            asset_type = asset_dict.get("Type", "Poster")
            title = asset_dict.get("Title", "")
            download_source = asset_dict.get("Download Source", "")

            # Determine if manually created based on Manual field or download_source
            manual_field = asset_dict.get("Manual", "N/A")
            is_manually_created = manual_field in ["Yes", "true", True]

            if not is_manually_created:
                # Fallback check on download_source
                is_manually_created = download_source == "N/A" or (
                    download_source
                    and (
                        download_source.startswith("C:")
                        or download_source.startswith("/")
                        or download_source.startswith("\\")
                    )
                )

            if rootfolder:
                # Check if this is a fallback asset (skip fallback assets in recent view)
                is_fallback = asset_dict.get("Fallback", "").lower() == "true"

                # Skip fallback assets - they should only appear in assets overview
                if is_fallback:
                    logger.debug(f"⏭️  Skipping fallback asset in recent view: {title}")
                    continue

                poster_url = find_poster_in_assets(
                    rootfolder, asset_type, title, download_source
                )
                if poster_url:
                    # Format asset for frontend (match old CSV format)
                    asset = {
                        "title": asset_dict.get("Title", ""),
                        "type": asset_dict.get("Type", ""),
                        "rootfolder": rootfolder,
                        "library": asset_dict.get("LibraryName", ""),
                        "language": asset_dict.get("Language", ""),
                        "fallback": False,  # Always false here since we filter out fallback assets
                        "text_truncated": asset_dict.get("TextTruncated", "").lower()
                        == "true",
                        "download_source": download_source,
                        "provider_link": (
                            asset_dict.get("Fav Provider Link", "")
                            if asset_dict.get("Fav Provider Link", "") != "N/A"
                            else ""
                        ),
                        "is_manually_created": is_manually_created,
                        "poster_url": poster_url,
                        "has_poster": True,
                        "created_at": asset_dict.get("created_at", ""),
                    }
                    recent_assets.append(asset)
                else:
                    logger.debug(f"⏭️  Skipping asset (poster not found): {title}")

        logger.info(
            f"✨ Returning {len(recent_assets)} most recent assets with existing images from database"
        )

        return {
            "success": True,
            "assets": recent_assets,
            "total_count": len(recent_assets),
        }

    except Exception as e:
        logger.error(f"💥 Error getting recent assets from database: {e}")
        import traceback

        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e), "assets": [], "total_count": 0}


@app.get("/api/version")
async def get_version():
    """
    Gets script version from Posterizarr.ps1 and compares with GitHub Release.txt
    """
    return await get_script_version()


@app.get("/api/version-ui")
async def get_version_ui():
    """
    Gets UI version
    """
    return await fetch_version(
        local_filename="ReleaseUI.txt",
        github_url="https://raw.githubusercontent.com/fscorrupt/Posterizarr/refs/heads/main/ReleaseUI.txt",
        version_type="UI",
    )


@app.get("/api/releases")
async def get_github_releases():
    """
    Fetches all releases from GitHub and returns them formatted
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

            # Format the releases for frontend display
            formatted_releases = []
            for release in releases[:10]:  # Only last 10 releases
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
    Returns statistics about created assets - uses cache
    """
    try:
        # Use the existing cache instead of rescanning
        cache = get_fresh_assets()

        # Calculate total size from cache
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
            "folders": sorted_folders[:10],  # Top 10 folders by file count
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

        # Robust thread checking
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
                "is_stale": False,  # TTL check removed, cache is always valid
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
        # Still return a valid response
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
    """Manually trigger a scheduled run immediately (non-blocking)"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        # Use asyncio.create_task to run it asynchronously
        asyncio.create_task(scheduler.run_script(force_run=True))

        return {"success": True, "message": "Manual run triggered successfully"}
    except RuntimeError as e:
        # Runtime errors from run_script (e.g., already running, file issues)
        logger.warning(f"Cannot trigger run: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error triggering scheduled run: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ASSET REPLACEMENT API
# ============================================================================


class AssetReplaceRequest(BaseModel):
    """Request to fetch asset previews from services or upload custom"""

    asset_path: str  # Path to the asset being replaced
    media_type: str  # "movie" or "tv"
    asset_type: str  # "poster", "background", "season", "titlecard"
    tmdb_id: Optional[str] = None
    tvdb_id: Optional[str] = None
    title: Optional[str] = None  # Movie/show title for fallback search
    year: Optional[int] = None  # Release year for fallback search
    season_number: Optional[int] = None
    episode_number: Optional[int] = None


class AssetUploadRequest(BaseModel):
    """Request to replace an asset with uploaded image"""

    asset_path: str
    image_data: str  # Base64 encoded image


@app.post("/api/assets/fetch-replacements")
async def fetch_asset_replacements(request: AssetReplaceRequest):
    """
    Fetch replacement asset previews from TMDB, TVDB, and Fanart.tv
    Returns a list of preview images from all available sources
    """
    try:
        # DEBUG: Log incoming request
        logger.info(f"🔍 Asset replacement request:")
        logger.info(f"  Asset Path: {request.asset_path}")
        logger.info(f"  Media Type: {request.media_type}")
        logger.info(f"  Asset Type: {request.asset_type}")
        logger.info(f"  Title: {request.title}")
        logger.info(f"  Year: {request.year}")
        logger.info(f"  TMDB ID: {request.tmdb_id}")
        logger.info(f"  TVDB ID: {request.tvdb_id}")

        # Load config to get API keys
        if not CONFIG_PATH.exists():
            raise HTTPException(status_code=404, detail="Config file not found")

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        # Get API tokens
        if CONFIG_MAPPER_AVAILABLE:
            flat_config = flatten_config(grouped_config)
            tmdb_token = flat_config.get("tmdbtoken", "")
            tvdb_api_key = flat_config.get("tvdbapikey", "")
            tvdb_pin = flat_config.get("tvdbpin", "")
            fanart_api_key = flat_config.get("fanartapikey", "")
        else:
            api_part = grouped_config.get("ApiPart", {})
            tmdb_token = api_part.get("tmdbtoken", "")
            tvdb_api_key = api_part.get("tvdbapikey", "")
            tvdb_pin = api_part.get("tvdbpin", "")
            fanart_api_key = api_part.get("fanartapikey", "")

        results = {"tmdb": [], "tvdb": [], "fanart": []}

        # Helper function to search for TMDB ID by title and year
        async def search_tmdb_id(
            title: str, year: Optional[int], media_type: str
        ) -> Optional[str]:
            if not tmdb_token or not title:
                return None
            try:
                headers = {
                    "Authorization": f"Bearer {tmdb_token}",
                    "Content-Type": "application/json",
                }
                search_endpoint = "movie" if media_type == "movie" else "tv"
                url = f"https://api.themoviedb.org/3/search/{search_endpoint}"
                params = {"query": title}

                if year and media_type == "movie":
                    params["year"] = year
                elif year and media_type == "tv":
                    params["first_air_date_year"] = year

                logger.info(f"🔎 TMDB API Request: {url}")
                logger.info(f"   Params: {params}")

                response = requests.get(url, headers=headers, params=params, timeout=10)
                logger.info(f"   Response Status: {response.status_code}")

                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])
                    logger.info(f"   Results Count: {len(results)}")
                    if results:
                        result_id = str(results[0].get("id"))
                        result_title = results[0].get(
                            "title" if media_type == "movie" else "name"
                        )
                        logger.info(
                            f"   First Result: ID={result_id}, Title='{result_title}'"
                        )
                        return result_id
                    else:
                        logger.warning(f"   No results found in TMDB response")
            except Exception as e:
                logger.error(f"Error searching TMDB by title: {e}")
            return None

        # Determine TMDB ID - simple approach: use provided ID or search by title
        tmdb_id_to_use = request.tmdb_id

        # If no TMDB ID and we have title, search for it
        if not tmdb_id_to_use and request.title and tmdb_token:
            logger.info(
                f"🔍 Searching TMDB for title: '{request.title}' (year: {request.year})"
            )
            tmdb_id_to_use = await search_tmdb_id(
                request.title, request.year, request.media_type
            )
            if tmdb_id_to_use:
                logger.info(f"✅ Found TMDB ID: {tmdb_id_to_use}")
            else:
                logger.warning(f"❌ No TMDB ID found for: '{request.title}'")
        else:
            logger.info(f"✅ Using provided TMDB ID: {tmdb_id_to_use}")

        # ========== TMDB ==========
        if tmdb_token and tmdb_id_to_use:
            try:
                headers = {
                    "Authorization": f"Bearer {tmdb_token}",
                    "Content-Type": "application/json",
                }

                media_endpoint = "movie" if request.media_type == "movie" else "tv"

                if (
                    request.asset_type == "titlecard"
                    and request.season_number
                    and request.episode_number
                ):
                    # Episode stills
                    url = f"https://api.themoviedb.org/3/tv/{tmdb_id_to_use}/season/{request.season_number}/episode/{request.episode_number}/images"
                    response = requests.get(url, headers=headers, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        for still in data.get("stills", []):
                            results["tmdb"].append(
                                {
                                    "url": f"https://image.tmdb.org/t/p/w500{still.get('file_path')}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{still.get('file_path')}",
                                    "source": "TMDB",
                                    "type": "episode_still",
                                    "vote_average": still.get("vote_average", 0),
                                }
                            )

                elif request.asset_type == "season" and request.season_number:
                    # Season posters
                    url = f"https://api.themoviedb.org/3/tv/{tmdb_id_to_use}/season/{request.season_number}/images"
                    response = requests.get(url, headers=headers, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        for poster in data.get("posters", []):
                            results["tmdb"].append(
                                {
                                    "url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster.get('file_path')}",
                                    "source": "TMDB",
                                    "type": "season_poster",
                                    "language": poster.get("iso_639_1"),
                                    "vote_average": poster.get("vote_average", 0),
                                }
                            )

                elif request.asset_type == "background":
                    # Backgrounds
                    url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id_to_use}/images"
                    response = requests.get(url, headers=headers, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        for backdrop in data.get("backdrops", []):
                            results["tmdb"].append(
                                {
                                    "url": f"https://image.tmdb.org/t/p/w500{backdrop.get('file_path')}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{backdrop.get('file_path')}",
                                    "source": "TMDB",
                                    "type": "backdrop",
                                    "language": backdrop.get("iso_639_1"),
                                    "vote_average": backdrop.get("vote_average", 0),
                                }
                            )

                else:
                    # Standard posters
                    url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id_to_use}/images"
                    response = requests.get(url, headers=headers, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        for poster in data.get("posters", []):
                            results["tmdb"].append(
                                {
                                    "url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster.get('file_path')}",
                                    "source": "TMDB",
                                    "type": "poster",
                                    "language": poster.get("iso_639_1"),
                                    "vote_average": poster.get("vote_average", 0),
                                }
                            )

            except Exception as e:
                logger.error(f"Error fetching TMDB assets: {e}")

        # ========== TVDB ==========
        if tvdb_api_key and request.tvdb_id:
            try:
                # First, login to get token
                async with httpx.AsyncClient(timeout=10.0) as client:
                    login_url = "https://api4.thetvdb.com/v4/login"
                    body = {"apikey": tvdb_api_key}
                    if tvdb_pin:
                        body["pin"] = tvdb_pin

                    headers = {
                        "accept": "application/json",
                        "Content-Type": "application/json",
                    }

                    login_response = await client.post(
                        login_url, json=body, headers=headers
                    )

                    if login_response.status_code == 200:
                        token = login_response.json().get("data", {}).get("token")

                        if token:
                            auth_headers = {
                                "Authorization": f"Bearer {token}",
                                "accept": "application/json",
                            }

                            # Fetch artwork
                            artwork_url = f"https://api4.thetvdb.com/v4/series/{request.tvdb_id}/artworks"
                            artwork_params = {
                                "lang": "eng",
                                "type": "2",
                            }  # type=2 for posters

                            if request.asset_type == "background":
                                artwork_params["type"] = "3"  # type=3 for backgrounds

                            artwork_response = await client.get(
                                artwork_url, headers=auth_headers, params=artwork_params
                            )

                            if artwork_response.status_code == 200:
                                artwork_data = artwork_response.json()
                                artworks = artwork_data.get("data", {}).get(
                                    "artworks", []
                                )

                                for artwork in artworks:
                                    results["tvdb"].append(
                                        {
                                            "url": artwork.get("image"),
                                            "original_url": artwork.get("image"),
                                            "source": "TVDB",
                                            "type": request.asset_type,
                                            "language": artwork.get("language"),
                                        }
                                    )

            except Exception as e:
                logger.error(f"Error fetching TVDB assets: {e}")

        # ========== Fanart.tv ==========
        if fanart_api_key and (tmdb_id_to_use or request.tvdb_id):
            try:
                if request.media_type == "movie" and tmdb_id_to_use:
                    url = f"https://webservice.fanart.tv/v3/movies/{tmdb_id_to_use}?api_key={fanart_api_key}"
                elif request.media_type == "tv" and request.tvdb_id:
                    url = f"https://webservice.fanart.tv/v3/tv/{request.tvdb_id}?api_key={fanart_api_key}"
                else:
                    url = None

                if url:
                    response = requests.get(url, timeout=10)
                    if response.status_code == 200:
                        data = response.json()

                        # Map asset types to fanart.tv keys
                        if request.asset_type == "poster":
                            fanart_keys = (
                                ["movieposter"]
                                if request.media_type == "movie"
                                else ["tvposter"]
                            )
                        elif request.asset_type == "background":
                            fanart_keys = (
                                ["moviebackground"]
                                if request.media_type == "movie"
                                else ["showbackground"]
                            )
                        else:
                            fanart_keys = []

                        for key in fanart_keys:
                            items = data.get(key, [])
                            for item in items:
                                results["fanart"].append(
                                    {
                                        "url": item.get("url"),
                                        "original_url": item.get("url"),
                                        "source": "Fanart.tv",
                                        "type": request.asset_type,
                                        "language": item.get("lang"),
                                        "likes": item.get("likes", 0),
                                    }
                                )

            except Exception as e:
                logger.error(f"Error fetching Fanart.tv assets: {e}")

        # Count total results
        total_count = sum(len(results[source]) for source in results)

        logger.info(
            f"Fetched {total_count} replacement options: "
            f"TMDB={len(results['tmdb'])}, TVDB={len(results['tvdb'])}, Fanart={len(results['fanart'])}"
        )

        return {
            "success": True,
            "results": results,
            "total_count": total_count,
        }

    except Exception as e:
        logger.error(f"Error fetching asset replacements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/assets/upload-replacement")
async def upload_asset_replacement(
    file: UploadFile = File(...),
    asset_path: str = Query(...),
    process_with_overlays: bool = Query(False),
    title_text: Optional[str] = Query(None),
    folder_name: Optional[str] = Query(None),
    library_name: Optional[str] = Query(None),
    season_number: Optional[str] = Query(None),
    episode_number: Optional[str] = Query(None),
    episode_title: Optional[str] = Query(None),
):
    """
    Replace an asset with an uploaded image
    Optionally process with overlays using Manual Run
    """
    try:
        logger.info(f"Asset replacement upload request received")
        logger.info(f"  Asset path: {asset_path}")
        logger.info(f"  File: {file.filename}")
        logger.info(f"  Content type: {file.content_type}")
        logger.info(f"  Process with overlays: {process_with_overlays}")

        # Validate file upload
        if not file or not file.filename:
            logger.error("No file uploaded")
            raise HTTPException(status_code=400, detail="No file uploaded")

        # Validate file type - check both content type and extension
        allowed_extensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]
        file_extension = Path(file.filename).suffix.lower()

        if file_extension not in allowed_extensions:
            logger.error(f"Invalid file extension: {file_extension}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}",
            )

        # Validate content type
        if not file.content_type or not file.content_type.startswith("image/"):
            logger.error(f"Invalid content type: {file.content_type}")
            raise HTTPException(status_code=400, detail="File must be an image")

        # Validate and sanitize asset path
        try:
            # Normalize the path to handle different path separators
            normalized_path = Path(asset_path)
            full_asset_path = (ASSETS_DIR / normalized_path).resolve()

            # Security: Ensure the path doesn't escape ASSETS_DIR
            if not str(full_asset_path).startswith(str(ASSETS_DIR.resolve())):
                logger.error(f"Path traversal attempt detected: {asset_path}")
                raise HTTPException(status_code=400, detail="Invalid asset path")

            # Check if asset exists
            if not full_asset_path.exists():
                logger.error(f"Asset not found: {full_asset_path}")
                raise HTTPException(
                    status_code=404, detail=f"Asset not found: {asset_path}"
                )

            logger.info(f"Full asset path: {full_asset_path}")

        except (ValueError, OSError) as e:
            logger.error(f"Invalid asset path '{asset_path}': {e}")
            raise HTTPException(status_code=400, detail=f"Invalid asset path: {str(e)}")

        # Ensure parent directory exists
        full_asset_path.parent.mkdir(parents=True, exist_ok=True)

        # Read uploaded file
        try:
            contents = await file.read()
            logger.info(f"File read successfully: {len(contents)} bytes")
        except Exception as e:
            logger.error(f"Error reading uploaded file: {e}")
            raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

        # Validate file size
        if len(contents) == 0:
            logger.error("Uploaded file is empty")
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        # Create backup of original
        try:
            backup_path = full_asset_path.with_suffix(
                full_asset_path.suffix + ".backup"
            )
            if full_asset_path.exists() and not backup_path.exists():
                import shutil

                shutil.copy2(full_asset_path, backup_path)
                logger.info(f"Created backup: {backup_path}")
        except Exception as e:
            logger.warning(f"Failed to create backup (continuing anyway): {e}")

        # Save new image
        try:
            with open(full_asset_path, "wb") as f:
                f.write(contents)
            logger.info(f"Replaced asset: {asset_path} (size: {len(contents)} bytes)")
        except PermissionError as e:
            logger.error(f"Permission denied writing to {full_asset_path}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Permission denied: Unable to write to file. Check file permissions.",
            )
        except OSError as e:
            logger.error(f"OS error writing to {full_asset_path}: {e}")
            raise HTTPException(status_code=500, detail=f"File system error: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error writing file: {e}")
            raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

        result = {
            "success": True,
            "message": "Asset replaced successfully",
            "path": asset_path,
            "size": len(contents),
        }

        # If process_with_overlays is enabled, trigger Manual Run
        if process_with_overlays:
            logger.info(f"🎨 Processing with overlays enabled for: {asset_path}")

            try:
                # Parse asset path to extract info
                # Format: LibraryName/FolderName/poster.jpg, Season01.jpg, or S01E01.jpg
                path_parts = Path(asset_path).parts
                logger.info(f"Path parts: {path_parts} (length: {len(path_parts)})")

                if len(path_parts) >= 3:
                    # Use provided library_name and folder_name if available, otherwise extract from path
                    extracted_library_name = path_parts[0]
                    extracted_folder_name = path_parts[1]

                    final_library_name = library_name or extracted_library_name
                    final_folder_name = folder_name or extracted_folder_name
                    final_title_text = title_text or extracted_folder_name

                    logger.info(
                        f"Overlay parameters - Library: {final_library_name}, Folder: {final_folder_name}, Title: {final_title_text}"
                    )

                    # Determine poster type from filename
                    filename = Path(asset_path).name.lower()

                    # Build Manual Run command
                    command = [
                        "pwsh" if os.name == "nt" else "pwsh",
                        "-File",
                        str(SCRIPT_PATH),
                        "-manual",
                        "-PicturePath",
                        str(full_asset_path),
                        "-Titletext",
                        final_title_text,
                        "-FolderName",
                        final_folder_name,
                        "-LibraryName",
                        final_library_name,
                    ]

                    # Handle Season posters (Season01.jpg, Season 01.jpg, etc.)
                    if season_number or "season" in filename:
                        command.extend(["-SeasonPoster"])
                        if season_number:
                            command.extend(["-SeasonPosterName", season_number])

                    # Handle TitleCards (S01E01.jpg, etc.)
                    elif episode_number and episode_title:
                        command.extend(["-TitleCards"])
                        command.extend(["-EpisodeNumber", episode_number])
                        command.extend(["-EpisodeTitleName", episode_title])

                    # Handle Background cards (background.jpg, backdrop.jpg, etc.)
                    elif "background" in filename or "backdrop" in filename:
                        command.extend(["-BackgroundCard"])

                    # Default: Standard poster
                    # No additional flags needed

                    logger.info(
                        f"🚀 Starting Manual Run for overlay processing: {' '.join(command)}"
                    )

                    # Start the Manual Run process
                    global current_process, current_mode
                    current_process = subprocess.Popen(
                        command,
                        cwd=str(BASE_DIR),
                        stdout=None,
                        stderr=None,
                        text=True,
                    )
                    current_mode = "manual"

                    logger.info(
                        f"✅ Manual Run started (PID: {current_process.pid}) for overlay processing"
                    )

                    result["manual_run_triggered"] = True
                    result["message"] = (
                        "Asset replaced and queued for overlay processing"
                    )

                else:
                    logger.warning(
                        f"⚠️ Invalid path structure for overlay processing: {asset_path}"
                    )
                    result["manual_run_triggered"] = False
                    result["message"] = (
                        "Asset replaced but overlay processing skipped (invalid path structure)"
                    )

            except Exception as e:
                logger.error(f"❌ Error triggering Manual Run: {e}")
                result["manual_run_triggered"] = False
                result["error"] = str(e)

        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_details = traceback.format_exc()
        logger.error(f"Unexpected error uploading asset replacement: {e}")
        logger.error(f"Traceback:\n{error_details}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/assets/replace-from-url")
async def replace_asset_from_url(
    asset_path: str = Query(...),
    image_url: str = Query(...),
    process_with_overlays: bool = Query(False),
    title_text: Optional[str] = Query(None),
    folder_name: Optional[str] = Query(None),
    library_name: Optional[str] = Query(None),
    season_number: Optional[str] = Query(None),
    episode_number: Optional[str] = Query(None),
    episode_title: Optional[str] = Query(None),
):
    """
    Replace an asset by downloading from a URL
    Optionally process with overlays using Manual Run
    """
    try:
        # Validate asset path exists
        full_asset_path = ASSETS_DIR / asset_path
        if not full_asset_path.exists():
            raise HTTPException(status_code=404, detail="Asset not found")

        # Download image from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400, detail="Failed to download image from URL"
                )

            contents = response.content

        # Create backup of original
        backup_path = full_asset_path.with_suffix(full_asset_path.suffix + ".backup")
        if full_asset_path.exists() and not backup_path.exists():
            import shutil

            shutil.copy2(full_asset_path, backup_path)
            logger.info(f"Created backup: {backup_path}")

        # Save new image
        with open(full_asset_path, "wb") as f:
            f.write(contents)

        logger.info(
            f"Replaced asset from URL: {asset_path} (size: {len(contents)} bytes)"
        )

        result = {
            "success": True,
            "message": "Asset replaced successfully",
            "path": asset_path,
            "size": len(contents),
        }

        # If process_with_overlays is enabled, trigger Manual Run
        if process_with_overlays:
            logger.info(f"🎨 Processing with overlays enabled for: {asset_path}")

            try:
                # Parse asset path to extract info
                # Format: LibraryName/FolderName/poster.jpg, Season01.jpg, or S01E01.jpg
                path_parts = Path(asset_path).parts

                if len(path_parts) >= 3:
                    # Use provided library_name and folder_name if available, otherwise extract from path
                    extracted_library_name = path_parts[0]
                    extracted_folder_name = path_parts[1]
                    filename = path_parts[-1]

                    # Prefer user-provided values over extracted values
                    final_library_name = (
                        library_name if library_name else extracted_library_name
                    )
                    final_folder_name = (
                        folder_name if folder_name else extracted_folder_name
                    )

                    # Determine poster type from filename
                    poster_type = None
                    season_poster_name = None
                    ep_title_name = None
                    ep_number = None

                    if filename == "poster.jpg":
                        poster_type = "standard"
                    elif filename == "background.jpg":
                        poster_type = "background"
                    elif re.match(r"^Season(\d+)\.jpg$", filename):
                        poster_type = "season"
                        # Extract season number from filename or use provided one
                        season_match = re.match(r"^Season(\d+)\.jpg$", filename)
                        if season_match:
                            extracted_season = season_match.group(1)
                            # Use provided season_number or fall back to extracted
                            season_poster_name = f"Season {season_number if season_number else extracted_season}"
                        elif season_number:
                            season_poster_name = f"Season {season_number}"
                        else:
                            raise ValueError(
                                f"Could not determine season number for: {filename}"
                            )
                    elif re.match(r"^S(\d+)E(\d+)\.jpg$", filename):
                        poster_type = "titlecard"
                        # Extract season/episode from filename or use provided values
                        ep_match = re.match(r"^S(\d+)E(\d+)\.jpg$", filename)
                        if ep_match:
                            extracted_season = ep_match.group(1)
                            extracted_episode = ep_match.group(2)
                            # Use provided values or fall back to extracted
                            season_poster_name = (
                                season_number if season_number else extracted_season
                            )
                            ep_number = (
                                episode_number if episode_number else extracted_episode
                            )
                        else:
                            season_poster_name = season_number
                            ep_number = episode_number

                        # Episode title must be provided
                        if not episode_title:
                            raise ValueError(
                                f"Episode title is required for title card processing"
                            )
                        ep_title_name = episode_title
                    else:
                        raise ValueError(
                            f"Unsupported file type for overlay processing: {filename}"
                        )

                    # Extract title text from folder name if not provided
                    # Remove year and TMDB/TVDB ID from folder name
                    final_title_text = title_text
                    if not final_title_text:
                        # Match patterns like "Movie Name (2024) {tmdb-12345}"
                        title_match = re.match(r"^(.+?)\s*\(\d{4}\)", final_folder_name)
                        if title_match:
                            final_title_text = title_match.group(1).strip()
                        else:
                            # Fallback: use folder name as-is
                            final_title_text = final_folder_name

                    logger.info(
                        f"📋 Manual Run params - Library: {final_library_name}, Folder: {final_folder_name}, Type: {poster_type}, Title: {final_title_text}"
                    )
                    if season_poster_name:
                        logger.info(f"📋 Season: {season_poster_name}")
                    if ep_number and ep_title_name:
                        logger.info(f"📋 Episode: {ep_number} - {ep_title_name}")

                    # Build ManualModeRequest
                    manual_request = ManualModeRequest(
                        picturePath=str(full_asset_path),
                        titletext=(
                            final_title_text
                            if poster_type != "titlecard"
                            else ep_title_name
                        ),
                        folderName=final_folder_name,
                        libraryName=final_library_name,
                        posterType=poster_type,
                        seasonPosterName=season_poster_name or "",
                        epTitleName=ep_title_name or "",
                        episodeNumber=ep_number or "",
                    )

                    # Call run_manual_mode (we need to make it callable)
                    await trigger_manual_run_internal(manual_request)

                    result["message"] = (
                        "Asset replaced and queued for overlay processing"
                    )
                    result["manual_run_triggered"] = True
                    logger.info(
                        f"✅ Manual Run triggered successfully for {asset_path}"
                    )
                else:
                    logger.warning(
                        f"⚠️ Cannot extract library/folder from path: {asset_path}"
                    )
                    result["manual_run_triggered"] = False
                    result["message"] = (
                        "Asset replaced but overlay processing skipped (invalid path structure)"
                    )

            except Exception as e:
                logger.error(f"❌ Failed to trigger Manual Run: {e}")
                result["manual_run_triggered"] = False
                result["manual_run_error"] = str(e)
                # Don't fail the whole request, asset is already replaced

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error replacing asset from URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def trigger_manual_run_internal(request: ManualModeRequest):
    """
    Internal function to trigger manual run without HTTP overhead
    This is called from replace_asset_from_url
    """
    global current_process, current_mode

    # Check if already running
    if current_process and current_process.poll() is None:
        raise ValueError("Script is already running")

    if not SCRIPT_PATH.exists():
        raise ValueError("Posterizarr.ps1 not found")

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
    if request.posterType == "titlecard":
        command.extend(
            [
                "-TitleCard",
                "-Titletext",
                request.epTitleName.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
                "-EPTitleName",
                request.epTitleName.strip(),
                "-EpisodeNumber",
                request.episodeNumber.strip(),
                "-SeasonPosterName",
                request.seasonPosterName.strip(),
            ]
        )
    elif request.posterType == "season":
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
    elif request.posterType == "background":
        command.extend(
            [
                "-BackgroundCard",
                "-Titletext",
                request.titletext.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
            ]
        )
    else:  # standard poster
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

    logger.info(f"🚀 Starting Manual Run: {' '.join(command)}")

    # Start the process in background
    # IMPORTANT: Do NOT redirect stdout/stderr to PIPE if we're not reading them!
    # This prevents the process from hanging when the buffer fills up
    current_process = subprocess.Popen(
        command,
        cwd=str(BASE_DIR),
        stdout=None,  # Let output go to console/log
        stderr=None,  # Let output go to console/log
        text=True,
    )
    current_mode = "manual"

    logger.info(f"✅ Manual Run process started (PID: {current_process.pid})")


# ============================================
# API ENDPOINTS: IMAGE CHOICES DATABASE
# ============================================


class ImageChoiceRecord(BaseModel):
    """Model for image choice record"""

    Title: str
    Type: Optional[str] = None
    Rootfolder: Optional[str] = None
    LibraryName: Optional[str] = None
    Language: Optional[str] = None
    Fallback: Optional[str] = None
    TextTruncated: Optional[str] = None
    DownloadSource: Optional[str] = None
    FavProviderLink: Optional[str] = None
    Manual: Optional[str] = None


@app.get("/api/assets/overview")
async def get_assets_overview():
    """
    Get asset overview with categorized issues.
    Categories: Missing Assets, Non-Primary Lang, Non-Primary Provider, Truncated Text, Total with Issues
    Note: Manual entries are excluded from all categories
    """
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Get all records from database
        records = db.get_all_choices()

        # Get primary language and provider from config
        primary_language = None
        primary_provider = None

        try:
            if CONFIG_PATH.exists():
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    config = json.load(f)

                    # Check ApiPart for PreferredLanguageOrder
                    api_part = config.get("ApiPart", {})
                    lang_order = api_part.get("PreferredLanguageOrder", [])
                    if lang_order and len(lang_order) > 0:
                        primary_language = lang_order[0]

                    # Get FavProvider from ApiPart
                    fav_provider = api_part.get("FavProvider", "")
                    if fav_provider:
                        primary_provider = fav_provider.lower()

        except Exception as e:
            logger.warning(f"Could not read config: {e}")

        # Initialize categories
        missing_assets = []
        non_primary_lang = []
        non_primary_provider = []
        truncated_text = []
        assets_with_issues = []

        # Categorize each record
        for record in records:
            record_dict = dict(record)

            # Skip Manual entries entirely (Manual == "True" or "true")
            manual_value = str(record_dict.get("Manual", "")).lower()
            if manual_value == "true":
                continue

            has_issue = False

            # Missing Assets: DownloadSource == "false" (string) or False (boolean) or empty
            # OR FavProviderLink is missing
            download_source = record_dict.get("DownloadSource")
            provider_link = record_dict.get("FavProviderLink", "")

            is_download_missing = (
                download_source == "false"
                or download_source == False
                or not download_source
            )

            is_provider_link_missing = (
                provider_link == "false" or provider_link == False or not provider_link
            )

            if is_download_missing or is_provider_link_missing:
                missing_assets.append(record_dict)
                has_issue = True

            # Non-Primary Language: Check language against config
            language = record_dict.get("Language", "")

            if language and primary_language:
                # Normalize: "Textless" = "xx", case-insensitive
                lang_normalized = (
                    "xx" if language.lower() == "textless" else language.lower()
                )
                primary_normalized = (
                    "xx"
                    if primary_language.lower() == "textless"
                    else primary_language.lower()
                )

                if lang_normalized != primary_normalized:
                    non_primary_lang.append(record_dict)
                    has_issue = True
            elif language and not primary_language:
                # If no primary language set, consider anything that's not Textless/xx as non-primary
                if language.lower() not in ["xx", "textless"]:
                    non_primary_lang.append(record_dict)
                    has_issue = True

            # Non-Primary Provider: Check if DownloadSource OR FavProviderLink don't match primary provider
            # Only check if we have both DownloadSource AND FavProviderLink
            if not is_download_missing and not is_provider_link_missing:
                if primary_provider:
                    # Check if provider link contains the primary provider
                    # Map provider names to their URL patterns
                    provider_patterns = {
                        "tmdb": ["tmdb", "themoviedb"],
                        "tvdb": ["tvdb", "thetvdb"],
                        "fanart": ["fanart"],
                        "plex": ["plex"],
                    }

                    patterns = provider_patterns.get(
                        primary_provider, [primary_provider]
                    )

                    # Check if DownloadSource contains the primary provider
                    is_download_from_primary = any(
                        pattern in download_source.lower() for pattern in patterns
                    )

                    # Check if FavProviderLink contains the primary provider
                    is_fav_link_from_primary = any(
                        pattern in provider_link.lower() for pattern in patterns
                    )

                    # Show as non-primary if EITHER DownloadSource OR FavProviderLink is not from primary provider
                    if not is_download_from_primary or not is_fav_link_from_primary:
                        non_primary_provider.append(record_dict)
                        has_issue = True

            # Truncated Text: TextTruncated == "True" or "true"
            truncated_value = str(record_dict.get("TextTruncated", "")).lower()
            if truncated_value == "true":
                truncated_text.append(record_dict)
                has_issue = True

            # Add to assets_with_issues if any issue flag is set
            if has_issue:
                assets_with_issues.append(record_dict)

        return {
            "categories": {
                "missing_assets": {
                    "count": len(missing_assets),
                    "assets": missing_assets,
                },
                "non_primary_lang": {
                    "count": len(non_primary_lang),
                    "assets": non_primary_lang,
                },
                "non_primary_provider": {
                    "count": len(non_primary_provider),
                    "assets": non_primary_provider,
                },
                "truncated_text": {
                    "count": len(truncated_text),
                    "assets": truncated_text,
                },
                "assets_with_issues": {
                    "count": len(assets_with_issues),
                    "assets": assets_with_issues,
                },
            },
            "config": {
                "primary_language": primary_language,
                "primary_provider": primary_provider,
            },
        }
    except Exception as e:
        logger.error(f"Error fetching assets overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/imagechoices")
async def get_all_imagechoices():
    """Get all image choice records"""
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        records = db.get_all_choices()
        # Convert sqlite3.Row to dict
        return [dict(record) for record in records]
    except Exception as e:
        logger.error(f"Error fetching image choices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/imagechoices/{title}")
async def get_imagechoice_by_title(title: str):
    """Get image choice by title"""
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        record = db.get_choice_by_title(title)
        if record is None:
            raise HTTPException(status_code=404, detail="Record not found")
        return dict(record)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/imagechoices")
async def create_imagechoice(record: ImageChoiceRecord):
    """Create a new image choice record"""
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        record_id = db.insert_choice(
            title=record.Title,
            type_=record.Type,
            rootfolder=record.Rootfolder,
            library_name=record.LibraryName,
            language=record.Language,
            fallback=record.Fallback,
            text_truncated=record.TextTruncated,
            download_source=record.DownloadSource,
            fav_provider_link=record.FavProviderLink,
            manual=record.Manual,
        )
        return {"id": record_id, "message": "Record created successfully"}
    except Exception as e:
        logger.error(f"Error creating image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/imagechoices/{record_id}")
async def update_imagechoice(record_id: int, record: ImageChoiceRecord):
    """Update an existing image choice record"""
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Convert record to dict and filter out None values
        update_data = {k: v for k, v in record.dict().items() if v is not None}
        db.update_choice(record_id, **update_data)
        return {"message": "Record updated successfully"}
    except Exception as e:
        logger.error(f"Error updating image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/imagechoices/{record_id}")
async def delete_imagechoice(record_id: int):
    """Delete an image choice record"""
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        db.delete_choice(record_id)
        return {"message": "Record deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/imagechoices/{record_id}/find-asset")
async def find_asset_for_imagechoice(record_id: int):
    """
    Find the actual asset file path for a database record.
    Searches the filesystem for the matching asset based on Rootfolder, LibraryName, and Type.
    Returns the asset path in Gallery-compatible format.
    """
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Get the record from DB
        record = db.get_choice_by_id(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")

        record_dict = dict(record)
        rootfolder = record_dict.get("Rootfolder")
        library = record_dict.get("LibraryName")
        asset_type = (record_dict.get("Type") or "").lower()

        if not rootfolder or not library:
            raise HTTPException(
                status_code=400, detail="Record missing Rootfolder or LibraryName"
            )

        # Construct the folder path
        folder_path = ASSETS_DIR / library / rootfolder

        if not folder_path.exists() or not folder_path.is_dir():
            raise HTTPException(
                status_code=404,
                detail=f"Asset folder not found: {library}/{rootfolder}",
            )

        # Determine which file pattern to look for based on type
        if "background" in asset_type:
            pattern = "background.*"
        elif "season" in asset_type:
            pattern = "Season*.*"
        elif "titlecard" in asset_type or "episode" in asset_type:
            pattern = "S[0-9][0-9]E[0-9][0-9].*"
        else:
            pattern = "poster.*"

        # Find matching files
        import glob

        matching_files = list(folder_path.glob(pattern))

        if not matching_files:
            raise HTTPException(
                status_code=404,
                detail=f"No matching asset found in {library}/{rootfolder} with pattern {pattern}",
            )

        # Return the first match (in Gallery-compatible format)
        asset_file = matching_files[0]
        relative_path = asset_file.relative_to(ASSETS_DIR)
        path_str = str(relative_path).replace("\\", "/")

        return {
            "success": True,
            "asset": {
                "name": asset_file.name,
                "path": path_str,
                "url": f"/poster_assets/{path_str}",
                "type": asset_type,
                "library": library,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding asset for record {record_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/imagechoices/import")
async def import_imagechoices_csv():
    """Manually trigger import of ImageChoices.csv to database"""
    if not DATABASE_AVAILABLE or db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    csv_path = LOGS_DIR / "ImageChoices.csv"
    if not csv_path.exists():
        raise HTTPException(
            status_code=404, detail="ImageChoices.csv not found in Logs directory"
        )

    try:
        stats = db.import_from_csv(csv_path)
        return {
            "message": "CSV import completed",
            "stats": {
                "added": stats["added"],
                "skipped": stats["skipped"],
                "errors": stats["errors"],
                "error_details": stats["error_details"] if stats["errors"] > 0 else [],
            },
        }
    except Exception as e:
        logger.error(f"Error importing CSV: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# STATIC FILE MOUNTS
# ============================================


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

if IMAGES_DIR.exists():
    app.mount(
        "/images",
        CachedStaticFiles(directory=str(IMAGES_DIR), max_age=86400),  # 24h Cache
        name="images",
    )
    logger.info(f"Mounted /images -> {IMAGES_DIR} (with 24h cache)")

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    logger.info(f"Mounted frontend from {FRONTEND_DIR}")


# SPA fallback - must be AFTER static files mount
# This catches all routes that don't match API endpoints or static files
# and returns index.html so React Router can handle the routing
@app.exception_handler(404)
async def spa_fallback(request: Request, exc: HTTPException):
    """
    Catch-all handler for SPA (Single Page Application) support.
    Returns index.html for any 404 that doesn't match an API endpoint,
    allowing React Router to handle client-side routing.
    """
    # Don't intercept API calls or WebSocket connections
    if request.url.path.startswith(("/api/", "/ws/")):
        return exc

    # Return index.html for all other 404s (client-side routes)
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    # If index.html doesn't exist, return the original 404
    return exc


# ============================================================================


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
