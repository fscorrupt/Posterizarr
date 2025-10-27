"""
Neue Main.py - Refaktorierter Einstiegspunkt
=============================================

Diese Datei zeigt, wie die neue main.py aussehen sollte.
Sie ist viel kleiner und importiert die Router-Module.

VERWENDUNG:
1. Backup der aktuellen main.py erstellen: main.py -> main_original.py
2. Diese Datei umbenennen: main_new.py -> main.py
3. Fehlende Implementierungen Schritt für Schritt aus main_original.py kopieren
4. Testen!
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
import logging
import sys
import glob
import os
from pathlib import Path

# Import constants and utilities
from utils.constants import (
    BASE_DIR,
    APP_DIR,
    ASSETS_DIR,
    MANUAL_ASSETS_DIR,
    IMAGES_DIR,
    FRONTEND_DIR,
    CONFIG_PATH,
    SCRIPT_PATH,
    LOGS_DIR,
    UI_LOGS_DIR,
    DATABASE_DIR,
    TEST_DIR,
    TEMP_DIR,
    OVERLAYFILES_DIR,
    UPLOADS_DIR,
    FONTPREVIEWS_DIR,
    RUNNING_FILE,
    IMAGECHOICES_DB_PATH,
    WEBUI_SETTINGS_PATH,
    IS_DOCKER,
    port,
    LOG_LEVEL_MAP,
)

from utils.settings import (
    initialize_webui_settings,
    load_log_level_config,
)

# Import state management
import utils.state as state

# Initialize webui_settings.json if it doesn't exist
initialize_webui_settings(WEBUI_SETTINGS_PATH)

# Clear UILogs on startup
for log_file in glob.glob(str(UI_LOGS_DIR / "*.log")):
    try:
        os.remove(log_file)
    except Exception:
        pass

# Get log level
LOG_LEVEL_ENV = load_log_level_config(WEBUI_SETTINGS_PATH)
LOG_LEVEL = LOG_LEVEL_MAP.get(LOG_LEVEL_ENV, logging.INFO)

# Setup logging
logging.root.handlers.clear()
file_handler = logging.FileHandler(
    UI_LOGS_DIR / "BackendServer.log", mode="w", encoding="utf-8"
)
file_handler.setLevel(LOG_LEVEL)
file_handler.setFormatter(
    logging.Formatter(
        "[%(asctime)s] [%(levelname)-8s] [%(name)s:%(funcName)s:%(lineno)d] - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
)
logging.root.setLevel(LOG_LEVEL)
logging.root.addHandler(file_handler)

# Disable uvicorn console output
for logger_name in ["uvicorn.access", "uvicorn.error", "uvicorn", "httpx", "httpcore"]:
    log = logging.getLogger(logger_name)
    log.handlers.clear()
    log.propagate = False

logger = logging.getLogger(__name__)
logger.info("=" * 80)
logger.info("POSTERIZARR WEB UI BACKEND INITIALIZING")
logger.info("=" * 80)
logger.info(f"Log Level: {LOG_LEVEL_ENV} ({LOG_LEVEL})")
logger.debug(f"Base directory: {BASE_DIR}")
logger.debug(f"Docker mode: {IS_DOCKER}")

# Import optional modules
try:
    from config_mapper import (
        flatten_config,
        unflatten_config,
        UI_GROUPS,
        DISPLAY_NAMES,
        get_display_name,
        get_tooltip,
    )
    from config_tooltips import CONFIG_TOOLTIPS

    state.CONFIG_MAPPER_AVAILABLE = True
    logger.info("Config mapper loaded")
except ImportError as e:
    state.CONFIG_MAPPER_AVAILABLE = False
    CONFIG_TOOLTIPS = {}
    logger.warning(f"Config mapper not available: {e}")

try:
    from scheduler import PosterizarrScheduler

    state.SCHEDULER_AVAILABLE = True
    logger.info("Scheduler module loaded")
except ImportError as e:
    state.SCHEDULER_AVAILABLE = False
    logger.warning(f"Scheduler not available: {e}")

try:
    from auth_middleware import BasicAuthMiddleware, load_auth_config

    state.AUTH_MIDDLEWARE_AVAILABLE = True
    logger.info("Auth middleware loaded")
except ImportError as e:
    state.AUTH_MIDDLEWARE_AVAILABLE = False
    logger.warning(f"Auth middleware not available: {e}")

try:
    from database import init_database, ImageChoicesDB

    state.DATABASE_AVAILABLE = True
    logger.info("Database module loaded")
except ImportError as e:
    state.DATABASE_AVAILABLE = False
    logger.warning(f"Database module not available: {e}")

try:
    from config_database import ConfigDB

    state.CONFIG_DATABASE_AVAILABLE = True
    logger.info("Config database module loaded")
except ImportError as e:
    state.CONFIG_DATABASE_AVAILABLE = False
    logger.warning(f"Config database not available: {e}")

try:
    from runtime_database import runtime_db as runtime_db_module
    from runtime_parser import parse_runtime_from_log, save_runtime_to_db

    state.RUNTIME_DB_AVAILABLE = True
    state.runtime_db = runtime_db_module
    state.save_runtime_to_db = save_runtime_to_db
    logger.info("Runtime database module loaded")
except ImportError as e:
    state.RUNTIME_DB_AVAILABLE = False
    state.runtime_db = None
    state.save_runtime_to_db = None
    logger.warning(f"Runtime database not available: {e}")

# Import additional utility functions
try:
    from utils.cache import scan_and_cache_assets

    state.scan_and_cache_assets = scan_and_cache_assets
except ImportError as e:
    state.scan_and_cache_assets = None
    logger.warning(f"Cache utility not available: {e}")

try:
    from database import import_imagechoices_to_db

    state.import_imagechoices_to_db = import_imagechoices_to_db
except ImportError as e:
    state.import_imagechoices_to_db = None
    logger.warning(f"ImageChoices import function not available: {e}")

logger.info("Module loading completed")


# Helper classes
class CachedStaticFiles(StaticFiles):
    """StaticFiles with Cache-Control headers"""

    def __init__(self, *args, max_age: int = 3600, **kwargs):
        self.max_age = max_age
        super().__init__(*args, **kwargs)

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = f"public, max-age={self.max_age}"
        return response


class SPAMiddleware(BaseHTTPMiddleware):
    """Middleware for SPA support"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if response.status_code == 404:
            path = request.url.path
            if not path.startswith(("/api", "/poster_assets", "/test", "/_assets")):
                index_path = FRONTEND_DIR / "index.html"
                if index_path.exists():
                    return FileResponse(index_path)
        return response


# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler"""
    from utils.cache import (
        scan_and_cache_assets,
        start_cache_refresh_background,
        stop_cache_refresh_background,
    )

    logger.info("Starting Posterizarr Web UI Backend")

    # Pre-populate asset cache
    scan_and_cache_assets(ASSETS_DIR)
    start_cache_refresh_background(ASSETS_DIR)

    # Initialize config database
    if state.CONFIG_DATABASE_AVAILABLE:
        try:
            logger.info("Initializing config database...")
            from config_database import ConfigDB

            CONFIG_DB_PATH = DATABASE_DIR / "config.db"
            state.config_db = ConfigDB(CONFIG_DB_PATH, CONFIG_PATH)
            state.config_db.initialize()
            logger.info(f"Config database ready: {CONFIG_DB_PATH}")
        except Exception as e:
            logger.error(f"Failed to initialize config database: {e}")
            state.config_db = None

    # Initialize imagechoices database
    if state.DATABASE_AVAILABLE:
        try:
            logger.info("Initializing imagechoices database...")
            from database import init_database

            state.db = init_database(IMAGECHOICES_DB_PATH)
            logger.info(f"Database ready: {IMAGECHOICES_DB_PATH}")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            state.db = None

    # Initialize scheduler
    if state.SCHEDULER_AVAILABLE:
        try:
            from scheduler import PosterizarrScheduler

            state.scheduler = PosterizarrScheduler(BASE_DIR, SCRIPT_PATH)
            state.scheduler.start()
            logger.info("Scheduler initialized")
        except Exception as e:
            logger.error(f"Failed to initialize scheduler: {e}")
            state.scheduler = None

    yield

    # Shutdown
    stop_cache_refresh_background()

    if state.scheduler:
        try:
            state.scheduler.stop()
            logger.info("Scheduler stopped")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")

    if state.db:
        try:
            state.db.close()
            logger.info("Database closed")
        except Exception as e:
            logger.error(f"Error closing database: {e}")

    if state.config_db:
        try:
            state.config_db.close()
            logger.info("Config database closed")
        except Exception as e:
            logger.error(f"Error closing config database: {e}")

    logger.info("Shutting down Posterizarr Web UI Backend")


# Create app
app = FastAPI(title="Posterizarr Web UI", lifespan=lifespan)


# Exception handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error for {request.method} {request.url}")
    logger.error(f"Validation errors: {exc.errors()}")
    return JSONResponse(
        status_code=400,
        content={"detail": exc.errors(), "body": str(exc.body)},
    )


# Basic Auth Middleware
if state.AUTH_MIDDLEWARE_AVAILABLE:
    try:
        from auth_middleware import BasicAuthMiddleware

        app.add_middleware(BasicAuthMiddleware, config_path=CONFIG_PATH)
        logger.info("Basic Auth middleware registered")
    except Exception as e:
        logger.error(f"Failed to initialize Basic Auth: {e}")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SPA Middleware
app.add_middleware(SPAMiddleware)
logger.info("SPA Middleware enabled")

# ============================================================================
# ROUTER REGISTRATION
# ============================================================================

from routes import (
    auth_router,
    config_router,
    files_router,
    validation_router,
    libraries_router,
    assets_router,
    logs_router,
    system_router,
    runtime_router,
    process_router,
    gallery_router,
    scheduler_router,
    tmdb_router,
    manual_router,
    dashboard_router,
    imagechoices_router,
    initialize_routers,
)

# Initialize routers with dependencies
initialize_routers(
    config_path=CONFIG_PATH,
    base_dir=BASE_DIR,
    assets_dir=ASSETS_DIR,
    manual_assets_dir=MANUAL_ASSETS_DIR,
    logs_dir=LOGS_DIR,
    ui_logs_dir=UI_LOGS_DIR,
    temp_dir=TEMP_DIR,
    database_dir=DATABASE_DIR,
    overlayfiles_dir=OVERLAYFILES_DIR,
    uploads_dir=UPLOADS_DIR,
    fontpreviews_dir=FONTPREVIEWS_DIR,
    running_file=RUNNING_FILE,
    imagechoices_db_path=IMAGECHOICES_DB_PATH,
    script_path=SCRIPT_PATH,
    webui_settings_path=WEBUI_SETTINGS_PATH,
    state_module=state,
)

app.include_router(auth_router)
app.include_router(config_router)
app.include_router(files_router)
app.include_router(validation_router)
app.include_router(libraries_router)
app.include_router(assets_router)
app.include_router(logs_router)
app.include_router(system_router)
app.include_router(runtime_router)
app.include_router(process_router)
app.include_router(gallery_router)
app.include_router(scheduler_router)
app.include_router(tmdb_router)
app.include_router(manual_router)
app.include_router(dashboard_router)
app.include_router(imagechoices_router)

# ============================================================================
# WEBSOCKET ENDPOINT
# ============================================================================

from fastapi import WebSocket, WebSocketDisconnect, Query
from typing import Optional
import asyncio


@app.websocket("/ws/logs")
async def websocket_logs(
    websocket: WebSocket, log_file: Optional[str] = Query("Scriptlog.log")
):
    """
    WebSocket endpoint for REAL-TIME log streaming
    Streams log file updates to the frontend
    """
    await websocket.accept()
    logger.info(f"WebSocket connection established for log: {log_file}")

    # Determine which log file to monitor - check both directories
    log_path = LOGS_DIR / log_file
    if not log_path.exists():
        log_path = UI_LOGS_DIR / log_file

    # Track if user explicitly requested a specific log file
    user_requested_log = log_file != "Scriptlog.log"

    # Map modes to their log files for dynamic switching
    mode_log_map = {
        "normal": "Scriptlog.log",
        "testing": "Testinglog.log",
        "manual": "Manuallog.log",
        "backup": "Scriptlog.log",
        "syncjelly": "Scriptlog.log",
        "syncemby": "Scriptlog.log",
        "reset": "Scriptlog.log",
        "scheduled": "Scriptlog.log",
    }

    try:
        # Send initial logs (100 lines)
        if log_path.exists():
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()[-100:]
                for line in lines:
                    stripped = line.strip()
                    if stripped:
                        await websocket.send_json({"type": "log", "content": stripped})

        # Monitor log file for changes
        last_position = log_path.stat().st_size if log_path.exists() else 0
        last_mode = state.current_mode
        current_log_file = log_file

        while True:
            try:
                await asyncio.sleep(0.3)  # Fast polling
            except asyncio.CancelledError:
                logger.info("WebSocket log streaming cancelled")
                break

            # Auto-switch log file if mode changed (unless user manually selected)
            if (
                not user_requested_log
                and state.current_mode != last_mode
                and state.current_mode in mode_log_map
            ):
                new_log_file = mode_log_map[state.current_mode]

                if new_log_file != current_log_file:
                    logger.info(
                        f"WebSocket auto-switching from {current_log_file} to {new_log_file}"
                    )
                    current_log_file = new_log_file
                    log_path = LOGS_DIR / new_log_file
                    if not log_path.exists():
                        log_path = UI_LOGS_DIR / new_log_file
                    last_position = log_path.stat().st_size if log_path.exists() else 0

                    await websocket.send_json(
                        {
                            "type": "log_file_changed",
                            "log_file": new_log_file,
                            "mode": state.current_mode,
                        }
                    )

                last_mode = state.current_mode
            elif user_requested_log and state.current_mode != last_mode:
                last_mode = state.current_mode

            # Monitor current log file
            if log_path.exists():
                try:
                    current_size = log_path.stat().st_size

                    # Handle log file truncation/rotation
                    if current_size < last_position:
                        last_position = 0
                        logger.info(f"Log file {log_path.name} was truncated")

                    if current_size > last_position:
                        with open(
                            log_path, "r", encoding="utf-8", errors="ignore"
                        ) as f:
                            f.seek(last_position)
                            new_lines = f.readlines()

                            for line in new_lines:
                                stripped = line.strip()
                                if stripped:
                                    await websocket.send_json(
                                        {"type": "log", "content": stripped}
                                    )

                        last_position = current_size
                except OSError as e:
                    logger.warning(f"Error reading log file: {e}")
                    await asyncio.sleep(1)

    except WebSocketDisconnect as e:
        close_code = e.code if hasattr(e, "code") else None
        if close_code in [1000, 1001, 1005]:
            logger.info(f"WebSocket disconnected normally (code: {close_code})")
        else:
            logger.warning(f"WebSocket disconnected unexpectedly (code: {close_code})")

    except asyncio.CancelledError:
        logger.debug("WebSocket task cancelled during shutdown")

    except Exception as e:
        error_msg = str(e)
        if "1001" in error_msg or "1005" in error_msg or "going away" in error_msg:
            logger.info(f"WebSocket closed normally: {error_msg}")
        else:
            logger.error(f"WebSocket error: {e}")
            try:
                await websocket.send_json(
                    {"type": "error", "message": f"WebSocket error: {str(e)}"}
                )
            except:
                pass
    finally:
        logger.info(f"WebSocket connection closed for log: {log_file}")


# ============================================================================
# STATIC FILES
# ============================================================================

if ASSETS_DIR.exists():
    app.mount(
        "/poster_assets",
        CachedStaticFiles(directory=str(ASSETS_DIR), max_age=86400),
        name="poster_assets",
    )
    logger.info(f"Mounted /poster_assets -> {ASSETS_DIR}")

if MANUAL_ASSETS_DIR.exists():
    app.mount(
        "/manual_poster_assets",
        CachedStaticFiles(directory=str(MANUAL_ASSETS_DIR), max_age=86400),
        name="manual_poster_assets",
    )
    logger.info(f"Mounted /manual_poster_assets -> {MANUAL_ASSETS_DIR}")

if TEST_DIR.exists():
    app.mount(
        "/test",
        CachedStaticFiles(directory=str(TEST_DIR), max_age=86400),
        name="test",
    )
    logger.info(f"Mounted /test -> {TEST_DIR}")

if IMAGES_DIR.exists():
    app.mount(
        "/images",
        CachedStaticFiles(directory=str(IMAGES_DIR), max_age=86400),
        name="images",
    )
    logger.info(f"Mounted /images -> {IMAGES_DIR}")

if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
    logger.info(f"Mounted frontend from {FRONTEND_DIR}")


# SPA fallback
@app.exception_handler(404)
async def spa_fallback(request: Request, exc: HTTPException):
    """SPA support - return index.html for client-side routes"""
    if request.url.path.startswith(("/api/", "/ws/")):
        return exc

    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
