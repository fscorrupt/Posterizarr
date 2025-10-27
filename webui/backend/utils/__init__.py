"""Utils package initialization"""

from .constants import *
from .file_utils import (
    is_poster_file,
    is_background_file,
    is_season_file,
    is_titlecard_file,
    process_image_path,
)

__all__ = [
    # Constants
    "IS_DOCKER",
    "BASE_DIR",
    "APP_DIR",
    "ASSETS_DIR",
    "MANUAL_ASSETS_DIR",
    "IMAGES_DIR",
    "FRONTEND_DIR",
    "CONFIG_PATH",
    "SCRIPT_PATH",
    "LOGS_DIR",
    "UI_LOGS_DIR",
    "DATABASE_DIR",
    "RUNNING_FILE",
    # File utils
    "is_poster_file",
    "is_background_file",
    "is_season_file",
    "is_titlecard_file",
    "process_image_path",
]
