"""Request models for API endpoints"""

from pydantic import BaseModel
from typing import Optional, List, Literal


class ConfigUpdate(BaseModel):
    config: dict


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


class UILogEntry(BaseModel):
    level: str  # "log", "warn", "error", "info", "debug"
    message: str
    timestamp: str
    source: str = "ui"


class UILogBatch(BaseModel):
    logs: list[UILogEntry]


class ScheduleCreate(BaseModel):
    time: str  # Format: "HH:MM"
    description: Optional[str] = ""


class ScheduleUpdate(BaseModel):
    enabled: Optional[bool] = None
    schedules: Optional[List[dict]] = None
    timezone: Optional[str] = None
    skip_if_running: Optional[bool] = None


class TMDBSearchRequest(BaseModel):
    query: str  # Can be title or TMDB ID
    media_type: str = "movie"  # "movie" or "tv"
    poster_type: str = "standard"  # "standard", "season", "titlecard"
    year: Optional[int] = None  # Year for search (required for numeric titles)
    season_number: Optional[int] = None  # For season posters and titlecards
    episode_number: Optional[int] = None  # For titlecards only


class ImageChoiceRecord(BaseModel):
    """Model for image choice record"""

    Title: str
    Type: Optional[str] = None
    Rootfolder: Optional[str] = None
    LibraryName: Optional[str] = None
    Language: Optional[str] = None
    Fallback: Optional[str] = None
    TextTruncated: Optional[str] = None
    DownloadSource: Optional[str] = None
    FavProviderLink: Optional[str] = None
    Manual: Optional[str] = None


class BulkDeleteRequest(BaseModel):
    """Request model for bulk deletion of assets"""

    paths: List[str]


class ManualModeRequest(BaseModel):
    """Request model for manual mode execution"""

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


class LibraryItemsRequest(BaseModel):
    url: str
    token: str
    library_key: str
