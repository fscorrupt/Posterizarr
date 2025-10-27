"""
Config Router
============================================================

Configuration management endpoints

Endpunkte:
- GET /api/config
- POST /api/config
- GET /api/config-db/status
- GET /api/config-db/section/{section}
- GET /api/config-db/value/{section}/{key}
- POST /api/config-db/sync
- GET /api/config-db/export
"""

from fastapi import APIRouter, HTTPException
from pathlib import Path
import json
import logging
from typing import Optional

from models.request_models import ConfigUpdate

router = APIRouter(prefix="/api", tags=["config"])
logger = logging.getLogger(__name__)

# These will be injected by initialize_routers()
CONFIG_PATH: Optional[Path] = None
CONFIG_MAPPER_AVAILABLE: bool = False
CONFIG_DATABASE_AVAILABLE: bool = False
config_db = None
flatten_config = None
unflatten_config = None
get_display_name = None
UI_GROUPS = None
CONFIG_TOOLTIPS = None


def setup_dependencies(
    config_path: Path,
    config_mapper_available: bool,
    config_database_available: bool,
    config_database=None,
    config_mapper_flatten=None,
    config_mapper_unflatten=None,
    config_mapper_display_name=None,
    ui_groups=None,
    config_tooltips=None,
):
    """Setup router dependencies"""
    global CONFIG_PATH, CONFIG_MAPPER_AVAILABLE, CONFIG_DATABASE_AVAILABLE
    global config_db, flatten_config, unflatten_config, get_display_name
    global UI_GROUPS, CONFIG_TOOLTIPS

    CONFIG_PATH = config_path
    CONFIG_MAPPER_AVAILABLE = config_mapper_available
    CONFIG_DATABASE_AVAILABLE = config_database_available
    config_db = config_database
    flatten_config = config_mapper_flatten
    unflatten_config = config_mapper_unflatten
    get_display_name = config_mapper_display_name
    UI_GROUPS = ui_groups
    CONFIG_TOOLTIPS = config_tooltips


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.get("/config")
async def get_config():
    """Get current config.json - returns FLAT structure for UI when config_mapper available"""
    logger.info("=" * 60)
    logger.info("CONFIG READ REQUEST")
    logger.debug(f"Config path: {CONFIG_PATH}")
    logger.debug(f"Config mapper available: {CONFIG_MAPPER_AVAILABLE}")

    try:
        if not CONFIG_PATH.exists():
            logger.error(f"Config file not found at: {CONFIG_PATH}")
            logger.debug(f"Base directory: {CONFIG_PATH.parent}")
            error_msg = f"Config file not found at: {CONFIG_PATH}\n"
            error_msg += f"Base directory: {CONFIG_PATH.parent}\n"
            error_msg += "Please create config.json from config.example.json"
            raise HTTPException(status_code=404, detail=error_msg)

        logger.debug("Reading config file...")
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        logger.debug(f"Config loaded: {len(grouped_config)} top-level keys")
        logger.debug(f"Top-level keys: {list(grouped_config.keys())}")

        # If config_mapper is available, transform to flat structure
        if CONFIG_MAPPER_AVAILABLE:
            logger.debug("Flattening config structure...")
            flat_config = flatten_config(grouped_config)
            logger.debug(f"Flat config: {len(flat_config)} keys")

            # Build display names for all keys in the config
            logger.debug("Building display names dictionary...")
            display_names_dict = {}
            for key in flat_config.keys():
                display_names_dict[key] = get_display_name(key)

            logger.info(f"Config read successful: {len(flat_config)} settings")
            logger.info("=" * 60)

            return {
                "success": True,
                "config": flat_config,
                "ui_groups": UI_GROUPS,  # Helps frontend organize fields
                "display_names": display_names_dict,  # Send display names to frontend
                "tooltips": CONFIG_TOOLTIPS,  # Send tooltips to frontend
                "using_flat_structure": True,
            }
        else:
            # Fallback: return grouped structure as-is
            logger.info(
                f"Config read successful (grouped): {len(grouped_config)} sections"
            )
            logger.info("=" * 60)
            return {
                "success": True,
                "config": grouped_config,
                "tooltips": {},  # Empty object as fallback
                "using_flat_structure": False,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading config: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config")
async def update_config(data: ConfigUpdate):
    """Update config.json - accepts FLAT structure and saves as GROUPED when config_mapper available"""
    logger.info("=" * 60)
    logger.info("CONFIG UPDATE REQUEST")
    logger.debug(f"Number of config keys to update: {len(data.config)}")
    logger.debug(f"Config mapper available: {CONFIG_MAPPER_AVAILABLE}")

    try:
        # Load current config to detect changes
        logger.debug("Loading current config to detect changes...")
        current_config = {}
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                current_config = json.load(f)

        # Flatten current config if needed for comparison
        if CONFIG_MAPPER_AVAILABLE and current_config:
            current_flat = flatten_config(current_config)
        else:
            current_flat = current_config

        # Detect and log changes
        changes_detected = []
        for key, new_value in data.config.items():
            old_value = current_flat.get(key)
            if old_value != new_value:
                # Mask sensitive values in logs
                if any(
                    sensitive in key.lower()
                    for sensitive in ["password", "token", "key", "api"]
                ):
                    old_display = "***" if old_value else None
                    new_display = "***" if new_value else None
                else:
                    old_display = old_value
                    new_display = new_value

                changes_detected.append(
                    {"key": key, "old": old_display, "new": new_display}
                )
                logger.info(f"CONFIG CHANGE: {key}")
                logger.info(f"  Old value: {old_display}")
                logger.info(f"  New value: {new_display}")

        if changes_detected:
            logger.info(f"Total changes detected: {len(changes_detected)}")
            logger.debug(f"Changed keys: {[c['key'] for c in changes_detected]}")
        else:
            logger.info("No changes detected in config")

        logger.info("Saving config changes to config.json...")

        # If config_mapper is available, transform flat config back to grouped structure
        if CONFIG_MAPPER_AVAILABLE:
            logger.debug("Transforming flat config back to grouped structure...")
            grouped_config = unflatten_config(data.config)
            logger.debug(f"Grouped config: {len(grouped_config)} sections")

            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(grouped_config, f, indent=2, ensure_ascii=False)

            file_size = CONFIG_PATH.stat().st_size
            logger.info(f"Config saved successfully to config.json (flat -> grouped)")
            logger.debug(f"File size: {file_size} bytes")
        else:
            # Fallback: save as-is (assuming grouped structure)
            logger.debug("Saving config as grouped structure (no mapper)...")
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(data.config, f, indent=2, ensure_ascii=False)

            file_size = CONFIG_PATH.stat().st_size
            logger.info("Config saved successfully to config.json (grouped structure)")
            logger.debug(f"File size: {file_size} bytes")

        # Also update config database if available
        if CONFIG_DATABASE_AVAILABLE and config_db:
            try:
                logger.info("Syncing config changes to database...")
                # Sync the updated config to database
                config_db.import_from_json()
                logger.info("Config database synced successfully with config.json")

                # Log changes to database as well
                if changes_detected:
                    logger.debug(
                        f"Database now contains {len(changes_detected)} updated values"
                    )
            except Exception as db_error:
                logger.warning(f"Could not sync config database: {db_error}")
                logger.debug(f"Database sync error details: {str(db_error)}")
        else:
            logger.info("Config database not available, skipping database sync")

        logger.info("=" * 60)
        return {
            "success": True,
            "message": "Config updated successfully",
            "changes_count": len(changes_detected),
        }
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config-db/status")
async def get_config_db_status():
    """Get config database status and statistics"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            return {
                "success": False,
                "available": False,
                "message": "Config database not available",
            }

        # Get all sections and count
        sections = config_db.get_all_sections()

        # Get metadata
        cursor = config_db.connection.cursor()
        cursor.execute(
            "SELECT * FROM config_metadata ORDER BY last_sync_time DESC LIMIT 1"
        )
        metadata_row = cursor.fetchone()

        metadata = None
        if metadata_row:
            metadata = {
                "last_sync_time": metadata_row[1],
                "config_file_path": metadata_row[2],
                "sync_status": metadata_row[3],
                "sync_message": metadata_row[4],
            }

        # Count total entries
        cursor.execute("SELECT COUNT(*) FROM config")
        total_entries = cursor.fetchone()[0]

        return {
            "success": True,
            "available": True,
            "database_path": str(config_db.db_path),
            "sections": sections,
            "section_count": len(sections),
            "total_entries": total_entries,
            "metadata": metadata,
        }
    except Exception as e:
        logger.error(f"Error getting config database status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config-db/section/{section}")
async def get_config_db_section(section: str):
    """Get all values from a specific config section"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        section_data = config_db.get_section(section)

        return {"success": True, "section": section, "data": section_data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting config section: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config-db/value/{section}/{key}")
async def get_config_db_value(section: str, key: str):
    """Get a specific config value"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        value = config_db.get_value(section, key)

        if value is None:
            raise HTTPException(
                status_code=404, detail=f"Config value not found: {section}.{key}"
            )

        return {"success": True, "section": section, "key": key, "value": value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting config value: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config-db/sync")
async def sync_config_db():
    """Manually trigger sync from config.json to config database"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        success = config_db.import_from_json()

        if success:
            return {
                "success": True,
                "message": "Config database synced successfully with config.json",
            }
        else:
            return {
                "success": False,
                "message": "Config database sync completed with warnings",
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing config database: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config-db/export")
async def export_config_db():
    """Export config database to JSON format"""
    try:
        if not CONFIG_DATABASE_AVAILABLE or not config_db:
            raise HTTPException(status_code=503, detail="Config database not available")

        config_data = config_db.export_to_json()

        return {"success": True, "config": config_data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting config database: {e}")
        raise HTTPException(status_code=500, detail=str(e))
