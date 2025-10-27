"""Global application state management"""

import subprocess
from typing import Optional
import time

# Process state
current_process: Optional[subprocess.Popen] = None
current_mode: Optional[str] = None
current_start_time: Optional[str] = None

# Module instances (set during lifespan startup)
scheduler: Optional[object] = None  # PosterizarrScheduler
db: Optional[object] = None  # ImageChoicesDB
config_db: Optional[object] = None  # ConfigDB
runtime_db: Optional[object] = None

# Feature flags (set during module loading)
CONFIG_MAPPER_AVAILABLE = False
SCHEDULER_AVAILABLE = False
AUTH_MIDDLEWARE_AVAILABLE = False
DATABASE_AVAILABLE = False
CONFIG_DATABASE_AVAILABLE = False
RUNTIME_DB_AVAILABLE = False

# Cache state
cache_refresh_task = None
cache_refresh_running = False
cache_scan_in_progress = False

# Asset cache
asset_cache = {
    "last_scanned": 0,
    "posters": [],
    "backgrounds": [],
    "seasons": [],
    "titlecards": [],
    "folders": [],
}

# Logging state
queue_listener = None


def get_process_state():
    """Get current process state"""
    return {
        "process": current_process,
        "mode": current_mode,
        "start_time": current_start_time,
    }


def set_process_state(process, mode, start_time):
    """Set current process state"""
    global current_process, current_mode, current_start_time
    current_process = process
    current_mode = mode
    current_start_time = start_time


def clear_process_state():
    """Clear current process state"""
    global current_process, current_mode, current_start_time
    current_process = None
    current_mode = None
    current_start_time = None
