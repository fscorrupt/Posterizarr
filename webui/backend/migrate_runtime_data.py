"""
Migration script to import existing runtime data from log files to database
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from runtime_database import runtime_db
from runtime_parser import parse_runtime_from_log
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Determine if running in Docker
import os

IS_DOCKER = (
    os.path.exists("/.dockerenv") or os.environ.get("DOCKER_ENV", "").lower() == "true"
)

if IS_DOCKER:
    BASE_DIR = Path("/config")
else:
    PROJECT_ROOT = Path(__file__).parent.parent.parent
    BASE_DIR = PROJECT_ROOT

LOGS_DIR = BASE_DIR / "Logs"


def migrate_runtime_data():
    """
    Migrate runtime data from existing log files to database
    """
    logger.info("Starting runtime data migration...")

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

    logger.info(f"Found {len(log_files_to_check)} log files to check")

    imported_count = 0
    skipped_count = 0

    for log_path, mode in log_files_to_check:
        try:
            logger.info(f"Processing {log_path.name} ({mode})...")
            runtime_data = parse_runtime_from_log(log_path, mode)

            if runtime_data:
                runtime_db.add_runtime_entry(**runtime_data)
                imported_count += 1
                logger.info(f"Imported: {runtime_data['runtime_formatted']}")
            else:
                skipped_count += 1
                logger.debug(f" Skipped: No runtime data found")

        except Exception as e:
            logger.error(f"  Error processing {log_path}: {e}")
            skipped_count += 1

    logger.info(
        f"Migration complete: {imported_count} imported, {skipped_count} skipped"
    )
    return imported_count, skipped_count


if __name__ == "__main__":
    migrate_runtime_data()
