"""
TMDB Router
============================================================

TMDB image search integration

Endpoints:
- POST /api/tmdb/search-posters
"""

from fastapi import APIRouter, HTTPException
import logging
import json
import requests

from models.request_models import TMDBSearchRequest

router = APIRouter(tags=["tmdb"])
logger = logging.getLogger(__name__)

# Dependencies (to be injected)
CONFIG_PATH = None
CONFIG_MAPPER_AVAILABLE = False
flatten_config = None


def setup_dependencies(dependencies: dict):
    """Initialize TMDB router dependencies"""
    global CONFIG_PATH, CONFIG_MAPPER_AVAILABLE, flatten_config

    CONFIG_PATH = dependencies["config_path"]
    CONFIG_MAPPER_AVAILABLE = dependencies.get("config_mapper_available", False)
    flatten_config = dependencies.get("flatten_config_func")


@router.post("/api/tmdb/search-posters")
async def search_tmdb_posters(request: TMDBSearchRequest):
    """
    Search TMDB for images by title or ID
    - Standard: Returns show/movie posters (filtered by PreferredLanguageOrder)
    - Season: Returns season-specific posters (filtered by PreferredSeasonLanguageOrder)
    - Titlecard: Returns episode stills (only 'xx' - no language/international)
    - Background: Returns show/movie backdrops (filtered by PreferredBackgroundLanguageOrder)
    - Collection: Returns collection posters (only 'xx' - no language/international)
    """

    def filter_and_sort_posters_by_language(posters_list, preferred_languages):
        """
        Filter and sort posters based on preferred language order.

        Args:
            posters_list: List of poster dicts from TMDB
            preferred_languages: List of language codes in order of preference (e.g., ['de', 'en', 'xx'])

        Returns:
            Filtered and sorted list of posters
        """
        if not preferred_languages:
            return posters_list

        # Normalize language codes to lowercase
        preferred_languages = [
            lang.lower().strip() for lang in preferred_languages if lang
        ]

        # Group posters by language
        language_groups = {lang: [] for lang in preferred_languages}
        language_groups["other"] = []  # For languages not in preferences

        for poster in posters_list:
            poster_lang = (poster.get("iso_639_1") or "xx").lower()

            # Check if poster language matches any preferred language
            if poster_lang in preferred_languages:
                language_groups[poster_lang].append(poster)
            else:
                language_groups["other"].append(poster)

        # Build result list in order of preference
        result = []
        for lang in preferred_languages:
            result.extend(language_groups[lang])

        # Optionally add other languages at the end (commented out to only show preferred)
        # result.extend(language_groups['other'])

        return result

    try:
        # Load config to get TMDB token
        if not CONFIG_PATH.exists():
            raise HTTPException(status_code=404, detail="Config file not found")

        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            grouped_config = json.load(f)

        # Convert grouped config to flat structure
        if CONFIG_MAPPER_AVAILABLE:
            flat_config = flatten_config(grouped_config)
            tmdb_token = flat_config.get("tmdbtoken")
            preferred_language_order = flat_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = flat_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = flat_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )
        else:
            # Fallback: Try both structures
            tmdb_token = grouped_config.get("tmdbtoken")
            if not tmdb_token and isinstance(grouped_config.get("ApiPart"), dict):
                tmdb_token = grouped_config["ApiPart"].get("tmdbtoken")

            # Try to get language preferences from different possible locations
            preferred_language_order = grouped_config.get("PreferredLanguageOrder", "")
            preferred_season_language_order = grouped_config.get(
                "PreferredSeasonLanguageOrder", ""
            )
            preferred_background_language_order = grouped_config.get(
                "PreferredBackgroundLanguageOrder", ""
            )

            # If not found at root, try in ApiPart
            if not preferred_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_language_order = grouped_config["ApiPart"].get(
                    "PreferredLanguageOrder", ""
                )
            if not preferred_season_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_season_language_order = grouped_config["ApiPart"].get(
                    "PreferredSeasonLanguageOrder", ""
                )
            if not preferred_background_language_order and isinstance(
                grouped_config.get("ApiPart"), dict
            ):
                preferred_background_language_order = grouped_config["ApiPart"].get(
                    "PreferredBackgroundLanguageOrder", ""
                )

        # Parse language preferences (handle both string and list formats)
        def parse_language_order(value):
            """Convert language order to list, handling both string and list inputs"""
            if not value:
                return []
            if isinstance(value, list):
                # Already a list, just clean up entries
                return [lang.strip() for lang in value if lang and str(lang).strip()]
            if isinstance(value, str):
                # String format, split by comma
                return [lang.strip() for lang in value.split(",") if lang.strip()]
            return []

        language_order_list = parse_language_order(preferred_language_order)
        season_language_order_list = parse_language_order(
            preferred_season_language_order
        )
        background_language_order_list = parse_language_order(
            preferred_background_language_order
        )

        logger.info(
            f"Language preferences - Standard: {language_order_list}, Season: {season_language_order_list}, Background: {background_language_order_list}"
        )

        if not tmdb_token:
            logger.error("TMDB token not found in config")
            logger.error(f"Config structure: {list(grouped_config.keys())}")
            raise HTTPException(status_code=400, detail="TMDB API token not configured")

        headers = {
            "Authorization": f"Bearer {tmdb_token}",
            "Content-Type": "application/json",
        }

        results = []
        tmdb_ids = []  # Changed to list to support multiple IDs

        # Log the incoming request for debugging
        logger.info(f"TMDB Search Request:")
        logger.info(f"   Query: '{request.query}'")
        logger.info(f"   Media Type: {request.media_type}")
        logger.info(f"   Poster Type: {request.poster_type}")
        logger.info(f"   Year: {request.year}")
        logger.info(f"   Is Digit: {request.query.isdigit()}")

        # Step 1: Get TMDB ID(s)
        # For numeric queries, we'll search both by ID AND by title to cover movies like "1917"
        if request.query.isdigit():
            # Try to use query as TMDB ID
            potential_id = request.query
            logger.info(f"  Query is numeric - will search by ID: {potential_id}")
            tmdb_ids.append(("id", potential_id))

            # Also search by title for numeric queries (e.g., "1917", "2012")
            logger.info(
                f"  Also searching by title for numeric query: '{request.query}'"
            )

        # Always do a title search (unless we only got an ID without title search)
        if not request.query.isdigit() or request.query.isdigit():
            # Query is a title - search for it
            search_url = f"https://api.themoviedb.org/3/search/{request.media_type}"
            search_params = {"query": request.query, "page": 1}

            logger.info(
                f"Searching TMDB by title for: '{request.query}' (media_type: {request.media_type})"
            )

            # Add year parameter if provided
            if request.year:
                if request.media_type == "movie":
                    search_params["year"] = request.year
                    logger.info(f"   Adding year filter: {request.year}")
                elif request.media_type == "tv":
                    search_params["first_air_date_year"] = request.year
                    logger.info(f"   Adding first_air_date_year filter: {request.year}")

            search_response = requests.get(
                search_url, headers=headers, params=search_params, timeout=10
            )

            logger.info(f"   TMDB Response Status: {search_response.status_code}")

            if search_response.status_code == 200:
                search_data = search_response.json()
                search_results = search_data.get("results", [])
                logger.info(f"Found {len(search_results)} title search results")
                # Add all found IDs from title search (to get posters from multiple matches)
                for result in search_results[:5]:  # Limit to top 5 results
                    result_id = result.get("id")
                    result_title = result.get(
                        "title" if request.media_type == "movie" else "name"
                    )
                    if result_id and ("title", result_id) not in [
                        (t, i) for t, i in tmdb_ids
                    ]:
                        tmdb_ids.append(("title", result_id))
                        logger.info(
                            f"   Added result: ID={result_id}, Title='{result_title}'"
                        )
            else:
                logger.error(f"TMDB title search error: {search_response.status_code}")

        if not tmdb_ids:
            logger.warning(f"No TMDB IDs found for '{request.query}'")
            return {
                "success": True,
                "posters": [],
                "count": 0,
                "message": "No results found",
            }

        # Step 2 & 3: Loop through all found IDs and fetch images
        media_endpoint = "movie" if request.media_type == "movie" else "tv"
        seen_posters = set()  # Track unique poster paths to avoid duplicates

        for source_type, tmdb_id in tmdb_ids:
            logger.info(f"  Processing TMDB ID {tmdb_id} (from {source_type} search)")

            # Get item details (for title)
            details_url = f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}"
            logger.info(f"Fetching details from: {details_url}")
            details_response = requests.get(details_url, headers=headers, timeout=10)
            logger.info(f"   Response Status: {details_response.status_code}")

            if details_response.status_code == 200:
                details = details_response.json()
                base_title = (
                    details.get("title") or details.get("name") or f"TMDB ID: {tmdb_id}"
                )
                logger.info(f"   Title: '{base_title}'")
            else:
                logger.warning(
                    f"   Failed to fetch details for ID {tmdb_id}: {details_response.status_code}"
                )
                if details_response.status_code == 404:
                    logger.error(
                        f"   TMDB ID {tmdb_id} not found for media_type '{request.media_type}'"
                    )
                    continue  # Skip this ID and try the next one
                details = {}
                base_title = f"TMDB ID: {tmdb_id}"

            # Fetch appropriate images based on poster_type
            if request.poster_type == "titlecard":
                # ========== TITLE CARDS (Episode Stills) ==========
                if not request.season_number or not request.episode_number:
                    raise HTTPException(
                        status_code=400,
                        detail="Season and episode numbers required for titlecards",
                    )

                # Get episode stills
                episode_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/episode/{request.episode_number}/images"
                episode_response = requests.get(
                    episode_url, headers=headers, timeout=10
                )

                if episode_response.status_code == 200:
                    episode_data = episode_response.json()
                    stills = episode_data.get("stills", [])

                    # Also get episode details for title
                    ep_details_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/episode/{request.episode_number}"
                    ep_details_response = requests.get(
                        ep_details_url, headers=headers, timeout=10
                    )
                    ep_details = (
                        ep_details_response.json()
                        if ep_details_response.status_code == 200
                        else {}
                    )
                    episode_title = ep_details.get(
                        "name", f"Episode {request.episode_number}"
                    )

                    title = f"{base_title} - S{request.season_number:02d}E{request.episode_number:02d}: {episode_title}"

                    # Filter: Only 'xx' (no language/international) for title cards
                    filtered_stills = [
                        still
                        for still in stills
                        if (still.get("iso_639_1") or "xx").lower() == "xx"
                    ]

                    logger.info(
                        f"Title cards: {len(stills)} total, {len(filtered_stills)} after filtering (xx only)"
                    )

                    for still in filtered_stills:  # Load all stills
                        poster_path = still.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
                                    "language": still.get("iso_639_1"),
                                    "vote_average": still.get("vote_average", 0),
                                    "width": still.get("width", 0),
                                    "height": still.get("height", 0),
                                    "type": "episode_still",
                                }
                            )
                else:
                    logger.warning(
                        f"No episode stills found for S{request.season_number}E{request.episode_number}"
                    )

            elif request.poster_type == "season":
                # ========== SEASON POSTERS ==========
                if not request.season_number:
                    raise HTTPException(
                        status_code=400,
                        detail="Season number required for season posters",
                    )

                # Get season posters
                season_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}/images"
                season_response = requests.get(season_url, headers=headers, timeout=10)

                if season_response.status_code == 200:
                    season_data = season_response.json()
                    posters = season_data.get("posters", [])

                    # Get season details for title
                    season_details_url = f"https://api.themoviedb.org/3/tv/{tmdb_id}/season/{request.season_number}"
                    season_details_response = requests.get(
                        season_details_url, headers=headers, timeout=10
                    )
                    season_details = (
                        season_details_response.json()
                        if season_details_response.status_code == 200
                        else {}
                    )
                    season_name = season_details.get(
                        "name", f"Season {request.season_number}"
                    )

                    title = f"{base_title} - {season_name}"

                    # Filter and sort by PreferredSeasonLanguageOrder
                    filtered_posters = filter_and_sort_posters_by_language(
                        posters, season_language_order_list
                    )

                    logger.info(
                        f"Season posters: {len(posters)} total, {len(filtered_posters)} after filtering by language preferences"
                    )

                    for poster in filtered_posters:  # Load all posters
                        poster_path = poster.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
                                    "language": poster.get("iso_639_1"),
                                    "vote_average": poster.get("vote_average", 0),
                                    "width": poster.get("width", 0),
                                    "height": poster.get("height", 0),
                                    "type": "season_poster",
                                }
                            )
                else:
                    logger.warning(
                        f"No season posters found for Season {request.season_number}"
                    )

            elif request.poster_type == "background":
                # ========== BACKGROUND IMAGES (Backdrops 16:9) ==========
                images_url = (
                    f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
                )
                images_response = requests.get(images_url, headers=headers, timeout=10)

                if images_response.status_code == 200:
                    images_data = images_response.json()
                    backdrops = images_data.get("backdrops", [])

                    # Filter and sort by PreferredBackgroundLanguageOrder
                    # If background language order is empty or "PleaseFillMe", fall back to standard poster language order
                    if not background_language_order_list or (
                        len(background_language_order_list) == 1
                        and background_language_order_list[0].lower() == "pleasefillme"
                    ):
                        logger.info(
                            "Background language order not configured, using standard poster language order"
                        )
                        filtered_backdrops = filter_and_sort_posters_by_language(
                            backdrops, language_order_list
                        )
                    else:
                        filtered_backdrops = filter_and_sort_posters_by_language(
                            backdrops, background_language_order_list
                        )

                    logger.info(
                        f"Background images: {len(backdrops)} total, {len(filtered_backdrops)} after filtering by language preferences"
                    )

                    for backdrop in filtered_backdrops:  # Load all backdrops
                        poster_path = backdrop.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": base_title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
                                    "language": backdrop.get("iso_639_1"),
                                    "vote_average": backdrop.get("vote_average", 0),
                                    "width": backdrop.get("width", 0),
                                    "height": backdrop.get("height", 0),
                                    "type": "backdrop",
                                }
                            )
                else:
                    logger.warning(f"No background images found for {base_title}")

            else:
                # ========== STANDARD POSTERS (Show/Movie) ==========
                images_url = (
                    f"https://api.themoviedb.org/3/{media_endpoint}/{tmdb_id}/images"
                )
                images_response = requests.get(images_url, headers=headers, timeout=10)

                if images_response.status_code == 200:
                    images_data = images_response.json()
                    posters = images_data.get("posters", [])

                    # Different filtering based on poster type
                    if request.poster_type == "collection":
                        # Collections: Only 'xx' (no language/international)
                        filtered_posters = [
                            p
                            for p in posters
                            if (p.get("iso_639_1") or "xx").lower() == "xx"
                        ]
                        logger.info(
                            f"Collection posters: {len(posters)} total, {len(filtered_posters)} after filtering (xx only)"
                        )
                    else:
                        # Standard posters: Filter and sort by PreferredLanguageOrder
                        filtered_posters = filter_and_sort_posters_by_language(
                            posters, language_order_list
                        )
                        logger.info(
                            f"Standard posters: {len(posters)} total, {len(filtered_posters)} after filtering by language preferences"
                        )

                    for poster in filtered_posters:  # Load all posters
                        poster_path = poster.get("file_path")
                        if poster_path not in seen_posters:
                            seen_posters.add(poster_path)
                            results.append(
                                {
                                    "tmdb_id": tmdb_id,
                                    "title": base_title,
                                    "poster_path": poster_path,
                                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}",
                                    "original_url": f"https://image.tmdb.org/t/p/original{poster_path}",
                                    "language": poster.get("iso_639_1"),
                                    "vote_average": poster.get("vote_average", 0),
                                    "width": poster.get("width", 0),
                                    "height": poster.get("height", 0),
                                    "type": "show_poster",
                                }
                            )

        logger.info(
            f"TMDB search for '{request.query}' ({request.poster_type}) returned {len(results)} images from {len(tmdb_ids)} ID(s)"
        )
        return {"success": True, "posters": results, "count": len(results)}

    except requests.RequestException as e:
        logger.error(f"TMDB API error: {e}")
        raise HTTPException(status_code=500, detail=f"TMDB API error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching TMDB posters: {e}")
        import traceback

        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
