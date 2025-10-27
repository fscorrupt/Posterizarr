"""Routes package - API endpoint routers"""

import logging

logger = logging.getLogger(__name__)

# Import all routers
from .auth import router as auth_router
from .config import router as config_router
from .files import router as files_router
from .validation import router as validation_router
from .libraries import router as libraries_router
from .assets import router as assets_router
from .logs import router as logs_router
from .system import router as system_router
from .runtime import router as runtime_router
from .process import router as process_router
from .gallery import router as gallery_router
from .scheduler import router as scheduler_router
from .tmdb import router as tmdb_router
from .manual import router as manual_router
from .dashboard import router as dashboard_router
from .imagechoices import router as imagechoices_router

__all__ = [
    "auth_router",
    "config_router",
    "files_router",
    "validation_router",
    "libraries_router",
    "assets_router",
    "logs_router",
    "system_router",
    "runtime_router",
    "process_router",
    "gallery_router",
    "scheduler_router",
    "tmdb_router",
    "manual_router",
    "dashboard_router",
    "imagechoices_router",
]


def initialize_routers(
    config_path,
    base_dir,
    assets_dir,
    manual_assets_dir,
    logs_dir,
    ui_logs_dir,
    temp_dir,
    database_dir,
    overlayfiles_dir,
    uploads_dir,
    fontpreviews_dir,
    running_file,
    imagechoices_db_path,
    script_path,
    webui_settings_path,
    state_module,
):
    """Initialize all routers with required dependencies"""

    # Auth router
    import routes.auth as auth

    auth.AUTH_MIDDLEWARE_AVAILABLE = state_module.AUTH_MIDDLEWARE_AVAILABLE
    auth.CONFIG_PATH = config_path
    try:
        from auth_middleware import load_auth_config

        auth.load_auth_config = load_auth_config
    except ImportError:
        pass

    # Config router
    import routes.config as config_route

    config_route.CONFIG_PATH = config_path
    config_route.CONFIG_MAPPER_AVAILABLE = state_module.CONFIG_MAPPER_AVAILABLE
    config_route.CONFIG_DATABASE_AVAILABLE = state_module.CONFIG_DATABASE_AVAILABLE
    config_route.config_db = state_module.config_db

    # Import config_mapper functions if available
    if state_module.CONFIG_MAPPER_AVAILABLE:
        try:
            from config_mapper import (
                flatten_config,
                unflatten_config,
                get_display_name,
                UI_GROUPS,
            )
            from config_tooltips import CONFIG_TOOLTIPS

            config_route.flatten_config = flatten_config
            config_route.unflatten_config = unflatten_config
            config_route.get_display_name = get_display_name
            config_route.UI_GROUPS = UI_GROUPS
            config_route.CONFIG_TOOLTIPS = CONFIG_TOOLTIPS
        except ImportError:
            pass

    # Files router
    import routes.files as files_route

    files_route.OVERLAYFILES_DIR = overlayfiles_dir
    files_route.FONTPREVIEWS_DIR = fontpreviews_dir
    files_route.TEMP_DIR = temp_dir
    files_route.APP_DIR = base_dir  # APP_DIR is same as base_dir in context
    files_route.IS_DOCKER = (
        state_module.constants.IS_DOCKER
        if hasattr(state_module, "constants")
        else False
    )

    # Logs router
    import routes.logs as logs_route

    logs_route.setup_dependencies(
        logs_dir=logs_dir,
        ui_logs_dir=ui_logs_dir,
        current_mode_ref=getattr(state_module, "current_mode", None),
    )

    # Validation router (no dependencies)
    # Libraries router (no dependencies)

    # System router
    import routes.system as system_route

    system_route.setup_dependencies(
        is_docker=(
            state_module.constants.IS_DOCKER
            if hasattr(state_module, "constants")
            else False
        ),
        base_dir=base_dir,
        script_path=script_path,
        log_level_map=(
            state_module.LOG_LEVEL_MAP if hasattr(state_module, "LOG_LEVEL_MAP") else {}
        ),
        log_level=state_module.LOG_LEVEL if hasattr(state_module, "LOG_LEVEL") else 30,
        log_level_env=(
            state_module.LOG_LEVEL_ENV
            if hasattr(state_module, "LOG_LEVEL_ENV")
            else "WARNING"
        ),
        webui_settings_path=webui_settings_path,
    )

    # Process router
    import routes.process as process_route

    process_route.setup_dependencies(
        {
            "base_dir": base_dir,
            "script_path": script_path,
            "logs_dir": logs_dir,
            "config_path": config_path,
            "running_file": running_file,
            "scheduler_available": hasattr(state_module, "scheduler"),
            "scheduler": getattr(state_module, "scheduler", None),
            "scan_cache_func": getattr(state_module, "scan_and_cache_assets", None),
            "import_imagechoices_func": getattr(
                state_module, "import_imagechoices_to_db", None
            ),
            "runtime_db_available": getattr(
                state_module, "RUNTIME_DB_AVAILABLE", False
            ),
            "save_runtime_func": getattr(state_module, "save_runtime_to_db", None),
            "state": state_module,
        }
    )

    # Scheduler router
    import routes.scheduler as scheduler_route

    scheduler_route.setup_dependencies(state_module=state_module)

    # Runtime router
    import routes.runtime as runtime_route

    runtime_route.setup_dependencies(
        {
            "runtime_db_available": getattr(
                state_module, "RUNTIME_DB_AVAILABLE", False
            ),
            "runtime_db": getattr(state_module, "runtime_db", None),
            "scheduler_available": hasattr(state_module, "scheduler"),
            "scheduler": getattr(state_module, "scheduler", None),
            "base_dir": base_dir,
            "logs_dir": logs_dir,
            "parse_runtime_func": getattr(state_module, "parse_runtime_from_log", None),
        }
    )

    # Imagechoices router
    import routes.imagechoices as imagechoices_route

    imagechoices_route.setup_dependencies(
        {
            "state": state_module,
            "assets_dir": assets_dir,
            "logs_dir": logs_dir,
        }
    )

    # Gallery router
    import routes.gallery as gallery_route

    gallery_route.setup_dependencies(
        {
            "assets_dir": assets_dir,
            "manual_assets_dir": manual_assets_dir,
            "get_fresh_assets_func": getattr(state_module, "get_fresh_assets", None),
            "delete_db_entries_func": getattr(
                state_module, "delete_db_entries_for_asset", None
            ),
            "asset_cache": getattr(state_module, "asset_cache", {}),
            "state": state_module,
        }
    )

    # TMDB router
    import routes.tmdb as tmdb_route

    tmdb_route.setup_dependencies(
        {
            "config_path": config_path,
            "config_mapper_available": state_module.CONFIG_MAPPER_AVAILABLE,
            "flatten_config_func": (
                getattr(state_module, "flatten_config", None)
                if state_module.CONFIG_MAPPER_AVAILABLE
                else None
            ),
        }
    )

    # Manual router
    import routes.manual as manual_route

    manual_route.setup_dependencies(
        {
            "script_path": script_path,
            "base_dir": base_dir,
            "uploads_dir": uploads_dir,
            "config_path": config_path,
            "is_docker": (
                state_module.constants.IS_DOCKER
                if hasattr(state_module, "constants")
                else False
            ),
            "state": state_module,
        }
    )

    # Dashboard router
    import routes.dashboard as dashboard_route

    # Dashboard needs references to process and system router functions
    try:
        from routes.process import get_status
        from routes.system import get_version

        dashboard_route.setup_dependencies(
            scheduler_available=hasattr(state_module, "scheduler"),
            scheduler_instance=getattr(state_module, "scheduler", None),
            get_status=get_status,
            get_version=get_version,
        )
    except ImportError as e:
        logger.warning(f"Could not initialize dashboard router: {e}")

    # Assets router
    import routes.assets as assets_route

    assets_route.setup_dependencies(
        {
            "ASSETS_DIR": assets_dir,
            "MANUAL_ASSETS_DIR": manual_assets_dir,
            "TEST_DIR": (
                getattr(state_module.constants, "TEST_DIR", None)
                if hasattr(state_module, "constants")
                else None
            ),
            "CONFIG_PATH": config_path,
            "SCRIPT_PATH": script_path,
            "BASE_DIR": base_dir,
            "IS_DOCKER": (
                state_module.constants.IS_DOCKER
                if hasattr(state_module, "constants")
                else False
            ),
            "RUNNING_FILE": running_file,
            "CONFIG_MAPPER_AVAILABLE": state_module.CONFIG_MAPPER_AVAILABLE,
            "DATABASE_AVAILABLE": getattr(state_module, "DATABASE_AVAILABLE", False),
            "db": getattr(state_module, "db", None),
            "asset_cache": getattr(state_module, "asset_cache", {}),
            "cache_refresh_task": getattr(state_module, "cache_refresh_task", None),
            "cache_refresh_running": getattr(
                state_module, "cache_refresh_running", False
            ),
            "cache_scan_in_progress": getattr(
                state_module, "cache_scan_in_progress", False
            ),
            "CACHE_TTL_SECONDS": getattr(state_module, "CACHE_TTL_SECONDS", 0),
            "CACHE_REFRESH_INTERVAL": getattr(
                state_module, "CACHE_REFRESH_INTERVAL", 0
            ),
            "scan_and_cache_assets": getattr(
                state_module, "scan_and_cache_assets", None
            ),
            "flatten_config": (
                getattr(state_module, "flatten_config", None)
                if state_module.CONFIG_MAPPER_AVAILABLE
                else None
            ),
            "state_module": state_module,
            "logger": getattr(state_module, "logger", None),
        }
    )

    # ... other routers will be done later
