"""
Config Database Module
Manages configuration data in SQLite database
Automatically syncs with config.json on startup
"""

import sqlite3
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class ConfigDB:
    """Database class for managing configuration in SQLite"""

    def __init__(self, db_path: Path, config_json_path: Path):
        """
        Initialize the config database

        Args:
            db_path: Path to the database file
            config_json_path: Path to the config.json file
        """
        self.db_path = db_path
        self.config_json_path = config_json_path
        self.connection = None

    def connect(self):
        """Establish database connection"""
        try:
            self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
            self.connection.row_factory = sqlite3.Row
            logger.info(f"Connected to config database: {self.db_path}")
        except sqlite3.Error as e:
            logger.error(f"Error connecting to config database: {e}")
            raise

    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            logger.info("Config database connection closed")

    def create_tables(self):
        """Create the config tables if they don't exist"""
        try:
            cursor = self.connection.cursor()

            # Main config table - stores all config values in a key-value structure
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    section TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT,
                    value_type TEXT NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(section, key)
                )
            """
            )

            # Index for faster lookups
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_config_section 
                ON config(section)
            """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_config_key 
                ON config(section, key)
            """
            )

            # Metadata table - stores information about the config sync
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS config_metadata (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    last_sync_time TIMESTAMP,
                    config_file_path TEXT,
                    sync_status TEXT,
                    sync_message TEXT
                )
            """
            )

            self.connection.commit()
            logger.info("Config database tables created successfully")
        except sqlite3.Error as e:
            logger.error(f"Error creating config tables: {e}")
            raise

    def _get_value_type(self, value: Any) -> str:
        """Determine the type of a value for storage"""
        if isinstance(value, bool):
            return "boolean"
        elif isinstance(value, int):
            return "integer"
        elif isinstance(value, float):
            return "float"
        elif isinstance(value, list):
            return "list"
        elif isinstance(value, dict):
            return "dict"
        else:
            return "string"

    def _serialize_value(self, value: Any) -> str:
        """Serialize a value for storage in the database"""
        if isinstance(value, (list, dict)):
            return json.dumps(value)
        elif isinstance(value, bool):
            return "true" if value else "false"
        else:
            return str(value)

    def _deserialize_value(self, value_str: str, value_type: str) -> Any:
        """Deserialize a value from the database"""
        if value_type == "boolean":
            return value_str.lower() == "true"
        elif value_type == "integer":
            return int(value_str)
        elif value_type == "float":
            return float(value_str)
        elif value_type == "list" or value_type == "dict":
            return json.loads(value_str)
        else:
            return value_str

    def import_from_json(self, config_data: Dict = None):
        """
        Import configuration from JSON data or from config.json file

        Args:
            config_data: Optional dictionary with config data. If None, reads from config.json
        """
        try:
            # Load config from file if not provided
            if config_data is None:
                if not self.config_json_path.exists():
                    logger.error(f"Config file not found: {self.config_json_path}")
                    return False

                with open(self.config_json_path, "r", encoding="utf-8") as f:
                    config_data = json.load(f)
                logger.info(f"Loaded config from: {self.config_json_path}")

            cursor = self.connection.cursor()
            imported_count = 0
            updated_count = 0

            # Iterate through all sections and keys
            for section, section_data in config_data.items():
                if not isinstance(section_data, dict):
                    # Handle non-dict values at root level (shouldn't happen but just in case)
                    value_type = self._get_value_type(section_data)
                    value_str = self._serialize_value(section_data)

                    cursor.execute(
                        """
                        INSERT INTO config (section, key, value, value_type, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(section, key) 
                        DO UPDATE SET 
                            value = excluded.value,
                            value_type = excluded.value_type,
                            updated_at = excluded.updated_at
                    """,
                        ("_root", section, value_str, value_type, datetime.now()),
                    )
                    imported_count += 1
                    continue

                # Handle section with key-value pairs
                for key, value in section_data.items():
                    value_type = self._get_value_type(value)
                    value_str = self._serialize_value(value)

                    # Check if entry exists
                    cursor.execute(
                        """
                        SELECT id, value FROM config 
                        WHERE section = ? AND key = ?
                    """,
                        (section, key),
                    )

                    existing = cursor.fetchone()

                    if existing:
                        # Update if value changed
                        if existing[1] != value_str:
                            cursor.execute(
                                """
                                UPDATE config 
                                SET value = ?, value_type = ?, updated_at = ?
                                WHERE section = ? AND key = ?
                            """,
                                (value_str, value_type, datetime.now(), section, key),
                            )
                            updated_count += 1
                    else:
                        # Insert new entry
                        cursor.execute(
                            """
                            INSERT INTO config (section, key, value, value_type, updated_at)
                            VALUES (?, ?, ?, ?, ?)
                        """,
                            (section, key, value_str, value_type, datetime.now()),
                        )
                        imported_count += 1

            # Update metadata
            cursor.execute(
                """
                INSERT INTO config_metadata (last_sync_time, config_file_path, sync_status, sync_message)
                VALUES (?, ?, ?, ?)
            """,
                (
                    datetime.now(),
                    str(self.config_json_path),
                    "success",
                    f"Imported {imported_count} new entries, updated {updated_count} entries",
                ),
            )

            self.connection.commit()
            logger.info(
                f"Config imported successfully: {imported_count} new, {updated_count} updated"
            )
            return True

        except json.JSONDecodeError as e:
            logger.error(f"Error parsing JSON: {e}")
            return False
        except sqlite3.Error as e:
            logger.error(f"Database error during import: {e}")
            self.connection.rollback()
            return False
        except Exception as e:
            logger.error(f"Unexpected error during import: {e}")
            self.connection.rollback()
            return False

    def export_to_json(self, output_path: Path = None) -> Dict:
        """
        Export configuration from database to JSON format

        Args:
            output_path: Optional path to write the JSON file. If None, returns dict only.

        Returns:
            Dictionary with the configuration data
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                """
                SELECT section, key, value, value_type 
                FROM config 
                ORDER BY section, key
            """
            )

            config_data = {}

            for row in cursor.fetchall():
                section = row[0]
                key = row[1]
                value_str = row[2]
                value_type = row[3]

                # Deserialize value
                value = self._deserialize_value(value_str, value_type)

                # Build nested structure
                if section == "_root":
                    config_data[key] = value
                else:
                    if section not in config_data:
                        config_data[section] = {}
                    config_data[section][key] = value

            # Write to file if path provided
            if output_path:
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(config_data, f, indent=2, ensure_ascii=False)
                logger.info(f"Config exported to: {output_path}")

            return config_data

        except sqlite3.Error as e:
            logger.error(f"Database error during export: {e}")
            return {}
        except Exception as e:
            logger.error(f"Unexpected error during export: {e}")
            return {}

    def get_value(self, section: str, key: str, default: Any = None) -> Any:
        """
        Get a configuration value

        Args:
            section: Config section name
            key: Config key name
            default: Default value if not found

        Returns:
            The configuration value or default
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                """
                SELECT value, value_type FROM config 
                WHERE section = ? AND key = ?
            """,
                (section, key),
            )

            row = cursor.fetchone()
            if row:
                return self._deserialize_value(row[0], row[1])
            return default

        except sqlite3.Error as e:
            logger.error(f"Error getting value: {e}")
            return default

    def set_value(self, section: str, key: str, value: Any) -> bool:
        """
        Set a configuration value

        Args:
            section: Config section name
            key: Config key name
            value: Value to set

        Returns:
            True if successful, False otherwise
        """
        try:
            cursor = self.connection.cursor()
            value_type = self._get_value_type(value)
            value_str = self._serialize_value(value)

            cursor.execute(
                """
                INSERT INTO config (section, key, value, value_type, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(section, key) 
                DO UPDATE SET 
                    value = excluded.value,
                    value_type = excluded.value_type,
                    updated_at = excluded.updated_at
            """,
                (section, key, value_str, value_type, datetime.now()),
            )

            self.connection.commit()
            return True

        except sqlite3.Error as e:
            logger.error(f"Error setting value: {e}")
            return False

    def get_section(self, section: str) -> Dict:
        """
        Get all values from a configuration section

        Args:
            section: Config section name

        Returns:
            Dictionary with all key-value pairs in the section
        """
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                """
                SELECT key, value, value_type FROM config 
                WHERE section = ?
                ORDER BY key
            """,
                (section,),
            )

            result = {}
            for row in cursor.fetchall():
                key = row[0]
                value = self._deserialize_value(row[1], row[2])
                result[key] = value

            return result

        except sqlite3.Error as e:
            logger.error(f"Error getting section: {e}")
            return {}

    def get_all_sections(self) -> list:
        """Get list of all configuration sections"""
        try:
            cursor = self.connection.cursor()
            cursor.execute(
                """
                SELECT DISTINCT section FROM config 
                WHERE section != '_root'
                ORDER BY section
            """
            )

            return [row[0] for row in cursor.fetchall()]

        except sqlite3.Error as e:
            logger.error(f"Error getting sections: {e}")
            return []

    def initialize(self):
        """Initialize the database (connect, create tables, import from JSON)"""
        db_exists = self.db_path.exists()

        if db_exists:
            logger.info(f" Config database already exists: {self.db_path}")
        else:
            logger.info(f" Creating new config database: {self.db_path}")

        self.connect()
        self.create_tables()

        # Always sync with config.json on startup
        logger.info(f"Syncing config database with config.json...")
        success = self.import_from_json()

        if success:
            if not db_exists:
                logger.info(f"Config database created and populated from config.json")
            else:
                logger.info(f"Config database synced with config.json")
        else:
            logger.warning(f" Config database sync had issues")
