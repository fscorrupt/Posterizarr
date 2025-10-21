"""
Database module for managing imagechoices.db
"""

import sqlite3
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ImageChoicesDB:
    """Database class for managing image choices"""

    def __init__(self, db_path: Path):
        """
        Initialize the database connection

        Args:
            db_path: Path to the database file
        """
        self.db_path = db_path
        self.connection = None

    def connect(self):
        """Establish database connection"""
        logger.debug(f"Attempting to connect to database: {self.db_path}")
        try:
            self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
            self.connection.row_factory = sqlite3.Row
            logger.info(f"Connected to database: {self.db_path}")
            logger.debug(f"Connection object: {type(self.connection)}")
        except sqlite3.Error as e:
            logger.error(f"Error connecting to database: {e}")
            logger.exception("Full traceback:")
            raise

    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            logger.info("Database connection closed")

    def create_tables(self):
        """Create the imagechoices table if it doesn't exist"""
        logger.debug("Creating tables if they don't exist...")
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS imagechoices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Title TEXT NOT NULL,
                    Type TEXT,
                    Rootfolder TEXT,
                    LibraryName TEXT,
                    Language TEXT,
                    Fallback TEXT,
                    TextTruncated TEXT,
                    DownloadSource TEXT,
                    FavProviderLink TEXT,
                    Manual TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """
            )
            self.connection.commit()
            logger.info("Table 'imagechoices' created or already exists")
            logger.debug("Table creation/verification complete")
        except sqlite3.Error as e:
            logger.error(f"Error creating table: {e}")
            logger.exception("Full traceback:")
            raise

    def initialize(self):
        """Initialize the database (connect and create tables)"""
        logger.info("=" * 60)
        logger.info("INITIALIZING IMAGE CHOICES DATABASE")

        db_exists = self.db_path.exists()
        logger.debug(f"Database path: {self.db_path}")
        logger.debug(f"Database exists: {db_exists}")

        if db_exists:
            logger.info(f"Database already exists: {self.db_path}")
            file_size = self.db_path.stat().st_size
            logger.debug(
                f"Database file size: {file_size} bytes ({file_size/1024:.2f} KB)"
            )
        else:
            logger.info(f"Creating new empty database: {self.db_path}")

        self.connect()
        self.create_tables()

        if not db_exists:
            logger.info(f"New empty database created successfully: {self.db_path}")

        logger.info("=" * 60)

    def insert_choice(
        self,
        title: str,
        type_: str = None,
        rootfolder: str = None,
        library_name: str = None,
        language: str = None,
        fallback: str = None,
        text_truncated: str = None,
        download_source: str = None,
        fav_provider_link: str = None,
        manual: str = None,
    ):
        """
        Insert a new image choice record

        Args:
            title: Title of the media
            type_: Type of media
            rootfolder: Root folder path
            library_name: Name of the library
            language: Language setting
            fallback: Fallback option
            text_truncated: Text truncation setting
            download_source: Download source
            fav_provider_link: Favorite provider link
            manual: Manual selection flag

        Returns:
            int: ID of the inserted record
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                """
                INSERT INTO imagechoices 
                (Title, Type, Rootfolder, LibraryName, Language, Fallback, 
                 TextTruncated, DownloadSource, FavProviderLink, Manual)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    title,
                    type_,
                    rootfolder,
                    library_name,
                    language,
                    fallback,
                    text_truncated,
                    download_source,
                    fav_provider_link,
                    manual,
                ),
            )
            self.connection.commit()
            logger.info(f"Inserted new record for title: {title}")
            return cursor.lastrowid
        except sqlite3.Error as e:
            logger.error(f"Error inserting record: {e}")
            raise

    def get_all_choices(self):
        """
        Get all image choices ordered by ID descending (newest first)

        Returns:
            list: List of all records
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute("SELECT * FROM imagechoices ORDER BY id DESC")
            return cursor.fetchall()
        except sqlite3.Error as e:
            logger.error(f"Error fetching records: {e}")
            raise

    def get_choice_by_title(self, title: str):
        """
        Get image choice by title

        Args:
            title: Title to search for

        Returns:
            sqlite3.Row or None: Record if found, None otherwise
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute("SELECT * FROM imagechoices WHERE Title = ?", (title,))
            return cursor.fetchone()
        except sqlite3.Error as e:
            logger.error(f"Error fetching record by title: {e}")
            raise

    def get_choice_by_id(self, record_id: int):
        """
        Get image choice by ID

        Args:
            record_id: ID of the record to fetch

        Returns:
            sqlite3.Row or None: Record if found, None otherwise
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute("SELECT * FROM imagechoices WHERE id = ?", (record_id,))
            return cursor.fetchone()
        except sqlite3.Error as e:
            logger.error(f"Error fetching record by ID: {e}")
            raise

    def update_choice(self, record_id: int, **kwargs):
        """
        Update an existing image choice record

        Args:
            record_id: ID of the record to update
            **kwargs: Fields to update
        """
        try:
            # Build the UPDATE query dynamically
            fields = []
            values = []
            for key, value in kwargs.items():
                if key in [
                    "Title",
                    "Type",
                    "Rootfolder",
                    "LibraryName",
                    "Language",
                    "Fallback",
                    "TextTruncated",
                    "DownloadSource",
                    "FavProviderLink",
                    "Manual",
                ]:
                    fields.append(f"{key} = ?")
                    values.append(value)

            if not fields:
                logger.warning("No valid fields to update")
                return

            # Add updated_at timestamp
            fields.append("updated_at = CURRENT_TIMESTAMP")
            values.append(record_id)

            query = f"UPDATE imagechoices SET {', '.join(fields)} WHERE id = ?"
            cursor = self.connection.cursor()
            cursor.execute(query, values)
            self.connection.commit()
            logger.info(f"Updated record ID: {record_id}")
        except sqlite3.Error as e:
            logger.error(f"Error updating record: {e}")
            raise

    def delete_choice(self, record_id: int):
        """
        Delete an image choice record

        Args:
            record_id: ID of the record to delete
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute("DELETE FROM imagechoices WHERE id = ?", (record_id,))
            self.connection.commit()
            logger.info(f"Deleted record ID: {record_id}")
        except sqlite3.Error as e:
            logger.error(f"Error deleting record: {e}")
            raise

    def import_from_csv(self, csv_path: Path) -> dict:
        """
        Import records from ImageChoices.csv file
        Only adds new records that don't already exist (based on Title + Rootfolder combination)

        Args:
            csv_path: Path to the CSV file

        Returns:
            dict: Statistics about the import (added, skipped, errors)
        """
        import csv

        stats = {"added": 0, "skipped": 0, "errors": 0, "error_details": []}

        if not csv_path.exists():
            logger.warning(f"CSV file does not exist: {csv_path}")
            return stats

        try:
            with open(csv_path, "r", encoding="utf-8") as f:
                # CSV uses semicolon as delimiter
                reader = csv.DictReader(f, delimiter=";")

                for row_num, row in enumerate(
                    reader, start=2
                ):  # start=2 because of header
                    try:
                        # Remove quotes and whitespace from values
                        title = row.get("Title", "").strip('"').strip()
                        rootfolder = row.get("Rootfolder", "").strip('"').strip()

                        # Skip empty rows (all fields are empty or just semicolons)
                        if not title and not rootfolder:
                            continue

                        # Get type early for duplicate check
                        type_ = row.get("Type", "").strip('"').strip()

                        # Check if record already exists (based on Title, Rootfolder AND Type)
                        cursor = self.connection.cursor()
                        cursor.execute(
                            "SELECT id FROM imagechoices WHERE Title = ? AND Rootfolder = ? AND Type = ?",
                            (title, rootfolder, type_),
                        )
                        existing = cursor.fetchone()

                        if existing:
                            stats["skipped"] += 1
                            logger.debug(f"Skipping existing record: {title} ({type_})")
                            continue

                        # Insert new record
                        library_name = row.get("LibraryName", "").strip('"').strip()
                        language = row.get("Language", "").strip('"').strip()
                        fallback = row.get("Fallback", "").strip('"').strip()
                        text_truncated = row.get("TextTruncated", "").strip('"').strip()
                        download_source = (
                            row.get("Download Source", "").strip('"').strip()
                        )
                        fav_provider_link = (
                            row.get("Fav Provider Link", "").strip('"').strip()
                        )

                        # Get Manual value from CSV if present, otherwise determine from download_source
                        manual = row.get("Manual", "").strip('"').strip()

                        # If Manual field is empty in CSV, determine from download_source
                        if not manual:
                            # Manual is "false" by default (automatic run)
                            manual = "false"
                            # Check if it's a local file path (indicates manual upload)
                            if download_source == "false" or (
                                download_source
                                and (
                                    download_source.startswith("C:")
                                    or download_source.startswith("/")
                                    or download_source.startswith("\\")
                                )
                            ):
                                manual = "true"

                        self.insert_choice(
                            title=title,
                            type_=type_,
                            rootfolder=rootfolder,
                            library_name=library_name,
                            language=language,
                            fallback=fallback,
                            text_truncated=text_truncated,
                            download_source=download_source,
                            fav_provider_link=fav_provider_link,
                            manual=manual,
                        )
                        stats["added"] += 1

                    except Exception as e:
                        stats["errors"] += 1
                        error_msg = f"Row {row_num}: {str(e)}"
                        stats["error_details"].append(error_msg)
                        logger.error(f"Error importing row {row_num}: {e}")
                        continue

            logger.info(
                f"CSV import completed: {stats['added']} added, {stats['skipped']} skipped, {stats['errors']} errors"
            )

        except Exception as e:
            logger.error(f"Error reading CSV file {csv_path}: {e}")
            stats["errors"] += 1
            stats["error_details"].append(str(e))

        return stats


def init_database(db_path: Path) -> ImageChoicesDB:
    """
    Initialize the database

    Args:
        db_path: Path to the database file

    Returns:
        ImageChoicesDB: Initialized database instance
    """
    db = ImageChoicesDB(db_path)
    db.initialize()
    return db
