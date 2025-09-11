#!/bin/bash

# Config
OUTPUT_DIR="/posterizarr/watcher"
mkdir -p "$OUTPUT_DIR"

# Determine platform (Sonarr or Radarr)
if [[ -n "$sonarr_eventtype" ]]; then
    PLATFORM="Sonarr"
    EVENT="$sonarr_eventtype"

    # Exit early for Test events
    if [[ "$EVENT" == "Test" ]]; then
        exit 0
    fi

    # Collect key/value pairs
    declare -A DATA
    DATA["arr_platform"]="$PLATFORM"
    DATA["event"]="$EVENT"
    DATA["arr_series_title"]="$sonarr_series_title"
    DATA["arr_series_tvdb"]="$sonarr_series_tvdbid"
    DATA["arr_series_tmdb"]="$sonarr_series_tmdbid"
    DATA["arr_series_imdb"]="$sonarr_series_imdbid"
    DATA["arr_series_path"]="$sonarr_series_path"
    DATA["arr_sonarr_series_year"]="$sonarr_series_year"
    DATA["arr_episode_path"]="$sonarr_episodefile_path"
    DATA["arr_episode_season"]="$sonarr_episodefile_seasonnumber"
    DATA["arr_episode_numbers"]="$sonarr_episodefile_episodenumbers"
    DATA["arr_episode_titles"]="$sonarr_episodefile_episodetitles"

elif [[ -n "$radarr_eventtype" ]]; then
    PLATFORM="Radarr"
    EVENT="$radarr_eventtype"

    # Exit early for Test events
    if [[ "$EVENT" == "Test" ]]; then
        exit 0
    fi

    # Collect key/value pairs
    declare -A DATA
    DATA["arr_platform"]="$PLATFORM"
    DATA["event"]="$EVENT"
    DATA["arr_movie_title"]="$radarr_movie_title"
    DATA["arr_movie_tmdb"]="$radarr_movie_tmdbid"
    DATA["arr_movie_imdb"]="$radarr_movie_imdbid"
    DATA["arr_movie_year"]="$radarr_movie_year"
    DATA["arr_movie_path"]="$radarr_movie_path"
    DATA["arr_moviefile_path"]="$radarr_moviefile_paths"
    DATA["arr_moviefile_id"]="$radarr_moviefile_id"

else
    # Unknown platform
    exit 1
fi

# Create the .posterizarr file with timestamp
NOW=$(date +"%Y%m%d%H%M%S")
OUTFILE="$OUTPUT_DIR/recently_added_${NOW}.posterizarr"

# Write key/value pairs
{
    for KEY in "${!DATA[@]}"; do
        echo "[$KEY]: ${DATA[$KEY]}"
    done
} > "$OUTFILE"

echo "Posterizarr file created for $PLATFORM: $OUTFILE"