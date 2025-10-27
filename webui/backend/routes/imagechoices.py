"""
Image Choices Router
============================================================

Image choices database management

Endpoints:
- GET /api/imagechoices
- GET /api/imagechoices/{title}
- POST /api/imagechoices
- PUT /api/imagechoices/{record_id}
- DELETE /api/imagechoices/{record_id}
- GET /api/imagechoices/{record_id}/find-asset
- POST /api/imagechoices/import
"""

from fastapi import APIRouter, HTTPException
from pathlib import Path
import logging
import re

from models.request_models import ImageChoiceRecord

router = APIRouter(tags=["imagechoices"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
state = None
ASSETS_DIR = None
LOGS_DIR = None


def setup_dependencies(dependencies: dict):
    """Initialize imagechoices router dependencies"""
    global state, ASSETS_DIR, LOGS_DIR

    state = dependencies.get("state")
    ASSETS_DIR = dependencies["assets_dir"]
    LOGS_DIR = dependencies["logs_dir"]


@router.get("/api/imagechoices")
async def get_all_imagechoices():
    """Get all image choice records"""
    if not state or not state.DATABASE_AVAILABLE or not state.db:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        records = state.db.get_all_choices()
        # Convert sqlite3.Row to dict
        return [dict(record) for record in records]
    except Exception as e:
        logger.error(f"Error fetching image choices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/imagechoices/{title}")
async def get_imagechoice_by_title(title: str):
    """Get image choice by title"""
    if not state or not state.DATABASE_AVAILABLE or not state.db:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        record = state.db.get_choice_by_title(title)
        if record is None:
            raise HTTPException(status_code=404, detail="Record not found")
        return dict(record)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/imagechoices")
async def create_imagechoice(record: ImageChoiceRecord):
    """Create a new image choice record"""
    if not state or not state.DATABASE_AVAILABLE or not state.db:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        record_id = state.db.insert_choice(
            title=record.Title,
            type_=record.Type,
            rootfolder=record.Rootfolder,
            library_name=record.LibraryName,
            language=record.Language,
            fallback=record.Fallback,
            text_truncated=record.TextTruncated,
            download_source=record.DownloadSource,
            fav_provider_link=record.FavProviderLink,
            manual=record.Manual,
        )
        return {"id": record_id, "message": "Record created successfully"}
    except Exception as e:
        logger.error(f"Error creating image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/api/imagechoices/{record_id}")
async def update_imagechoice(record_id: int, record: ImageChoiceRecord):
    """Update an existing image choice record"""
    if not state or not state.DATABASE_AVAILABLE or not state.db:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Convert record to dict and filter out None values
        update_data = {k: v for k, v in record.dict().items() if v is not None}
        state.db.update_choice(record_id, **update_data)
        return {"message": "Record updated successfully"}
    except Exception as e:
        logger.error(f"Error updating image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/imagechoices/{record_id}")
async def delete_imagechoice(record_id: int):
    """Delete an image choice record"""
    if not state or not state.DATABASE_AVAILABLE or not state.db:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        state.db.delete_choice(record_id)
        return {"message": "Record deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting image choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/imagechoices/{record_id}/find-asset")
async def find_asset_for_imagechoice(record_id: int):
    """
    Find the actual asset file path for a database record.
    Searches the filesystem for the matching asset based on Rootfolder, LibraryName, and Type.
    Returns the asset path in Gallery-compatible format.
    """
    if not state or not state.DATABASE_AVAILABLE or not state.db:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Get the record from DB
        record = state.db.get_choice_by_id(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")

        record_dict = dict(record)
        rootfolder = record_dict.get("Rootfolder")
        library = record_dict.get("LibraryName")
        asset_type = (record_dict.get("Type") or "").lower()
        title = record_dict.get("Title") or ""  # Title contains season/episode info

        if not rootfolder or not library:
            raise HTTPException(
                status_code=400, detail="Record missing Rootfolder or LibraryName"
            )

        # Construct the folder path
        folder_path = ASSETS_DIR / library / rootfolder

        if not folder_path.exists() or not folder_path.is_dir():
            raise HTTPException(
                status_code=404,
                detail=f"Asset folder not found: {library}/{rootfolder}",
            )

        # Determine which file pattern to look for based on type
        if "background" in asset_type:
            pattern = "background.*"
        elif "season" in asset_type:
            # For seasons, extract the season number from the Title field
            # Title format: "Show Name | Season04" or "Show Name | Season05"
            season_match = re.search(r"season\s*(\d+)", title, re.IGNORECASE)
            if season_match:
                season_num = season_match.group(1).zfill(2)  # Ensure 2 digits
                pattern = f"Season{season_num}.*"
                logger.info(f"Season pattern extracted from title '{title}': {pattern}")
            else:
                # Fallback to generic pattern
                pattern = "Season*.*"
                logger.warning(
                    f"Could not extract season number from title '{title}', using generic pattern"
                )
        elif "titlecard" in asset_type or "episode" in asset_type:
            # For titlecards, extract episode code from Title
            # Title format: "S04E01 | Episode Title"
            episode_match = re.search(r"(S\d+E\d+)", title, re.IGNORECASE)
            if episode_match:
                episode_code = episode_match.group(1).upper()
                pattern = f"{episode_code}.*"
                logger.info(
                    f"Episode pattern extracted from title '{title}': {pattern}"
                )
            else:
                pattern = "S[0-9][0-9]E[0-9][0-9].*"
                logger.warning(
                    f"Could not extract episode code from title '{title}', using generic pattern"
                )
        else:
            pattern = "poster.*"

        # Find matching files
        matching_files = list(folder_path.glob(pattern))

        if not matching_files:
            logger.error(
                f"No matching asset found in {library}/{rootfolder} with pattern '{pattern}'"
            )
            raise HTTPException(
                status_code=404,
                detail=f"No matching asset found in {library}/{rootfolder} with pattern {pattern}",
            )

        # Return the first match (in Gallery-compatible format)
        asset_file = matching_files[0]
        logger.info(
            f"Found asset file for record {record_id}: {asset_file.name} (pattern: {pattern}, from title: '{title}')"
        )
        relative_path = asset_file.relative_to(ASSETS_DIR)
        path_str = str(relative_path).replace("\\", "/")

        return {
            "success": True,
            "asset": {
                "name": asset_file.name,
                "path": path_str,
                "url": f"/poster_assets/{path_str}",
                "type": asset_type,
                "library": library,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding asset for record {record_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/imagechoices/import")
async def import_imagechoices_csv():
    """Manually trigger import of ImageChoices.csv to database"""
    if not state or not state.DATABASE_AVAILABLE or not state.db:
        raise HTTPException(status_code=503, detail="Database not available")

    csv_path = LOGS_DIR / "ImageChoices.csv"
    if not csv_path.exists():
        raise HTTPException(
            status_code=404, detail="ImageChoices.csv not found in Logs directory"
        )

    try:
        stats = state.db.import_from_csv(csv_path)
        return {
            "message": "CSV import completed",
            "stats": {
                "added": stats["added"],
                "skipped": stats["skipped"],
                "errors": stats["errors"],
                "error_details": stats["error_details"] if stats["errors"] > 0 else [],
            },
        }
    except Exception as e:
        logger.error(f"Error importing CSV: {e}")
        raise HTTPException(status_code=500, detail=str(e))
