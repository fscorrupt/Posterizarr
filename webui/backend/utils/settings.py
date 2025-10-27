"""WebUI Settings Management"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


def load_webui_settings(settings_path: Path):
    """Load WebUI settings from JSON file"""
    default_settings = {
        "log_level": "WARNING",
        "theme": "dark",
        "auto_refresh_interval": 180,
    }

    try:
        if settings_path.exists():
            with open(settings_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
                return {**default_settings, **settings}
    except Exception as e:
        pass  # Silent - no console output

    return default_settings


def save_webui_settings(settings: dict, settings_path: Path):
    """Save WebUI settings to JSON file"""
    try:
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        pass  # Silent - no console output
        return False


def load_log_level_config(settings_path: Path):
    """Load log level from webui_settings.json or environment variable"""
    try:
        if settings_path.exists():
            with open(settings_path, "r", encoding="utf-8") as f:
                config = json.load(f)
                level = config.get("log_level", "").upper()
                if level:
                    return level
    except Exception as e:
        pass  # Silent - no console output

    # Fallback to environment variable or default
    env_level = os.getenv("WEBUI_LOG_LEVEL", "INFO").upper()
    return env_level


def save_log_level_config(level: str, settings_path: Path):
    """DEPRECATED: Use save_webui_settings instead. Kept for backward compatibility."""
    try:
        settings = load_webui_settings(settings_path)
        settings["log_level"] = level.upper()
        return save_webui_settings(settings, settings_path)
    except Exception as e:
        pass  # Silent - no console output
        return False


def initialize_webui_settings(settings_path: Path):
    """Initialize webui_settings.json with default values if it doesn't exist"""
    if not settings_path.exists():
        default_settings = {
            "log_level": "WARNING",
            "theme": "dark",
            "auto_refresh_interval": 180,
        }
        try:
            settings_path.parent.mkdir(parents=True, exist_ok=True)
            with open(settings_path, "w", encoding="utf-8") as f:
                json.dump(default_settings, f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass  # Silent - no console output
