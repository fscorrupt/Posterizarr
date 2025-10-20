"""
Asset caching and scanning service for Posterizarr Backend
Handles asset discovery, caching, and background refresh
"""
import asyncio
import logging
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

from core.config import ASSETS_DIR
from core.cache import cached, get_cache_manager
from core.utils import (
    is_poster_file,
    is_background_file,
    is_season_file,
    is_titlecard_file,
)

logger = logging.getLogger(__name__)


class AssetService:
    """
    Service for managing asset caching and scanning.
    Provides centralized asset discovery with background refresh.

    Features:
    - Scan asset directories (4K, Animation, DC, Disney, Marvel, TV)
    - Categorize files (posters, backgrounds, seasons, titlecards)
    - In-memory caching with TTL
    - Background refresh task
    - Asset statistics
    """

    def __init__(self, assets_dir: Path = ASSETS_DIR):
        self.assets_dir = assets_dir
        self.cache = get_cache_manager()
        self.refresh_task: Optional[asyncio.Task] = None
        self.last_scan_time: Optional[datetime] = None
        self.scan_duration: Optional[float] = None

        # Folders to scan
        self.asset_folders = ["4K", "Animation", "DC", "Disney", "Marvel", "TV"]

    async def scan_and_cache_assets(self, force_refresh: bool = False) -> Dict:
        """
        Scan all asset folders and cache results.
        Returns asset tree structure with file categorization.

        Args:
            force_refresh: If True, ignore cache and force rescan

        Returns:
            {
                "4K": {
                    "Movie Name (Year) {tmdb-123}": {
                        "path": "/path/to/folder",
                        "posters": [...],
                        "backgrounds": [...],
                        "seasons": [...],
                        "titlecards": [...]
                    }
                },
                "TV": {...},
                ...
            }
        """
        cache_key = "asset_tree_full"

        # Check cache first (unless force refresh)
        if not force_refresh:
            cached_data = self.cache.get(cache_key)
            if cached_data:
                logger.info("Returning cached asset tree")
                return cached_data

        logger.info("Starting asset scan (force_refresh=%s)", force_refresh)
        start_time = datetime.now()

        asset_tree = {}

        for folder_name in self.asset_folders:
            folder_path = self.assets_dir / folder_name

            if not folder_path.exists():
                logger.warning(f"Asset folder not found: {folder_name}")
                asset_tree[folder_name] = {}
                continue

            logger.info(f"Scanning folder: {folder_name}")
            asset_tree[folder_name] = await self._scan_folder(folder_path)

        # Update scan metadata
        self.last_scan_time = datetime.now()
        self.scan_duration = (self.last_scan_time - start_time).total_seconds()

        # Cache result for 10 minutes
        self.cache.set(cache_key, asset_tree, ttl=600)

        logger.info(
            f"Asset scan completed in {self.scan_duration:.2f}s, cached for 10 minutes"
        )

        return asset_tree

    async def _scan_folder(self, folder_path: Path) -> Dict:
        """
        Recursively scan a single asset folder.
        Returns nested dictionary structure with asset categorization.
        """
        assets = {}

        try:
            # Iterate through show/movie folders
            for show_folder in folder_path.iterdir():
                if not show_folder.is_dir():
                    continue

                show_name = show_folder.name
                assets[show_name] = {
                    "path": str(show_folder),
                    "posters": [],
                    "backgrounds": [],
                    "seasons": [],
                    "titlecards": [],
                }

                # Scan files in show folder
                for file_path in show_folder.iterdir():
                    if not file_path.is_file():
                        continue

                    filename = file_path.name

                    # Categorize file by type
                    if is_poster_file(filename):
                        assets[show_name]["posters"].append(filename)
                    elif is_background_file(filename):
                        assets[show_name]["backgrounds"].append(filename)
                    elif is_season_file(filename):
                        assets[show_name]["seasons"].append(filename)
                    elif is_titlecard_file(filename):
                        assets[show_name]["titlecards"].append(filename)

        except Exception as e:
            logger.error(f"Error scanning folder {folder_path}: {e}")

        return assets

    async def get_folder_assets(self, library_name: str) -> Dict:
        """
        Get assets for a specific library folder (4K, TV, etc.)

        Args:
            library_name: Folder name (4K, Animation, DC, Disney, Marvel, TV)

        Returns:
            Dictionary of assets in that library
        """
        if library_name not in self.asset_folders:
            logger.warning(f"Unknown library: {library_name}")
            return {}

        # Get full asset tree (from cache if available)
        asset_tree = await self.scan_and_cache_assets()

        return asset_tree.get(library_name, {})

    async def get_show_assets(self, library_name: str, show_name: str) -> Optional[Dict]:
        """
        Get assets for a specific show/movie.

        Args:
            library_name: Folder name (4K, TV, etc.)
            show_name: Show/movie folder name

        Returns:
            Asset dictionary with posters, backgrounds, seasons, titlecards
        """
        folder_assets = await self.get_folder_assets(library_name)
        return folder_assets.get(show_name)

    async def get_recent_assets(self, limit: int = 20) -> List[Dict]:
        """
        Get recently modified assets across all libraries.

        Args:
            limit: Maximum number of assets to return

        Returns:
            List of asset dictionaries with metadata
        """
        recent_assets = []

        try:
            # Scan all asset folders for recent files
            for folder_name in self.asset_folders:
                folder_path = self.assets_dir / folder_name

                if not folder_path.exists():
                    continue

                # Find recent files
                for show_folder in folder_path.iterdir():
                    if not show_folder.is_dir():
                        continue

                    for file_path in show_folder.iterdir():
                        if not file_path.is_file():
                            continue

                        # Get file modification time
                        mtime = file_path.stat().st_mtime
                        recent_assets.append(
                            {
                                "path": str(file_path),
                                "filename": file_path.name,
                                "library": folder_name,
                                "show": show_folder.name,
                                "modified": mtime,
                                "type": self._get_file_type(file_path.name),
                            }
                        )

            # Sort by modification time (newest first)
            recent_assets.sort(key=lambda x: x["modified"], reverse=True)

            # Return top N
            return recent_assets[:limit]

        except Exception as e:
            logger.error(f"Error getting recent assets: {e}")
            return []

    def _get_file_type(self, filename: str) -> str:
        """Determine file type based on filename."""
        if is_poster_file(filename):
            return "poster"
        elif is_background_file(filename):
            return "background"
        elif is_season_file(filename):
            return "season"
        elif is_titlecard_file(filename):
            return "titlecard"
        else:
            return "unknown"

    async def get_asset_stats(self) -> Dict:
        """
        Get statistics about cached assets.

        Returns:
            {
                "total_libraries": 6,
                "total_shows": 1234,
                "total_posters": 5678,
                "total_backgrounds": 1234,
                "total_seasons": 456,
                "total_titlecards": 789,
                "last_scan": "2024-01-15T12:30:45",
                "scan_duration": 2.34,
                "cache_stats": {...}
            }
        """
        asset_tree = await self.scan_and_cache_assets()

        stats = {
            "total_libraries": len(self.asset_folders),
            "total_shows": 0,
            "total_posters": 0,
            "total_backgrounds": 0,
            "total_seasons": 0,
            "total_titlecards": 0,
            "last_scan": (
                self.last_scan_time.isoformat() if self.last_scan_time else None
            ),
            "scan_duration": self.scan_duration,
            "cache_stats": self.cache.get_cache_stats(),
        }

        # Count assets
        for library_name, shows in asset_tree.items():
            stats["total_shows"] += len(shows)

            for show_name, assets in shows.items():
                stats["total_posters"] += len(assets.get("posters", []))
                stats["total_backgrounds"] += len(assets.get("backgrounds", []))
                stats["total_seasons"] += len(assets.get("seasons", []))
                stats["total_titlecards"] += len(assets.get("titlecards", []))

        return stats

    async def start_background_refresh(self, interval: int = 600):
        """
        Start background task to refresh asset cache periodically.

        Args:
            interval: Refresh interval in seconds (default: 10 minutes)
        """
        if self.refresh_task and not self.refresh_task.done():
            logger.warning("Background refresh task already running")
            return

        logger.info(f"Starting background asset refresh (interval: {interval}s)")

        async def refresh_loop():
            while True:
                try:
                    await asyncio.sleep(interval)
                    logger.info("Background asset refresh triggered")
                    await self.scan_and_cache_assets(force_refresh=True)
                except asyncio.CancelledError:
                    logger.info("Background refresh task cancelled")
                    break
                except Exception as e:
                    logger.error(f"Error in background refresh: {e}")

        self.refresh_task = asyncio.create_task(refresh_loop())

    async def stop_background_refresh(self):
        """Stop background refresh task."""
        if self.refresh_task and not self.refresh_task.done():
            logger.info("Stopping background asset refresh")
            self.refresh_task.cancel()
            try:
                await self.refresh_task
            except asyncio.CancelledError:
                pass


# ============================================================================
# SINGLETON INSTANCE
# ============================================================================

_asset_service: Optional[AssetService] = None


def get_asset_service() -> AssetService:
    """
    Get singleton instance of AssetService.
    Use this in FastAPI dependencies.

    Usage:
        @app.get("/api/assets")
        async def get_assets(service: AssetService = Depends(get_asset_service)):
            return await service.scan_and_cache_assets()
    """
    global _asset_service
    if _asset_service is None:
        _asset_service = AssetService()
    return _asset_service
