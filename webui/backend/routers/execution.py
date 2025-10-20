"""
Execution control router for Posterizarr Backend
Handles script execution, stop, kill, manual mode
"""
import subprocess
import logging
import platform
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import BASE_DIR, CONFIG_PATH

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["execution"])


# ============================================================================
# REQUEST MODELS
# ============================================================================

class ResetPostersRequest(BaseModel):
    """Request to reset posters in a Plex library"""

    library: str


class ManualModeRequest(BaseModel):
    """Request to run manual mode with uploaded assets"""

    posterType: str  # "poster", "season", "background", "titlecard"
    folderPath: str  # Path to folder containing uploaded assets


# ============================================================================
# GLOBAL STATE
# ============================================================================

# Track current running process
current_process: subprocess.Popen = None
current_mode: str = None


# Check if scheduler is available
try:
    from scheduler import SchedulerManager

    SCHEDULER_AVAILABLE = True
    scheduler = SchedulerManager()
except ImportError:
    SCHEDULER_AVAILABLE = False
    scheduler = None
    logger.warning("scheduler module not available - scheduler features disabled")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_powershell_command() -> str:
    """
    Determine which PowerShell executable to use.
    Prefers pwsh (PowerShell 7+), falls back to powershell (Windows PowerShell).
    """
    if platform.system() == "Windows":
        ps_command = "pwsh"
        try:
            subprocess.run([ps_command, "-v"], capture_output=True, check=True)
            return ps_command
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.info("pwsh not found, using powershell instead")
            return "powershell"
    else:
        return "pwsh"


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/run/{mode}")
async def run_script(mode: str):
    """
    Run Posterizarr script in different modes.

    Supported modes:
    - normal: Standard run
    - testing: Testing mode
    - manual: Manual asset selection
    - backup: Backup mode
    - syncjelly: Sync with Jellyfin
    - syncemby: Sync with Emby
    """
    global current_process, current_mode

    # Check if already running
    if current_process and current_process.poll() is None:
        raise HTTPException(status_code=400, detail="Script is already running")

    script_path = BASE_DIR / "Posterizarr.ps1"
    if not script_path.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    ps_command = get_powershell_command()

    # Determine command based on mode
    commands = {
        "normal": [ps_command, "-File", str(script_path)],
        "testing": [ps_command, "-File", str(script_path), "-Testing"],
        "manual": [ps_command, "-File", str(script_path), "-Manual"],
        "backup": [ps_command, "-File", str(script_path), "-Backup"],
        "syncjelly": [ps_command, "-File", str(script_path), "-SyncJelly"],
        "syncemby": [ps_command, "-File", str(script_path), "-SyncEmby"],
    }

    if mode not in commands:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")

    try:
        logger.info(f"Running command: {' '.join(commands[mode])}")
        current_process = subprocess.Popen(
            commands[mode],
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        current_mode = mode
        logger.info(
            f"Started Posterizarr in {mode} mode with PID {current_process.pid}"
        )
        return {
            "success": True,
            "message": f"Started in {mode} mode",
            "pid": current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH. Error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error starting script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run-manual")
async def run_manual_mode(request: ManualModeRequest):
    """
    Run manual mode with uploaded assets.
    Creates temporary upload folder and runs script with -ManualUploadType parameter.
    """
    global current_process, current_mode

    # Check if already running
    if current_process and current_process.poll() is None:
        raise HTTPException(status_code=400, detail="Script is already running")

    script_path = BASE_DIR / "Posterizarr.ps1"
    if not script_path.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    # Map posterType to script parameter
    poster_type_map = {
        "poster": "poster",
        "season": "season",
        "background": "background",
        "titlecard": "titlecard",
    }

    posterType = poster_type_map.get(request.posterType.lower())
    if not posterType:
        raise HTTPException(
            status_code=400, detail=f"Invalid poster type: {request.posterType}"
        )

    # Get upload path
    upload_path = Path(request.folderPath)
    if not upload_path.exists():
        raise HTTPException(status_code=404, detail="Upload folder not found")

    ps_command = get_powershell_command()

    # Build command
    command = [
        ps_command,
        "-File",
        str(script_path),
        "-ManualUploadType",
        posterType,
        "-ManualUploadPath",
        str(upload_path),
    ]

    try:
        logger.info(f"Running manual mode: {posterType}")
        logger.info(f"Upload path: {upload_path}")
        logger.info(f"Command: {' '.join(command)}")

        current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        current_mode = "manual"

        poster_type_display = {
            "poster": "posters",
            "season": "season posters",
            "background": "backgrounds",
            "titlecard": "title cards",
        }

        logger.info(f"Started manual mode with PID {current_process.pid}")
        return {
            "success": True,
            "message": f"Started manual mode for {poster_type_display.get(posterType, 'poster')}",
            "pid": current_process.pid,
            "upload_path": str(upload_path),
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH."
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error running manual mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset-posters")
async def reset_posters(request: ResetPostersRequest):
    """
    Reset all posters in a Plex library.
    Runs Posterizarr.ps1 with -PosterReset and -LibraryToReset parameters.
    """
    global current_process, current_mode

    # Check if script is running
    if current_process and current_process.poll() is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot reset posters while script is running. Please stop the script first.",
        )

    script_path = BASE_DIR / "Posterizarr.ps1"
    if not script_path.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    if not request.library or not request.library.strip():
        raise HTTPException(status_code=400, detail="Library name is required")

    ps_command = get_powershell_command()

    # Build command with PosterReset switch and library parameter
    command = [
        ps_command,
        "-File",
        str(script_path),
        "-PosterReset",
        "-LibraryToReset",
        request.library.strip(),
    ]

    try:
        logger.info(f"Resetting posters for library: {request.library}")
        logger.info(f"Running command: {' '.join(command)}")

        current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        current_mode = "reset"

        logger.info(
            f"Started poster reset for library '{request.library}' with PID {current_process.pid}"
        )

        return {
            "success": True,
            "message": f"Started resetting posters for library: {request.library}",
            "pid": current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH. Error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error resetting posters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop")
async def stop_script():
    """
    Stop running script gracefully.
    Works for both manual and scheduled runs.
    """
    global current_process, current_mode

    # Check if manual process is running
    manual_running = current_process and current_process.poll() is None

    # Check if scheduler process is running
    scheduler_running = False
    if SCHEDULER_AVAILABLE and scheduler:
        scheduler_running = scheduler.is_running and scheduler.current_process

    # If nothing is running
    if not manual_running and not scheduler_running:
        return {"success": False, "message": "No script is running"}

    try:
        stopped_processes = []

        # Stop manual process if running
        if manual_running:
            try:
                current_process.terminate()
                current_process.wait(timeout=5)
                current_process = None
                current_mode = None
                stopped_processes.append("manual")
            except subprocess.TimeoutExpired:
                current_process.kill()
                current_process = None
                current_mode = None
                stopped_processes.append("manual (force killed after timeout)")

        # Stop scheduler process if running
        if scheduler_running:
            try:
                scheduler.current_process.terminate()
                scheduler.current_process.wait(timeout=5)
                scheduler.current_process = None
                scheduler.is_running = False
                stopped_processes.append("scheduled")
            except subprocess.TimeoutExpired:
                scheduler.current_process.kill()
                scheduler.current_process = None
                scheduler.is_running = False
                stopped_processes.append("scheduled (force killed after timeout)")

        logger.info(f"Stopped processes: {', '.join(stopped_processes)}")

        return {
            "success": True,
            "message": f"Stopped: {', '.join(stopped_processes)}",
        }

    except Exception as e:
        logger.error(f"Error stopping script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kill")
async def kill_script():
    """
    Force kill running script.
    Should only be used if graceful stop (/api/stop) fails.
    """
    global current_process, current_mode

    # Check if manual process is running
    manual_running = current_process and current_process.poll() is None

    # Check if scheduler process is running
    scheduler_running = False
    if SCHEDULER_AVAILABLE and scheduler:
        scheduler_running = scheduler.is_running and scheduler.current_process

    # If nothing is running
    if not manual_running and not scheduler_running:
        return {"success": False, "message": "No script is running"}

    try:
        killed_processes = []

        # Kill manual process if running
        if manual_running:
            current_process.kill()
            current_process = None
            current_mode = None
            killed_processes.append("manual")

        # Kill scheduler process if running
        if scheduler_running:
            scheduler.current_process.kill()
            scheduler.current_process = None
            scheduler.is_running = False
            killed_processes.append("scheduled")

        logger.warning(f"Force killed processes: {', '.join(killed_processes)}")

        return {
            "success": True,
            "message": f"Force killed: {', '.join(killed_processes)}",
        }

    except Exception as e:
        logger.error(f"Error killing script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/running-file")
async def delete_running_file():
    """
    Delete the Posterizarr.Running file.
    Useful when script crashes and leaves running file behind.
    """
    try:
        running_file = BASE_DIR / "Posterizarr.Running"

        if running_file.exists():
            running_file.unlink()
            logger.info("Deleted Posterizarr.Running file")
            return {"success": True, "message": "Running file deleted successfully"}
        else:
            return {"success": False, "message": "Running file does not exist"}
    except Exception as e:
        logger.error(f"Error deleting running file: {e}")
        raise HTTPException(status_code=500, detail=str(e))
