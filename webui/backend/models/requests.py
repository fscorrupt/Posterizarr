"""
Pydantic Models for API request/response validation
"""
from pydantic import BaseModel
from typing import Optional, List, Literal


# ============================================================================
# Config & Settings Models
# ============================================================================

class ConfigUpdate(BaseModel):
    config: dict


class ScheduleCreate(BaseModel):
    time: str  # Format: "HH:MM"
    description: Optional[str] = ""


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    schedules: Optional[List[dict]] = None
    timezone: Optional[str] = None
    skip_if_running: Optional[bool] = None


# ============================================================================
# Poster & Asset Models
# ============================================================================

class ResetPostersRequest(BaseModel):
    library: str


class ManualModeRequest(BaseModel):
    model_config = {"extra": "ignore"}  # Ignore extra fields from frontend

    picturePath: str
    titletext: str
    folderName: str
    libraryName: str
    posterType: Literal[
        "standard", "season", "collection", "titlecard", "background"
    ] = "standard"
    seasonPosterName: str = ""
    epTitleName: str = ""
    episodeNumber: str = ""


class TMDBSearchRequest(BaseModel):
    query: str  # Can be title or TMDB ID
    media_type: str = "movie"  # "movie" or "tv"
    poster_type: str = "standard"  # "standard", "season", "titlecard"
    year: Optional[int] = None  # Year for search (required for numeric titles)
    season_number: Optional[int] = None  # For season posters and titlecards
    episode_number: Optional[int] = None  # For titlecards only


# ============================================================================
# Validation Models (API Keys, Credentials)
# ============================================================================

class PlexValidationRequest(BaseModel):
    url: str
    token: str


class JellyfinValidationRequest(BaseModel):
    url: str
    api_key: str


class EmbyValidationRequest(BaseModel):
    url: str
    api_key: str


class TMDBValidationRequest(BaseModel):
    token: str


class TVDBValidationRequest(BaseModel):
    api_key: str
    pin: Optional[str] = None


class FanartValidationRequest(BaseModel):
    api_key: str


class DiscordValidationRequest(BaseModel):
    webhook_url: str


class AppriseValidationRequest(BaseModel):
    url: str


class UptimeKumaValidationRequest(BaseModel):
    url: str


# ============================================================================
# Logging Models
# ============================================================================

class UILogEntry(BaseModel):
    level: str  # "log", "warn", "error", "info", "debug"
    message: str
    timestamp: str
    source: str = "ui"


class UILogBatch(BaseModel):
    logs: list[UILogEntry]
