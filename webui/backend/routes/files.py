"""
Files Router
============================================================

Overlay files and fonts management

Endpunkte:
- GET /api/overlayfiles
- POST /api/overlayfiles/upload
- DELETE /api/overlayfiles/{filename}
- GET /api/overlayfiles/preview/{filename}
- GET /api/fonts
- POST /api/fonts/upload
- DELETE /api/fonts/{filename}
- GET /api/fonts/preview/{filename}
"""

from fastapi import APIRouter, HTTPException, File, UploadFile
from fastapi.responses import FileResponse
from pathlib import Path
import logging
import subprocess
from typing import Optional

router = APIRouter(prefix="/api", tags=["files"])
logger = logging.getLogger(__name__)

# These will be injected by initialize_routers()
OVERLAYFILES_DIR: Optional[Path] = None
FONTPREVIEWS_DIR: Optional[Path] = None
TEMP_DIR: Optional[Path] = None
APP_DIR: Optional[Path] = None
IS_DOCKER: bool = False


def setup_dependencies(
    overlayfiles_dir: Path,
    fontpreviews_dir: Path,
    temp_dir: Path,
    app_dir: Path,
    is_docker: bool,
):
    """Setup router dependencies"""
    global OVERLAYFILES_DIR, FONTPREVIEWS_DIR, TEMP_DIR, APP_DIR, IS_DOCKER
    OVERLAYFILES_DIR = overlayfiles_dir
    FONTPREVIEWS_DIR = fontpreviews_dir
    TEMP_DIR = temp_dir
    APP_DIR = app_dir
    IS_DOCKER = is_docker


# ============================================================================
# OVERLAY FILES ENDPOINTS
# ============================================================================


@router.get("/overlayfiles")
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
    logger.info("=" * 60)
    logger.info("OVERLAY FILE UPLOAD STARTED")
    logger.info(f"Filename: {file.filename}")
    logger.info(f"Content-Type: {file.content_type}")

    try:
        # Ensure directory exists with permission check
        try:
            OVERLAYFILES_DIR.mkdir(parents=True, exist_ok=True)
            test_file = OVERLAYFILES_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError:
            logger.error(f"No write permission for Overlayfiles directory")
            raise HTTPException(
                status_code=500,
                detail="No write permission for Overlayfiles directory. Check Docker/NAS/Unraid volume permissions.",
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
                detail="Invalid file type. Only PNG, JPG, JPEG, TTF, OTF, WOFF, and WOFF2 files are allowed.",
            )

        # Sanitize filename
        safe_filename = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        # Check if file already exists
        if file_path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"File '{safe_filename}' already exists. Please rename or delete the existing file first.",
            )

        # Write file
        content = await file.read()
        content_size = len(content)

        if content_size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        with open(file_path, "wb") as f:
            f.write(content)

        # Verify file was written
        if not file_path.exists() or file_path.stat().st_size == 0:
            raise HTTPException(
                status_code=500, detail="File was not saved successfully"
            )

        logger.info(f"Uploaded overlay file: {safe_filename} ({content_size} bytes)")
        logger.info("=" * 60)

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
        # Ensure directory exists with permission check
        try:
            OVERLAYFILES_DIR.mkdir(parents=True, exist_ok=True)
            test_file = OVERLAYFILES_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError:
            raise HTTPException(
                status_code=500,
                detail="No write permission for Overlayfiles directory. Check Docker/NAS/Unraid volume permissions.",
            )

        # Validate file type
        allowed_extensions = {".ttf", ".otf", ".woff", ".woff2"}
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only TTF, OTF, WOFF, and WOFF2 files are allowed.",
            )

        # Sanitize filename
        safe_filename = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()

        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")

        file_path = OVERLAYFILES_DIR / safe_filename

        # Check if file already exists
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

        # Verify file was written
        if not file_path.exists() or file_path.stat().st_size == 0:
            raise HTTPException(
                status_code=500, detail="File was not saved successfully"
            )

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

        # Create font preview image with unique name
        import hashlib

        cache_key = hashlib.md5(f"{safe_filename}_{safe_text}".encode()).hexdigest()
        font_preview = FONTPREVIEWS_DIR / f"font_preview_{cache_key}.png"

        # Return cached preview if it exists
        if font_preview.exists():
            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

        try:
            # Try using PIL/Pillow for font rendering
            from PIL import Image, ImageDraw, ImageFont

            # Adjust image size and font size based on text length
            text_length = len(safe_text)
            if text_length <= 6:
                img_width, img_height = 400, 200
                font_size = 48
            elif text_length <= 20:
                img_width, img_height = 600, 150
                font_size = 36
            else:
                img_width, img_height = 800, 150
                font_size = 32

            # Create image
            img = Image.new("RGB", (img_width, img_height), color=(42, 42, 42))
            draw = ImageDraw.Draw(img)

            # Load font
            font = ImageFont.truetype(str(font_path.absolute()), font_size)

            # Calculate text position for centering
            bbox = draw.textbbox((0, 0), safe_text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (img_width - text_width) // 2
            y = (img_height - text_height) // 2 - bbox[1]

            # Draw text
            draw.text((x, y), safe_text, font=font, fill="white")

            # Save image
            img.save(font_preview, "PNG")

            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

        except ImportError:
            # Pillow not available, fall back to ImageMagick
            logger.warning("Pillow not available, using ImageMagick fallback")

            # Find magick executable
            if IS_DOCKER:
                magick_cmd = "magick"
            else:
                magick_exe = APP_DIR / "magick" / "magick.exe"
                if magick_exe.exists():
                    magick_cmd = str(magick_exe)
                else:
                    magick_cmd = "magick"

            absolute_output_path = str(font_preview.absolute()).replace("\\", "/")

            # Try copying font to temp location
            import shutil

            temp_font = TEMP_DIR / f"temp_{safe_filename}"
            shutil.copy2(font_path, temp_font)
            temp_font_path = str(temp_font.absolute()).replace("\\", "/")

            # Generate preview using ImageMagick
            cmd = [
                magick_cmd,
                "-background",
                "#2A2A2A",
                "-fill",
                "white",
                "-font",
                temp_font_path,
                "-pointsize",
                "48",
                "-size",
                "400x200",
                "-gravity",
                "center",
                f"label:{safe_text}",
                absolute_output_path,
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            # Clean up temp font
            if temp_font.exists():
                try:
                    temp_font.unlink()
                except:
                    pass

            if result.returncode != 0:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to generate font preview: {result.stderr}",
                )

            if not font_preview.exists():
                raise HTTPException(
                    status_code=500,
                    detail="Preview image was not created",
                )

            return FileResponse(
                font_preview,
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=3600"},
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating font preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
