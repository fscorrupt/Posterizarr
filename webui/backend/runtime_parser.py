"""
Utility module for parsing runtime statistics from log files
"""

import re
from pathlib import Path
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)


def parse_runtime_from_log(log_path: Path, mode: str = "normal") -> Optional[Dict]:
    """
    Parse runtime statistics from a log file

    Args:
        log_path: Path to the log file
        mode: The run mode (normal, testing, manual, backup, etc.)

    Returns:
        Dictionary with parsed runtime data or None if parsing failed
    """
    try:
        if not log_path.exists():
            logger.warning(f"Log file not found: {log_path}")
            return None

        # Read last 150 lines to find the runtime info
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            last_lines = lines[-150:] if len(lines) > 150 else lines

        runtime_seconds = None
        runtime_formatted = None
        total_images = 0
        posters = 0
        seasons = 0
        backgrounds = 0
        titlecards = 0
        errors = 0

        # Parse from bottom to top to get latest run
        for line in reversed(last_lines):
            # Look for: "Script execution time: 0h 1m 23s"
            if "Script execution time:" in line and runtime_formatted is None:
                match = re.search(r"(\d+)h\s*(\d+)m\s*(\d+)s", line)
                if match:
                    hours = int(match.group(1))
                    minutes = int(match.group(2))
                    seconds = int(match.group(3))
                    runtime_seconds = hours * 3600 + minutes * 60 + seconds
                    runtime_formatted = f"{hours}h {minutes}m {seconds}s"

            # Look for: "Finished, Total images downloaded: 42" OR "Finished, Total images created: 42"
            if (
                "Total images downloaded:" in line or "Total images created:" in line
            ) and total_images == 0:
                match = re.search(r"Total images (?:downloaded|created):\s*(\d+)", line)
                if match:
                    total_images = int(match.group(1))

            # Look for: "Show/Movie Posters created: 127| Season images created: 0 | Background images created: 127 | TitleCards created: 0"
            # OR: "Show/Movie Posters downloaded: 10| Season images downloaded: 5 | Background images downloaded: 3 | TitleCards downloaded: 2"
            if (
                "Show/Movie Posters created:" in line
                or "Show/Movie Posters downloaded:" in line
            ) and posters == 0:
                # Posters
                poster_match = re.search(
                    r"Show/Movie Posters (?:created|downloaded):\s*(\d+)", line
                )
                if poster_match:
                    posters = int(poster_match.group(1))

                # Seasons
                season_match = re.search(
                    r"Season images (?:created|downloaded):\s*(\d+)", line
                )
                if season_match:
                    seasons = int(season_match.group(1))

                # Backgrounds
                bg_match = re.search(
                    r"Background images (?:created|downloaded):\s*(\d+)", line
                )
                if bg_match:
                    backgrounds = int(bg_match.group(1))

                # TitleCards
                tc_match = re.search(
                    r"TitleCards (?:created|downloaded):\s*(\d+)", line
                )
                if tc_match:
                    titlecards = int(tc_match.group(1))

            # Look for: "During execution '5' Errors occurred"
            if "Errors occurred" in line and errors == 0:
                match = re.search(r"execution\s+'(\d+)'\s+Errors", line)
                if match:
                    errors = int(match.group(1))

            # Stop searching once we found everything from the same run
            if runtime_formatted and (
                total_images > 0 or (posters + seasons + backgrounds + titlecards) > 0
            ):
                break

        # If runtime was not found, we don't have complete data
        if runtime_formatted is None:
            logger.warning(f"Could not find runtime data in {log_path}")
            return None

        # If total_images was not found but we have individual counts, calculate it
        if total_images == 0 and (posters + seasons + backgrounds + titlecards) > 0:
            total_images = posters + seasons + backgrounds + titlecards

        return {
            "mode": mode,
            "runtime_seconds": runtime_seconds,
            "runtime_formatted": runtime_formatted,
            "total_images": total_images,
            "posters": posters,
            "seasons": seasons,
            "backgrounds": backgrounds,
            "titlecards": titlecards,
            "errors": errors,
            "log_file": log_path.name,
        }

    except Exception as e:
        logger.error(f"Error parsing runtime from log: {e}")
        return None


def save_runtime_to_db(log_path: Path, mode: str = "normal"):
    """
    Parse runtime from log file and save to database

    Args:
        log_path: Path to the log file
        mode: The run mode
    """
    try:
        from runtime_database import runtime_db

        runtime_data = parse_runtime_from_log(log_path, mode)

        if runtime_data:
            runtime_db.add_runtime_entry(**runtime_data)
            logger.info(f"Runtime data saved to database for {mode} mode")
        else:
            logger.warning(f"No runtime data to save for {mode} mode")

    except Exception as e:
        logger.error(f"Error saving runtime to database: {e}")
