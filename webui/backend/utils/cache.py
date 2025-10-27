"""Asset caching system for improved performance"""

import time
import logging
import threading
from pathlib import Path
from typing import Optional

from .file_utils import (
    is_poster_file,
    is_background_file,
    is_season_file,
    is_titlecard_file,
    process_image_path,
)

logger = logging.getLogger(__name__)

# Cache configuration (imported from constants)
CACHE_REFRESH_INTERVAL = 180  # 3 minutes

# Cache state (imported from state module)
from .state import (
    asset_cache,
    cache_refresh_task,
    cache_refresh_running,
    cache_scan_in_progress,
)


def scan_and_cache_assets(assets_dir: Path):
    """Scans the assets directory and populates/refreshes the cache."""
    global cache_scan_in_progress

    # Import state directly
    import utils.state as state

    # Prevent overlapping scans (thread-safe)
    if state.cache_scan_in_progress:
        logger.warning("Asset scan already in progress, skipping this request")
        return

    state.cache_scan_in_progress = True
    logger.info("Starting asset scan to refresh cache...")

    # Clear old data before re-scanning
    state.asset_cache["posters"].clear()
    state.asset_cache["backgrounds"].clear()
    state.asset_cache["seasons"].clear()
    state.asset_cache["titlecards"].clear()
    state.asset_cache["folders"].clear()

    if not assets_dir.exists() or not assets_dir.is_dir():
        logger.warning("Assets directory not found. Skipping cache population.")
        state.asset_cache["last_scanned"] = time.time()
        state.cache_scan_in_progress = False
        return

    try:
        all_images = (
            list(assets_dir.rglob("*.jpg"))
            + list(assets_dir.rglob("*.jpeg"))
            + list(assets_dir.rglob("*.png"))
            + list(assets_dir.rglob("*.webp"))
        )

        temp_folders = {}

        for image_path in all_images:
            image_data = process_image_path(image_path, assets_dir)
            if not image_data:
                continue

            folder_name = (
                Path(image_data["path"]).parts[0]
                if len(Path(image_data["path"]).parts) > 0
                else "root"
            )

            if folder_name not in temp_folders:
                temp_folders[folder_name] = {
                    "name": folder_name,
                    "path": folder_name,
                    "poster_count": 0,
                    "background_count": 0,
                    "season_count": 0,
                    "titlecard_count": 0,
                    "files": 0,
                    "size": 0,
                }

            # Count files and size for the folder
            temp_folders[folder_name]["files"] += 1
            temp_folders[folder_name]["size"] += image_data["size"]

            if is_poster_file(image_path.name):
                state.asset_cache["posters"].append(image_data)
                temp_folders[folder_name]["poster_count"] += 1
            elif is_background_file(image_path.name):
                state.asset_cache["backgrounds"].append(image_data)
                temp_folders[folder_name]["background_count"] += 1
            elif is_season_file(image_path.name):
                state.asset_cache["seasons"].append(image_data)
                temp_folders[folder_name]["season_count"] += 1
            elif is_titlecard_file(image_path.name):
                state.asset_cache["titlecards"].append(image_data)
                temp_folders[folder_name]["titlecard_count"] += 1

        # Sort the image lists once by path
        for key in ["posters", "backgrounds", "seasons", "titlecards"]:
            state.asset_cache[key].sort(key=lambda x: x["path"])

        # Finalize folder data
        folder_list = list(temp_folders.values())
        for folder in folder_list:
            folder["total_count"] = (
                folder["poster_count"]
                + folder["background_count"]
                + folder["season_count"]
                + folder["titlecard_count"]
            )
        folder_list.sort(key=lambda x: x["name"])
        state.asset_cache["folders"] = folder_list

    except Exception as e:
        logger.error(f"An error occurred during asset scan: {e}")
    finally:
        state.asset_cache["last_scanned"] = time.time()
        state.cache_scan_in_progress = False  # Release lock
        logger.info(
            f"Asset cache refresh finished. Found {len(state.asset_cache['posters'])} posters, "
            f"{len(state.asset_cache['backgrounds'])} backgrounds, "
            f"{len(state.asset_cache['seasons'])} seasons, "
            f"{len(state.asset_cache['titlecards'])} titlecards, "
            f"{len(state.asset_cache['folders'])} folders."
        )


def background_cache_refresh(assets_dir: Path):
    """Background thread that refreshes the cache periodically"""
    import utils.state as state

    logger.info(
        f"Background cache refresh started (interval: {CACHE_REFRESH_INTERVAL}s)"
    )

    while state.cache_refresh_running:
        try:
            # Wait until the next refresh
            time.sleep(CACHE_REFRESH_INTERVAL)

            if state.cache_refresh_running:  # Check again after sleep
                logger.info("Background cache refresh triggered")
                scan_and_cache_assets(assets_dir)
                logger.info("Background cache refresh completed")
        except Exception as e:
            logger.error(f"Error in background cache refresh: {e}")
            # Continue running even if there's an error
            time.sleep(60)  # Wait a bit before retrying


def start_cache_refresh_background(assets_dir: Path):
    """Start the background cache refresh thread"""
    import utils.state as state

    if state.cache_refresh_task is not None and state.cache_refresh_task.is_alive():
        logger.warning("Background cache refresh is already running")
        return

    state.cache_refresh_running = True
    state.cache_refresh_task = threading.Thread(
        target=background_cache_refresh,
        args=(assets_dir,),
        daemon=True,
        name="CacheRefresh",
    )
    state.cache_refresh_task.start()
    logger.info("Background cache refresh thread started")


def stop_cache_refresh_background():
    """Stop the background cache refresh thread"""
    import utils.state as state

    if state.cache_refresh_running:
        logger.info("Stopping background cache refresh...")
        state.cache_refresh_running = False
        if state.cache_refresh_task:
            state.cache_refresh_task.join(timeout=5)
        logger.info("Background cache refresh stopped")


def get_fresh_assets(assets_dir: Path):
    """Returns the asset cache (always fresh thanks to background refresh)"""
    import utils.state as state

    # Fully rely on background refresh!
    # Only perform a synchronous scan if the cache is completely empty (first startup)
    if state.asset_cache["last_scanned"] == 0:
        logger.info("First-time cache population...")
        scan_and_cache_assets(assets_dir)
    return state.asset_cache
