from fastapi import (
    FastAPI,
    WebSocket,
    WebSocketDisconnect,
    HTTPException,
    Query,
    Request,
    UploadFile,
    File,
    Form,
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
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).parent))

# Check if running in Docker
IS_DOCKER = (
    os.path.exists("/.dockerenv")
    or os.environ.get("DOCKER_ENV", "").lower() == "true"
    or os.environ.get("POSTERIZARR_NON_ROOT", "").lower() == "true"
)

port = int(os.environ.get("APP_PORT", 8000))

if IS_DOCKER:
    BASE_DIR = Path("/config")
    APP_DIR = Path("/app")
    ASSETS_DIR = Path("/assets")
    MANUAL_ASSETS_DIR = Path("/manualassets")
    IMAGES_DIR = Path("/app/images")
    FRONTEND_DIR = Path("/app/frontend/dist")
    BACKUP_DIR = BASE_DIR / "assetsbackup"  # Docker default
else:
    # Local: webui/backend/main.py -> project root (3 levels up)
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    BASE_DIR = PROJECT_ROOT
    APP_DIR = PROJECT_ROOT
    IMAGES_DIR = PROJECT_ROOT / "images"
    FRONTEND_DIR = PROJECT_ROOT / "webui" / "frontend" / "dist"

    # Load AssetPath, ManualAssetPath and BackupPath from config
    CONFIG_PATH_TEMP = PROJECT_ROOT / "config.json"
    ASSETS_DIR = PROJECT_ROOT / "assets"  # Default
    MANUAL_ASSETS_DIR = PROJECT_ROOT / "manualassets"  # Default
    BACKUP_DIR = PROJECT_ROOT / "assetsbackup"  # Default

    if CONFIG_PATH_TEMP.exists():
        try:
            with open(CONFIG_PATH_TEMP, "r", encoding="utf-8") as f:
                config_data = json.load(f)
                if "PrerequisitePart" in config_data:
                    asset_path = config_data["PrerequisitePart"].get("AssetPath")
                    manual_asset_path = config_data["PrerequisitePart"].get(
                        "ManualAssetPath"
                    )
                    backup_path = config_data["PrerequisitePart"].get("BackupPath")

                    if asset_path:
                        ASSETS_DIR = Path(asset_path)
                    if manual_asset_path:
                        MANUAL_ASSETS_DIR = Path(manual_asset_path)
                    if backup_path:
                        BACKUP_DIR = Path(backup_path)
        except Exception as e:
            pass  # Use defaults if config can't be read

    ASSETS_DIR.mkdir(exist_ok=True)
    MANUAL_ASSETS_DIR.mkdir(exist_ok=True)
    BACKUP_DIR.mkdir(exist_ok=True)

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

# Creating all directories in a single loop with better error handling
for subdir in SUBDIRS_TO_CREATE:
    try:
        subdir_path = BASE_DIR / subdir
        subdir_path.mkdir(parents=True, exist_ok=True)
        # Test write permissions
        test_file = subdir_path / ".write_test"
        test_file.touch()
        test_file.unlink()
    except PermissionError as e:
        pass  # Silent - no console output
    except Exception as e:
        pass  # Silent - no console output

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
        pass  # Silent - no console output
    except Exception as e:
        pass  # Silent - no console output

# Determine log level from config file or environment variable or default to INFO
LOG_LEVEL_MAP = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}

WEBUI_SETTINGS_PATH = UI_LOGS_DIR / "webui_settings.json"

# Global queue listener for thread-safe logging
queue_listener = None


def load_webui_settings():
    """Load WebUI settings from JSON file"""
    default_settings = {
        "log_level": "INFO",
        "theme": "dark",
        "auto_refresh_interval": 180,
    }

    try:
        if WEBUI_SETTINGS_PATH.exists():
            with open(WEBUI_SETTINGS_PATH, "r", encoding="utf-8") as f:
                settings = json.load(f)
                return {**default_settings, **settings}
    except Exception as e:
        pass  # Silent - no console output

    return default_settings


def save_webui_settings(settings: dict):
    """Save WebUI settings to JSON file"""
    try:
        with open(WEBUI_SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        pass  # Silent - no console output
        return False


def load_log_level_config():
    """Load log level from webui_settings.json or environment variable"""
    try:
        if WEBUI_SETTINGS_PATH.exists():
            with open(WEBUI_SETTINGS_PATH, "r", encoding="utf-8") as f:
                config = json.load(f)
                level = config.get("log_level", "").upper()
                if level:
                    # Silent - no console output
                    return level
    except Exception as e:
        pass  # Silent - no console output

    # Fallback to environment variable or default
    env_level = os.getenv("WEBUI_LOG_LEVEL", "INFO").upper()
    # Silent - no console output
    return env_level


def save_log_level_config(level: str):
    """DEPRECATED: Use save_webui_settings instead. Kept for backward compatibility."""
    try:
        settings = load_webui_settings()
        settings["log_level"] = level.upper()
        return save_webui_settings(settings)
    except Exception as e:
        pass  # Silent - no console output
        return False


def initialize_webui_settings():
    """Initialize webui_settings.json with default values if it doesn't exist"""
    if not WEBUI_SETTINGS_PATH.exists():
        default_settings = {
            "log_level": "INFO",
            "theme": "dark",
            "auto_refresh_interval": 180,
        }
        try:
            WEBUI_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(WEBUI_SETTINGS_PATH, "w", encoding="utf-8") as f:
                json.dump(default_settings, f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass  # Silent - no console output


# Initialize webui_settings.json if it doesn't exist
initialize_webui_settings()

# Get log level from config file, environment variable, or default to INFO
LOG_LEVEL_ENV = load_log_level_config()
LOG_LEVEL = LOG_LEVEL_MAP.get(LOG_LEVEL_ENV, logging.INFO)

# Silent - no console output

# Setup logging with configurable log level - FILE ONLY, NO CONSOLE OUTPUT
# Remove any existing handlers first
logging.root.handlers.clear()

# Create file handler for BackendServer.log
file_handler = logging.FileHandler(
    UI_LOGS_DIR / "BackendServer.log", mode="w", encoding="utf-8"
)
file_handler.setLevel(LOG_LEVEL)
file_handler.setFormatter(
    logging.Formatter(
        "[%(asctime)s] [%(levelname)-8s] [%(name)s:%(funcName)s:%(lineno)d] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
)

# Configure root logger - ONLY file handler, no console
logging.root.setLevel(LOG_LEVEL)
logging.root.addHandler(file_handler)

# Set httpx to WARNING to reduce noise, but keep our app at DEBUG
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# DISABLE uvicorn console output completely
uvicorn_access_logger = logging.getLogger("uvicorn.access")
uvicorn_access_logger.handlers.clear()
uvicorn_access_logger.propagate = False  # Don't propagate to root logger

uvicorn_error_logger = logging.getLogger("uvicorn.error")
uvicorn_error_logger.handlers.clear()
uvicorn_error_logger.propagate = False  # Don't propagate to root logger

uvicorn_logger = logging.getLogger("uvicorn")
uvicorn_logger.handlers.clear()
uvicorn_logger.propagate = False  # Don't propagate to root logger

logger = logging.getLogger(__name__)
logger.info("=" * 80)
logger.info("POSTERIZARR WEB UI BACKEND INITIALIZING")
logger.info("=" * 80)
logger.info(f"Log Level: {LOG_LEVEL_ENV} ({LOG_LEVEL})")
logger.debug(f"Python version: {sys.version}")
logger.debug(f"Working directory: {os.getcwd()}")
logger.debug(f"Base directory: {BASE_DIR}")
logger.debug(f"Docker mode: {IS_DOCKER}")

# Create Overlayfiles directory if it doesn't exist
OVERLAYFILES_DIR.mkdir(exist_ok=True)

# Create uploads directory if it doesn't exist
UPLOADS_DIR.mkdir(exist_ok=True)

if not CONFIG_PATH.exists() and CONFIG_EXAMPLE_PATH.exists():
    logger.warning(f"Config file not found at {CONFIG_PATH}")
    logger.warning(f"Using fallback config.example.json: {CONFIG_EXAMPLE_PATH}")
    CONFIG_PATH = CONFIG_EXAMPLE_PATH
else:
    logger.debug(f"Config path set to: {CONFIG_PATH}")
    logger.debug(f"Config exists: {CONFIG_PATH.exists()}")


def setup_backend_ui_logger():
    """Setup backend logger to also write to FrontendUI.log"""
    global queue_listener
    logger.info("Initializing backend UI logger")
    try:
        # Create UILogs directory if not exists
        UI_LOGS_DIR.mkdir(exist_ok=True)
        logger.debug(f"UILogs directory: {UI_LOGS_DIR}")
        logger.debug(f"UILogs directory exists: {UI_LOGS_DIR.exists()}")

        # CLEANUP: Delete old log files on startup
        backend_log_path = UI_LOGS_DIR / "FrontendUI.log"
        if backend_log_path.exists():
            logger.debug(f"Removing existing FrontendUI.log: {backend_log_path}")
            backend_log_path.unlink()
            logger.info(f"Cleared old FrontendUI.log")
        else:
            logger.debug("No existing FrontendUI.log to clear")

        # Create File Handler for FrontendUI.log with thread-safe queue
        logger.debug(f"Creating file handler for: {backend_log_path}")
        backend_ui_file_handler = logging.FileHandler(
            backend_log_path, encoding="utf-8", mode="w"
        )
        backend_ui_file_handler.setLevel(LOG_LEVEL)  # Use configurable log level
        backend_ui_file_handler.setFormatter(
            logging.Formatter(
                "[%(asctime)s] [%(levelname)-8s] [BACKEND:%(name)s:%(funcName)s:%(lineno)d] - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.debug("File handler formatter configured")

        # Use QueueHandler for thread-safe logging
        from queue import Queue
        from logging.handlers import QueueHandler, QueueListener

        log_queue = Queue(-1)  # Unlimited queue size
        queue_handler = QueueHandler(log_queue)

        # Start queue listener in background thread
        queue_listener = QueueListener(
            log_queue, backend_ui_file_handler, respect_handler_level=True
        )
        queue_listener.start()
        logger.debug("Queue listener started for thread-safe logging")

        # Add queue handler to root logger (so all backend logs are captured)
        logging.getLogger().addHandler(queue_handler)
        logger.info(f"Backend logger initialized successfully: {backend_log_path}")
        logger.info(
            f"Backend logging to FrontendUI.log enabled with {LOG_LEVEL_ENV} level"
        )
        logger.debug(
            "All backend logs will be captured in both BackendServer.log and FrontendUI.log"
        )

    except PermissionError as e:
        logger.error(f"Permission denied initializing backend UI logger: {e}")
    except OSError as e:
        logger.error(f"OS error initializing backend UI logger: {e}")
    except Exception as e:
        logger.error(f"Unexpected error initializing backend UI logger: {e}")
        logger.debug(f"Exception type: {type(e).__name__}", exc_info=True)


# Initialize Backend UI Logger on startup
logger.info("Setting up backend UI logger...")
setup_backend_ui_logger()

logger.info("Loading modules...")
try:
    logger.debug("Attempting to import config_mapper module")
    from config_mapper import (
        flatten_config,
        unflatten_config,
        UI_GROUPS,
        DISPLAY_NAMES,
        get_display_name,
        get_tooltip,
    )

    # Import tooltips
    logger.debug("Importing config_tooltips")
    from config_tooltips import CONFIG_TOOLTIPS

    CONFIG_MAPPER_AVAILABLE = True
    logger.info("Config mapper loaded successfully")
    logger.debug(f"UI_GROUPS available: {len(UI_GROUPS) if UI_GROUPS else 0}")
    logger.debug(
        f"CONFIG_TOOLTIPS available: {len(CONFIG_TOOLTIPS) if CONFIG_TOOLTIPS else 0}"
    )
except ImportError as e:
    CONFIG_MAPPER_AVAILABLE = False
    CONFIG_TOOLTIPS = {}  # Fallback if config_tooltips not available
    logger.warning(f"Config mapper not available: {e}. Using grouped config structure.")
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

# Import scheduler module
try:
    logger.debug("Attempting to import scheduler module")
    from scheduler import PosterizarrScheduler

    SCHEDULER_AVAILABLE = True
    logger.info("Scheduler module loaded successfully")
except ImportError as e:
    SCHEDULER_AVAILABLE = False
    logger.warning(
        f"Scheduler not available: {e}. Scheduler features will be disabled."
    )
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

# Import auth middleware for Basic Authentication
try:
    logger.debug("Attempting to import auth_middleware module")
    from auth_middleware import BasicAuthMiddleware, load_auth_config

    AUTH_MIDDLEWARE_AVAILABLE = True
    logger.info("Auth middleware loaded successfully")
except ImportError as e:
    AUTH_MIDDLEWARE_AVAILABLE = False
    logger.warning(f"Auth middleware not available: {e}. Basic Auth will be disabled.")
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

# Import database module
try:
    logger.debug("Attempting to import database module")
    from database import init_database, ImageChoicesDB

    DATABASE_AVAILABLE = True
    logger.info("Database module loaded successfully")
except ImportError as e:
    DATABASE_AVAILABLE = False
    logger.warning(
        f"Database module not available: {e}. Database features will be disabled."
    )
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

# Import config database module
try:
    logger.debug("Attempting to import config_database module")
    from config_database import ConfigDB

    CONFIG_DATABASE_AVAILABLE = True
    logger.info("Config database module loaded successfully")
except ImportError as e:
    CONFIG_DATABASE_AVAILABLE = False
    logger.warning(
        f"Config database not available: {e}. Config database will be disabled."
    )
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

# Import runtime database module
try:
    logger.debug("Attempting to import runtime_database and runtime_parser modules")
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
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

# Import logs watcher module
try:
    logger.debug("Attempting to import logs_watcher module")
    from logs_watcher import create_logs_watcher

    LOGS_WATCHER_AVAILABLE = True
    logger.info("Logs watcher module loaded successfully")
except ImportError as e:
    LOGS_WATCHER_AVAILABLE = False
    logger.warning(
        f"Logs watcher not available: {e}. Automatic file monitoring will be disabled."
    )
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

# Import media export database module
try:
    logger.debug("Attempting to import media_export_database module")
    from media_export_database import MediaExportDatabase

    MEDIA_EXPORT_DB_AVAILABLE = True
    logger.info("Media export database module loaded successfully")
except ImportError as e:
    MEDIA_EXPORT_DB_AVAILABLE = False
    logger.warning(
        f"Media export database not available: {e}. Media CSV tracking will be disabled."
    )
    logger.debug(f"ImportError details: {type(e).__name__}: {str(e)}", exc_info=True)

logger.info("Module loading completed")
logger.debug(f"Config Mapper: {CONFIG_MAPPER_AVAILABLE}")
logger.debug(f"Scheduler: {SCHEDULER_AVAILABLE}")
logger.debug(f"Auth Middleware: {AUTH_MIDDLEWARE_AVAILABLE}")
logger.debug(f"Database: {DATABASE_AVAILABLE}")
logger.debug(f"Config Database: {CONFIG_DATABASE_AVAILABLE}")
logger.debug(f"Runtime Database: {RUNTIME_DB_AVAILABLE}")
logger.debug(f"Logs Watcher: {LOGS_WATCHER_AVAILABLE}")
logger.debug(f"Media Export Database: {MEDIA_EXPORT_DB_AVAILABLE}")

current_process: Optional[subprocess.Popen] = None
current_mode: Optional[str] = None
current_start_time: Optional[str] = None
scheduler: Optional["PosterizarrScheduler"] = None
db: Optional["ImageChoicesDB"] = None
config_db: Optional["ConfigDB"] = None
media_export_db: Optional["MediaExportDatabase"] = None

# Initialize cache variables early to prevent race conditions
cache_refresh_task = None
cache_refresh_running = False
cache_scan_in_progress = False


def check_directory_permissions(
    directory: Path, directory_name: str = "directory"
) -> dict:
    """
    Check if a directory is accessible and writable.
    Returns diagnostic information for troubleshooting upload issues.

    Args:
        directory: Path to check
        directory_name: Human-readable name for logging

    Returns:
        dict with keys: exists, readable, writable, error
    """
    result = {
        "path": str(directory),
        "name": directory_name,
        "exists": False,
        "readable": False,
        "writable": False,
        "error": None,
        "platform": sys.platform,
        "is_docker": IS_DOCKER,
    }

    try:
        result["exists"] = directory.exists()

        if result["exists"]:
            # Test read permissions
            try:
                list(directory.iterdir())
                result["readable"] = True
            except PermissionError:
                result["error"] = f"No read permission for {directory_name}"
            except Exception as e:
                result["error"] = f"Cannot read {directory_name}: {str(e)}"

            # Test write permissions
            try:
                test_file = directory / ".write_test_diagnostic"
                test_file.touch()
                test_file.unlink()
                result["writable"] = True
            except PermissionError:
                result["error"] = f"No write permission for {directory_name}"
            except Exception as e:
                result["error"] = f"Cannot write to {directory_name}: {str(e)}"
        else:
            result["error"] = f"{directory_name} does not exist"

    except Exception as e:
        result["error"] = f"Error checking {directory_name}: {str(e)}"

    return result


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
        logger.info(" Importing ImageChoices.csv to database...")
        stats = db.import_from_csv(csv_path)

        if stats["added"] > 0:
            logger.info(
                f"CSV import successful: {stats['added']} new record(s) added, "
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
        logger.error(f"Error importing CSV to database: {e}")


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
        # URL encode the path to handle special characters like #
        encoded_url_path = quote(url_path, safe="/")

        # Get file stats
        file_stat = image_path.stat()

        # Extract library folder (first part of relative path) and determine media type
        library_folder = None
        media_type = None
        try:
            library_folder = relative_path.parts[0]
            media_type = determine_media_type(image_path.name, library_folder)
        except (ValueError, IndexError):
            # If relative_path does not have any parts, or library_folder cannot be determined,
            # we ignore the error and leave library_folder and media_type as None.
            pass

        return {
            "path": str(relative_path),
            "name": image_path.name,
            "size": file_stat.st_size,
            "url": f"/poster_assets/{encoded_url_path}",
            "created": file_stat.st_ctime,  # Creation time (Unix timestamp)
            "modified": file_stat.st_mtime,  # Modification time (Unix timestamp)
            "type": media_type,  # Media type (Movie, Show, Season, Episode, Background)
        }
    except Exception as e:
        logger.error(f"Error processing image path {image_path}: {e}")
        return None


def determine_media_type(filename: str, library_folder: str = None) -> str:
    """
    Determine media type from filename and library folder

    Args:
        filename: The asset filename (e.g., "poster.jpg", "Season01.jpg", "S01E01.jpg")
        library_folder: The library folder name from assets (e.g., "TestMovies", "TestSerien")

    Returns: Movie, Show, Season, Episode, or Background
    """
    name = filename.lower()

    # Check for episodes/title cards first (these are always Episodes regardless of library)
    if re.match(r"^S\d+E\d+\.jpg$", filename) or re.match(
        r".*_S\d+E\d+\.jpg$", filename
    ):
        logger.debug(
            f"[MediaType] {filename} in {library_folder} -> Episode (pattern match)"
        )
        return "Episode"

    # Check for season posters (these are always Seasons regardless of library)
    if re.match(r"^Season\d+\.jpg$", filename, re.IGNORECASE):
        logger.debug(
            f"[MediaType] {filename} in {library_folder} -> Season (pattern match)"
        )
        return "Season"

    # Get library type from database for backgrounds and posters
    library_type = None
    if library_folder:
        library_type = get_library_type_from_db(library_folder)
        logger.debug(
            f"[MediaType] Library '{library_folder}' type from DB: {library_type}"
        )

    # Check for backgrounds
    if name == "background.jpg":
        if library_type == "show":
            logger.debug(
                f"[MediaType] {filename} in {library_folder} -> Show Background (library_type=show)"
            )
            return "Show Background"
        elif library_type == "movie":
            logger.debug(
                f"[MediaType] {filename} in {library_folder} -> Movie Background (library_type=movie)"
            )
            return "Movie Background"
        # Default to generic Background if library type unknown
        logger.debug(
            f"[MediaType] {filename} in {library_folder} -> Background (library_type unknown)"
        )
        return "Background"

    # For poster.jpg files, check library type from database
    if name == "poster.jpg":
        if library_type == "show":
            logger.debug(
                f"[MediaType] {filename} in {library_folder} -> Show (library_type=show)"
            )
            return "Show"
        elif library_type == "movie":
            logger.debug(
                f"[MediaType] {filename} in {library_folder} -> Movie (library_type=movie)"
            )
            return "Movie"

    # Default to Movie for poster.jpg files
    logger.debug(f"[MediaType] {filename} in {library_folder} -> Movie (default)")
    return "Movie"


def get_library_type_from_db(library_folder: str) -> Optional[str]:
    """
    Get library type (movie/show) from database by library folder name
    Uses a cache to avoid repeated database lookups

    Args:
        library_folder: The library folder name (e.g., "TestMovies", "TestSerien")

    Returns:
        "movie" or "show", or None if not found
    """
    # Use a simple module-level cache
    if not hasattr(get_library_type_from_db, "cache"):
        get_library_type_from_db.cache = {}

    # Check cache first
    if library_folder in get_library_type_from_db.cache:
        cached_type = get_library_type_from_db.cache[library_folder]
        logger.debug(f"[LibraryType] Cache hit for '{library_folder}': {cached_type}")
        return cached_type

    logger.debug(
        f"[LibraryType] Cache miss for '{library_folder}', querying database..."
    )

    # Try to use existing media_export_db instance if available
    db_instance = None
    if MEDIA_EXPORT_DB_AVAILABLE and media_export_db is not None:
        db_instance = media_export_db
    elif MEDIA_EXPORT_DB_AVAILABLE:
        # If module is available but instance not yet created, create a temporary one
        try:
            from media_export_database import MediaExportDatabase

            db_instance = MediaExportDatabase()
        except Exception as e:
            logger.debug(
                f"[LibraryType] Could not create MediaExportDatabase instance: {e}"
            )

    if db_instance:
        try:
            library_type = db_instance.lookup_library_type_by_name(library_folder)
            if library_type:
                # Cache the result
                get_library_type_from_db.cache[library_folder] = library_type
                logger.info(
                    f"[LibraryType] Database lookup for '{library_folder}': {library_type} (cached)"
                )
                return library_type
            else:
                logger.warning(
                    f"[LibraryType] No library type found in database for '{library_folder}'"
                )
        except Exception as e:
            logger.error(
                f"[LibraryType] Error looking up library type for '{library_folder}': {e}"
            )

    return None


def scan_and_cache_assets():
    """Scans the assets directory and populates/refreshes the cache."""
    global cache_scan_in_progress

    # Prevent overlapping scans (thread-safe)
    if cache_scan_in_progress:
        logger.warning("Asset scan already in progress, skipping this request")
        return

    cache_scan_in_progress = True
    scan_start_time = time.time()
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
        # Scan once for all image types and filter @eaDir in one pass
        image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

        logger.info(f"Scanning assets directory: {ASSETS_DIR}")
        all_images = [
            p
            for p in ASSETS_DIR.rglob("*")
            if p.suffix.lower() in image_extensions and "@eaDir" not in p.parts
        ]
        logger.info(f"Found {len(all_images)} image files to process")

        temp_folders = {}
        processed_count = 0
        last_log_time = time.time()

        for image_path in all_images:
            processed_count += 1

            # Log progress every 5000 files or every 10 seconds
            current_time = time.time()
            if processed_count % 5000 == 0 or (current_time - last_log_time) >= 10:
                logger.info(
                    f"Processing assets: {processed_count}/{len(all_images)} ({(processed_count/len(all_images)*100):.1f}%)"
                )
                last_log_time = current_time

            image_data = process_image_path(image_path)
            if not image_data:
                continue

            # Get folder name from original Path object (already computed in image_path)
            try:
                folder_name = image_path.relative_to(ASSETS_DIR).parts[0]
            except (ValueError, IndexError):
                folder_name = "root"

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

        logger.info("Sorting asset lists...")
        # Sort the image lists once by path
        for key in ["posters", "backgrounds", "seasons", "titlecards"]:
            asset_cache[key].sort(key=lambda x: x["path"])

        logger.info("Finalizing folder metadata...")
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
        scan_duration = time.time() - scan_start_time
        logger.info(
            f"Asset cache refresh finished in {scan_duration:.1f}s. "
            f"Found {len(asset_cache['posters'])} posters, "
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
                logger.info("Background cache refresh triggered")
                scan_and_cache_assets()
                logger.info("Background cache refresh completed")
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
    logger.info("Background cache refresh thread started")


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
    # Fully rely on background refresh - no blocking scans!
    # Return cache even if empty (first startup) - background thread will populate it
    if asset_cache["last_scanned"] == 0:
        logger.debug("Cache not yet populated - background scan in progress")
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
                    f"Extracted filename from download_source: {image_filename} (from: {download_source})"
                )

        # Search recursively for the folder
        for item in ASSETS_DIR.rglob("*"):
            # Skip @eaDir folders from Synology NAS
            if item.is_dir() and item.name == "@eaDir":
                continue

            if item.is_dir() and item.name == rootfolder:
                # Found the matching folder
                image_file = None

                # First priority: use filename from download_source if available
                if image_filename:
                    image_file = item / image_filename
                    logger.info(f"Checking for file from download_source: {image_file}")
                    if not image_file.exists():
                        logger.warning(
                            f"File from download_source not found: {image_file}"
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
                                    f"No season number in title, using first found: {image_file.name}"
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
                    # URL encode the path to handle special characters like #
                    encoded_url_path = quote(url_path, safe="/")
                    # Add cache busting parameter using file modification time
                    mtime = int(image_file.stat().st_mtime)
                    logger.info(f"Found image: {url_path} (mtime: {mtime})")
                    return f"/poster_assets/{encoded_url_path}?t={mtime}"

        logger.warning(
            f"No image found for rootfolder: {rootfolder}, type: {asset_type}"
        )
        return None

    except Exception as e:
        logger.error(f"Error searching for {asset_type} in assets: {e}")
        return None


def find_poster_with_metadata(
    rootfolder: str,
    asset_type: str = "Poster",
    title: str = "",
    download_source: str = "",
) -> dict:
    """
    Same as find_poster_in_assets but returns metadata including file timestamps

    Returns:
        dict with 'url', 'created', 'modified' keys, or None if not found
    """
    if not ASSETS_DIR.exists():
        return None

    try:
        # If download_source is a local path, try to extract the filename from it
        image_filename = None
        if download_source and download_source != "N/A":
            if (
                "\\" in download_source or "/" in download_source
            ) and "." in download_source:
                import os

                image_filename = os.path.basename(download_source)

        # Search recursively for the folder
        for item in ASSETS_DIR.rglob("*"):
            if item.is_dir() and item.name == "@eaDir":
                continue

            if item.is_dir() and item.name == rootfolder:
                image_file = None

                # First priority: use filename from download_source if available
                if image_filename:
                    image_file = item / image_filename
                    if not image_file.exists():
                        image_file = None

                # Second priority: determine by asset type
                if not image_file:
                    if asset_type == "Season":
                        import re

                        match = re.search(r"Season\s*(\d+)", title, re.IGNORECASE)
                        if match:
                            season_num = match.group(1).zfill(2)
                            image_file = item / f"Season{season_num}.jpg"
                            if not image_file.exists():
                                image_file = item / f"Season{match.group(1)}.jpg"
                        else:
                            import glob

                            season_files = list(item.glob("Season*.jpg"))
                            if season_files:
                                image_file = season_files[0]

                    elif asset_type in ["TitleCard", "Title_Card", "Episode"]:
                        import re

                        match = re.search(r"(S\d+E\d+)", title, re.IGNORECASE)
                        if match:
                            episode_code = match.group(1).upper()
                            image_file = item / f"{episode_code}.jpg"

                    elif asset_type in [
                        "Background",
                        "Movie Background",
                        "Show Background",
                        "TV Background",
                        "Series Background",
                        "Episode Background",
                    ]:
                        image_file = item / "background.jpg"

                    else:
                        image_file = item / "poster.jpg"

                # Check if the image file exists
                if image_file and image_file.exists() and image_file.is_file():
                    file_stat = image_file.stat()
                    relative_path = image_file.relative_to(ASSETS_DIR)
                    url_path = str(relative_path).replace("\\", "/")
                    encoded_url_path = quote(url_path, safe="/")
                    mtime = int(file_stat.st_mtime)

                    return {
                        "url": f"/poster_assets/{encoded_url_path}?t={mtime}",
                        "created": file_stat.st_ctime,
                        "modified": file_stat.st_mtime,
                    }

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
    global scheduler, db, config_db, media_export_db, logs_watcher

    # Startup: Initialize cache asynchronously
    logger.info("Starting Posterizarr Web UI Backend")
    logger.info("Asset cache will be populated in background (non-blocking startup)")

    # Start background cache refresh (handles initial scan asynchronously)
    start_cache_refresh_background()

    # Initialize config database if available
    if CONFIG_DATABASE_AVAILABLE:
        try:
            logger.info("Initializing config database...")
            CONFIG_DB_PATH = DATABASE_DIR / "config.db"

            config_db = ConfigDB(CONFIG_DB_PATH, CONFIG_PATH)
            config_db.initialize()

            logger.info(f"Config database ready: {CONFIG_DB_PATH}")
        except Exception as e:
            logger.error(f"Failed to initialize config database: {e}")
            config_db = None
    else:
        logger.info("Config database module not available, skipping initialization")

    # Initialize media export database if available
    if MEDIA_EXPORT_DB_AVAILABLE:
        try:
            logger.info("Initializing media export database...")
            media_export_db = MediaExportDatabase()
            logger.info("Media export database ready")
        except Exception as e:
            logger.error(f"Failed to initialize media export database: {e}")
            media_export_db = None
    else:
        logger.info(
            "Media export database module not available, skipping initialization"
        )

    # Initialize database if available
    if DATABASE_AVAILABLE:
        try:
            logger.info("Initializing imagechoices database...")

            # Check if database exists before initialization
            db_existed_before = IMAGECHOICES_DB_PATH.exists()

            # Initialize database (creates if not exists)
            db = init_database(IMAGECHOICES_DB_PATH)

            # If database was just created (first start), check for existing CSV to import
            if not db_existed_before:
                csv_path = LOGS_DIR / "ImageChoices.csv"
                if csv_path.exists():
                    logger.info(
                        "Found existing ImageChoices.csv - importing to new database..."
                    )
                    try:
                        stats = db.import_from_csv(csv_path)
                        if stats["added"] > 0:
                            logger.info(
                                f"Initialized database with {stats['added']} records from existing CSV"
                            )
                        else:
                            logger.info(
                                "No records imported from CSV (all empty or invalid)"
                            )
                    except Exception as csv_error:
                        logger.warning(f"Could not import existing CSV: {csv_error}")
                else:
                    logger.info("No existing CSV found - database initialized empty")

            # Check if database has any records
            try:
                record_count = len(db.get_all_choices())
                logger.info(
                    f"Database ready: {IMAGECHOICES_DB_PATH} ({record_count} records)"
                )
            except Exception:
                logger.info(f"Database ready: {IMAGECHOICES_DB_PATH}")

        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            db = None
    else:
        logger.info("Database module not available, skipping database initialization")

    # Initialize and start logs watcher if available
    logs_watcher = None
    if LOGS_WATCHER_AVAILABLE and DATABASE_AVAILABLE and RUNTIME_DB_AVAILABLE:
        try:
            logger.info(
                "Initializing logs watcher for background process monitoring..."
            )
            logs_watcher = create_logs_watcher(
                logs_dir=LOGS_DIR,
                db_instance=db,
                runtime_db_instance=runtime_db,
                media_export_db_instance=(
                    media_export_db if MEDIA_EXPORT_DB_AVAILABLE else None
                ),
            )
            logs_watcher.start()
            logger.info(
                "✓ Logs watcher started - monitoring for background process files"
            )
        except Exception as e:
            logger.error(f"Failed to initialize logs watcher: {e}")
            logs_watcher = None
    else:
        if not LOGS_WATCHER_AVAILABLE:
            logger.info("Logs watcher module not available, skipping")
        elif not DATABASE_AVAILABLE:
            logger.info("Database not available, skipping logs watcher")
        elif not RUNTIME_DB_AVAILABLE:
            logger.info("Runtime database not available, skipping logs watcher")

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

    # Stop logs watcher
    if logs_watcher:
        try:
            logger.info("Stopping logs watcher...")
            logs_watcher.stop()
            logger.info("Logs watcher stopped")
        except Exception as e:
            logger.error(f"Error stopping logs watcher: {e}")

    # Stop queue listener for thread-safe logging
    global queue_listener
    if queue_listener:
        try:
            logger.info("Stopping queue listener for FrontendUI.log")
            queue_listener.stop()
            logger.info("Queue listener stopped")
        except Exception as e:
            logger.error(f"Error stopping queue listener: {e}")

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

    if config_db:
        try:
            config_db.close()
            logger.info("Config database connection closed")
        except Exception as e:
            logger.error(f"Error closing config database: {e}")

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
logger.info("SPA Middleware enabled - React Router support active")


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
    level: str  # "INFO", "WARNING", "ERROR", "DEBUG"
    message: str
    timestamp: str
    component: str = (
        "UI"  # Component/module name (e.g., "Gallery", "ImagePreviewModal")
    )


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
    logger.info("=" * 60)
    logger.info("CONFIG READ REQUEST")
    logger.debug(f"Config path: {CONFIG_PATH}")
    logger.debug(f"Config mapper available: {CONFIG_MAPPER_AVAILABLE}")

    try:
        if not CONFIG_PATH.exists():
            logger.error(f"Config file not found at: {CONFIG_PATH}")
            logger.debug(f"Base directory: {BASE_DIR}")
            error_msg = f"Config file not found at: {CONFIG_PATH}\n"
            error_msg += f"Base directory: {BASE_DIR}\n"
            error_msg += "Please create config.json from config.example.json"
            raise HTTPException(status_code=404, detail=error_msg)

        logger.debug("Reading config file...")
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        logger.debug(f"Config loaded: {len(grouped_config)} top-level keys")
        logger.debug(f"Top-level keys: {list(grouped_config.keys())}")

        # If config_mapper is available, transform to flat structure
        if CONFIG_MAPPER_AVAILABLE:
            logger.debug("Flattening config structure...")
            logger.debug("Flattening config structure...")
            flat_config = flatten_config(grouped_config)
            logger.debug(f"Flat config: {len(flat_config)} keys")

            # Build display names for all keys in the config
            logger.debug("Building display names dictionary...")
            display_names_dict = {}
            for key in flat_config.keys():
                display_names_dict[key] = get_display_name(key)

            logger.info(f"Config read successful: {len(flat_config)} settings")
            logger.info("=" * 60)

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
            logger.info(
                f"Config read successful (grouped): {len(grouped_config)} sections"
            )
            logger.info("=" * 60)
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
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config")
async def update_config(data: ConfigUpdate):
    """Update config.json - accepts FLAT structure and saves as GROUPED when config_mapper available"""
    logger.info("=" * 60)
    logger.info("CONFIG UPDATE REQUEST")
    logger.debug(f"Number of config keys to update: {len(data.config)}")
    logger.debug(f"Config mapper available: {CONFIG_MAPPER_AVAILABLE}")

    try:
        # Load current config to detect changes
        logger.debug("Loading current config to detect changes...")
        current_config = {}
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                current_config = json.load(f)

        # Flatten current config if needed for comparison
        if CONFIG_MAPPER_AVAILABLE and current_config:
            current_flat = flatten_config(current_config)
        else:
            current_flat = current_config

        # Detect and log changes
        changes_detected = []
        for key, new_value in data.config.items():
            old_value = current_flat.get(key)
            if old_value != new_value:
                # Mask sensitive values in logs
                if any(
                    sensitive in key.lower()
                    for sensitive in ["password", "token", "key", "api"]
                ):
                    old_display = "***" if old_value else None
                    new_display = "***" if new_value else None
                else:
                    old_display = old_value
                    new_display = new_value

                changes_detected.append(
                    {"key": key, "old": old_display, "new": new_display}
                )
                logger.info(f"CONFIG CHANGE: {key}")
                logger.info(f"  Old value: {old_display}")
                logger.info(f"  New value: {new_display}")

        if changes_detected:
            logger.info(f"Total changes detected: {len(changes_detected)}")
            logger.debug(f"Changed keys: {[c['key'] for c in changes_detected]}")
        else:
            logger.info("No changes detected in config")

        logger.info("Saving config changes to config.json...")

        # If config_mapper is available, transform flat config back to grouped structure
        if CONFIG_MAPPER_AVAILABLE:
            logger.debug("Transforming flat config back to grouped structure...")
            grouped_config = unflatten_config(data.config)
            logger.debug(f"Grouped config: {len(grouped_config)} sections")

            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(grouped_config, f, indent=2, ensure_ascii=False)

            file_size = CONFIG_PATH.stat().st_size
            logger.info(f"Config saved successfully to config.json (flat -> grouped)")
            logger.debug(f"File size: {file_size} bytes")
        else:
            # Fallback: save as-is (assuming grouped structure)
            logger.debug("Saving config as grouped structure (no mapper)...")
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(data.config, f, indent=2, ensure_ascii=False)

            file_size = CONFIG_PATH.stat().st_size
            logger.info("Config saved successfully to config.json (grouped structure)")
            logger.debug(f"File size: {file_size} bytes")

        # Also update config database if available
        if CONFIG_DATABASE_AVAILABLE and config_db:
            try:
                logger.info("Syncing config changes to database...")
                # Sync the updated config to database
                config_db.import_from_json()
                logger.info("Config database synced successfully with config.json")

                # Log changes to database as well
                if changes_detected:
                    logger.debug(
                        f"Database now contains {len(changes_detected)} updated values"
                    )
            except Exception as db_error:
                logger.warning(f"Could not sync config database: {db_error}")
                logger.debug(f"Database sync error details: {str(db_error)}")
        else:
            logger.info("Config database not available, skipping database sync")

        logger.info("=" * 60)
        return {
            "success": True,
            "message": "Config updated successfully",
            "changes_count": len(changes_detected),
        }
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CONFIG DATABASE ENDPOINTS
# ============================================================================


@app.get("/api/config-db/status")
async def get_config_db_status():
    """Get config database status and statistics"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            return {
                "success": False,
                "available": False,
                "message": "Config database not available",
            }

        # Get all sections and count
        sections = config_db.get_all_sections()

        # Get metadata
        cursor = config_db.connection.cursor()
        cursor.execute(
            "SELECT * FROM config_metadata ORDER BY last_sync_time DESC LIMIT 1"
        )
        metadata_row = cursor.fetchone()

        metadata = None
        if metadata_row:
            metadata = {
                "last_sync_time": metadata_row[1],
                "config_file_path": metadata_row[2],
                "sync_status": metadata_row[3],
                "sync_message": metadata_row[4],
            }

        # Count total entries
        cursor.execute("SELECT COUNT(*) FROM config")
        total_entries = cursor.fetchone()[0]

        return {
            "success": True,
            "available": True,
            "database_path": str(config_db.db_path),
            "sections": sections,
            "section_count": len(sections),
            "total_entries": total_entries,
            "metadata": metadata,
        }
    except Exception as e:
        logger.error(f"Error getting config database status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config-db/section/{section}")
async def get_config_db_section(section: str):
    """Get all values from a specific config section"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        section_data = config_db.get_section(section)

        return {"success": True, "section": section, "data": section_data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting config section: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config-db/value/{section}/{key}")
async def get_config_db_value(section: str, key: str):
    """Get a specific config value"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        value = config_db.get_value(section, key)

        if value is None:
            raise HTTPException(
                status_code=404, detail=f"Config value not found: {section}.{key}"
            )

        return {"success": True, "section": section, "key": key, "value": value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting config value: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/config-db/sync")
async def sync_config_db():
    """Manually trigger sync from config.json to config database"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        success = config_db.import_from_json()

        if success:
            return {
                "success": True,
                "message": "Config database synced successfully with config.json",
            }
        else:
            return {
                "success": False,
                "message": "Config database sync completed with warnings",
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing config database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/config-db/export")
async def export_config_db():
    """Export config database to JSON format"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        config_data = config_db.export_to_json()

        return {"success": True, "config": config_data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting config database: {e}")
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
    logger.info("=" * 60)
    logger.info("OVERLAY FILE UPLOAD STARTED")
    logger.info(f"Filename: {file.filename}")
    logger.info(f"Content-Type: {file.content_type}")
    logger.debug(f"Target directory: {OVERLAYFILES_DIR}")

    try:
        # Ensure directory exists with permission check
        logger.debug("Checking directory existence and permissions...")
        try:
            OVERLAYFILES_DIR.mkdir(parents=True, exist_ok=True)
            logger.debug(f"Directory exists: {OVERLAYFILES_DIR.exists()}")
            # Test write permissions
            test_file = OVERLAYFILES_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
            logger.debug("Write permission check: OK")
        except PermissionError:
            logger.error(
                f"No write permission for Overlayfiles directory: {OVERLAYFILES_DIR}"
            )
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for Overlayfiles directory. Check Docker/NAS/Unraid volume permissions.",
            )
        except Exception as e:
            logger.error(f"Error accessing Overlayfiles directory: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Cannot access Overlayfiles directory: {str(e)}",
            )

        # Validate file type - images and fonts
        logger.debug("Validating file type...")
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
        logger.debug(f"File extension: {file_ext}")

        if file_ext not in allowed_extensions:
            logger.warning(f"Invalid file type rejected: {file_ext}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Only PNG, JPG, JPEG, TTF, OTF, WOFF, and WOFF2 files are allowed.",
            )

        # Sanitize filename (remove dangerous characters)
        logger.debug("Sanitizing filename...")
        safe_filename = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()
        logger.debug(f"Sanitized filename: {safe_filename}")

        if not safe_filename:
            logger.error("Filename sanitization resulted in empty filename")
            raise HTTPException(status_code=400, detail="Invalid filename")

        # Save file
        file_path = OVERLAYFILES_DIR / safe_filename
        logger.debug(f"Target file path: {file_path}")

        # Check if file already exists
        if file_path.exists():
            logger.warning(f"File already exists: {safe_filename}")
            raise HTTPException(
                status_code=400,
                detail=f"File '{safe_filename}' already exists. Please rename or delete the existing file first.",
            )

        # Write file with better error handling
        logger.info("Writing file to disk...")
        try:
            content = await file.read()
            content_size = len(content)
            logger.info(f"File size: {content_size} bytes ({content_size/1024:.2f} KB)")

            if content_size == 0:
                logger.error("Uploaded file is empty")
                raise HTTPException(status_code=400, detail="Uploaded file is empty")

            with open(file_path, "wb") as f:
                f.write(content)

            # Verify file was written
            logger.debug("Verifying file was written correctly...")
            if not file_path.exists() or file_path.stat().st_size == 0:
                logger.error(
                    f"File verification failed - exists: {file_path.exists()}, size: {file_path.stat().st_size if file_path.exists() else 0}"
                )
                raise HTTPException(
                    status_code=500, detail="File was not saved successfully"
                )

            actual_size = file_path.stat().st_size
            logger.debug(
                f"File written successfully - size on disk: {actual_size} bytes"
            )

        except PermissionError as e:
            logger.error(f"Permission denied writing overlay file: {e}")
            logger.exception("Full traceback:")
            raise HTTPException(
                status_code=500,
                detail=f"Permission denied: Unable to write file. Check folder permissions on your system (Docker/NAS/Unraid).",
            )
        except OSError as e:
            logger.error(f"OS error writing overlay file: {e}")
            logger.exception("Full traceback:")
            raise HTTPException(
                status_code=500,
                detail=f"File system error: {str(e)}. Check disk space and permissions.",
            )

        logger.info(f"Uploaded overlay file: {safe_filename} ({content_size} bytes)")
        logger.info("=" * 60)

        return {
            "success": True,
            "message": f"File '{safe_filename}' uploaded successfully",
            "filename": safe_filename,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading overlay file: {e}")
        import traceback

        logger.error(traceback.format_exc())
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
        # Ensure directory exists with permission check
        try:
            OVERLAYFILES_DIR.mkdir(parents=True, exist_ok=True)
            # Test write permissions
            test_file = OVERLAYFILES_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError:
            logger.error(
                f"No write permission for Overlayfiles directory: {OVERLAYFILES_DIR}"
            )
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for Overlayfiles directory. Check Docker/NAS/Unraid volume permissions.",
            )
        except Exception as e:
            logger.error(f"Error accessing Overlayfiles directory: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Cannot access Overlayfiles directory: {str(e)}",
            )

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

        # Write file with better error handling
        try:
            content = await file.read()
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")

            with open(file_path, "wb") as f:
                f.write(content)

            # Verify file was written
            if not file_path.exists() or file_path.stat().st_size == 0:
                raise HTTPException(
                    status_code=500, detail="File was not saved successfully"
                )

        except PermissionError as e:
            logger.error(f"Permission denied writing font file: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Permission denied: Unable to write file. Check folder permissions on your system (Docker/NAS/Unraid).",
            )
        except OSError as e:
            logger.error(f"OS error writing font file: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"File system error: {str(e)}. Check disk space and permissions.",
            )

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
        import traceback

        logger.error(traceback.format_exc())
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
                    f"Font loaded successfully: {font.getname() if hasattr(font, 'getname') else 'Unknown'}"
                )
            except OSError as e:
                logger.error(f"OSError loading font: {e}")
                raise HTTPException(
                    status_code=500, detail=f"Cannot load font file: {e}"
                )
            except Exception as e:
                logger.error(f"Error loading font: {e}")
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
    logger.info("PLEX VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")
    logger.info(
        f"[KEY] Token: {request.token[:10]}...{request.token[-4:] if len(request.token) > 14 else ''}"
    )
    logger.debug(f"Full request object: {request.model_dump()}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/library/sections/?X-Plex-Token={request.token}"
            logger.info(f"[REQUEST] Sending request to Plex API...")
            logger.debug(
                f"Full request URL: {url[:50]}...{url[-20:] if len(url) > 70 else url}"
            )

            response = await client.get(url)
            logger.info(f"Response received - Status: {response.status_code}")
            logger.debug(f"Response headers: {dict(response.headers)}")
            logger.debug(f"Response size: {len(response.content)} bytes")

            if response.status_code == 200:
                # Parse XML to check for libraries
                root = ET.fromstring(response.content)
                lib_count = int(root.get("size", 0))
                server_name = root.get("friendlyName", "Unknown")

                logger.debug(f"Parsed XML root attributes: {root.attrib}")
                logger.info(f"Plex validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Libraries: {lib_count}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f"Plex connection successful! Found {lib_count} libraries.",
                    "details": {"library_count": lib_count, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"[FAILED]Plex validation failed: Invalid token (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Invalid Plex token. Please check your token.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(f"Plex validation failed: Status {response.status_code}")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Plex connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"[TIMEOUT]  Plex validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": "Connection timeout. Check if Plex URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"[ERROR] Plex validation error: {str(e)}")
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
    logger.info("JELLYFIN VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )
    logger.debug(f"Full request object: {request.model_dump()}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/System/Info?api_key={request.api_key}"
            logger.info(f"[REQUEST] Sending request to Jellyfin API...")
            logger.debug(f"Full request URL (without key): {request.url}/System/Info")

            response = await client.get(url)
            logger.info(f"Response received - Status: {response.status_code}")
            logger.debug(f"Response headers: {dict(response.headers)}")
            logger.debug(f"Response size: {len(response.content)} bytes")

            if response.status_code == 200:
                data = response.json()
                logger.debug(f"Response JSON keys: {list(data.keys())}")
                version = data.get("Version", "Unknown")
                server_name = data.get("ServerName", "Unknown")

                logger.info(f"Jellyfin validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Version: {version}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f" Jellyfin connection successful! Version: {version}",
                    "details": {"version": version, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"Jellyfin validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid Jellyfin API key. Please check your API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"Jellyfin validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Jellyfin connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"[TIMEOUT]  Jellyfin validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": " Connection timeout. Check if Jellyfin URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"[ERROR] Jellyfin validation error: {str(e)}")
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
    logger.info("EMBY VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )
    logger.debug(f"Full request object: {request.model_dump()}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/System/Info?api_key={request.api_key}"
            logger.info(f"[REQUEST] Sending request to Emby API...")
            logger.debug(f"Full request URL (without key): {request.url}/System/Info")

            response = await client.get(url)
            logger.info(f"Response received - Status: {response.status_code}")
            logger.debug(f"Response headers: {dict(response.headers)}")
            logger.debug(f"Response size: {len(response.content)} bytes")

            if response.status_code == 200:
                data = response.json()
                logger.debug(f"Response JSON keys: {list(data.keys())}")
                version = data.get("Version", "Unknown")
                server_name = data.get("ServerName", "Unknown")

                logger.info(f"Emby validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Version: {version}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f" Emby connection successful! Version: {version}",
                    "details": {"version": version, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"Emby validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid Emby API key. Please check your API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(f"Emby validation failed: Status {response.status_code}")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Emby connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"[TIMEOUT]  Emby validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": " Connection timeout. Check if Emby URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"[ERROR] Emby validation error: {str(e)}")
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
    logger.info("TMDB VALIDATION STARTED")
    logger.info(
        f"[KEY] Token: {request.token[:15]}...{request.token[-8:] if len(request.token) > 23 else ''}"
    )
    logger.debug(f"Full request object: {request.model_dump()}")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "Authorization": f"Bearer {request.token}",
                "Content-Type": "application/json",
            }
            logger.info(f"[REQUEST] Sending request to TMDB API...")
            logger.debug(
                f"Request headers (without token): Content-Type=application/json"
            )

            response = await client.get(
                "https://api.themoviedb.org/3/configuration", headers=headers
            )
            logger.info(f"Response received - Status: {response.status_code}")
            logger.debug(f"Response size: {len(response.content)} bytes")

            if response.status_code == 200:
                logger.info(f"TMDB validation successful!")
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": " TMDB API token is valid!",
                    "details": {"status_code": 200},
                }
            elif response.status_code == 401:
                logger.warning(f"TMDB validation failed: Invalid token (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid TMDB token. Please check your Read Access Token.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(f"TMDB validation failed: Status {response.status_code}")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" TMDB validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"[ERROR] TMDB validation error: {str(e)}")
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
    logger.info("TVDB VALIDATION STARTED")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )
    if request.pin:
        logger.info(f" PIN provided: {request.pin}")
    logger.debug(f"Full request object: {request.model_dump()}")

    max_retries = 6
    retry_count = 0
    success = False
    logger.debug(f"TVDB validation configured with max_retries={max_retries}")

    while not success and retry_count < max_retries:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                login_url = "https://api4.thetvdb.com/v4/login"
                logger.debug(f"TVDB API endpoint: {login_url}")

                # Request body with or without PIN
                if request.pin:
                    body = {"apikey": request.api_key, "pin": request.pin}
                    logger.info(
                        f"[REQUEST] Attempting TVDB login with API Key + PIN (Attempt {retry_count + 1}/{max_retries})..."
                    )
                    logger.debug(
                        f"Request body includes: apikey (hidden), pin={request.pin}"
                    )
                else:
                    body = {"apikey": request.api_key}
                    logger.info(
                        f"[REQUEST] Attempting TVDB login with API Key only (Attempt {retry_count + 1}/{max_retries})..."
                    )
                    logger.debug(f"Request body includes: apikey (hidden) only")

                headers = {
                    "accept": "application/json",
                    "Content-Type": "application/json",
                }

                # POST-Request zum Login
                login_response = await client.post(
                    login_url, json=body, headers=headers
                )

                logger.info(
                    f"Login response received - Status: {login_response.status_code}"
                )

                if login_response.status_code == 200:
                    data = login_response.json()
                    token = data.get("data", {}).get("token")

                    if token:
                        success = True
                        pin_msg = f" (with PIN: {request.pin})" if request.pin else ""
                        logger.info(
                            f"[TOKEN]  Successfully received TVDB token: {token[:15]}...{token[-8:]}"
                        )
                        logger.info(f"TVDB validation successful!{pin_msg}")
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
                        logger.warning(f" No token in response data")
                        retry_count += 1
                        if retry_count < max_retries:
                            logger.info(f"[WAIT] Waiting 10 seconds before retry...")
                            await asyncio.sleep(10)

                elif login_response.status_code == 401:
                    logger.warning(f"TVDB login failed: Invalid API key (401)")
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
                        f"TVDB login failed: Status {login_response.status_code}"
                    )
                    retry_count += 1
                    if retry_count < max_retries:
                        logger.info(f"[WAIT] Waiting 10 seconds before retry...")
                        await asyncio.sleep(10)

        except httpx.TimeoutException:
            logger.warning(
                f"[TIMEOUT]  TVDB login timeout (Attempt {retry_count + 1}/{max_retries})"
            )
            retry_count += 1
            if retry_count < max_retries:
                logger.info(f"[WAIT] Waiting 10 seconds before retry...")
                await asyncio.sleep(10)

        except Exception as e:
            logger.error(f"[ERROR] TVDB validation error: {str(e)}")
            logger.exception("Full traceback:")
            retry_count += 1
            if retry_count < max_retries:
                logger.info(f"[WAIT] Waiting 10 seconds before retry...")
                await asyncio.sleep(10)

    # If all retries failed
    if not success:
        logger.error(f"TVDB validation failed after {max_retries} attempts")
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
    logger.info("FANART.TV VALIDATION STARTED")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            test_url = (
                f"https://webservice.fanart.tv/v3/movies/603?api_key={request.api_key}"
            )
            logger.info(
                f"[REQUEST] Sending test request to Fanart.tv API (Movie ID: 603 - The Matrix)..."
            )

            response = await client.get(test_url)
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                logger.info(f"Fanart.tv validation successful!")
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": " Fanart.tv API key is valid!",
                    "details": {"status_code": 200},
                }
            elif response.status_code == 401:
                logger.warning(f"Fanart.tv validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Invalid Fanart.tv API key. Please check your Personal API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"Fanart.tv validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Fanart.tv validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"[ERROR] Fanart.tv validation error: {str(e)}")
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
    logger.info("DISCORD WEBHOOK VALIDATION STARTED")
    logger.info(f"[URL] Webhook URL: {request.webhook_url[:50]}...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "content": "[SUCCESS] Posterizarr WebUI - Discord webhook validation successful!",
                "username": "Posterizarr",
            }
            logger.info(f"[REQUEST] Sending test message to Discord webhook...")

            response = await client.post(request.webhook_url, json=payload)
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 204:
                logger.info(
                    f"Discord webhook validation successful! Test message sent."
                )
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": " Discord webhook is valid! Test message sent.",
                    "details": {"status_code": 204},
                }
            elif response.status_code == 404:
                logger.warning(
                    f"Discord webhook validation failed: Webhook not found (404)"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": " Discord webhook not found. Please check your webhook URL.",
                    "details": {"status_code": 404},
                }
            else:
                logger.warning(
                    f"Discord webhook validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Discord webhook validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"[ERROR] Discord webhook validation error: {str(e)}")
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
    logger.info("APPRISE URL VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")

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
                f"Apprise URL format valid! Detected service: {detected_service}"
            )
            logger.info("=" * 60)
            return {
                "valid": True,
                "message": " Apprise URL format looks valid!",
                "details": {"format_check": True, "service": detected_service},
            }
        else:
            logger.warning(f"Apprise URL format invalid!")
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
        logger.error(f"[ERROR] Apprise URL validation error: {str(e)}")
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
    logger.info("UPTIME KUMA VALIDATION STARTED")
    logger.info(f"[URL] Push URL: {request.url[:50]}...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            logger.info(f"[REQUEST] Sending test push to Uptime Kuma...")

            response = await client.get(
                request.url,
                params={
                    "status": "up",
                    "msg": "Posterizarr WebUI validation test",
                    "ping": "",
                },
            )
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                logger.info(f"   Response data: {data}")

                if data.get("ok"):
                    logger.info(f"Uptime Kuma validation successful! Test ping sent.")
                    logger.info("=" * 60)
                    return {
                        "valid": True,
                        "message": " Uptime Kuma push URL is valid!",
                        "details": {"status_code": 200},
                    }
                else:
                    logger.warning(f"Uptime Kuma responded but 'ok' was false")
                    logger.info("=" * 60)
                    return {
                        "valid": False,
                        "message": " Uptime Kuma responded but validation failed.",
                        "details": {"response": data},
                    }
            else:
                logger.warning(
                    f"Uptime Kuma validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f" Uptime Kuma validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"[ERROR] Uptime Kuma validation error: {str(e)}")
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
    logger.info("Fetching Plex libraries...")

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

                    # Include all library types (movie, show, music, photo, etc.)
                    libraries.append(
                        {"name": lib_title, "type": lib_type, "key": lib_key}
                    )

                logger.info(f"Found {len(libraries)} Plex libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(f"Failed to fetch Plex libraries: {response.status_code}")
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"[ERROR] Error fetching Plex libraries: {str(e)}")
        return {"success": False, "error": str(e)}


@app.post("/api/libraries/jellyfin")
async def get_jellyfin_libraries(request: JellyfinValidationRequest):
    """Fetch Jellyfin libraries"""
    logger.info("Fetching Jellyfin libraries...")

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

                logger.info(f"Found {len(libraries)} Jellyfin libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(
                    f"Failed to fetch Jellyfin libraries: {response.status_code}"
                )
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"[ERROR] Error fetching Jellyfin libraries: {str(e)}")
        return {"success": False, "error": str(e)}


@app.post("/api/libraries/emby")
async def get_emby_libraries(request: EmbyValidationRequest):
    """Fetch Emby libraries"""
    logger.info("Fetching Emby libraries...")

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

                logger.info(f"Found {len(libraries)} Emby libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(f"Failed to fetch Emby libraries: {response.status_code}")
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"[ERROR] Error fetching Emby libraries: {str(e)}")
        return {"success": False, "error": str(e)}


# Request model for fetching library items
class LibraryItemsRequest(BaseModel):
    url: str
    token: str
    library_key: str


@app.post("/api/libraries/plex/items")
async def get_plex_library_items(request: LibraryItemsRequest):
    """Fetch items from a specific Plex library"""
    logger.info(f"Fetching items from Plex library key: {request.library_key}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"{request.url}/library/sections/{request.library_key}/all?X-Plex-Token={request.token}"
            response = await client.get(url)

            if response.status_code == 200:
                root = ET.fromstring(response.content)
                items = []

                # Parse both Video (movies) and Directory (shows) elements
                for item in root.findall(".//*[@title]"):
                    title = item.get("title", "")
                    year = item.get("year", "")
                    item_type = item.get("type", "")
                    rating_key = item.get("ratingKey", "")

                    # Get the folder path if available
                    folder_name = title
                    if year:
                        folder_name = f"{title} ({year})"

                    # Try to get TMDB ID from GUID
                    tmdb_id = ""
                    for guid in item.findall(".//Guid"):
                        guid_id = guid.get("id", "")
                        if "tmdb://" in guid_id:
                            tmdb_id = guid_id.replace("tmdb://", "")
                            folder_name = f"{title} ({year}) {{tmdb-{tmdb_id}}}"
                            break

                    items.append(
                        {
                            "title": title,
                            "year": year,
                            "folderName": folder_name,
                            "type": item_type,
                            "ratingKey": rating_key,
                        }
                    )

                logger.info(f"Found {len(items)} items in library")
                return {"success": True, "items": items}
            else:
                logger.error(f"Failed to fetch library items: {response.status_code}")
                return {
                    "success": False,
                    "error": f"Failed to fetch items (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"[ERROR] Error fetching Plex library items: {str(e)}")
        logger.exception("Full traceback:")
        return {"success": False, "error": str(e)}


@app.get("/api/assets/folders")
async def get_assets_folders(library_name: Optional[str] = None):
    """Get folders from assets directory

    If library_name is provided, returns folders from that library.
    Otherwise returns all library folders (top-level directories).
    """
    try:
        if not ASSETS_DIR.exists():
            logger.warning(f"Assets directory does not exist: {ASSETS_DIR}")
            return {"success": True, "folders": [], "path": str(ASSETS_DIR)}

        logger.info(f"Scanning assets directory: {ASSETS_DIR}")

        if library_name:
            # Get items from specific library folder
            library_path = ASSETS_DIR / library_name
            if not library_path.exists() or not library_path.is_dir():
                logger.warning(f"Library folder not found: {library_path}")
                return {
                    "success": False,
                    "error": f"Library folder '{library_name}' not found",
                }

            folders = []
            try:
                # List all subdirectories in the library folder
                for item_path in sorted(library_path.iterdir()):
                    if item_path.is_dir():
                        folder_name = item_path.name

                        # Try to extract title and year from folder name
                        # Format: "Title (Year) {tmdb-123}" or "Title (Year)" or just "Title"
                        title = folder_name
                        year = ""

                        # Try to extract year from (YYYY) pattern
                        year_match = re.search(r"\((\d{4})\)", folder_name)
                        if year_match:
                            year = year_match.group(1)
                            # Extract title (everything before the year)
                            title = folder_name[: year_match.start()].strip()

                        folders.append(
                            {
                                "folderName": folder_name,
                                "title": title,
                                "year": year,
                                "path": str(item_path.relative_to(ASSETS_DIR)),
                            }
                        )

                logger.info(f"Found {len(folders)} folders in library '{library_name}'")
                return {
                    "success": True,
                    "folders": folders,
                    "library": library_name,
                    "path": str(library_path.relative_to(ASSETS_DIR)),
                }
            except Exception as e:
                logger.error(f"Error scanning library folder: {e}")
                return {"success": False, "error": str(e)}
        else:
            # Get top-level library folders
            libraries = []
            try:
                for library_path in sorted(ASSETS_DIR.iterdir()):
                    if library_path.is_dir():
                        # Count items in library
                        item_count = sum(
                            1 for item in library_path.iterdir() if item.is_dir()
                        )

                        libraries.append(
                            {
                                "name": library_path.name,
                                "path": str(library_path.relative_to(ASSETS_DIR)),
                                "itemCount": item_count,
                            }
                        )

                logger.info(f"Found {len(libraries)} library folders")
                return {
                    "success": True,
                    "libraries": libraries,
                    "path": str(ASSETS_DIR),
                }
            except Exception as e:
                logger.error(f"Error scanning assets directory: {e}")
                return {"success": False, "error": str(e)}

    except Exception as e:
        logger.error(f"[ERROR] Error getting assets folders: {str(e)}")
        logger.exception("Full traceback:")
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
    Format matches backend logs for consistent viewing
    """
    try:
        ui_log_path = UI_LOGS_DIR / "FrontendUI.log"

        # Use server timestamp to avoid client/server time differences
        from datetime import datetime

        server_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        level = log_entry.level.upper()
        component = log_entry.component
        message = log_entry.message

        # Format: [TIMESTAMP] [LEVEL] [UI:Component] - MESSAGE
        # This matches backend format but with UI: prefix
        log_line = f"[{server_timestamp}] [{level:8}] [UI:{component}] - {message}\n"

        # Write to FrontendUI.log
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
    Uses server timestamps to ensure chronological consistency
    """
    try:
        ui_log_path = UI_LOGS_DIR / "FrontendUI.log"

        from datetime import datetime

        log_lines = []
        for log_entry in batch.logs:
            # Use server timestamp for all logs
            server_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            level = log_entry.level.upper()
            component = log_entry.component
            message = log_entry.message

            log_line = (
                f"[{server_timestamp}] [{level:8}] [UI:{component}] - {message}\n"
            )
            log_lines.append(log_line)

        # Batch write for better performance
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

    # Add Docker detection
    system_info["is_docker"] = IS_DOCKER

    return system_info


# ============================================================================
# LOG LEVEL MANAGEMENT ENDPOINTS
# ============================================================================


# DEPRECATED: Old /api/log-level endpoints removed
# Use /api/webui-settings instead for centralized settings management


# ============================================================================
# WEBUI SETTINGS ENDPOINTS (separate from config.json)
# ============================================================================


@app.get("/api/webui-settings")
async def get_webui_settings():
    """Get WebUI settings (log level, theme, etc.)"""
    logger.info("=" * 60)
    logger.info("WEBUI SETTINGS REQUEST")

    try:
        settings = load_webui_settings()

        # Add current log level from runtime
        current_level = logging.getLogger().level
        current_level_name = logging.getLevelName(current_level)
        settings["current_log_level"] = current_level_name

        logger.info(f"WebUI settings loaded: {len(settings)} keys")
        logger.debug(f"Settings: {settings}")
        logger.info("=" * 60)

        return {
            "success": True,
            "settings": settings,
            "available_log_levels": ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
            "config_file": str(WEBUI_SETTINGS_PATH),
        }

    except Exception as e:
        logger.error(f"Error getting WebUI settings: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/webui-settings")
async def update_webui_settings(data: dict):
    """
    Update WebUI settings (persistent)

    Request body:
    {
        "log_level": "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL",
        "theme": "dark" | "light",
        "auto_refresh_interval": 180
    }
    """
    logger.info("=" * 60)
    logger.info("WEBUI SETTINGS UPDATE REQUEST")
    logger.debug(f"Request data: {data}")

    try:
        # Load current settings
        current_settings = load_webui_settings()
        logger.debug(f"Current settings: {current_settings}")

        # Update settings
        updates = data.get("settings", {})
        current_settings.update(updates)

        # Save settings
        logger.info(f"Saving updated settings: {list(updates.keys())}")
        save_success = save_webui_settings(current_settings)

        if not save_success:
            raise HTTPException(status_code=500, detail="Failed to save settings")

        # If log_level was updated, apply it immediately
        if "log_level" in updates:
            new_level_name = updates["log_level"].upper()

            if new_level_name in LOG_LEVEL_MAP:
                new_level = LOG_LEVEL_MAP[new_level_name]
                old_level_name = logging.getLevelName(logging.getLogger().level)

                logger.info(
                    f"Applying log level change: {old_level_name} -> {new_level_name}"
                )

                # Update root logger
                logging.getLogger().setLevel(new_level)

                # Update all handlers
                for handler in logging.getLogger().handlers:
                    handler.setLevel(new_level)

                # Update global variables
                global LOG_LEVEL, LOG_LEVEL_ENV
                LOG_LEVEL = new_level
                LOG_LEVEL_ENV = new_level_name

                # Also save to old log_config.json for backward compatibility
                save_log_level_config(new_level_name)

                logger.info(f"Log level changed: {old_level_name} -> {new_level_name}")

        logger.info(f"WebUI settings saved successfully")
        logger.info("=" * 60)

        return {
            "success": True,
            "message": "Settings updated successfully",
            "settings": current_settings,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating WebUI settings: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/upload-diagnostics")
async def get_upload_diagnostics():
    """
    Get diagnostic information about upload directories and permissions.
    Useful for troubleshooting upload issues on Docker/NAS/Unraid/Windows/Linux.
    """
    import platform

    diagnostics = {
        "platform": platform.system(),
        "is_docker": IS_DOCKER,
        "python_version": sys.version,
        "directories": {},
        "environment": {
            "DOCKER_ENV": os.environ.get("DOCKER_ENV", "not set"),
            "POSTERIZARR_NON_ROOT": os.environ.get("POSTERIZARR_NON_ROOT", "not set"),
        },
    }

    # Check all upload-related directories
    directories_to_check = {
        "BASE_DIR": BASE_DIR,
        "UPLOADS_DIR": UPLOADS_DIR,
        "OVERLAYFILES_DIR": OVERLAYFILES_DIR,
        "ASSETS_DIR": ASSETS_DIR,
        "LOGS_DIR": LOGS_DIR,
        "TEMP_DIR": TEMP_DIR,
    }

    for name, directory in directories_to_check.items():
        diagnostics["directories"][name] = check_directory_permissions(directory, name)

    # Add user/group information on Unix systems
    if platform.system() in ["Linux", "Darwin"]:
        try:
            import pwd
            import grp

            diagnostics["user"] = {
                "uid": os.getuid(),
                "gid": os.getgid(),
                "username": pwd.getpwuid(os.getuid()).pw_name,
                "groupname": grp.getgrgid(os.getgid()).gr_name,
            }
        except Exception as e:
            diagnostics["user"] = {"error": str(e)}

    # Check if running with elevated privileges on Windows
    if platform.system() == "Windows":
        try:
            import ctypes

            diagnostics["is_admin"] = ctypes.windll.shell32.IsUserAnAdmin() != 0
        except Exception as e:
            diagnostics["is_admin"] = f"Unable to determine: {str(e)}"

    return diagnostics


@app.get("/api/status")
async def get_status():
    """Get script status with last log lines from appropriate log file"""
    global current_process, current_mode, current_start_time

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
            # Store mode before clearing for runtime tracking
            finished_mode = current_mode

            current_process = None
            current_mode = None
            current_start_time = None
            manual_is_running = False

            # Auto-trigger cache refresh after script finishes
            logger.info("Triggering cache refresh after script completion...")
            try:
                scan_and_cache_assets()
                logger.info("Cache refreshed successfully after script completion")
            except Exception as e:
                logger.error(f"Error refreshing cache after script completion: {e}")

            # Import ImageChoices.csv to database
            try:
                import_imagechoices_to_db()
            except Exception as e:
                logger.error(f"Error importing ImageChoices.csv to database: {e}")

            # Save runtime statistics to database
            if RUNTIME_DB_AVAILABLE and finished_mode:
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
                    log_filename = mode_log_map.get(finished_mode, "Scriptlog.log")
                    log_path = LOGS_DIR / log_filename

                    # Runtime import is now handled by logs_watcher automatically
                    # Commenting out to prevent duplicate entries
                    # if log_path.exists():
                    #     save_runtime_to_db(log_path, finished_mode)
                    #     logger.info(
                    #         f"Runtime statistics saved to database for {finished_mode} mode"
                    #     )
                    # else:
                    #     logger.warning(f"Log file not found: {log_path}")

                    if log_path.exists():
                        logger.info(
                            f"Runtime statistics will be imported by logs_watcher for {finished_mode} mode"
                        )
                except Exception as e:
                    logger.error(f"Error saving runtime to database: {e}")

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
                # Scheduler process has finished - clean up!
                logger.info(
                    f"Scheduler process finished with exit code {poll_result}, cleaning up..."
                )
                scheduler.current_process = None
                scheduler.is_running = False
                scheduler_is_running = False

                # Auto-trigger cache refresh after scheduler finishes
                logger.info("Triggering cache refresh after scheduler completion...")
                try:
                    scan_and_cache_assets()
                    logger.info(
                        "Cache refreshed successfully after scheduler completion"
                    )
                except Exception as e:
                    logger.error(
                        f"Error refreshing cache after scheduler completion: {e}"
                    )

                # Import ImageChoices.csv to database
                try:
                    import_imagechoices_to_db()
                except Exception as e:
                    logger.error(f"Error importing ImageChoices.csv to database: {e}")

                # Save runtime statistics to database for scheduler runs
                if RUNTIME_DB_AVAILABLE:
                    try:
                        log_path = LOGS_DIR / "Scriptlog.log"
                        # Runtime import is now handled by logs_watcher automatically
                        # Commenting out to prevent duplicate entries
                        # if log_path.exists():
                        #     save_runtime_to_db(log_path, "scheduled")
                        #     logger.info(
                        #         "Runtime statistics saved to database for scheduled run"
                        #     )

                        if log_path.exists():
                            logger.info(
                                "Runtime statistics will be imported by logs_watcher for scheduled run"
                            )
                    except Exception as e:
                        logger.error(f"Error saving scheduler runtime to database: {e}")

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
        "start_time": current_start_time if is_running else None,
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
            logger.debug(f"Could not get migration info: {e}")

        return {
            "success": True,
            "is_migrated": is_migrated,
            "migration_info": migration_info,
        }

    except Exception as e:
        logger.error(f"Error getting migration status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/runtime-history/migrate-format")
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


@app.post("/api/runtime-history/import-json")
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


# =========================================================================
# Plex Export Database Endpoints
# =========================================================================


@app.get("/api/plex-export/statistics")
async def get_plex_export_statistics():
    """
    Get Plex export database statistics
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "Plex export database not available",
            }

        stats = media_export_db.get_statistics()

        return {
            "success": True,
            "statistics": stats,
        }

    except Exception as e:
        logger.error(f"Error getting Plex export statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/plex-export/runs")
async def get_plex_export_runs():
    """
    Get list of all Plex export run timestamps
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "Plex export database not available",
            }

        runs = media_export_db.get_all_runs()

        return {
            "success": True,
            "runs": runs,
            "count": len(runs),
        }

    except Exception as e:
        logger.error(f"Error getting Plex export runs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/plex-export/library")
async def get_plex_library_data(
    run_timestamp: Optional[str] = None, limit: Optional[int] = None
):
    """
    Get Plex library export data

    Args:
        run_timestamp: Optional specific run to query (default: latest)
        limit: Optional limit on number of results
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "Plex export database not available",
            }

        data = media_export_db.get_library_data(run_timestamp, limit)

        return {
            "success": True,
            "data": data,
            "count": len(data),
            "run_timestamp": run_timestamp or "latest",
        }

    except Exception as e:
        logger.error(f"Error getting Plex library data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/plex-export/episodes")
async def get_plex_episode_data(
    run_timestamp: Optional[str] = None, limit: Optional[int] = None
):
    """
    Get Plex episode export data

    Args:
        run_timestamp: Optional specific run to query (default: latest)
        limit: Optional limit on number of results
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "Plex export database not available",
            }

        data = media_export_db.get_episode_data(run_timestamp, limit)

        return {
            "success": True,
            "data": data,
            "count": len(data),
            "run_timestamp": run_timestamp or "latest",
        }

    except Exception as e:
        logger.error(f"Error getting Plex episode data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/plex-export/import")
async def import_plex_csvs():
    """
    Import the latest Plex CSV files from Logs directory
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "Plex export database not available",
            }

        results = media_export_db.import_latest_csvs()

        return {
            "success": True,
            "results": results,
            "message": f"Imported {results['library_count']} library + {results['episode_count']} episode records",
        }

    except Exception as e:
        logger.error(f"Error importing Plex CSVs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# OtherMedia (Jellyfin/Emby) Export Endpoints
# =========================================================================


@app.get("/api/other-media-export/statistics")
async def get_other_media_statistics():
    """Get OtherMedia (Jellyfin/Emby) export database statistics"""
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "OtherMedia export database not available",
            }

        stats = media_export_db.get_other_statistics()

        return {"success": True, "statistics": stats}

    except Exception as e:
        logger.error(f"Error getting OtherMedia statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/other-media-export/runs")
async def get_other_media_runs():
    """Get list of all OtherMedia export run timestamps"""
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "OtherMedia export database not available",
            }

        runs = media_export_db.get_other_all_runs()

        return {"success": True, "runs": runs, "count": len(runs)}

    except Exception as e:
        logger.error(f"Error getting OtherMedia runs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/other-media-export/library")
async def get_other_media_library_data(
    run_timestamp: Optional[str] = None, limit: Optional[int] = None
):
    """
    Get OtherMedia library export data

    Args:
        run_timestamp: Optional specific run to query (default: latest)
        limit: Optional limit on number of results
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "OtherMedia export database not available",
            }

        data = media_export_db.get_other_library_data(run_timestamp)

        if limit:
            data = data[:limit]

        return {
            "success": True,
            "data": data,
            "count": len(data),
            "run_timestamp": run_timestamp or "latest",
        }

    except Exception as e:
        logger.error(f"Error getting OtherMedia library data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/other-media-export/episodes")
async def get_other_media_episode_data(
    run_timestamp: Optional[str] = None, limit: Optional[int] = None
):
    """
    Get OtherMedia episode export data

    Args:
        run_timestamp: Optional specific run to query (default: latest)
        limit: Optional limit on number of results
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "OtherMedia export database not available",
            }

        data = media_export_db.get_other_episode_data(run_timestamp, limit)

        return {
            "success": True,
            "data": data,
            "count": len(data),
            "run_timestamp": run_timestamp or "latest",
        }

    except Exception as e:
        logger.error(f"Error getting OtherMedia episode data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/other-media-export/import")
async def import_other_media_csvs():
    """
    Import the latest OtherMedia (Jellyfin/Emby) CSV files from Logs directory
    """
    try:
        if not MEDIA_EXPORT_DB_AVAILABLE or not media_export_db:
            return {
                "success": False,
                "message": "OtherMedia export database not available",
            }

        results = media_export_db.import_other_latest_csvs()

        return {
            "success": True,
            "results": results,
            "message": f"Imported {results['library_count']} library + {results['episode_count']} episode records",
        }

    except Exception as e:
        logger.error(f"Error importing OtherMedia CSVs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

        # =========================================================================
        # Admin Endpoints
        # =========================================================================

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
            preferred_tc_language_order = flat_config.get(
                "PreferredTCLanguageOrder", ""
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
            preferred_tc_language_order = grouped_config.get(
                "PreferredTCLanguageOrder", ""
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
            if not preferred_tc_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_tc_language_order = grouped_config["ApiPart"].get(
                    "PreferredTCLanguageOrder", ""
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
        tc_language_order_list = parse_language_order(preferred_tc_language_order)

        # If TC language order is empty or "PleaseFillMe", fall back to standard poster language order
        if not tc_language_order_list or (
            len(tc_language_order_list) == 1
            and tc_language_order_list[0].lower() == "pleasefillme"
        ):
            logger.info(
                "TC language order not configured, using standard poster language order"
            )
            tc_language_order_list = language_order_list

        logger.info(
            f"Language preferences - Standard: {language_order_list}, Season: {season_language_order_list}, Background: {background_language_order_list}, TitleCard: {tc_language_order_list}"
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
        tmdb_ids = []  # Changed to list to support multiple IDs

        # Log the incoming request for debugging
        logger.info(f"TMDB Search Request:")
        logger.info(f"   Query: '{request.query}'")
        logger.info(f"   Media Type: {request.media_type}")
        logger.info(f"   Poster Type: {request.poster_type}")
        logger.info(f"   Year: {request.year}")
        logger.info(f"   Is Digit: {request.query.isdigit()}")

        # Step 1: Get TMDB ID(s)
        # For numeric queries, we'll search both by ID AND by title to cover movies like "1917"
        if request.query.isdigit():
            # Try to use query as TMDB ID
            potential_id = request.query
            logger.info(f" Query is numeric - will search by ID: {potential_id}")
            tmdb_ids.append(("id", potential_id))

            # Also search by title for numeric queries (e.g., "1917", "2012")
            logger.info(
                f" Also searching by title for numeric query: '{request.query}'"
            )

        # Always do a title search (unless we only got an ID without title search)
        if not request.query.isdigit() or request.query.isdigit():
            # Query is a title - search for it
            search_url = f"https://api.themoviedb.org/3/search/{request.media_type}"
            search_params = {"query": request.query, "page": 1}

            logger.info(
                f"Searching TMDB by title for: '{request.query}' (media_type: {request.media_type})"
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
                logger.info(f"Found {len(search_results)} title search results")
                # Add all found IDs from title search (to get posters from multiple matches)
                for result in search_results[:5]:  # Limit to top 5 results
                    result_id = result.get("id")
                    result_title = result.get(
                        "title" if request.media_type == "movie" else "name"
                    )
                    if result_id and ("title", result_id) not in [
                        (t, i) for t, i in tmdb_ids
                    ]:
                        tmdb_ids.append(("title", result_id))
                        logger.info(
                            f"   Added result: ID={result_id}, Title='{result_title}'"
                        )
            else:
                logger.error(f"TMDB title search error: {search_response.status_code}")

        if not tmdb_ids:
            logger.warning(f"No TMDB IDs found for '{request.query}'")
            return {
                "success": True,
                "posters": [],
                "count": 0,
                "message": "No results found",
            }

        # Step 2 & 3: Loop through all found IDs and fetch images
        media_endpoint = "movie" if request.media_type == "movie" else "tv"
        seen_posters = set()  # Track unique poster paths to avoid duplicates

        for source_type, tmdb_id in tmdb_ids:
            logger.info(f" Processing TMDB ID {tmdb_id} (from {source_type} search)")

            # Get item details (for title)
            details_url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}"
            logger.info(f"Fetching details from: {details_url}")
            details_response = requests.get(details_url, headers=headers, timeout=10)
            logger.info(f"   Response Status: {details_response.status_code}")

            if details_response.status_code == 200:
                details = details_response.json()
                base_title = (
                    details.get("title") or details.get("name") or f"TMDB ID: {tmdb_id}"
                )
                logger.info(f"   Title: '{base_title}'")
            else:
                logger.warning(
                    f"   Failed to fetch details for ID {tmdb_id}: {details_response.status_code}"
                )
                if details_response.status_code == 404:
                    logger.error(
                        f"   TMDB ID {tmdb_id} not found for media_type '{request.media_type}'"
                    )
                    continue  # Skip this ID and try the next one
                details = {}
                base_title = f"TMDB ID: {tmdb_id}"

            # Fetch appropriate images based on poster_type
            if request.poster_type == "titlecard":
                # ========== TITLE CARDS (Episode Stills) ==========
                if not request.season_number or not request.episode_number:
                    raise HTTPException(
                        status_code=400,
                        detail="Season and episode numbers required for titlecards",
                    )

                # Get episode stills
                episode_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/episode/{request.episode_number}/images"
                episode_response = requests.get(
                    episode_url, headers=headers, timeout=10
                )

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

                    # Filter and sort by PreferredTCLanguageOrder
                    filtered_stills = filter_and_sort_posters_by_language(
                        stills, tc_language_order_list
                    )

                    logger.info(
                        f"Title cards: {len(stills)} total, {len(filtered_stills)} after filtering by language preferences"
                    )

                    for still in filtered_stills:  # Load all stills
                        poster_path = still.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
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
                        status_code=400,
                        detail="Season number required for season posters",
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
                        poster_path = poster.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
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
                        poster_path = backdrop.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": base_title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
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
                        poster_path = poster.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": base_title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
                                    "language": poster.get("iso_639_1"),
                                    "vote_average": poster.get("vote_average", 0),
                                    "width": poster.get("width", 0),
                                    "height": poster.get("height", 0),
                                    "type": "show_poster",
                                }
                            )

        logger.info(
            f"TMDB search for '{request.query}' ({request.poster_type}) returned {len(results)} images from {len(tmdb_ids)} ID(s)"
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
    global current_process, current_mode, current_start_time

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
        current_start_time = datetime.now().isoformat()

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
    picturePath: str = Form(""),
    titletext: str = Form(""),
    folderName: str = Form(""),
    libraryName: str = Form(""),
    posterType: str = Form("standard"),
    seasonPosterName: str = Form(""),
    epTitleName: str = Form(""),
    episodeNumber: str = Form(""),
):
    """Run manual mode with uploaded file"""
    global current_process, current_mode, current_start_time

    logger.info(f"Manual mode upload request received")
    logger.info(f"  File: {file.filename if file else 'None'}")
    logger.info(f"  File content type: {file.content_type if file else 'None'}")
    logger.info(f"  Poster Type: {posterType}")
    logger.info(f"  Title Text: '{titletext}'")
    logger.info(f"  Folder Name: '{folderName}'")
    logger.info(f"  Library Name: '{libraryName}'")
    logger.info(f"  Season Poster Name: '{seasonPosterName}'")
    logger.info(f"  Episode Title Name: '{epTitleName}'")
    logger.info(f"  Episode Number: '{episodeNumber}'")

    # Check if already running
    if current_process and current_process.poll() is None:
        error_msg = "Script is already running. Please stop the script first."
        logger.error(f"Manual upload rejected: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    if not SCRIPT_PATH.exists():
        error_msg = "Posterizarr.ps1 not found"
        logger.error(f"Manual upload failed: {error_msg}")
        raise HTTPException(status_code=404, detail=error_msg)

    # Validate file upload
    if not file:
        error_msg = "No file uploaded"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    # Validate file type
    allowed_extensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in allowed_extensions:
        error_msg = f"Invalid file type '{file_extension}'. Allowed: {', '.join(allowed_extensions)}"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    # Validate required fields
    if posterType != "titlecard" and not titletext.strip():
        error_msg = "Title text is required"
        logger.error(
            f"Manual upload validation failed: {error_msg} (posterType: {posterType})"
        )
        raise HTTPException(status_code=400, detail=error_msg)

    if posterType != "collection" and not folderName.strip():
        error_msg = "Folder name is required"
        logger.error(
            f"Manual upload validation failed: {error_msg} (posterType: {posterType})"
        )
        raise HTTPException(status_code=400, detail=error_msg)

    if not libraryName.strip():
        error_msg = "Library name is required"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    if posterType == "season" and not seasonPosterName.strip():
        error_msg = "Season poster name is required for season posters"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    if posterType == "titlecard":
        if not epTitleName.strip():
            error_msg = "Episode title name is required for title cards"
            logger.error(f"Manual upload validation failed: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        if not episodeNumber.strip():
            error_msg = "Episode number is required for title cards"
            logger.error(f"Manual upload validation failed: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        if not seasonPosterName.strip():
            error_msg = "Season name is required for title cards"
            logger.error(f"Manual upload validation failed: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)

    try:
        # Create uploads directory if it doesn't exist with permission check
        try:
            UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
            # Verify write permissions
            test_file = UPLOADS_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError as e:
            logger.error(f"No write permission for uploads directory: {UPLOADS_DIR}")
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for uploads directory. This may be a Docker/NAS permission issue. Please check folder permissions.",
            )
        except Exception as e:
            logger.error(f"Error creating uploads directory: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Cannot create uploads directory: {str(e)}",
            )

        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Sanitize filename to prevent path traversal and special characters
        safe_name = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()
        if not safe_name:
            safe_name = "upload.jpg"
        safe_filename = f"{timestamp}_{safe_name}"
        upload_path = UPLOADS_DIR / safe_filename

        # Save uploaded file to uploads directory
        logger.info(f"Saving uploaded file to: {upload_path}")
        logger.info(f"Upload directory: {UPLOADS_DIR.resolve()}")
        logger.info(f"Is Docker: {IS_DOCKER}")

        try:
            content = await file.read()
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")

            # Validate image aspect ratio
            try:
                from PIL import Image
                import io

                # Open image from bytes
                img = Image.open(io.BytesIO(content))
                width, height = img.size
                logger.info(f"Manual upload image dimensions: {width}x{height} pixels")

                # Define target ratios and tolerance
                POSTER_RATIO = 2 / 3  # 0.666...
                BACKGROUND_RATIO = 16 / 9  # 1.777...
                # Tolerance allows for minor pixel deviations
                TOLERANCE = 0.05

                # Check for zero height
                if height == 0:
                    error_msg = "Image height cannot be zero."
                    logger.error(error_msg)
                    raise HTTPException(status_code=400, detail=error_msg)

                image_ratio = width / height
                logger.info(f"Image ratio calculated as: {image_ratio}")

                # Check aspect ratio based on poster type
                if posterType in ["standard", "season", "collection"]:
                    # Check for 2:3 ratio
                    if abs(image_ratio - POSTER_RATIO) > TOLERANCE:
                        error_msg = (
                            f"Invalid aspect ratio for poster. Image is {width}x{height} "
                            f"(ratio ~{image_ratio:.2f}), but must be 2:3 "
                            f"(ratio ~{POSTER_RATIO:.2f})."
                        )
                        logger.error(error_msg)
                        raise HTTPException(status_code=400, detail=error_msg)
                    logger.info("Image aspect ratio validated as 2:3.")

                elif posterType in ["background", "titlecard"]:
                    # Check for 16:9 ratio
                    if abs(image_ratio - BACKGROUND_RATIO) > TOLERANCE:
                        error_msg = (
                            f"Invalid aspect ratio for background/title card. Image is {width}x{height} "
                            f"(ratio ~{image_ratio:.2f}), but must be 16:9 "
                            f"(ratio ~{BACKGROUND_RATIO:.2f})."
                        )
                        logger.error(error_msg)
                        raise HTTPException(status_code=400, detail=error_msg)
                    logger.info("Image aspect ratio validated as 16:9.")

            except HTTPException:
                # Re-raise HTTP exceptions (ratio validation failures)
                raise
            except Exception as e:
                logger.warning(
                    f"Could not validate image dimensions for manual upload: {e}"
                )
                # Don't fail upload if dimension check itself fails

            with open(upload_path, "wb") as buffer:
                buffer.write(content)

            # Verify file was written
            if not upload_path.exists():
                raise HTTPException(
                    status_code=500, detail="File was not saved successfully"
                )

            actual_size = upload_path.stat().st_size
            if actual_size != len(content):
                logger.warning(
                    f"File size mismatch: expected {len(content)}, got {actual_size}"
                )

        except PermissionError as e:
            logger.error(f"Permission denied writing file: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Permission denied: Unable to write uploaded file. Check Docker/NAS/Unraid volume permissions.",
            )
        except OSError as e:
            logger.error(f"OS error writing file: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"File system error: {str(e)}. This may be a Docker volume mount issue.",
            )

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
        current_start_time = datetime.now().isoformat()

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
    except HTTPException:
        # Re-raise HTTPExceptions as they are already properly formatted
        raise
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH."
        logger.error(f"Manual upload failed: {error_msg}")
        logger.error(f"Exception details: {e}")
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Error running manual mode with uploaded file: {str(e)}"
        logger.error(error_msg)
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# GENERIC RUN ENDPOINT - Must be defined AFTER specific endpoints like /api/run-manual
# ============================================================================
@app.post("/api/run/{mode}")
async def run_script(mode: str):
    """Run Posterizarr script in different modes"""
    global current_process, current_mode, current_start_time

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
        current_start_time = datetime.now().isoformat()
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
    global current_process, current_mode, current_start_time

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
        current_start_time = datetime.now().isoformat()

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
    global current_process, current_mode, current_start_time

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
                current_start_time = None
                stopped_processes.append("manual")
            except subprocess.TimeoutExpired:
                current_process.kill()
                current_process = None
                current_mode = None
                current_start_time = None
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
    global current_process, current_mode, current_start_time

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
                current_start_time = None
                killed_processes.append("manual")
                logger.warning("Manual script was force killed")
            except Exception as e:
                logger.error(f"Error force killing manual process: {e}")
                current_process = None
                current_mode = None
                current_start_time = None
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
        current_start_time = None
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


@app.get("/api/logs/ui/unified")
async def get_unified_ui_logs(tail: int = 500):
    """
    Get unified UI logs from FrontendUI.log with both backend and frontend entries
    Returns chronologically sorted logs with source identification
    """
    try:
        ui_log_path = UI_LOGS_DIR / "FrontendUI.log"

        if not ui_log_path.exists():
            return {"logs": [], "total": 0, "message": "No UI logs available yet"}

        import re
        from datetime import datetime

        logs = []

        with open(ui_log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        # Parse each log line
        # Backend format: [TIMESTAMP] [LEVEL] [BACKEND:module:function:line] - MESSAGE
        # Frontend format: [TIMESTAMP] [LEVEL] [UI:Component] - MESSAGE

        backend_pattern = re.compile(
            r"^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[BACKEND:([^\]]+)\]\s+-\s+(.*)$"
        )
        frontend_pattern = re.compile(
            r"^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[UI:([^\]]+)\]\s+-\s+(.*)$"
        )

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Try backend format
            backend_match = backend_pattern.match(line)
            if backend_match:
                timestamp_str, level, module_info, message = backend_match.groups()
                logs.append(
                    {
                        "timestamp": timestamp_str,
                        "level": level.strip(),
                        "source": "backend",
                        "component": module_info,
                        "message": message,
                        "raw": line,
                    }
                )
                continue

            # Try frontend format
            frontend_match = frontend_pattern.match(line)
            if frontend_match:
                timestamp_str, level, component, message = frontend_match.groups()
                logs.append(
                    {
                        "timestamp": timestamp_str,
                        "level": level.strip(),
                        "source": "frontend",
                        "component": component,
                        "message": message,
                        "raw": line,
                    }
                )
                continue

            # If no pattern matches, include as raw log
            logs.append(
                {
                    "timestamp": "",
                    "level": "UNKNOWN",
                    "source": "unknown",
                    "component": "",
                    "message": line,
                    "raw": line,
                }
            )

        # Sort by timestamp (most recent last)
        def parse_timestamp(log_entry):
            try:
                if log_entry["timestamp"]:
                    return datetime.strptime(
                        log_entry["timestamp"], "%Y-%m-%d %H:%M:%S"
                    )
                return datetime.min
            except (ValueError, TypeError):
                return datetime.min

        logs.sort(key=parse_timestamp)

        # Return last N entries
        result_logs = logs[-tail:] if tail and len(logs) > tail else logs

        return {"logs": result_logs, "total": len(result_logs), "total_all": len(logs)}

    except Exception as e:
        logger.error(f"Error reading unified UI logs: {e}")
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

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

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

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
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

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

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

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
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

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

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

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
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

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

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

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
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
# MANUAL ASSETS GALLERY
# ============================================================================


@app.get("/api/manual-assets-gallery")
async def get_manual_assets_gallery():
    """Get all assets from manualassets directory - organized by library and folder"""
    try:
        if not MANUAL_ASSETS_DIR.exists():
            logger.warning(
                f"Manual assets directory does not exist: {MANUAL_ASSETS_DIR}"
            )
            return {"libraries": [], "total_assets": 0}

        libraries = []
        total_assets = 0

        # Iterate through library folders
        for library_dir in MANUAL_ASSETS_DIR.iterdir():
            # Skip @eaDir folders from Synology NAS
            if not library_dir.is_dir() or library_dir.name == "@eaDir":
                continue

            library_name = library_dir.name
            folders = []

            # Iterate through show/movie folders
            for folder_dir in library_dir.iterdir():
                # Skip @eaDir folders from Synology NAS
                if not folder_dir.is_dir() or folder_dir.name == "@eaDir":
                    continue

                folder_name = folder_dir.name
                assets = []

                # Find all image files in this folder
                for img_file in folder_dir.iterdir():
                    # Skip items containing @eaDir in path
                    if "@eaDir" in img_file.parts:
                        continue

                    if img_file.is_file() and img_file.suffix.lower() in [
                        ".jpg",
                        ".jpeg",
                        ".png",
                        ".webp",
                    ]:
                        # Skip backup files
                        if img_file.suffix == ".backup" or ".backup" in img_file.name:
                            continue

                        # Determine asset type from filename
                        filename_lower = img_file.name.lower()
                        if (
                            filename_lower == "poster.jpg"
                            or filename_lower == "poster.png"
                        ):
                            asset_type = "poster"
                        elif (
                            filename_lower == "background.jpg"
                            or filename_lower == "background.png"
                        ):
                            asset_type = "background"
                        elif filename_lower.startswith("season") and any(
                            c.isdigit() for c in filename_lower
                        ):
                            asset_type = "season"
                        elif re.match(r"^s\d+e\d+\.", filename_lower):
                            asset_type = "titlecard"
                        else:
                            asset_type = "other"

                        # Build relative path from manual assets dir
                        relative_path = f"{library_name}/{folder_name}/{img_file.name}"
                        # URL encode the path to handle special characters like #
                        encoded_relative_path = quote(relative_path, safe="/")

                        assets.append(
                            {
                                "name": img_file.name,
                                "path": relative_path,
                                "type": asset_type,
                                "size": img_file.stat().st_size,
                                "url": f"/manual_poster_assets/{encoded_relative_path}",
                            }
                        )
                        total_assets += 1

                if assets:
                    folders.append(
                        {
                            "name": folder_name,
                            "path": f"{library_name}/{folder_name}",
                            "assets": assets,
                            "asset_count": len(assets),
                        }
                    )

            if folders:
                libraries.append(
                    {
                        "name": library_name,
                        "folders": folders,
                        "folder_count": len(folders),
                    }
                )

        logger.info(
            f"Manual assets gallery: {len(libraries)} libraries, {total_assets} total assets"
        )
        return {"libraries": libraries, "total_assets": total_assets}

    except Exception as e:
        logger.error(f"Error getting manual assets gallery: {e}")
        import traceback

        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/manual-assets/{path:path}")
async def delete_manual_asset(path: str):
    """Delete an asset from the manual assets directory"""
    try:
        # Construct the full file path
        file_path = MANUAL_ASSETS_DIR / path

        # Security check: Ensure the path is within MANUAL_ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(MANUAL_ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Asset not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted manual asset: {file_path}")

        return {
            "success": True,
            "message": f"Manual asset '{path}' deleted successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting manual asset {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/manual-assets/bulk-delete")
async def bulk_delete_manual_assets(request: BulkDeleteRequest):
    """Delete multiple assets from the manual assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = MANUAL_ASSETS_DIR / path

                # Security check: Ensure the path is within MANUAL_ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(MANUAL_ASSETS_DIR.resolve())
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
                logger.info(f"Deleted manual asset: {file_path}")
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting manual asset {path}: {e}")

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} manual asset(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete manual assets: {e}")
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
            # Skip @eaDir folders from Synology NAS
            if item.is_dir() and item.name == "@eaDir":
                continue

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

        # Extract library folder from item_path for media type determination
        path_parts = item_path.split("/")
        library_folder = path_parts[0] if len(path_parts) > 0 else None

        assets = []
        for ext in ["*.jpg", "*.jpeg", "*.png", "*.webp"]:
            for image_path in item_full_path.glob(ext):
                if image_path.is_file():
                    # Create relative path from ASSETS_DIR
                    relative_path = image_path.relative_to(ASSETS_DIR)
                    url_path = str(relative_path).replace("\\", "/")
                    # URL encode the path to handle special characters like #
                    encoded_url_path = quote(url_path, safe="/")

                    # Determine media type using library folder
                    media_type = determine_media_type(image_path.name, library_folder)

                    assets.append(
                        {
                            "name": image_path.name,
                            "path": str(relative_path).replace("\\", "/"),
                            "url": f"/poster_assets/{encoded_url_path}",
                            "size": image_path.stat().st_size,
                            "type": media_type,  # Add type field for correct badge display
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
        # Auto-import CSV to database before fetching (ensures fresh data)
        try:
            import_imagechoices_to_db()
        except Exception as e:
            logger.warning(f"Could not import CSV to database: {e}")

        # Get all assets from database (already sorted by id DESC - newest first)
        db_records = db.get_all_choices()

        logger.info(f"Found {len(db_records)} total assets in database")

        # If no assets found, return early
        if not db_records:
            logger.warning(" No assets found in database")
            return {
                "success": True,
                "assets": [],
                "total_count": 0,
            }

        # Convert database records to asset format and find poster files
        recent_assets = []
        max_assets = 100  # Limit to 100 most recent assets

        # Process records until we have 100 valid assets (not just first 100 records)
        for record in db_records:
            # Stop once we have enough valid assets
            if len(recent_assets) >= max_assets:
                break

            # Convert database record (sqlite3.Row) to dict
            asset_dict = dict(record)

            rootfolder = asset_dict.get("Rootfolder", "")
            asset_type = asset_dict.get("Type", "Poster")
            title = asset_dict.get("Title", "")
            download_source = asset_dict.get("Download Source", "")

            # Determine if manually created based on Manual field or download_source
            manual_field = asset_dict.get("Manual", "N/A")

            # Manual can be: "Yes" (resolved), "No" (explicitly unresolved), "true"/"false" (legacy), or N/A (not set)
            # "Yes" = resolved/manually marked as no edits needed
            # "No" = explicitly unresolved (was resolved but user clicked unresolve)
            # "true" = legacy resolved state
            # "false" or N/A = regular assets

            if manual_field in ["Yes", "true", True]:
                is_manually_created = True
            else:
                # For "No", "false", False, or N/A - check download_source as fallback
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
                    logger.debug(
                        f"[SKIP]  Skipping fallback asset in recent view: {title}"
                    )
                    continue

                # Skip assets that were explicitly marked as unresolved (Manual="No")
                # "No" means user clicked "Unresolve" - these should be hidden from recent assets
                if manual_field == "No":
                    logger.debug(
                        f"[SKIP]  Skipping explicitly unresolved asset in recent view: {title}"
                    )
                    continue

                poster_data = find_poster_with_metadata(
                    rootfolder, asset_type, title, download_source
                )
                if poster_data:
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
                        "poster_url": poster_data["url"],
                        "has_poster": True,
                        "created": poster_data["created"],
                        "modified": poster_data["modified"],
                    }
                    recent_assets.append(asset)
                else:
                    logger.debug(f"[SKIP]  Skipping asset (poster not found): {title}")

        logger.info(
            f"Returning {len(recent_assets)} most recent assets with existing images from database"
        )

        return {
            "success": True,
            "assets": recent_assets,
            "total_count": len(recent_assets),
        }

    except Exception as e:
        logger.error(f"[ERROR] Error getting recent assets from database: {e}")
        import traceback

        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e), "assets": [], "total_count": 0}


@app.get("/api/asset-type-lookup")
async def get_asset_type_lookup(rootfolder: str, filename: str = None):
    """
    Look up the asset type from imagechoices database by rootfolder name and optionally filename

    This helps correctly classify assets (Movie vs Show, Season, Episode, Background) when displaying
    in galleries, as the database has the authoritative Type information.

    Args:
        rootfolder: The rootfolder name from the asset path (e.g., "Movie Name (2024) {tmdb-12345}")
        filename: Optional filename to get more specific type (e.g., "Season04.jpg", "S04E01.jpg", "background.jpg")

    Returns:
        dict with 'success' and 'type' (or 'error')
    """
    try:
        if not rootfolder:
            return {"success": False, "error": "rootfolder parameter required"}

        record = None

        # If filename provided, try to find exact match by pattern matching
        if filename:
            import os
            import re

            base_name = os.path.splitext(filename)[0].lower()

            # Get all records for this rootfolder
            cursor = db.connection.cursor()
            cursor.execute(
                "SELECT * FROM imagechoices WHERE Rootfolder = ?", (rootfolder,)
            )
            all_records = cursor.fetchall()

            if all_records:
                # Try to match by filename pattern
                for rec in all_records:
                    rec_dict = dict(rec)
                    title = rec_dict.get("Title", "")
                    rec_type = rec_dict.get("Type", "")

                    # Check for Season pattern (e.g., "Season04.jpg" matches Title containing "Season 4")
                    if base_name.startswith("season"):
                        season_match = re.match(
                            r"season0*(\d+)", base_name, re.IGNORECASE
                        )
                        if season_match and rec_type == "Season":
                            season_num = season_match.group(1)
                            # Title is like "Mocro Maffia | Season 4"
                            if (
                                f"Season {season_num}" in title
                                or f"Season{season_num}" in title
                            ):
                                record = rec
                                break

                    # Check for Episode pattern (e.g., "S04E01.jpg" matches Title starting with "S04E01")
                    elif re.match(r"s\d+e\d+", base_name, re.IGNORECASE):
                        episode_code = base_name.upper()
                        # Remove leading zeros for matching
                        normalized_code = re.sub(
                            r"S0*(\d+)E0*(\d+)", r"S\1E\2", episode_code
                        )

                        if rec_type == "Episode":
                            # Title is like "S04E01 | ICH WEIß, WO ER ARBEITET"
                            title_upper = title.upper()
                            # Match with or without leading zeros
                            if title_upper.startswith(
                                episode_code
                            ) or title_upper.startswith(normalized_code):
                                record = rec
                                break

                    # Check for background
                    elif base_name == "background":
                        if "background" in rec_type.lower():
                            record = rec
                            break

                    # Check for poster
                    elif base_name == "poster":
                        # For poster, prefer "Show" or "Movie" type (not backgrounds, not seasons)
                        if rec_type in ["Show", "Movie", "Poster"]:
                            record = rec
                            break

        # If no specific match found, fall back to rootfolder only (gets poster/show/movie type)
        if not record:
            logger.debug(
                f"No specific match found, falling back to rootfolder lookup: {rootfolder}"
            )
            record = db.get_choice_by_rootfolder(rootfolder)

        if record:
            asset_dict = dict(record)
            asset_type = asset_dict.get("Type", "")

            logger.debug(
                f"Asset type lookup for rootfolder='{rootfolder}', filename='{filename}': {asset_type}"
            )

            return {
                "success": True,
                "type": asset_type,
                "title": asset_dict.get("Title", ""),
                "library": asset_dict.get("LibraryName", ""),
            }
        else:
            logger.debug(f"No database record found for rootfolder: {rootfolder}")
            return {"success": False, "error": "Asset not found in database"}

    except Exception as e:
        logger.error(f"Error looking up asset type: {e}")
        import traceback

        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}


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


@app.get("/api/dashboard/all")
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
        status_response = await get_status()
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
        version_response = await get_version()
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
            logger.error(f"Error fetching scheduler status in dashboard/all: {e}")
            result["scheduler_status"] = {"success": False}
    else:
        result["scheduler_status"] = {"success": False}

    # Fetch system info
    try:
        system_info_response = await get_system_info()
        result["system_info"] = system_info_response
    except Exception as e:
        logger.error(f"Error fetching system info in dashboard/all: {e}")
        result["system_info"] = {
            "platform": "Unknown",
            "cpu_cores": 0,
            "memory_percent": 0,
            "total_memory": "Unknown",
            "used_memory": "Unknown",
            "free_memory": "Unknown",
        }

    return result


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
        is_initial_scan = last_scan == 0

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
                "is_initial_scan": is_initial_scan,
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
                "is_initial_scan": True,
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
        # Filter out @eaDir during iteration
        all_test_images = [
            p
            for p in TEST_DIR.rglob("*")
            if p.suffix.lower() in image_extensions and "@eaDir" not in str(p)
        ]

        for image_path in all_test_images:
            if image_path.is_file():
                try:
                    relative_path = image_path.relative_to(TEST_DIR)
                    # Create URL path with forward slashes
                    url_path = str(relative_path).replace("\\", "/")
                    # URL encode the path to handle special characters like #
                    encoded_url_path = quote(url_path, safe="/")
                    images.append(
                        {
                            "path": str(relative_path),
                            "name": image_path.name,
                            "size": image_path.stat().st_size,
                            "url": f"/test/{encoded_url_path}",
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
    """Add a new schedule (time must be in HH:MM format, 00:00-23:59)"""
    if not SCHEDULER_AVAILABLE or not scheduler:
        raise HTTPException(status_code=503, detail="Scheduler not available")

    try:
        # Validate time format before adding
        hour, minute = scheduler.parse_schedule_time(data.time)
        if hour is None or minute is None:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid time format '{data.time}'. Must be HH:MM (00:00-23:59)",
            )

        success = scheduler.add_schedule(data.time, data.description)
        if success:
            return {"success": True, "message": f"Schedule added: {data.time}"}
        else:
            raise HTTPException(
                status_code=400, detail=f"Schedule {data.time} already exists"
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
            # Give scheduler a moment to update jobs
            import asyncio

            await asyncio.sleep(0.1)
            # Get updated status after removal
            status = scheduler.get_status()
            return {"success": True, "message": f"Schedule removed: {time}", **status}
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
        # Get updated status immediately after clearing
        status = scheduler.get_status()
        return {"success": True, "message": "All schedules cleared", **status}
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
# LOGS WATCHER API
# ============================================================================


@app.get("/api/logs-watcher/status")
async def get_logs_watcher_status():
    """Get current logs watcher status"""
    try:
        if not LOGS_WATCHER_AVAILABLE:
            return {
                "success": True,
                "available": False,
                "running": False,
                "message": "Logs watcher module not available",
            }

        if not logs_watcher:
            return {
                "success": True,
                "available": True,
                "running": False,
                "message": "Logs watcher not initialized (database may not be available)",
            }

        return {
            "success": True,
            "available": True,
            "running": logs_watcher.is_running,
            "logs_dir": str(logs_watcher.logs_dir),
            "debounce_seconds": logs_watcher.debounce_seconds,
            "poll_interval": logs_watcher.poll_interval,
            "monitored_files": {
                "csv": "ImageChoices.csv",
                "json": sorted(
                    [
                        "tautulli.json",
                        "arr.json",
                        "normal.json",
                        "manual.json",
                        "testing.json",
                        "backup.json",
                        "syncjelly.json",
                        "syncemby.json",
                        "scheduled.json",
                        "replace.json",
                    ]
                ),
            },
        }

    except Exception as e:
        logger.error(f"Error getting logs watcher status: {e}", exc_info=True)
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
        logger.info("=" * 80)
        logger.info(f"FETCH ASSET REPLACEMENTS REQUEST:")
        logger.info(f"  Asset Path: {request.asset_path}")
        logger.info(f"  Media Type: {request.media_type}")
        logger.info(f"  Asset Type: {request.asset_type}")
        logger.info(f"  Title: {request.title}")
        logger.info(f"  Year: {request.year}")
        logger.info(f"  TMDB ID: {request.tmdb_id}")
        logger.info(f"  TVDB ID: {request.tvdb_id}")
        logger.info(f"  Season Number: {request.season_number}")
        logger.info(f"  Episode Number: {request.episode_number}")
        logger.info("=" * 80)

        # Try to get IDs from database if not provided in request
        if not request.tmdb_id or not request.tvdb_id:
            try:
                from database import ImageChoices

                db = ImageChoices()

                db_record = None
                search_method = None

                # Method 1: Search by asset path (for AssetReplacer)
                if request.asset_path and not request.asset_path.startswith("manual_"):
                    # Extract show/movie name from asset path to match against Rootfolder
                    # Example path: "D:/Media/Shows/Show Name (2020) {tmdb-123}/Season 01/poster.jpg"
                    import os

                    path_parts = request.asset_path.replace("\\", "/").split("/")

                    # Look for folder with TMDB/TVDB ID pattern in path
                    rootfolder_candidate = None
                    for part in path_parts:
                        # Check if this part has an ID pattern like {tmdb-123}, [tvdb-456], etc.
                        if any(
                            pattern in part.lower()
                            for pattern in ["tmdb-", "tvdb-", "imdb-"]
                        ):
                            rootfolder_candidate = part
                            break

                    if rootfolder_candidate:
                        logger.info(
                            f"Searching database by path for: {rootfolder_candidate}"
                        )
                        search_method = "path"

                        # Search database for matching record
                        cursor = db.connection.cursor()
                        cursor.execute(
                            """
                            SELECT tmdbid, tvdbid, imdbid, Rootfolder
                            FROM imagechoices 
                            WHERE Rootfolder LIKE ?
                            LIMIT 1
                        """,
                            (f"%{rootfolder_candidate}%",),
                        )

                        db_record = cursor.fetchone()

                # Method 2: Search by title + year (for Manual Mode)
                if not db_record and request.title:
                    logger.info(
                        f"Searching database by title for: '{request.title}' (year: {request.year})"
                    )
                    search_method = "title"

                    cursor = db.connection.cursor()

                    # Try exact title match first
                    if request.year:
                        # Search with year in Rootfolder pattern: "Title (YYYY)"
                        cursor.execute(
                            """
                            SELECT tmdbid, tvdbid, imdbid, Rootfolder
                            FROM imagechoices 
                            WHERE Rootfolder LIKE ?
                            LIMIT 1
                        """,
                            (f"%{request.title}%({request.year})%",),
                        )
                    else:
                        # Search without year
                        cursor.execute(
                            """
                            SELECT tmdbid, tvdbid, imdbid, Rootfolder
                            FROM imagechoices 
                            WHERE Rootfolder LIKE ?
                            LIMIT 1
                        """,
                            (f"%{request.title}%",),
                        )

                    db_record = cursor.fetchone()

                # Process database record if found
                if db_record:
                    db_tmdbid = db_record[0] if db_record[0] != "false" else None
                    db_tvdbid = db_record[1] if db_record[1] != "false" else None
                    db_imdbid = db_record[2] if db_record[2] != "false" else None
                    db_rootfolder = db_record[3]

                    logger.info(f"Found database record (via {search_method}):")
                    logger.info(f"  Rootfolder: {db_rootfolder}")
                    logger.info(f"  TMDB ID: {db_tmdbid}")
                    logger.info(f"  TVDB ID: {db_tvdbid}")
                    logger.info(f"  IMDB ID: {db_imdbid}")

                    # Use database IDs if not provided in request
                    if not request.tmdb_id and db_tmdbid:
                        request.tmdb_id = db_tmdbid
                        logger.info(f"Using TMDB ID from database: {db_tmdbid}")

                    if not request.tvdb_id and db_tvdbid:
                        request.tvdb_id = db_tvdbid
                        logger.info(f"Using TVDB ID from database: {db_tvdbid}")

                    # Store IMDB ID for Fanart.tv (store in request for later use)
                    if db_imdbid:
                        # Store it as a custom attribute (we'll use it for Fanart)
                        if not hasattr(request, "imdb_id"):
                            request.imdb_id = db_imdbid
                            logger.info(f"Using IMDB ID from database: {db_imdbid}")
                else:
                    logger.info(
                        f"No matching database record found (searched via {search_method})"
                    )

            except Exception as e:
                logger.warning(f"Could not query database for IDs: {e}")
                logger.debug("Continuing with title-based search...")

        # Load config to get API keys and language preferences
        if not CONFIG_PATH.exists():
            raise HTTPException(status_code=404, detail="Config file not found")

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        # Get API tokens and language preferences - support multiple key name variants
        if CONFIG_MAPPER_AVAILABLE:
            flat_config = flatten_config(grouped_config)
            tmdb_token = flat_config.get("tmdbtoken", "")
            # Support both "tvdbapikey" and "tvdbapi" for TVDB
            tvdb_api_key = flat_config.get("tvdbapikey") or flat_config.get(
                "tvdbapi", ""
            )
            tvdb_pin = flat_config.get("tvdbpin", "")
            # Support both "fanartapikey" and "FanartTvAPIKey" for Fanart.tv
            fanart_api_key = (
                flat_config.get("fanartapikey")
                or flat_config.get("fanarttvapikey")
                or flat_config.get("FanartTvAPIKey", "")
            )
            # Get language preferences
            preferred_language_order = flat_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = flat_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = flat_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )
            preferred_tc_language_order = flat_config.get(
                "PreferredTCLanguageOrder", ""
            )
        else:
            api_part = grouped_config.get("ApiPart", {})
            tmdb_token = api_part.get("tmdbtoken", "")
            # Support both "tvdbapikey" and "tvdbapi" for TVDB
            tvdb_api_key = api_part.get("tvdbapikey") or api_part.get("tvdbapi", "")
            tvdb_pin = api_part.get("tvdbpin", "")
            # Support both "fanartapikey" and "FanartTvAPIKey" for Fanart.tv
            fanart_api_key = (
                api_part.get("fanartapikey")
                or api_part.get("fanarttvapikey")
                or api_part.get("FanartTvAPIKey", "")
            )

            # Try to get language preferences from different possible locations
            preferred_language_order = grouped_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = grouped_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = grouped_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )
            preferred_tc_language_order = grouped_config.get(
                "PreferredTCLanguageOrder", ""
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
            if not preferred_tc_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_tc_language_order = grouped_config["ApiPart"].get(
                    "PreferredTCLanguageOrder", ""
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
        tc_language_order_list = parse_language_order(preferred_tc_language_order)

        logger.info(
            f"Language preferences loaded - Standard: {language_order_list}, Season: {season_language_order_list}, Background: {background_language_order_list}, TitleCard: {tc_language_order_list}"
        )

        # Helper function to filter and sort by language preference
        def filter_and_sort_by_language(items_list, preferred_languages):
            """
            Sort items based on preferred language order.
            Preferred languages come first in order, then all other languages.

            Args:
                items_list: List of item dicts with 'language' field
                preferred_languages: List of language codes in order of preference (e.g., ['de', 'en', 'xx'])

            Returns:
                Sorted list of items (preferred languages first, then others)
            """
            if not preferred_languages or not items_list:
                return items_list

            # Normalize language codes to lowercase
            preferred_languages = [
                lang.lower().strip() for lang in preferred_languages if lang
            ]

            # Group items by language
            language_groups = {lang: [] for lang in preferred_languages}
            language_groups["other"] = []  # For languages not in preferences

            for item in items_list:
                item_lang = (item.get("language") or "xx").lower()

                # Check if item language matches any preferred language
                if item_lang in preferred_languages:
                    language_groups[item_lang].append(item)
                else:
                    language_groups["other"].append(item)

            # Build result list in order of preference, then add other languages
            result = []
            for lang in preferred_languages:
                result.extend(language_groups[lang])

            # Add other languages at the end
            result.extend(language_groups["other"])

            return result

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

                logger.info(f" TMDB API Request: {url}")
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

        # Helper function to search for TVDB ID by title and year
        async def search_tvdb_id(
            title: str, year: Optional[int], media_type: str
        ) -> Optional[str]:
            if not tvdb_api_key or not title:
                return None
            try:
                # First, login to get token
                async with httpx.AsyncClient(timeout=10.0) as client:
                    login_url = "https://api4.thetvdb.com/v4/login"
                    body = {"apikey": tvdb_api_key}
                    if tvdb_pin:
                        body["pin"] = tvdb_pin

                    headers_tvdb = {
                        "accept": "application/json",
                        "Content-Type": "application/json",
                    }

                    login_response = await client.post(
                        login_url, json=body, headers=headers_tvdb
                    )

                    if login_response.status_code == 200:
                        token = login_response.json().get("data", {}).get("token")

                        if token:
                            auth_headers = {
                                "Authorization": f"Bearer {token}",
                                "accept": "application/json",
                            }

                            # Search for series/movie
                            search_url = "https://api4.thetvdb.com/v4/search"
                            params = {
                                "query": title,
                                "type": "series" if media_type == "tv" else "movie",
                            }

                            if year:
                                params["year"] = year

                            logger.info(f" TVDB API Request: {search_url}")
                            logger.info(f"   Params: {params}")

                            search_response = await client.get(
                                search_url, headers=auth_headers, params=params
                            )
                            logger.info(
                                f"   Response Status: {search_response.status_code}"
                            )

                            if search_response.status_code == 200:
                                data = search_response.json()
                                results = data.get("data", [])
                                logger.info(f"   Results Count: {len(results)}")

                                if results:
                                    # Get the first result
                                    result_id = str(results[0].get("tvdb_id"))
                                    result_name = results[0].get("name")
                                    logger.info(
                                        f"   First Result: ID={result_id}, Name='{result_name}'"
                                    )
                                    return result_id
                                else:
                                    logger.warning(
                                        f"   No results found in TVDB response"
                                    )
            except Exception as e:
                logger.error(f"Error searching TVDB by title: {e}")
            return None

        # Determine TMDB ID(s) - collect multiple IDs for dual search
        tmdb_ids_to_use = []

        # If TMDB ID is provided or found in DB, use it
        if request.tmdb_id:
            tmdb_ids_to_use.append(("provided_id", request.tmdb_id))
            logger.info(f"Using TMDB ID from database/request: {request.tmdb_id}")

        # Check if title contains an ID with prefix (e.g., "tmdb-123", "tvdb-456", "imdb-789")
        # This handles manual ID entry in RunModes search bar with explicit provider prefix
        # ONLY check for prefixes if we don't have IDs from database yet
        potential_tmdb_id = None
        potential_tvdb_id = None
        potential_imdb_id = None
        detected_provider = None  # Track which provider prefix was used

        if not tmdb_ids_to_use and request.title:
            title_lower = request.title.strip().lower()

            # Check for TMDB ID: tmdb-123 or tmdb:123
            tmdb_match = re.match(r"tmdb[-:](\d+)", title_lower)
            if tmdb_match:
                potential_tmdb_id = tmdb_match.group(1)
                detected_provider = "tmdb"
                logger.info(f"Detected TMDB ID from title prefix: {potential_tmdb_id}")

            # Check for TVDB ID: tvdb-123 or tvdb:123
            tvdb_match = re.match(r"tvdb[-:](\d+)", title_lower)
            if tvdb_match:
                potential_tvdb_id = tvdb_match.group(1)
                detected_provider = "tvdb"
                logger.info(f"Detected TVDB ID from title prefix: {potential_tvdb_id}")

            # Check for IMDB ID: imdb-123 or imdb:123 or imdb-tt123 or just tt123
            imdb_match = re.match(r"(?:imdb[-:])?(?:tt)?(\d+)", title_lower)
            if imdb_match and (
                title_lower.startswith("imdb") or title_lower.startswith("tt")
            ):
                potential_imdb_id = imdb_match.group(1)
                detected_provider = "imdb"
                # IMDB IDs should have the 'tt' prefix for Fanart.tv
                if not potential_imdb_id.startswith("tt"):
                    potential_imdb_id = f"tt{potential_imdb_id}"
                logger.info(f"Detected IMDB ID from title prefix: {potential_imdb_id}")

        # If we detected a TMDB ID in title prefix, use it
        if not tmdb_ids_to_use and potential_tmdb_id:
            tmdb_ids_to_use.append(("manual_id_entry", potential_tmdb_id))
            logger.info(
                f"Using manually entered TMDB ID from prefix: {potential_tmdb_id}"
            )

        # Only search by title if we don't have any TMDB ID yet AND no ID prefix was detected
        if (
            not tmdb_ids_to_use
            and request.title
            and not (potential_tmdb_id or potential_tvdb_id or potential_imdb_id)
            and tmdb_token
        ):
            logger.info(
                f"No TMDB ID available - searching TMDB by title: '{request.title}' (year: {request.year})"
            )
            found_id = await search_tmdb_id(
                request.title, request.year, request.media_type
            )
            if found_id:
                tmdb_ids_to_use.append(("title_search", found_id))
                logger.info(f"Found TMDB ID from title search: {found_id}")
            else:
                logger.warning(f"No TMDB ID found for title: '{request.title}'")

        # Determine TVDB ID(s) - collect multiple IDs for dual search
        tvdb_ids_to_use = []

        # If TVDB ID is provided or found in DB, use it (works for both TV and Movies in TVDB API v4)
        if request.tvdb_id:
            tvdb_ids_to_use.append(("provided_id", request.tvdb_id))
            logger.info(
                f"Using TVDB ID from database/request: {request.tvdb_id} (media_type: {request.media_type})"
            )

        # If we detected a TVDB ID in title prefix (only if no DB ID), use it
        if not tvdb_ids_to_use and potential_tvdb_id:
            tvdb_ids_to_use.append(("manual_id_entry", potential_tvdb_id))
            logger.info(
                f"Using manually entered TVDB ID from prefix: {potential_tvdb_id}"
            )

        # Only search by title if we don't have any TVDB ID yet AND no ID prefix was detected
        # TVDB API v4 supports both TV shows and movies
        if (
            not tvdb_ids_to_use
            and request.title
            and not (potential_tmdb_id or potential_tvdb_id or potential_imdb_id)
            and tvdb_api_key
        ):
            logger.info(
                f"No TVDB ID available - searching TVDB by title: '{request.title}' (year: {request.year}, media_type: {request.media_type})"
            )
            found_id = await search_tvdb_id(
                request.title, request.year, request.media_type
            )
            if found_id:
                tvdb_ids_to_use.append(("title_search", found_id))
                logger.info(f"Found TVDB ID from title search: {found_id}")
            else:
                logger.warning(f"No TVDB ID found for title: '{request.title}'")

        # Create async tasks for parallel fetching - AFTER IDs are resolved
        async def fetch_tmdb():
            """Fetch TMDB assets asynchronously from all collected IDs"""
            if not tmdb_token:
                logger.warning("TMDB: No API token configured")
                return []

            if not tmdb_ids_to_use:
                logger.warning("TMDB: No TMDB IDs available")
                return []

            all_results = []
            seen_urls = set()  # Track unique image URLs to avoid duplicates

            try:
                headers = {
                    "Authorization": f"Bearer {tmdb_token}",
                    "Content-Type": "application/json",
                }

                media_endpoint = "movie" if request.media_type == "movie" else "tv"

                # Fetch from all collected IDs
                for source, tmdb_id in tmdb_ids_to_use:
                    logger.info(
                        f" TMDB: Fetching {request.asset_type} for ID: {tmdb_id} (from {source})"
                    )

                    async with httpx.AsyncClient(timeout=10.0) as client:
                        if (
                            request.asset_type == "titlecard"
                            and request.season_number
                            and request.episode_number
                        ):
                            # Episode stills
                            url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/episode/{request.episode_number}/images"
                            response = await client.get(url, headers=headers)
                            if response.status_code == 200:
                                data = response.json()
                                for still in data.get("stills", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{still.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{still.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "episode_still",
                                                "vote_average": still.get(
                                                    "vote_average", 0
                                                ),
                                                "width": still.get("width", 0),
                                                "height": still.get("height", 0),
                                            }
                                        )

                        elif request.asset_type == "season" and request.season_number:
                            # Season posters
                            url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/images"
                            response = await client.get(url, headers=headers)
                            if response.status_code == 200:
                                data = response.json()
                                for poster in data.get("posters", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{poster.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "season_poster",
                                                "language": poster.get("iso_639_1"),
                                                "vote_average": poster.get(
                                                    "vote_average", 0
                                                ),
                                                "width": poster.get("width", 0),
                                                "height": poster.get("height", 0),
                                            }
                                        )

                        elif request.asset_type == "background":
                            # Backgrounds
                            url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
                            response = await client.get(url, headers=headers)
                            if response.status_code == 200:
                                data = response.json()
                                for backdrop in data.get("backdrops", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{backdrop.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{backdrop.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "backdrop",
                                                "language": backdrop.get("iso_639_1"),
                                                "vote_average": backdrop.get(
                                                    "vote_average", 0
                                                ),
                                                "width": backdrop.get("width", 0),
                                                "height": backdrop.get("height", 0),
                                            }
                                        )

                        else:
                            # Standard posters
                            url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
                            logger.info(f" TMDB Poster URL: {url}")
                            response = await client.get(url, headers=headers)
                            logger.info(
                                f" TMDB Response Status: {response.status_code}"
                            )
                            if response.status_code == 200:
                                data = response.json()
                                for poster in data.get("posters", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{poster.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "poster",
                                                "language": poster.get("iso_639_1"),
                                                "vote_average": poster.get(
                                                    "vote_average", 0
                                                ),
                                                "width": poster.get("width", 0),
                                                "height": poster.get("height", 0),
                                            }
                                        )

                logger.info(
                    f" TMDB: Collected {len(all_results)} unique images from {len(tmdb_ids_to_use)} ID(s)"
                )

            except Exception as e:
                logger.error(f"Error fetching TMDB assets: {e}")

            return all_results

        async def fetch_tvdb():
            """Fetch TVDB assets asynchronously from all collected IDs"""
            if not tvdb_api_key:
                logger.warning("TVDB: No API key configured")
                return []

            if not tvdb_ids_to_use:
                logger.warning(
                    f"TVDB: No TVDB IDs available (media_type={request.media_type}, asset_type={request.asset_type}) - skipping TVDB fetch"
                )
                return []

            logger.info(
                f"TVDB: Starting fetch for {len(tvdb_ids_to_use)} ID(s): {tvdb_ids_to_use}"
            )
            all_results = []
            seen_urls = set()  # Track unique image URLs to avoid duplicates

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    login_url = "https://api4.thetvdb.com/v4/login"
                    body = {"apikey": tvdb_api_key}
                    if tvdb_pin:
                        body["pin"] = tvdb_pin

                    headers_tvdb = {
                        "accept": "application/json",
                        "Content-Type": "application/json",
                    }

                    login_response = await client.post(
                        login_url, json=body, headers=headers_tvdb
                    )

                    if login_response.status_code == 200:
                        token = login_response.json().get("data", {}).get("token")

                        if token:
                            auth_headers = {
                                "Authorization": f"Bearer {token}",
                                "accept": "application/json",
                            }

                            # Fetch from all collected IDs
                            for source, tvdb_id in tvdb_ids_to_use:
                                # TVDB API v4 supports both series and movies
                                entity_type = (
                                    "series" if request.media_type == "tv" else "movies"
                                )

                                # Handle season-specific requests
                                if (
                                    request.asset_type == "season"
                                    and request.season_number
                                    and entity_type == "series"
                                ):
                                    # Fetch season-specific artwork using extended endpoint
                                    logger.info(
                                        f" TVDB: Fetching season {request.season_number} artwork for series ID: {tvdb_id} (from {source})"
                                    )
                                    artwork_url = f"https://api4.thetvdb.com/v4/series/{tvdb_id}/extended"

                                    logger.info(f" TVDB: Requesting {artwork_url}")
                                    artwork_response = await client.get(
                                        artwork_url,
                                        headers=auth_headers,
                                    )

                                    logger.info(
                                        f" TVDB: Response status: {artwork_response.status_code}"
                                    )
                                    if artwork_response.status_code == 200:
                                        extended_data = artwork_response.json()
                                        seasons = extended_data.get("data", {}).get(
                                            "seasons", []
                                        )
                                        logger.info(
                                            f" TVDB: Found {len(seasons)} seasons in response"
                                        )

                                        # Find matching season
                                        for season in seasons:
                                            if (
                                                season.get("number")
                                                == request.season_number
                                            ):
                                                season_image = season.get("image")
                                                if (
                                                    season_image
                                                    and season_image not in seen_urls
                                                ):
                                                    seen_urls.add(season_image)
                                                    all_results.append(
                                                        {
                                                            "url": season_image,
                                                            "original_url": season_image,
                                                            "source": "TVDB",
                                                            "source_type": source,
                                                            "type": "season",
                                                            "language": "eng",
                                                        }
                                                    )
                                                    logger.info(
                                                        f" TVDB: Added season {request.season_number} poster"
                                                    )
                                                break
                                    else:
                                        logger.warning(
                                            f" TVDB: Non-200 response: {artwork_response.status_code} - {artwork_response.text[:200]}"
                                        )
                                else:
                                    # Regular artwork fetch (posters, backgrounds)
                                    logger.info(
                                        f" TVDB: Fetching artwork for {entity_type} ID: {tvdb_id} (from {source})"
                                    )

                                    # For manual ID entry (prefix detected), try both movies and series
                                    # This handles cases where user enters tvdb:28 without knowing if it's a movie or series
                                    should_try_both_types = source == "manual_id_entry"

                                    # Try movies first (if entity_type is movies OR if manual entry)
                                    if entity_type == "movies" or should_try_both_types:
                                        artwork_url = f"https://api4.thetvdb.com/v4/movies/{tvdb_id}/extended"

                                        logger.info(
                                            f" TVDB: Requesting {artwork_url} (movies extended)"
                                        )
                                        artwork_response = await client.get(
                                            artwork_url,
                                            headers=auth_headers,
                                        )

                                        logger.info(
                                            f" TVDB: Movies response status: {artwork_response.status_code}"
                                        )

                                        if artwork_response.status_code == 200:
                                            movie_data = artwork_response.json()
                                            artworks = movie_data.get("data", {}).get(
                                                "artworks", []
                                            )
                                            logger.info(
                                                f" TVDB: Found {len(artworks)} artworks in movies extended response"
                                            )

                                            # Debug: Log first few artwork types to understand the structure
                                            if artworks:
                                                sample_types = {}
                                                for artwork in artworks[:10]:
                                                    art_type = artwork.get("type")
                                                    if art_type not in sample_types:
                                                        sample_types[art_type] = 0
                                                    sample_types[art_type] += 1
                                                logger.info(
                                                    f" TVDB: Sample artwork types from first 10: {sample_types}"
                                                )

                                            # Filter artworks by type
                                            poster_count = 0
                                            background_count = 0
                                            for artwork in artworks:
                                                artwork_type = artwork.get("type")
                                                image_url = artwork.get("image")

                                                # Movies endpoint uses different type codes than series
                                                # type=14 for posters, type=15 for backgrounds
                                                # "standard" asset type is treated as posters
                                                if (
                                                    request.asset_type
                                                    in ["poster", "standard"]
                                                ) and artwork_type == 14:
                                                    poster_count += 1
                                                    if (
                                                        image_url
                                                        and image_url not in seen_urls
                                                    ):
                                                        seen_urls.add(image_url)
                                                        all_results.append(
                                                            {
                                                                "url": image_url,
                                                                "original_url": image_url,
                                                                "source": "TVDB",
                                                                "source_type": source,
                                                                "type": request.asset_type,
                                                                "language": artwork.get(
                                                                    "language"
                                                                ),
                                                            }
                                                        )
                                                elif (
                                                    request.asset_type == "background"
                                                    and artwork_type == 15
                                                ):
                                                    background_count += 1
                                                    if (
                                                        image_url
                                                        and image_url not in seen_urls
                                                    ):
                                                        seen_urls.add(image_url)
                                                        all_results.append(
                                                            {
                                                                "url": image_url,
                                                                "original_url": image_url,
                                                                "source": "TVDB",
                                                                "source_type": source,
                                                                "type": request.asset_type,
                                                                "language": artwork.get(
                                                                    "language"
                                                                ),
                                                            }
                                                        )

                                            logger.info(
                                                f" TVDB: Movies artwork types - Posters (type=14): {poster_count}, Backgrounds (type=15): {background_count}, Added to results: {len(all_results)}"
                                            )
                                        else:
                                            logger.info(
                                                f" TVDB: Movies endpoint returned {artwork_response.status_code} - {'Success but no artworks' if artwork_response.status_code == 200 else 'trying series endpoint'}"
                                            )

                                    # Try series endpoint (if entity_type is series OR if manual entry and movies didn't work)
                                    if entity_type == "series" or (
                                        should_try_both_types and len(all_results) == 0
                                    ):
                                        artwork_url = f"https://api4.thetvdb.com/v4/series/{tvdb_id}/artworks"
                                        artwork_params = {
                                            "lang": "eng",
                                            "type": "2",
                                        }  # type=2 for posters

                                        if request.asset_type == "background":
                                            artwork_params["type"] = (
                                                "3"  # type=3 for backgrounds
                                            )

                                        logger.info(
                                            f" TVDB: Requesting {artwork_url} with params {artwork_params} (series)"
                                        )
                                        artwork_response = await client.get(
                                            artwork_url,
                                            headers=auth_headers,
                                            params=artwork_params,
                                        )

                                        logger.info(
                                            f" TVDB: Series response status: {artwork_response.status_code}"
                                        )
                                        if artwork_response.status_code == 200:
                                            artwork_data = artwork_response.json()
                                            artworks = artwork_data.get("data", {}).get(
                                                "artworks", []
                                            )
                                            logger.info(
                                                f" TVDB: Found {len(artworks)} artworks in series response"
                                            )

                                            for artwork in artworks:
                                                image_url = artwork.get("image")
                                                if (
                                                    image_url
                                                    and image_url not in seen_urls
                                                ):
                                                    seen_urls.add(image_url)
                                                    all_results.append(
                                                        {
                                                            "url": image_url,
                                                            "original_url": image_url,
                                                            "source": "TVDB",
                                                            "source_type": source,  # "provided_id" or "title_search"
                                                            "type": request.asset_type,
                                                            "language": artwork.get(
                                                                "language"
                                                            ),
                                                        }
                                                    )
                                        else:
                                            logger.info(
                                                f" TVDB: Series endpoint returned {artwork_response.status_code}"
                                            )

                logger.info(
                    f" TVDB: Collected {len(all_results)} unique images from {len(tvdb_ids_to_use)} ID(s)"
                )

            except Exception as e:
                logger.error(f"Error fetching TVDB assets: {e}")

            return all_results

        async def fetch_fanart():
            """Fetch Fanart.tv assets asynchronously from all collected IDs

            ID Usage:
            - Movies: TMDB ID + IMDB ID
            - TV Shows: TVDB ID only
            """
            if not fanart_api_key:
                logger.warning("Fanart.tv: No API key configured")
                return []

            # Check if we have any IDs to use
            imdb_id = getattr(request, "imdb_id", None)

            # If we detected a manual IMDB ID entry, use it for Fanart (Movies only!)
            if not imdb_id and potential_imdb_id and request.media_type == "movie":
                imdb_id = potential_imdb_id
                logger.info(f"Using manually entered IMDB ID for Fanart.tv: {imdb_id}")

            if not (tmdb_ids_to_use or tvdb_ids_to_use or imdb_id):
                logger.warning("Fanart.tv: No TMDB, TVDB, or IMDB IDs available")
                return []

            all_results = []
            seen_urls = set()  # Track unique image URLs to avoid duplicates

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    # ========== MOVIES: Use TMDB ID + IMDB ID ==========
                    if request.media_type == "movie":
                        # Try TMDB IDs first
                        if tmdb_ids_to_use:
                            for source, tmdb_id in tmdb_ids_to_use:
                                logger.info(
                                    f" Fanart.tv: Fetching movie artwork for TMDB ID: {tmdb_id} (from {source})"
                                )
                                url = f"https://webservice.fanart.tv/v3/movies/{tmdb_id}?api_key={fanart_api_key}"
                                response = await client.get(url)
                                if response.status_code == 200:
                                    data = response.json()

                                    # Map asset types to fanart.tv keys
                                    if request.asset_type == "poster":
                                        fanart_keys = ["movieposter"]
                                    elif request.asset_type == "background":
                                        fanart_keys = ["moviebackground"]
                                    else:
                                        fanart_keys = []

                                    for key in fanart_keys:
                                        for item in data.get(key, []):
                                            item_url = item.get("url")
                                            if item_url and item_url not in seen_urls:
                                                seen_urls.add(item_url)
                                                all_results.append(
                                                    {
                                                        "url": item_url,
                                                        "original_url": item_url,
                                                        "source": "Fanart.tv",
                                                        "source_type": source,
                                                        "type": request.asset_type,
                                                        "language": item.get("lang"),
                                                        "likes": item.get("likes", 0),
                                                    }
                                                )

                        # Also try IMDB ID if available (Movies only!)
                        if imdb_id:
                            logger.info(
                                f" Fanart.tv: Fetching movie artwork for IMDB ID: {imdb_id} (from database)"
                            )
                            url = f"https://webservice.fanart.tv/v3/movies/{imdb_id}?api_key={fanart_api_key}"
                            response = await client.get(url)
                            if response.status_code == 200:
                                data = response.json()

                                # Map asset types to fanart.tv keys
                                if request.asset_type == "poster":
                                    fanart_keys = ["movieposter"]
                                elif request.asset_type == "background":
                                    fanart_keys = ["moviebackground"]
                                else:
                                    fanart_keys = []

                                for key in fanart_keys:
                                    for item in data.get(key, []):
                                        item_url = item.get("url")
                                        if item_url and item_url not in seen_urls:
                                            seen_urls.add(item_url)
                                            all_results.append(
                                                {
                                                    "url": item_url,
                                                    "original_url": item_url,
                                                    "source": "Fanart.tv",
                                                    "source_type": "imdb_id",
                                                    "type": request.asset_type,
                                                    "language": item.get("lang"),
                                                    "likes": item.get("likes", 0),
                                                }
                                            )

                    # ========== TV SHOWS: Use TVDB ID only ==========
                    elif request.media_type == "tv" and tvdb_ids_to_use:
                        logger.info(
                            f" Fanart.tv: Processing {len(tvdb_ids_to_use)} TVDB IDs for TV show"
                        )
                        for source, tvdb_id in tvdb_ids_to_use:
                            logger.info(
                                f" Fanart.tv: Fetching TV artwork for TVDB ID: {tvdb_id} (from {source})"
                            )
                            url = f"https://webservice.fanart.tv/v3/tv/{tvdb_id}?api_key={fanart_api_key}"
                            response = await client.get(url)
                            logger.info(
                                f" Fanart.tv: Response status: {response.status_code}"
                            )
                            if response.status_code == 200:
                                data = response.json()

                                # Map asset types to fanart.tv keys
                                if request.asset_type == "poster":
                                    # Standard TV show posters
                                    fanart_keys = ["tvposter"]
                                elif request.asset_type == "season":
                                    # Season-specific posters
                                    # Fanart.tv has seasonposter but requires season filtering
                                    fanart_keys = ["seasonposter"]
                                elif request.asset_type == "background":
                                    fanart_keys = ["showbackground"]
                                else:
                                    fanart_keys = []

                                logger.info(
                                    f" Fanart.tv: Looking for keys: {fanart_keys}"
                                )
                                for key in fanart_keys:
                                    items = data.get(key, [])
                                    logger.info(
                                        f" Fanart.tv: Found {len(items)} items for key '{key}'"
                                    )
                                    for item in items:
                                        # For season posters, filter by season number
                                        if (
                                            key == "seasonposter"
                                            and request.season_number
                                        ):
                                            item_season = item.get("season")
                                            # Convert to int for comparison, handle string seasons like "1" or "01"
                                            try:
                                                item_season_num = (
                                                    int(item_season)
                                                    if item_season
                                                    else None
                                                )
                                            except (ValueError, TypeError):
                                                item_season_num = None

                                            if item_season_num != request.season_number:
                                                logger.debug(
                                                    f" Fanart.tv: Skipping season {item_season} poster (looking for season {request.season_number})"
                                                )
                                                continue
                                            else:
                                                logger.info(
                                                    f" Fanart.tv: Found matching season {request.season_number} poster"
                                                )

                                        item_url = item.get("url")
                                        if item_url and item_url not in seen_urls:
                                            seen_urls.add(item_url)
                                            all_results.append(
                                                {
                                                    "url": item_url,
                                                    "original_url": item_url,
                                                    "source": "Fanart.tv",
                                                    "source_type": source,  # "provided_id" or "title_search"
                                                    "type": request.asset_type,
                                                    "language": item.get("lang"),
                                                    "likes": item.get("likes", 0),
                                                }
                                            )
                            else:
                                logger.warning(
                                    f" Fanart.tv: Non-200 response: {response.status_code}"
                                )
                    else:
                        if request.media_type == "tv" and not tvdb_ids_to_use:
                            logger.warning(
                                f" Fanart.tv: TV show requested but no TVDB IDs available"
                            )

                logger.info(f" Fanart.tv: Collected {len(all_results)} unique images")

            except Exception as e:
                logger.error(f"Error fetching Fanart.tv assets: {e}")

            return all_results

        # Fetch from all providers in parallel
        logger.info("Fetching assets from all providers in parallel...")
        tmdb_results, tvdb_results, fanart_results = await asyncio.gather(
            fetch_tmdb(), fetch_tvdb(), fetch_fanart(), return_exceptions=True
        )

        # Handle exceptions from gather
        if isinstance(tmdb_results, Exception):
            logger.error(f"TMDB fetch failed: {tmdb_results}")
            tmdb_results = []
        if isinstance(tvdb_results, Exception):
            logger.error(f"TVDB fetch failed: {tvdb_results}")
            tvdb_results = []
        if isinstance(fanart_results, Exception):
            logger.error(f"Fanart fetch failed: {fanart_results}")
            fanart_results = []

        results["tmdb"] = tmdb_results
        results["tvdb"] = tvdb_results
        results["fanart"] = fanart_results

        # Apply language filtering based on asset type
        logger.info(
            f" Applying language filtering for asset_type: {request.asset_type}"
        )

        if request.asset_type == "season":
            # Filter season posters by PreferredSeasonLanguageOrder
            logger.info(f"   Using season language order: {season_language_order_list}")
            results["tmdb"] = filter_and_sort_by_language(
                results["tmdb"], season_language_order_list
            )
            results["tvdb"] = filter_and_sort_by_language(
                results["tvdb"], season_language_order_list
            )
            results["fanart"] = filter_and_sort_by_language(
                results["fanart"], season_language_order_list
            )
        elif request.asset_type == "background" or request.asset_type == "titlecard":
            # Filter backgrounds and titlecards by PreferredBackgroundLanguageOrder
            logger.info(
                f"   Using background language order: {background_language_order_list}"
            )
            results["tmdb"] = filter_and_sort_by_language(
                results["tmdb"], background_language_order_list
            )
            results["tvdb"] = filter_and_sort_by_language(
                results["tvdb"], background_language_order_list
            )
            results["fanart"] = filter_and_sort_by_language(
                results["fanart"], background_language_order_list
            )
        else:
            # Filter standard posters by PreferredLanguageOrder
            logger.info(f"   Using standard language order: {language_order_list}")
            results["tmdb"] = filter_and_sort_by_language(
                results["tmdb"], language_order_list
            )
            results["tvdb"] = filter_and_sort_by_language(
                results["tvdb"], language_order_list
            )
            results["fanart"] = filter_and_sort_by_language(
                results["fanart"], language_order_list
            )

        # Count total results after filtering
        total_count = sum(len(results[source]) for source in results)

        logger.info(
            f"After language filtering: {total_count} results - "
            f"TMDB={len(results['tmdb'])}, TVDB={len(results['tvdb'])}, Fanart={len(results['fanart'])}"
        )

        return {
            "success": True,
            "results": results,
            "total_count": total_count,
            "detected_provider": detected_provider,  # Let frontend know if a prefix was used
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
        # Check if Posterizarr is currently running
        if RUNNING_FILE.exists():
            logger.warning(
                f"Asset replacement blocked: Posterizarr is currently running"
            )
            raise HTTPException(
                status_code=409,
                detail="Cannot replace assets while Posterizarr is running. Please wait until all processing is completed before using the replace or manual update options.",
            )

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
            # Normalize the path to handle different path separators (Windows/Linux/Docker)
            normalized_path = Path(asset_path)

            # Determine target directory based on process_with_overlays flag
            # If NOT processing with overlays, save to manualassets folder
            if not process_with_overlays:
                target_base_dir = MANUAL_ASSETS_DIR
                logger.info(
                    f"Saving to manual assets directory (no overlay processing)"
                )
            else:
                target_base_dir = ASSETS_DIR
                logger.info(f"Saving to assets directory (with overlay processing)")

            # Handle absolute paths (for assets outside app root)
            if normalized_path.is_absolute():
                full_asset_path = normalized_path.resolve()
                logger.info(f"Using absolute asset path: {full_asset_path}")
            else:
                full_asset_path = (target_base_dir / normalized_path).resolve()
                logger.info(f"Using relative asset path: {full_asset_path}")

            # Security: For relative paths, ensure they don't escape target directory
            if not normalized_path.is_absolute():
                if not str(full_asset_path).startswith(str(target_base_dir.resolve())):
                    logger.error(f"Path traversal attempt detected: {asset_path}")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid asset path - path traversal not allowed",
                    )

            # Log whether this is a new asset or replacement
            if full_asset_path.exists():
                logger.info(f"Replacing existing asset: {full_asset_path}")
            else:
                logger.info(f"Creating new asset: {full_asset_path}")

            logger.info(f"Full asset path: {full_asset_path}")
            logger.info(f"Is Docker: {IS_DOCKER}, Target Dir: {target_base_dir}")

        except (ValueError, OSError) as e:
            logger.error(f"Invalid asset path '{asset_path}': {e}")
            raise HTTPException(status_code=400, detail=f"Invalid asset path: {str(e)}")

        # Ensure parent directory exists with permission check
        try:
            full_asset_path.parent.mkdir(parents=True, exist_ok=True)
            # Test write permissions in parent directory
            test_file = full_asset_path.parent / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError as e:
            logger.error(
                f"No write permission for asset directory: {full_asset_path.parent}"
            )
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for asset directory. On Docker/NAS/Unraid, ensure volume is mounted with write permissions (e.g., /assets:/assets:rw).",
            )
        except OSError as e:
            logger.error(f"OS error accessing asset directory: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Cannot access asset directory: {str(e)}. Check if the path exists and is accessible.",
            )

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

        # Validate image aspect ratio instead of dimensions
        try:
            from PIL import Image
            import io

            img = Image.open(io.BytesIO(contents))
            width, height = img.size
            logger.info(f"Manual upload image dimensions: {width}x{height} pixels")

            # Determine asset type from path/filename
            asset_path_lower = asset_path.lower()
            is_poster = (
                "poster" in asset_path_lower
                or asset_path_lower.endswith((".jpg", ".png"))
                and "background" not in asset_path_lower
                and "titlecard" not in asset_path_lower
                and not re.search(r"s\d+e\d+", asset_path_lower, re.IGNORECASE)
            )
            is_background = "background" in asset_path_lower
            is_titlecard = "titlecard" in asset_path_lower or re.search(
                r"s\d+e\d+", asset_path_lower, re.IGNORECASE
            )
            is_season = (
                re.search(r"season\s*\d+", asset_path_lower, re.IGNORECASE)
                and not is_titlecard
            )

            # Check for zero height
            if height == 0:
                error_msg = "Image height cannot be zero."
                logger.error(error_msg)
                raise HTTPException(status_code=400, detail=error_msg)

            # Calculate ratio
            ratio = width / height
            logger.info(f"Image aspect ratio: {ratio:.3f}")

            # Define expected ratios
            POSTER_RATIO = 2 / 3  # ≈ 0.667
            BG_TC_RATIO = 16 / 9  # ≈ 1.778
            TOLERANCE = 0.05  # ±5% tolerance

            def ratio_within_tolerance(actual, expected, tolerance):
                return abs(actual - expected) / expected <= tolerance

            # Validate based on type
            if is_poster or is_season:
                if not ratio_within_tolerance(ratio, POSTER_RATIO, TOLERANCE):
                    error_msg = (
                        f"Invalid aspect ratio ({ratio:.3f}). Expected approximately 2:3 "
                        f"({POSTER_RATIO:.3f} ± {TOLERANCE*100:.0f}%)."
                    )
                    logger.error(error_msg)
                    raise HTTPException(status_code=400, detail=error_msg)

            elif is_background or is_titlecard:
                if not ratio_within_tolerance(ratio, BG_TC_RATIO, TOLERANCE):
                    error_msg = (
                        f"Invalid aspect ratio ({ratio:.3f}). Expected approximately 16:9 "
                        f"({BG_TC_RATIO:.3f} ± {TOLERANCE*100:.0f}%)."
                    )
                    logger.error(error_msg)
                    raise HTTPException(status_code=400, detail=error_msg)

        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not validate image ratio: {e}")
            # Don't fail upload if dimension check itself fails, just log it

        # Check if asset exists in alternate location (for moving between folders)
        alternate_base_dir = (
            ASSETS_DIR if not process_with_overlays else MANUAL_ASSETS_DIR
        )
        alternate_asset_path = alternate_base_dir / normalized_path
        asset_exists_in_alternate = alternate_asset_path.exists()

        # Track if this is a replacement or new asset in target location
        is_replacement = full_asset_path.exists()

        # Create backup of original if replacing in target location
        if is_replacement:
            try:
                backup_path = full_asset_path.with_suffix(
                    full_asset_path.suffix + ".backup"
                )
                if not backup_path.exists():
                    import shutil

                    shutil.copy2(full_asset_path, backup_path)
                    logger.info(f"Created backup: {backup_path}")
            except Exception as e:
                logger.warning(f"Failed to create backup (continuing anyway): {e}")

        # Delete old asset from alternate location if moving between folders
        if asset_exists_in_alternate and not is_replacement:
            try:
                logger.info(
                    f"Deleting old asset from alternate location: {alternate_asset_path}"
                )
                alternate_asset_path.unlink()
                # Also delete backup if exists
                alternate_backup = alternate_asset_path.with_suffix(
                    alternate_asset_path.suffix + ".backup"
                )
                if alternate_backup.exists():
                    alternate_backup.unlink()
                    logger.info(f"Deleted old backup: {alternate_backup}")
            except Exception as e:
                logger.warning(
                    f"Could not delete old asset from alternate location: {e}"
                )

        # Save new image
        try:
            with open(full_asset_path, "wb") as f:
                f.write(contents)

            # Verify file was written correctly
            if not full_asset_path.exists():
                raise HTTPException(
                    status_code=500, detail="File was not saved successfully"
                )

            actual_size = full_asset_path.stat().st_size
            if actual_size != len(contents):
                logger.error(
                    f"File size mismatch: expected {len(contents)}, got {actual_size}"
                )
                raise HTTPException(
                    status_code=500, detail="File was not saved completely"
                )

            action = "Replaced" if is_replacement else "Created"
            logger.info(
                f"{action} asset: {asset_path} (size: {len(contents)} bytes, target: {target_base_dir.name})"
            )
        except PermissionError as e:
            logger.error(f"Permission denied writing to {full_asset_path}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Permission denied: Unable to write to file. On Docker/NAS/Unraid, check that user has write permissions (uid/gid mapping).",
            )
        except OSError as e:
            logger.error(f"OS error writing to {full_asset_path}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"File system error: {str(e)}. Check disk space, mount points, and file system health (especially on NAS/RAID systems).",
            )
        except Exception as e:
            logger.error(f"Unexpected error writing file: {e}")
            import traceback

            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

        result = {
            "success": True,
            "message": f"Asset {'replaced' if is_replacement else 'created'} successfully",
            "path": asset_path,
            "size": len(contents),
            "was_replacement": is_replacement,
        }

        # If process_with_overlays is enabled, trigger Manual Run
        if process_with_overlays:
            logger.info(f"Processing with overlays enabled for: {asset_path}")

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
                        f"Starting Manual Run for overlay processing: {' '.join(command)}"
                    )

                    # Start the Manual Run process
                    global current_process, current_mode, current_start_time
                    current_process = subprocess.Popen(
                        command,
                        cwd=str(BASE_DIR),
                        stdout=None,
                        stderr=None,
                        text=True,
                    )
                    current_mode = "manual"
                    current_start_time = datetime.now().isoformat()

                    logger.info(
                        f"Manual Run started (PID: {current_process.pid}) for overlay processing"
                    )

                    result["manual_run_triggered"] = True
                    result["message"] = (
                        "Asset replaced and queued for overlay processing"
                    )

                else:
                    logger.warning(
                        f"Invalid path structure for overlay processing: {asset_path}"
                    )
                    result["manual_run_triggered"] = False
                    result["message"] = (
                        "Asset replaced but overlay processing skipped (invalid path structure)"
                    )

            except Exception as e:
                logger.error(f"Error triggering Manual Run: {e}")
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


def delete_db_entries_for_asset(asset_path: str):
    """
    Delete database entries for a given asset path.
    Matches entries based on Rootfolder, Type, and filename pattern.

    Args:
        asset_path: Path to the asset (e.g., "TestSerien/Show Name (2020)/Season02.jpg")
    """
    if not DATABASE_AVAILABLE or db is None:
        logger.debug("Database not available, skipping DB entry deletion")
        return

    try:
        # Parse the asset path to extract metadata
        # Normalize path separators to forward slashes
        normalized_path = asset_path.replace("\\", "/")
        path_parts = normalized_path.split("/")

        if len(path_parts) < 2:
            logger.warning(f"Asset path too short to extract metadata: {asset_path}")
            return

        # Extract folder name and filename
        folder_name = path_parts[1] if len(path_parts) > 1 else ""
        filename = path_parts[-1] if len(path_parts) > 0 else ""

        # Determine asset type from filename
        # Note: Database uses different type names than our internal naming
        # Database types: "Movie", "Movie Background", "Show", "Show Background", "Season", "Episode"
        is_background = "background" in filename.lower()
        is_season = re.match(r"^Season(\d+)\.jpg$", filename, re.IGNORECASE)
        is_episode = re.match(r"^S(\d+)E(\d+)\.jpg$", filename, re.IGNORECASE)

        # Determine the database Type values to search for
        # For posters/backgrounds, we need to check both Movie and Show types
        search_types = []
        if is_season:
            search_types = ["Season"]
        elif is_episode:
            search_types = ["Episode"]
        elif is_background:
            search_types = ["Movie Background", "Show Background"]
        else:
            # Regular poster - could be Movie or Show or Poster
            search_types = ["Movie", "Show", "Poster"]

        cursor = db.connection.cursor()

        # Collect all matching entries across all possible type names
        all_entries = []

        logger.debug(
            f"Searching for DB entries: folder={folder_name}, types={search_types}, is_episode={bool(is_episode)}, is_season={bool(is_season)}"
        )

        for db_type in search_types:
            if is_season:
                # For seasons, find entries with matching season number in title
                season_num = is_season.group(1)
                cursor.execute(
                    """SELECT id, Title, Type FROM imagechoices 
                       WHERE Rootfolder = ? AND Type = ? 
                       AND (Title LIKE ? OR Title LIKE ? OR Title LIKE ?)""",
                    (
                        folder_name,
                        db_type,
                        f"%Season{season_num}%",
                        f"%Season {season_num}%",
                        f"%Season0{season_num}%",
                    ),
                )
            elif is_episode:
                # For episodes, find entries with matching episode pattern in title
                season_num = is_episode.group(1)
                episode_num = is_episode.group(2)
                pattern1 = f"%S{season_num}E{episode_num}%"
                pattern2 = f"%S0{season_num}E0{episode_num}%"
                logger.debug(
                    f"Episode search: folder={folder_name}, type={db_type}, patterns={pattern1}, {pattern2}"
                )
                cursor.execute(
                    """SELECT id, Title, Type FROM imagechoices 
                       WHERE Rootfolder = ? AND Type = ? 
                       AND (Title LIKE ? OR Title LIKE ?)""",
                    (folder_name, db_type, pattern1, pattern2),
                )
            else:
                # For poster/background, match on Rootfolder + Type only
                cursor.execute(
                    "SELECT id, Title, Type FROM imagechoices WHERE Rootfolder = ? AND Type = ?",
                    (folder_name, db_type),
                )

            # Fetch and extend results for this type
            found = cursor.fetchall()
            logger.debug(f"Found {len(found)} entries for type {db_type}")
            all_entries.extend(found)

        if all_entries:
            for entry in all_entries:
                record_id = entry["id"]
                title = entry["Title"]
                entry_type = entry["Type"]
                db.delete_choice(record_id)
                logger.info(
                    f"Deleted DB entry #{record_id} for deleted asset: {title} ({entry_type})"
                )
        else:
            logger.debug(
                f"No DB entries found for deleted asset: {filename} in {folder_name}"
            )

    except Exception as e:
        logger.error(f"Error deleting database entries for asset {asset_path}: {e}")
        import traceback

        logger.error(traceback.format_exc())


async def update_asset_db_entry_as_manual(
    asset_path: str,
    image_url: str,
    library_name: Optional[str] = None,
    folder_name: Optional[str] = None,
    title_text: Optional[str] = None,
):
    """
    Delete existing database entries for a manually replaced asset.
    The new entry will be created by the CSV import after the Posterizarr script completes.
    This prevents duplicate entries with different title formats.

    Args:
        asset_path: Path to the asset (e.g., "4K/Movie Name (2024)/poster.jpg")
        image_url: URL where the image was downloaded from
        library_name: Optional library name override
        folder_name: Optional folder name override
        title_text: Optional title text override
    """
    if not DATABASE_AVAILABLE or db is None:
        logger.warning(
            "Database not available, skipping DB entry for manual replacement"
        )
        return

    try:
        # Parse asset path to extract metadata
        path_parts = Path(asset_path).parts

        if len(path_parts) < 2:
            logger.warning(f"Asset path too short to extract metadata: {asset_path}")
            return

        # Extract library name (first part of path)
        extracted_library_name = path_parts[0] if len(path_parts) > 0 else ""
        # Extract folder name (second part of path)
        extracted_folder_name = path_parts[1] if len(path_parts) > 1 else ""
        # Extract filename
        filename = path_parts[-1] if len(path_parts) > 0 else ""

        # Use provided values or fall back to extracted values
        final_library_name = library_name or extracted_library_name
        final_folder_name = folder_name or extracted_folder_name

        # Extract title from folder name if not provided
        # Remove year and ID tags like (2024) {tmdb-12345}
        if not title_text:
            # Match patterns like "Movie Name (2024) {tmdb-12345}"
            title_match = re.match(r"^(.+?)\s*\(\d{4}\)", final_folder_name)
            if title_match:
                title_text = title_match.group(1).strip()
            else:
                # Fallback: use folder name as-is
                title_text = final_folder_name

        # Determine asset type from filename
        # Match database Type column values: "Show", "Movie", "Show Background", "Movie Background", "Season", "Episode"
        asset_type = "Poster"  # Default, will be refined below

        if "background" in filename.lower():
            # Could be "Show Background" or "Movie Background"
            asset_type = "Background"
        elif re.match(r"^Season\d+\.jpg$", filename, re.IGNORECASE):
            asset_type = "Season"
        elif re.match(r"^S\d+E\d+\.jpg$", filename, re.IGNORECASE):
            asset_type = "Episode"
        # For poster.jpg files, asset_type remains "Poster"
        # We'll match both "Show" and "Movie" types in the query

        # Delete any existing database entries for this specific asset
        # This prevents duplicates - the CSV import will create the new entry after the script finishes
        # We need to match more specifically to avoid deleting unrelated assets:
        # - For seasons: match on Rootfolder + Type + season number in Title
        # - For episodes: match on Rootfolder + Type + episode pattern in Title
        # - For poster/background: match on Rootfolder + Type

        cursor = db.connection.cursor()

        # Extract season/episode info from filename for more specific matching
        season_match = re.match(r"^Season(\d+)\.jpg$", filename, re.IGNORECASE)
        episode_match = re.match(r"^S(\d+)E(\d+)\.jpg$", filename, re.IGNORECASE)

        if season_match:
            # For seasons, find entries with matching season number in title
            season_num = season_match.group(1)
            # Also try without leading zero
            season_num_int = str(int(season_num))
            logger.info(
                f"Searching for Season: folder='{final_folder_name}', season_num='{season_num}', season_num_int='{season_num_int}'"
            )
            cursor.execute(
                """SELECT id, Title, Type FROM imagechoices 
                   WHERE Rootfolder = ? AND Type = ? 
                   AND (Title LIKE ? OR Title LIKE ? OR Title LIKE ? OR Title LIKE ?)""",
                (
                    final_folder_name,
                    asset_type,
                    f"%Season{season_num}%",
                    f"%Season {season_num}%",
                    f"%Season {season_num_int}%",
                    f"%Season{season_num_int}%",
                ),
            )
        elif episode_match:
            # For episodes, find entries with matching episode pattern in title
            season_num = episode_match.group(1)
            episode_num = episode_match.group(2)
            cursor.execute(
                """SELECT id, Title FROM imagechoices 
                   WHERE Rootfolder = ? AND Type = ? 
                   AND (Title LIKE ? OR Title LIKE ?)""",
                (
                    final_folder_name,
                    asset_type,
                    f"%S{season_num}E{episode_num}%",
                    f"%S0{season_num}E0{episode_num}%",
                ),
            )
        else:
            # For poster/background, match on Rootfolder + Type
            # For posters, match both "Show" and "Movie" types
            # For backgrounds, match both "Show Background" and "Movie Background" types
            if asset_type == "Poster":
                cursor.execute(
                    "SELECT id, Title, Type FROM imagechoices WHERE Rootfolder = ? AND Type IN ('Show', 'Movie')",
                    (final_folder_name,),
                )
            elif asset_type == "Background":
                cursor.execute(
                    "SELECT id, Title, Type FROM imagechoices WHERE Rootfolder = ? AND Type IN ('Show Background', 'Movie Background')",
                    (final_folder_name,),
                )
            else:
                cursor.execute(
                    "SELECT id, Title, Type FROM imagechoices WHERE Rootfolder = ? AND Type = ?",
                    (final_folder_name, asset_type),
                )

        existing_entries = cursor.fetchall()

        if existing_entries:
            for entry in existing_entries:
                record_id = entry["id"]
                old_title = entry["Title"]
                # sqlite3.Row objects use dictionary-style access, not .get()
                entry_type = entry["Type"] if "Type" in entry.keys() else asset_type
                db.delete_choice(record_id)
                logger.info(
                    f"Deleted DB entry #{record_id} for manual replacement: {old_title} ({entry_type})"
                )
            logger.info(
                f"New entry will be created by CSV import after script completes"
            )
        else:
            logger.info(
                f"No existing DB entries found for: {filename} in {final_folder_name}"
            )
            logger.info(
                f"New entry will be created by CSV import after script completes"
            )

    except Exception as e:
        logger.error(f"Error updating database entry for manual replacement: {e}")
        import traceback

        logger.error(traceback.format_exc())


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
        # Check if Posterizarr is currently running
        if RUNNING_FILE.exists():
            logger.warning(
                f"Asset replacement blocked: Posterizarr is currently running"
            )
            raise HTTPException(
                status_code=409,
                detail="Cannot replace assets while Posterizarr is running. Please wait until all processing is completed before using the replace or manual update options.",
            )

        # Validate asset path exists
        # Determine target directory based on process_with_overlays flag
        if not process_with_overlays:
            target_base_dir = MANUAL_ASSETS_DIR
            logger.info(f"Saving to manual assets directory (no overlay processing)")
        else:
            target_base_dir = ASSETS_DIR
            logger.info(f"Saving to assets directory (with overlay processing)")

        full_asset_path = target_base_dir / asset_path

        # Check if asset exists in either location (for replacement)
        # First check target location, then check alternate location
        asset_exists_in_target = full_asset_path.exists()

        # Also check the alternate location (in case user is moving between folders)
        alternate_base_dir = (
            ASSETS_DIR if not process_with_overlays else MANUAL_ASSETS_DIR
        )
        alternate_asset_path = alternate_base_dir / asset_path
        asset_exists_in_alternate = alternate_asset_path.exists()

        if not asset_exists_in_target and not asset_exists_in_alternate:
            logger.warning(
                f"Asset not found in either location, will create new: {asset_path}"
            )
            # Don't fail - just create new asset

        # Download image from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400, detail="Failed to download image from URL"
                )

            contents = response.content

        # Ensure target directory exists
        full_asset_path.parent.mkdir(parents=True, exist_ok=True)

        # Create backup of original if it exists in target location
        if asset_exists_in_target:
            backup_path = full_asset_path.with_suffix(
                full_asset_path.suffix + ".backup"
            )
            if not backup_path.exists():
                import shutil

                shutil.copy2(full_asset_path, backup_path)
                logger.info(f"Created backup: {backup_path}")

        # Delete old asset from alternate location if moving between folders
        if asset_exists_in_alternate and not asset_exists_in_target:
            try:
                logger.info(
                    f"Deleting old asset from alternate location: {alternate_asset_path}"
                )
                alternate_asset_path.unlink()
                # Also delete backup if exists
                alternate_backup = alternate_asset_path.with_suffix(
                    alternate_asset_path.suffix + ".backup"
                )
                if alternate_backup.exists():
                    alternate_backup.unlink()
                    logger.info(f"Deleted old backup: {alternate_backup}")
            except Exception as e:
                logger.warning(
                    f"Could not delete old asset from alternate location: {e}"
                )

        # Save new image
        with open(full_asset_path, "wb") as f:
            f.write(contents)

        logger.info(
            f"Replaced asset from URL: {asset_path} (size: {len(contents)} bytes, target: {target_base_dir.name})"
        )

        # Add/Update database entry for this replaced asset (mark as Manual)
        try:
            await update_asset_db_entry_as_manual(
                asset_path, image_url, library_name, folder_name, title_text
            )
        except Exception as e:
            logger.warning(f"Could not update database entry for replaced asset: {e}")

        result = {
            "success": True,
            "message": "Asset replaced successfully",
            "path": asset_path,
            "size": len(contents),
        }

        # If process_with_overlays is enabled, trigger Manual Run
        if process_with_overlays:
            logger.info(f"Processing with overlays enabled for: {asset_path}")

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
                            # Use provided season_number as-is (user controls the text)
                            # If not provided, fall back to extracted season number only
                            season_poster_name = (
                                season_number if season_number else extracted_season
                            )
                        elif season_number:
                            # Use whatever the user provided as-is
                            season_poster_name = season_number
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
                        f"Manual Run params - Library: {final_library_name}, Folder: {final_folder_name}, Type: {poster_type}, Title: {final_title_text}"
                    )
                    if season_poster_name:
                        logger.info(f"Season: {season_poster_name}")
                    if ep_number and ep_title_name:
                        logger.info(f"Episode: {ep_number} - {ep_title_name}")

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
                    logger.info(f"Manual Run triggered successfully for {asset_path}")
                else:
                    logger.warning(
                        f"Cannot extract library/folder from path: {asset_path}"
                    )
                    result["manual_run_triggered"] = False
                    result["message"] = (
                        "Asset replaced but overlay processing skipped (invalid path structure)"
                    )

            except Exception as e:
                logger.error(f"Failed to trigger Manual Run: {e}")
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
    global current_process, current_mode, current_start_time

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

    logger.info(f"Starting Manual Run: {' '.join(command)}")

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
    current_start_time = datetime.now().isoformat()

    logger.info(f"Manual Run process started (PID: {current_process.pid})")


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
    Categories: Missing Assets, Non-Primary Lang, Non-Primary Provider, Truncated Text, Total with Issues, Resolved
    Note: Manual entries are categorized separately as "Resolved"
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
        missing_assets_fav_provider = []
        non_primary_lang = []
        non_primary_provider = []
        truncated_text = []
        assets_with_issues = []
        resolved_assets = []  # New category for Manual=true items

        # Categorize each record
        for record in records:
            record_dict = dict(record)

            # Check if this is a Manual entry (resolved)
            # Manual can be "Yes" (new), "true" (legacy), or True (boolean)
            manual_value = str(record_dict.get("Manual", "")).lower()
            if manual_value == "yes" or manual_value == "true":
                resolved_assets.append(record_dict)
                continue  # Skip issue categorization for resolved items

            has_issue = False

            # Missing Assets: DownloadSource == "false" (string) or False (boolean) or empty
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

            # Category 1: Missing Asset (DownloadSource is missing)
            if is_download_missing:
                missing_assets.append(record_dict)
                has_issue = True

            # Category 2: Missing Asset at Favorite Provider (FavProviderLink is missing)
            if is_provider_link_missing:
                missing_assets_fav_provider.append(record_dict)
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
                "missing_assets_fav_provider": {
                    "count": len(missing_assets_fav_provider),
                    "assets": missing_assets_fav_provider,
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
                "resolved": {
                    "count": len(resolved_assets),
                    "assets": resolved_assets,
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
        title = record_dict.get("Title") or ""  # Title contains season/episode info

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
        import re

        if "background" in asset_type:
            pattern = "background.*"
        elif "season" in asset_type:
            # For seasons, extract the season number from the Title field
            # Title format: "Show Name | Season04" or "Show Name | Season05"
            season_match = re.search(r"season\s*(\d+)", title, re.IGNORECASE)
            if season_match:
                season_num = season_match.group(1).zfill(2)  # Ensure 2 digits
                pattern = f"Season{season_num}.*"
                logger.info(f"Season pattern extracted from title '{title}': {pattern}")
            else:
                # Fallback to generic pattern
                pattern = "Season*.*"
                logger.warning(
                    f"Could not extract season number from title '{title}', using generic pattern"
                )
        elif "titlecard" in asset_type or "episode" in asset_type:
            # For titlecards, extract episode code from Title
            # Title format: "S04E01 | Episode Title"
            episode_match = re.search(r"(S\d+E\d+)", title, re.IGNORECASE)
            if episode_match:
                episode_code = episode_match.group(1).upper()
                pattern = f"{episode_code}.*"
                logger.info(
                    f"Episode pattern extracted from title '{title}': {pattern}"
                )
            else:
                pattern = "S[0-9][0-9]E[0-9][0-9].*"
                logger.warning(
                    f"Could not extract episode code from title '{title}', using generic pattern"
                )
        else:
            pattern = "poster.*"

        # Find matching files
        import glob

        matching_files = list(folder_path.glob(pattern))

        if not matching_files:
            logger.error(
                f"No matching asset found in {library}/{rootfolder} with pattern '{pattern}'"
            )
            raise HTTPException(
                status_code=404,
                detail=f"No matching asset found in {library}/{rootfolder} with pattern {pattern}",
            )

        # Return the first match (in Gallery-compatible format)
        asset_file = matching_files[0]
        logger.info(
            f"Found asset file for record {record_id}: {asset_file.name} (pattern: {pattern}, from title: '{title}')"
        )
        relative_path = asset_file.relative_to(ASSETS_DIR)
        path_str = str(relative_path).replace("\\", "/")
        # URL encode the path to handle special characters like #
        encoded_path_str = quote(path_str, safe="/")

        return {
            "success": True,
            "asset": {
                "name": asset_file.name,
                "path": path_str,
                "url": f"/poster_assets/{encoded_path_str}",
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

if MANUAL_ASSETS_DIR.exists():
    app.mount(
        "/manual_poster_assets",
        CachedStaticFiles(directory=str(MANUAL_ASSETS_DIR), max_age=86400),  # 24h Cache
        name="manual_poster_assets",
    )
    logger.info(
        f"Mounted /manual_poster_assets -> {MANUAL_ASSETS_DIR} (with 24h cache)"
    )

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
        raise exc

    # Return index.html for all other 404s (client-side routes)
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    # If index.html doesn't exist, return the original 404
    raise exc


# ============================================================================


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
