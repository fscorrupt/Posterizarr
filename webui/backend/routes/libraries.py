"""
Libraries Router
============================================================

Media library endpoints

Endpunkte:
- POST /api/libraries/plex
- POST /api/libraries/jellyfin
- POST /api/libraries/emby
- POST /api/libraries/plex/items
"""

from fastapi import APIRouter
import logging
import httpx
import xml.etree.ElementTree as ET

from models.request_models import (
    PlexValidationRequest,
    JellyfinValidationRequest,
    EmbyValidationRequest,
    LibraryItemsRequest,
)

router = APIRouter(prefix="/api/libraries", tags=["libraries"])
logger = logging.getLogger(__name__)


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post("/plex")
async def get_plex_libraries(request: PlexValidationRequest):
    """Fetch Plex libraries"""
    logger.info("Fetching Plex libraries...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/library/sections/?X-Plex-Token={request.token}"
            response = await client.get(url)

            if response.status_code == 200:
                root = ET.fromstring(response.content)
                libraries = []

                for directory in root.findall(".//Directory"):
                    lib_title = directory.get("title", "")
                    lib_type = directory.get("type", "")
                    lib_key = directory.get("key", "")

                    # Include all library types (movie, show, music, photo, etc.)
                    libraries.append(
                        {"name": lib_title, "type": lib_type, "key": lib_key}
                    )

                logger.info(f"Found {len(libraries)} Plex libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(f"Failed to fetch Plex libraries: {response.status_code}")
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"Error fetching Plex libraries: {str(e)}")
        return {"success": False, "error": str(e)}


@router.post("/jellyfin")
async def get_jellyfin_libraries(request: JellyfinValidationRequest):
    """Fetch Jellyfin libraries"""
    logger.info("Fetching Jellyfin libraries...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"X-Emby-Token": request.api_key}
            url = f"{request.url}/Library/VirtualFolders"
            response = await client.get(url, headers=headers)

            if response.status_code == 200:
                data = response.json()
                libraries = []

                for lib in data:
                    lib_name = lib.get("Name", "")
                    lib_type = lib.get("CollectionType", "mixed")

                    # Only include movies and tvshows
                    if lib_type in ["movies", "tvshows", "mixed"]:
                        libraries.append(
                            {
                                "name": lib_name,
                                "type": lib_type,
                                "id": lib.get("ItemId", ""),
                            }
                        )

                logger.info(f"Found {len(libraries)} Jellyfin libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(
                    f"Failed to fetch Jellyfin libraries: {response.status_code}"
                )
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"Error fetching Jellyfin libraries: {str(e)}")
        return {"success": False, "error": str(e)}


@router.post("/emby")
async def get_emby_libraries(request: EmbyValidationRequest):
    """Fetch Emby libraries"""
    logger.info("Fetching Emby libraries...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/Library/VirtualFolders?api_key={request.api_key}"
            response = await client.get(url)

            if response.status_code == 200:
                data = response.json()
                libraries = []

                for lib in data:
                    lib_name = lib.get("Name", "")
                    lib_type = lib.get("CollectionType", "mixed")

                    # Only include movies and tvshows
                    if lib_type in ["movies", "tvshows", "mixed"]:
                        libraries.append(
                            {
                                "name": lib_name,
                                "type": lib_type,
                                "id": lib.get("ItemId", ""),
                            }
                        )

                logger.info(f"Found {len(libraries)} Emby libraries")
                return {"success": True, "libraries": libraries}
            else:
                logger.error(f"Failed to fetch Emby libraries: {response.status_code}")
                return {
                    "success": False,
                    "error": f"Failed to fetch libraries (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"Error fetching Emby libraries: {str(e)}")
        return {"success": False, "error": str(e)}


@router.post("/plex/items")
async def get_plex_library_items(request: LibraryItemsRequest):
    """Fetch items from a specific Plex library"""
    logger.info(f"Fetching items from Plex library key: {request.library_key}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"{request.url}/library/sections/{request.library_key}/all?X-Plex-Token={request.token}"
            response = await client.get(url)

            if response.status_code == 200:
                root = ET.fromstring(response.content)
                items = []

                # Parse both Video (movies) and Directory (shows) elements
                for item in root.findall(".//*[@title]"):
                    title = item.get("title", "")
                    year = item.get("year", "")
                    item_type = item.get("type", "")
                    rating_key = item.get("ratingKey", "")

                    # Get the folder path if available
                    folder_name = title
                    if year:
                        folder_name = f"{title} ({year})"

                    # Try to get TMDB ID from GUID
                    tmdb_id = ""
                    for guid in item.findall(".//Guid"):
                        guid_id = guid.get("id", "")
                        if "tmdb://" in guid_id:
                            tmdb_id = guid_id.replace("tmdb://", "")
                            folder_name = f"{title} ({year}) {{tmdb-{tmdb_id}}}"
                            break

                    items.append(
                        {
                            "title": title,
                            "year": year,
                            "folderName": folder_name,
                            "type": item_type,
                            "ratingKey": rating_key,
                        }
                    )

                logger.info(f"Found {len(items)} items in library")
                return {"success": True, "items": items}
            else:
                logger.error(f"Failed to fetch library items: {response.status_code}")
                return {
                    "success": False,
                    "error": f"Failed to fetch items (Status: {response.status_code})",
                }
    except Exception as e:
        logger.error(f"Error fetching Plex library items: {str(e)}")
        logger.exception("Full traceback:")
        return {"success": False, "error": str(e)}
