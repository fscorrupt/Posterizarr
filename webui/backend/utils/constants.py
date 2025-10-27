"""Application constants and configuration paths"""

import os
import sys
from pathlib import Path
import logging

# Check if running in Docker
IS_DOCKER = (
    os.path.exists("/.dockerenv")
    or os.environ.get("DOCKER_ENV", "").lower() == "true"
    or os.environ.get("POSTERIZARR_NON_ROOT", "").lower() == "true"
)

port = int(os.environ.get("APP_PORT", 8000))

# Directory Configuration
if IS_DOCKER:
    BASE_DIR = Path("/config")
    APP_DIR = Path("/app")
    ASSETS_DIR = Path("/assets")
    MANUAL_ASSETS_DIR = Path("/manualassets")
    IMAGES_DIR = Path("/app/images")
    FRONTEND_DIR = Path("/app/frontend/dist")
else:
    # Local: webui/backend/main.py -> project root (3 levels up)
    PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
    BASE_DIR = PROJECT_ROOT
    APP_DIR = PROJECT_ROOT
    ASSETS_DIR = PROJECT_ROOT / "assets"
    MANUAL_ASSETS_DIR = PROJECT_ROOT / "manualassets"
    IMAGES_DIR = PROJECT_ROOT / "images"
    FRONTEND_DIR = PROJECT_ROOT / "webui" / "frontend" / "dist"
    ASSETS_DIR.mkdir(exist_ok=True)
    MANUAL_ASSETS_DIR.mkdir(exist_ok=True)

# Subdirectories
SUBDIRS_TO_CREATE = [
    "Logs",
    "temp",
    "test",
    "UILogs",
    "uploads",
    "fontpreviews",
    "database",
]

# Creating all directories with error handling
for subdir in SUBDIRS_TO_CREATE:
    try:
        subdir_path = BASE_DIR / subdir
        subdir_path.mkdir(parents=True, exist_ok=True)
        # Test write permissions
        test_file = subdir_path / ".write_test"
        test_file.touch()
        test_file.unlink()
    except PermissionError:
        pass  # Silent
    except Exception:
        pass  # Silent

# File Paths
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
WEBUI_SETTINGS_PATH = UI_LOGS_DIR / "webui_settings.json"

# Logging Configuration
LOG_LEVEL_MAP = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}

# Cache Configuration
CACHE_TTL_SECONDS = 180  # Cache data for 3 minutes (only for statistics)
CACHE_REFRESH_INTERVAL = 180  # Refresh cache every 3 minutes

# Feature Flags (set during initialization)
CONFIG_MAPPER_AVAILABLE = False
SCHEDULER_AVAILABLE = False
AUTH_MIDDLEWARE_AVAILABLE = False
DATABASE_AVAILABLE = False
CONFIG_DATABASE_AVAILABLE = False
RUNTIME_DB_AVAILABLE = False
