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

        # Polling fallback for Windows reliability
        self.poll_thread: Any = None  # Background polling thread
        self.poll_interval = 5  # Check every 5 seconds
        self.last_file_mtimes: Dict[str, float] = {}  # Track file modification times

        logger.info(f"LogsWatcher initialized for directory: {self.logs_dir}")

    def start(self):
        """Start watching the logs directory"""
        logger.debug(f"start() called - current running state: {self.is_running}")

        if self.is_running:
            logger.warning("LogsWatcher is already running")
            return

        if not self.logs_dir.exists():
            logger.error(f"Logs directory does not exist: {self.logs_dir}")
            logger.debug(f"Attempted path: {self.logs_dir.absolute()}")
            return

        try:
            logger.debug("Creating LogsFileHandler instance...")
            self.handler = LogsFileHandler(self)

            logger.debug("Creating Observer instance...")
            self.observer = Observer()

            logger.debug(f"Scheduling observer for: {self.logs_dir}")
            self.observer.schedule(self.handler, str(self.logs_dir), recursive=False)

            logger.debug("Starting observer thread...")
            self.observer.start()

            self.is_running = True

            # Start polling thread as fallback for Windows
            logger.debug("Starting polling thread for Windows reliability...")
            self.poll_thread = threading.Thread(
                target=self._poll_files, daemon=True, name="LogsWatcherPoll"
            )
            self.poll_thread.start()
            logger.debug(f"Polling thread started (interval: {self.poll_interval}s)")

            logger.info(f"✓ LogsWatcher started monitoring: {self.logs_dir}")
            logger.debug(f"  - Debounce: {self.debounce_seconds}s")
            logger.debug(f"  - Monitoring CSV: {self.handler.CSV_FILE}")
            logger.debug(
                f"  - Monitoring JSON: {', '.join(sorted(self.handler.RUNTIME_JSON_FILES))}"
            )

        except Exception as e:
            logger.error(f"Failed to start LogsWatcher: {e}", exc_info=True)
            self.is_running = False

    def stop(self):
        """Stop watching the logs directory"""
        logger.debug(f"stop() called - current running state: {self.is_running}")

        if not self.is_running:
            logger.debug("LogsWatcher is not running, nothing to stop")
            return

        try:
            if self.observer:
                logger.debug("Stopping observer thread...")
                self.observer.stop()
                logger.debug("Waiting for observer to join (timeout: 5s)...")
                self.observer.join(timeout=5)
                logger.debug("Observer thread stopped")

            self.is_running = False
            logger.info("LogsWatcher stopped")

        except Exception as e:
            logger.error(f"Error stopping LogsWatcher: {e}", exc_info=True)

    def _poll_files(self):
        """
        Polling thread that checks file modification times.
        This is a fallback for Windows where watchdog events can be missed.
        """
        logger.info(
            f"Polling thread started - checking file mtimes every {self.poll_interval}s"
        )

        # Files to monitor
        csv_file = self.logs_dir / "ImageChoices.csv"
        json_files = [
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

        while self.is_running:
            try:
                # Check CSV file (case-insensitive by scanning directory)
                try:
                    for file in self.logs_dir.iterdir():
                        if file.is_file() and file.name.lower() == "imagechoices.csv":
                            try:
                                mtime = file.stat().st_mtime
                                last_mtime = self.last_file_mtimes.get("csv", 0)

                                if mtime > last_mtime and last_mtime > 0:
                                    logger.debug(
                                        f"Polling: Detected CSV modification (mtime: {mtime}, last: {last_mtime})"
                                    )
                                    self.on_csv_modified()

                                self.last_file_mtimes["csv"] = mtime
                                break  # Found the file, stop checking
                            except Exception as e:
                                logger.debug(f"Error checking CSV mtime: {e}")
                except Exception as e:
                    logger.debug(f"Error scanning directory for CSV: {e}")

                # Check JSON files (case-insensitive by scanning directory)
                try:
                    for file in self.logs_dir.iterdir():
                        if file.is_file() and file.suffix.lower() == ".json":
                            filename_lower = file.name.lower()
                            # Check if this file matches one of our monitored JSON files
                            if filename_lower in json_files:
                                try:
                                    mtime = file.stat().st_mtime
                                    last_mtime = self.last_file_mtimes.get(
                                        filename_lower, 0
                                    )

                                    if mtime > last_mtime and last_mtime > 0:
                                        logger.debug(
                                            f"Polling: Detected {file.name} modification (mtime: {mtime}, last: {last_mtime})"
                                        )
                                        self.on_runtime_json_modified(file.name)

                                    self.last_file_mtimes[filename_lower] = mtime
                                except Exception as e:
                                    logger.debug(
                                        f"Error checking {file.name} mtime: {e}"
                                    )
                except Exception as e:
                    logger.debug(f"Error scanning directory for JSON files: {e}")

                # Sleep until next check
                time.sleep(self.poll_interval)

            except Exception as e:
                logger.error(f"Error in polling thread: {e}", exc_info=True)
                time.sleep(self.poll_interval)

        logger.info("Polling thread stopped")

    def on_csv_modified(self):
        """Handle ImageChoices.csv modification"""
        current_time = time.time()
        logger.debug(f"on_csv_modified() triggered at {current_time}")

        # Debounce: Skip if we imported recently
        time_since_last = current_time - self.last_csv_import
        if time_since_last < self.debounce_seconds:
            logger.debug(
                f"Debouncing ImageChoices.csv import (last import {time_since_last:.2f}s ago, need {self.debounce_seconds}s)"
            )
            return

        self.last_csv_import = current_time
        logger.debug(
            f"CSV import debounce check passed (time since last: {time_since_last:.2f}s)"
        )

        try:
            if self.import_callback:
                logger.info("📊 ImageChoices.csv modified - triggering import")
                logger.debug("Spawning background thread for CSV import...")
                thread = threading.Thread(
                    target=self._safe_import_csv, daemon=True, name="CSVImport"
                )
                thread.start()
                logger.debug(
                    f"CSV import thread started: {thread.name} (ID: {thread.ident})"
                )
            else:
                logger.warning("No import callback configured for ImageChoices.csv")
                logger.debug("CSV import skipped - callback is None")

        except Exception as e:
            logger.error(f"Error handling CSV modification: {e}", exc_info=True)

    def on_runtime_json_modified(self, json_filename: str):
        """
        Handle runtime JSON file modification

        Args:
            json_filename: Name of the JSON file (e.g., "tautulli.json")
        """
        current_time = time.time()
        logger.debug(
            f"on_runtime_json_modified() triggered for {json_filename} at {current_time}"
        )

        # Debounce: Skip if we imported this file recently
        last_import = self.last_json_imports.get(json_filename, 0)
        time_since_last = current_time - last_import

        if time_since_last < self.debounce_seconds:
            logger.debug(
                f"Debouncing {json_filename} import (last import {time_since_last:.2f}s ago, need {self.debounce_seconds}s)"
            )
            return

        self.last_json_imports[json_filename] = current_time
        logger.debug(
            f"JSON import debounce check passed for {json_filename} (time since last: {time_since_last:.2f}s)"
        )

        try:
            if self.runtime_callback:
                logger.info(f"📈 {json_filename} modified - triggering runtime import")
                logger.debug(
                    f"Spawning background thread for {json_filename} import..."
                )
                thread = threading.Thread(
                    target=self._safe_import_runtime,
                    args=(json_filename,),
                    daemon=True,
                    name=f"RuntimeImport-{json_filename}",
                )
                thread.start()
                logger.debug(
                    f"Runtime import thread started: {thread.name} (ID: {thread.ident})"
                )
            else:
                logger.warning(f"No runtime callback configured for {json_filename}")
                logger.debug("Runtime import skipped - callback is None")

        except Exception as e:
            logger.error(
                f"Error handling runtime JSON modification for {json_filename}: {e}",
                exc_info=True,
            )

    def _safe_import_csv(self):
        """Thread-safe CSV import wrapper"""
        thread_id = threading.get_ident()
        logger.debug(f"[Thread {thread_id}] Starting CSV import...")

        try:
            if self.import_callback:
                logger.debug(f"[Thread {thread_id}] Calling import_callback()...")
                self.import_callback()
                logger.debug(
                    f"[Thread {thread_id}] CSV import callback completed successfully"
                )
            else:
                logger.warning(f"[Thread {thread_id}] CSV import callback is None")

        except Exception as e:
            logger.error(
                f"[Thread {thread_id}] Error during CSV import: {e}", exc_info=True
            )
        finally:
            logger.debug(f"[Thread {thread_id}] CSV import thread finishing")

    def _safe_import_runtime(self, json_filename: str):
        """Thread-safe runtime import wrapper"""
        thread_id = threading.get_ident()
        logger.debug(
            f"[Thread {thread_id}] Starting runtime import for {json_filename}..."
        )

        try:
            if self.runtime_callback:
                json_path = self.logs_dir / json_filename
                logger.debug(f"[Thread {thread_id}] JSON path: {json_path}")
                logger.debug(f"[Thread {thread_id}] File exists: {json_path.exists()}")

                if json_path.exists():
                    file_size = json_path.stat().st_size
                    logger.debug(f"[Thread {thread_id}] File size: {file_size} bytes")

                logger.debug(f"[Thread {thread_id}] Calling runtime_callback()...")
                self.runtime_callback(json_path)
                logger.debug(
                    f"[Thread {thread_id}] Runtime import callback completed successfully"
                )
            else:
                logger.warning(f"[Thread {thread_id}] Runtime import callback is None")

        except Exception as e:
            logger.error(
                f"[Thread {thread_id}] Error during runtime import for {json_filename}: {e}",
                exc_info=True,
            )
        finally:
            logger.debug(f"[Thread {thread_id}] Runtime import thread finishing")


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
            logger.debug(f"Ignoring directory modification: {event.src_path}")
            return

        try:
            file_path = Path(event.src_path)
            filename = file_path.name
            filename_lower = filename.lower()
            logger.debug(f"File MODIFIED event: {filename} (path: {file_path})")

            # Check if it's a file we're interested in (case-insensitive)
            if filename_lower == self.CSV_FILE.lower():
                logger.debug(f"Detected modification of monitored CSV file: {filename}")
                self.watcher.on_csv_modified()

            elif filename_lower in self.RUNTIME_JSON_FILES:
                logger.debug(
                    f"Detected modification of monitored JSON file: {filename}"
                )
                self.watcher.on_runtime_json_modified(filename)

            else:
                logger.debug(f"Ignoring modification of non-monitored file: {filename}")

        except Exception as e:
            logger.error(
                f"Error processing file modification event: {e}", exc_info=True
            )

    def on_created(self, event):
        """Handle file creation events (treat as modification)"""
        if event.is_directory:
            logger.debug(f"Ignoring directory creation: {event.src_path}")
            return

        try:
            file_path = Path(event.src_path)
            filename = file_path.name
            filename_lower = filename.lower()
            logger.debug(f"File CREATED event: {filename} (path: {file_path})")

            # Check if it's a file we're interested in (case-insensitive)
            if filename_lower == self.CSV_FILE.lower():
                logger.debug(f"Detected creation of monitored CSV file: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_csv_modified()

            elif filename_lower in self.RUNTIME_JSON_FILES:
                logger.debug(f"Detected creation of monitored JSON file: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_runtime_json_modified(filename)

            else:
                logger.debug(f"Ignoring creation of non-monitored file: {filename}")

        except Exception as e:
            logger.error(f"Error processing file creation event: {e}", exc_info=True)

    def on_closed(self, event):
        """
        Handle file close events (Linux inotify IN_CLOSE_WRITE).
        This is critical for Docker containers where files might not trigger on_modified.
        """
        if event.is_directory:
            return

        try:
            file_path = Path(event.src_path)
            filename = file_path.name
            filename_lower = filename.lower()
            logger.debug(f"File CLOSED event: {filename} (path: {file_path})")

            # Only process files we're monitoring (case-insensitive)
            if filename_lower == self.CSV_FILE.lower():
                logger.debug(f"Detected close of monitored CSV file: {filename}")
                self.watcher.on_csv_modified()

            elif filename_lower in self.RUNTIME_JSON_FILES:
                logger.debug(f"Detected close of monitored JSON file: {filename}")
                self.watcher.on_runtime_json_modified(filename)

        except Exception as e:
            logger.error(f"Error processing file close event: {e}", exc_info=True)

    def on_moved(self, event):
        """
        Handle file move events (atomic write pattern used by many editors).
        Files are often written to temp location then moved to final location.
        """
        if event.is_directory:
            return

        try:
            # Check the destination file (where it was moved TO)
            dest_path = Path(event.dest_path)
            filename = dest_path.name
            filename_lower = filename.lower()
            logger.debug(
                f"File MOVED event: {filename} (from: {event.src_path}, to: {event.dest_path})"
            )

            # Only process files we're monitoring (case-insensitive)
            if filename_lower == self.CSV_FILE.lower():
                logger.debug(f"Detected move to monitored CSV file: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_csv_modified()

            elif filename_lower in self.RUNTIME_JSON_FILES:
                logger.debug(f"Detected move to monitored JSON file: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_runtime_json_modified(filename)

        except Exception as e:
            logger.error(f"Error processing file move event: {e}", exc_info=True)


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
    logger.debug("=" * 60)
    logger.debug("create_logs_watcher() called")
    logger.debug(f"  logs_dir: {logs_dir}")
    logger.debug(f"  db_instance: {db_instance}")
    logger.debug(f"  runtime_db_instance: {runtime_db_instance}")

    from database import import_imagechoices_to_db
    from runtime_parser import parse_runtime_from_json
    from runtime_database import runtime_db

    logger.debug("Imported required modules successfully")

    def import_csv_callback():
        """Callback for CSV imports"""
        logger.debug("CSV import callback invoked")
        try:
            import_imagechoices_to_db(db_instance=db_instance, logs_dir=logs_dir)
            logger.debug("CSV import callback completed successfully")
        except Exception as e:
            logger.error(f"CSV import callback failed: {e}", exc_info=True)

    def import_runtime_callback(json_path: Path):
        """Callback for runtime JSON imports"""
        logger.debug(f"Runtime import callback invoked for: {json_path}")
        try:
            # Determine mode from filename
            mode = json_path.stem.lower()  # e.g., "tautulli", "arr", "normal"
            logger.debug(f"Detected mode from filename: {mode}")

            # Parse the JSON file
            logger.debug(f"Parsing JSON file: {json_path}")
            runtime_data = parse_runtime_from_json(json_path, mode)

            if runtime_data:
                logger.debug(
                    f"Runtime data parsed successfully: {len(runtime_data)} fields"
                )
                logger.debug(f"  Mode: {runtime_data.get('mode')}")
                logger.debug(f"  Runtime: {runtime_data.get('runtime_seconds')}s")
                logger.debug(f"  Total images: {runtime_data.get('total_images')}")

                if runtime_db:
                    logger.debug("Adding runtime entry to database...")
                    runtime_db.add_runtime_entry(**runtime_data)
                    logger.info(f"Runtime data from {json_path.name} saved to database")
                else:
                    logger.warning("runtime_db is None, cannot save to database")
            else:
                logger.warning(f"No runtime data parsed from {json_path.name}")
                logger.debug(f"parse_runtime_from_json() returned: {runtime_data}")

        except Exception as e:
            logger.error(
                f"Runtime import callback failed for {json_path.name}: {e}",
                exc_info=True,
            )

    logger.debug("Creating LogsWatcher instance...")
    watcher = LogsWatcher(
        logs_dir=logs_dir,
        db_instance=db_instance,
        runtime_db_instance=runtime_db_instance,
        import_callback=import_csv_callback,
        runtime_callback=import_runtime_callback,
    )

    logger.debug("LogsWatcher instance created successfully")
    logger.debug("=" * 60)

    return watcher
