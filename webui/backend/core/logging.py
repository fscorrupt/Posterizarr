"""
Logging setup for Posterizarr Backend
"""
import logging
import glob
import os
from pathlib import Path
from .config import UI_LOGS_DIR


def setup_logging():
    """Setup main backend logging"""
    # Clear UILogs on startup - remove all log files
    for log_file in glob.glob(str(UI_LOGS_DIR / "*.log")):
        try:
            os.remove(log_file)
        except Exception:
            pass  # Ignore errors during cleanup

    logging.basicConfig(
        level=logging.INFO,
        filename=UI_LOGS_DIR / "BackendServer.log",
        filemode="w",  # Overwrite the log file on each startup
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.INFO)
    
    return logging.getLogger(__name__)


def setup_backend_ui_logger():
    """Setup backend logger to also write to FrontendUI.log"""
    try:
        UI_LOGS_DIR.mkdir(exist_ok=True)

        # CLEANUP: Delete old log files on startup
        backend_log_path = UI_LOGS_DIR / "FrontendUI.log"
        if backend_log_path.exists():
            backend_log_path.unlink()

        # Create File Handler for FrontendUI.log
        backend_ui_handler = logging.FileHandler(
            backend_log_path, encoding="utf-8", mode="w"
        )
        backend_ui_handler.setLevel(logging.DEBUG)
        backend_ui_handler.setFormatter(
            logging.Formatter(
                "[%(asctime)s] [%(levelname)-8s] |BACKEND| %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )

        # Add handler to root logger
        logging.getLogger().addHandler(backend_ui_handler)
        
        return backend_ui_handler
    except Exception as e:
        logging.error(f"Failed to setup backend UI logger: {e}")
        return None
