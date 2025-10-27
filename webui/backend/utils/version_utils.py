"""Version parsing and comparison utilities"""

import logging
import httpx
from pathlib import Path
import re

logger = logging.getLogger(__name__)


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
    is_newer = remote_parsed > current_parsed

    logger.info(
        f"Version comparison: {current} {current_parsed} vs {remote} {remote_parsed} -> newer: {is_newer}"
    )

    return is_newer


async def fetch_version(
    local_filename: str,
    github_url: str,
    version_type: str,
    base_dir: Path,
    is_docker: bool,
):
    """
    A reusable function to get a local version from a file and fetch the remote
    version from GitHub when running in a Docker environment.
    """
    local_version = None
    remote_version = None

    # Get Local Version
    try:
        version_file = base_dir / local_filename
        if version_file.exists():
            local_version = version_file.read_text().strip()
    except Exception as e:
        logger.error(f"Error reading local {version_type} version file: {e}")

    # Get Remote Version (if in Docker)
    if is_docker:
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


async def get_script_version(script_path: Path):
    """
    Reads the version from Posterizarr.ps1 and compares with GitHub Release.txt
    Similar to the PowerShell CompareScriptVersion function

    NOW WITH SEMANTIC VERSION COMPARISON!
    """
    local_version = None
    remote_version = None

    # Get Local Version from Posterizarr.ps1
    try:
        logger.info(f"Looking for Posterizarr.ps1 at: {script_path}")

        if script_path.exists():
            with open(script_path, "r", encoding="utf-8") as f:
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
            logger.error(f"Posterizarr.ps1 not found at {script_path}")
    except Exception as e:
        logger.error(f"Error reading version from Posterizarr.ps1: {e}")

    # Get Remote Version from GitHub Release.txt
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
        "is_update_available": is_update_available,
    }
