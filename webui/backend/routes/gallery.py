"""
Gallery Router
============================================================

Asset gallery management

Endpoints:
- GET /api/gallery
- DELETE /api/gallery/{path}
- POST /api/gallery/bulk-delete
- GET /api/backgrounds-gallery
- DELETE /api/backgrounds/{path}
- POST /api/backgrounds/bulk-delete
- GET /api/seasons-gallery
- DELETE /api/seasons/{path}
- POST /api/seasons/bulk-delete
- GET /api/titlecards-gallery
- DELETE /api/titlecards/{path}
- POST /api/titlecards/bulk-delete
- GET /api/manual-assets-gallery
- DELETE /api/manual-assets/{path}
- POST /api/manual-assets/bulk-delete
"""

from fastapi import APIRouter, HTTPException
from pathlib import Path
import logging
import re

from models.request_models import BulkDeleteRequest

router = APIRouter(tags=["gallery"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
ASSETS_DIR = None
MANUAL_ASSETS_DIR = None
get_fresh_assets = None
delete_db_entries_for_asset = None
asset_cache = None
state = None


def setup_dependencies(dependencies: dict):
    """Initialize gallery router dependencies"""
    global ASSETS_DIR, MANUAL_ASSETS_DIR, get_fresh_assets, delete_db_entries_for_asset, asset_cache, state

    ASSETS_DIR = dependencies["assets_dir"]
    MANUAL_ASSETS_DIR = dependencies["manual_assets_dir"]
    get_fresh_assets = dependencies["get_fresh_assets_func"]
    delete_db_entries_for_asset = dependencies["delete_db_entries_func"]
    asset_cache = dependencies["asset_cache"]
    state = dependencies.get("state")


# ============================================================================
# POSTERS GALLERY
# ============================================================================


@router.get("/api/gallery")
async def get_gallery():
    """Get poster gallery from assets directory (only poster.jpg) - uses cache"""
    try:
        cache = get_fresh_assets()
        # Return cached posters, limit to 200 for performance
        return {"images": cache["posters"][:200]}
    except Exception as e:
        logger.error(f"Error getting gallery from cache: {e}")
        return {"images": []}


@router.delete("/api/gallery/{path:path}")
async def delete_poster(path: str):
    """Delete a poster from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Poster not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted poster: {file_path}")

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {"success": True, "message": f"Poster '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting poster {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/gallery/bulk-delete")
async def bulk_delete_posters(request: BulkDeleteRequest):
    """Delete multiple posters from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted poster: {file_path}")

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting poster {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} poster(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# BACKGROUNDS GALLERY
# ============================================================================


@router.get("/api/backgrounds-gallery")
async def get_backgrounds_gallery():
    """Get backgrounds gallery from assets directory (only background.jpg) - uses cache"""
    try:
        cache = get_fresh_assets()
        return {"images": cache["backgrounds"][:200]}
    except Exception as e:
        logger.error(f"Error getting backgrounds from cache: {e}")
        return {"images": []}


@router.delete("/api/backgrounds/{path:path}")
async def delete_background(path: str):
    """Delete a background from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Background not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted background: {file_path}")

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {"success": True, "message": f"Background '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting background {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/backgrounds/bulk-delete")
async def bulk_delete_backgrounds(request: BulkDeleteRequest):
    """Delete multiple backgrounds from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted background: {file_path}")

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting background {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} background(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete backgrounds: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SEASONS GALLERY
# ============================================================================


@router.get("/api/seasons-gallery")
async def get_seasons_gallery():
    """Get seasons gallery from assets directory (only SeasonXX.jpg) - uses cache"""
    try:
        cache = get_fresh_assets()
        return {"images": cache["seasons"][:200]}
    except Exception as e:
        logger.error(f"Error getting seasons from cache: {e}")
        return {"images": []}


@router.delete("/api/seasons/{path:path}")
async def delete_season(path: str):
    """Delete a season from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Season not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted season: {file_path}")

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {"success": True, "message": f"Season '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting season {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/seasons/bulk-delete")
async def bulk_delete_seasons(request: BulkDeleteRequest):
    """Delete multiple seasons from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted season: {file_path}")

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting season {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} season(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete seasons: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# TITLECARDS GALLERY
# ============================================================================


@router.get("/api/titlecards-gallery")
async def get_titlecards_gallery():
    """Get title cards gallery from assets directory (only SxxExx.jpg - episodes) - uses cache"""
    try:
        cache = get_fresh_assets()
        return {"images": cache["titlecards"][:200]}
    except Exception as e:
        logger.error(f"Error getting titlecards from cache: {e}")
        return {"images": []}


@router.delete("/api/titlecards/{path:path}")
async def delete_titlecard(path: str):
    """Delete a titlecard from the assets directory"""
    try:
        # Construct the full file path
        file_path = ASSETS_DIR / path

        # Security check: Ensure the path is within ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="TitleCard not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted titlecard: {file_path}")

        # Delete corresponding database entries
        delete_db_entries_for_asset(path)

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {"success": True, "message": f"TitleCard '{path}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting titlecard {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/titlecards/bulk-delete")
async def bulk_delete_titlecards(request: BulkDeleteRequest):
    """Delete multiple titlecards from the assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = ASSETS_DIR / path

                # Security check: Ensure the path is within ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted titlecard: {file_path}")

                # Delete corresponding database entries
                delete_db_entries_for_asset(path)
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting titlecard {path}: {e}")

        # Invalidate cache to reflect changes immediately
        asset_cache["last_scanned"] = 0

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} titlecard(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete titlecards: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# MANUAL ASSETS GALLERY
# ============================================================================


@router.get("/api/manual-assets-gallery")
async def get_manual_assets_gallery():
    """Get all assets from manualassets directory - organized by library and folder"""
    try:
        if not MANUAL_ASSETS_DIR.exists():
            logger.warning(
                f"Manual assets directory does not exist: {MANUAL_ASSETS_DIR}"
            )
            return {"libraries": [], "total_assets": 0}

        libraries = []
        total_assets = 0

        # Iterate through library folders
        for library_dir in MANUAL_ASSETS_DIR.iterdir():
            if not library_dir.is_dir():
                continue

            library_name = library_dir.name
            folders = []

            # Iterate through show/movie folders
            for folder_dir in library_dir.iterdir():
                if not folder_dir.is_dir():
                    continue

                folder_name = folder_dir.name
                assets = []

                # Find all image files in this folder
                for img_file in folder_dir.iterdir():
                    if img_file.is_file() and img_file.suffix.lower() in [
                        ".jpg",
                        ".jpeg",
                        ".png",
                        ".webp",
                    ]:
                        # Skip backup files
                        if img_file.suffix == ".backup" or ".backup" in img_file.name:
                            continue

                        # Determine asset type from filename
                        filename_lower = img_file.name.lower()
                        if (
                            filename_lower == "poster.jpg"
                            or filename_lower == "poster.png"
                        ):
                            asset_type = "poster"
                        elif (
                            filename_lower == "background.jpg"
                            or filename_lower == "background.png"
                        ):
                            asset_type = "background"
                        elif filename_lower.startswith("season") and any(
                            c.isdigit() for c in filename_lower
                        ):
                            asset_type = "season"
                        elif re.match(r"^s\d+e\d+\.", filename_lower):
                            asset_type = "titlecard"
                        else:
                            asset_type = "other"

                        # Build relative path from manual assets dir
                        relative_path = f"{library_name}/{folder_name}/{img_file.name}"

                        assets.append(
                            {
                                "name": img_file.name,
                                "path": relative_path,
                                "type": asset_type,
                                "size": img_file.stat().st_size,
                                "url": f"/manual_poster_assets/{relative_path}",
                            }
                        )
                        total_assets += 1

                if assets:
                    folders.append(
                        {
                            "name": folder_name,
                            "path": f"{library_name}/{folder_name}",
                            "assets": assets,
                            "asset_count": len(assets),
                        }
                    )

            if folders:
                libraries.append(
                    {
                        "name": library_name,
                        "folders": folders,
                        "folder_count": len(folders),
                    }
                )

        logger.info(
            f"Manual assets gallery: {len(libraries)} libraries, {total_assets} total assets"
        )
        return {"libraries": libraries, "total_assets": total_assets}

    except Exception as e:
        logger.error(f"Error getting manual assets gallery: {e}")
        import traceback

        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/manual-assets/{path:path}")
async def delete_manual_asset(path: str):
    """Delete an asset from the manual assets directory"""
    try:
        # Construct the full file path
        file_path = MANUAL_ASSETS_DIR / path

        # Security check: Ensure the path is within MANUAL_ASSETS_DIR
        try:
            file_path = file_path.resolve()
            file_path.relative_to(MANUAL_ASSETS_DIR.resolve())
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid path")

        # Check if file exists
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Asset not found")

        # Check if it's a file (not a directory)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Delete the file
        file_path.unlink()
        logger.info(f"Deleted manual asset: {file_path}")

        return {
            "success": True,
            "message": f"Manual asset '{path}' deleted successfully",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting manual asset {path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/manual-assets/bulk-delete")
async def bulk_delete_manual_assets(request: BulkDeleteRequest):
    """Delete multiple assets from the manual assets directory"""
    try:
        deleted = []
        failed = []

        for path in request.paths:
            try:
                # Construct the full file path
                file_path = MANUAL_ASSETS_DIR / path

                # Security check: Ensure the path is within MANUAL_ASSETS_DIR
                try:
                    file_path = file_path.resolve()
                    file_path.relative_to(MANUAL_ASSETS_DIR.resolve())
                except ValueError:
                    failed.append(
                        {"path": path, "error": "Access denied: Invalid path"}
                    )
                    continue

                # Check if file exists
                if not file_path.exists():
                    failed.append({"path": path, "error": "File not found"})
                    continue

                # Check if it's a file (not a directory)
                if not file_path.is_file():
                    failed.append({"path": path, "error": "Path is not a file"})
                    continue

                # Delete the file
                file_path.unlink()
                deleted.append(path)
                logger.info(f"Deleted manual asset: {file_path}")
            except Exception as e:
                failed.append({"path": path, "error": str(e)})
                logger.error(f"Error deleting manual asset {path}: {e}")

        return {
            "success": True,
            "deleted": deleted,
            "failed": failed,
            "message": f"Successfully deleted {len(deleted)} manual asset(s). {len(failed)} failed.",
        }
    except Exception as e:
        logger.error(f"Error in bulk delete manual assets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/recent-assets")
async def get_recent_assets():
    """
    Get recently created assets from the imagechoices database
    Returns the most recent assets with their poster images from assets folder

    Uses the imagechoices.db database instead of CSV files
    Assets are ordered by ID DESC (newest/highest ID first)
    """
    try:
        # Check if database is available
        if not state or not state.DATABASE_AVAILABLE or not state.db:
            logger.error("Database not available in state")
            return {
                "success": False,
                "error": "Database not available",
                "assets": [],
                "total_count": 0,
            }

        # Get database instance from state
        db_inst = state.db

        # Get all assets from database (already sorted by id DESC - newest first)
        db_records = db_inst.get_all_choices()

        logger.info(f"Found {len(db_records)} total assets in database")

        # If no assets found, return early
        if not db_records:
            logger.warning(" No assets found in database")
            return {
                "success": True,
                "assets": [],
                "total_count": 0,
            }

        # Convert database records to asset format and find poster files
        recent_assets = []
        max_assets = 100  # Limit to 100 most recent assets

        # Helper function to find poster
        def find_poster_in_assets(rootfolder, asset_type, title, download_source):
            """Find poster file in assets directory"""
            try:
                # Try to find the asset file
                for library_folder in ASSETS_DIR.iterdir():
                    if not library_folder.is_dir():
                        continue

                    for show_folder in library_folder.iterdir():
                        if not show_folder.is_dir():
                            continue

                        # Check if folder name matches rootfolder
                        if rootfolder in show_folder.name:
                            # Look for poster file based on asset type
                            if asset_type in ["Show", "Movie", "Poster"]:
                                poster_file = show_folder / "poster.jpg"
                            elif asset_type in ["Show Background", "Movie Background"]:
                                poster_file = show_folder / "background.jpg"
                            elif asset_type == "Season":
                                # Extract season number from title
                                import re

                                season_match = re.search(
                                    r"Season\s*(\d+)", title, re.IGNORECASE
                                )
                                if season_match:
                                    season_num = season_match.group(1).zfill(2)
                                    poster_file = (
                                        show_folder / f"Season{season_num}.jpg"
                                    )
                                else:
                                    continue
                            elif asset_type == "Episode":
                                # Extract episode info from title
                                ep_match = re.search(
                                    r"S(\d+)E(\d+)", title, re.IGNORECASE
                                )
                                if ep_match:
                                    season = ep_match.group(1).zfill(2)
                                    episode = ep_match.group(2).zfill(2)
                                    poster_file = (
                                        show_folder / f"S{season}E{episode}.jpg"
                                    )
                                else:
                                    continue
                            else:
                                poster_file = show_folder / "poster.jpg"

                            if poster_file.exists():
                                # Return relative URL path
                                rel_path = poster_file.relative_to(ASSETS_DIR)
                                return f"/assets/{rel_path.as_posix()}"

                return None
            except Exception as e:
                logger.debug(f"Error finding poster for {rootfolder}: {e}")
                return None

        # Process records until we have 100 valid assets (not just first 100 records)
        for record in db_records:
            # Stop once we have enough valid assets
            if len(recent_assets) >= max_assets:
                break

            # Convert database record (sqlite3.Row) to dict
            asset_dict = dict(record)

            rootfolder = asset_dict.get("Rootfolder", "")
            asset_type = asset_dict.get("Type", "Poster")
            title = asset_dict.get("Title", "")
            download_source = asset_dict.get("DownloadSource", "")

            # Determine if manually created based on Manual field or download_source
            manual_field = asset_dict.get("Manual", "N/A")
            is_manually_created = manual_field in ["Yes", "true", True]

            if not is_manually_created:
                # Fallback check on download_source
                is_manually_created = download_source == "N/A" or (
                    download_source
                    and (
                        download_source.startswith("C:")
                        or download_source.startswith("/")
                        or download_source.startswith("\\")
                    )
                )

            if rootfolder:
                # Check if this is a fallback asset (skip fallback assets in recent view)
                is_fallback = asset_dict.get("Fallback", "").lower() == "true"

                # Skip fallback assets - they should only appear in assets overview
                if is_fallback:
                    logger.debug(
                        f"[SKIP]  Skipping fallback asset in recent view: {title}"
                    )
                    continue

                poster_url = find_poster_in_assets(
                    rootfolder, asset_type, title, download_source
                )
                if poster_url:
                    # Format asset for frontend (match old CSV format)
                    asset = {
                        "title": asset_dict.get("Title", ""),
                        "type": asset_dict.get("Type", ""),
                        "rootfolder": rootfolder,
                        "library": asset_dict.get("LibraryName", ""),
                        "language": asset_dict.get("Language", ""),
                        "fallback": False,  # Always false here since we filter out fallback assets
                        "text_truncated": asset_dict.get("TextTruncated", "").lower()
                        == "true",
                        "download_source": download_source,
                        "provider_link": (
                            asset_dict.get("FavProviderLink", "")
                            if asset_dict.get("FavProviderLink", "") != "N/A"
                            else ""
                        ),
                        "is_manually_created": is_manually_created,
                        "poster_url": poster_url,
                        "has_poster": True,
                        "created_at": asset_dict.get("created_at", ""),
                    }
                    recent_assets.append(asset)
                else:
                    logger.debug(f"[SKIP]  Skipping asset (poster not found): {title}")

        logger.info(
            f"Returning {len(recent_assets)} most recent assets with existing images from database"
        )

        return {
            "success": True,
            "assets": recent_assets,
            "total_count": len(recent_assets),
        }

    except Exception as e:
        logger.error(f"[ERROR] Error getting recent assets from database: {e}")
        import traceback

        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e), "assets": [], "total_count": 0}
