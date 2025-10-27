"""
Process Router
============================================================

Script execution control - run, stop, reset

Endpoints:
- POST /api/run/{mode}
- POST /api/stop
- POST /api/reset-posters
- GET /api/status
- DELETE /api/running-file
"""

from fastapi import APIRouter, HTTPException
from pathlib import Path
import logging
import subprocess
import platform
from datetime import datetime
from pydantic import BaseModel

router = APIRouter(tags=["process"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
BASE_DIR = None
SCRIPT_PATH = None
LOGS_DIR = None
CONFIG_PATH = None
RUNNING_FILE = None
SCHEDULER_AVAILABLE = False
scheduler = None
scan_and_cache_assets = None
import_imagechoices_to_db = None
RUNTIME_DB_AVAILABLE = False
save_runtime_to_db = None

# State management - will reference main.py's global state
state = None


class ResetPostersRequest(BaseModel):
    library: str


def setup_dependencies(dependencies: dict):
    """Initialize process router dependencies"""
    global BASE_DIR, SCRIPT_PATH, LOGS_DIR, CONFIG_PATH, RUNNING_FILE
    global SCHEDULER_AVAILABLE, scheduler, scan_and_cache_assets, import_imagechoices_to_db
    global RUNTIME_DB_AVAILABLE, save_runtime_to_db, state

    BASE_DIR = dependencies["base_dir"]
    SCRIPT_PATH = dependencies["script_path"]
    LOGS_DIR = dependencies["logs_dir"]
    CONFIG_PATH = dependencies["config_path"]
    RUNNING_FILE = dependencies["running_file"]
    SCHEDULER_AVAILABLE = dependencies.get("scheduler_available", False)
    scheduler = dependencies.get("scheduler")
    scan_and_cache_assets = dependencies.get("scan_cache_func")
    import_imagechoices_to_db = dependencies.get("import_imagechoices_func")
    RUNTIME_DB_AVAILABLE = dependencies.get("runtime_db_available", False)
    save_runtime_to_db = dependencies.get("save_runtime_func")
    state = dependencies.get("state")


def get_powershell_command():
    """Determine which PowerShell command to use"""
    if platform.system() == "Windows":
        ps_command = "pwsh"
        try:
            subprocess.run([ps_command, "-v"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            ps_command = "powershell"
            logger.info("pwsh not found, using powershell instead")
    else:
        ps_command = "pwsh"
    return ps_command


@router.post("/api/run/{mode}")
async def run_script(mode: str):
    """Run Posterizarr script in different modes"""
    # Check if already running
    if state.current_process and state.current_process.poll() is None:
        raise HTTPException(status_code=400, detail="Script is already running")

    if not SCRIPT_PATH.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    ps_command = get_powershell_command()

    # Determine command based on mode
    commands = {
        "normal": [ps_command, "-File", str(SCRIPT_PATH)],
        "testing": [ps_command, "-File", str(SCRIPT_PATH), "-Testing"],
        "manual": [ps_command, "-File", str(SCRIPT_PATH), "-Manual"],
        "backup": [ps_command, "-File", str(SCRIPT_PATH), "-Backup"],
        "syncjelly": [ps_command, "-File", str(SCRIPT_PATH), "-SyncJelly"],
        "syncemby": [ps_command, "-File", str(SCRIPT_PATH), "-SyncEmby"],
    }

    if mode not in commands:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")

    try:
        logger.info(f"Running command: {' '.join(commands[mode])}")
        state.current_process = subprocess.Popen(
            commands[mode],
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        state.current_mode = mode
        state.current_start_time = datetime.now().isoformat()
        logger.info(
            f"Started Posterizarr in {mode} mode with PID {state.current_process.pid}"
        )
        return {
            "success": True,
            "message": f"Started in {mode} mode",
            "pid": state.current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH. Error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error starting script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/reset-posters")
async def reset_posters(request: ResetPostersRequest):
    """Reset all posters in a Plex library"""
    # Check if script is running
    if state.current_process and state.current_process.poll() is None:
        raise HTTPException(
            status_code=400,
            detail="Cannot reset posters while script is running. Please stop the script first.",
        )

    if not SCRIPT_PATH.exists():
        raise HTTPException(status_code=404, detail="Posterizarr.ps1 not found")

    if not request.library or not request.library.strip():
        raise HTTPException(status_code=400, detail="Library name is required")

    ps_command = get_powershell_command()

    # Build command with PosterReset switch and library parameter
    command = [
        ps_command,
        "-File",
        str(SCRIPT_PATH),
        "-PosterReset",
        "-LibraryToReset",
        request.library.strip(),
    ]

    try:
        logger.info(f"Resetting posters for library: {request.library}")
        logger.info(f"Running command: {' '.join(command)}")

        # Run the reset command
        state.current_process = subprocess.Popen(
            command,
            cwd=str(BASE_DIR),
            stdout=None,
            stderr=None,
            text=True,
        )
        state.current_mode = "reset"
        state.current_start_time = datetime.now().isoformat()

        logger.info(
            f"Started poster reset for library '{request.library}' with PID {state.current_process.pid}"
        )

        return {
            "success": True,
            "message": f"Started resetting posters for library: {request.library}",
            "pid": state.current_process.pid,
        }
    except FileNotFoundError as e:
        error_msg = f"PowerShell not found. Please install PowerShell 7+ (pwsh) or ensure Windows PowerShell is in PATH. Error: {str(e)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    except Exception as e:
        logger.error(f"Error resetting posters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/stop")
async def stop_script():
    """Stop running script gracefully - works for both manual and scheduled runs"""
    # Check if manual process is running
    manual_running = state.current_process and state.current_process.poll() is None

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
                state.current_process.terminate()
                state.current_process.wait(timeout=5)
                state.current_process = None
                state.current_mode = None
                state.current_start_time = None
                stopped_processes.append("manual")
            except subprocess.TimeoutExpired:
                state.current_process.kill()
                state.current_process = None
                state.current_mode = None
                state.current_start_time = None
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
            except Exception as e:
                logger.error(f"Error stopping scheduler process: {e}")

        if stopped_processes:
            message = f"Stopped: {', '.join(stopped_processes)}"
            return {"success": True, "message": message}
        else:
            return {"success": False, "message": "Failed to stop processes"}

    except Exception as e:
        logger.error(f"Error stopping script: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/status")
async def get_status():
    """Get script status with last log lines from appropriate log file"""
    manual_is_running = False
    manual_pid = None
    if state.current_process is not None:
        poll_result = state.current_process.poll()
        if poll_result is None:
            # Process is still running
            manual_is_running = True
            manual_pid = state.current_process.pid
        else:
            logger.info(
                f"Process finished with exit code {poll_result}, cleaning up..."
            )
            # Store mode before clearing for runtime tracking
            finished_mode = state.current_mode

            state.current_process = None
            state.current_mode = None
            state.current_start_time = None
            manual_is_running = False

            # Auto-trigger cache refresh after script finishes
            if scan_and_cache_assets:
                logger.info("Triggering cache refresh after script completion...")
                try:
                    scan_and_cache_assets()
                    logger.info("Cache refreshed successfully after script completion")
                except Exception as e:
                    logger.error(f"Error refreshing cache after script completion: {e}")

            # Import ImageChoices.csv to database
            if import_imagechoices_to_db:
                try:
                    import_imagechoices_to_db()
                except Exception as e:
                    logger.error(f"Error importing ImageChoices.csv to database: {e}")

            # Save runtime statistics to database
            if RUNTIME_DB_AVAILABLE and save_runtime_to_db and finished_mode:
                try:
                    # Determine which log file was used
                    mode_log_map = {
                        "normal": "Scriptlog.log",
                        "testing": "Testinglog.log",
                        "manual": "Manuallog.log",
                        "backup": "Scriptlog.log",
                        "syncjelly": "Scriptlog.log",
                        "syncemby": "Scriptlog.log",
                        "reset": "Scriptlog.log",
                    }
                    log_filename = mode_log_map.get(finished_mode, "Scriptlog.log")
                    log_path = LOGS_DIR / log_filename

                    if log_path.exists():
                        save_runtime_to_db(log_path, finished_mode)
                        logger.info(
                            f"Runtime statistics saved to database for {finished_mode} mode"
                        )
                    else:
                        logger.warning(f"Log file not found: {log_path}")
                except Exception as e:
                    logger.error(f"Error saving runtime to database: {e}")

    scheduler_is_running = False
    scheduler_pid = None
    if SCHEDULER_AVAILABLE and scheduler:
        if scheduler.is_running and scheduler.current_process:
            poll_result = scheduler.current_process.poll()
            if poll_result is None:
                # Scheduler process is still running
                scheduler_is_running = True
                scheduler_pid = scheduler.current_process.pid
            else:
                # Scheduler process has finished - clean up!
                logger.info(
                    f"Scheduler process finished with exit code {poll_result}, cleaning up..."
                )
                scheduler.current_process = None
                scheduler.is_running = False
                scheduler_is_running = False

                # Auto-trigger cache refresh after scheduler finishes
                if scan_and_cache_assets:
                    logger.info(
                        "Triggering cache refresh after scheduler completion..."
                    )
                    try:
                        scan_and_cache_assets()
                        logger.info(
                            "Cache refreshed successfully after scheduler completion"
                        )
                    except Exception as e:
                        logger.error(
                            f"Error refreshing cache after scheduler completion: {e}"
                        )

                # Import ImageChoices.csv to database
                if import_imagechoices_to_db:
                    try:
                        import_imagechoices_to_db()
                    except Exception as e:
                        logger.error(
                            f"Error importing ImageChoices.csv to database: {e}"
                        )

    # Determine which log file to read based on current mode
    mode_log_map = {
        "normal": "Scriptlog.log",
        "testing": "Testinglog.log",
        "manual": "Manuallog.log",
        "backup": "Scriptlog.log",
        "syncjelly": "Scriptlog.log",
        "syncemby": "Scriptlog.log",
        "reset": "Scriptlog.log",
    }

    # Determine which mode to use for log file selection
    if manual_is_running:
        active_mode = state.current_mode
    elif scheduler_is_running:
        # Scheduler always uses normal log
        active_mode = "normal"
    else:
        # No process running - check most recent log
        active_mode = None

    log_file = None
    if active_mode:
        log_filename = mode_log_map.get(active_mode, "Scriptlog.log")
        log_file = LOGS_DIR / log_filename

    # If no active mode, find most recently modified log
    if not log_file or not log_file.exists():
        log_files = [LOGS_DIR / f for f in mode_log_map.values()]
        existing_logs = [f for f in log_files if f.exists()]
        if existing_logs:
            log_file = max(existing_logs, key=lambda f: f.stat().st_mtime)

    # Read last 30 lines from log file
    last_logs = []
    if log_file and log_file.exists():
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                last_logs = [line.strip() for line in lines[-30:] if line.strip()]
        except Exception as e:
            logger.error(f"Error reading log file: {e}")

    # Check for required files
    script_exists = SCRIPT_PATH.exists()
    config_exists = CONFIG_PATH.exists()

    # Get mode safely
    current_mode_value = None
    if state and hasattr(state, "current_mode"):
        current_mode_value = state.current_mode
        logger.debug(
            f"State current_mode: {current_mode_value}, manual_is_running: {manual_is_running}"
        )
    else:
        logger.warning(f"State is None or doesn't have current_mode attribute")

    # Get start time safely
    start_time_value = None
    if state and hasattr(state, "current_start_time"):
        start_time_value = state.current_start_time

    return {
        "running": manual_is_running or scheduler_is_running,
        "manual_running": manual_is_running,
        "scheduler_running": scheduler_is_running,
        "pid": manual_pid if manual_is_running else scheduler_pid,
        "scheduler_pid": scheduler_pid,
        "mode": (
            current_mode_value
            if manual_is_running
            else ("scheduled" if scheduler_is_running else None)
        ),
        "current_mode": (
            current_mode_value
            if manual_is_running
            else ("scheduled" if scheduler_is_running else None)
        ),
        "start_time": start_time_value,
        "last_logs": last_logs,
        "log_file": str(log_file) if log_file else None,
        "script_exists": script_exists,
        "config_exists": config_exists,
    }


@router.delete("/api/running-file")
async def delete_running_file():
    """Delete .running file if it exists"""
    try:
        if RUNNING_FILE.exists():
            RUNNING_FILE.unlink()
            return {"success": True, "message": ".running file deleted"}
        return {"success": False, "message": ".running file does not exist"}
    except Exception as e:
        logger.error(f"Error deleting .running file: {e}")
        raise HTTPException(status_code=500, detail=str(e))
