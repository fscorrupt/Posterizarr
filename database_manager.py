#!/usr/bin/env python3
"""
Database Manager for Posterizarr
Automatically syncs ImageChoices.csv to SQLite database
"""

import sqlite3
import csv
import os
from pathlib import Path
from typing import Optional


def get_database_path(base_path: Optional[str] = None) -> Path:
    """Get the database file path"""
    if base_path is None:
        base_path = Path(__file__).parent
    else:
        base_path = Path(base_path)
    return base_path / "database" / "posterizarr.db"


def get_csv_path(base_path: Optional[str] = None) -> Path:
    """Get the CSV file path"""
    if base_path is None:
        base_path = Path(__file__).parent
    else:
        base_path = Path(base_path)
    return base_path / "Logs" / "ImageChoices.csv"


def ensure_database_exists(db_path: Path) -> sqlite3.Connection:
    """
    Ensure database and tables exist, return connection
    Creates database directory if needed
    """
    # Create directory if needed
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # Connect (creates file if not exists)
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Create table if not exists
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS image_choices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            rootfolder TEXT NOT NULL,
            library_name TEXT NOT NULL,
            language TEXT NOT NULL,
            fallback TEXT NOT NULL,
            text_truncated TEXT NOT NULL,
            download_source TEXT,
            fav_provider_link TEXT,
            is_manually_created TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
        )
    """
    )

    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_title ON image_choices(title)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_library_name ON image_choices(library_name)"
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_type ON image_choices(type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_language ON image_choices(language)")

    # Add is_manually_created column if it doesn't exist (for existing databases)
    cursor.execute("PRAGMA table_info(image_choices)")
    columns = [column[1] for column in cursor.fetchall()]
    if "is_manually_created" not in columns:
        cursor.execute(
            "ALTER TABLE image_choices ADD COLUMN is_manually_created TEXT NOT NULL DEFAULT 'false'"
        )

    conn.commit()
    return conn


def sync_csv_to_database(csv_path: Path, db_path: Path) -> int:
    """
    Sync CSV data to database
    Adds new records from CSV (no duplicates based on title+type+rootfolder)
    Returns number of records imported
    """
    if not csv_path.exists():
        return 0

    conn = ensure_database_exists(db_path)
    cursor = conn.cursor()

    # Import CSV data (only new records)
    records_imported = 0
    records_skipped = 0
    try:
        with open(csv_path, "r", encoding="utf-8") as csvfile:
            csv_reader = csv.DictReader(csvfile, delimiter=";")

            for row in csv_reader:
                title = row["Title"].strip('"')
                image_type = row["Type"].strip('"')
                rootfolder = row["Rootfolder"].strip('"')

                # Check if record already exists
                cursor.execute(
                    """
                    SELECT id FROM image_choices 
                    WHERE title = ? AND type = ? AND rootfolder = ?
                """,
                    (title, image_type, rootfolder),
                )

                if cursor.fetchone() is None:
                    # Record doesn't exist, insert it
                    cursor.execute(
                        """
                        INSERT INTO image_choices 
                        (title, type, rootfolder, library_name, language, 
                         fallback, text_truncated, download_source, fav_provider_link, is_manually_created)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                        (
                            title,
                            image_type,
                            rootfolder,
                            row["LibraryName"].strip('"'),
                            row["Language"].strip('"'),
                            row["Fallback"].strip('"'),
                            row["TextTruncated"].strip('"'),
                            row["Download Source"].strip('"'),
                            row["Fav Provider Link"].strip('"'),
                            "false",
                        ),
                    )
                    records_imported += 1
                else:
                    records_skipped += 1

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

    return records_imported


def update_database(base_path: Optional[str] = None, silent: bool = True) -> dict:
    """
    Main function to update database from CSV
    Called automatically after CSV is written

    Args:
        base_path: Base path of the project
        silent: If True, suppress output

    Returns:
        dict with status information
    """
    try:
        db_path = get_database_path(base_path)
        csv_path = get_csv_path(base_path)

        records = sync_csv_to_database(csv_path, db_path)

        if not silent:
            print(f"[OK] Database updated: {records} records imported")

        return {"success": True, "records": records, "database": str(db_path)}
    except Exception as e:
        if not silent:
            print(f"[ERROR] Database update failed: {e}")
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import sys

    base_path = sys.argv[1] if len(sys.argv) > 1 else None
    silent = "--silent" in sys.argv

    result = update_database(base_path=base_path, silent=silent)
    sys.exit(0 if result["success"] else 1)
