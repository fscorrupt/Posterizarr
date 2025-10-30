"""
Database module for Plex export data tracking
Handles PlexLibexport.csv and PlexEpisodeExport.csv data with run history
"""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
import logging
import csv
import os

logger = logging.getLogger(__name__)

# Determine base directory based on environment
IS_DOCKER = os.getenv("POSTERIZARR_NON_ROOT") == "TRUE"
if IS_DOCKER:
    BASE_DIR = Path("/config")
else:
    # Local: webui/backend/plex_export_database.py -> project root (2 levels up)
    BASE_DIR = Path(__file__).parent.parent.parent

# Database path in the database folder
DATABASE_DIR = BASE_DIR / "database"
DB_PATH = DATABASE_DIR / "plex_export.db"
LOGS_DIR = BASE_DIR / "Logs"


class PlexExportDatabase:
    """Database handler for Plex export data"""

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """Initialize the database and create tables if they don't exist"""
        logger.info("=" * 60)
        logger.info("INITIALIZING PLEX EXPORT DATABASE")
        logger.debug(f"Database path: {self.db_path}")

        try:
            # Ensure database directory exists
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Create plex_library_export table
            logger.debug("Creating plex_library_export table if not exists...")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS plex_library_export (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_timestamp TEXT NOT NULL,
                    library_name TEXT,
                    library_type TEXT,
                    library_language TEXT,
                    title TEXT NOT NULL,
                    resolution TEXT,
                    original_title TEXT,
                    season_names TEXT,
                    season_numbers TEXT,
                    season_rating_keys TEXT,
                    year TEXT,
                    tvdbid TEXT,
                    imdbid TEXT,
                    tmdbid TEXT,
                    rating_key TEXT,
                    path TEXT,
                    root_foldername TEXT,
                    extra_folder TEXT,
                    multiple_versions TEXT,
                    plex_poster_url TEXT,
                    plex_background_url TEXT,
                    plex_season_urls TEXT,
                    labels TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(run_timestamp, rating_key)
                )
            """
            )

            # Create plex_episode_export table
            logger.debug("Creating plex_episode_export table if not exists...")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS plex_episode_export (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_timestamp TEXT NOT NULL,
                    show_name TEXT NOT NULL,
                    type TEXT,
                    tvdbid TEXT,
                    tmdbid TEXT,
                    library_name TEXT,
                    season_number TEXT,
                    episodes TEXT,
                    title TEXT,
                    rating_keys TEXT,
                    plex_titlecard_urls TEXT,
                    resolutions TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(run_timestamp, show_name, season_number)
                )
            """
            )

            # Create index for faster queries
            logger.debug("Creating indexes...")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_library_run ON plex_library_export(run_timestamp)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_library_tmdbid ON plex_library_export(tmdbid)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_episode_run ON plex_episode_export(run_timestamp)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_episode_tmdbid ON plex_episode_export(tmdbid)"
            )

            conn.commit()
            conn.close()

            logger.info("✓ Plex export database initialized successfully")
            logger.info("=" * 60)

        except sqlite3.Error as e:
            logger.error(f"Error initializing database: {e}")
            raise

    def import_library_csv(
        self, csv_path: Path, run_timestamp: Optional[str] = None
    ) -> int:
        """
        Import PlexLibexport.csv into the database

        Args:
            csv_path: Path to PlexLibexport.csv
            run_timestamp: Optional timestamp for this run (default: current time)

        Returns:
            Number of records imported
        """
        if not csv_path.exists():
            logger.error(f"CSV file not found: {csv_path}")
            return 0

        if run_timestamp is None:
            run_timestamp = datetime.now().isoformat()

        logger.info(f"Importing PlexLibexport.csv: {csv_path}")
        logger.debug(f"Run timestamp: {run_timestamp}")

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            imported_count = 0
            skipped_count = 0

            with open(csv_path, "r", encoding="utf-8") as f:
                # Detect delimiter (semicolon or comma)
                sample = f.read(1024)
                f.seek(0)
                delimiter = ";" if ";" in sample else ","

                reader = csv.DictReader(f, delimiter=delimiter)

                for row in reader:
                    try:
                        # Remove quotes from values - handle both string and other types
                        clean_row = {}
                        for k, v in row.items():
                            if isinstance(v, str):
                                clean_row[k] = v.strip('"').strip()
                            else:
                                clean_row[k] = str(v).strip() if v is not None else ""

                        # Skip empty rows (check critical fields)
                        if not clean_row.get("title") and not clean_row.get(
                            "ratingKey"
                        ):
                            logger.debug("Skipping empty row")
                            skipped_count += 1
                            continue

                        cursor.execute(
                            """
                            INSERT OR IGNORE INTO plex_library_export (
                                run_timestamp, library_name, library_type, library_language,
                                title, resolution, original_title, season_names, season_numbers,
                                season_rating_keys, year, tvdbid, imdbid, tmdbid, rating_key,
                                path, root_foldername, extra_folder, multiple_versions,
                                plex_poster_url, plex_background_url, plex_season_urls, labels
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                run_timestamp,
                                clean_row.get("Library Name", ""),
                                clean_row.get("Library Type", ""),
                                clean_row.get("Library Language", ""),
                                clean_row.get("title", ""),
                                clean_row.get("Resolution", ""),
                                clean_row.get("originalTitle", ""),
                                clean_row.get("SeasonNames", ""),
                                clean_row.get("SeasonNumbers", ""),
                                clean_row.get("SeasonRatingKeys", ""),
                                clean_row.get("year", ""),
                                clean_row.get("tvdbid", ""),
                                clean_row.get("imdbid", ""),
                                clean_row.get("tmdbid", ""),
                                clean_row.get("ratingKey", ""),
                                clean_row.get("Path", ""),
                                clean_row.get("RootFoldername", ""),
                                clean_row.get("extraFolder", ""),
                                clean_row.get("MultipleVersions", ""),
                                clean_row.get("PlexPosterUrl", ""),
                                clean_row.get("PlexBackgroundUrl", ""),
                                clean_row.get("PlexSeasonUrls", ""),
                                clean_row.get("Labels", ""),
                            ),
                        )

                        if cursor.rowcount > 0:
                            imported_count += 1
                        else:
                            skipped_count += 1

                    except Exception as e:
                        logger.warning(f"Error importing row: {e}")
                        continue

            conn.commit()
            conn.close()

            logger.info(
                f"✓ Imported {imported_count} library records (skipped {skipped_count} duplicates)"
            )
            return imported_count

        except Exception as e:
            logger.error(f"Error importing library CSV: {e}")
            raise

    def import_episode_csv(
        self, csv_path: Path, run_timestamp: Optional[str] = None
    ) -> int:
        """
        Import PlexEpisodeExport.csv into the database

        Args:
            csv_path: Path to PlexEpisodeExport.csv
            run_timestamp: Optional timestamp for this run (default: current time)

        Returns:
            Number of records imported
        """
        if not csv_path.exists():
            logger.error(f"CSV file not found: {csv_path}")
            return 0

        if run_timestamp is None:
            run_timestamp = datetime.now().isoformat()

        logger.info(f"Importing PlexEpisodeExport.csv: {csv_path}")
        logger.debug(f"Run timestamp: {run_timestamp}")

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            imported_count = 0
            skipped_count = 0

            with open(csv_path, "r", encoding="utf-8") as f:
                # Detect delimiter (semicolon or comma)
                sample = f.read(1024)
                f.seek(0)
                delimiter = ";" if ";" in sample else ","

                reader = csv.DictReader(f, delimiter=delimiter)

                for row in reader:
                    try:
                        # Remove quotes from values - handle both string and other types
                        clean_row = {}
                        for k, v in row.items():
                            if isinstance(v, str):
                                clean_row[k] = v.strip('"').strip()
                            else:
                                clean_row[k] = str(v).strip() if v is not None else ""

                        # Skip empty rows (check critical fields)
                        if not clean_row.get("Show Name") and not clean_row.get(
                            "Season Number"
                        ):
                            logger.debug("Skipping empty row")
                            skipped_count += 1
                            continue

                        cursor.execute(
                            """
                            INSERT OR IGNORE INTO plex_episode_export (
                                run_timestamp, show_name, type, tvdbid, tmdbid,
                                library_name, season_number, episodes, title,
                                rating_keys, plex_titlecard_urls, resolutions
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                run_timestamp,
                                clean_row.get("Show Name", ""),
                                clean_row.get("Type", ""),
                                clean_row.get("tvdbid", ""),
                                clean_row.get("tmdbid", ""),
                                clean_row.get("Library Name", ""),
                                clean_row.get("Season Number", ""),
                                clean_row.get("Episodes", ""),
                                clean_row.get("Title", ""),
                                clean_row.get("RatingKeys", ""),
                                clean_row.get("PlexTitleCardUrls", ""),
                                clean_row.get("Resolutions", ""),
                            ),
                        )

                        if cursor.rowcount > 0:
                            imported_count += 1
                        else:
                            skipped_count += 1

                    except Exception as e:
                        logger.warning(f"Error importing row: {e}")
                        continue

            conn.commit()
            conn.close()

            logger.info(
                f"✓ Imported {imported_count} episode records (skipped {skipped_count} duplicates)"
            )
            return imported_count

        except Exception as e:
            logger.error(f"Error importing episode CSV: {e}")
            raise

    def import_latest_csvs(self) -> Dict[str, int]:
        """
        Import the latest CSV files from the Logs directory

        Returns:
            Dictionary with import counts
        """
        library_csv = LOGS_DIR / "PlexLibexport.csv"
        episode_csv = LOGS_DIR / "PlexEpisodeExport.csv"

        # Use current timestamp for this import run
        run_timestamp = datetime.now().isoformat()

        results = {
            "library_count": 0,
            "episode_count": 0,
            "run_timestamp": run_timestamp,
        }

        if library_csv.exists():
            results["library_count"] = self.import_library_csv(
                library_csv, run_timestamp
            )
        else:
            logger.warning(f"PlexLibexport.csv not found at {library_csv}")

        if episode_csv.exists():
            results["episode_count"] = self.import_episode_csv(
                episode_csv, run_timestamp
            )
        else:
            logger.warning(f"PlexEpisodeExport.csv not found at {episode_csv}")

        return results

    def get_all_runs(self) -> List[str]:
        """Get list of all unique run timestamps from both library and episode tables"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute(
                """
                SELECT DISTINCT run_timestamp 
                FROM (
                    SELECT run_timestamp FROM plex_library_export
                    UNION
                    SELECT run_timestamp FROM plex_episode_export
                )
                ORDER BY run_timestamp DESC
                """
            )

            runs = [row[0] for row in cursor.fetchall()]
            conn.close()

            return runs

        except Exception as e:
            logger.error(f"Error getting runs: {e}")
            return []

    def get_library_data(
        self, run_timestamp: Optional[str] = None, limit: Optional[int] = None
    ) -> List[Dict]:
        """
        Get library export data

        Args:
            run_timestamp: Optional specific run to query (default: latest)
            limit: Optional limit on number of results

        Returns:
            List of library records
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            if run_timestamp:
                query = "SELECT * FROM plex_library_export WHERE run_timestamp = ? ORDER BY title"
                params = [run_timestamp]
            else:
                # Get latest run
                query = """
                    SELECT * FROM plex_library_export 
                    WHERE run_timestamp = (SELECT MAX(run_timestamp) FROM plex_library_export)
                    ORDER BY title
                """
                params = []

            if limit:
                query += f" LIMIT {limit}"

            cursor.execute(query, params)
            rows = cursor.fetchall()

            results = [dict(row) for row in rows]
            conn.close()

            return results

        except Exception as e:
            logger.error(f"Error getting library data: {e}")
            return []

    def get_episode_data(
        self, run_timestamp: Optional[str] = None, limit: Optional[int] = None
    ) -> List[Dict]:
        """
        Get episode export data

        Args:
            run_timestamp: Optional specific run to query (default: latest)
            limit: Optional limit on number of results

        Returns:
            List of episode records
        """
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            if run_timestamp:
                query = "SELECT * FROM plex_episode_export WHERE run_timestamp = ? ORDER BY show_name, season_number"
                params = [run_timestamp]
            else:
                # Get latest run
                query = """
                    SELECT * FROM plex_episode_export 
                    WHERE run_timestamp = (SELECT MAX(run_timestamp) FROM plex_episode_export)
                    ORDER BY show_name, season_number
                """
                params = []

            if limit:
                query += f" LIMIT {limit}"

            cursor.execute(query, params)
            rows = cursor.fetchall()

            results = [dict(row) for row in rows]
            conn.close()

            return results

        except Exception as e:
            logger.error(f"Error getting episode data: {e}")
            return []

    def get_statistics(self) -> Dict:
        """Get database statistics"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            stats = {}

            # Total runs (from both tables)
            cursor.execute(
                """
                SELECT COUNT(DISTINCT run_timestamp) FROM (
                    SELECT run_timestamp FROM plex_library_export
                    UNION
                    SELECT run_timestamp FROM plex_episode_export
                )
                """
            )
            stats["total_runs"] = cursor.fetchone()[0]

            # Total library items
            cursor.execute("SELECT COUNT(*) FROM plex_library_export")
            stats["total_library_records"] = cursor.fetchone()[0]

            # Total episode records
            cursor.execute("SELECT COUNT(*) FROM plex_episode_export")
            stats["total_episode_records"] = cursor.fetchone()[0]

            # Latest run timestamp (from both tables)
            cursor.execute(
                """
                SELECT MAX(run_timestamp) FROM (
                    SELECT run_timestamp FROM plex_library_export
                    UNION
                    SELECT run_timestamp FROM plex_episode_export
                )
                """
            )
            stats["latest_run"] = cursor.fetchone()[0]

            # Items in latest run
            if stats["latest_run"]:
                cursor.execute(
                    "SELECT COUNT(*) FROM plex_library_export WHERE run_timestamp = ?",
                    (stats["latest_run"],),
                )
                stats["latest_run_library_count"] = cursor.fetchone()[0]

                cursor.execute(
                    "SELECT COUNT(*) FROM plex_episode_export WHERE run_timestamp = ?",
                    (stats["latest_run"],),
                )
                stats["latest_run_episode_count"] = cursor.fetchone()[0]

                # Count actual episodes (sum of episode numbers in latest run)
                cursor.execute(
                    """
                    SELECT SUM(
                        CASE 
                            WHEN episodes IS NOT NULL AND episodes != '' 
                            THEN LENGTH(episodes) - LENGTH(REPLACE(episodes, ',', '')) + 1
                            ELSE 0
                        END
                    ) FROM plex_episode_export WHERE run_timestamp = ?
                    """,
                    (stats["latest_run"],),
                )
                result = cursor.fetchone()[0]
                stats["latest_run_total_episodes"] = result if result else 0

            conn.close()

            return stats

        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            return {}


# Global database instance
plex_export_db = PlexExportDatabase()


if __name__ == "__main__":
    # Setup logging for standalone testing
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Test the database
    db = PlexExportDatabase()

    # Try to import latest CSVs
    results = db.import_latest_csvs()
    print(f"\nImport Results: {results}")

    # Get statistics
    stats = db.get_statistics()
    print(f"\nDatabase Statistics:")
    for key, value in stats.items():
        print(f"  {key}: {value}")
