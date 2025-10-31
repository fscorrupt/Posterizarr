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
                    tmdbid TEXT,
                    tvdbid TEXT,
                    imdbid TEXT,
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

    def migrate_add_id_columns(self):
        """Add tmdbid, tvdbid, and imdbid columns if they don't exist and set default value 'false'
        Returns True if columns were added (needs ID extraction), False if already existed
        """
        logger.info("Checking for ID columns migration...")
        try:
            cursor = self.connection.cursor()

            # Check if columns already exist
            cursor.execute("PRAGMA table_info(imagechoices)")
            columns = [column[1] for column in cursor.fetchall()]

            columns_to_add = []
            if "tmdbid" not in columns:
                columns_to_add.append("tmdbid")
            if "tvdbid" not in columns:
                columns_to_add.append("tvdbid")
            if "imdbid" not in columns:
                columns_to_add.append("imdbid")

            if columns_to_add:
                logger.info(f"Adding new columns: {', '.join(columns_to_add)}")

                for column in columns_to_add:
                    # Add column with DEFAULT 'false'
                    cursor.execute(
                        f"ALTER TABLE imagechoices ADD COLUMN {column} TEXT DEFAULT 'false'"
                    )
                    logger.info(f"Added column: {column} with default value 'false'")

                # Update all existing NULL values to 'false' (for safety)
                for column in columns_to_add:
                    cursor.execute(
                        f"UPDATE imagechoices SET {column} = 'false' WHERE {column} IS NULL"
                    )
                    updated_count = cursor.rowcount
                    if updated_count > 0:
                        logger.info(
                            f"Set {column} = 'false' for {updated_count} existing records"
                        )

                self.connection.commit()

                # Get total record count
                cursor.execute("SELECT COUNT(*) FROM imagechoices")
                total_records = cursor.fetchone()[0]
                logger.info(
                    f"ID columns migration completed successfully ({total_records} records updated)"
                )

                # Return True to indicate that ID extraction should run
                return True
            else:
                logger.debug("All ID columns already exist, no migration needed")
                # Return False - columns already existed, no need to extract IDs
                return False

        except sqlite3.Error as e:
            logger.error(f"Error during ID columns migration: {e}")
            logger.exception("Full traceback:")
            raise

    def extract_ids_from_rootfolders(self):
        """Extract tmdbid, tvdbid, and imdbid from existing Rootfolder values"""
        logger.info("Extracting IDs from existing Rootfolder values...")
        try:
            import re

            cursor = self.connection.cursor()

            # Get all records that have Rootfolder but IDs are still 'false'
            cursor.execute(
                """
                SELECT id, Rootfolder 
                FROM imagechoices 
                WHERE Rootfolder IS NOT NULL 
                AND Rootfolder != ''
                AND (tmdbid = 'false' OR tvdbid = 'false' OR imdbid = 'false')
            """
            )
            records = cursor.fetchall()

            if not records:
                logger.debug("No records need ID extraction")
                return

            logger.info(f"Extracting IDs from {len(records)} records...")
            updated_count = 0

            for record in records:
                record_id = record[0]
                rootfolder = record[1]

                # Extract IDs using regex
                # Supports multiple bracket formats: {}, [], (), and no brackets
                # Examples: [tmdb-12345], {tmdb-12345}, (tmdb-12345), tmdb-12345
                tmdbid = None
                tvdbid = None
                imdbid = None

                # TMDB: Match any bracket type or no brackets
                tmdb_match = re.search(
                    r"[\[{(]?tmdb-(\d+)[\]})]?", rootfolder, re.IGNORECASE
                )
                if tmdb_match:
                    tmdbid = tmdb_match.group(1)

                # TVDB: Match any bracket type or no brackets
                tvdb_match = re.search(
                    r"[\[{(]?tvdb-(\d+)[\]})]?", rootfolder, re.IGNORECASE
                )
                if tvdb_match:
                    tvdbid = tvdb_match.group(1)

                # IMDB: Match any bracket type or no brackets
                imdb_match = re.search(
                    r"[\[{(]?imdb-(tt\d+)[\]})]?", rootfolder, re.IGNORECASE
                )
                if imdb_match:
                    imdbid = imdb_match.group(1)

                # Update record if any ID was found
                if tmdbid or tvdbid or imdbid:
                    update_fields = []
                    update_values = []

                    if tmdbid:
                        update_fields.append("tmdbid = ?")
                        update_values.append(tmdbid)

                    if tvdbid:
                        update_fields.append("tvdbid = ?")
                        update_values.append(tvdbid)

                    if imdbid:
                        update_fields.append("imdbid = ?")
                        update_values.append(imdbid)

                    if update_fields:
                        update_values.append(record_id)
                        query = f"UPDATE imagechoices SET {', '.join(update_fields)} WHERE id = ?"
                        cursor.execute(query, update_values)
                        updated_count += 1

            self.connection.commit()
            logger.info(
                f"ID extraction completed: {updated_count} records updated with extracted IDs"
            )

        except Exception as e:
            logger.error(f"Error during ID extraction: {e}")
            logger.exception("Full traceback:")
            # Don't raise - this is optional enhancement

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

        # Run migrations for existing databases
        if db_exists:
            # migrate_add_id_columns returns True if columns were just added (need extraction)
            columns_just_added = self.migrate_add_id_columns()

            if columns_just_added:
                logger.info(
                    "New ID columns detected - extracting IDs from existing Rootfolder values (one-time migration)"
                )
                self.extract_ids_from_rootfolders()
            else:
                # Even if columns existed, check if there are any records with 'false' that need extraction
                # This handles cases where previous extraction failed or was interrupted
                cursor = self.connection.cursor()
                cursor.execute(
                    """
                    SELECT COUNT(*) 
                    FROM imagechoices 
                    WHERE Rootfolder IS NOT NULL 
                    AND Rootfolder != ''
                    AND (tmdbid = 'false' OR tvdbid = 'false' OR imdbid = 'false')
                    AND (Rootfolder LIKE '%tmdb-%' OR Rootfolder LIKE '%tvdb-%' OR Rootfolder LIKE '%imdb-%')
                """
                )
                pending_extraction = cursor.fetchone()[0]

                if pending_extraction > 0:
                    logger.info(
                        f"Found {pending_extraction} records with IDs in Rootfolder that need extraction - running extraction"
                    )
                    self.extract_ids_from_rootfolders()
                else:
                    logger.debug(
                        "ID columns already existed and all IDs extracted - skipping (CSV imports will have IDs)"
                    )

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
        tmdbid: str = None,
        tvdbid: str = None,
        imdbid: str = None,
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
            tmdbid: TMDB ID (numeric string or "false")
            tvdbid: TVDB ID (numeric string or "false")
            imdbid: IMDB ID (string like "tt1234567" or "false")

        Returns:
            int: ID of the inserted record
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                """
                INSERT INTO imagechoices 
                (Title, Type, Rootfolder, LibraryName, Language, Fallback, 
                 TextTruncated, DownloadSource, FavProviderLink, Manual,
                 tmdbid, tvdbid, imdbid)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    tmdbid,
                    tvdbid,
                    imdbid,
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

    def get_choice_by_rootfolder(self, rootfolder: str):
        """
        Get image choice by rootfolder name

        Args:
            rootfolder: Rootfolder name to search for (e.g., "Movie Name (2024) {tmdb-12345}")

        Returns:
            sqlite3.Row or None: Record if found, None otherwise
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute("SELECT * FROM imagechoices WHERE Rootfolder = ?", (rootfolder,))
            return cursor.fetchone()
        except sqlite3.Error as e:
            logger.error(f"Error fetching record by rootfolder: {e}")
            raise

    def get_choice_by_rootfolder_and_title(self, rootfolder: str, title: str):
        """
        Get image choice by rootfolder and title (more specific lookup)

        Args:
            rootfolder: Rootfolder name to search for (e.g., "Movie Name (2024) {tmdb-12345}")
            title: Title/filename to search for (e.g., "Season 4", "S04E01", "background")

        Returns:
            sqlite3.Row or None: Record if found, None otherwise
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                "SELECT * FROM imagechoices WHERE Rootfolder = ? AND Title = ?",
                (rootfolder, title)
            )
            return cursor.fetchone()
        except sqlite3.Error as e:
            logger.error(f"Error fetching record by rootfolder and title: {e}")
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
                    "tmdbid",
                    "tvdbid",
                    "imdbid",
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

                        # Get IDs from CSV if present (after script update), otherwise extract from Rootfolder
                        tmdbid = row.get("tmdbid", "").strip('"').strip() or "false"
                        tvdbid = row.get("tvdbid", "").strip('"').strip() or "false"
                        imdbid = row.get("imdbid", "").strip('"').strip() or "false"

                        # If IDs not in CSV, extract from rootfolder name (backward compatibility)
                        # Format: "Movie Name (2024) {tmdb-12345}" or "{tvdb-67890}" or "{imdb-tt1234567}"
                        if (
                            tmdbid == "false"
                            and tvdbid == "false"
                            and imdbid == "false"
                        ) and rootfolder:
                            import re

                            # Extract tmdb ID
                            tmdb_match = re.search(r"\{tmdb-(\d+)\}", rootfolder)
                            if tmdb_match:
                                tmdbid = tmdb_match.group(1)

                            # Extract tvdb ID
                            tvdb_match = re.search(r"\{tvdb-(\d+)\}", rootfolder)
                            if tvdb_match:
                                tvdbid = tvdb_match.group(1)

                            # Extract imdb ID
                            imdb_match = re.search(r"\{imdb-(tt\d+)\}", rootfolder)
                            if imdb_match:
                                imdbid = imdb_match.group(1)

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
                            tmdbid=tmdbid,
                            tvdbid=tvdbid,
                            imdbid=imdbid,
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


def import_imagechoices_to_db(db_instance=None, logs_dir=None):
    """
    Import ImageChoices.csv from Logs directory to database
    Only imports new records that don't already exist

    Args:
        db_instance: The database instance to use. If None, will use state.db
        logs_dir: The logs directory path. If None, will use default LOGS_DIR
    """
    import logging
    from pathlib import Path

    logger = logging.getLogger(__name__)

    # Use provided db or get from state
    if db_instance:
        db = db_instance
    else:
        try:
            from utils import state  # type: ignore

            db = getattr(state, "db", None)
        except ImportError:
            logger.warning("utils module not available and no db_instance provided")
            db = None

    if not db:
        logger.debug("Database not available, skipping CSV import")
        return

    # Determine logs directory
    if logs_dir is None:
        import os
        from pathlib import Path

        IS_DOCKER = os.getenv("POSTERIZARR_NON_ROOT") == "TRUE"
        if IS_DOCKER:
            BASE_DIR = Path("/config")
        else:
            BASE_DIR = Path(__file__).parent.parent.parent
        logs_dir = BASE_DIR / "Logs"

    csv_path = Path(logs_dir) / "ImageChoices.csv"
    if not csv_path.exists():
        logger.debug("ImageChoices.csv does not exist yet, skipping import")
        return

    try:
        logger.info("Importing ImageChoices.csv to database...")
        stats = db.import_from_csv(csv_path)

        if stats["added"] > 0:
            logger.info(
                f"CSV import successful: {stats['added']} new record(s) added, "
                f"{stats['skipped']} skipped (already exist), "
                f"{stats['errors']} error(s)"
            )
        else:
            logger.debug(
                f"CSV import: No new records to add ({stats['skipped']} already exist)"
            )

        if stats["errors"] > 0:
            logger.warning(f"Import errors: {stats['error_details']}")

    except Exception as e:
        logger.error(f"Error importing CSV to database: {e}")
