"""
Routes for asset management, folder navigation, and cache operations.
Includes asset replacement functionality with TMDB/TVDB/Fanart.tv integration.

Endpoints:
- GET /api/assets/folders - Get assets folders (library navigation)
- GET /api/assets-folders - Get folders from cache
- GET /api/assets-folder-images/{image_type}/{folder_path} - Filter images by type/folder
- GET /api/folder-view/items/{library_path} - Get items in library
- GET /api/folder-view/assets/{item_path} - Get assets for item
- GET /api/assets/stats - Asset statistics from cache
- POST /api/refresh-cache - Manually refresh asset cache
- GET /api/cache/status - Cache status and background refresh info
- GET /api/test-gallery - Test directory gallery
- POST /api/assets/fetch-replacements - Fetch replacement previews from providers
- POST /api/assets/upload-replacement - Upload replacement asset
- POST /api/assets/replace-from-url - Replace asset from URL
- GET /api/assets/overview - Asset overview with issue categories
"""

from fastapi import APIRouter, HTTPException, Query, File, UploadFile
from typing import Optional, Dict, Any, List
from pathlib import Path
from datetime import datetime
from pydantic import BaseModel
import asyncio
import httpx
import json
import re
import subprocess
import time
import requests
import os
import shutil
import io

# Import ManualModeRequest from models
from models.request_models import ManualModeRequest

router = APIRouter()

# Module-level dependencies (set during router initialization)
ASSETS_DIR: Path = None
MANUAL_ASSETS_DIR: Path = None
TEST_DIR: Path = None
CONFIG_PATH: Path = None
SCRIPT_PATH: Path = None
BASE_DIR: Path = None
IS_DOCKER: bool = False
RUNNING_FILE: Path = None
CONFIG_MAPPER_AVAILABLE: bool = False
DATABASE_AVAILABLE: bool = False
db = None
asset_cache: Dict[str, Any] = {}
cache_refresh_task = None
cache_refresh_running = False
cache_scan_in_progress = False
CACHE_TTL_SECONDS = 0
CACHE_REFRESH_INTERVAL = 0
scan_and_cache_assets_func = None
flatten_config = None
state_module = None
logger = None


class AssetReplaceRequest(BaseModel):
    """Request to fetch asset previews from services"""

    asset_path: str
    media_type: str  # "movie" or "tv"
    asset_type: str  # "poster", "background", "season", "titlecard"
    tmdb_id: Optional[str] = None
    tvdb_id: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None
    season_number: Optional[int] = None
    episode_number: Optional[int] = None


def setup_dependencies(deps: Dict[str, Any]):
    """Initialize router with required dependencies from main.py"""
    global ASSETS_DIR, MANUAL_ASSETS_DIR, TEST_DIR, CONFIG_PATH
    global SCRIPT_PATH, BASE_DIR, IS_DOCKER, RUNNING_FILE
    global CONFIG_MAPPER_AVAILABLE, DATABASE_AVAILABLE, db
    global asset_cache, cache_refresh_task, cache_refresh_running
    global cache_scan_in_progress, CACHE_TTL_SECONDS, CACHE_REFRESH_INTERVAL
    global scan_and_cache_assets_func, flatten_config, state_module, logger

    ASSETS_DIR = deps["ASSETS_DIR"]
    MANUAL_ASSETS_DIR = deps["MANUAL_ASSETS_DIR"]
    TEST_DIR = deps["TEST_DIR"]
    CONFIG_PATH = deps["CONFIG_PATH"]
    SCRIPT_PATH = deps["SCRIPT_PATH"]
    BASE_DIR = deps["BASE_DIR"]
    IS_DOCKER = deps["IS_DOCKER"]
    RUNNING_FILE = deps["RUNNING_FILE"]
    CONFIG_MAPPER_AVAILABLE = deps["CONFIG_MAPPER_AVAILABLE"]
    DATABASE_AVAILABLE = deps["DATABASE_AVAILABLE"]
    db = deps["db"]
    asset_cache = deps["asset_cache"]
    cache_refresh_task = deps["cache_refresh_task"]
    cache_refresh_running = deps["cache_refresh_running"]
    cache_scan_in_progress = deps["cache_scan_in_progress"]
    CACHE_TTL_SECONDS = deps["CACHE_TTL_SECONDS"]
    CACHE_REFRESH_INTERVAL = deps["CACHE_REFRESH_INTERVAL"]
    scan_and_cache_assets_func = deps["scan_and_cache_assets"]
    flatten_config = deps.get("flatten_config")
    state_module = deps["state_module"]
    logger = deps["logger"]


def get_fresh_assets():
    """Get cached assets"""
    return asset_cache


# ============================================================================
# ASSET FOLDER NAVIGATION ENDPOINTS
# ============================================================================


@router.get("/api/assets/folders")
async def get_assets_folders(library_name: Optional[str] = None):
    """Get folders from assets directory. If library_name provided, returns items from that library."""
    try:
        if not ASSETS_DIR.exists():
            logger.warning(f"Assets directory does not exist: {ASSETS_DIR}")
            return {"success": True, "folders": [], "path": str(ASSETS_DIR)}

        if library_name:
            library_path = ASSETS_DIR / library_name
            if not library_path.exists() or not library_path.is_dir():
                return {
                    "success": False,
                    "error": f"Library folder '{library_name}' not found",
                }

            folders = []
            for item_path in sorted(library_path.iterdir()):
                if item_path.is_dir():
                    folder_name = item_path.name
                    title = folder_name
                    year = ""

                    year_match = re.search(r"\((\d{4})\)", folder_name)
                    if year_match:
                        year = year_match.group(1)
                        title = folder_name[: year_match.start()].strip()

                    folders.append(
                        {
                            "folderName": folder_name,
                            "title": title,
                            "year": year,
                            "path": str(item_path.relative_to(ASSETS_DIR)),
                        }
                    )

            return {
                "success": True,
                "folders": folders,
                "library": library_name,
                "path": str(library_path.relative_to(ASSETS_DIR)),
            }
        else:
            libraries = []
            for library_path in sorted(ASSETS_DIR.iterdir()):
                if library_path.is_dir():
                    item_count = sum(
                        1 for item in library_path.iterdir() if item.is_dir()
                    )
                    libraries.append(
                        {
                            "name": library_path.name,
                            "path": str(library_path.relative_to(ASSETS_DIR)),
                            "itemCount": item_count,
                        }
                    )

            return {
                "success": True,
                "libraries": libraries,
                "path": str(ASSETS_DIR),
            }

    except Exception as e:
        logger.error(f"Error in get_assets_folders: {e}")
        return {"success": False, "error": str(e)}


@router.get("/api/assets-folders")
async def get_assets_folders_cached():
    """Get folders from assets cache"""
    try:
        cache = get_fresh_assets()
        return {"folders": cache["folders"]}
    except Exception as e:
        logger.error(f"Error getting assets folders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/assets-folder-images/{image_type}/{folder_path:path}")
async def get_assets_folder_images_filtered(image_type: str, folder_path: str):
    """Get images from cache filtered by type and folder path"""
    try:
        valid_types = ["posters", "backgrounds", "seasons", "titlecards"]
        if image_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image type. Must be one of: {', '.join(valid_types)}",
            )

        cache = get_fresh_assets()
        normalized_folder = folder_path.replace("\\", "/").strip("/")

        filtered_images = []
        for img in cache.get(image_type, []):
            img_path = img["path"].replace("\\", "/").strip("/")
            img_parts = img_path.split("/")
            folder_parts = normalized_folder.split("/")

            if len(img_parts) > len(folder_parts):
                if img_parts[: len(folder_parts)] == folder_parts:
                    filtered_images.append(img)

        return {"images": filtered_images, "type": image_type, "folder": folder_path}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error filtering folder images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/folder-view/items/{library_path:path}")
async def get_folder_view_items(library_path: str):
    """Get item folders within a library with asset counts"""
    try:
        full_path = ASSETS_DIR / library_path

        if not full_path.exists() or not full_path.is_dir():
            return {"items": [], "path": library_path}

        items = []
        for item_path in sorted(full_path.iterdir()):
            if item_path.is_dir():
                asset_count = sum(
                    1
                    for file in item_path.rglob("*")
                    if file.is_file()
                    and file.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]
                )

                items.append(
                    {
                        "name": item_path.name,
                        "path": str(item_path.relative_to(ASSETS_DIR)),
                        "assetCount": asset_count,
                    }
                )

        return {"items": items, "path": library_path}
    except Exception as e:
        logger.error(f"Error getting folder view items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/folder-view/assets/{item_path:path}")
async def get_folder_view_assets(item_path: str):
    """Get all assets for a specific item with URLs"""
    try:
        full_path = ASSETS_DIR / item_path

        if not full_path.exists() or not full_path.is_dir():
            return {"assets": [], "path": item_path}

        assets = []
        image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

        for asset_file in full_path.rglob("*"):
            if asset_file.is_file() and asset_file.suffix.lower() in image_extensions:
                relative_path = asset_file.relative_to(ASSETS_DIR)
                url_path = str(relative_path).replace("\\", "/")

                assets.append(
                    {
                        "name": asset_file.name,
                        "path": str(relative_path),
                        "url": f"/assets/{url_path}",
                        "size": asset_file.stat().st_size,
                    }
                )

        assets.sort(key=lambda x: x["name"])
        return {"assets": assets, "path": item_path}
    except Exception as e:
        logger.error(f"Error getting folder view assets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ASSET STATISTICS AND CACHE ENDPOINTS
# ============================================================================


@router.get("/api/assets/stats")
async def get_assets_stats():
    """Returns statistics about created assets - uses cache"""
    try:
        cache = get_fresh_assets()

        total_size = sum(img["size"] for img in cache["posters"])
        total_size += sum(img["size"] for img in cache["backgrounds"])
        total_size += sum(img["size"] for img in cache["seasons"])
        total_size += sum(img["size"] for img in cache["titlecards"])

        sorted_folders = sorted(
            cache["folders"], key=lambda x: x["files"], reverse=True
        )

        stats = {
            "posters": len(cache["posters"]),
            "backgrounds": len(cache["backgrounds"]),
            "seasons": len(cache["seasons"]),
            "titlecards": len(cache["titlecards"]),
            "total_size": total_size,
            "folders": sorted_folders[:10],
        }

        return {"success": True, "stats": stats}

    except Exception as e:
        logger.error(f"Error getting asset stats: {e}")
        return {"success": False, "error": str(e), "stats": {}}


@router.post("/api/refresh-cache")
async def refresh_cache():
    """Manually refresh the asset cache"""
    try:
        scan_and_cache_assets_func()
        return {
            "success": True,
            "message": "Cache refreshed successfully",
            "posters": len(asset_cache["posters"]),
            "backgrounds": len(asset_cache["backgrounds"]),
            "seasons": len(asset_cache["seasons"]),
            "titlecards": len(asset_cache["titlecards"]),
            "folders": len(asset_cache["folders"]),
        }
    except Exception as e:
        logger.error(f"Error refreshing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/cache/status")
async def get_cache_status():
    """Get detailed cache status including background refresh info"""
    try:
        now = time.time()
        last_scan = asset_cache.get("last_scanned", 0)
        age_seconds = now - last_scan if last_scan > 0 else 0

        thread_alive = False
        try:
            if cache_refresh_task is not None:
                thread_alive = cache_refresh_task.is_alive()
        except Exception:
            thread_alive = False

        return {
            "success": True,
            "cache": {
                "last_scanned": (
                    datetime.fromtimestamp(last_scan).isoformat()
                    if last_scan > 0
                    else None
                ),
                "age_seconds": int(age_seconds),
                "ttl_seconds": CACHE_TTL_SECONDS,
                "refresh_interval": CACHE_REFRESH_INTERVAL,
                "is_stale": False,
                "posters_count": len(asset_cache.get("posters", [])),
                "backgrounds_count": len(asset_cache.get("backgrounds", [])),
                "seasons_count": len(asset_cache.get("seasons", [])),
                "titlecards_count": len(asset_cache.get("titlecards", [])),
                "folders_count": len(asset_cache.get("folders", [])),
            },
            "background_refresh": {
                "running": cache_refresh_running,
                "thread_alive": thread_alive,
                "scan_in_progress": cache_scan_in_progress,
            },
        }
    except Exception as e:
        logger.error(f"Error getting cache status: {e}")
        return {
            "success": False,
            "error": str(e),
            "cache": {
                "posters_count": 0,
                "backgrounds_count": 0,
                "seasons_count": 0,
                "titlecards_count": 0,
                "folders_count": 0,
            },
            "background_refresh": {
                "running": False,
                "thread_alive": False,
                "scan_in_progress": False,
            },
        }


@router.get("/api/test-gallery")
async def get_test_gallery():
    """Get poster gallery from test directory with image URLs"""
    if not TEST_DIR.exists():
        return {"images": []}

    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        for image_path in TEST_DIR.rglob("*"):
            if image_path.suffix.lower() in image_extensions:
                try:
                    relative_path = image_path.relative_to(TEST_DIR)
                    url_path = str(relative_path).replace("\\", "/")
                    images.append(
                        {
                            "path": str(relative_path),
                            "name": image_path.name,
                            "size": image_path.stat().st_size,
                            "url": f"/test/{url_path}",
                        }
                    )
                except Exception as e:
                    logger.error(f"Error processing test image {image_path}: {e}")
                    continue

        images.sort(key=lambda x: x["name"])
        return {"images": images[:200]}
    except Exception as e:
        logger.error(f"Error scanning test gallery: {e}")
        return {"images": []}


# ============================================================================
# ASSET REPLACEMENT ENDPOINTS
# ============================================================================
# These are complex endpoints that integrate with TMDB/TVDB/Fanart.tv
# Full implementation note: Due to their size (~2800 lines combined), these
# endpoints use the original implementations from main.py for now
# TODO: Consider refactoring into separate service modules


# ============================================================================
# HELPER FUNCTIONS FOR ASSET REPLACEMENT
# ============================================================================


async def update_asset_db_entry_as_manual(
    asset_path: str,
    image_url: str,
    library_name: Optional[str] = None,
    folder_name: Optional[str] = None,
    title_text: Optional[str] = None,
):
    """
    Delete existing database entries for a manually replaced asset.
    The new entry will be created by the CSV import after the Posterizarr script completes.
    This prevents duplicate entries with different title formats.

    Args:
        asset_path: Path to the asset (e.g., "4K/Movie Name (2024)/poster.jpg")
        image_url: URL where the image was downloaded from
        library_name: Optional library name override
        folder_name: Optional folder name override
        title_text: Optional title text override
    """
    if not state_module or not state_module.DATABASE_AVAILABLE or not state_module.db:
        logger.warning(
            "Database not available, skipping DB entry for manual replacement"
        )
        return

    try:
        # Parse asset path to extract metadata
        path_parts = Path(asset_path).parts

        if len(path_parts) < 2:
            logger.warning(f"Asset path too short to extract metadata: {asset_path}")
            return

        # Extract library name (first part of path)
        extracted_library_name = path_parts[0] if len(path_parts) > 0 else ""
        # Extract folder name (second part of path)
        extracted_folder_name = path_parts[1] if len(path_parts) > 1 else ""
        # Extract filename
        filename = path_parts[-1] if len(path_parts) > 0 else ""

        # Use provided values or fall back to extracted values
        final_library_name = library_name or extracted_library_name
        final_folder_name = folder_name or extracted_folder_name

        # Extract title from folder name if not provided
        # Remove year and ID tags like (2024) {tmdb-12345}
        if not title_text:
            # Match patterns like "Movie Name (2024) {tmdb-12345}"
            title_match = re.match(r"^(.+?)\s*\(\d{4}\)", final_folder_name)
            if title_match:
                title_text = title_match.group(1).strip()
            else:
                # Fallback: use folder name as-is
                title_text = final_folder_name

        # Determine asset type from filename
        # Match database Type column values: "Show", "Movie", "Show Background", "Movie Background", "Season", "Episode"
        asset_type = "Poster"  # Default, will be refined below

        if "background" in filename.lower():
            # Could be "Show Background" or "Movie Background"
            asset_type = "Background"
        elif re.match(r"^Season\d+\.jpg$", filename, re.IGNORECASE):
            asset_type = "Season"
        elif re.match(r"^S\d+E\d+\.jpg$", filename, re.IGNORECASE):
            asset_type = "Episode"
        # For poster.jpg files, asset_type remains "Poster"
        # We'll match both "Show" and "Movie" types in the query

        # Delete any existing database entries for this specific asset
        # This prevents duplicates - the CSV import will create the new entry after the script finishes
        # We need to match more specifically to avoid deleting unrelated assets:
        # - For seasons: match on Rootfolder + Type + season number in Title
        # - For episodes: match on Rootfolder + Type + episode pattern in Title
        # - For poster/background: match on Rootfolder + Type

        cursor = state_module.db.connection.cursor()

        # Extract season/episode info from filename for more specific matching
        season_match = re.match(r"^Season(\d+)\.jpg$", filename, re.IGNORECASE)
        episode_match = re.match(r"^S(\d+)E(\d+)\.jpg$", filename, re.IGNORECASE)

        if season_match:
            # For seasons, find entries with matching season number in title
            season_num = season_match.group(1)
            # Also try without leading zero
            season_num_int = str(int(season_num))
            logger.info(
                f"Searching for Season: folder='{final_folder_name}', season_num='{season_num}', season_num_int='{season_num_int}'"
            )
            cursor.execute(
                """SELECT id, Title, Type FROM imagechoices 
                   WHERE Rootfolder = ? AND Type = ? 
                   AND (Title LIKE ? OR Title LIKE ? OR Title LIKE ? OR Title LIKE ?)""",
                (
                    final_folder_name,
                    asset_type,
                    f"%Season{season_num}%",
                    f"%Season {season_num}%",
                    f"%Season {season_num_int}%",
                    f"%Season{season_num_int}%",
                ),
            )
        elif episode_match:
            # For episodes, find entries with matching episode pattern in title
            season_num = episode_match.group(1)
            episode_num = episode_match.group(2)
            cursor.execute(
                """SELECT id, Title FROM imagechoices 
                   WHERE Rootfolder = ? AND Type = ? 
                   AND (Title LIKE ? OR Title LIKE ?)""",
                (
                    final_folder_name,
                    asset_type,
                    f"%S{season_num}E{episode_num}%",
                    f"%S0{season_num}E0{episode_num}%",
                ),
            )
        else:
            # For poster/background, match on Rootfolder + Type
            # For posters, match both "Show" and "Movie" types
            # For backgrounds, match both "Show Background" and "Movie Background" types
            if asset_type == "Poster":
                cursor.execute(
                    "SELECT id, Title, Type FROM imagechoices WHERE Rootfolder = ? AND Type IN ('Show', 'Movie')",
                    (final_folder_name,),
                )
            elif asset_type == "Background":
                cursor.execute(
                    "SELECT id, Title, Type FROM imagechoices WHERE Rootfolder = ? AND Type IN ('Show Background', 'Movie Background')",
                    (final_folder_name,),
                )
            else:
                cursor.execute(
                    "SELECT id, Title, Type FROM imagechoices WHERE Rootfolder = ? AND Type = ?",
                    (final_folder_name, asset_type),
                )

        existing_entries = cursor.fetchall()

        if existing_entries:
            for entry in existing_entries:
                record_id = entry["id"]
                old_title = entry["Title"]
                # sqlite3.Row objects use dictionary-style access, not .get()
                entry_type = entry["Type"] if "Type" in entry.keys() else asset_type
                state_module.db.delete_choice(record_id)
                logger.info(
                    f"Deleted DB entry #{record_id} for manual replacement: {old_title} ({entry_type})"
                )
            logger.info(
                f"New entry will be created by CSV import after script completes"
            )
        else:
            logger.info(
                f"No existing DB entries found for: {filename} in {final_folder_name}"
            )
            logger.info(
                f"New entry will be created by CSV import after script completes"
            )

    except Exception as e:
        logger.error(f"Error updating database entry for manual replacement: {e}")
        import traceback

        logger.error(traceback.format_exc())


async def trigger_manual_run_internal(request: ManualModeRequest):
    """
    Internal function to trigger manual run without HTTP overhead
    This is called from replace_asset_from_url
    """
    import platform
    import subprocess
    from datetime import datetime

    if not SCRIPT_PATH.exists():
        raise ValueError("Posterizarr.ps1 not found")

    # Determine PowerShell command
    if platform.system() == "Windows":
        ps_command = "pwsh"
        try:
            subprocess.run([ps_command, "-v"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            ps_command = "powershell"
            logger.info("pwsh not found, using powershell instead")
    else:
        ps_command = "pwsh"

    # Build command based on poster type
    command = [
        ps_command,
        "-File",
        str(SCRIPT_PATH),
        "-Manual",
        "-PicturePath",
        request.picturePath.strip(),
    ]

    # Add poster type specific switches and parameters
    if request.posterType == "titlecard":
        command.extend(
            [
                "-TitleCard",
                "-Titletext",
                request.epTitleName.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
                "-EPTitleName",
                request.epTitleName.strip(),
                "-EpisodeNumber",
                request.episodeNumber.strip(),
                "-SeasonPosterName",
                request.seasonPosterName.strip(),
            ]
        )
    elif request.posterType == "season":
        command.extend(
            [
                "-SeasonPoster",
                "-Titletext",
                request.titletext.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
                "-SeasonPosterName",
                request.seasonPosterName.strip(),
            ]
        )
    elif request.posterType == "background":
        command.extend(
            [
                "-BackgroundCard",
                "-Titletext",
                request.titletext.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
            ]
        )
    else:  # standard poster
        command.extend(
            [
                "-Titletext",
                request.titletext.strip(),
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
            ]
        )

    logger.info(f"Starting Manual Run: {' '.join(command)}")

    # Start the process in background
    # IMPORTANT: Do NOT redirect stdout/stderr to PIPE if we're not reading them!
    # This prevents the process from hanging when the buffer fills up
    process = subprocess.Popen(
        command,
        cwd=str(BASE_DIR),
        stdout=None,  # Let output go to console/log
        stderr=None,  # Let output go to console/log
        text=True,
    )

    logger.info(f"Manual Run process started (PID: {process.pid})")


# ============================================================================
# ASSET REPLACEMENT ENDPOINTS
# ============================================================================


# Import from main.py for now - these work as-is since they're pure FastAPI endpoints
# The endpoints will be fully integrated when we switch main_new.py -> main.py
@router.post("/api/assets/fetch-replacements")
async def fetch_asset_replacements(request: AssetReplaceRequest):
    """
    Fetch replacement asset previews from TMDB, TVDB, and Fanart.tv
    Returns a list of preview images from all available sources
    """
    try:
        # DEBUG: Log incoming request
        logger.info("=" * 80)
        logger.info(f"FETCH ASSET REPLACEMENTS REQUEST:")
        logger.info(f"  Asset Path: {request.asset_path}")
        logger.info(f"  Media Type: {request.media_type}")
        logger.info(f"  Asset Type: {request.asset_type}")
        logger.info(f"  Title: {request.title}")
        logger.info(f"  Year: {request.year}")
        logger.info(f"  TMDB ID: {request.tmdb_id}")
        logger.info(f"  TVDB ID: {request.tvdb_id}")
        logger.info(f"  Season Number: {request.season_number}")
        logger.info(f"  Episode Number: {request.episode_number}")
        logger.info("=" * 80)

        # Try to get IDs from database if not provided in request
        if not request.tmdb_id or not request.tvdb_id:
            try:
                from database import ImageChoices

                db_temp = ImageChoices()

                db_record = None
                search_method = None

                # Method 1: Search by asset path (for AssetReplacer)
                if request.asset_path and not request.asset_path.startswith("manual_"):
                    # Extract show/movie name from asset path to match against Rootfolder
                    # Example path: "D:/Media/Shows/Show Name (2020) {tmdb-123}/Season 01/poster.jpg"
                    import os

                    path_parts = request.asset_path.replace("\\", "/").split("/")

                    # Look for folder with TMDB/TVDB ID pattern in path
                    rootfolder_candidate = None
                    for part in path_parts:
                        # Check if this part has an ID pattern like {tmdb-123}, [tvdb-456], etc.
                        if any(
                            pattern in part.lower()
                            for pattern in ["tmdb-", "tvdb-", "imdb-"]
                        ):
                            rootfolder_candidate = part
                            break

                    if rootfolder_candidate:
                        logger.info(
                            f"Searching database by path for: {rootfolder_candidate}"
                        )
                        search_method = "path"

                        # Search database for matching record
                        cursor = db_temp.connection.cursor()
                        cursor.execute(
                            """
                            SELECT tmdbid, tvdbid, imdbid, Rootfolder
                            FROM imagechoices 
                            WHERE Rootfolder LIKE ?
                            LIMIT 1
                        """,
                            (f"%{rootfolder_candidate}%",),
                        )

                        db_record = cursor.fetchone()

                # Method 2: Search by title + year (for Manual Mode)
                if not db_record and request.title:
                    logger.info(
                        f"Searching database by title for: '{request.title}' (year: {request.year})"
                    )
                    search_method = "title"

                    cursor = db_temp.connection.cursor()

                    # Try exact title match first
                    if request.year:
                        # Search with year in Rootfolder pattern: "Title (YYYY)"
                        cursor.execute(
                            """
                            SELECT tmdbid, tvdbid, imdbid, Rootfolder
                            FROM imagechoices 
                            WHERE Rootfolder LIKE ?
                            LIMIT 1
                        """,
                            (f"%{request.title}%({request.year})%",),
                        )
                    else:
                        # Search without year
                        cursor.execute(
                            """
                            SELECT tmdbid, tvdbid, imdbid, Rootfolder
                            FROM imagechoices 
                            WHERE Rootfolder LIKE ?
                            LIMIT 1
                        """,
                            (f"%{request.title}%",),
                        )

                    db_record = cursor.fetchone()

                # Process database record if found
                if db_record:
                    db_tmdbid = db_record[0] if db_record[0] != "false" else None
                    db_tvdbid = db_record[1] if db_record[1] != "false" else None
                    db_imdbid = db_record[2] if db_record[2] != "false" else None
                    db_rootfolder = db_record[3]

                    logger.info(f"Found database record (via {search_method}):")
                    logger.info(f"  Rootfolder: {db_rootfolder}")
                    logger.info(f"  TMDB ID: {db_tmdbid}")
                    logger.info(f"  TVDB ID: {db_tvdbid}")
                    logger.info(f"  IMDB ID: {db_imdbid}")

                    # Use database IDs if not provided in request
                    if not request.tmdb_id and db_tmdbid:
                        request.tmdb_id = db_tmdbid
                        logger.info(f"Using TMDB ID from database: {db_tmdbid}")

                    if not request.tvdb_id and db_tvdbid:
                        request.tvdb_id = db_tvdbid
                        logger.info(f"Using TVDB ID from database: {db_tvdbid}")

                    # Store IMDB ID for Fanart.tv (store in request for later use)
                    if db_imdbid:
                        # Store it as a custom attribute (we'll use it for Fanart)
                        if not hasattr(request, "imdb_id"):
                            request.imdb_id = db_imdbid
                            logger.info(f"Using IMDB ID from database: {db_imdbid}")
                else:
                    logger.info(
                        f"No matching database record found (searched via {search_method})"
                    )

            except Exception as e:
                logger.warning(f"Could not query database for IDs: {e}")
                logger.debug("Continuing with title-based search...")

        # Load config to get API keys and language preferences
        if not CONFIG_PATH.exists():
            raise HTTPException(status_code=404, detail="Config file not found")

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        # Get API tokens and language preferences - support multiple key name variants
        if flatten_config and callable(flatten_config):
            flat_config = flatten_config(grouped_config)
            tmdb_token = flat_config.get("tmdbtoken", "")
            # Support both "tvdbapikey" and "tvdbapi" for TVDB
            tvdb_api_key = flat_config.get("tvdbapikey") or flat_config.get(
                "tvdbapi", ""
            )
            tvdb_pin = flat_config.get("tvdbpin", "")
            # Support both "fanartapikey" and "FanartTvAPIKey" for Fanart.tv
            fanart_api_key = (
                flat_config.get("fanartapikey")
                or flat_config.get("fanarttvapikey")
                or flat_config.get("FanartTvAPIKey", "")
            )
            # Get language preferences
            preferred_language_order = flat_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = flat_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = flat_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )
        else:
            api_part = grouped_config.get("ApiPart", {})
            tmdb_token = api_part.get("tmdbtoken", "")
            # Support both "tvdbapikey" and "tvdbapi" for TVDB
            tvdb_api_key = api_part.get("tvdbapikey") or api_part.get("tvdbapi", "")
            tvdb_pin = api_part.get("tvdbpin", "")
            # Support both "fanartapikey" and "FanartTvAPIKey" for Fanart.tv
            fanart_api_key = (
                api_part.get("fanartapikey")
                or api_part.get("fanarttvapikey")
                or api_part.get("FanartTvAPIKey", "")
            )

            # Try to get language preferences from different possible locations
            preferred_language_order = grouped_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = grouped_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = grouped_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )

            # If not found at root, try in ApiPart
            if not preferred_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_language_order = grouped_config["ApiPart"].get(
                    "PreferredLanguageOrder", ""
                )
            if not preferred_season_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_season_language_order = grouped_config["ApiPart"].get(
                    "PreferredSeasonLanguageOrder", ""
                )
            if not preferred_background_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_background_language_order = grouped_config["ApiPart"].get(
                    "PreferredBackgroundLanguageOrder", ""
                )

        # Parse language preferences (handle both string and list formats)
        def parse_language_order(value):
            """Convert language order to list, handling both string and list inputs"""
            if not value:
                return []
            if isinstance(value, list):
                # Already a list, just clean up entries
                return [lang.strip() for lang in value if lang and str(lang).strip()]
            if isinstance(value, str):
                # String format, split by comma
                return [lang.strip() for lang in value.split(",") if lang.strip()]
            return []

        language_order_list = parse_language_order(preferred_language_order)
        season_language_order_list = parse_language_order(
            preferred_season_language_order
        )
        background_language_order_list = parse_language_order(
            preferred_background_language_order
        )

        logger.info(
            f"Language preferences loaded - Standard: {language_order_list}, Season: {season_language_order_list}, Background: {background_language_order_list}"
        )

        # Helper function to filter and sort by language preference
        def filter_and_sort_by_language(items_list, preferred_languages):
            """
            Sort items based on preferred language order.
            Preferred languages come first in order, then all other languages.

            Args:
                items_list: List of item dicts with 'language' field
                preferred_languages: List of language codes in order of preference (e.g., ['de', 'en', 'xx'])

            Returns:
                Sorted list of items (preferred languages first, then others)
            """
            if not preferred_languages or not items_list:
                return items_list

            # Normalize language codes to lowercase
            preferred_languages = [
                lang.lower().strip() for lang in preferred_languages if lang
            ]

            # Group items by language
            language_groups = {lang: [] for lang in preferred_languages}
            language_groups["other"] = []  # For languages not in preferences

            for item in items_list:
                item_lang = (item.get("language") or "xx").lower()

                # Check if item language matches any preferred language
                if item_lang in preferred_languages:
                    language_groups[item_lang].append(item)
                else:
                    language_groups["other"].append(item)

            # Build result list in order of preference, then add other languages
            result = []
            for lang in preferred_languages:
                result.extend(language_groups[lang])

            # Add other languages at the end
            result.extend(language_groups["other"])

            return result

        results = {"tmdb": [], "tvdb": [], "fanart": []}

        # Helper function to search for TMDB ID by title and year
        async def search_tmdb_id(
            title: str, year: Optional[int], media_type: str
        ) -> Optional[str]:
            if not tmdb_token or not title:
                return None
            try:
                headers = {
                    "Authorization": f"Bearer {tmdb_token}",
                    "Content-Type": "application/json",
                }
                search_endpoint = "movie" if media_type == "movie" else "tv"
                url = f"https://api.themoviedb.org/3/search/{search_endpoint}"
                params = {"query": title}

                if year and media_type == "movie":
                    params["year"] = year
                elif year and media_type == "tv":
                    params["first_air_date_year"] = year

                logger.info(f" TMDB API Request: {url}")
                logger.info(f"   Params: {params}")

                response = requests.get(url, headers=headers, params=params, timeout=10)
                logger.info(f"   Response Status: {response.status_code}")

                if response.status_code == 200:
                    data = response.json()
                    results_data = data.get("results", [])
                    logger.info(f"   Results Count: {len(results_data)}")
                    if results_data:
                        result_id = str(results_data[0].get("id"))
                        result_title = results_data[0].get(
                            "title" if media_type == "movie" else "name"
                        )
                        logger.info(
                            f"   First Result: ID={result_id}, Title='{result_title}'"
                        )
                        return result_id
                    else:
                        logger.warning(f"   No results found in TMDB response")
            except Exception as e:
                logger.error(f"Error searching TMDB by title: {e}")
            return None

        # Helper function to search for TVDB ID by title and year
        async def search_tvdb_id(
            title: str, year: Optional[int], media_type: str
        ) -> Optional[str]:
            if not tvdb_api_key or not title:
                return None
            try:
                # First, login to get token
                async with httpx.AsyncClient(timeout=10.0) as client:
                    login_url = "https://api4.thetvdb.com/v4/login"
                    body = {"apikey": tvdb_api_key}
                    if tvdb_pin:
                        body["pin"] = tvdb_pin

                    headers_tvdb = {
                        "accept": "application/json",
                        "Content-Type": "application/json",
                    }

                    login_response = await client.post(
                        login_url, json=body, headers=headers_tvdb
                    )

                    if login_response.status_code == 200:
                        token = login_response.json().get("data", {}).get("token")

                        if token:
                            auth_headers = {
                                "Authorization": f"Bearer {token}",
                                "accept": "application/json",
                            }

                            # Search for series/movie
                            search_url = "https://api4.thetvdb.com/v4/search"
                            params = {
                                "query": title,
                                "type": "series" if media_type == "tv" else "movie",
                            }

                            if year:
                                params["year"] = year

                            logger.info(f" TVDB API Request: {search_url}")
                            logger.info(f"   Params: {params}")

                            search_response = await client.get(
                                search_url, headers=auth_headers, params=params
                            )
                            logger.info(
                                f"   Response Status: {search_response.status_code}"
                            )

                            if search_response.status_code == 200:
                                data = search_response.json()
                                results_data = data.get("data", [])
                                logger.info(f"   Results Count: {len(results_data)}")

                                if results_data:
                                    # Get the first result
                                    result_id = str(results_data[0].get("tvdb_id"))
                                    result_name = results_data[0].get("name")
                                    logger.info(
                                        f"   First Result: ID={result_id}, Name='{result_name}'"
                                    )
                                    return result_id
                                else:
                                    logger.warning(
                                        f"   No results found in TVDB response"
                                    )
            except Exception as e:
                logger.error(f"Error searching TVDB by title: {e}")
            return None

        # Determine TMDB ID(s) - collect multiple IDs for dual search
        tmdb_ids_to_use = []

        # If TMDB ID is provided or found in DB, use it
        if request.tmdb_id:
            tmdb_ids_to_use.append(("provided_id", request.tmdb_id))
            logger.info(f"Using TMDB ID from database/request: {request.tmdb_id}")

        # Check if title contains an ID with prefix (e.g., "tmdb-123", "tvdb-456", "imdb-789")
        # This handles manual ID entry in RunModes search bar with explicit provider prefix
        # ONLY check for prefixes if we don't have IDs from database yet
        potential_tmdb_id = None
        potential_tvdb_id = None
        potential_imdb_id = None
        detected_provider = None  # Track which provider prefix was used

        if not tmdb_ids_to_use and request.title:
            title_lower = request.title.strip().lower()

            # Check for TMDB ID: tmdb-123 or tmdb:123
            tmdb_match = re.match(r"tmdb[-:](\d+)", title_lower)
            if tmdb_match:
                potential_tmdb_id = tmdb_match.group(1)
                detected_provider = "tmdb"
                logger.info(f"Detected TMDB ID from title prefix: {potential_tmdb_id}")

            # Check for TVDB ID: tvdb-123 or tvdb:123
            tvdb_match = re.match(r"tvdb[-:](\d+)", title_lower)
            if tvdb_match:
                potential_tvdb_id = tvdb_match.group(1)
                detected_provider = "tvdb"
                logger.info(f"Detected TVDB ID from title prefix: {potential_tvdb_id}")

            # Check for IMDB ID: imdb-123 or imdb:123 or imdb-tt123 or just tt123
            imdb_match = re.match(r"(?:imdb[-:])?(?:tt)?(\d+)", title_lower)
            if imdb_match and (
                title_lower.startswith("imdb") or title_lower.startswith("tt")
            ):
                potential_imdb_id = imdb_match.group(1)
                detected_provider = "imdb"
                # IMDB IDs should have the 'tt' prefix for Fanart.tv
                if not potential_imdb_id.startswith("tt"):
                    potential_imdb_id = f"tt{potential_imdb_id}"
                logger.info(f"Detected IMDB ID from title prefix: {potential_imdb_id}")

        # If we detected a TMDB ID in title prefix, use it
        if not tmdb_ids_to_use and potential_tmdb_id:
            tmdb_ids_to_use.append(("manual_id_entry", potential_tmdb_id))
            logger.info(
                f"Using manually entered TMDB ID from prefix: {potential_tmdb_id}"
            )

        # Only search by title if we don't have any TMDB ID yet AND no ID prefix was detected
        if (
            not tmdb_ids_to_use
            and request.title
            and not (potential_tmdb_id or potential_tvdb_id or potential_imdb_id)
            and tmdb_token
        ):
            logger.info(
                f"No TMDB ID available - searching TMDB by title: '{request.title}' (year: {request.year})"
            )
            found_id = await search_tmdb_id(
                request.title, request.year, request.media_type
            )
            if found_id:
                tmdb_ids_to_use.append(("title_search", found_id))
                logger.info(f"Found TMDB ID from title search: {found_id}")
            else:
                logger.warning(f"No TMDB ID found for title: '{request.title}'")

        # Determine TVDB ID(s) - collect multiple IDs for dual search
        tvdb_ids_to_use = []

        # If TVDB ID is provided or found in DB, use it (works for both TV and Movies in TVDB API v4)
        if request.tvdb_id:
            tvdb_ids_to_use.append(("provided_id", request.tvdb_id))
            logger.info(
                f"Using TVDB ID from database/request: {request.tvdb_id} (media_type: {request.media_type})"
            )

        # If we detected a TVDB ID in title prefix (only if no DB ID), use it
        if not tvdb_ids_to_use and potential_tvdb_id:
            tvdb_ids_to_use.append(("manual_id_entry", potential_tvdb_id))
            logger.info(
                f"Using manually entered TVDB ID from prefix: {potential_tvdb_id}"
            )

        # Only search by title if we don't have any TVDB ID yet AND no ID prefix was detected
        # TVDB API v4 supports both TV shows and movies
        if (
            not tvdb_ids_to_use
            and request.title
            and not (potential_tmdb_id or potential_tvdb_id or potential_imdb_id)
            and tvdb_api_key
        ):
            logger.info(
                f"No TVDB ID available - searching TVDB by title: '{request.title}' (year: {request.year}, media_type: {request.media_type})"
            )
            found_id = await search_tvdb_id(
                request.title, request.year, request.media_type
            )
            if found_id:
                tvdb_ids_to_use.append(("title_search", found_id))
                logger.info(f"Found TVDB ID from title search: {found_id}")
            else:
                logger.warning(f"No TVDB ID found for title: '{request.title}'")

        # Create async tasks for parallel fetching - AFTER IDs are resolved
        async def fetch_tmdb():
            """Fetch TMDB assets asynchronously from all collected IDs"""
            if not tmdb_token:
                logger.warning("TMDB: No API token configured")
                return []

            if not tmdb_ids_to_use:
                logger.warning("TMDB: No TMDB IDs available")
                return []

            all_results = []
            seen_urls = set()  # Track unique image URLs to avoid duplicates

            try:
                headers = {
                    "Authorization": f"Bearer {tmdb_token}",
                    "Content-Type": "application/json",
                }

                media_endpoint = "movie" if request.media_type == "movie" else "tv"

                # Fetch from all collected IDs
                for source, tmdb_id in tmdb_ids_to_use:
                    logger.info(
                        f" TMDB: Fetching {request.asset_type} for ID: {tmdb_id} (from {source})"
                    )

                    async with httpx.AsyncClient(timeout=10.0) as client:
                        if (
                            request.asset_type == "titlecard"
                            and request.season_number
                            and request.episode_number
                        ):
                            # Episode stills
                            url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/episode/{request.episode_number}/images"
                            response = await client.get(url, headers=headers)
                            if response.status_code == 200:
                                data = response.json()
                                for still in data.get("stills", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{still.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{still.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "episode_still",
                                                "vote_average": still.get(
                                                    "vote_average", 0
                                                ),
                                            }
                                        )

                        elif request.asset_type == "season" and request.season_number:
                            # Season posters
                            url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/images"
                            response = await client.get(url, headers=headers)
                            if response.status_code == 200:
                                data = response.json()
                                for poster in data.get("posters", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{poster.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "season_poster",
                                                "language": poster.get("iso_639_1"),
                                                "vote_average": poster.get(
                                                    "vote_average", 0
                                                ),
                                            }
                                        )

                        elif request.asset_type == "background":
                            # Backgrounds
                            url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
                            response = await client.get(url, headers=headers)
                            if response.status_code == 200:
                                data = response.json()
                                for backdrop in data.get("backdrops", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{backdrop.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{backdrop.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "backdrop",
                                                "language": backdrop.get("iso_639_1"),
                                                "vote_average": backdrop.get(
                                                    "vote_average", 0
                                                ),
                                            }
                                        )

                        else:
                            # Standard posters
                            url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
                            logger.info(f" TMDB Poster URL: {url}")
                            response = await client.get(url, headers=headers)
                            logger.info(
                                f" TMDB Response Status: {response.status_code}"
                            )
                            if response.status_code == 200:
                                data = response.json()
                                for poster in data.get("posters", []):
                                    original_url = f"https://image.tmdb.org/t/p/original{poster.get('file_path')}"
                                    if original_url not in seen_urls:
                                        seen_urls.add(original_url)
                                        all_results.append(
                                            {
                                                "url": f"https://image.tmdb.org/t/p/w500{poster.get('file_path')}",
                                                "original_url": original_url,
                                                "source": "TMDB",
                                                "source_type": source,  # "provided_id" or "title_search"
                                                "type": "poster",
                                                "language": poster.get("iso_639_1"),
                                                "vote_average": poster.get(
                                                    "vote_average", 0
                                                ),
                                            }
                                        )

                logger.info(
                    f" TMDB: Collected {len(all_results)} unique images from {len(tmdb_ids_to_use)} ID(s)"
                )

            except Exception as e:
                logger.error(f"Error fetching TMDB assets: {e}")

            return all_results

        async def fetch_tvdb():
            """Fetch TVDB assets asynchronously from all collected IDs"""
            if not tvdb_api_key:
                logger.warning("TVDB: No API key configured")
                return []

            if not tvdb_ids_to_use:
                logger.warning(
                    f"TVDB: No TVDB IDs available (media_type={request.media_type}, asset_type={request.asset_type}) - skipping TVDB fetch"
                )
                return []

            logger.info(
                f"TVDB: Starting fetch for {len(tvdb_ids_to_use)} ID(s): {tvdb_ids_to_use}"
            )
            all_results = []
            seen_urls = set()  # Track unique image URLs to avoid duplicates

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    login_url = "https://api4.thetvdb.com/v4/login"
                    body = {"apikey": tvdb_api_key}
                    if tvdb_pin:
                        body["pin"] = tvdb_pin

                    headers_tvdb = {
                        "accept": "application/json",
                        "Content-Type": "application/json",
                    }

                    login_response = await client.post(
                        login_url, json=body, headers=headers_tvdb
                    )

                    if login_response.status_code == 200:
                        token = login_response.json().get("data", {}).get("token")

                        if token:
                            auth_headers = {
                                "Authorization": f"Bearer {token}",
                                "accept": "application/json",
                            }

                            # Fetch from all collected IDs
                            for source, tvdb_id in tvdb_ids_to_use:
                                # TVDB API v4 supports both series and movies
                                entity_type = (
                                    "series" if request.media_type == "tv" else "movies"
                                )

                                # Handle season-specific requests
                                if (
                                    request.asset_type == "season"
                                    and request.season_number
                                    and entity_type == "series"
                                ):
                                    # Fetch season-specific artwork using extended endpoint
                                    logger.info(
                                        f" TVDB: Fetching season {request.season_number} artwork for series ID: {tvdb_id} (from {source})"
                                    )
                                    artwork_url = f"https://api4.thetvdb.com/v4/series/{tvdb_id}/extended"

                                    logger.info(f" TVDB: Requesting {artwork_url}")
                                    artwork_response = await client.get(
                                        artwork_url,
                                        headers=auth_headers,
                                    )

                                    logger.info(
                                        f" TVDB: Response status: {artwork_response.status_code}"
                                    )
                                    if artwork_response.status_code == 200:
                                        extended_data = artwork_response.json()
                                        seasons = extended_data.get("data", {}).get(
                                            "seasons", []
                                        )
                                        logger.info(
                                            f" TVDB: Found {len(seasons)} seasons in response"
                                        )

                                        # Find matching season
                                        for season in seasons:
                                            if (
                                                season.get("number")
                                                == request.season_number
                                            ):
                                                season_image = season.get("image")
                                                if (
                                                    season_image
                                                    and season_image not in seen_urls
                                                ):
                                                    seen_urls.add(season_image)
                                                    all_results.append(
                                                        {
                                                            "url": season_image,
                                                            "original_url": season_image,
                                                            "source": "TVDB",
                                                            "source_type": source,
                                                            "type": "season",
                                                            "language": "eng",
                                                        }
                                                    )
                                                    logger.info(
                                                        f" TVDB: Added season {request.season_number} poster"
                                                    )
                                                break
                                    else:
                                        logger.warning(
                                            f" TVDB: Non-200 response: {artwork_response.status_code} - {artwork_response.text[:200]}"
                                        )
                                else:
                                    # Regular artwork fetch (posters, backgrounds)
                                    logger.info(
                                        f" TVDB: Fetching artwork for {entity_type} ID: {tvdb_id} (from {source})"
                                    )

                                    # For manual ID entry (prefix detected), try both movies and series
                                    # This handles cases where user enters tvdb:28 without knowing if it's a movie or series
                                    should_try_both_types = source == "manual_id_entry"

                                    # Try movies first (if entity_type is movies OR if manual entry)
                                    if entity_type == "movies" or should_try_both_types:
                                        artwork_url = f"https://api4.thetvdb.com/v4/movies/{tvdb_id}/extended"

                                        logger.info(
                                            f" TVDB: Requesting {artwork_url} (movies extended)"
                                        )
                                        artwork_response = await client.get(
                                            artwork_url,
                                            headers=auth_headers,
                                        )

                                        logger.info(
                                            f" TVDB: Movies response status: {artwork_response.status_code}"
                                        )

                                        if artwork_response.status_code == 200:
                                            movie_data = artwork_response.json()
                                            artworks = movie_data.get("data", {}).get(
                                                "artworks", []
                                            )
                                            logger.info(
                                                f" TVDB: Found {len(artworks)} artworks in movies extended response"
                                            )

                                            # Debug: Log first few artwork types to understand the structure
                                            if artworks:
                                                sample_types = {}
                                                for artwork in artworks[:10]:
                                                    art_type = artwork.get("type")
                                                    if art_type not in sample_types:
                                                        sample_types[art_type] = 0
                                                    sample_types[art_type] += 1
                                                logger.info(
                                                    f" TVDB: Sample artwork types from first 10: {sample_types}"
                                                )

                                            # Filter artworks by type
                                            poster_count = 0
                                            background_count = 0
                                            for artwork in artworks:
                                                artwork_type = artwork.get("type")
                                                image_url = artwork.get("image")

                                                # Movies endpoint uses different type codes than series
                                                # type=14 for posters, type=15 for backgrounds
                                                # "standard" asset type is treated as posters
                                                if (
                                                    request.asset_type
                                                    in ["poster", "standard"]
                                                ) and artwork_type == 14:
                                                    poster_count += 1
                                                    if (
                                                        image_url
                                                        and image_url not in seen_urls
                                                    ):
                                                        seen_urls.add(image_url)
                                                        all_results.append(
                                                            {
                                                                "url": image_url,
                                                                "original_url": image_url,
                                                                "source": "TVDB",
                                                                "source_type": source,
                                                                "type": request.asset_type,
                                                                "language": artwork.get(
                                                                    "language"
                                                                ),
                                                            }
                                                        )
                                                elif (
                                                    request.asset_type == "background"
                                                    and artwork_type == 15
                                                ):
                                                    background_count += 1
                                                    if (
                                                        image_url
                                                        and image_url not in seen_urls
                                                    ):
                                                        seen_urls.add(image_url)
                                                        all_results.append(
                                                            {
                                                                "url": image_url,
                                                                "original_url": image_url,
                                                                "source": "TVDB",
                                                                "source_type": source,
                                                                "type": request.asset_type,
                                                                "language": artwork.get(
                                                                    "language"
                                                                ),
                                                            }
                                                        )

                                            logger.info(
                                                f" TVDB: Movies artwork types - Posters (type=14): {poster_count}, Backgrounds (type=15): {background_count}, Added to results: {len(all_results)}"
                                            )
                                        else:
                                            logger.info(
                                                f" TVDB: Movies endpoint returned {artwork_response.status_code} - {'Success but no artworks' if artwork_response.status_code == 200 else 'trying series endpoint'}"
                                            )

                                    # Try series endpoint (if entity_type is series OR if manual entry and movies didn't work)
                                    if entity_type == "series" or (
                                        should_try_both_types and len(all_results) == 0
                                    ):
                                        artwork_url = f"https://api4.thetvdb.com/v4/series/{tvdb_id}/artworks"
                                        artwork_params = {
                                            "lang": "eng",
                                            "type": "2",
                                        }  # type=2 for posters

                                        if request.asset_type == "background":
                                            artwork_params["type"] = (
                                                "3"  # type=3 for backgrounds
                                            )

                                        logger.info(
                                            f" TVDB: Requesting {artwork_url} with params {artwork_params} (series)"
                                        )
                                        artwork_response = await client.get(
                                            artwork_url,
                                            headers=auth_headers,
                                            params=artwork_params,
                                        )

                                        logger.info(
                                            f" TVDB: Series response status: {artwork_response.status_code}"
                                        )
                                        if artwork_response.status_code == 200:
                                            artwork_data = artwork_response.json()
                                            artworks = artwork_data.get("data", {}).get(
                                                "artworks", []
                                            )
                                            logger.info(
                                                f" TVDB: Found {len(artworks)} artworks in series response"
                                            )

                                            for artwork in artworks:
                                                image_url = artwork.get("image")
                                                if (
                                                    image_url
                                                    and image_url not in seen_urls
                                                ):
                                                    seen_urls.add(image_url)
                                                    all_results.append(
                                                        {
                                                            "url": image_url,
                                                            "original_url": image_url,
                                                            "source": "TVDB",
                                                            "source_type": source,  # "provided_id" or "title_search"
                                                            "type": request.asset_type,
                                                            "language": artwork.get(
                                                                "language"
                                                            ),
                                                        }
                                                    )
                                        else:
                                            logger.info(
                                                f" TVDB: Series endpoint returned {artwork_response.status_code}"
                                            )

                logger.info(
                    f" TVDB: Collected {len(all_results)} unique images from {len(tvdb_ids_to_use)} ID(s)"
                )

            except Exception as e:
                logger.error(f"Error fetching TVDB assets: {e}")

            return all_results

        async def fetch_fanart():
            """Fetch Fanart.tv assets asynchronously from all collected IDs

            ID Usage:
            - Movies: TMDB ID + IMDB ID
            - TV Shows: TVDB ID only
            """
            if not fanart_api_key:
                logger.warning("Fanart.tv: No API key configured")
                return []

            # Check if we have any IDs to use
            imdb_id = getattr(request, "imdb_id", None)

            # If we detected a manual IMDB ID entry, use it for Fanart (Movies only!)
            if not imdb_id and potential_imdb_id and request.media_type == "movie":
                imdb_id = potential_imdb_id
                logger.info(f"Using manually entered IMDB ID for Fanart.tv: {imdb_id}")

            if not (tmdb_ids_to_use or tvdb_ids_to_use or imdb_id):
                logger.warning("Fanart.tv: No TMDB, TVDB, or IMDB IDs available")
                return []

            all_results = []
            seen_urls = set()  # Track unique image URLs to avoid duplicates

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    # ========== MOVIES: Use TMDB ID + IMDB ID ==========
                    if request.media_type == "movie":
                        # Try TMDB IDs first
                        if tmdb_ids_to_use:
                            for source, tmdb_id in tmdb_ids_to_use:
                                logger.info(
                                    f" Fanart.tv: Fetching movie artwork for TMDB ID: {tmdb_id} (from {source})"
                                )
                                url = f"https://webservice.fanart.tv/v3/movies/{tmdb_id}?api_key={fanart_api_key}"
                                response = await client.get(url)
                                if response.status_code == 200:
                                    data = response.json()

                                    # Map asset types to fanart.tv keys
                                    if request.asset_type == "poster":
                                        fanart_keys = ["movieposter"]
                                    elif request.asset_type == "background":
                                        fanart_keys = ["moviebackground"]
                                    else:
                                        fanart_keys = []

                                    for key in fanart_keys:
                                        for item in data.get(key, []):
                                            item_url = item.get("url")
                                            if item_url and item_url not in seen_urls:
                                                seen_urls.add(item_url)
                                                all_results.append(
                                                    {
                                                        "url": item_url,
                                                        "original_url": item_url,
                                                        "source": "Fanart.tv",
                                                        "source_type": source,
                                                        "type": request.asset_type,
                                                        "language": item.get("lang"),
                                                        "likes": item.get("likes", 0),
                                                    }
                                                )

                        # Also try IMDB ID if available (Movies only!)
                        if imdb_id:
                            logger.info(
                                f" Fanart.tv: Fetching movie artwork for IMDB ID: {imdb_id} (from database)"
                            )
                            url = f"https://webservice.fanart.tv/v3/movies/{imdb_id}?api_key={fanart_api_key}"
                            response = await client.get(url)
                            if response.status_code == 200:
                                data = response.json()

                                # Map asset types to fanart.tv keys
                                if request.asset_type == "poster":
                                    fanart_keys = ["movieposter"]
                                elif request.asset_type == "background":
                                    fanart_keys = ["moviebackground"]
                                else:
                                    fanart_keys = []

                                for key in fanart_keys:
                                    for item in data.get(key, []):
                                        item_url = item.get("url")
                                        if item_url and item_url not in seen_urls:
                                            seen_urls.add(item_url)
                                            all_results.append(
                                                {
                                                    "url": item_url,
                                                    "original_url": item_url,
                                                    "source": "Fanart.tv",
                                                    "source_type": "imdb_id",
                                                    "type": request.asset_type,
                                                    "language": item.get("lang"),
                                                    "likes": item.get("likes", 0),
                                                }
                                            )

                    # ========== TV SHOWS: Use TVDB ID only ==========
                    elif request.media_type == "tv" and tvdb_ids_to_use:
                        logger.info(
                            f" Fanart.tv: Processing {len(tvdb_ids_to_use)} TVDB IDs for TV show"
                        )
                        for source, tvdb_id in tvdb_ids_to_use:
                            logger.info(
                                f" Fanart.tv: Fetching TV artwork for TVDB ID: {tvdb_id} (from {source})"
                            )
                            url = f"https://webservice.fanart.tv/v3/tv/{tvdb_id}?api_key={fanart_api_key}"
                            response = await client.get(url)
                            logger.info(
                                f" Fanart.tv: Response status: {response.status_code}"
                            )
                            if response.status_code == 200:
                                data = response.json()

                                # Map asset types to fanart.tv keys
                                if request.asset_type == "poster":
                                    # Standard TV show posters
                                    fanart_keys = ["tvposter"]
                                elif request.asset_type == "season":
                                    # Season-specific posters
                                    # Fanart.tv has seasonposter but requires season filtering
                                    fanart_keys = ["seasonposter"]
                                elif request.asset_type == "background":
                                    fanart_keys = ["showbackground"]
                                else:
                                    fanart_keys = []

                                logger.info(
                                    f" Fanart.tv: Looking for keys: {fanart_keys}"
                                )
                                for key in fanart_keys:
                                    items = data.get(key, [])
                                    logger.info(
                                        f" Fanart.tv: Found {len(items)} items for key '{key}'"
                                    )
                                    for item in items:
                                        # For season posters, filter by season number
                                        if (
                                            key == "seasonposter"
                                            and request.season_number
                                        ):
                                            item_season = item.get("season")
                                            # Convert to int for comparison, handle string seasons like "1" or "01"
                                            try:
                                                item_season_num = (
                                                    int(item_season)
                                                    if item_season
                                                    else None
                                                )
                                            except (ValueError, TypeError):
                                                item_season_num = None

                                            if item_season_num != request.season_number:
                                                logger.debug(
                                                    f" Fanart.tv: Skipping season {item_season} poster (looking for season {request.season_number})"
                                                )
                                                continue
                                            else:
                                                logger.info(
                                                    f" Fanart.tv: Found matching season {request.season_number} poster"
                                                )

                                        item_url = item.get("url")
                                        if item_url and item_url not in seen_urls:
                                            seen_urls.add(item_url)
                                            all_results.append(
                                                {
                                                    "url": item_url,
                                                    "original_url": item_url,
                                                    "source": "Fanart.tv",
                                                    "source_type": source,  # "provided_id" or "title_search"
                                                    "type": request.asset_type,
                                                    "language": item.get("lang"),
                                                    "likes": item.get("likes", 0),
                                                }
                                            )
                            else:
                                logger.warning(
                                    f" Fanart.tv: Non-200 response: {response.status_code}"
                                )
                    else:
                        if request.media_type == "tv" and not tvdb_ids_to_use:
                            logger.warning(
                                f" Fanart.tv: TV show requested but no TVDB IDs available"
                            )

                logger.info(f" Fanart.tv: Collected {len(all_results)} unique images")

            except Exception as e:
                logger.error(f"Error fetching Fanart.tv assets: {e}")

            return all_results

        # Fetch from all providers in parallel
        logger.info("Fetching assets from all providers in parallel...")
        tmdb_results, tvdb_results, fanart_results = await asyncio.gather(
            fetch_tmdb(), fetch_tvdb(), fetch_fanart(), return_exceptions=True
        )

        # Handle exceptions from gather
        if isinstance(tmdb_results, Exception):
            logger.error(f"TMDB fetch failed: {tmdb_results}")
            tmdb_results = []
        if isinstance(tvdb_results, Exception):
            logger.error(f"TVDB fetch failed: {tvdb_results}")
            tvdb_results = []
        if isinstance(fanart_results, Exception):
            logger.error(f"Fanart fetch failed: {fanart_results}")
            fanart_results = []

        results["tmdb"] = tmdb_results
        results["tvdb"] = tvdb_results
        results["fanart"] = fanart_results

        # Apply language filtering based on asset type
        logger.info(
            f" Applying language filtering for asset_type: {request.asset_type}"
        )

        if request.asset_type == "season":
            # Filter season posters by PreferredSeasonLanguageOrder
            logger.info(f"   Using season language order: {season_language_order_list}")
            results["tmdb"] = filter_and_sort_by_language(
                results["tmdb"], season_language_order_list
            )
            results["tvdb"] = filter_and_sort_by_language(
                results["tvdb"], season_language_order_list
            )
            results["fanart"] = filter_and_sort_by_language(
                results["fanart"], season_language_order_list
            )
        elif request.asset_type == "background" or request.asset_type == "titlecard":
            # Filter backgrounds and titlecards by PreferredBackgroundLanguageOrder
            logger.info(
                f"   Using background language order: {background_language_order_list}"
            )
            results["tmdb"] = filter_and_sort_by_language(
                results["tmdb"], background_language_order_list
            )
            results["tvdb"] = filter_and_sort_by_language(
                results["tvdb"], background_language_order_list
            )
            results["fanart"] = filter_and_sort_by_language(
                results["fanart"], background_language_order_list
            )
        else:
            # Filter standard posters by PreferredLanguageOrder
            logger.info(f"   Using standard language order: {language_order_list}")
            results["tmdb"] = filter_and_sort_by_language(
                results["tmdb"], language_order_list
            )
            results["tvdb"] = filter_and_sort_by_language(
                results["tvdb"], language_order_list
            )
            results["fanart"] = filter_and_sort_by_language(
                results["fanart"], language_order_list
            )

        # Count total results after filtering
        total_count = sum(len(results[source]) for source in results)

        logger.info(
            f"After language filtering: {total_count} results - "
            f"TMDB={len(results['tmdb'])}, TVDB={len(results['tvdb'])}, Fanart={len(results['fanart'])}"
        )

        return {
            "success": True,
            "results": results,
            "total_count": total_count,
            "detected_provider": detected_provider,  # Let frontend know if a prefix was used
        }

    except Exception as e:
        logger.error(f"Error fetching asset replacements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/assets/upload-replacement")
async def upload_asset_replacement(
    file: UploadFile = File(...),
    asset_path: str = Query(...),
    process_with_overlays: bool = Query(False),
    title_text: Optional[str] = Query(None),
    folder_name: Optional[str] = Query(None),
    library_name: Optional[str] = Query(None),
    season_number: Optional[str] = Query(None),
    episode_number: Optional[str] = Query(None),
    episode_title: Optional[str] = Query(None),
):
    """
    Replace an asset with an uploaded image
    Optionally process with overlays using Manual Run
    """
    try:
        # Check if Posterizarr is currently running
        if RUNNING_FILE.exists():
            logger.warning(
                f"Asset replacement blocked: Posterizarr is currently running"
            )
            raise HTTPException(
                status_code=409,
                detail="Cannot replace assets while Posterizarr is running. Please wait until all processing is completed before using the replace or manual update options.",
            )

        logger.info(f"Asset replacement upload request received")
        logger.info(f"  Asset path: {asset_path}")
        logger.info(f"  File: {file.filename}")
        logger.info(f"  Content type: {file.content_type}")
        logger.info(f"  Process with overlays: {process_with_overlays}")

        # Validate file upload
        if not file or not file.filename:
            logger.error("No file uploaded")
            raise HTTPException(status_code=400, detail="No file uploaded")

        # Validate file type - check both content type and extension
        allowed_extensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]
        file_extension = Path(file.filename).suffix.lower()

        if file_extension not in allowed_extensions:
            logger.error(f"Invalid file extension: {file_extension}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}",
            )

        # Validate content type
        if not file.content_type or not file.content_type.startswith("image/"):
            logger.error(f"Invalid content type: {file.content_type}")
            raise HTTPException(status_code=400, detail="File must be an image")

        # Validate and sanitize asset path
        try:
            # Normalize the path to handle different path separators (Windows/Linux/Docker)
            normalized_path = Path(asset_path)

            # Determine target directory based on process_with_overlays flag
            # If NOT processing with overlays, save to manualassets folder
            if not process_with_overlays:
                target_base_dir = MANUAL_ASSETS_DIR
                logger.info(
                    f"Saving to manual assets directory (no overlay processing)"
                )
            else:
                target_base_dir = ASSETS_DIR
                logger.info(f"Saving to assets directory (with overlay processing)")

            # Handle absolute paths (for assets outside app root)
            if normalized_path.is_absolute():
                full_asset_path = normalized_path.resolve()
                logger.info(f"Using absolute asset path: {full_asset_path}")
            else:
                full_asset_path = (target_base_dir / normalized_path).resolve()
                logger.info(f"Using relative asset path: {full_asset_path}")

            # Security: For relative paths, ensure they don't escape target directory
            if not normalized_path.is_absolute():
                if not str(full_asset_path).startswith(str(target_base_dir.resolve())):
                    logger.error(f"Path traversal attempt detected: {asset_path}")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid asset path - path traversal not allowed",
                    )

            # Log whether this is a new asset or replacement
            if full_asset_path.exists():
                logger.info(f"Replacing existing asset: {full_asset_path}")
            else:
                logger.info(f"Creating new asset: {full_asset_path}")

            logger.info(f"Full asset path: {full_asset_path}")
            logger.info(f"Target Dir: {target_base_dir}")

        except (ValueError, OSError) as e:
            logger.error(f"Invalid asset path '{asset_path}': {e}")
            raise HTTPException(status_code=400, detail=f"Invalid asset path: {str(e)}")

        # Ensure parent directory exists with permission check
        try:
            full_asset_path.parent.mkdir(parents=True, exist_ok=True)
            # Test write permissions in parent directory
            test_file = full_asset_path.parent / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError as e:
            logger.error(
                f"No write permission for asset directory: {full_asset_path.parent}"
            )
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for asset directory. On Docker/NAS/Unraid, ensure volume is mounted with write permissions (e.g., /assets:/assets:rw).",
            )
        except OSError as e:
            logger.error(f"OS error accessing asset directory: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Cannot access asset directory: {str(e)}. Check if the path exists and is accessible.",
            )

        # Read uploaded file
        try:
            contents = await file.read()
            logger.info(f"File read successfully: {len(contents)} bytes")
        except Exception as e:
            logger.error(f"Error reading uploaded file: {e}")
            raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

        # Validate file size
        if len(contents) == 0:
            logger.error("Uploaded file is empty")
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        # Validate image dimensions and reject if too small
        try:
            from PIL import Image
            import io

            # Open image from bytes
            img = Image.open(io.BytesIO(contents))
            width, height = img.size
            logger.info(f"Image dimensions: {width}x{height} pixels")

            # Determine asset type from path/filename
            asset_path_lower = asset_path.lower()
            is_poster = (
                "poster" in asset_path_lower
                or asset_path_lower.endswith((".jpg", ".png"))
                and "background" not in asset_path_lower
                and "titlecard" not in asset_path_lower
                and not re.search(r"s\d+e\d+", asset_path_lower, re.IGNORECASE)
            )
            is_background = "background" in asset_path_lower
            is_titlecard = "titlecard" in asset_path_lower or re.search(
                r"s\d+e\d+", asset_path_lower, re.IGNORECASE
            )
            is_season = (
                re.search(r"season\s*\d+", asset_path_lower, re.IGNORECASE)
                and not is_titlecard
            )

            # Load config to get minimum dimensions
            try:
                if CONFIG_PATH.exists():
                    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                        config = json.load(f)
                    poster_min_width = int(
                        config.get("ApiPart", {}).get("PosterMinWidth", "2000")
                    )
                    poster_min_height = int(
                        config.get("ApiPart", {}).get("PosterMinHeight", "3000")
                    )
                    bg_tc_min_width = int(
                        config.get("ApiPart", {}).get("BgTcMinWidth", "3840")
                    )
                    bg_tc_min_height = int(
                        config.get("ApiPart", {}).get("BgTcMinHeight", "2160")
                    )
                else:
                    # Fallback to defaults if config not available
                    poster_min_width = 2000
                    poster_min_height = 3000
                    bg_tc_min_width = 3840
                    bg_tc_min_height = 2160
            except:
                # Fallback to defaults if config not available
                poster_min_width = 2000
                poster_min_height = 3000
                bg_tc_min_width = 3840
                bg_tc_min_height = 2160

            # Check dimensions based on asset type and REJECT if too small
            if is_poster or is_season:
                if width < poster_min_width or height < poster_min_height:
                    error_msg = f"Image dimensions ({width}x{height}) are too small. Minimum required: {poster_min_width}x{poster_min_height} pixels for posters. Please upload a higher resolution image."
                    logger.error(error_msg)
                    raise HTTPException(status_code=400, detail=error_msg)
            elif is_background or is_titlecard:
                if width < bg_tc_min_width or height < bg_tc_min_height:
                    error_msg = f"Image dimensions ({width}x{height}) are too small. Minimum required: {bg_tc_min_width}x{bg_tc_min_height} pixels for backgrounds/title cards. Please upload a higher resolution image."
                    logger.error(error_msg)
                    raise HTTPException(status_code=400, detail=error_msg)

        except HTTPException:
            # Re-raise HTTP exceptions (dimension validation failures)
            raise
        except Exception as e:
            logger.warning(f"Could not validate image dimensions: {e}")
            # Don't fail upload if dimension check itself fails, just log it

        # Check if asset exists in alternate location (for moving between folders)
        alternate_base_dir = (
            ASSETS_DIR if not process_with_overlays else MANUAL_ASSETS_DIR
        )
        alternate_asset_path = alternate_base_dir / normalized_path
        asset_exists_in_alternate = alternate_asset_path.exists()

        # Track if this is a replacement or new asset in target location
        is_replacement = full_asset_path.exists()

        # Create backup of original if replacing in target location
        if is_replacement:
            try:
                backup_path = full_asset_path.with_suffix(
                    full_asset_path.suffix + ".backup"
                )
                if not backup_path.exists():
                    import shutil

                    shutil.copy2(full_asset_path, backup_path)
                    logger.info(f"Created backup: {backup_path}")
            except Exception as e:
                logger.warning(f"Failed to create backup (continuing anyway): {e}")

        # Delete old asset from alternate location if moving between folders
        if asset_exists_in_alternate and not is_replacement:
            try:
                logger.info(
                    f"Deleting old asset from alternate location: {alternate_asset_path}"
                )
                alternate_asset_path.unlink()
                # Also delete backup if exists
                alternate_backup = alternate_asset_path.with_suffix(
                    alternate_asset_path.suffix + ".backup"
                )
                if alternate_backup.exists():
                    alternate_backup.unlink()
                    logger.info(f"Deleted old backup: {alternate_backup}")
            except Exception as e:
                logger.warning(
                    f"Could not delete old asset from alternate location: {e}"
                )

        # Save new image
        try:
            with open(full_asset_path, "wb") as f:
                f.write(contents)

            # Verify file was written correctly
            if not full_asset_path.exists():
                raise HTTPException(
                    status_code=500, detail="File was not saved successfully"
                )

            actual_size = full_asset_path.stat().st_size
            if actual_size != len(contents):
                logger.error(
                    f"File size mismatch: expected {len(contents)}, got {actual_size}"
                )
                raise HTTPException(
                    status_code=500, detail="File was not saved completely"
                )

            action = "Replaced" if is_replacement else "Created"
            logger.info(
                f"{action} asset: {asset_path} (size: {len(contents)} bytes, target: {target_base_dir.name})"
            )
        except PermissionError as e:
            logger.error(f"Permission denied writing to {full_asset_path}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Permission denied: Unable to write to file. On Docker/NAS/Unraid, check that user has write permissions (uid/gid mapping).",
            )
        except OSError as e:
            logger.error(f"OS error writing to {full_asset_path}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"File system error: {str(e)}. Check disk space, mount points, and file system health (especially on NAS/RAID systems).",
            )
        except Exception as e:
            logger.error(f"Unexpected error writing file: {e}")
            import traceback

            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

        result = {
            "success": True,
            "message": f"Asset {'replaced' if is_replacement else 'created'} successfully",
            "path": asset_path,
            "size": len(contents),
            "was_replacement": is_replacement,
        }

        # If process_with_overlays is enabled, trigger Manual Run
        if process_with_overlays:
            logger.info(f"Processing with overlays enabled for: {asset_path}")

            try:
                # Parse asset path to extract info
                # Format: LibraryName/FolderName/poster.jpg, Season01.jpg, or S01E01.jpg
                path_parts = Path(asset_path).parts
                logger.info(f"Path parts: {path_parts} (length: {len(path_parts)})")

                if len(path_parts) >= 3:
                    # Use provided library_name and folder_name if available, otherwise extract from path
                    extracted_library_name = path_parts[0]
                    extracted_folder_name = path_parts[1]

                    final_library_name = library_name or extracted_library_name
                    final_folder_name = folder_name or extracted_folder_name
                    final_title_text = title_text or extracted_folder_name

                    logger.info(
                        f"Overlay parameters - Library: {final_library_name}, Folder: {final_folder_name}, Title: {final_title_text}"
                    )

                    # Determine poster type from filename
                    filename = Path(asset_path).name.lower()

                    # Build Manual Run command
                    command = [
                        "pwsh" if os.name == "nt" else "pwsh",
                        "-File",
                        str(SCRIPT_PATH),
                        "-manual",
                        "-PicturePath",
                        str(full_asset_path),
                        "-Titletext",
                        final_title_text,
                        "-FolderName",
                        final_folder_name,
                        "-LibraryName",
                        final_library_name,
                    ]

                    # Handle Season posters (Season01.jpg, Season 01.jpg, etc.)
                    if season_number or "season" in filename:
                        command.extend(["-SeasonPoster"])
                        if season_number:
                            command.extend(["-SeasonPosterName", season_number])

                    # Handle TitleCards (S01E01.jpg, etc.)
                    elif episode_number and episode_title:
                        command.extend(["-TitleCards"])
                        command.extend(["-EpisodeNumber", episode_number])
                        command.extend(["-EpisodeTitleName", episode_title])

                    # Handle Background cards (background.jpg, backdrop.jpg, etc.)
                    elif "background" in filename or "backdrop" in filename:
                        command.extend(["-BackgroundCard"])

                    # Default: Standard poster
                    # No additional flags needed

                    logger.info(
                        f"Starting Manual Run for overlay processing: {' '.join(command)}"
                    )

                    # Start the Manual Run process
                    import subprocess
                    from datetime import datetime

                    process = subprocess.Popen(
                        command,
                        cwd=str(BASE_DIR),
                        stdout=None,
                        stderr=None,
                        text=True,
                    )

                    logger.info(
                        f"Manual Run started (PID: {process.pid}) for overlay processing"
                    )

                    result["manual_run_triggered"] = True
                    result["message"] = (
                        "Asset replaced and queued for overlay processing"
                    )

                else:
                    logger.warning(
                        f"Invalid path structure for overlay processing: {asset_path}"
                    )
                    result["manual_run_triggered"] = False
                    result["message"] = (
                        "Asset replaced but overlay processing skipped (invalid path structure)"
                    )

            except Exception as e:
                logger.error(f"Error triggering Manual Run: {e}")
                result["manual_run_triggered"] = False
                result["error"] = str(e)

        return result

    except HTTPException:
        raise
    except Exception as e:
        import traceback

        error_details = traceback.format_exc()
        logger.error(f"Unexpected error uploading asset replacement: {e}")
        logger.error(f"Traceback:\n{error_details}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/api/assets/replace-from-url")
async def replace_asset_from_url(
    asset_path: str = Query(...),
    image_url: str = Query(...),
    process_with_overlays: bool = Query(False),
    title_text: Optional[str] = Query(None),
    folder_name: Optional[str] = Query(None),
    library_name: Optional[str] = Query(None),
    season_number: Optional[str] = Query(None),
    episode_number: Optional[str] = Query(None),
    episode_title: Optional[str] = Query(None),
):
    """
    Replace an asset by downloading from a URL
    Optionally process with overlays using Manual Run
    """
    try:
        # Check if Posterizarr is currently running
        if RUNNING_FILE.exists():
            logger.warning(
                f"Asset replacement blocked: Posterizarr is currently running"
            )
            raise HTTPException(
                status_code=409,
                detail="Cannot replace assets while Posterizarr is running. Please wait until all processing is completed before using the replace or manual update options.",
            )

        # Validate asset path exists
        # Determine target directory based on process_with_overlays flag
        if not process_with_overlays:
            target_base_dir = MANUAL_ASSETS_DIR
            logger.info(f"Saving to manual assets directory (no overlay processing)")
        else:
            target_base_dir = ASSETS_DIR
            logger.info(f"Saving to assets directory (with overlay processing)")

        full_asset_path = target_base_dir / asset_path

        # Check if asset exists in either location (for replacement)
        # First check target location, then check alternate location
        asset_exists_in_target = full_asset_path.exists()

        # Also check the alternate location (in case user is moving between folders)
        alternate_base_dir = (
            ASSETS_DIR if not process_with_overlays else MANUAL_ASSETS_DIR
        )
        alternate_asset_path = alternate_base_dir / asset_path
        asset_exists_in_alternate = alternate_asset_path.exists()

        if not asset_exists_in_target and not asset_exists_in_alternate:
            logger.warning(
                f"Asset not found in either location, will create new: {asset_path}"
            )
            # Don't fail - just create new asset

        # Download image from URL
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400, detail="Failed to download image from URL"
                )

            contents = response.content

        # Ensure target directory exists
        full_asset_path.parent.mkdir(parents=True, exist_ok=True)

        # Create backup of original if it exists in target location
        if asset_exists_in_target:
            backup_path = full_asset_path.with_suffix(
                full_asset_path.suffix + ".backup"
            )
            if not backup_path.exists():
                import shutil

                shutil.copy2(full_asset_path, backup_path)
                logger.info(f"Created backup: {backup_path}")

        # Delete old asset from alternate location if moving between folders
        if asset_exists_in_alternate and not asset_exists_in_target:
            try:
                logger.info(
                    f"Deleting old asset from alternate location: {alternate_asset_path}"
                )
                alternate_asset_path.unlink()
                # Also delete backup if exists
                alternate_backup = alternate_asset_path.with_suffix(
                    alternate_asset_path.suffix + ".backup"
                )
                if alternate_backup.exists():
                    alternate_backup.unlink()
                    logger.info(f"Deleted old backup: {alternate_backup}")
            except Exception as e:
                logger.warning(
                    f"Could not delete old asset from alternate location: {e}"
                )

        # Save new image
        with open(full_asset_path, "wb") as f:
            f.write(contents)

        logger.info(
            f"Replaced asset from URL: {asset_path} (size: {len(contents)} bytes, target: {target_base_dir.name})"
        )

        # Add/Update database entry for this replaced asset (mark as Manual)
        try:
            await update_asset_db_entry_as_manual(
                asset_path, image_url, library_name, folder_name, title_text
            )
        except Exception as e:
            logger.warning(f"Could not update database entry for replaced asset: {e}")

        result = {
            "success": True,
            "message": "Asset replaced successfully",
            "path": asset_path,
            "size": len(contents),
        }

        # If process_with_overlays is enabled, trigger Manual Run
        if process_with_overlays:
            logger.info(f"Processing with overlays enabled for: {asset_path}")

            try:
                # Parse asset path to extract info
                # Format: LibraryName/FolderName/poster.jpg, Season01.jpg, or S01E01.jpg
                path_parts = Path(asset_path).parts

                if len(path_parts) >= 3:
                    # Use provided library_name and folder_name if available, otherwise extract from path
                    extracted_library_name = path_parts[0]
                    extracted_folder_name = path_parts[1]
                    filename = path_parts[-1]

                    # Prefer user-provided values over extracted values
                    final_library_name = (
                        library_name if library_name else extracted_library_name
                    )
                    final_folder_name = (
                        folder_name if folder_name else extracted_folder_name
                    )

                    # Determine poster type from filename
                    poster_type = None
                    season_poster_name = None
                    ep_title_name = None
                    ep_number = None

                    if filename == "poster.jpg":
                        poster_type = "standard"
                    elif filename == "background.jpg":
                        poster_type = "background"
                    elif re.match(r"^Season(\d+)\.jpg$", filename):
                        poster_type = "season"
                        # Extract season number from filename or use provided one
                        season_match = re.match(r"^Season(\d+)\.jpg$", filename)
                        if season_match:
                            extracted_season = season_match.group(1)
                            # Use provided season_number as-is (user controls the text)
                            # If not provided, fall back to extracted season number only
                            season_poster_name = (
                                season_number if season_number else extracted_season
                            )
                        elif season_number:
                            # Use whatever the user provided as-is
                            season_poster_name = season_number
                        else:
                            raise ValueError(
                                f"Could not determine season number for: {filename}"
                            )
                    elif re.match(r"^S(\d+)E(\d+)\.jpg$", filename):
                        poster_type = "titlecard"
                        # Extract season/episode from filename or use provided values
                        ep_match = re.match(r"^S(\d+)E(\d+)\.jpg$", filename)
                        if ep_match:
                            extracted_season = ep_match.group(1)
                            extracted_episode = ep_match.group(2)
                            # Use provided values or fall back to extracted
                            season_poster_name = (
                                season_number if season_number else extracted_season
                            )
                            ep_number = (
                                episode_number if episode_number else extracted_episode
                            )
                        else:
                            season_poster_name = season_number
                            ep_number = episode_number

                        # Episode title must be provided
                        if not episode_title:
                            raise ValueError(
                                f"Episode title is required for title card processing"
                            )
                        ep_title_name = episode_title
                    else:
                        raise ValueError(
                            f"Unsupported file type for overlay processing: {filename}"
                        )

                    # Extract title text from folder name if not provided
                    # Remove year and TMDB/TVDB ID from folder name
                    final_title_text = title_text
                    if not final_title_text:
                        # Match patterns like "Movie Name (2024) {tmdb-12345}"
                        title_match = re.match(r"^(.+?)\s*\(\d{4}\)", final_folder_name)
                        if title_match:
                            final_title_text = title_match.group(1).strip()
                        else:
                            # Fallback: use folder name as-is
                            final_title_text = final_folder_name

                    logger.info(
                        f"Manual Run params - Library: {final_library_name}, Folder: {final_folder_name}, Type: {poster_type}, Title: {final_title_text}"
                    )
                    if season_poster_name:
                        logger.info(f"Season: {season_poster_name}")
                    if ep_number and ep_title_name:
                        logger.info(f"Episode: {ep_number} - {ep_title_name}")

                    # Build ManualModeRequest
                    manual_request = ManualModeRequest(
                        picturePath=str(full_asset_path),
                        titletext=(
                            final_title_text
                            if poster_type != "titlecard"
                            else ep_title_name
                        ),
                        folderName=final_folder_name,
                        libraryName=final_library_name,
                        posterType=poster_type,
                        seasonPosterName=season_poster_name or "",
                        epTitleName=ep_title_name or "",
                        episodeNumber=ep_number or "",
                    )

                    # Call trigger_manual_run_internal
                    await trigger_manual_run_internal(manual_request)

                    result["message"] = (
                        "Asset replaced and queued for overlay processing"
                    )
                    result["manual_run_triggered"] = True
                    logger.info(f"Manual Run triggered successfully for {asset_path}")
                else:
                    logger.warning(
                        f"Cannot extract library/folder from path: {asset_path}"
                    )
                    result["manual_run_triggered"] = False
                    result["message"] = (
                        "Asset replaced but overlay processing skipped (invalid path structure)"
                    )

            except Exception as e:
                logger.error(f"Failed to trigger Manual Run: {e}")
                result["manual_run_triggered"] = False
                result["manual_run_error"] = str(e)
                # Don't fail the whole request, asset is already replaced

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error replacing asset from URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ASSET OVERVIEW ENDPOINT
# ============================================================================


@router.get("/api/assets/overview")
async def get_assets_overview():
    """Get asset overview with categorized issues"""
    if not state_module or not state_module.DATABASE_AVAILABLE or not state_module.db:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        records = state_module.db.get_all_choices()

        # Get primary language and provider from config
        primary_language = None
        primary_provider = None

        try:
            if CONFIG_PATH.exists():
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    api_part = config.get("ApiPart", {})
                    lang_order = api_part.get("PreferredLanguageOrder", [])
                    if lang_order and len(lang_order) > 0:
                        primary_language = lang_order[0]
                    fav_provider = api_part.get("FavProvider", "")
                    if fav_provider:
                        primary_provider = fav_provider.lower()
        except Exception as e:
            logger.warning(f"Could not read config: {e}")

        # Initialize categories
        missing_assets = []
        missing_assets_fav_provider = []
        non_primary_lang = []
        non_primary_provider = []
        truncated_text = []
        assets_with_issues = []

        # Categorize each record
        for record in records:
            record_dict = dict(record)

            # Skip Manual entries
            manual_value = str(record_dict.get("Manual", "")).lower()
            if manual_value == "true":
                continue

            has_issue = False
            download_source = record_dict.get("DownloadSource")
            provider_link = record_dict.get("FavProviderLink", "")

            is_download_missing = (
                download_source == "false"
                or download_source == False
                or not download_source
            )
            is_provider_link_missing = (
                provider_link == "false" or provider_link == False or not provider_link
            )

            if is_download_missing:
                missing_assets.append(record_dict)
                has_issue = True

            if is_provider_link_missing:
                missing_assets_fav_provider.append(record_dict)
                has_issue = True

            # Non-Primary Language
            language = record_dict.get("Language", "")
            if language and primary_language:
                lang_normalized = (
                    "xx" if language.lower() == "textless" else language.lower()
                )
                primary_normalized = (
                    "xx"
                    if primary_language.lower() == "textless"
                    else primary_language.lower()
                )
                if lang_normalized != primary_normalized:
                    non_primary_lang.append(record_dict)
                    has_issue = True

            # Non-Primary Provider
            if not is_download_missing and not is_provider_link_missing:
                if primary_provider:
                    provider_patterns = {
                        "tmdb": ["tmdb", "themoviedb"],
                        "tvdb": ["tvdb", "thetvdb"],
                        "fanart": ["fanart"],
                        "plex": ["plex"],
                    }
                    patterns = provider_patterns.get(
                        primary_provider, [primary_provider]
                    )
                    is_download_from_primary = any(
                        pattern in download_source.lower() for pattern in patterns
                    )
                    is_fav_link_from_primary = any(
                        pattern in provider_link.lower() for pattern in patterns
                    )
                    if not is_download_from_primary or not is_fav_link_from_primary:
                        non_primary_provider.append(record_dict)
                        has_issue = True

            # Truncated Text
            truncated_value = str(record_dict.get("TextTruncated", "")).lower()
            if truncated_value == "true":
                truncated_text.append(record_dict)
                has_issue = True

            if has_issue:
                assets_with_issues.append(record_dict)

        return {
            "categories": {
                "missing_assets": {
                    "count": len(missing_assets),
                    "assets": missing_assets,
                },
                "missing_assets_fav_provider": {
                    "count": len(missing_assets_fav_provider),
                    "assets": missing_assets_fav_provider,
                },
                "non_primary_lang": {
                    "count": len(non_primary_lang),
                    "assets": non_primary_lang,
                },
                "non_primary_provider": {
                    "count": len(non_primary_provider),
                    "assets": non_primary_provider,
                },
                "truncated_text": {
                    "count": len(truncated_text),
                    "assets": truncated_text,
                },
                "assets_with_issues": {
                    "count": len(assets_with_issues),
                    "assets": assets_with_issues,
                },
            },
            "config": {
                "primary_language": primary_language,
                "primary_provider": primary_provider,
            },
        }
    except Exception as e:
        logger.error(f"Error fetching assets overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
