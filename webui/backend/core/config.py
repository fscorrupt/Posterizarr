"""
Core configuration and path management for Posterizarr Backend
"""
import os
import sys
from pathlib import Path

# Check if running in Docker
IS_DOCKER = (
    os.path.exists("/.dockerenv")
    or os.environ.get("DOCKER_ENV", "").lower() == "true"
    or os.environ.get("POSTERIZARR_NON_ROOT", "").lower() == "true"
)

# Path Configuration
if IS_DOCKER:
    BASE_DIR = Path("/config")
    APP_DIR = Path("/app")
    ASSETS_DIR = Path("/assets")
    IMAGES_DIR = Path("/app/images")
    FRONTEND_DIR = Path("/app/frontend/dist")
else:
    # Local: webui/backend/main.py -> project root (3 levels up)
    PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
    BASE_DIR = PROJECT_ROOT
    APP_DIR = PROJECT_ROOT
    ASSETS_DIR = PROJECT_ROOT / "assets"
    IMAGES_DIR = PROJECT_ROOT / "images"
    FRONTEND_DIR = PROJECT_ROOT / "webui" / "frontend" / "dist"
    ASSETS_DIR.mkdir(exist_ok=True)

# Subdirectories to create
SUBDIRS_TO_CREATE = [
    "Logs",
    "temp",
    "test",
    "UILogs",
    "uploads",
    "fontpreviews",
    "database",
]

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

# Fallback to example config if needed
if not CONFIG_PATH.exists() and CONFIG_EXAMPLE_PATH.exists():
    CONFIG_PATH = CONFIG_EXAMPLE_PATH


def ensure_directories():
    """Create all required directories with error handling"""
    for subdir in SUBDIRS_TO_CREATE:
        try:
            subdir_path = BASE_DIR / subdir
            subdir_path.mkdir(parents=True, exist_ok=True)
            # Test write permissions
            test_file = subdir_path / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError as e:
            print(f"WARNING: No write permission for {subdir}: {e}", file=sys.stderr)
        except Exception as e:
            print(
                f"WARNING: Could not create directory {subdir}: {e}", file=sys.stderr
            )

    # Create special directories
    OVERLAYFILES_DIR.mkdir(exist_ok=True)
    UPLOADS_DIR.mkdir(exist_ok=True)
