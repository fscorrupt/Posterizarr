"""
Config Router - Handles configuration endpoints
Includes: config.json management, config database operations
"""
from fastapi import APIRouter, HTTPException
from pathlib import Path
import json
import logging
from typing import Optional

from ..models import ConfigUpdate
from ..core import cache, cached, invalidate_cache_pattern

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["config"])

# These will be injected from main.py
CONFIG_PATH: Optional[Path] = None
BASE_DIR: Optional[Path] = None
config_db = None
CONFIG_MAPPER_AVAILABLE = False
CONFIG_DATABASE_AVAILABLE = False


def init_config_router(
    config_path: Path,
    base_dir: Path,
    config_database=None,
    mapper_available: bool = False,
    database_available: bool = False,
    ui_groups=None,
    config_tooltips=None,
    flatten_func=None,
    unflatten_func=None,
    get_display_name_func=None,
):
    """Initialize router with dependencies"""
    global CONFIG_PATH, BASE_DIR, config_db, CONFIG_MAPPER_AVAILABLE, CONFIG_DATABASE_AVAILABLE
    global UI_GROUPS, CONFIG_TOOLTIPS, flatten_config, unflatten_config, get_display_name

    CONFIG_PATH = config_path
    BASE_DIR = base_dir
    config_db = config_database
    CONFIG_MAPPER_AVAILABLE = mapper_available
    CONFIG_DATABASE_AVAILABLE = database_available
    UI_GROUPS = ui_groups
    CONFIG_TOOLTIPS = config_tooltips
    flatten_config = flatten_func
    unflatten_config = unflatten_func
    get_display_name = get_display_name_func


# ============================================================================
# CONFIG ENDPOINTS
# ============================================================================


@router.get("/config")
@cached(ttl=60)  # Cache config for 1 minute
async def get_config():
    """Get current config.json - returns FLAT structure for UI when config_mapper available"""
    try:
        if not CONFIG_PATH.exists():
            error_msg = f"Config file not found at: {CONFIG_PATH}\n"
            error_msg += f"Base directory: {BASE_DIR}\n"
            error_msg += "Please create config.json from config.example.json"
            raise HTTPException(status_code=404, detail=error_msg)

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        # If config_mapper is available, transform to flat structure
        if CONFIG_MAPPER_AVAILABLE:
            flat_config = flatten_config(grouped_config)

            # Build display names for all keys in the config
            display_names_dict = {}
            for key in flat_config.keys():
                display_names_dict[key] = get_display_name(key)

            return {
                "success": True,
                "config": flat_config,
                "ui_groups": UI_GROUPS,
                "display_names": display_names_dict,
                "tooltips": CONFIG_TOOLTIPS,
                "using_flat_structure": True,
            }
        else:
            # Fallback: return grouped structure as-is
            return {
                "success": True,
                "config": grouped_config,
                "tooltips": {},
                "using_flat_structure": False,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config")
async def update_config(data: ConfigUpdate):
    """Update config.json - accepts FLAT structure and saves as GROUPED when config_mapper available"""
    try:
        logger.info("Saving config changes to config.json...")

        # If config_mapper is available, transform flat config back to grouped structure
        if CONFIG_MAPPER_AVAILABLE:
            grouped_config = unflatten_config(data.config)

            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(grouped_config, f, indent=2, ensure_ascii=False)

            logger.info(
                "Config saved successfully to config.json (flat -> grouped transformation applied)"
            )
        else:
            # Fallback: save as-is (assuming grouped structure)
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(data.config, f, indent=2, ensure_ascii=False)

            logger.info("Config saved successfully to config.json (grouped structure)")

        # Invalidate config cache
        invalidate_cache_pattern("config")
        
        # Also update config database if available
        if CONFIG_DATABASE_AVAILABLE and config_db:
            try:
                logger.info("Syncing config changes to database...")
                config_db.import_from_json()
                logger.info("Config database synced successfully with config.json")
            except Exception as db_error:
                logger.warning(f"Could not sync config database: {db_error}")
        else:
            logger.info("Config database not available, skipping database sync")

        return {"success": True, "message": "Config updated successfully"}
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CONFIG DATABASE ENDPOINTS
# ============================================================================


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
