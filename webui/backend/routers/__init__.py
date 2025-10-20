"""
Router modules for Posterizarr Backend
Handles API endpoints organized by feature area
"""
from .config import router as config_router
from .assets import router as assets_router
from .validation import router as validation_router
from .runtime import router as runtime_router
from .execution import router as execution_router
from .logs import router as logs_router
from .gallery import router as gallery_router
from .scheduler import router as scheduler_router
from .system import router as system_router

__all__ = [
    "config_router",
    "assets_router",
    "validation_router",
    "runtime_router",
    "execution_router",
    "logs_router",
    "gallery_router",
    "scheduler_router",
    "system_router",
]
