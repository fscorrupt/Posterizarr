"""
System information router for Posterizarr Backend
Handles version checks, releases, cache management, system info
"""
import logging
import sys
import platform
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException
import httpx

from core.config import BASE_DIR, LOGS_DIR, ASSETS_DIR, CONFIG_PATH
from core.cache import get_cache_manager
from core.utils import parse_version, is_version_newer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["system"])


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def fetch_version(local_filename: str, github_url: str, version_type: str):
    """
    Fetch version from local file and compare with GitHub.
    Returns version info with update availability.
    """
    try:
        local_path = BASE_DIR / local_filename
        local_version = None
        
        # Read local version
        if local_path.exists():
            with open(local_path, "r", encoding="utf-8") as f:
                local_version = f.read().strip()
        
        # Fetch remote version
        async with httpx.AsyncClient() as client:
            response = await client.get(github_url, timeout=10.0)
            response.raise_for_status()
            remote_version = response.text.strip()
        
        # Compare versions
        update_available = False
        if local_version and remote_version:
            update_available = is_version_newer(local_version, remote_version)
        
        return {
            "success": True,
            "type": version_type,
            "local_version": local_version,
            "remote_version": remote_version,
            "update_available": update_available,
        }
        
    except httpx.RequestError as e:
        logger.error(f"Error fetching {version_type} version from GitHub: {e}")
        return {
            "success": False,
            "type": version_type,
            "local_version": local_version,
            "remote_version": None,
            "update_available": False,
            "error": str(e),
        }
    except Exception as e:
        logger.error(f"Error checking {version_type} version: {e}")
        return {
            "success": False,
            "type": version_type,
            "error": str(e),
        }


async def get_script_version():
    """
    Get Posterizarr.ps1 version by parsing the script file.
    Compares with GitHub Release.txt.
    """
    try:
        script_path = BASE_DIR / "Posterizarr.ps1"
        
        if not script_path.exists():
            return {
                "success": False,
                "message": "Posterizarr.ps1 not found",
                "version": None,
            }
        
        # Parse script version from first 50 lines
        version = None
        with open(script_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i > 50:  # Only check first 50 lines
                    break
                if "$ScriptVersion" in line or "$Version" in line:
                    # Extract version from line like: $ScriptVersion = "1.9.97"
                    if "=" in line:
                        version_part = line.split("=")[1].strip().strip('"').strip("'")
                        version = version_part
                        break
        
        if not version:
            return {
                "success": False,
                "message": "Could not parse version from Posterizarr.ps1",
                "version": None,
            }
        
        # Fetch remote version
        return await fetch_version(
            local_filename="Release.txt",
            github_url="https://raw.githubusercontent.com/fscorrupt/Posterizarr/refs/heads/main/Release.txt",
            version_type="Script"
        )
        
    except Exception as e:
        logger.error(f"Error getting script version: {e}")
        return {
            "success": False,
            "message": str(e),
            "version": None,
        }


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/version")
async def get_version():
    """
    Get script version from Posterizarr.ps1 and compare with GitHub.
    Returns local version, remote version, and update availability.
    """
    return await get_script_version()


@router.get("/version-ui")
async def get_version_ui():
    """
    Get UI version from ReleaseUI.txt and compare with GitHub.
    Returns local version, remote version, and update availability.
    """
    return await fetch_version(
        local_filename="ReleaseUI.txt",
        github_url="https://raw.githubusercontent.com/fscorrupt/Posterizarr/refs/heads/main/ReleaseUI.txt",
        version_type="UI"
    )


@router.get("/releases")
async def get_github_releases():
    """
    Fetch all releases from GitHub API.
    Returns last 10 releases with changelog, dates, and metadata.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/repos/fscorrupt/Posterizarr/releases",
                headers={"Accept": "application/vnd.github.v3+json"},
                timeout=10.0,
            )
            response.raise_for_status()
            releases = response.json()
        
        # Format releases for frontend
        formatted_releases = []
        for release in releases[:10]:  # Only last 10 releases
            published_date = datetime.fromisoformat(
                release["published_at"].replace("Z", "+00:00")
            )
            days_ago = (datetime.now(published_date.tzinfo) - published_date).days
            
            formatted_releases.append({
                "version": release["tag_name"],
                "name": release["name"],
                "published_at": release["published_at"],
                "days_ago": days_ago,
                "is_prerelease": release["prerelease"],
                "is_draft": release["draft"],
                "html_url": release["html_url"],
                "body": release["body"],  # Changelog
            })
        
        return {"success": True, "releases": formatted_releases}
        
    except httpx.RequestError as e:
        logger.error(f"Could not fetch releases from GitHub: {e}")
        return {
            "success": False,
            "error": "Could not fetch releases from GitHub",
            "releases": [],
        }
    except Exception as e:
        logger.error(f"Error fetching releases: {e}")
        return {"success": False, "error": str(e), "releases": []}


@router.get("/info")
async def get_system_info():
    """
    Get system information: OS, Python version, platform, paths.
    Useful for troubleshooting and diagnostics.
    """
    try:
        return {
            "success": True,
            "system": {
                "os": platform.system(),
                "os_version": platform.version(),
                "platform": platform.platform(),
                "architecture": platform.machine(),
                "python_version": sys.version,
                "python_executable": sys.executable,
            },
            "paths": {
                "base_dir": str(BASE_DIR),
                "config_path": str(CONFIG_PATH),
                "logs_dir": str(LOGS_DIR),
                "assets_dir": str(ASSETS_DIR),
            },
            "environment": {
                "is_docker": (BASE_DIR / ".dockerenv").exists(),
                "script_exists": (BASE_DIR / "Posterizarr.ps1").exists(),
                "config_exists": CONFIG_PATH.exists(),
            },
        }
    except Exception as e:
        logger.error(f"Error getting system info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/refresh")
async def refresh_cache():
    """
    Manually refresh the asset cache.
    Triggers background scan of all asset directories.
    """
    try:
        from services import get_asset_service
        service = get_asset_service()
        
        # Trigger cache refresh
        await service.scan_and_cache_assets(force_refresh=True)
        
        stats = await service.get_asset_stats()
        
        return {
            "success": True,
            "message": "Cache refreshed successfully",
            "stats": {
                "total_shows": stats["total_shows"],
                "total_posters": stats["total_posters"],
                "total_backgrounds": stats["total_backgrounds"],
                "total_seasons": stats["total_seasons"],
                "total_titlecards": stats["total_titlecards"],
            },
        }
    except Exception as e:
        logger.error(f"Error refreshing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache/status")
async def get_cache_status():
    """
    Get detailed cache status.
    Returns cache stats, TTL info, and background refresh status.
    """
    try:
        cache_manager = get_cache_manager()
        cache_stats = cache_manager.get_cache_stats()
        
        from services import get_asset_service
        service = get_asset_service()
        asset_stats = await service.get_asset_stats()
        
        return {
            "success": True,
            "cache": {
                "total_keys": cache_stats["total_keys"],
                "hits": cache_stats["hits"],
                "misses": cache_stats["misses"],
                "hit_rate": cache_stats["hit_rate"],
            },
            "assets": {
                "last_scan": asset_stats.get("last_scan"),
                "scan_duration": asset_stats.get("scan_duration"),
                "total_shows": asset_stats["total_shows"],
                "total_assets": (
                    asset_stats["total_posters"]
                    + asset_stats["total_backgrounds"]
                    + asset_stats["total_seasons"]
                    + asset_stats["total_titlecards"]
                ),
            },
            "background_refresh": {
                "running": service.refresh_task is not None and not service.refresh_task.done(),
            },
        }
    except Exception as e:
        logger.error(f"Error getting cache status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
async def clear_cache():
    """
    Clear all cache entries.
    Forces next requests to reload data from disk/database.
    """
    try:
        cache_manager = get_cache_manager()
        cache_manager.clear_all()
        
        logger.info("Cache cleared manually")
        
        return {
            "success": True,
            "message": "Cache cleared successfully",
        }
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cache/{pattern}")
async def invalidate_cache_pattern(pattern: str):
    """
    Invalidate cache entries matching a pattern.
    Uses wildcard matching (e.g., "config_*" to clear all config cache).
    
    Args:
        pattern: Glob pattern to match cache keys (e.g., "asset_*", "config_*")
    """
    try:
        cache_manager = get_cache_manager()
        removed = cache_manager.invalidate_pattern(pattern)
        
        logger.info(f"Invalidated {removed} cache entries matching pattern: {pattern}")
        
        return {
            "success": True,
            "message": f"Invalidated {removed} cache entries",
            "pattern": pattern,
            "removed": removed,
        }
    except Exception as e:
        logger.error(f"Error invalidating cache pattern: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """
    Health check endpoint.
    Returns 200 OK if backend is running properly.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "Posterizarr Backend",
    }
