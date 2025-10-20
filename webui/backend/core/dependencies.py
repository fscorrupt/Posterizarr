"""
FastAPI dependency injection functions for Posterizarr Backend
Includes: database connections, logging helpers, cache access
"""
import sqlite3
import logging
from pathlib import Path
from typing import Generator
from fastapi import Depends, HTTPException, status

from core.config import CONFIG_PATH, ASSETS_DIR
from core.cache import get_cache_manager

logger = logging.getLogger(__name__)


# ============================================================================
# DATABASE DEPENDENCIES
# ============================================================================

def get_config_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Dependency to get config database connection.
    Automatically commits and closes connection after request.

    Usage:
        @app.get("/api/config")
        async def get_config(db: sqlite3.Connection = Depends(get_config_db)):
            cursor = db.cursor()
            cursor.execute("SELECT * FROM config")
            return cursor.fetchall()
    """
    db_path = CONFIG_PATH / "posterizarr.db"

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row  # Enable dict-like access
        yield conn
        conn.commit()
    except sqlite3.Error as e:
        logger.error(f"Database error in config DB: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )
    finally:
        conn.close()


def get_runtime_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Dependency to get runtime database connection.
    Used for runtime statistics and history tracking.

    Usage:
        @app.get("/api/runtime")
        async def get_runtime(db: sqlite3.Connection = Depends(get_runtime_db)):
            cursor = db.cursor()
            cursor.execute("SELECT * FROM runtime_stats")
            return cursor.fetchall()
    """
    db_path = Path("database") / "runtime_posterizarr.db"

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        yield conn
        conn.commit()
    except sqlite3.Error as e:
        logger.error(f"Database error in runtime DB: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )
    finally:
        conn.close()


def get_imagechoices_db() -> Generator[sqlite3.Connection, None, None]:
    """
    Dependency to get imagechoices database connection.
    Used for tracking asset creation history.

    Usage:
        @app.get("/api/imagechoices")
        async def get_choices(db: sqlite3.Connection = Depends(get_imagechoices_db)):
            cursor = db.cursor()
            cursor.execute("SELECT * FROM asset_history")
            return cursor.fetchall()
    """
    db_path = Path("database") / "imagechoices.db"

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        yield conn
        conn.commit()
    except sqlite3.Error as e:
        logger.error(f"Database error in imagechoices DB: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )
    finally:
        conn.close()


# ============================================================================
# CACHE DEPENDENCY
# ============================================================================

def get_cache():
    """
    Dependency to get cache manager instance.
    Provides access to caching functionality across endpoints.

    Usage:
        @app.get("/api/data")
        async def get_data(cache = Depends(get_cache)):
            data = cache.get("my_key")
            if not data:
                data = expensive_operation()
                cache.set("my_key", data, ttl=300)
            return data
    """
    return get_cache_manager()


# ============================================================================
# LOGGING DEPENDENCY
# ============================================================================

def get_logger(name: str = __name__):
    """
    Dependency factory to get a logger for specific module.

    Usage:
        @app.get("/api/endpoint")
        async def my_endpoint(logger = Depends(lambda: get_logger(__name__))):
            logger.info("Request received")
            return {"status": "ok"}
    """
    return logging.getLogger(name)


# ============================================================================
# PATH VALIDATION DEPENDENCIES
# ============================================================================

def validate_overlay_path(filename: str) -> Path:
    """
    Dependency to validate overlay file paths.
    Prevents directory traversal attacks.

    Usage:
        @app.get("/api/overlayfiles/{filename}")
        async def get_overlay(path: Path = Depends(validate_overlay_path)):
            return FileResponse(path)
    """
    overlay_dir = Path("Overlayfiles")

    # Prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename: directory traversal not allowed",
        )

    file_path = overlay_dir / filename

    # Check if file exists
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Overlay file not found: {filename}",
        )

    # Ensure file is within overlay directory (double-check)
    try:
        file_path.resolve().relative_to(overlay_dir.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path: must be within overlay directory",
        )

    return file_path


def validate_font_path(filename: str) -> Path:
    """
    Dependency to validate font file paths.
    Prevents directory traversal attacks.

    Usage:
        @app.get("/api/fonts/{filename}")
        async def get_font(path: Path = Depends(validate_font_path)):
            return FileResponse(path)
    """
    fonts_dir = Path("fonts")

    # Prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename: directory traversal not allowed",
        )

    file_path = fonts_dir / filename

    # Check if file exists
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Font file not found: {filename}"
        )

    # Ensure file is within fonts directory
    try:
        file_path.resolve().relative_to(fonts_dir.resolve())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path: must be within fonts directory",
        )

    return file_path


# ============================================================================
# PERMISSION CHECK DEPENDENCIES
# ============================================================================

def check_write_permissions() -> bool:
    """
    Dependency to check if application has write permissions.
    Useful for upload endpoints to fail fast if directories are read-only.

    Usage:
        @app.post("/api/upload")
        async def upload(has_write: bool = Depends(check_write_permissions)):
            if not has_write:
                raise HTTPException(403, "No write permissions")
            # ... proceed with upload
    """
    from core.utils import check_directory_permissions
    from core.config import IS_DOCKER

    # Check overlay directory
    overlay_check = check_directory_permissions(
        Path("Overlayfiles"), "Overlayfiles", IS_DOCKER
    )

    if not overlay_check["writable"]:
        logger.warning(f"Overlay directory not writable: {overlay_check['error']}")
        return False

    return True
