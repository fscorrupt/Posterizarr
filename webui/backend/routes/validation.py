"""
Validation Router
============================================================

Service validation endpoints (Plex, TMDB, etc.)

Endpunkte:
- POST /api/validate/plex
- POST /api/validate/jellyfin
- POST /api/validate/emby
- POST /api/validate/tmdb
- POST /api/validate/tvdb
- POST /api/validate/fanart
- POST /api/validate/discord
- POST /api/validate/apprise
- POST /api/validate/uptimekuma
"""

from fastapi import APIRouter
import logging
import httpx
import xml.etree.ElementTree as ET

from models.request_models import (
    PlexValidationRequest,
    JellyfinValidationRequest,
    EmbyValidationRequest,
    TMDBValidationRequest,
    TVDBValidationRequest,
    FanartValidationRequest,
    DiscordValidationRequest,
    AppriseValidationRequest,
    UptimeKumaValidationRequest,
)

router = APIRouter(prefix="/api/validate", tags=["validation"])
logger = logging.getLogger(__name__)


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.post("/plex")
async def validate_plex(request: PlexValidationRequest):
    """Validate Plex connection"""
    logger.info("=" * 60)
    logger.info("PLEX VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")
    logger.info(
        f"[KEY] Token: {request.token[:10]}...{request.token[-4:] if len(request.token) > 14 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/library/sections/?X-Plex-Token={request.token}"
            logger.info(f"[REQUEST] Sending request to Plex API...")

            response = await client.get(url)
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                root = ET.fromstring(response.content)
                lib_count = int(root.get("size", 0))
                server_name = root.get("friendlyName", "Unknown")

                logger.info(f"Plex validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Libraries: {lib_count}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f"Plex connection successful! Found {lib_count} libraries.",
                    "details": {"library_count": lib_count, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"Plex validation failed: Invalid token (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Invalid Plex token. Please check your token.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(f"Plex validation failed: Status {response.status_code}")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Plex connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"Plex validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": "Connection timeout. Check if Plex URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"Plex validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error connecting to Plex: {str(e)}",
            "details": {"error": str(e)},
        }


@router.post("/jellyfin")
async def validate_jellyfin(request: JellyfinValidationRequest):
    """Validate Jellyfin connection"""
    logger.info("=" * 60)
    logger.info("JELLYFIN VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/System/Info?api_key={request.api_key}"
            logger.info(f"[REQUEST] Sending request to Jellyfin API...")

            response = await client.get(url)
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                version = data.get("Version", "Unknown")
                server_name = data.get("ServerName", "Unknown")

                logger.info(f"Jellyfin validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Version: {version}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f"Jellyfin connection successful! Version: {version}",
                    "details": {"version": version, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"Jellyfin validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Invalid Jellyfin API key. Please check your API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"Jellyfin validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Jellyfin connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"Jellyfin validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": "Connection timeout. Check if Jellyfin URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"Jellyfin validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error connecting to Jellyfin: {str(e)}",
            "details": {"error": str(e)},
        }


@router.post("/emby")
async def validate_emby(request: EmbyValidationRequest):
    """Validate Emby connection"""
    logger.info("=" * 60)
    logger.info("EMBY VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = f"{request.url}/System/Info?api_key={request.api_key}"
            logger.info(f"[REQUEST] Sending request to Emby API...")

            response = await client.get(url)
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                version = data.get("Version", "Unknown")
                server_name = data.get("ServerName", "Unknown")

                logger.info(f"Emby validation successful!")
                logger.info(f"   Server: {server_name}")
                logger.info(f"   Version: {version}")
                logger.info("=" * 60)

                return {
                    "valid": True,
                    "message": f"Emby connection successful! Version: {version}",
                    "details": {"version": version, "server_name": server_name},
                }
            elif response.status_code == 401:
                logger.warning(f"Emby validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Invalid Emby API key. Please check your API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(f"Emby validation failed: Status {response.status_code}")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Emby connection failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except httpx.TimeoutException:
        logger.error(f"Emby validation timeout - URL unreachable")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": "Connection timeout. Check if Emby URL is correct and server is reachable.",
            "details": {"error": "timeout"},
        }
    except Exception as e:
        logger.error(f"Emby validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error connecting to Emby: {str(e)}",
            "details": {"error": str(e)},
        }


@router.post("/tmdb")
async def validate_tmdb(request: TMDBValidationRequest):
    """Validate TMDB API token"""
    logger.info("=" * 60)
    logger.info("TMDB VALIDATION STARTED")
    logger.info(
        f"[KEY] Token: {request.token[:15]}...{request.token[-8:] if len(request.token) > 23 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {
                "Authorization": f"Bearer {request.token}",
                "Content-Type": "application/json",
            }
            logger.info(f"[REQUEST] Sending request to TMDB API...")

            response = await client.get(
                "https://api.themoviedb.org/3/configuration", headers=headers
            )
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                logger.info(f"TMDB validation successful!")
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": "TMDB API token is valid!",
                    "details": {"status_code": 200},
                }
            elif response.status_code == 401:
                logger.warning(f"TMDB validation failed: Invalid token (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Invalid TMDB token. Please check your Read Access Token.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(f"TMDB validation failed: Status {response.status_code}")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"TMDB validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"TMDB validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error validating TMDB token: {str(e)}",
            "details": {"error": str(e)},
        }


@router.post("/tvdb")
async def validate_tvdb(request: TVDBValidationRequest):
    """Validate TVDB API key - with login flow"""
    logger.info("=" * 60)
    logger.info("TVDB VALIDATION STARTED")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )
    if request.pin:
        logger.info(f"PIN provided: {request.pin}")

    max_retries = 6
    retry_count = 0
    success = False

    while not success and retry_count < max_retries:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                login_url = "https://api4.thetvdb.com/v4/login"

                # Request body with or without PIN
                if request.pin:
                    body = {"apikey": request.api_key, "pin": request.pin}
                    logger.info(
                        f"[REQUEST] Attempting TVDB login with API Key + PIN (Attempt {retry_count + 1}/{max_retries})..."
                    )
                else:
                    body = {"apikey": request.api_key}
                    logger.info(
                        f"[REQUEST] Attempting TVDB login with API Key only (Attempt {retry_count + 1}/{max_retries})..."
                    )

                headers = {
                    "accept": "application/json",
                    "Content-Type": "application/json",
                }

                login_response = await client.post(
                    login_url, json=body, headers=headers
                )

                logger.info(
                    f"Login response received - Status: {login_response.status_code}"
                )

                if login_response.status_code == 200:
                    data = login_response.json()
                    token = data.get("data", {}).get("token")

                    if token:
                        logger.info(f"TVDB validation successful!")
                        logger.info("=" * 60)
                        return {
                            "valid": True,
                            "message": "TVDB API key is valid!",
                            "details": {"status_code": 200},
                        }
                    else:
                        logger.warning("TVDB login succeeded but no token received")
                        retry_count += 1
                        continue

                elif login_response.status_code == 401:
                    logger.warning(f"TVDB validation failed: Invalid API key (401)")
                    logger.info("=" * 60)
                    return {
                        "valid": False,
                        "message": "Invalid TVDB API key or PIN. Please check your credentials.",
                        "details": {"status_code": 401},
                    }
                else:
                    logger.warning(
                        f"TVDB validation failed: Status {login_response.status_code}"
                    )
                    retry_count += 1
                    if retry_count >= max_retries:
                        logger.info("=" * 60)
                        return {
                            "valid": False,
                            "message": f"TVDB validation failed after {max_retries} attempts (Status: {login_response.status_code})",
                            "details": {"status_code": login_response.status_code},
                        }

        except Exception as e:
            logger.error(f"TVDB validation error: {str(e)}")
            retry_count += 1
            if retry_count >= max_retries:
                logger.exception("Full traceback:")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Error validating TVDB API key after {max_retries} attempts: {str(e)}",
                    "details": {"error": str(e)},
                }

    logger.info("=" * 60)
    return {
        "valid": False,
        "message": "TVDB validation failed after maximum retries",
        "details": {"retries": max_retries},
    }


@router.post("/fanart")
async def validate_fanart(request: FanartValidationRequest):
    """Validate Fanart.tv API key"""
    logger.info("=" * 60)
    logger.info("FANART.TV VALIDATION STARTED")
    logger.info(
        f"[KEY] API Key: {request.api_key[:8]}...{request.api_key[-4:] if len(request.api_key) > 12 else ''}"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            test_url = (
                f"https://webservice.fanart.tv/v3/movies/603?api_key={request.api_key}"
            )
            logger.info(
                f"[REQUEST] Sending test request to Fanart.tv API (Movie ID: 603 - The Matrix)..."
            )

            response = await client.get(test_url)
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                logger.info(f"Fanart.tv validation successful!")
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": "Fanart.tv API key is valid!",
                    "details": {"status_code": 200},
                }
            elif response.status_code == 401:
                logger.warning(f"Fanart.tv validation failed: Invalid API key (401)")
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Invalid Fanart.tv API key. Please check your Personal API key.",
                    "details": {"status_code": 401},
                }
            else:
                logger.warning(
                    f"Fanart.tv validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Fanart.tv validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"Fanart.tv validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error validating Fanart.tv key: {str(e)}",
            "details": {"error": str(e)},
        }


@router.post("/discord")
async def validate_discord(request: DiscordValidationRequest):
    """Validate Discord webhook"""
    logger.info("=" * 60)
    logger.info("DISCORD WEBHOOK VALIDATION STARTED")
    logger.info(f"[URL] Webhook URL: {request.webhook_url[:50]}...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "content": "[SUCCESS] Posterizarr WebUI - Discord webhook validation successful!",
                "username": "Posterizarr",
            }
            logger.info(f"[REQUEST] Sending test message to Discord webhook...")

            response = await client.post(request.webhook_url, json=payload)
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 204:
                logger.info(
                    f"Discord webhook validation successful! Test message sent."
                )
                logger.info("=" * 60)
                return {
                    "valid": True,
                    "message": "Discord webhook is valid! Test message sent.",
                    "details": {"status_code": 204},
                }
            elif response.status_code == 404:
                logger.warning(
                    f"Discord webhook validation failed: Webhook not found (404)"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": "Discord webhook not found. Please check your webhook URL.",
                    "details": {"status_code": 404},
                }
            else:
                logger.warning(
                    f"Discord webhook validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Discord webhook validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"Discord webhook validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error validating Discord webhook: {str(e)}",
            "details": {"error": str(e)},
        }


@router.post("/apprise")
async def validate_apprise(request: AppriseValidationRequest):
    """Validate Apprise URL (basic format check)"""
    logger.info("=" * 60)
    logger.info("APPRISE URL VALIDATION STARTED")
    logger.info(f"[URL] URL: {request.url}")

    try:
        valid_prefixes = [
            "discord://",
            "telegram://",
            "slack://",
            "email://",
            "mailto://",
            "pushover://",
            "gotify://",
            "ntfy://",
            "pushbullet://",
            "rocket://",
            "mattermost://",
        ]

        is_valid = any(request.url.startswith(prefix) for prefix in valid_prefixes)

        if is_valid:
            detected_service = next(
                (prefix for prefix in valid_prefixes if request.url.startswith(prefix)),
                None,
            )
            logger.info(
                f"Apprise URL format valid! Detected service: {detected_service}"
            )
            logger.info("=" * 60)
            return {
                "valid": True,
                "message": "Apprise URL format looks valid!",
                "details": {"format_check": True, "service": detected_service},
            }
        else:
            logger.warning(f"Apprise URL format invalid!")
            logger.warning(
                f"   URL must start with: {', '.join(valid_prefixes[:5])}..."
            )
            logger.info("=" * 60)
            return {
                "valid": False,
                "message": f"Invalid Apprise URL format. Must start with a valid service prefix (discord://, telegram://, etc.)",
                "details": {"format_check": False},
            }
    except Exception as e:
        logger.error(f"Apprise URL validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error validating Apprise URL: {str(e)}",
            "details": {"error": str(e)},
        }


@router.post("/uptimekuma")
async def validate_uptimekuma(request: UptimeKumaValidationRequest):
    """Validate Uptime Kuma push URL"""
    logger.info("=" * 60)
    logger.info("UPTIME KUMA VALIDATION STARTED")
    logger.info(f"[URL] Push URL: {request.url[:50]}...")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            logger.info(f"[REQUEST] Sending test push to Uptime Kuma...")

            response = await client.get(
                request.url,
                params={
                    "status": "up",
                    "msg": "Posterizarr WebUI validation test",
                    "ping": "",
                },
            )
            logger.info(f"Response received - Status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()
                logger.info(f"   Response data: {data}")

                if data.get("ok"):
                    logger.info(f"Uptime Kuma validation successful! Test ping sent.")
                    logger.info("=" * 60)
                    return {
                        "valid": True,
                        "message": "Uptime Kuma push URL is valid!",
                        "details": {"status_code": 200},
                    }
                else:
                    logger.warning(f"Uptime Kuma responded but 'ok' was false")
                    logger.info("=" * 60)
                    return {
                        "valid": False,
                        "message": "Uptime Kuma responded but validation failed.",
                        "details": {"response": data},
                    }
            else:
                logger.warning(
                    f"Uptime Kuma validation failed: Status {response.status_code}"
                )
                logger.info("=" * 60)
                return {
                    "valid": False,
                    "message": f"Uptime Kuma validation failed (Status: {response.status_code})",
                    "details": {"status_code": response.status_code},
                }
    except Exception as e:
        logger.error(f"Uptime Kuma validation error: {str(e)}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        return {
            "valid": False,
            "message": f"Error validating Uptime Kuma URL: {str(e)}",
            "details": {"error": str(e)},
        }
