"""
Logs Directory Watcher for Background Processes

Monitors the Logs directory for changes to files created by background watcher processes
(Tautulli, Sonarr, Radarr) and automatically imports them to databases.

Features:
- Watches for ImageChoices.csv modifications
- Watches for runtime JSON files (tautulli.json, arr.json, etc.)
- Debounces file changes to avoid duplicate imports
- Thread-safe background monitoring
"""

import logging
import time
import threading
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent

logger = logging.getLogger(__name__)


class LogsWatcher:
    """
    File system watcher for the Logs directory
    Monitors for changes and triggers database imports
    """

    def __init__(
        self,
        logs_dir: Path,
        db_instance=None,
        runtime_db_instance=None,
        import_callback=None,
        runtime_callback=None,
    ):
        """
        Initialize the logs watcher

        Args:
            logs_dir: Path to the Logs directory to watch
            db_instance: ImageChoices database instance
            runtime_db_instance: Runtime database instance
            import_callback: Function to call for ImageChoices.csv imports
            runtime_callback: Function to call for runtime JSON imports
        """
        self.logs_dir = Path(logs_dir)
        self.db = db_instance
        self.runtime_db = runtime_db_instance
        self.import_callback = import_callback
        self.runtime_callback = runtime_callback

        self.observer: Any = None  # watchdog.observers.Observer instance
        self.handler: Any = None  # LogsFileHandler instance
        self.is_running = False

        # Debouncing: Track last import times
        self.last_csv_import: float = 0
        self.last_json_imports: Dict[str, float] = {}
        self.debounce_seconds = 2  # Wait 2 seconds before re-importing same file

        logger.info(f"LogsWatcher initialized for directory: {self.logs_dir}")

    def start(self):
        """Start watching the logs directory"""
        if self.is_running:
            logger.warning("LogsWatcher is already running")
            return

        if not self.logs_dir.exists():
            logger.error(f"Logs directory does not exist: {self.logs_dir}")
            return

        try:
            self.handler = LogsFileHandler(self)
            self.observer = Observer()
            self.observer.schedule(self.handler, str(self.logs_dir), recursive=False)
            self.observer.start()
            self.is_running = True
            logger.info(f"✓ LogsWatcher started monitoring: {self.logs_dir}")

        except Exception as e:
            logger.error(f"Failed to start LogsWatcher: {e}")
            self.is_running = False

    def stop(self):
        """Stop watching the logs directory"""
        if not self.is_running:
            return

        try:
            if self.observer:
                self.observer.stop()
                self.observer.join(timeout=5)
            self.is_running = False
            logger.info("LogsWatcher stopped")

        except Exception as e:
            logger.error(f"Error stopping LogsWatcher: {e}")

    def on_csv_modified(self):
        """Handle ImageChoices.csv modification"""
        current_time = time.time()

        # Debounce: Skip if we imported recently
        if current_time - self.last_csv_import < self.debounce_seconds:
            logger.debug("Debouncing ImageChoices.csv import (too soon)")
            return

        self.last_csv_import = current_time

        try:
            if self.import_callback:
                logger.info("📊 ImageChoices.csv modified - triggering import")
                threading.Thread(
                    target=self._safe_import_csv, daemon=True, name="CSVImport"
                ).start()
            else:
                logger.debug("No import callback configured for ImageChoices.csv")

        except Exception as e:
            logger.error(f"Error handling CSV modification: {e}")

    def on_runtime_json_modified(self, json_filename: str):
        """
        Handle runtime JSON file modification

        Args:
            json_filename: Name of the JSON file (e.g., "tautulli.json")
        """
        current_time = time.time()

        # Debounce: Skip if we imported this file recently
        last_import = self.last_json_imports.get(json_filename, 0)
        if current_time - last_import < self.debounce_seconds:
            logger.debug(f"Debouncing {json_filename} import (too soon)")
            return

        self.last_json_imports[json_filename] = current_time

        try:
            if self.runtime_callback:
                logger.info(f"📈 {json_filename} modified - triggering runtime import")
                threading.Thread(
                    target=self._safe_import_runtime,
                    args=(json_filename,),
                    daemon=True,
                    name=f"RuntimeImport-{json_filename}",
                ).start()
            else:
                logger.debug(f"No runtime callback configured for {json_filename}")

        except Exception as e:
            logger.error(f"Error handling runtime JSON modification: {e}")

    def _safe_import_csv(self):
        """Thread-safe CSV import wrapper"""
        try:
            if self.import_callback:
                self.import_callback()
            logger.debug("ImageChoices.csv import completed")
        except Exception as e:
            logger.error(f"Error during CSV import: {e}", exc_info=True)

    def _safe_import_runtime(self, json_filename: str):
        """Thread-safe runtime import wrapper"""
        try:
            if self.runtime_callback:
                json_path = self.logs_dir / json_filename
                self.runtime_callback(json_path)
            logger.debug(f"{json_filename} runtime import completed")
        except Exception as e:
            logger.error(
                f"Error during runtime import for {json_filename}: {e}", exc_info=True
            )


class LogsFileHandler(FileSystemEventHandler):
    """File system event handler for logs directory"""

    # Files to watch
    CSV_FILE = "ImageChoices.csv"
    RUNTIME_JSON_FILES = {
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
    }

    def __init__(self, watcher: LogsWatcher):
        super().__init__()
        self.watcher = watcher
        logger.debug("LogsFileHandler initialized")

    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            return

        try:
            file_path = Path(event.src_path)
            filename = file_path.name

            # Check if it's a file we're interested in
            if filename == self.CSV_FILE:
                logger.debug(f"Detected modification: {filename}")
                self.watcher.on_csv_modified()

            elif filename in self.RUNTIME_JSON_FILES:
                logger.debug(f"Detected modification: {filename}")
                self.watcher.on_runtime_json_modified(filename)

        except Exception as e:
            logger.error(f"Error processing file modification event: {e}")

    def on_created(self, event):
        """Handle file creation events (treat as modification)"""
        if event.is_directory:
            return

        try:
            file_path = Path(event.src_path)
            filename = file_path.name

            # Check if it's a file we're interested in
            if filename == self.CSV_FILE:
                logger.debug(f"Detected creation: {filename}")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                self.watcher.on_csv_modified()

            elif filename in self.RUNTIME_JSON_FILES:
                logger.debug(f"Detected creation: {filename}")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                self.watcher.on_runtime_json_modified(filename)

        except Exception as e:
            logger.error(f"Error processing file creation event: {e}")


def create_logs_watcher(
    logs_dir: Path,
    db_instance=None,
    runtime_db_instance=None,
) -> LogsWatcher:
    """
    Factory function to create and configure a LogsWatcher

    Args:
        logs_dir: Path to the Logs directory
        db_instance: ImageChoices database instance
        runtime_db_instance: Runtime database instance

    Returns:
        Configured LogsWatcher instance
    """
    from database import import_imagechoices_to_db
    from runtime_parser import parse_runtime_from_json
    from runtime_database import runtime_db

    def import_csv_callback():
        """Callback for CSV imports"""
        try:
            import_imagechoices_to_db(db_instance=db_instance, logs_dir=logs_dir)
        except Exception as e:
            logger.error(f"CSV import callback failed: {e}")

    def import_runtime_callback(json_path: Path):
        """Callback for runtime JSON imports"""
        try:
            # Determine mode from filename
            mode = json_path.stem.lower()  # e.g., "tautulli", "arr", "normal"

            # Parse the JSON file
            runtime_data = parse_runtime_from_json(json_path, mode)

            if runtime_data and runtime_db:
                runtime_db.add_runtime_entry(**runtime_data)
                logger.info(f"Runtime data from {json_path.name} saved to database")
            else:
                logger.warning(f"No runtime data parsed from {json_path.name}")

        except Exception as e:
            logger.error(f"Runtime import callback failed for {json_path.name}: {e}")

    watcher = LogsWatcher(
        logs_dir=logs_dir,
        db_instance=db_instance,
        runtime_db_instance=runtime_db_instance,
        import_callback=import_csv_callback,
        runtime_callback=import_runtime_callback,
    )

    return watcher
