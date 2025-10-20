"""
Utility functions for Posterizarr Backend
Includes: version parsing, file type checks, directory permissions, etc.
"""
import re
import sys
import logging
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


# ============================================================================
# VERSION UTILITIES
# ============================================================================

def parse_version(version_str: str) -> Optional[Tuple[int, int, int]]:
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


# ============================================================================
# FILE TYPE CHECKS
# ============================================================================

def is_poster_file(filename: str) -> bool:
    """
    Check if file is a poster:
    - poster.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx].jpg (file-based, ends with .jpg, no underscore before .jpg)

    MUST EXCLUDE:
    - background.jpg
    - Season01.jpg (and all SeasonXX.jpg)
    - S01E01.jpg (and all SxxExx.jpg)
    - *_background.jpg
    - *_Season01.jpg
    - *_S01E01.jpg
    """
    # Exact match: poster.jpg
    if filename == "poster.jpg":
        return True

    # EXCLUDE specific folder-based files
    if filename == "background.jpg":
        return False
    if re.match(r"^Season\d+\.jpg$", filename):
        return False
    if re.match(r"^S\d+E\d+\.jpg$", filename):
        return False

    # File-based: Must end with .jpg but NOT with special patterns
    if filename.endswith(".jpg"):
        # Exclude files with underscore patterns for other types
        if re.search(r"_background\.jpg$", filename):
            return False
        if re.search(r"_Season\d+\.jpg$", filename):
            return False
        if re.search(r"_S\d+E\d+\.jpg$", filename):
            return False
        # If it's just *.jpg without those patterns, it's a poster
        return True

    return False


def is_background_file(filename: str) -> bool:
    """
    Check if file is a background:
    - background.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx]_background.jpg (file-based)

    MUST EXCLUDE:
    - poster.jpg
    - Season01.jpg
    - S01E01.jpg
    """
    if filename == "background.jpg":
        return True

    if re.search(r"_background\.jpg$", filename):
        return True

    return False


def is_season_file(filename: str) -> bool:
    """
    Check if file is a season poster (SeasonXX.jpg with capital S):
    - Season01.jpg, Season02.jpg, Season12.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx]_Season01.jpg (file-based)

    MUST EXCLUDE:
    - poster.jpg
    - background.jpg
    - S01E01.jpg
    """
    if re.match(r"^Season\d+\.jpg$", filename):
        return True

    if re.search(r"_Season\d+\.jpg$", filename):
        return True

    return False


def is_titlecard_file(filename: str) -> bool:
    """
    Check if file is a title card / episode (SxxExx.jpg with capital S and E):
    - S01E01.jpg, S02E05.jpg, S12E10.jpg (folder-based)
    - Show Name (Year) [tvdb-xxxxx]_S01E01.jpg (file-based)

    MUST EXCLUDE:
    - poster.jpg
    - background.jpg
    - Season01.jpg
    """
    if re.match(r"^S\d+E\d+\.jpg$", filename):
        return True

    if re.search(r"_S\d+E\d+\.jpg$", filename):
        return True

    return False


# ============================================================================
# DIRECTORY UTILITIES
# ============================================================================

def check_directory_permissions(
    directory: Path, directory_name: str = "directory", is_docker: bool = False
) -> dict:
    """
    Check if a directory is accessible and writable.
    Returns diagnostic information for troubleshooting upload issues.

    Args:
        directory: Path to check
        directory_name: Human-readable name for logging
        is_docker: Whether running in Docker environment

    Returns:
        dict with keys: exists, readable, writable, error, platform, is_docker
    """
    result = {
        "path": str(directory),
        "name": directory_name,
        "exists": False,
        "readable": False,
        "writable": False,
        "error": None,
        "platform": sys.platform,
        "is_docker": is_docker,
    }

    try:
        result["exists"] = directory.exists()

        if result["exists"]:
            # Test read permissions
            try:
                list(directory.iterdir())
                result["readable"] = True
            except PermissionError:
                result["error"] = f"No read permission for {directory_name}"
            except Exception as e:
                result["error"] = f"Cannot read {directory_name}: {str(e)}"

            # Test write permissions
            try:
                test_file = directory / ".write_test_diagnostic"
                test_file.touch()
                test_file.unlink()
                result["writable"] = True
            except PermissionError:
                result["error"] = f"No write permission for {directory_name}"
            except Exception as e:
                result["error"] = f"Cannot write to {directory_name}: {str(e)}"
        else:
            result["error"] = f"{directory_name} does not exist"

    except Exception as e:
        result["error"] = f"Error checking {directory_name}: {str(e)}"

    return result


# ============================================================================
# CSV PARSING
# ============================================================================

def parse_image_choices_csv(csv_path: Path) -> list:
    """
    Parse ImageChoices.csv file and return list of assets
    CSV format: "Title";"Type";"Rootfolder";"LibraryName";"Language";"Fallback";"TextTruncated";"Download Source";"Fav Provider Link"

    Skips empty rows where all fields are empty (no assets created during script run)
    """
    import csv

    assets = []

    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            # CSV uses semicolon as delimiter
            reader = csv.DictReader(f, delimiter=";")

            for row in reader:
                # Skip empty rows (all fields are empty or just semicolons)
                title = row.get("Title", "").strip('"').strip()
                rootfolder = row.get("Rootfolder", "").strip('"').strip()

                # If both title and rootfolder are empty, this is an empty row
                if not title and not rootfolder:
                    continue

                # Remove quotes from values if present
                download_source = row.get("Download Source", "").strip('"')
                provider_link = row.get("Fav Provider Link", "").strip('"')

                # Determine if manually created
                is_manually_created = download_source == "N/A" or (
                    download_source
                    and (
                        download_source.startswith("C:")
                        or download_source.startswith("/")
                        or download_source.startswith("\\")
                    )
                )

                asset = {
                    "title": row.get("Title", "").strip('"'),
                    "type": row.get("Type", "").strip('"'),
                    "rootfolder": row.get("Rootfolder", "").strip('"'),
                    "library": row.get("LibraryName", "").strip('"'),
                    "language": row.get("Language", "").strip('"'),
                    "fallback": row.get("Fallback", "").strip('"').lower() == "true",
                    "text_truncated": row.get("TextTruncated", "").strip('"').lower()
                    == "true",
                    "download_source": download_source,
                    "provider_link": provider_link if provider_link != "N/A" else "",
                    "is_manually_created": is_manually_created,
                }
                assets.append(asset)

    except Exception as e:
        logger.error(f"Error parsing CSV {csv_path}: {e}")
        raise

    return assets
