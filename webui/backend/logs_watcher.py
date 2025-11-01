"""
Logs Directory Watcher for Background Processes

Monitors the Logs directory for changes to files created by background watcher processes
(Tautulli, Sonarr, Radarr, Plex) and automatically imports them to databases.

Features:
- Watches for ImageChoices.csv modifications
- Watches for runtime JSON files (tautulli.json, arr.json, etc.)
- Watches for Plex export CSVs (PlexLibexport.csv, PlexEpisodeExport.csv)
- Debounces file changes to avoid duplicate imports
- Thread-safe background monitoring
- Hybrid event-based + polling approach for reliability
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
        media_export_db_instance=None,
        import_callback=None,
        runtime_callback=None,
        plex_callback=None,
        other_media_callback=None,
    ):
        """
        Initialize the logs watcher

        Args:
            logs_dir: Path to the Logs directory to watch
            db_instance: ImageChoices database instance
            runtime_db_instance: Runtime database instance
            media_export_db_instance: Plex export database instance
            import_callback: Function to call for ImageChoices.csv imports
            runtime_callback: Function to call for runtime JSON imports
            plex_callback: Function to call for Plex CSV imports
            other_media_callback: Function to call for OtherMediaServer CSV imports
        """
        self.logs_dir = Path(logs_dir)
        self.db = db_instance
        self.runtime_db = runtime_db_instance
        self.media_export_db = media_export_db_instance
        self.import_callback = import_callback
        self.runtime_callback = runtime_callback
        self.plex_callback = plex_callback
        self.other_media_callback = other_media_callback

        self.observer: Any = None  # watchdog.observers.Observer instance
        self.handler: Any = None  # LogsFileHandler instance
        self.is_running = False

        # Debouncing: Track last import times
        self.last_csv_import: float = 0
        self.last_json_imports: Dict[str, float] = {}
        self.last_plex_import: float = 0
        self.last_other_media_import: float = 0
        self.debounce_seconds = 2  # Wait 2 seconds before re-importing same file

        # Polling fallback for Windows/Docker reliability
        self.poll_thread: Any = None  # Background polling thread
        self.poll_interval = 5  # Check every 5 seconds
        self.last_file_mtimes: Dict[str, float] = {}  # Track file modification times

        # Track files that existed at startup (to prevent restart duplicates)
        self.files_at_startup: set = (
            set()
        )  # Set of filenames that existed when watcher started

        logger.info(f"LogsWatcher initialized for directory: {self.logs_dir}")

    def start(self):
        """Start watching the logs directory"""
        logger.info("=" * 80)
        logger.info("LOGS WATCHER START INITIATED")
        logger.info("=" * 80)
        logger.debug(f"start() called - current running state: {self.is_running}")
        logger.debug(f"Logs directory: {self.logs_dir}")
        logger.debug(f"Logs directory (absolute): {self.logs_dir.absolute()}")
        logger.debug(f"DB instance: {self.db}")
        logger.debug(f"Runtime DB instance: {self.runtime_db}")
        logger.debug(f"Import callback: {self.import_callback}")
        logger.debug(f"Runtime callback: {self.runtime_callback}")

        if self.is_running:
            logger.warning("LogsWatcher is already running")
            return

        if not self.logs_dir.exists():
            logger.error(f"Logs directory does not exist: {self.logs_dir}")
            logger.debug(f"Attempted path: {self.logs_dir.absolute()}")
            logger.debug(f"Current working directory: {Path.cwd()}")
            logger.debug(f"Checking if parent exists: {self.logs_dir.parent.exists()}")
            return
        else:
            logger.debug(f"[OK] Logs directory exists: {self.logs_dir}")
            logger.debug(f"[OK] Directory is readable: {self.logs_dir.is_dir()}")
            # List current files in directory
            try:
                files = list(self.logs_dir.iterdir())
                logger.debug(
                    f"[OK] Current files in Logs directory: {len(files)} files"
                )
                for f in files[:10]:  # Show first 10
                    logger.debug(f"  - {f.name} ({'file' if f.is_file() else 'dir'})")
                if len(files) > 10:
                    logger.debug(f"  ... and {len(files) - 10} more")
            except Exception as e:
                logger.warning(f"Could not list directory contents: {e}")

        try:
            logger.debug("Creating LogsFileHandler instance...")
            self.handler = LogsFileHandler(self)
            logger.debug(f"[OK] Handler created: {self.handler}")

            logger.debug("Creating Observer instance...")
            self.observer = Observer()
            logger.debug(f"[OK] Observer created: {type(self.observer).__name__}")

            logger.debug(f"Scheduling observer for: {self.logs_dir}")
            self.observer.schedule(self.handler, str(self.logs_dir), recursive=False)
            logger.debug("[OK] Observer scheduled")

            logger.debug("Starting observer thread...")
            self.observer.start()
            logger.debug(
                f"[OK] Observer thread started (alive: {self.observer.is_alive()})"
            )

            self.is_running = True

            # Record which files exist at startup (to prevent restart duplicates)
            logger.debug("Recording existing files at startup...")
            try:
                for file in self.logs_dir.iterdir():
                    if file.is_file():
                        self.files_at_startup.add(file.name.lower())
                logger.debug(
                    f"[OK] Found {len(self.files_at_startup)} existing files at startup"
                )
                if self.files_at_startup:
                    logger.debug(
                        f"  Existing files: {', '.join(sorted(self.files_at_startup))}"
                    )
            except Exception as e:
                logger.warning(f"Could not scan for existing files: {e}")

            # Start polling thread as fallback for Windows/Docker
            logger.debug("Starting polling thread for reliability...")
            self.poll_thread = threading.Thread(
                target=self._poll_files, daemon=True, name="LogsWatcherPoll"
            )
            self.poll_thread.start()
            logger.debug(
                f"[OK] Polling thread started (alive: {self.poll_thread.is_alive()})"
            )
            logger.debug(f"  - Poll interval: {self.poll_interval}s")
            logger.debug(f"  - Thread ID: {self.poll_thread.ident}")

            logger.info("=" * 80)
            logger.info(f"[OK] LOGS WATCHER STARTED SUCCESSFULLY")
            logger.info(f"  Monitoring: {self.logs_dir}")
            logger.info(f"  - Debounce: {self.debounce_seconds}s")
            logger.info(f"  - CSV File: {self.handler.CSV_FILE}")
            logger.info(
                f"  - JSON Files: {len(self.handler.RUNTIME_JSON_FILES)} monitored"
            )
            for json_file in sorted(self.handler.RUNTIME_JSON_FILES):
                logger.info(f"    • {json_file}")
            logger.info("=" * 80)

        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"FAILED TO START LOGS WATCHER")
            logger.error(f"Error: {e}", exc_info=True)
            logger.error("=" * 80)
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
        This is a fallback for Windows/Docker where watchdog events can be missed.
        """
        logger.info("=" * 80)
        logger.info("POLLING THREAD STARTED")
        logger.info(f"  Interval: {self.poll_interval}s")
        logger.info(f"  Thread: {threading.current_thread().name}")
        logger.info(f"  Thread ID: {threading.current_thread().ident}")
        logger.info("=" * 80)

        # Files to monitor
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

        logger.debug(
            f"Monitoring {len(json_files)} JSON files: {', '.join(json_files)}"
        )

        poll_count = 0

        while self.is_running:
            try:
                poll_count += 1

                # Log every 12 polls (1 minute if poll_interval is 5s)
                if poll_count % 12 == 1:
                    logger.debug(f"Poll cycle #{poll_count} - checking files...")

                # Check CSV file (case-insensitive by scanning directory)
                csv_found = False
                try:
                    for file in self.logs_dir.iterdir():
                        if file.is_file() and file.name.lower() == "imagechoices.csv":
                            csv_found = True
                            try:
                                mtime = file.stat().st_mtime
                                last_mtime = self.last_file_mtimes.get("csv", 0)

                                if poll_count % 12 == 1:
                                    logger.debug(
                                        f"  CSV: {file.name} (mtime: {mtime}, last: {last_mtime})"
                                    )

                                # Only trigger import on MODIFICATION (mtime > last_mtime)
                                # OR if this is a NEW file (didn't exist at startup)
                                if last_mtime == 0:
                                    # First detection - check if file existed at startup
                                    if file.name.lower() in self.files_at_startup:
                                        # File existed at startup - skip to prevent restart duplicates
                                        if poll_count % 12 == 1:
                                            logger.debug(
                                                f"  [SKIP] {file.name} existed at startup, recording mtime only"
                                            )
                                    else:
                                        # NEW file created after startup - import it!
                                        logger.info(
                                            f"POLLING DETECTED: NEW CSV FILE {file.name} created after startup!"
                                        )
                                        logger.debug(f"  File mtime: {mtime}")
                                        logger.debug(
                                            "  First detection of new file - triggering import"
                                        )
                                        self.on_csv_modified()
                                elif mtime > last_mtime:
                                    logger.info(f"POLLING DETECTED: CSV modification!")
                                    logger.debug(f"  File: {file.name}")
                                    logger.debug(f"  Current mtime: {mtime}")
                                    logger.debug(f"  Last mtime: {last_mtime}")
                                    logger.debug(f"  Delta: {mtime - last_mtime}s")
                                    self.on_csv_modified()

                                self.last_file_mtimes["csv"] = mtime
                                break  # Found the file, stop checking
                            except Exception as e:
                                logger.error(
                                    f"Error checking CSV mtime: {e}", exc_info=True
                                )

                    if not csv_found and poll_count % 12 == 1:
                        logger.debug("  CSV: ImageChoices.csv not found")

                except Exception as e:
                    logger.error(
                        f"Error scanning directory for CSV: {e}", exc_info=True
                    )

                # Check Plex CSV files
                plex_csv_found = False
                try:
                    plex_library_csv = self.logs_dir / "PlexLibexport.csv"
                    plex_episode_csv = self.logs_dir / "PlexEpisodeExport.csv"

                    # Check if at least one Plex CSV exists
                    if plex_library_csv.exists() or plex_episode_csv.exists():
                        plex_csv_found = True
                        # Use the most recent modification time of the two files
                        max_mtime = 0
                        if plex_library_csv.exists():
                            max_mtime = max(max_mtime, plex_library_csv.stat().st_mtime)
                        if plex_episode_csv.exists():
                            max_mtime = max(max_mtime, plex_episode_csv.stat().st_mtime)

                        last_mtime = self.last_file_mtimes.get("plex_csv", 0)

                        if poll_count % 12 == 1:
                            logger.debug(
                                f"  Plex CSVs: (mtime: {max_mtime}, last: {last_mtime})"
                            )

                        # Only trigger import on MODIFICATION
                        if last_mtime == 0:
                            # First detection - check if files existed at startup
                            if (
                                "plexlibexport.csv" in self.files_at_startup
                                or "plexepisodeexport.csv" in self.files_at_startup
                            ):
                                if poll_count % 12 == 1:
                                    logger.debug(
                                        f"  [SKIP] Plex CSVs existed at startup, recording mtime only"
                                    )
                            else:
                                # NEW files created after startup
                                logger.info(
                                    f"POLLING DETECTED: NEW Plex CSV files created after startup!"
                                )
                                logger.debug(f"  File mtime: {max_mtime}")
                                self.on_plex_csv_modified()
                        elif max_mtime > last_mtime:
                            logger.info(f"POLLING DETECTED: Plex CSV modification!")
                            logger.debug(f"  Current mtime: {max_mtime}")
                            logger.debug(f"  Last mtime: {last_mtime}")
                            logger.debug(f"  Delta: {max_mtime - last_mtime}s")
                            self.on_plex_csv_modified()

                        self.last_file_mtimes["plex_csv"] = max_mtime

                    if not plex_csv_found and poll_count % 12 == 1:
                        logger.debug("  Plex CSVs: Not found")

                except Exception as e:
                    logger.error(f"Error checking Plex CSVs: {e}", exc_info=True)

                # Check OtherMediaServer CSV files
                other_media_csv_found = False
                try:
                    other_media_library_csv = (
                        self.logs_dir / "OtherMediaServerLibExport.csv"
                    )
                    other_media_episode_csv = (
                        self.logs_dir / "OtherMediaServerEpisodeExport.csv"
                    )

                    # Check if at least one OtherMedia CSV exists
                    if (
                        other_media_library_csv.exists()
                        or other_media_episode_csv.exists()
                    ):
                        other_media_csv_found = True
                        # Use the most recent modification time of the two files
                        max_mtime = 0
                        if other_media_library_csv.exists():
                            max_mtime = max(
                                max_mtime, other_media_library_csv.stat().st_mtime
                            )
                        if other_media_episode_csv.exists():
                            max_mtime = max(
                                max_mtime, other_media_episode_csv.stat().st_mtime
                            )

                        last_mtime = self.last_file_mtimes.get("other_media_csv", 0)

                        if poll_count % 12 == 1:
                            logger.debug(
                                f"  OtherMedia CSVs: (mtime: {max_mtime}, last: {last_mtime})"
                            )

                        # Only trigger import on MODIFICATION
                        if last_mtime == 0:
                            # First detection - check if files existed at startup
                            if (
                                "othermediaserverlibexport.csv" in self.files_at_startup
                                or "othermediaserverepisodeexport.csv"
                                in self.files_at_startup
                            ):
                                if poll_count % 12 == 1:
                                    logger.debug(
                                        f"  [SKIP] OtherMedia CSVs existed at startup, recording mtime only"
                                    )
                            else:
                                # NEW OtherMedia CSV created after startup - import it!
                                logger.info(
                                    f"POLLING DETECTED: NEW OtherMedia CSV created after startup!"
                                )
                                logger.debug(f"  File mtime: {max_mtime}")
                                self.on_other_media_csv_modified()
                        elif max_mtime > last_mtime:
                            logger.info(
                                f"POLLING DETECTED: OtherMedia CSV modification!"
                            )
                            logger.debug(f"  Current mtime: {max_mtime}")
                            logger.debug(f"  Last mtime: {last_mtime}")
                            logger.debug(f"  Delta: {max_mtime - last_mtime}s")
                            self.on_other_media_csv_modified()

                        self.last_file_mtimes["other_media_csv"] = max_mtime

                    if not other_media_csv_found and poll_count % 12 == 1:
                        logger.debug("  OtherMedia CSVs: Not found")

                except Exception as e:
                    logger.error(f"Error checking OtherMedia CSVs: {e}", exc_info=True)

                # Check JSON files (case-insensitive by scanning directory)
                json_found_count = 0
                try:
                    for file in self.logs_dir.iterdir():
                        if file.is_file() and file.suffix.lower() == ".json":
                            filename_lower = file.name.lower()
                            # Check if this file matches one of our monitored JSON files
                            if filename_lower in json_files:
                                json_found_count += 1
                                try:
                                    mtime = file.stat().st_mtime
                                    last_mtime = self.last_file_mtimes.get(
                                        filename_lower, 0
                                    )

                                    if poll_count % 12 == 1:
                                        logger.debug(
                                            f"  JSON: {file.name} (mtime: {mtime}, last: {last_mtime})"
                                        )

                                    # Only trigger import on MODIFICATION (mtime > last_mtime)
                                    # OR if this is a NEW file (didn't exist at startup)
                                    if last_mtime == 0:
                                        # First detection - check if file existed at startup
                                        if filename_lower in self.files_at_startup:
                                            # File existed at startup - skip to prevent restart duplicates
                                            if poll_count % 12 == 1:
                                                logger.debug(
                                                    f"  [SKIP] {file.name} existed at startup, recording mtime only"
                                                )
                                        else:
                                            # NEW file created after startup - import it!
                                            logger.info(
                                                f"POLLING DETECTED: NEW JSON FILE {file.name} created after startup!"
                                            )
                                            logger.debug(f"  File mtime: {mtime}")
                                            logger.debug(
                                                "  First detection of new file - triggering import"
                                            )
                                            self.on_runtime_json_modified(file.name)
                                    elif mtime > last_mtime:
                                        logger.info(
                                            f"POLLING DETECTED: {file.name} modification!"
                                        )
                                        logger.debug(f"  Current mtime: {mtime}")
                                        logger.debug(f"  Last mtime: {last_mtime}")
                                        logger.debug(f"  Delta: {mtime - last_mtime}s")
                                        self.on_runtime_json_modified(file.name)

                                    self.last_file_mtimes[filename_lower] = mtime
                                except Exception as e:
                                    logger.error(
                                        f"Error checking {file.name} mtime: {e}",
                                        exc_info=True,
                                    )

                    if poll_count % 12 == 1:
                        logger.debug(
                            f"  Found {json_found_count}/{len(json_files)} monitored JSON files"
                        )

                except Exception as e:
                    logger.error(
                        f"Error scanning directory for JSON files: {e}", exc_info=True
                    )

                # Sleep until next check
                time.sleep(self.poll_interval)

            except Exception as e:
                logger.error(f"Error in polling thread: {e}", exc_info=True)
                time.sleep(self.poll_interval)

        logger.info("Polling thread stopped")

    def on_csv_modified(self):
        """Handle ImageChoices.csv modification"""
        current_time = time.time()
        logger.info("=" * 80)
        logger.info("CSV MODIFICATION DETECTED")
        logger.info(f"  File: ImageChoices.csv")
        logger.info(f"  Timestamp: {datetime.fromtimestamp(current_time)}")
        logger.debug(f"  on_csv_modified() triggered at {current_time}")

        # Debounce: Skip if we imported recently
        time_since_last = current_time - self.last_csv_import
        logger.debug(f"  Last CSV import: {self.last_csv_import}")
        logger.debug(f"  Time since last import: {time_since_last:.2f}s")
        logger.debug(f"  Debounce threshold: {self.debounce_seconds}s")

        if time_since_last < self.debounce_seconds:
            logger.warning(f"DEBOUNCED: Skipping CSV import")
            logger.debug(
                f"  Reason: Last import was {time_since_last:.2f}s ago (need {self.debounce_seconds}s)"
            )
            logger.info("=" * 80)
            return

        self.last_csv_import = current_time
        logger.info(
            f"[OK] Debounce check passed (time since last: {time_since_last:.2f}s)"
        )

        try:
            if self.import_callback:
                logger.info("Triggering CSV import in background thread...")
                logger.debug(f"  Callback function: {self.import_callback}")
                logger.debug("  Creating thread...")
                thread = threading.Thread(
                    target=self._safe_import_csv, daemon=True, name="CSVImport"
                )
                thread.start()
                logger.info(
                    f"CSV import thread started: {thread.name} (ID: {thread.ident})"
                )
                logger.info("=" * 80)
            else:
                logger.error("No import callback configured!")
                logger.debug("  import_callback is None")
                logger.info("=" * 80)

        except Exception as e:
            logger.error("=" * 80)
            logger.error("ERROR handling CSV modification")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)

    def on_runtime_json_modified(self, json_filename: str):
        """Handle runtime JSON file modification"""
        current_time = time.time()
        logger.info("=" * 80)
        logger.info("JSON MODIFICATION DETECTED")
        logger.info(f"  File: {json_filename}")
        logger.info(f"  Timestamp: {datetime.fromtimestamp(current_time)}")
        logger.debug(f"  on_runtime_json_modified() triggered at {current_time}")

        # Debounce: Skip if we imported this file recently
        last_import = self.last_json_imports.get(json_filename, 0)
        time_since_last = current_time - last_import

        logger.debug(f"  Last import of {json_filename}: {last_import}")
        logger.debug(f"  Time since last import: {time_since_last:.2f}s")
        logger.debug(f"  Debounce threshold: {self.debounce_seconds}s")

        if time_since_last < self.debounce_seconds:
            logger.warning(f"DEBOUNCED: Skipping {json_filename} import")
            logger.debug(
                f"  Reason: Last import was {time_since_last:.2f}s ago (need {self.debounce_seconds}s)"
            )
            logger.info("=" * 80)
            return

        self.last_json_imports[json_filename] = current_time
        logger.info(
            f"[OK] Debounce check passed (time since last: {time_since_last:.2f}s)"
        )

        try:
            if self.runtime_callback:
                logger.info(
                    f"Triggering runtime import for {json_filename} in background thread..."
                )
                logger.debug(f"  Callback function: {self.runtime_callback}")
                logger.debug(f"  JSON path: {self.logs_dir / json_filename}")
                logger.debug("  Creating thread...")
                thread = threading.Thread(
                    target=self._safe_import_runtime,
                    args=(json_filename,),
                    daemon=True,
                    name=f"RuntimeImport-{json_filename}",
                )
                thread.start()
                logger.info(
                    f"[OK] Runtime import thread started: {thread.name} (ID: {thread.ident})"
                )
                logger.info("=" * 80)
            else:
                logger.error(
                    f"[ERROR] No runtime callback configured for {json_filename}"
                )
                logger.debug("  runtime_callback is None")
                logger.info("=" * 80)

        except Exception as e:
            logger.error("=" * 80)
            logger.error(
                f"[ERROR] ERROR handling runtime JSON modification for {json_filename}"
            )
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)

    def _safe_import_csv(self):
        """Thread-safe CSV import wrapper"""
        thread_id = threading.get_ident()
        thread_name = threading.current_thread().name
        logger.info("=" * 80)
        logger.info(f"CSV IMPORT THREAD STARTED")
        logger.info(f"  Thread: {thread_name}")
        logger.info(f"  Thread ID: {thread_id}")
        logger.info("=" * 80)

        try:
            if self.import_callback:
                logger.debug(f"[Thread {thread_id}] Calling import_callback()...")
                logger.debug(f"[Thread {thread_id}] Callback: {self.import_callback}")

                start_time = time.time()
                self.import_callback()
                elapsed = time.time() - start_time

                logger.info("=" * 80)
                logger.info(f"[SUCCESS] CSV IMPORT COMPLETED SUCCESSFULLY")
                logger.info(f"  Thread: {thread_name}")
                logger.info(f"  Duration: {elapsed:.2f}s")
                logger.info("=" * 80)
            else:
                logger.error(
                    f"[Thread {thread_id}] [ERROR] CSV import callback is None"
                )

        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[ERROR] CSV IMPORT FAILED")
            logger.error(f"  Thread: {thread_name} (ID: {thread_id})")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)
        finally:
            logger.debug(f"[Thread {thread_id}] CSV import thread finishing")

    def on_plex_csv_modified(self):
        """Handle Plex CSV modification (both PlexLibexport.csv and PlexEpisodeExport.csv)"""
        current_time = time.time()
        logger.info("=" * 80)
        logger.info("PLEX CSV MODIFICATION DETECTED")
        logger.info(f"  Files: PlexLibexport.csv / PlexEpisodeExport.csv")
        logger.info(f"  Timestamp: {datetime.fromtimestamp(current_time)}")
        logger.debug(f"  on_plex_csv_modified() triggered at {current_time}")

        # Debounce: Skip if we imported recently
        time_since_last = current_time - self.last_plex_import
        logger.debug(f"  Last Plex CSV import: {self.last_plex_import}")
        logger.debug(f"  Time since last import: {time_since_last:.2f}s")
        logger.debug(f"  Debounce threshold: {self.debounce_seconds}s")

        if time_since_last < self.debounce_seconds:
            logger.warning(f"DEBOUNCED: Skipping Plex CSV import")
            logger.debug(
                f"  Reason: Last import was {time_since_last:.2f}s ago (need {self.debounce_seconds}s)"
            )
            logger.info("=" * 80)
            return

        self.last_plex_import = current_time
        logger.info(
            f"[OK] Debounce check passed (time since last: {time_since_last:.2f}s)"
        )

        try:
            if self.plex_callback:
                logger.info("Triggering Plex CSV import in background thread...")
                logger.debug(f"  Callback function: {self.plex_callback}")
                logger.debug("  Creating thread...")
                thread = threading.Thread(
                    target=self._safe_import_plex, daemon=True, name="PlexCSVImport"
                )
                thread.start()
                logger.info(
                    f"Plex CSV import thread started: {thread.name} (ID: {thread.ident})"
                )
                logger.info("=" * 80)
            else:
                logger.error("No Plex import callback configured!")
                logger.debug("  plex_callback is None")
                logger.info("=" * 80)

        except Exception as e:
            logger.error("=" * 80)
            logger.error("ERROR handling Plex CSV modification")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)

    def on_other_media_csv_modified(self):
        """Handle OtherMediaServer CSV modification (both Library and Episode exports)"""
        current_time = time.time()
        logger.info("=" * 80)
        logger.info("OTHERMEDIA CSV MODIFICATION DETECTED")
        logger.info(
            f"  Files: OtherMediaServerLibExport.csv / OtherMediaServerEpisodeExport.csv"
        )
        logger.info(f"  Timestamp: {datetime.fromtimestamp(current_time)}")
        logger.debug(f"  on_other_media_csv_modified() triggered at {current_time}")

        # Debounce: Skip if we imported recently
        time_since_last = current_time - self.last_other_media_import
        logger.debug(f"  Last OtherMedia CSV import: {self.last_other_media_import}")
        logger.debug(f"  Time since last import: {time_since_last:.2f}s")
        logger.debug(f"  Debounce threshold: {self.debounce_seconds}s")

        if time_since_last < self.debounce_seconds:
            logger.warning(f"DEBOUNCED: Skipping OtherMedia CSV import")
            logger.debug(
                f"  Reason: Last import was {time_since_last:.2f}s ago (need {self.debounce_seconds}s)"
            )
            logger.info("=" * 80)
            return

        self.last_other_media_import = current_time
        logger.info(
            f"[OK] Debounce check passed (time since last: {time_since_last:.2f}s)"
        )

        try:
            if self.other_media_callback:
                logger.info("Triggering OtherMedia CSV import in background thread...")
                logger.debug(f"  Callback function: {self.other_media_callback}")
                logger.debug("  Creating thread...")
                thread = threading.Thread(
                    target=self._safe_import_other_media,
                    daemon=True,
                    name="OtherMediaCSVImport",
                )
                thread.start()
                logger.info(
                    f"OtherMedia CSV import thread started: {thread.name} (ID: {thread.ident})"
                )
                logger.info("=" * 80)
            else:
                logger.error("No OtherMedia import callback configured!")
                logger.debug("  other_media_callback is None")
                logger.info("=" * 80)

        except Exception as e:
            logger.error("=" * 80)
            logger.error("ERROR handling OtherMedia CSV modification")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)

    def _safe_import_plex(self):
        """Thread-safe Plex CSV import wrapper"""
        thread_id = threading.get_ident()
        thread_name = threading.current_thread().name
        logger.info("=" * 80)
        logger.info(f"PLEX CSV IMPORT THREAD STARTED")
        logger.info(f"  Thread: {thread_name}")
        logger.info(f"  Thread ID: {thread_id}")
        logger.info("=" * 80)

        try:
            if self.plex_callback:
                logger.debug(f"[Thread {thread_id}] Calling plex_callback()...")
                logger.debug(f"[Thread {thread_id}] Callback: {self.plex_callback}")

                start_time = time.time()
                self.plex_callback()
                elapsed = time.time() - start_time

                logger.info("=" * 80)
                logger.info(f"[SUCCESS] PLEX CSV IMPORT COMPLETED SUCCESSFULLY")
                logger.info(f"  Thread: {thread_name}")
                logger.info(f"  Duration: {elapsed:.2f}s")
                logger.info("=" * 80)
            else:
                logger.error(
                    f"[Thread {thread_id}] [ERROR] Plex CSV import callback is None"
                )

        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[ERROR] PLEX CSV IMPORT FAILED")
            logger.error(f"  Thread: {thread_name} (ID: {thread_id})")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)

    def _safe_import_other_media(self):
        """Thread-safe OtherMedia CSV import wrapper"""
        thread_id = threading.get_ident()
        thread_name = threading.current_thread().name
        logger.info("=" * 80)
        logger.info(f"OTHERMEDIA CSV IMPORT THREAD STARTED")
        logger.info(f"  Thread: {thread_name}")
        logger.info(f"  Thread ID: {thread_id}")
        logger.info("=" * 80)

        try:
            if self.other_media_callback:
                logger.debug(f"[Thread {thread_id}] Calling other_media_callback()...")
                logger.debug(
                    f"[Thread {thread_id}] Callback: {self.other_media_callback}"
                )

                start_time = time.time()
                self.other_media_callback()
                elapsed = time.time() - start_time

                logger.info("=" * 80)
                logger.info(f"[SUCCESS] OTHERMEDIA CSV IMPORT COMPLETED SUCCESSFULLY")
                logger.info(f"  Thread: {thread_name}")
                logger.info(f"  Duration: {elapsed:.2f}s")
                logger.info("=" * 80)
            else:
                logger.error(
                    f"[Thread {thread_id}] [ERROR] OtherMedia CSV import callback is None"
                )

        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[ERROR] OTHERMEDIA CSV IMPORT FAILED")
            logger.error(f"  Thread: {thread_name} (ID: {thread_id})")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)
        finally:
            logger.debug(f"[Thread {thread_id}] Plex CSV import thread finishing")

    def _safe_import_runtime(self, json_filename: str):
        """Thread-safe runtime import wrapper"""
        thread_id = threading.get_ident()
        thread_name = threading.current_thread().name
        logger.info("=" * 80)
        logger.info(f"RUNTIME IMPORT THREAD STARTED")
        logger.info(f"  File: {json_filename}")
        logger.info(f"  Thread: {thread_name}")
        logger.info(f"  Thread ID: {thread_id}")
        logger.info("=" * 80)

        try:
            if self.runtime_callback:
                json_path = self.logs_dir / json_filename
                logger.debug(f"[Thread {thread_id}] JSON path: {json_path}")
                logger.debug(
                    f"[Thread {thread_id}] JSON path (absolute): {json_path.absolute()}"
                )
                logger.debug(f"[Thread {thread_id}] File exists: {json_path.exists()}")

                if json_path.exists():
                    file_size = json_path.stat().st_size
                    logger.debug(f"[Thread {thread_id}] File size: {file_size} bytes")
                    file_mtime = json_path.stat().st_mtime
                    logger.debug(
                        f"[Thread {thread_id}] File mtime: {file_mtime} ({datetime.fromtimestamp(file_mtime)})"
                    )
                else:
                    logger.error(f"[Thread {thread_id}] [ERROR] File does not exist!")

                logger.debug(f"[Thread {thread_id}] Calling runtime_callback()...")
                logger.debug(f"[Thread {thread_id}] Callback: {self.runtime_callback}")

                start_time = time.time()
                self.runtime_callback(json_path)
                elapsed = time.time() - start_time

                logger.info("=" * 80)
                logger.info(f"[SUCCESS] RUNTIME IMPORT COMPLETED SUCCESSFULLY")
                logger.info(f"  File: {json_filename}")
                logger.info(f"  Thread: {thread_name}")
                logger.info(f"  Duration: {elapsed:.2f}s")
                logger.info("=" * 80)
            else:
                logger.error(
                    f"[Thread {thread_id}] [ERROR] Runtime import callback is None"
                )

        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[ERROR] RUNTIME IMPORT FAILED")
            logger.error(f"  File: {json_filename}")
            logger.error(f"  Thread: {thread_name} (ID: {thread_id})")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)
        finally:
            logger.debug(f"[Thread {thread_id}] Runtime import thread finishing")


class LogsFileHandler(FileSystemEventHandler):
    """File system event handler for logs directory"""

    # Files to watch
    CSV_FILE = "ImageChoices.csv"
    PLEX_LIBRARY_CSV = "PlexLibexport.csv"
    PLEX_EPISODE_CSV = "PlexEpisodeExport.csv"
    OTHER_MEDIA_LIBRARY_CSV = "OtherMediaServerLibExport.csv"
    OTHER_MEDIA_EPISODE_CSV = "OtherMediaServerEpisodeExport.csv"
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
        logger.info("=" * 80)
        logger.info("LogsFileHandler initialized")
        logger.info(f"  Monitoring CSV: {self.CSV_FILE}")
        logger.info(
            f"  Monitoring Plex CSVs: {self.PLEX_LIBRARY_CSV}, {self.PLEX_EPISODE_CSV}"
        )
        logger.info(f"  Monitoring JSON files: {len(self.RUNTIME_JSON_FILES)}")
        for json_file in sorted(self.RUNTIME_JSON_FILES):
            logger.info(f"    • {json_file}")
        logger.info("=" * 80)

    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            logger.debug(f"EVENT: Directory modification (ignored): {event.src_path}")
            return

        try:
            file_path = Path(event.src_path)
            filename = file_path.name
            logger.info("=" * 80)
            logger.info(f"[EVENT] FILESYSTEM EVENT: File MODIFIED")
            logger.info(f"  File: {filename}")
            logger.info(f"  Path: {file_path}")
            logger.info(f"  Event type: {event.event_type}")
            logger.info("=" * 80)

            # Check if it's a file we're interested in
            if filename == self.CSV_FILE:
                logger.info(f"[OK] File matches monitored CSV: {filename}")
                self.watcher.on_csv_modified()

            elif filename in (self.PLEX_LIBRARY_CSV, self.PLEX_EPISODE_CSV):
                logger.info(f"[OK] File matches monitored Plex CSV: {filename}")
                self.watcher.on_plex_csv_modified()

            elif filename in (
                self.OTHER_MEDIA_LIBRARY_CSV,
                self.OTHER_MEDIA_EPISODE_CSV,
            ):
                logger.info(f"[OK] File matches monitored OtherMedia CSV: {filename}")
                self.watcher.on_other_media_csv_modified()

            elif filename.lower() in self.RUNTIME_JSON_FILES:
                logger.info(f"[OK] File matches monitored JSON: {filename}")
                self.watcher.on_runtime_json_modified(filename)

            else:
                logger.debug(f"[SKIP] File not monitored, ignoring: {filename}")

        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[ERROR] ERROR processing file modification event")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)

    def on_created(self, event):
        """Handle file creation events (treat as modification)"""
        if event.is_directory:
            logger.debug(f"EVENT: Directory creation (ignored): {event.src_path}")
            return

        try:
            file_path = Path(event.src_path)
            filename = file_path.name
            logger.info("=" * 80)
            logger.info(f"[EVENT] FILESYSTEM EVENT: File CREATED")
            logger.info(f"  File: {filename}")
            logger.info(f"  Path: {file_path}")
            logger.info(f"  Event type: {event.event_type}")
            logger.info("=" * 80)

            # Check if it's a file we're interested in
            if filename == self.CSV_FILE:
                logger.info(f"[OK] File matches monitored CSV: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_csv_modified()

            elif filename in (self.PLEX_LIBRARY_CSV, self.PLEX_EPISODE_CSV):
                logger.info(f"[OK] File matches monitored Plex CSV: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_plex_csv_modified()

            elif filename in (
                self.OTHER_MEDIA_LIBRARY_CSV,
                self.OTHER_MEDIA_EPISODE_CSV,
            ):
                logger.info(f"[OK] File matches monitored OtherMedia CSV: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_other_media_csv_modified()

            elif filename.lower() in self.RUNTIME_JSON_FILES:
                logger.info(f"[OK] File matches monitored JSON: {filename}")
                logger.debug("Waiting 0.5s for file to be fully written...")
                # Give the file a moment to be fully written
                time.sleep(0.5)
                logger.debug("File write buffer complete, triggering import")
                self.watcher.on_runtime_json_modified(filename)

            else:
                logger.debug(f"[SKIP]  File not monitored, ignoring: {filename}")

        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"[ERROR] ERROR processing file creation event")
            logger.error(f"  Error: {e}", exc_info=True)
            logger.error("=" * 80)


def create_logs_watcher(
    logs_dir: Path,
    db_instance=None,
    runtime_db_instance=None,
    media_export_db_instance=None,
) -> LogsWatcher:
    """
    Factory function to create and configure a LogsWatcher

    Args:
        logs_dir: Path to the Logs directory
        db_instance: ImageChoices database instance
        runtime_db_instance: Runtime database instance
        media_export_db_instance: Plex export database instance

    Returns:
        Configured LogsWatcher instance
    """
    logger.info("=" * 80)
    logger.info("CREATE LOGS WATCHER - FACTORY FUNCTION")
    logger.info("=" * 80)
    logger.info(f"  logs_dir: {logs_dir}")
    logger.info(f"  logs_dir (type): {type(logs_dir)}")
    logger.info(f"  db_instance: {db_instance}")
    logger.info(
        f"  db_instance (type): {type(db_instance).__name__ if db_instance else 'None'}"
    )
    logger.info(f"  runtime_db_instance: {runtime_db_instance}")
    logger.info(
        f"  runtime_db_instance (type): {type(runtime_db_instance).__name__ if runtime_db_instance else 'None'}"
    )
    logger.info(f"  media_export_db_instance: {media_export_db_instance}")
    logger.info(
        f"  media_export_db_instance (type): {type(media_export_db_instance).__name__ if media_export_db_instance else 'None'}"
    )

    logger.debug("Importing required modules...")
    from database import import_imagechoices_to_db
    from runtime_parser import parse_runtime_from_json
    from runtime_database import runtime_db

    logger.info("[OK] Required modules imported successfully")
    logger.info(f"  - import_imagechoices_to_db: {import_imagechoices_to_db}")
    logger.info(f"  - parse_runtime_from_json: {parse_runtime_from_json}")
    logger.info(f"  - runtime_db: {runtime_db}")

    def import_csv_callback():
        """Callback for CSV imports"""
        logger.info("=" * 80)
        logger.info("CSV IMPORT CALLBACK INVOKED")
        logger.info(f"  DB instance: {db_instance}")
        logger.info(f"  Logs dir: {logs_dir}")
        logger.info("=" * 80)
        try:
            import_imagechoices_to_db(db_instance=db_instance, logs_dir=logs_dir)
            logger.info("[OK] CSV import callback completed successfully")
        except Exception as e:
            logger.error("[ERROR] CSV import callback failed")
            logger.error(f"  Error: {e}", exc_info=True)

    def import_runtime_callback(json_path: Path):
        """Callback for runtime JSON imports"""
        logger.info("=" * 80)
        logger.info("RUNTIME IMPORT CALLBACK INVOKED")
        logger.info(f"  JSON path: {json_path}")
        logger.info("=" * 80)
        try:
            # Determine mode from filename
            mode = json_path.stem.lower()  # e.g., "tautulli", "arr", "normal"
            logger.debug(f"Detected mode from filename: {mode}")

            # Parse the JSON file
            logger.debug(f"Parsing JSON file: {json_path}")
            runtime_data = parse_runtime_from_json(json_path, mode)

            if runtime_data:
                logger.info(
                    f"[OK] Runtime data parsed successfully: {len(runtime_data)} fields"
                )
                logger.debug(f"  Mode: {runtime_data.get('mode')}")
                logger.debug(f"  Runtime: {runtime_data.get('runtime_seconds')}s")
                logger.debug(f"  Total images: {runtime_data.get('total_images')}")

                if runtime_db:
                    logger.debug("Adding runtime entry to database...")
                    runtime_db.add_runtime_entry(**runtime_data)
                    logger.info(
                        f"[SUCCESS] Runtime data from {json_path.name} saved to database"
                    )
                else:
                    logger.error("[ERROR] runtime_db is None, cannot save to database")
            else:
                logger.warning(f"[WARN]  No runtime data parsed from {json_path.name}")
                logger.debug(f"parse_runtime_from_json() returned: {runtime_data}")

        except Exception as e:
            logger.error("[ERROR] Runtime import callback failed")
            logger.error(f"  File: {json_path.name}")
            logger.error(f"  Error: {e}", exc_info=True)

    def import_plex_callback():
        """Callback for Plex CSV imports"""
        logger.info("=" * 80)
        logger.info("PLEX CSV IMPORT CALLBACK INVOKED")
        logger.info(f"  Plex Export DB instance: {media_export_db_instance}")
        logger.info(f"  Logs dir: {logs_dir}")
        logger.info("=" * 80)
        try:
            if media_export_db_instance:
                # Import both CSV files to database with the SAME timestamp
                from pathlib import Path
                from datetime import datetime

                # Create a single timestamp for this import run
                run_timestamp = datetime.now().isoformat()
                logger.info(f"Using shared timestamp: {run_timestamp}")

                library_csv = Path(logs_dir) / "PlexLibexport.csv"
                episode_csv = Path(logs_dir) / "PlexEpisodeExport.csv"

                imported_count = 0
                if library_csv.exists():
                    logger.info(f"Importing {library_csv.name}...")
                    lib_count = media_export_db_instance.import_library_csv(
                        library_csv, run_timestamp
                    )
                    logger.info(f"  Imported {lib_count} library records")
                    imported_count += lib_count
                else:
                    logger.warning(f"  {library_csv.name} not found")

                if episode_csv.exists():
                    logger.info(f"Importing {episode_csv.name}...")
                    ep_count = media_export_db_instance.import_episode_csv(
                        episode_csv, run_timestamp
                    )
                    logger.info(f"  Imported {ep_count} episode records")
                    imported_count += ep_count
                else:
                    logger.warning(f"  {episode_csv.name} not found")

                if imported_count > 0:
                    logger.info(
                        f"[OK] Plex CSV import callback completed successfully ({imported_count} total records)"
                    )
                else:
                    logger.warning(
                        "[WARN] Plex CSV import completed but no records were imported (empty or invalid CSV files)"
                    )
            else:
                logger.error("[ERROR] media_export_db_instance is None, cannot import")
        except Exception as e:
            logger.error("[ERROR] Plex CSV import callback failed")
            logger.error(f"  Error: {e}", exc_info=True)

    def import_other_media_callback():
        """Callback for OtherMediaServer (Jellyfin/Emby) CSV imports"""
        logger.info("=" * 80)
        logger.info("OTHER MEDIA CSV IMPORT CALLBACK INVOKED")
        logger.info(f"  Plex Export DB instance: {media_export_db_instance}")
        logger.info(f"  Logs dir: {logs_dir}")
        logger.info("=" * 80)
        try:
            if media_export_db_instance:
                # Import both CSV files to database with the SAME timestamp
                from pathlib import Path
                from datetime import datetime

                # Create a single timestamp for this import run
                run_timestamp = datetime.now().isoformat()
                logger.info(f"Using shared timestamp: {run_timestamp}")

                library_csv = Path(logs_dir) / "OtherMediaServerLibExport.csv"
                episode_csv = Path(logs_dir) / "OtherMediaServerEpisodeExport.csv"

                imported_count = 0
                if library_csv.exists():
                    logger.info(f"Importing {library_csv.name}...")
                    lib_count = media_export_db_instance.import_other_library_csv(
                        library_csv, run_timestamp
                    )
                    logger.info(f"  Imported {lib_count} library records")
                    imported_count += lib_count
                else:
                    logger.warning(f"  {library_csv.name} not found")

                if episode_csv.exists():
                    logger.info(f"Importing {episode_csv.name}...")
                    ep_count = media_export_db_instance.import_other_episode_csv(
                        episode_csv, run_timestamp
                    )
                    logger.info(f"  Imported {ep_count} episode records")
                    imported_count += ep_count
                else:
                    logger.warning(f"  {episode_csv.name} not found")

                if imported_count > 0:
                    logger.info(
                        f"[OK] OtherMedia CSV import callback completed successfully ({imported_count} total records)"
                    )
                else:
                    logger.warning(
                        "[WARN] OtherMedia CSV import completed but no records were imported (empty or invalid CSV files)"
                    )
            else:
                logger.error("[ERROR] media_export_db_instance is None, cannot import")
        except Exception as e:
            logger.error("[ERROR] OtherMedia CSV import callback failed")
            logger.error(f"  Error: {e}", exc_info=True)

    logger.info("Creating LogsWatcher instance...")
    logger.debug("  Callbacks configured:")
    logger.debug(f"    - CSV callback: {import_csv_callback}")
    logger.debug(f"    - Runtime callback: {import_runtime_callback}")
    logger.debug(
        f"    - Plex callback: {import_plex_callback if media_export_db_instance else None}"
    )
    logger.debug(
        f"    - OtherMedia callback: {import_other_media_callback if media_export_db_instance else None}"
    )

    watcher = LogsWatcher(
        logs_dir=logs_dir,
        db_instance=db_instance,
        runtime_db_instance=runtime_db_instance,
        media_export_db_instance=media_export_db_instance,
        import_callback=import_csv_callback,
        runtime_callback=import_runtime_callback,
        plex_callback=import_plex_callback if media_export_db_instance else None,
        other_media_callback=(
            import_other_media_callback if media_export_db_instance else None
        ),
    )

    logger.info("[OK] LogsWatcher instance created successfully")
    logger.info("=" * 80)

    return watcher
