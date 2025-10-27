"""
System Router
============================================================

System information and settings

Endpunkte:
- GET /api/system-info
- GET /api/webui-settings
- POST /api/webui-settings
- GET /api/version
- GET /api/version-ui
- GET /api/releases
"""

from fastapi import APIRouter, HTTPException
from pathlib import Path
import logging
import platform
import os
import subprocess
import sys
import re
import httpx
from datetime import datetime

router = APIRouter(tags=["system"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
IS_DOCKER = False
BASE_DIR = None
SCRIPT_PATH = None
LOG_LEVEL_MAP = None
LOG_LEVEL = None
LOG_LEVEL_ENV = None
WEBUI_SETTINGS_PATH = None


def setup_dependencies(
    is_docker: bool,
    base_dir: Path,
    script_path: Path,
    log_level_map: dict,
    log_level: int,
    log_level_env: str,
    webui_settings_path: Path,
):
    """Initialize system router dependencies"""
    global IS_DOCKER, BASE_DIR, SCRIPT_PATH, LOG_LEVEL_MAP, LOG_LEVEL, LOG_LEVEL_ENV, WEBUI_SETTINGS_PATH
    IS_DOCKER = is_docker
    BASE_DIR = base_dir
    SCRIPT_PATH = script_path
    LOG_LEVEL_MAP = log_level_map
    LOG_LEVEL = log_level
    LOG_LEVEL_ENV = log_level_env
    WEBUI_SETTINGS_PATH = webui_settings_path


def load_webui_settings():
    """Load WebUI settings from JSON file"""
    import json

    default_settings = {
        "log_level": "WARNING",
        "theme": "dark",
        "auto_refresh_interval": 180,
    }

    try:
        if WEBUI_SETTINGS_PATH.exists():
            with open(WEBUI_SETTINGS_PATH, "r", encoding="utf-8") as f:
                settings = json.load(f)
                return {**default_settings, **settings}
    except Exception as e:
        pass  # Silent - no console output

    return default_settings


def save_webui_settings(settings: dict):
    """Save WebUI settings to JSON file"""
    import json

    try:
        with open(WEBUI_SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        pass  # Silent - no console output
        return False


def save_log_level_config(level_name: str):
    """Save log level to old log_config.json for backward compatibility"""
    import json
    from pathlib import Path

    try:
        log_config_path = Path(__file__).parent.parent / "log_config.json"
        with open(log_config_path, "w", encoding="utf-8") as f:
            json.dump({"log_level": level_name}, f, indent=2)
    except Exception:
        pass  # Silent


def parse_version(version_str: str) -> tuple:
    """
    Parse a semantic version string into a tuple of integers for comparison.
    Handles versions like "1.9.97", "2.0.0", "1.10.5", etc.

    Returns tuple of (major, minor, patch) or None if parsing fails
    """
    if not version_str:
        return None

    try:
        # Remove 'v' prefix if present
        version_str = version_str.strip().lstrip("v")

        # Split by '.' and convert to integers
        parts = version_str.split(".")

        # Pad with zeros if necessary (e.g., "2.0" becomes "2.0.0")
        while len(parts) < 3:
            parts.append("0")

        # Convert to integers
        major = int(parts[0])
        minor = int(parts[1])
        patch = int(parts[2])

        return (major, minor, patch)
    except (ValueError, IndexError) as e:
        logger.error(f"Failed to parse version '{version_str}': {e}")
        return None


def is_version_newer(current: str, remote: str) -> bool:
    """
    Compare two semantic versions.
    Returns True if remote version is newer than current version.

    Examples:
        is_version_newer("2.0.0", "1.9.97") -> False (2.0.0 is newer)
        is_version_newer("1.9.97", "2.0.0") -> True (2.0.0 is newer)
        is_version_newer("1.9.5", "1.9.97") -> True (1.9.97 is newer)
    """
    current_parsed = parse_version(current)
    remote_parsed = parse_version(remote)

    # If we can't parse either version, fall back to string comparison
    if current_parsed is None or remote_parsed is None:
        logger.warning(
            f"Version parsing failed, using string comparison: {current} vs {remote}"
        )
        return current != remote

    # Compare tuples (Python does lexicographic comparison)
    # (2, 0, 0) > (1, 9, 97) returns True
    is_newer = remote_parsed > current_parsed

    logger.info(
        f"Version comparison: {current} {current_parsed} vs {remote} {remote_parsed} -> newer: {is_newer}"
    )

    return is_newer


async def fetch_version(local_filename: str, github_url: str, version_type: str):
    """
    A reusable function to get a local version from a file and fetch the remote
    version from GitHub when running in a Docker environment.
    """
    local_version = None
    remote_version = None

    # Get Local Version
    try:
        version_file = BASE_DIR / local_filename
        if version_file.exists():
            local_version = version_file.read_text().strip()
    except Exception as e:
        logger.error(f"Error reading local {version_type} version file: {e}")

    # Get Remote Version (if in Docker)
    if IS_DOCKER:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(github_url, timeout=10.0)
                response.raise_for_status()
                remote_version = response.text.strip()
                logger.info(
                    f"Successfully fetched remote {version_type} version: {remote_version}"
                )
        except httpx.RequestError as e:
            logger.warning(
                f"Could not fetch remote {version_type} version from GitHub: {e}"
            )
        except Exception as e:
            logger.error(
                f"An unexpected error occurred while fetching remote {version_type} version: {e}"
            )

    # Check if local version is greater than remote (development version)
    display_version = local_version
    if local_version and remote_version:
        local_parsed = parse_version(local_version)
        remote_parsed = parse_version(remote_version)

        if local_parsed and remote_parsed and local_parsed > remote_parsed:
            # Local version is ahead of GitHub - add -dev suffix
            display_version = f"{local_version}-dev"
            logger.info(
                f"Local {version_type} version {local_version} is ahead of remote {remote_version}, adding -dev suffix"
            )

    return {"local": display_version, "remote": remote_version}


async def get_script_version():
    """
    Reads the version from Posterizarr.ps1 and compares with GitHub Release.txt
    Similar to the PowerShell CompareScriptVersion function

    NOW WITH SEMANTIC VERSION COMPARISON!
    """
    local_version = None
    remote_version = None

    # Get Local Version from Posterizarr.ps1
    try:
        # Use the already defined SCRIPT_PATH
        posterizarr_path = SCRIPT_PATH

        logger.info(f"Looking for Posterizarr.ps1 at: {posterizarr_path}")

        if posterizarr_path.exists():
            with open(posterizarr_path, "r", encoding="utf-8") as f:
                content = f.read()

            # Extract version using regex: $CurrentScriptVersion = "1.9.95"
            match = re.search(r'\$CurrentScriptVersion\s*=\s*"([^"]+)"', content)
            if match:
                local_version = match.group(1)
                logger.info(
                    f"Local script version from Posterizarr.ps1: {local_version}"
                )
            else:
                logger.warning(
                    "Could not find $CurrentScriptVersion in Posterizarr.ps1"
                )
        else:
            logger.error(f"Posterizarr.ps1 not found at {posterizarr_path}")
    except Exception as e:
        logger.error(f"Error reading version from Posterizarr.ps1: {e}")

    # Get Remote Version from GitHub Release.txt
    # Always fetch from GitHub (both Docker and local)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://raw.githubusercontent.com/fscorrupt/Posterizarr/refs/heads/main/Release.txt",
                timeout=10.0,
            )
            response.raise_for_status()
            remote_version = response.text.strip()
            logger.info(f"Remote version from GitHub Release.txt: {remote_version}")
    except httpx.RequestError as e:
        logger.warning(f"Could not fetch remote version from GitHub: {e}")
    except Exception as e:
        logger.error(f"Error fetching remote version: {e}")

    # SEMANTIC VERSION COMPARISON
    is_update_available = False
    display_version = local_version

    if local_version and remote_version:
        is_update_available = is_version_newer(local_version, remote_version)

        # Check if local version is GREATER than remote (development version)
        local_parsed = parse_version(local_version)
        remote_parsed = parse_version(remote_version)

        if local_parsed and remote_parsed and local_parsed > remote_parsed:
            # Local version is ahead of GitHub - add -dev suffix
            display_version = f"{local_version}-dev"
            logger.info(
                f"Local version {local_version} is ahead of remote {remote_version}, adding -dev suffix"
            )

        logger.info(
            f"Update available: {is_update_available} (local: {local_version}, remote: {remote_version})"
        )

    return {
        "local": display_version,
        "remote": remote_version,
        "is_update_available": is_update_available,  # Boolean for update availability
    }


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.get("/api/system-info")
async def get_system_info():
    """Get system information (CPU, RAM, OS, Platform) - Windows Optimized"""
    system_info = {
        "platform": platform.system(),
        "os_version": "Unknown",
        "cpu_model": "Unknown",
        "cpu_cores": 0,
        "total_memory": "Unknown",
        "used_memory": "Unknown",
        "free_memory": "Unknown",
        "memory_percent": 0,
    }

    try:
        # Get OS Version
        try:
            if platform.system() == "Linux":
                if Path("/etc/os-release").exists():
                    with open("/etc/os-release", "r") as f:
                        for line in f:
                            if line.startswith("PRETTY_NAME="):
                                system_info["os_version"] = (
                                    line.split("=")[1].strip().strip('"')
                                )
                                break

            elif platform.system() == "Windows":
                # Method 1: Try ctypes (most reliable)
                try:
                    import ctypes

                    class OSVERSIONINFOEXW(ctypes.Structure):
                        _fields_ = [
                            ("dwOSVersionInfoSize", ctypes.c_ulong),
                            ("dwMajorVersion", ctypes.c_ulong),
                            ("dwMinorVersion", ctypes.c_ulong),
                            ("dwBuildNumber", ctypes.c_ulong),
                            ("dwPlatformId", ctypes.c_ulong),
                            ("szCSDVersion", ctypes.c_wchar * 128),
                        ]

                    os_version = OSVERSIONINFOEXW()
                    os_version.dwOSVersionInfoSize = ctypes.sizeof(os_version)
                    retcode = ctypes.windll.Ntdll.RtlGetVersion(
                        ctypes.byref(os_version)
                    )
                    if retcode == 0:
                        system_info["os_version"] = (
                            f"Windows {os_version.dwMajorVersion}.{os_version.dwMinorVersion} Build {os_version.dwBuildNumber}"
                        )
                except Exception as e:
                    logger.debug(f"ctypes method failed: {e}")
                    # Method 2: Try platform
                    try:
                        system_info["os_version"] = (
                            f"{platform.system()} {platform.release()} {platform.version()}"
                        )
                    except Exception:
                        system_info["os_version"] = (
                            f"{platform.system()} {platform.release()}"
                        )

            elif platform.system() == "Darwin":
                system_info["os_version"] = f"macOS {platform.mac_ver()[0]}"
        except Exception as e:
            logger.error(f"Error getting OS version: {e}")
            system_info["os_version"] = f"{platform.system()} {platform.release()}"

        # Get CPU Model - Multiple Methods for Windows
        try:
            if platform.system() == "Linux":
                with open("/proc/cpuinfo", "r") as f:
                    for line in f:
                        if "model name" in line:
                            system_info["cpu_model"] = line.split(":")[1].strip()
                            break

            elif platform.system() == "Windows":
                cpu_found = False

                # Method 1: Try wmic (old but reliable)
                try:
                    result = subprocess.run(
                        ["wmic", "cpu", "get", "name"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        creationflags=(
                            subprocess.CREATE_NO_WINDOW
                            if hasattr(subprocess, "CREATE_NO_WINDOW")
                            else 0
                        ),
                    )
                    lines = result.stdout.strip().split("\n")
                    if len(lines) > 1 and lines[1].strip():
                        system_info["cpu_model"] = lines[1].strip()
                        cpu_found = True
                except Exception as e:
                    logger.debug(f"wmic method failed: {e}")

                # Method 2: Try PowerShell (modern Windows)
                if not cpu_found:
                    try:
                        result = subprocess.run(
                            [
                                "powershell",
                                "-Command",
                                "Get-CimInstance -ClassName Win32_Processor | Select-Object -ExpandProperty Name",
                            ],
                            capture_output=True,
                            text=True,
                            timeout=5,
                            creationflags=(
                                subprocess.CREATE_NO_WINDOW
                                if hasattr(subprocess, "CREATE_NO_WINDOW")
                                else 0
                            ),
                        )
                        cpu_name = result.stdout.strip()
                        if cpu_name:
                            system_info["cpu_model"] = cpu_name
                            cpu_found = True
                    except Exception as e:
                        logger.debug(f"PowerShell method failed: {e}")

                # Method 3: Try platform.processor() (fallback)
                if not cpu_found:
                    try:
                        cpu_name = platform.processor()
                        if cpu_name:
                            system_info["cpu_model"] = cpu_name
                            cpu_found = True
                    except Exception as e:
                        logger.debug(f"platform.processor failed: {e}")

                # Method 4: Try registry (last resort)
                if not cpu_found:
                    try:
                        import winreg

                        key = winreg.OpenKey(
                            winreg.HKEY_LOCAL_MACHINE,
                            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
                        )
                        cpu_name = winreg.QueryValueEx(key, "ProcessorNameString")[0]
                        winreg.CloseKey(key)
                        if cpu_name:
                            system_info["cpu_model"] = cpu_name.strip()
                    except Exception as e:
                        logger.debug(f"Registry method failed: {e}")

            elif platform.system() == "Darwin":
                result = subprocess.run(
                    ["sysctl", "-n", "machdep.cpu.brand_string"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                system_info["cpu_model"] = result.stdout.strip()
        except Exception as e:
            logger.error(f"Error getting CPU model: {e}")

        # Get CPU Cores
        try:
            system_info["cpu_cores"] = os.cpu_count() or 0
        except Exception as e:
            logger.error(f"Error getting CPU cores: {e}")

        # Get Memory Information - Multiple Methods
        try:
            if platform.system() == "Linux":
                with open("/proc/meminfo", "r") as f:
                    meminfo = f.readlines()
                    mem_total = 0
                    mem_available = 0
                    for line in meminfo:
                        if "MemTotal:" in line:
                            mem_total = int(line.split()[1])
                        elif "MemAvailable:" in line:
                            mem_available = int(line.split()[1])

                    if mem_total > 0:
                        mem_total_mb = mem_total // 1024
                        mem_available_mb = mem_available // 1024
                        mem_used_mb = mem_total_mb - mem_available_mb

                        system_info["total_memory"] = f"{mem_total_mb} MB"
                        system_info["used_memory"] = f"{mem_used_mb} MB"
                        system_info["free_memory"] = f"{mem_available_mb} MB"
                        system_info["memory_percent"] = round(
                            (mem_used_mb / mem_total_mb) * 100, 1
                        )

            elif platform.system() == "Windows":
                mem_found = False

                # Method 1: Try wmic
                try:
                    result = subprocess.run(
                        [
                            "wmic",
                            "OS",
                            "get",
                            "TotalVisibleMemorySize,FreePhysicalMemory",
                            "/VALUE",
                        ],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        creationflags=(
                            subprocess.CREATE_NO_WINDOW
                            if hasattr(subprocess, "CREATE_NO_WINDOW")
                            else 0
                        ),
                    )

                    total_kb = 0
                    free_kb = 0
                    for line in result.stdout.split("\n"):
                        if "TotalVisibleMemorySize=" in line:
                            total_kb = int(line.split("=")[1].strip())
                        elif "FreePhysicalMemory=" in line:
                            free_kb = int(line.split("=")[1].strip())

                    if total_kb > 0:
                        used_kb = total_kb - free_kb
                        total_mb = total_kb // 1024
                        used_mb = used_kb // 1024
                        free_mb = free_kb // 1024

                        system_info["total_memory"] = f"{total_mb} MB"
                        system_info["used_memory"] = f"{used_mb} MB"
                        system_info["free_memory"] = f"{free_mb} MB"
                        system_info["memory_percent"] = round(
                            (used_mb / total_mb) * 100, 1
                        )
                        mem_found = True
                except Exception as e:
                    logger.debug(f"wmic memory method failed: {e}")

                # Method 2: Try PowerShell (modern Windows)
                if not mem_found:
                    try:
                        ps_script = """
                        $os = Get-CimInstance Win32_OperatingSystem
                        $total = [math]::Round($os.TotalVisibleMemorySize / 1024)
                        $free = [math]::Round($os.FreePhysicalMemory / 1024)
                        $used = $total - $free
                        Write-Output "$total|$used|$free"
                        """
                        result = subprocess.run(
                            ["powershell", "-Command", ps_script],
                            capture_output=True,
                            text=True,
                            timeout=5,
                            creationflags=(
                                subprocess.CREATE_NO_WINDOW
                                if hasattr(subprocess, "CREATE_NO_WINDOW")
                                else 0
                            ),
                        )

                        values = result.stdout.strip().split("|")
                        if len(values) == 3:
                            total_mb = int(values[0])
                            used_mb = int(values[1])
                            free_mb = int(values[2])

                            system_info["total_memory"] = f"{total_mb} MB"
                            system_info["used_memory"] = f"{used_mb} MB"
                            system_info["free_memory"] = f"{free_mb} MB"
                            system_info["memory_percent"] = round(
                                (used_mb / total_mb) * 100, 1
                            )
                            mem_found = True
                    except Exception as e:
                        logger.debug(f"PowerShell memory method failed: {e}")

                # Method 3: Try ctypes (most reliable for modern Windows)
                if not mem_found:
                    try:
                        import ctypes

                        class MEMORYSTATUSEX(ctypes.Structure):
                            _fields_ = [
                                ("dwLength", ctypes.c_ulong),
                                ("dwMemoryLoad", ctypes.c_ulong),
                                ("ullTotalPhys", ctypes.c_ulonglong),
                                ("ullAvailPhys", ctypes.c_ulonglong),
                                ("ullTotalPageFile", ctypes.c_ulonglong),
                                ("ullAvailPageFile", ctypes.c_ulonglong),
                                ("ullTotalVirtual", ctypes.c_ulonglong),
                                ("ullAvailVirtual", ctypes.c_ulonglong),
                                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                            ]

                        meminfo = MEMORYSTATUSEX()
                        meminfo.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                        ctypes.windll.kernel32.GlobalMemoryStatusEx(
                            ctypes.byref(meminfo)
                        )

                        total_mb = meminfo.ullTotalPhys // (1024 * 1024)
                        avail_mb = meminfo.ullAvailPhys // (1024 * 1024)
                        used_mb = total_mb - avail_mb

                        system_info["total_memory"] = f"{total_mb} MB"
                        system_info["used_memory"] = f"{used_mb} MB"
                        system_info["free_memory"] = f"{avail_mb} MB"
                        system_info["memory_percent"] = round(
                            (used_mb / total_mb) * 100, 1
                        )
                    except Exception as e:
                        logger.error(f"ctypes memory method failed: {e}")

            elif platform.system() == "Darwin":
                # macOS memory info
                try:
                    result = subprocess.run(
                        ["sysctl", "-n", "hw.memsize"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    total_bytes = int(result.stdout.strip())
                    total_mb = total_bytes // (1024 * 1024)
                    system_info["total_memory"] = f"{total_mb} MB"

                    result = subprocess.run(
                        ["vm_stat"], capture_output=True, text=True, timeout=5
                    )
                    vm_lines = result.stdout.split("\n")
                    page_size = 4096
                    pages_free = 0
                    pages_inactive = 0

                    for line in vm_lines:
                        if "Pages free:" in line:
                            pages_free = int(line.split(":")[1].strip().rstrip("."))
                        elif "Pages inactive:" in line:
                            pages_inactive = int(line.split(":")[1].strip().rstrip("."))

                    free_bytes = (pages_free + pages_inactive) * page_size
                    free_mb = free_bytes // (1024 * 1024)
                    used_mb = total_mb - free_mb

                    system_info["used_memory"] = f"{used_mb} MB"
                    system_info["free_memory"] = f"{free_mb} MB"
                    system_info["memory_percent"] = round((used_mb / total_mb) * 100, 1)
                except Exception as e:
                    logger.error(f"Error getting macOS memory: {e}")

        except Exception as e:
            logger.error(f"Error getting memory info: {e}")

    except Exception as e:
        logger.error(f"Error getting system info: {e}")

    # Add Docker detection
    system_info["is_docker"] = IS_DOCKER

    return system_info


@router.get("/api/version")
async def get_version():
    """
    Gets script version from Posterizarr.ps1 and compares with GitHub Release.txt
    """
    return await get_script_version()


@router.get("/api/version-ui")
async def get_version_ui():
    """
    Gets UI version
    """
    return await fetch_version(
        local_filename="ReleaseUI.txt",
        github_url="https://raw.githubusercontent.com/fscorrupt/Posterizarr/refs/heads/main/ReleaseUI.txt",
        version_type="UI",
    )


@router.get("/api/releases")
async def get_github_releases():
    """
    Fetches all releases from GitHub and returns them formatted
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/repos/fscorrupt/Posterizarr/releases",
                headers={"Accept": "application/vnd.github.v3+json"},
                timeout=10.0,
            )
            response.raise_for_status()
            releases = response.json()

            # Format the releases for frontend display
            formatted_releases = []
            for release in releases[:10]:  # Only last 10 releases
                published_date = datetime.fromisoformat(
                    release["published_at"].replace("Z", "+00:00")
                )
                days_ago = (datetime.now(published_date.tzinfo) - published_date).days

                formatted_releases.append(
                    {
                        "version": release["tag_name"],
                        "name": release["name"],
                        "published_at": release["published_at"],
                        "days_ago": days_ago,
                        "is_prerelease": release["prerelease"],
                        "is_draft": release["draft"],
                        "html_url": release["html_url"],
                        "body": release["body"],  # Changelog-Text
                    }
                )

            return {"success": True, "releases": formatted_releases}

    except httpx.RequestError as e:
        logger.error(f"Could not fetch releases from GitHub: {e}")
        return {
            "success": False,
            "error": "Could not fetch releases from GitHub",
            "releases": [],
        }
    except Exception as e:
        logger.error(f"Error fetching releases: {e}")
        return {"success": False, "error": str(e), "releases": []}


@router.get("/api/webui-settings")
async def get_webui_settings():
    """Get WebUI settings (log level, theme, etc.)"""
    logger.info("=" * 60)
    logger.info("WEBUI SETTINGS REQUEST")

    try:
        settings = load_webui_settings()

        # Add current log level from runtime
        current_level = logging.getLogger().level
        current_level_name = logging.getLevelName(current_level)
        settings["current_log_level"] = current_level_name

        logger.info(f"WebUI settings loaded: {len(settings)} keys")
        logger.debug(f"Settings: {settings}")
        logger.info("=" * 60)

        return {
            "success": True,
            "settings": settings,
            "available_log_levels": ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
            "config_file": str(WEBUI_SETTINGS_PATH),
        }

    except Exception as e:
        logger.error(f"Error getting WebUI settings: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/webui-settings")
async def update_webui_settings(data: dict):
    """
    Update WebUI settings (persistent)

    Request body:
    {
        "log_level": "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL",
        "theme": "dark" | "light",
        "auto_refresh_interval": 180
    }
    """
    logger.info("=" * 60)
    logger.info("WEBUI SETTINGS UPDATE REQUEST")
    logger.debug(f"Request data: {data}")

    try:
        # Load current settings
        current_settings = load_webui_settings()
        logger.debug(f"Current settings: {current_settings}")

        # Update settings
        updates = data.get("settings", {})
        current_settings.update(updates)

        # Save settings
        logger.info(f"Saving updated settings: {list(updates.keys())}")
        save_success = save_webui_settings(current_settings)

        if not save_success:
            raise HTTPException(status_code=500, detail="Failed to save settings")

        # If log_level was updated, apply it immediately
        if "log_level" in updates:
            new_level_name = updates["log_level"].upper()

            if new_level_name in LOG_LEVEL_MAP:
                new_level = LOG_LEVEL_MAP[new_level_name]
                old_level_name = logging.getLevelName(logging.getLogger().level)

                logger.info(
                    f"Applying log level change: {old_level_name} -> {new_level_name}"
                )

                # Update root logger
                logging.getLogger().setLevel(new_level)

                # Update all handlers
                for handler in logging.getLogger().handlers:
                    handler.setLevel(new_level)

                logger.info(f"Log level changed: {old_level_name} -> {new_level_name}")

                # Also save to old log_config.json for backward compatibility
                save_log_level_config(new_level_name)

        logger.info(f"WebUI settings saved successfully")
        logger.info("=" * 60)

        return {
            "success": True,
            "message": "Settings updated successfully",
            "settings": current_settings,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating WebUI settings: {e}")
        logger.exception("Full traceback:")
        logger.info("=" * 60)
        raise HTTPException(status_code=500, detail=str(e))
