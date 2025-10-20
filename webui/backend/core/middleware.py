"""
Middleware classes for Posterizarr Backend
Includes: SPA fallback middleware, cached static files
"""
import os
import logging
from pathlib import Path
from fastapi import Request, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


class SPAMiddleware(BaseHTTPMiddleware):
    """
    Middleware to serve Single Page Application (SPA) routes.
    Falls back to index.html for client-side routing when file doesn't exist.

    This enables React Router / Vue Router / Angular Router to handle routes
    without requiring server-side route configuration.

    Example:
        - /dashboard -> serves index.html (React handles routing)
        - /api/config -> handled by FastAPI (passes through)
        - /assets/logo.png -> served as static file
        - /unknown-spa-route -> serves index.html (React handles 404)
    """

    def __init__(
        self, app: ASGIApp, static_dir: Path, index_file: str = "index.html"
    ):
        super().__init__(app)
        self.static_dir = static_dir
        self.index_file = index_file
        self.index_path = static_dir / index_file

    async def dispatch(self, request: Request, call_next):
        """
        Intercept requests and fall back to index.html for SPA routes.

        Logic:
        1. Let FastAPI handle API routes (/api/*)
        2. Serve static files if they exist
        3. Fall back to index.html for client-side routing
        """
        # Pass through API routes
        if request.url.path.startswith("/api"):
            return await call_next(request)

        # Pass through WebSocket routes
        if request.url.path.startswith("/ws"):
            return await call_next(request)

        # Try to serve the requested file
        response = await call_next(request)

        # If file not found (404) and not an API route, serve index.html
        if response.status_code == 404:
            # Check if request is for a file (has extension)
            # Files like /assets/logo.png should 404 normally
            # Routes like /dashboard should fallback to index.html
            path = request.url.path
            has_extension = "." in path.split("/")[-1]

            if not has_extension:
                # SPA route - serve index.html
                try:
                    with open(self.index_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    return Response(content=content, media_type="text/html")
                except Exception as e:
                    logger.error(f"Error serving index.html: {e}")

        return response


class CachedStaticFiles(StaticFiles):
    """
    Extended StaticFiles class that adds aggressive caching headers.

    Adds Cache-Control headers to static assets:
    - Versioned files (with hash): max-age=31536000 (1 year), immutable
    - Other files: max-age=3600 (1 hour)

    This improves performance by allowing browsers to cache static assets.

    Example:
        app.mount("/assets", CachedStaticFiles(directory="dist/assets"), name="assets")
    """

    def __init__(self, *, directory: Path, **kwargs):
        # Convert Path to string for StaticFiles
        super().__init__(directory=str(directory), **kwargs)
        self._directory_path = directory

    def file_response(
        self,
        full_path,
        stat_result,
        scope,
        status_code=200,
    ):
        """
        Override file_response to add caching headers.
        """
        response = super().file_response(full_path, stat_result, scope, status_code)

        # Get filename
        filename = os.path.basename(full_path)

        # Check if file is versioned (contains hash)
        # Vite/Webpack typically generate files like: main.abc123.js
        has_hash = any(
            char.isdigit() and char.isalpha()
            for char in filename
            if filename.count(".") > 1
        )

        # Set aggressive caching for versioned files
        if has_hash or filename.endswith((".woff", ".woff2", ".ttf", ".eot")):
            # 1 year cache for immutable files
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            # 1 hour cache for other files
            response.headers["Cache-Control"] = "public, max-age=3600"

        return response


class CORSHeaderMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add CORS headers for development.
    Should be replaced by FastAPI's CORSMiddleware in production.

    Example:
        app.add_middleware(
            CORSHeaderMiddleware,
            allow_origins=["http://localhost:3000"],
            allow_credentials=True,
        )
    """

    def __init__(
        self,
        app: ASGIApp,
        allow_origins: list = None,
        allow_methods: list = None,
        allow_headers: list = None,
        allow_credentials: bool = False,
    ):
        super().__init__(app)
        self.allow_origins = allow_origins or ["*"]
        self.allow_methods = allow_methods or [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS",
        ]
        self.allow_headers = allow_headers or ["*"]
        self.allow_credentials = allow_credentials

    async def dispatch(self, request: Request, call_next):
        # Handle preflight OPTIONS request
        if request.method == "OPTIONS":
            response = Response()
            response.headers["Access-Control-Allow-Origin"] = ", ".join(
                self.allow_origins
            )
            response.headers["Access-Control-Allow-Methods"] = ", ".join(
                self.allow_methods
            )
            response.headers["Access-Control-Allow-Headers"] = ", ".join(
                self.allow_headers
            )
            if self.allow_credentials:
                response.headers["Access-Control-Allow-Credentials"] = "true"
            return response

        # Process request
        response = await call_next(request)

        # Add CORS headers to response
        response.headers["Access-Control-Allow-Origin"] = ", ".join(self.allow_origins)
        if self.allow_credentials:
            response.headers["Access-Control-Allow-Credentials"] = "true"

        return response
