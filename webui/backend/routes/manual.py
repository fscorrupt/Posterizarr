"""
Manual Router
============================================================

Manual mode execution endpoints

Endpoints:
- POST /api/run-manual
- POST /api/run-manual-upload
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pathlib import Path
from datetime import datetime
import logging
import subprocess
import asyncio
import json
import platform

from models.request_models import ManualModeRequest

router = APIRouter(tags=["manual"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
SCRIPT_PATH = None
BASE_DIR = None
UPLOADS_DIR = None
CONFIG_PATH = None
IS_DOCKER = False
state = None


def setup_dependencies(dependencies: dict):
    """Initialize manual router dependencies"""
    global SCRIPT_PATH, BASE_DIR, UPLOADS_DIR, CONFIG_PATH, IS_DOCKER, state

    SCRIPT_PATH = dependencies["script_path"]
    BASE_DIR = dependencies["base_dir"]
    UPLOADS_DIR = dependencies["uploads_dir"]
    CONFIG_PATH = dependencies["config_path"]
    IS_DOCKER = dependencies.get("is_docker", False)
    state = dependencies["state"]


@router.post("/api/run-manual")
async def run_manual_mode(request: ManualModeRequest):
    """Run manual mode with custom parameters"""
    # Check if already running
    if state.current_process and state.current_process.poll() is None:
        raise HTTPException(
            status_code=400,
            detail="Script is already running. Please stop the script first.",
        )

    if not SCRIPT_PATH.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    # Validate required fields
    if not request.picturePath or not request.picturePath.strip():
        raise HTTPException(status_code=400, detail="Picture path is required")

    # Title text is NOT required for titlecards (they use epTitleName instead)
    if request.posterType != "titlecard" and (
        not request.titletext or not request.titletext.strip()
    ):
        raise HTTPException(status_code=400, detail="Title text is required")

    # Folder name is NOT required for collection posters
    if request.posterType != "collection" and (
        not request.folderName or not request.folderName.strip()
    ):
        raise HTTPException(status_code=400, detail="Folder name is required")

    if not request.libraryName or not request.libraryName.strip():
        raise HTTPException(status_code=400, detail="Library name is required")

    # Validate season poster
    if request.posterType == "season" and (
        not request.seasonPosterName or not request.seasonPosterName.strip()
    ):
        raise HTTPException(
            status_code=400, detail="Season poster name is required for season posters"
        )

    # Validate title card
    if request.posterType == "titlecard":
        if not request.epTitleName or not request.epTitleName.strip():
            raise HTTPException(
                status_code=400, detail="Episode title name is required for title cards"
            )
        if not request.episodeNumber or not request.episodeNumber.strip():
            raise HTTPException(
                status_code=400, detail="Episode number is required for title cards"
            )
        if not request.seasonPosterName or not request.seasonPosterName.strip():
            raise HTTPException(
                status_code=400, detail="Season name is required for title cards"
            )

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
    if request.posterType == "season":
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
    elif request.posterType == "collection":
        command.extend(
            [
                "-CollectionCard",
                "-Titletext",
                request.titletext.strip(),
                "-LibraryName",
                request.libraryName.strip(),
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
    elif request.posterType == "titlecard":
        command.extend(
            [
                "-TitleCard",
                "-Titletext",
                request.epTitleName.strip(),  # Use episode title as the main title
                "-FolderName",
                request.folderName.strip(),
                "-LibraryName",
                request.libraryName.strip(),
                "-EPTitleName",
                request.epTitleName.strip(),
                "-SeasonPosterName",
                request.seasonPosterName.strip(),
                "-EpisodeNumber",
                request.episodeNumber.strip(),
            ]
        )
    else:  # standard
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

    try:
        logger.info(f"Running manual mode with parameters:")
        logger.info(f"  Picture Path: {request.picturePath}")
        logger.info(f"  Type: {request.posterType}")
        if request.posterType == "titlecard":
            logger.info(f"  Folder: {request.folderName}")
            logger.info(f"  Library: {request.libraryName}")
            logger.info(f"  Episode Title: {request.epTitleName}")
            logger.info(f"  Season: {request.seasonPosterName}")
            logger.info(f"  Episode Number: {request.episodeNumber}")
        elif request.posterType == "season":
            logger.info(f"  Title: {request.titletext}")
            logger.info(f"  Folder: {request.folderName}")
            logger.info(f"  Library: {request.libraryName}")
            logger.info(f"  Season: {request.seasonPosterName}")
        elif request.posterType == "collection":
            logger.info(f"  Title: {request.titletext}")
            logger.info(f"  Library: {request.libraryName}")
        else:
            logger.info(f"  Title: {request.titletext}")
            logger.info(f"  Folder: {request.folderName}")
            logger.info(f"  Library: {request.libraryName}")
        logger.info(f"Running command: {' '.join(command)}")

        # Run the manual mode command
        state.current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        state.current_mode = "manual"  # Set current mode to manual
        state.current_start_time = datetime.now().isoformat()

        logger.info(f"Started manual mode with PID {state.current_process.pid}")

        poster_type_display = {
            "standard": "standard poster",
            "season": "season poster",
            "collection": "collection poster",
            "titlecard": "episode title card",
        }

        return {
            "success": True,
            "message": f"Started manual mode for {poster_type_display.get(request.posterType, 'poster')}",
            "pid": state.current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH."
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error running manual mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/run-manual-upload")
async def run_manual_mode_upload(
    file: UploadFile = File(...),
    picturePath: str = Form(""),
    titletext: str = Form(""),
    folderName: str = Form(""),
    libraryName: str = Form(""),
    posterType: str = Form("standard"),
    seasonPosterName: str = Form(""),
    epTitleName: str = Form(""),
    episodeNumber: str = Form(""),
):
    """Run manual mode with uploaded file"""
    logger.info(f"Manual mode upload request received")
    logger.info(f"  File: {file.filename if file else 'None'}")
    logger.info(f"  File content type: {file.content_type if file else 'None'}")
    logger.info(f"  Poster Type: {posterType}")
    logger.info(f"  Title Text: '{titletext}'")
    logger.info(f"  Folder Name: '{folderName}'")
    logger.info(f"  Library Name: '{libraryName}'")
    logger.info(f"  Season Poster Name: '{seasonPosterName}'")
    logger.info(f"  Episode Title Name: '{epTitleName}'")
    logger.info(f"  Episode Number: '{episodeNumber}'")

    # Check if already running
    if state.current_process and state.current_process.poll() is None:
        error_msg = "Script is already running. Please stop the script first."
        logger.error(f"Manual upload rejected: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    if not SCRIPT_PATH.exists():
        error_msg = "Posterizarr.ps1 not found"
        logger.error(f"Manual upload failed: {error_msg}")
        raise HTTPException(status_code=404, detail=error_msg)

    # Validate file upload
    if not file:
        error_msg = "No file uploaded"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    # Validate file type
    allowed_extensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in allowed_extensions:
        error_msg = f"Invalid file type '{file_extension}'. Allowed: {', '.join(allowed_extensions)}"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    # Validate required fields
    if posterType != "titlecard" and not titletext.strip():
        error_msg = "Title text is required"
        logger.error(
            f"Manual upload validation failed: {error_msg} (posterType: {posterType})"
        )
        raise HTTPException(status_code=400, detail=error_msg)

    if posterType != "collection" and not folderName.strip():
        error_msg = "Folder name is required"
        logger.error(
            f"Manual upload validation failed: {error_msg} (posterType: {posterType})"
        )
        raise HTTPException(status_code=400, detail=error_msg)

    if not libraryName.strip():
        error_msg = "Library name is required"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    if posterType == "season" and not seasonPosterName.strip():
        error_msg = "Season poster name is required for season posters"
        logger.error(f"Manual upload validation failed: {error_msg}")
        raise HTTPException(status_code=400, detail=error_msg)

    if posterType == "titlecard":
        if not epTitleName.strip():
            error_msg = "Episode title name is required for title cards"
            logger.error(f"Manual upload validation failed: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        if not episodeNumber.strip():
            error_msg = "Episode number is required for title cards"
            logger.error(f"Manual upload validation failed: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        if not seasonPosterName.strip():
            error_msg = "Season name is required for title cards"
            logger.error(f"Manual upload validation failed: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)

    try:
        # Create uploads directory if it doesn't exist with permission check
        try:
            UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
            # Verify write permissions
            test_file = UPLOADS_DIR / ".write_test"
            test_file.touch()
            test_file.unlink()
        except PermissionError as e:
            logger.error(f"No write permission for uploads directory: {UPLOADS_DIR}")
            raise HTTPException(
                status_code=500,
                detail=f"No write permission for uploads directory. This may be a Docker/NAS permission issue. Please check folder permissions.",
            )
        except Exception as e:
            logger.error(f"Error creating uploads directory: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Cannot create uploads directory: {str(e)}",
            )

        # Generate unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Sanitize filename to prevent path traversal and special characters
        safe_name = "".join(
            c for c in file.filename if c.isalnum() or c in "._- "
        ).strip()
        if not safe_name:
            safe_name = "upload.jpg"
        safe_filename = f"{timestamp}_{safe_name}"
        upload_path = UPLOADS_DIR / safe_filename

        # Save uploaded file to uploads directory
        logger.info(f"Saving uploaded file to: {upload_path}")
        logger.info(f"Upload directory: {UPLOADS_DIR.resolve()}")
        logger.info(f"Is Docker: {IS_DOCKER}")

        try:
            content = await file.read()
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="Uploaded file is empty")

            # Validate image dimensions and REJECT if too small
            try:
                from PIL import Image
                import io

                # Open image from bytes
                img = Image.open(io.BytesIO(content))
                width, height = img.size
                logger.info(f"Manual upload image dimensions: {width}x{height} pixels")

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
                        poster_min_width = 2000
                        poster_min_height = 3000
                        bg_tc_min_width = 3840
                        bg_tc_min_height = 2160
                except:
                    poster_min_width = 2000
                    poster_min_height = 3000
                    bg_tc_min_width = 3840
                    bg_tc_min_height = 2160

                # Check dimensions based on poster type and REJECT if too small
                if posterType in ["standard", "season", "collection"]:
                    if width < poster_min_width or height < poster_min_height:
                        error_msg = f"Image dimensions ({width}x{height}) are too small. Minimum required: {poster_min_width}x{poster_min_height} pixels for posters. Please upload a higher resolution image."
                        logger.error(error_msg)
                        raise HTTPException(status_code=400, detail=error_msg)
                elif posterType in ["background", "titlecard"]:
                    if width < bg_tc_min_width or height < bg_tc_min_height:
                        error_msg = f"Image dimensions ({width}x{height}) are too small. Minimum required: {bg_tc_min_width}x{bg_tc_min_height} pixels for backgrounds/title cards. Please upload a higher resolution image."
                        logger.error(error_msg)
                        raise HTTPException(status_code=400, detail=error_msg)

            except HTTPException:
                # Re-raise HTTP exceptions (dimension validation failures)
                raise
            except Exception as e:
                logger.warning(
                    f"Could not validate image dimensions for manual upload: {e}"
                )
                # Don't fail upload if dimension check itself fails

            with open(upload_path, "wb") as buffer:
                buffer.write(content)

            # Verify file was written
            if not upload_path.exists():
                raise HTTPException(
                    status_code=500, detail="File was not saved successfully"
                )

            actual_size = upload_path.stat().st_size
            if actual_size != len(content):
                logger.warning(
                    f"File size mismatch: expected {len(content)}, got {actual_size}"
                )

        except PermissionError as e:
            logger.error(f"Permission denied writing file: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Permission denied: Unable to write uploaded file. Check Docker/NAS/Unraid volume permissions.",
            )
        except OSError as e:
            logger.error(f"OS error writing file: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"File system error: {str(e)}. This may be a Docker volume mount issue.",
            )

        logger.info(f"File saved successfully: {upload_path} ({len(content)} bytes)")

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

        # Build command with uploaded file path
        command = [
            ps_command,
            "-File",
            str(SCRIPT_PATH),
            "-Manual",
            "-PicturePath",
            str(upload_path),  # Use the uploaded file path
        ]

        # Add poster type specific switches and parameters
        if posterType == "season":
            command.extend(
                [
                    "-SeasonPoster",
                    "-Titletext",
                    titletext.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                    "-SeasonPosterName",
                    seasonPosterName.strip(),
                ]
            )
        elif posterType == "collection":
            command.extend(
                [
                    "-CollectionCard",
                    "-Titletext",
                    titletext.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                ]
            )
        elif posterType == "background":
            command.extend(
                [
                    "-BackgroundCard",
                    "-Titletext",
                    titletext.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                ]
            )
        elif posterType == "titlecard":
            command.extend(
                [
                    "-TitleCard",
                    "-Titletext",
                    epTitleName.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                    "-EPTitleName",
                    epTitleName.strip(),
                    "-SeasonPosterName",
                    seasonPosterName.strip(),
                    "-EpisodeNumber",
                    episodeNumber.strip(),
                ]
            )
        else:  # standard
            command.extend(
                [
                    "-Titletext",
                    titletext.strip(),
                    "-FolderName",
                    folderName.strip(),
                    "-LibraryName",
                    libraryName.strip(),
                ]
            )

        logger.info(f"Running manual mode with uploaded file:")
        logger.info(f"  Picture Path: {upload_path}")
        logger.info(f"  Type: {posterType}")
        logger.info(f"Running command: {' '.join(command)}")

        # Run the manual mode command
        state.current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        state.current_mode = "manual"
        state.current_start_time = datetime.now().isoformat()

        logger.info(f"Started manual mode with PID {state.current_process.pid}")

        # Schedule cleanup after process completes (in background)
        async def cleanup_upload():
            """Cleanup uploaded file after process completes"""
            try:
                # Wait for process to complete
                while state.current_process.poll() is None:
                    await asyncio.sleep(1)

                # Wait a bit more to ensure file operations are complete
                await asyncio.sleep(5)

                # Delete the uploaded file
                if upload_path.exists():
                    upload_path.unlink()
                    logger.info(f"Cleaned up uploaded file: {upload_path}")
            except Exception as e:
                logger.error(f"Error cleaning up uploaded file: {e}")

        # Start cleanup task in background
        asyncio.create_task(cleanup_upload())

        poster_type_display = {
            "standard": "standard poster",
            "season": "season poster",
            "collection": "collection poster",
            "titlecard": "episode title card",
            "background": "background poster",
        }

        return {
            "success": True,
            "message": f"Started manual mode for {poster_type_display.get(posterType, 'poster')}",
            "pid": state.current_process.pid,
            "upload_path": str(upload_path),
        }
    except HTTPException:
        # Re-raise HTTPExceptions as they are already properly formatted
        raise
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH."
        logger.error(f"Manual upload failed: {error_msg}")
        logger.error(f"Exception details: {e}")
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        error_msg = f"Error running manual mode with uploaded file: {str(e)}"
        logger.error(error_msg)
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=str(e))
