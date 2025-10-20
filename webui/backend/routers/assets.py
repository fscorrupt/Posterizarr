"""
Assets Router - Handles overlay files and fonts
Includes: upload, delete, preview for overlays and fonts
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pathlib import Path
import logging
from typing import Optional

from ..core import cache, cached, invalidate_cache_pattern

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["assets"])

# These will be injected from main.py
OVERLAYFILES_DIR: Optional[Path] = None
FONTPREVIEWS_DIR: Optional[Path] = None


def init_assets_router(overlayfiles_dir: Path, fontpreviews_dir: Path):
    """Initialize router with dependencies"""
    global OVERLAYFILES_DIR, FONTPREVIEWS_DIR
    OVERLAYFILES_DIR = overlayfiles_dir
    FONTPREVIEWS_DIR = fontpreviews_dir


# ============================================================================
# OVERLAY FILES ENDPOINTS
# ============================================================================


@router.get("/overlayfiles")
@cached(ttl=300, key_func=lambda: "overlayfiles_list")
async def get_overlay_files():
    """Get list of overlay files from Overlayfiles directory"""
    try:
        if not OVERLAYFILES_DIR.exists():
            OVERLAYFILES_DIR.mkdir(exist_ok=True)
            return {"success": True, "files": []}

        # Get all image and font files
        allowed_extensions = {
            ".png",
            ".jpg",
            ".jpeg",
            ".ttf",
            ".otf",
            ".woff",
            ".woff2",
        }
        files = []

        for f in OVERLAYFILES_DIR.iterdir():
            if f.is_file() and f.suffix.lower() in allowed_extensions:
                file_info = {
                    "name": f.name,
                    "type": (
                        "image"
                        if f.suffix.lower() in {".png", ".jpg", ".jpeg"}
                        else "font"
                    ),
                    "extension": f.suffix.lower(),
                    "size": f.stat().st_size,
                }
                files.append(file_info)

        files.sort(key=lambda x: x["name"])

        logger.info(f"Found {len(files)} overlay files")
        return {"success": True, "files": files}

    except Exception as e:
        logger.error(f"Error getting overlay files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/overlayfiles/upload")
async def upload_overlay_file(file: UploadFile = File(...)):
    """Upload a new overlay file to Overlayfiles directory"""
    try:
        # Ensure directory exists with permission check
        try:
            OVERLAYFILES_DIR.mkdir(parents=True, exist_ok=True)
            test_file = OVERLAYFILES_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError:
            logger.error(
                f"No write permission for Overlayfiles directory: {OVERLAYFILES_DIR}"
            )
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for Overlayfiles directory. Check Docker/NAS/Unraid volume permissions.",
            )

        # Validate file type
        allowed_extensions = {
            ".png",
            ".jpg",
            ".jpeg",
            ".ttf",
            ".otf",
            ".woff",
            ".woff2",
        }
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Only PNG, JPG, JPEG, TTF, OTF, WOFF, and WOFF2 files are allowed.",
            )

        # Sanitize filename
        safe_filename = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if file_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"File '{safe_filename}' already exists. Please rename or delete the existing file first.",
            )

        # Write file
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        with open(file_path, "wb") as f:
            f.write(content)

        if not file_path.exists() or file_path.stat().st_size == 0:
            raise HTTPException(
                status_code=500, detail="File was not saved successfully"
            )

        # Invalidate cache
        invalidate_cache_pattern("overlayfiles")

        logger.info(f"Uploaded overlay file: {safe_filename} ({len(content)} bytes)")

        return {
            "success": True,
            "message": f"File '{safe_filename}' uploaded successfully",
            "filename": safe_filename,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading overlay file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/overlayfiles/{filename}")
async def delete_overlay_file(filename: str):
    """Delete an overlay file from Overlayfiles directory"""
    try:
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        file_path.unlink()

        # Invalidate cache
        invalidate_cache_pattern("overlayfiles")

        logger.info(f"Deleted overlay file: {safe_filename}")

        return {
            "success": True,
            "message": f"File '{safe_filename}' deleted successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting overlay file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overlayfiles/preview/{filename}")
async def preview_overlay_file(filename: str):
    """Serve overlay file for preview"""
    try:
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            file_path,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving overlay file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FONT FILES ENDPOINTS
# ============================================================================


@router.get("/fonts")
@cached(ttl=600, key_func=lambda: "fonts_list")
async def get_font_files():
    """Get list of font files from Overlayfiles directory"""
    try:
        if not OVERLAYFILES_DIR.exists():
            OVERLAYFILES_DIR.mkdir(exist_ok=True)
            return {"success": True, "files": []}

        font_extensions = {".ttf", ".otf", ".woff", ".woff2"}
        files = [
            f.name
            for f in OVERLAYFILES_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in font_extensions
        ]

        files.sort()

        logger.info(f"Found {len(files)} font files")
        return {"success": True, "files": files}

    except Exception as e:
        logger.error(f"Error getting font files: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fonts/upload")
async def upload_font_file(file: UploadFile = File(...)):
    """Upload a new font file to Overlayfiles directory"""
    try:
        # Ensure directory exists
        try:
            OVERLAYFILES_DIR.mkdir(parents=True, exist_ok=True)
            test_file = OVERLAYFILES_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError:
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for Overlayfiles directory.",
            )

        # Validate file type
        allowed_extensions = {".ttf", ".otf", ".woff", ".woff2"}
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Only TTF, OTF, WOFF, and WOFF2 files are allowed.",
            )

        safe_filename = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if file_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"File '{safe_filename}' already exists.",
            )

        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        with open(file_path, "wb") as f:
            f.write(content)

        # Invalidate caches
        invalidate_cache_pattern("fonts")
        invalidate_cache_pattern("overlayfiles")

        logger.info(f"Uploaded font file: {safe_filename} ({len(content)} bytes)")

        return {
            "success": True,
            "message": f"Font '{safe_filename}' uploaded successfully",
            "filename": safe_filename,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading font file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/fonts/{filename}")
async def delete_font_file(filename: str):
    """Delete a font file from Overlayfiles directory"""
    try:
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        file_path.unlink()

        # Invalidate caches
        invalidate_cache_pattern("fonts")
        invalidate_cache_pattern("overlayfiles")

        logger.info(f"Deleted font file: {safe_filename}")

        return {
            "success": True,
            "message": f"Font '{safe_filename}' deleted successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting font file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fonts/preview/{filename}")
async def preview_font_file(filename: str, text: str = "Aa"):
    """Generate a preview image for a font file"""
    try:
        safe_filename = "".join(
            c for c in filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        font_path = OVERLAYFILES_DIR / safe_filename

        if not font_path.exists():
            raise HTTPException(status_code=404, detail="Font file not found")

        # Validate font extension
        allowed_extensions = {".ttf", ".otf", ".woff", ".woff2"}
        if font_path.suffix.lower() not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Not a valid font file")

        # Sanitize preview text
        safe_text = "".join(c for c in text if c.isprintable())[:100] or "Aa"

        # Create font preview image
        import hashlib

        cache_key = hashlib.md5(f"{safe_filename}_{safe_text}".encode()).hexdigest()
        font_preview = FONTPREVIEWS_DIR / f"font_preview_{cache_key}.png"

        # Check if preview already exists and is recent
        if font_preview.exists():
            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

        # Generate preview using PIL/Pillow
        try:
            from PIL import Image, ImageDraw, ImageFont

            # Create image
            img_width = 800
            img_height = 200
            image = Image.new("RGB", (img_width, img_height), color="white")
            draw = ImageDraw.Draw(image)

            # Load font
            try:
                font = ImageFont.truetype(str(font_path), size=72)
            except Exception:
                font = ImageFont.load_default()

            # Calculate text position (centered)
            bbox = draw.textbbox((0, 0), safe_text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (img_width - text_width) // 2
            y = (img_height - text_height) // 2

            # Draw text
            draw.text((x, y), safe_text, fill="black", font=font)

            # Save preview
            FONTPREVIEWS_DIR.mkdir(exist_ok=True)
            image.save(font_preview, "PNG")

            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

        except ImportError:
            raise HTTPException(
                status_code=500, detail="PIL/Pillow not installed for font previews"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating font preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
