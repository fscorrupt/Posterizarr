"""
Asset gallery router for Posterizarr Backend  
Handles asset browsing, folder view, recent assets, test gallery
"""
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

from core.config import ASSETS_DIR, BASE_DIR
from core.cache import cached
from core.utils import is_poster_file, is_background_file, is_season_file, is_titlecard_file
from services import get_asset_service, AssetService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["gallery"])


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def find_poster_in_assets(rootfolder: str, asset_type: str, title: str, download_source: str) -> Optional[str]:
    """
    Find poster image URL for an asset entry.
    Searches in assets directory based on rootfolder and type.
    
    Returns URL path or None if not found.
    """
    try:
        # Parse rootfolder to get library and folder name
        # Format: "/path/to/assets/4K/Movie Name (Year) {tmdb-123}"
        parts = Path(rootfolder).parts
        
        if len(parts) < 2:
            return None
        
        # Get library (4K, TV, etc.) and folder name
        library = parts[-2]
        folder_name = parts[-1]
        
        folder_path = ASSETS_DIR / library / folder_name
        
        if not folder_path.exists():
            return None
        
        # Determine which file to look for based on asset_type
        if asset_type == "Poster":
            # Look for poster.jpg or {folder_name}.jpg
            candidates = ["poster.jpg", f"{folder_name}.jpg"]
        elif asset_type == "Background":
            candidates = ["background.jpg", f"{folder_name}_background.jpg"]
        elif asset_type.startswith("Season"):
            # Extract season number (e.g., "Season01" -> "01")
            season_num = asset_type.replace("Season", "")
            candidates = [f"Season{season_num}.jpg", f"{folder_name}_Season{season_num}.jpg"]
        elif asset_type.startswith("TitleCard"):
            # Extract episode identifier (e.g., "TitleCard - S01E01" -> "S01E01")
            ep_id = asset_type.replace("TitleCard - ", "")
            candidates = [f"{ep_id}.jpg", f"{folder_name}_{ep_id}.jpg"]
        else:
            return None
        
        # Try to find file
        for candidate in candidates:
            file_path = folder_path / candidate
            if file_path.exists():
                # Build URL path
                relative_path = file_path.relative_to(ASSETS_DIR)
                url_path = str(relative_path).replace("\\", "/")
                return f"/poster_assets/{url_path}"
        
        return None
        
    except Exception as e:
        logger.error(f"Error finding poster for {title}: {e}")
        return None


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/folder-view/{library}")
@cached(ttl=300)  # Cache for 5 minutes
async def get_folder_view(library: str, service: AssetService = Depends(get_asset_service)):
    """
    Get folder view for a specific library (4K, Animation, DC, Disney, Marvel, TV).
    Returns list of shows/movies with asset counts.
    """
    try:
        folder_assets = await service.get_folder_assets(library)
        
        # Transform to folder view format
        folders = []
        for show_name, assets in folder_assets.items():
            total_files = (
                len(assets["posters"])
                + len(assets["backgrounds"])
                + len(assets["seasons"])
                + len(assets["titlecards"])
            )
            
            folders.append({
                "name": show_name,
                "path": assets["path"],
                "posters": len(assets["posters"]),
                "backgrounds": len(assets["backgrounds"]),
                "seasons": len(assets["seasons"]),
                "titlecards": len(assets["titlecards"]),
                "total_files": total_files,
            })
        
        # Sort by name
        folders.sort(key=lambda x: x["name"])
        
        return {"success": True, "library": library, "folders": folders, "count": len(folders)}
        
    except Exception as e:
        logger.error(f"Error getting folder view for {library}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/folder-view/assets/{item_path:path}")
@cached(ttl=300)
async def get_folder_view_assets(item_path: str):
    """
    Get all assets for a specific show/movie in folder view.
    
    Args:
        item_path: Path like "4K/Movie Name (Year) {tmdb-123}"
    
    Returns list of image files with URLs.
    """
    try:
        if not ASSETS_DIR.exists():
            return {"success": True, "assets": []}
        
        item_full_path = ASSETS_DIR / item_path
        if not item_full_path.exists() or not item_full_path.is_dir():
            raise HTTPException(status_code=404, detail="Folder not found")
        
        assets = []
        image_extensions = {".jpg", ".jpeg", ".png", ".webp"}
        
        for image_path in item_full_path.iterdir():
            if image_path.is_file() and image_path.suffix.lower() in image_extensions:
                relative_path = image_path.relative_to(ASSETS_DIR)
                url_path = str(relative_path).replace("\\", "/")
                
                # Determine asset type
                asset_type = "unknown"
                if is_poster_file(image_path.name):
                    asset_type = "poster"
                elif is_background_file(image_path.name):
                    asset_type = "background"
                elif is_season_file(image_path.name):
                    asset_type = "season"
                elif is_titlecard_file(image_path.name):
                    asset_type = "titlecard"
                
                assets.append({
                    "name": image_path.name,
                    "path": str(relative_path).replace("\\", "/"),
                    "url": f"/poster_assets/{url_path}",
                    "size": image_path.stat().st_size,
                    "type": asset_type,
                })
        
        # Sort by name
        assets.sort(key=lambda x: x["name"])
        
        return {"success": True, "assets": assets, "count": len(assets)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting folder assets for {item_path}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recent-assets")
@cached(ttl=60)  # Cache for 1 minute
async def get_recent_assets(limit: int = 20):
    """
    Get recently created assets from imagechoices database.
    Returns newest assets with poster images.
    
    Args:
        limit: Number of assets to return (default: 20, max: 100)
    """
    try:
        # Import database helper
        try:
            from imagechoices_db import ImageChoicesDatabase
            db = ImageChoicesDatabase()
        except ImportError:
            logger.warning("imagechoices_db not available, returning empty list")
            return {"success": False, "message": "Database not available", "assets": []}
        
        # Limit to reasonable range
        limit = min(max(1, limit), 100)
        
        # Get all assets from database (sorted by ID desc - newest first)
        db_records = db.get_all_choices()
        
        if not db_records:
            return {"success": True, "assets": [], "total_count": 0}
        
        # Convert database records to asset format
        recent_assets = []
        
        for record in db_records[:limit]:
            asset_dict = dict(record)
            
            rootfolder = asset_dict.get("Rootfolder", "")
            asset_type = asset_dict.get("Type", "Poster")
            title = asset_dict.get("Title", "")
            download_source = asset_dict.get("Download Source", "")
            
            # Skip fallback assets
            is_fallback = asset_dict.get("Fallback", "").lower() == "true"
            if is_fallback:
                continue
            
            # Determine if manually created
            manual_field = asset_dict.get("Manual", "N/A")
            is_manually_created = manual_field in ["Yes", "true", True]
            
            if not is_manually_created:
                is_manually_created = download_source == "N/A" or (
                    download_source and (
                        download_source.startswith("C:") or 
                        download_source.startswith("/") or 
                        download_source.startswith("\\")
                    )
                )
            
            # Find poster image
            poster_url = find_poster_in_assets(rootfolder, asset_type, title, download_source)
            
            if poster_url:
                asset = {
                    "title": title,
                    "type": asset_type,
                    "rootfolder": rootfolder,
                    "library": asset_dict.get("LibraryName", ""),
                    "language": asset_dict.get("Language", ""),
                    "fallback": False,
                    "text_truncated": asset_dict.get("TextTruncated", "").lower() == "true",
                    "download_source": download_source,
                    "provider_link": asset_dict.get("Fav Provider Link", "") if asset_dict.get("Fav Provider Link", "") != "N/A" else "",
                    "is_manually_created": is_manually_created,
                    "poster_url": poster_url,
                    "has_poster": True,
                    "created_at": asset_dict.get("created_at", ""),
                }
                recent_assets.append(asset)
        
        return {
            "success": True,
            "assets": recent_assets,
            "total_count": len(recent_assets),
        }
        
    except Exception as e:
        logger.error(f"Error getting recent assets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-gallery")
@cached(ttl=300)
async def get_test_gallery():
    """
    Get poster gallery from test directory.
    Used for testing and manual mode uploads.
    """
    test_dir = BASE_DIR / "test"
    
    if not test_dir.exists():
        return {"success": True, "images": []}
    
    images = []
    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    
    try:
        for image_path in test_dir.rglob("*"):
            if image_path.is_file() and image_path.suffix.lower() in image_extensions:
                try:
                    relative_path = image_path.relative_to(test_dir)
                    url_path = str(relative_path).replace("\\", "/")
                    
                    images.append({
                        "path": str(relative_path),
                        "name": image_path.name,
                        "size": image_path.stat().st_size,
                        "url": f"/test/{url_path}",
                    })
                except Exception as e:
                    logger.error(f"Error processing test image {image_path}: {e}")
        
        # Sort by name and limit
        images.sort(key=lambda x: x["name"])
        
        return {"success": True, "images": images[:200], "count": len(images[:200])}
        
    except Exception as e:
        logger.error(f"Error scanning test gallery: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/assets/stats")
@cached(ttl=300)
async def get_assets_stats(service: AssetService = Depends(get_asset_service)):
    """
    Get statistics about all assets.
    Returns counts by type, total size, and top folders.
    """
    try:
        stats = await service.get_asset_stats()
        
        return {"success": True, "stats": stats}
        
    except Exception as e:
        logger.error(f"Error getting asset stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
