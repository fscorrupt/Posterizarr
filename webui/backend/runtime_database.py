"""
Database module for runtime statistics tracking
"""

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
import logging
import os

logger = logging.getLogger(__name__)

# Determine base directory based on environment
IS_DOCKER = os.getenv("POSTERIZARR_NON_ROOT") == "TRUE"
if IS_DOCKER:
    BASE_DIR = Path("/config")
else:
    # Local: webui/backend/runtime_database.py -> project root (2 levels up)
    BASE_DIR = Path(__file__).parent.parent.parent

# Database path in the database folder
DATABASE_DIR = BASE_DIR / "database"
DB_PATH = DATABASE_DIR / "runtime_stats.db"


class RuntimeDatabase:
    """Database handler for runtime statistics"""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """Initialize the database and create tables if they don't exist"""
        logger.info("=" * 60)
        logger.info("INITIALIZING RUNTIME DATABASE")
        logger.debug(f"Database path: {self.db_path}")

        try:
            # Check if database is being created for the first time
            is_new_database = not self.db_path.exists()
            logger.debug(f"Is new database: {is_new_database}")

            # Ensure database directory exists
            logger.debug(f"Ensuring directory exists: {self.db_path.parent}")
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

            logger.debug("Connecting to database...")
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Create runtime_stats table
            logger.debug("Creating runtime_stats table if not exists...")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS runtime_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    mode TEXT,
                    runtime_seconds INTEGER,
                    runtime_formatted TEXT,
                    total_images INTEGER DEFAULT 0,
                    posters INTEGER DEFAULT 0,
                    seasons INTEGER DEFAULT 0,
                    backgrounds INTEGER DEFAULT 0,
                    titlecards INTEGER DEFAULT 0,
                    collections INTEGER DEFAULT 0,
                    errors INTEGER DEFAULT 0,
                    fallbacks INTEGER DEFAULT 0,
                    tba_skipped INTEGER DEFAULT 0,
                    jap_chines_skipped INTEGER DEFAULT 0,
                    notification_sent INTEGER DEFAULT 0,
                    uptime_kuma INTEGER DEFAULT 0,
                    images_cleared INTEGER DEFAULT 0,
                    folders_cleared INTEGER DEFAULT 0,
                    space_saved TEXT,
                    script_version TEXT,
                    im_version TEXT,
                    start_time TEXT,
                    end_time TEXT,
                    log_file TEXT,
                    status TEXT DEFAULT 'completed',
                    notes TEXT,
                    textless INTEGER DEFAULT 0,
                    truncated INTEGER DEFAULT 0,
                    text INTEGER DEFAULT 0
                )
            """
            )

            # Add migration for new columns (for existing databases)
            logger.debug("Checking for column migrations...")
            try:
                # Check if columns exist, if not add them
                cursor.execute("PRAGMA table_info(runtime_stats)")
                existing_columns = [row[1] for row in cursor.fetchall()]
                logger.debug(f"Existing columns: {len(existing_columns)}")

                new_columns = {
                    "collections": "INTEGER DEFAULT 0",
                    "tba_skipped": "INTEGER DEFAULT 0",
                    "jap_chines_skipped": "INTEGER DEFAULT 0",
                    "notification_sent": "INTEGER DEFAULT 0",
                    "uptime_kuma": "INTEGER DEFAULT 0",
                    "images_cleared": "INTEGER DEFAULT 0",
                    "folders_cleared": "INTEGER DEFAULT 0",
                    "space_saved": "TEXT",
                    "script_version": "TEXT",
                    "im_version": "TEXT",
                    "start_time": "TEXT",
                    "end_time": "TEXT",
                    "fallbacks": "INTEGER DEFAULT 0",
                    "textless": "INTEGER DEFAULT 0",
                    "truncated": "INTEGER DEFAULT 0",
                    "text": "INTEGER DEFAULT 0",
                }

                for col_name, col_type in new_columns.items():
                    if col_name not in existing_columns:
                        logger.debug(f"Adding missing column: {col_name}")
                        cursor.execute(
                            f"ALTER TABLE runtime_stats ADD COLUMN {col_name} {col_type}"
                        )
                        logger.info(f"Added column '{col_name}' to runtime_stats table")
            except Exception as e:
                logger.debug(f"Column migration check: {e}")

            # Create index for faster queries
            logger.debug("Creating timestamp index if not exists...")
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_timestamp 
                ON runtime_stats(timestamp DESC)
            """
            )

            # Create migration tracking table
            logger.debug("Creating migration_info table if not exists...")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS migration_info (
                    key TEXT PRIMARY KEY,
                    value TEXT,
                    updated_at TEXT
                )
            """
            )

            conn.commit()
            conn.close()
            logger.debug("Database initialization committed and connection closed")

            if is_new_database:
                logger.info(f"Runtime database created at {self.db_path}")
                file_size = self.db_path.stat().st_size
                logger.debug(f"New database file size: {file_size} bytes")
                # Auto-run migration for new database
                self._auto_migrate()
            else:
                logger.info(f"Runtime database initialized at {self.db_path}")
                file_size = self.db_path.stat().st_size
                logger.debug(
                    f"Database file size: {file_size} bytes ({file_size/1024:.2f} KB)"
                )
                # Check if migration was already done
                if not self._is_migrated():
                    logger.info(
                        "Migration not yet performed, running auto-migration..."
                    )
                    self._auto_migrate()
                else:
                    logger.debug("Migration already completed, skipping")

            logger.info("=" * 60)

        except Exception as e:
            logger.error(f"Error initializing runtime database: {e}")
            logger.exception("Full traceback:")
            raise

    def _is_migrated(self) -> bool:
        """Check if migration has already been performed"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute(
                "SELECT value FROM migration_info WHERE key = 'logs_migrated'"
            )
            result = cursor.fetchone()
            conn.close()

            return result is not None and result[0] == "true"
        except Exception as e:
            logger.debug(f"Migration check failed: {e}")
            return False

    def _mark_as_migrated(self, imported_count: int):
        """Mark migration as completed"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT OR REPLACE INTO migration_info (key, value, updated_at)
                VALUES (?, ?, ?)
            """,
                ("logs_migrated", "true", datetime.now().isoformat()),
            )

            cursor.execute(
                """
                INSERT OR REPLACE INTO migration_info (key, value, updated_at)
                VALUES (?, ?, ?)
            """,
                ("migrated_entries", str(imported_count), datetime.now().isoformat()),
            )

            conn.commit()
            conn.close()

            logger.info(f"Migration marked as completed ({imported_count} entries)")
        except Exception as e:
            logger.error(f"Error marking migration: {e}")

    def _auto_migrate(self):
        """Automatically migrate runtime data from existing log files and JSON files"""
        try:
            # Determine base directory
            import os

            IS_DOCKER = (
                os.path.exists("/.dockerenv")
                or os.environ.get("DOCKER_ENV", "").lower() == "true"
            )

            if IS_DOCKER:
                BASE_DIR = Path("/config")
            else:
                PROJECT_ROOT = Path(__file__).parent.parent.parent
                BASE_DIR = PROJECT_ROOT

            LOGS_DIR = BASE_DIR / "Logs"

            if not LOGS_DIR.exists():
                logger.info("No Logs directory found, skipping auto-migration")
                self._mark_as_migrated(0)
                return

            logger.info("Starting automatic runtime data migration...")

            imported_count = 0
            skipped_count = 0

            # First, try to import from JSON files (preferred method)
            from runtime_parser import parse_runtime_from_json

            json_files = [
                ("normal.json", "normal"),
                ("manual.json", "manual"),
                ("testing.json", "testing"),
                ("tautulli.json", "tautulli"),
                ("arr.json", "arr"),
                ("syncjelly.json", "syncjelly"),
                ("syncemby.json", "syncemby"),
                ("backup.json", "backup"),
                ("scheduled.json", "scheduled"),
            ]

            logger.info("Checking for JSON files...")
            for json_file, mode in json_files:
                json_path = LOGS_DIR / json_file
                if json_path.exists():
                    try:
                        runtime_data = parse_runtime_from_json(json_path, mode)
                        if runtime_data:
                            self.add_runtime_entry(**runtime_data)
                            imported_count += 1
                            logger.info(f"Imported from {json_file}")
                    except Exception as e:
                        logger.debug(f"  [SKIP]  Skipped {json_file}: {e}")
                        skipped_count += 1

            # Fallback: Import from log files if no JSON files found
            if imported_count == 0:
                logger.info("No JSON files found, checking log files...")
                from runtime_parser import parse_runtime_from_log

                # Check for rotated logs
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

                for log_path, mode in log_files_to_check:
                    try:
                        runtime_data = parse_runtime_from_log(log_path, mode)

                        if runtime_data:
                            self.add_runtime_entry(**runtime_data)
                            imported_count += 1
                            logger.debug(f"Imported from {log_path.name}")
                        else:
                            skipped_count += 1

                    except Exception as e:
                        logger.debug(f"Skipped {log_path.name}: {e}")
                        skipped_count += 1

            logger.info(
                f"Auto-migration complete: {imported_count} imported, {skipped_count} skipped"
            )

            # Mark as migrated
            self._mark_as_migrated(imported_count)

        except Exception as e:
            logger.error(f"Error during auto-migration: {e}")
            # Mark as migrated even on error to prevent repeated attempts
            self._mark_as_migrated(0)

    def add_runtime_entry(
        self,
        mode: str,
        runtime_seconds: int,
        runtime_formatted: str,
        total_images: int = 0,
        posters: int = 0,
        seasons: int = 0,
        backgrounds: int = 0,
        titlecards: int = 0,
        collections: int = 0,
        errors: int = 0,
        tba_skipped: int = 0,
        jap_chines_skipped: int = 0,
        notification_sent: bool = False,
        uptime_kuma: bool = False,
        images_cleared: int = 0,
        folders_cleared: int = 0,
        space_saved: str = None,
        script_version: str = None,
        im_version: str = None,
        start_time: str = None,
        end_time: str = None,
        log_file: str = None,
        status: str = "completed",
        notes: str = None,
        fallbacks: int = 0,
        textless: int = 0,
        truncated: int = 0,
        text: int = 0,
    ) -> int:
        """
        Add a new runtime entry to the database

        Returns:
            int: The ID of the newly created entry
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            timestamp = datetime.now().isoformat()

            cursor.execute(
                """
                INSERT INTO runtime_stats (
                    timestamp, mode, runtime_seconds, runtime_formatted,
                    total_images, posters, seasons, backgrounds, titlecards, collections,
                    errors, tba_skipped, jap_chines_skipped, notification_sent, uptime_kuma,
                    images_cleared, folders_cleared, space_saved, script_version, im_version,
                    start_time, end_time, log_file, status, notes,
                    fallbacks, textless, truncated, text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    timestamp,
                    mode,
                    runtime_seconds,
                    runtime_formatted,
                    total_images,
                    posters,
                    seasons,
                    backgrounds,
                    titlecards,
                    collections,
                    errors,
                    tba_skipped,
                    jap_chines_skipped,
                    1 if notification_sent else 0,
                    1 if uptime_kuma else 0,
                    images_cleared,
                    folders_cleared,
                    space_saved,
                    script_version,
                    im_version,
                    start_time,
                    end_time,
                    log_file,
                    status,
                    notes,
                    fallbacks,
                    textless,
                    truncated,
                    text,
                ),
            )

            entry_id = cursor.lastrowid
            conn.commit()
            conn.close()

            logger.info(
                f"Added runtime entry #{entry_id}: {mode} - {runtime_formatted}"
            )
            return entry_id

        except Exception as e:
            logger.error(f"Error adding runtime entry: {e}")
            raise

    def get_latest_runtime(self) -> Optional[Dict]:
        """Get the most recent runtime entry"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute(
                """
                SELECT * FROM runtime_stats 
                ORDER BY timestamp DESC 
                LIMIT 1
            """
            )

            row = cursor.fetchone()
            conn.close()

            if row:
                return dict(row)
            return None

        except Exception as e:
            logger.error(f"Error getting latest runtime: {e}")
            return None

    def get_runtime_history(
        self, limit: int = 50, offset: int = 0, mode: str = None
    ) -> List[Dict]:
        """
        Get runtime history with pagination

        Args:
            limit: Maximum number of entries to return
            offset: Number of entries to skip
            mode: Filter by mode (optional)

        Returns:
            List of runtime entries
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            if mode:
                cursor.execute(
                    """
                    SELECT * FROM runtime_stats 
                    WHERE mode = ?
                    ORDER BY timestamp DESC 
                    LIMIT ? OFFSET ?
                """,
                    (mode, limit, offset),
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM runtime_stats 
                    ORDER BY timestamp DESC 
                    LIMIT ? OFFSET ?
                """,
                    (limit, offset),
                )

            rows = cursor.fetchall()
            conn.close()

            return [dict(row) for row in rows]

        except Exception as e:
            logger.error(f"Error getting runtime history: {e}")
            return []

    def get_runtime_history_total_count(self, mode: str = None) -> int:
        """
        Get total count of runtime history entries

        Args:
            mode: Filter by mode (optional)

        Returns:
            Total count of entries
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            if mode:
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM runtime_stats 
                    WHERE mode = ?
                """,
                    (mode,),
                )
            else:
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM runtime_stats
                """
                )

            total = cursor.fetchone()[0]
            conn.close()

            return total

        except Exception as e:
            logger.error(f"Error getting runtime history total count: {e}")
            return 0

    def get_runtime_stats_summary(self, days: int = 30) -> Dict:
        """
        Get summary statistics for the last N days

        Args:
            days: Number of days to include in summary

        Returns:
            Dictionary with summary statistics
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Calculate date cutoff
            cutoff_date = datetime.now().replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            cutoff_date = cutoff_date - timedelta(days=days - 1)
            cutoff_str = cutoff_date.isoformat()

            # Get total runs
            cursor.execute(
                """
                SELECT COUNT(*) FROM runtime_stats 
                WHERE timestamp >= ?
            """,
                (cutoff_str,),
            )
            total_runs = cursor.fetchone()[0]

            # Get total images
            cursor.execute(
                """
                SELECT SUM(total_images) FROM runtime_stats 
                WHERE timestamp >= ?
            """,
                (cutoff_str,),
            )
            total_images = cursor.fetchone()[0] or 0

            # Get average runtime
            cursor.execute(
                """
                SELECT AVG(runtime_seconds) FROM runtime_stats 
                WHERE timestamp >= ? AND runtime_seconds > 0
            """,
                (cutoff_str,),
            )
            avg_runtime = cursor.fetchone()[0] or 0

            # Get total errors
            cursor.execute(
                """
                SELECT SUM(errors) FROM runtime_stats 
                WHERE timestamp >= ?
            """,
                (cutoff_str,),
            )
            total_errors = cursor.fetchone()[0] or 0

            # Get counts by mode
            cursor.execute(
                """
                SELECT mode, COUNT(*) as count 
                FROM runtime_stats 
                WHERE timestamp >= ?
                GROUP BY mode
            """,
                (cutoff_str,),
            )
            mode_counts = {row[0]: row[1] for row in cursor.fetchall()}

            # Get latest run details
            cursor.execute(
                """
                SELECT * FROM runtime_stats 
                ORDER BY timestamp DESC 
                LIMIT 1
            """
            )
            latest_row = cursor.fetchone()
            latest_run = None

            if latest_row:
                columns = [desc[0] for desc in cursor.description]
                latest_run_dict = dict(zip(columns, latest_row))
                latest_run = {
                    "total_images": latest_run_dict.get("total_images", 0),
                    "posters": latest_run_dict.get("posters", 0),
                    "seasons": latest_run_dict.get("seasons", 0),
                    "backgrounds": latest_run_dict.get("backgrounds", 0),
                    "titlecards": latest_run_dict.get("titlecards", 0),
                    "collections": latest_run_dict.get("collections", 0),
                    "errors": latest_run_dict.get("errors", 0),
                    "fallbacks": latest_run_dict.get("fallbacks", 0),
                    "textless": latest_run_dict.get("textless", 0),
                    "truncated": latest_run_dict.get("truncated", 0),
                    "text": latest_run_dict.get("text", 0),
                    "tba_skipped": latest_run_dict.get("tba_skipped", 0),
                    "jap_chines_skipped": latest_run_dict.get("jap_chines_skipped", 0),
                    "notification_sent": bool(
                        latest_run_dict.get("notification_sent", 0)
                    ),
                    "uptime_kuma": bool(latest_run_dict.get("uptime_kuma", 0)),
                    "images_cleared": latest_run_dict.get("images_cleared", 0),
                    "folders_cleared": latest_run_dict.get("folders_cleared", 0),
                    "space_saved": latest_run_dict.get("space_saved"),
                    "script_version": latest_run_dict.get("script_version"),
                    "im_version": latest_run_dict.get("im_version"),
                    "start_time": latest_run_dict.get("start_time"),
                    "end_time": latest_run_dict.get("end_time"),
                    "runtime_formatted": latest_run_dict.get("runtime_formatted"),
                    "mode": latest_run_dict.get("mode"),
                }

            conn.close()

            summary = {
                "total_runs": total_runs,
                "total_images": total_images,
                "average_runtime_seconds": int(avg_runtime),
                "average_runtime_formatted": self._format_seconds(int(avg_runtime)),
                "total_errors": total_errors,
                "mode_counts": mode_counts,
                "days": days,
            }

            # Only include latest_run if we found one
            if latest_run:
                summary["latest_run"] = latest_run

            return summary

        except Exception as e:
            logger.error(f"Error getting runtime summary: {e}")
            return {
                "total_runs": 0,
                "total_images": 0,
                "average_runtime_seconds": 0,
                "average_runtime_formatted": "0h:0m:0s",
                "total_errors": 0,
                "mode_counts": {},
                "days": days,
            }

    def delete_old_entries(self, days: int = 90) -> int:
        """
        Delete entries older than specified days

        Args:
            days: Keep entries from the last N days

        Returns:
            Number of deleted entries
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cutoff_date = datetime.now() - timedelta(days=days)
            cutoff_str = cutoff_date.isoformat()

            cursor.execute(
                """
                DELETE FROM runtime_stats 
                WHERE timestamp < ?
            """,
                (cutoff_str,),
            )

            deleted_count = cursor.rowcount
            conn.commit()
            conn.close()

            logger.info(f"Deleted {deleted_count} old runtime entries")
            return deleted_count

        except Exception as e:
            logger.error(f"Error deleting old entries: {e}")
            return 0

    @staticmethod
    def _format_seconds(seconds: int) -> str:
        """Format seconds to 'Xh:Ym:Zs' format"""
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        return f"{hours}h:{minutes}m:{secs}s"

    def migrate_runtime_format(self) -> int:
        """
        Migrate all runtime_formatted entries to new format (Xh:Ym:Zs)
        Returns the number of updated entries
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Get all entries with runtime_seconds
            cursor.execute(
                """
                SELECT id, runtime_seconds FROM runtime_stats 
                WHERE runtime_seconds IS NOT NULL
                """
            )
            entries = cursor.fetchall()

            updated_count = 0
            for entry_id, runtime_seconds in entries:
                # Reformat using the new format
                new_format = self._format_seconds(runtime_seconds)

                cursor.execute(
                    """
                    UPDATE runtime_stats 
                    SET runtime_formatted = ? 
                    WHERE id = ?
                    """,
                    (new_format, entry_id),
                )
                updated_count += 1

            conn.commit()
            conn.close()
            logger.info(f"Migrated {updated_count} runtime entries to new format")
            return updated_count

        except Exception as e:
            logger.error(f"Error migrating runtime format: {e}")
            if "conn" in locals():
                conn.rollback()
                conn.close()
            return 0


# Global database instance
runtime_db = RuntimeDatabase()
