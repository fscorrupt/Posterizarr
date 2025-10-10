"""
Config Mapper - Transforms between grouped and flat config structures
Author: Posterizarr

Usage in Backend:
    from config_mapper import flatten_config, unflatten_config, get_display_name, get_tooltip

    # When loading config
    grouped_config = json.load(f)
    flat_config = flatten_config(grouped_config)

    # When saving config
    grouped_config = unflatten_config(flat_config)
    json.dump(grouped_config, f)

    # Get tooltip for a config key
    tooltip = get_tooltip("tmdbtoken")
"""

# Import tooltips from separate file
try:
    from config_tooltips import CONFIG_TOOLTIPS
except ImportError:
    # Fallback if config_tooltips.py is not available
    CONFIG_TOOLTIPS = {}

# Complete mapping of all config variables to their groups
CONFIG_GROUPS = {
    # ApiPart
    "tvdbapi": "ApiPart",
    "tmdbtoken": "ApiPart",
    "FanartTvAPIKey": "ApiPart",
    "PlexToken": "ApiPart",
    "FavProvider": "ApiPart",
    "PreferredLanguageOrder": "ApiPart",
    "PreferredSeasonLanguageOrder": "ApiPart",
    "tmdb_vote_sorting": "ApiPart",
    "WidthHeightFilter": "ApiPart",
    "PosterMinWidth": "ApiPart",
    "PosterMinHeight": "ApiPart",
    "BgTcMinWidth": "ApiPart",
    "BgTcMinHeight": "ApiPart",
    "JellyfinAPIKey": "ApiPart",
    "EmbyAPIKey": "ApiPart",
    "PreferredBackgroundLanguageOrder": "ApiPart",
    # PlexPart
    "PlexLibstoExclude": "PlexPart",
    "PlexUrl": "PlexPart",
    "UsePlex": "PlexPart",
    "PlexUploadExistingAssets": "PlexPart",
    # JellyfinPart
    "JellyfinLibstoExclude": "JellyfinPart",
    "JellyfinUrl": "JellyfinPart",
    "UseJellyfin": "JellyfinPart",
    "JellyfinUploadExistingAssets": "JellyfinPart",
    "JellyfinReplaceThumbwithBackdrop": "JellyfinPart",
    # EmbyPart
    "EmbyLibstoExclude": "EmbyPart",
    "EmbyUrl": "EmbyPart",
    "UseEmby": "EmbyPart",
    "EmbyUploadExistingAssets": "EmbyPart",
    "EmbyReplaceThumbwithBackdrop": "EmbyPart",
    # Notification
    "SendNotification": "Notification",
    "AppriseUrl": "Notification",
    "Discord": "Notification",
    "UseUptimeKuma": "Notification",
    "UptimeKumaUrl": "Notification",
    "DiscordUserName": "Notification",
    # PrerequisitePart
    "AssetPath": "PrerequisitePart",
    "show_skipped": "PrerequisitePart",
    "magickinstalllocation": "PrerequisitePart",
    "maxLogs": "PrerequisitePart",
    "logLevel": "PrerequisitePart",
    "font": "PrerequisitePart",
    "backgroundfont": "PrerequisitePart",
    "titlecardfont": "PrerequisitePart",
    "overlayfile": "PrerequisitePart",
    "backgroundoverlayfile": "PrerequisitePart",
    "titlecardoverlayfile": "PrerequisitePart",
    "LibraryFolders": "PrerequisitePart",
    "Posters": "PrerequisitePart",
    "SeasonPosters": "PrerequisitePart",
    "BackgroundPosters": "PrerequisitePart",
    "TitleCards": "PrerequisitePart",
    "SkipTBA": "PrerequisitePart",
    "SkipJapTitle": "PrerequisitePart",
    "AssetCleanup": "PrerequisitePart",
    "AutoUpdateIM": "PrerequisitePart",
    "seasonoverlayfile": "PrerequisitePart",
    "RTLFont": "PrerequisitePart",
    "NewLineOnSpecificSymbols": "PrerequisitePart",
    "NewLineSymbols": "PrerequisitePart",
    "PlexUpload": "PrerequisitePart",
    "BackupPath": "PrerequisitePart",
    "ForceRunningDeletion": "PrerequisitePart",
    "AutoUpdatePosterizarr": "PrerequisitePart",
    "ManualAssetPath": "PrerequisitePart",
    "SkipAddText": "PrerequisitePart",
    "FollowSymlink": "PrerequisitePart",
    "poster4k": "PrerequisitePart",
    "Poster1080p": "PrerequisitePart",
    "UsePosterResolutionOverlays": "PrerequisitePart",
    "DisableHashValidation": "PrerequisitePart",
    "Background4k": "PrerequisitePart",
    "Background1080p": "PrerequisitePart",
    "TC4k": "PrerequisitePart",
    "TC1080p": "PrerequisitePart",
    "UseBackgroundResolutionOverlays": "PrerequisitePart",
    "UseTCResolutionOverlays": "PrerequisitePart",
    "DisableOnlineAssetFetch": "PrerequisitePart",
    "collectionfont": "PrerequisitePart",
    "collectionoverlayfile": "PrerequisitePart",
    # OverlayPart
    "ImageProcessing": "OverlayPart",
    "outputQuality": "OverlayPart",
    # PosterOverlayPart
    "PosterFontAllCaps": "PosterOverlayPart",
    "PosterAddBorder": "PosterOverlayPart",
    "PosterAddText": "PosterOverlayPart",
    "PosterAddOverlay": "PosterOverlayPart",
    "PosterFontcolor": "PosterOverlayPart",
    "PosterBordercolor": "PosterOverlayPart",
    "PosterMinPointSize": "PosterOverlayPart",
    "PosterMaxPointSize": "PosterOverlayPart",
    "PosterBorderwidth": "PosterOverlayPart",
    "PosterMaxWidth": "PosterOverlayPart",
    "PosterMaxHeight": "PosterOverlayPart",
    "PosterTextOffset": "PosterOverlayPart",
    "PosterAddTextStroke": "PosterOverlayPart",
    "PosterStrokecolor": "PosterOverlayPart",
    "PosterStrokewidth": "PosterOverlayPart",
    "PosterLineSpacing": "PosterOverlayPart",
    "PosterTextGravity": "PosterOverlayPart",
    # SeasonPosterOverlayPart
    "SeasonPosterFontAllCaps": "SeasonPosterOverlayPart",
    "SeasonPosterAddBorder": "SeasonPosterOverlayPart",
    "SeasonPosterAddText": "SeasonPosterOverlayPart",
    "SeasonPosterAddOverlay": "SeasonPosterOverlayPart",
    "SeasonPosterFontcolor": "SeasonPosterOverlayPart",
    "SeasonPosterBordercolor": "SeasonPosterOverlayPart",
    "SeasonPosterMinPointSize": "SeasonPosterOverlayPart",
    "SeasonPosterMaxPointSize": "SeasonPosterOverlayPart",
    "SeasonPosterBorderwidth": "SeasonPosterOverlayPart",
    "SeasonPosterMaxWidth": "SeasonPosterOverlayPart",
    "SeasonPosterMaxHeight": "SeasonPosterOverlayPart",
    "SeasonPosterTextOffset": "SeasonPosterOverlayPart",
    "SeasonPosterAddTextStroke": "SeasonPosterOverlayPart",
    "SeasonPosterStrokecolor": "SeasonPosterOverlayPart",
    "SeasonPosterStrokewidth": "SeasonPosterOverlayPart",
    "SeasonPosterLineSpacing": "SeasonPosterOverlayPart",
    "SeasonPosterShowFallback": "SeasonPosterOverlayPart",
    "SeasonPosterTextGravity": "SeasonPosterOverlayPart",
    # BackgroundOverlayPart
    "BackgroundFontAllCaps": "BackgroundOverlayPart",
    "BackgroundAddOverlay": "BackgroundOverlayPart",
    "BackgroundAddBorder": "BackgroundOverlayPart",
    "BackgroundAddText": "BackgroundOverlayPart",
    "BackgroundFontcolor": "BackgroundOverlayPart",
    "BackgroundBordercolor": "BackgroundOverlayPart",
    "BackgroundMinPointSize": "BackgroundOverlayPart",
    "BackgroundMaxPointSize": "BackgroundOverlayPart",
    "BackgroundBorderwidth": "BackgroundOverlayPart",
    "BackgroundMaxWidth": "BackgroundOverlayPart",
    "BackgroundMaxHeight": "BackgroundOverlayPart",
    "BackgroundTextOffset": "BackgroundOverlayPart",
    "BackgroundAddTextStroke": "BackgroundOverlayPart",
    "BackgroundStrokecolor": "BackgroundOverlayPart",
    "BackgroundStrokewidth": "BackgroundOverlayPart",
    "BackgroundLineSpacing": "BackgroundOverlayPart",
    "BackgroundTextGravity": "BackgroundOverlayPart",
    # TitleCardOverlayPart
    "TitleCardUseBackgroundAsTitleCard": "TitleCardOverlayPart",
    "TitleCardAddOverlay": "TitleCardOverlayPart",
    "TitleCardAddBorder": "TitleCardOverlayPart",
    "TitleCardBordercolor": "TitleCardOverlayPart",
    "TitleCardBorderwidth": "TitleCardOverlayPart",
    "TitleCardBackgroundFallback": "TitleCardOverlayPart",
    # TitleCardTitleTextPart
    "TitleCardTitleFontAllCaps": "TitleCardTitleTextPart",
    "TitleCardTitleAddEPTitleText": "TitleCardTitleTextPart",
    "TitleCardTitleFontcolor": "TitleCardTitleTextPart",
    "TitleCardTitleMinPointSize": "TitleCardTitleTextPart",
    "TitleCardTitleMaxPointSize": "TitleCardTitleTextPart",
    "TitleCardTitleMaxWidth": "TitleCardTitleTextPart",
    "TitleCardTitleMaxHeight": "TitleCardTitleTextPart",
    "TitleCardTitleTextOffset": "TitleCardTitleTextPart",
    "TitleCardTitleAddTextStroke": "TitleCardTitleTextPart",
    "TitleCardTitleStrokecolor": "TitleCardTitleTextPart",
    "TitleCardTitleStrokewidth": "TitleCardTitleTextPart",
    "TitleCardTitleLineSpacing": "TitleCardTitleTextPart",
    "TitleCardTitleTextGravity": "TitleCardTitleTextPart",
    # TitleCardEPTextPart
    "TitleCardEPSeasonTCText": "TitleCardEPTextPart",
    "TitleCardEPEpisodeTCText": "TitleCardEPTextPart",
    "TitleCardEPFontAllCaps": "TitleCardEPTextPart",
    "TitleCardEPAddEPText": "TitleCardEPTextPart",
    "TitleCardEPFontcolor": "TitleCardEPTextPart",
    "TitleCardEPMinPointSize": "TitleCardEPTextPart",
    "TitleCardEPMaxPointSize": "TitleCardEPTextPart",
    "TitleCardEPMaxWidth": "TitleCardEPTextPart",
    "TitleCardEPMaxHeight": "TitleCardEPTextPart",
    "TitleCardEPTextOffset": "TitleCardEPTextPart",
    "TitleCardEPAddTextStroke": "TitleCardEPTextPart",
    "TitleCardEPStrokecolor": "TitleCardEPTextPart",
    "TitleCardEPStrokewidth": "TitleCardEPTextPart",
    "TitleCardEPLineSpacing": "TitleCardEPTextPart",
    "TitleCardEPTextGravity": "TitleCardEPTextPart",
    # ShowTitleOnSeasonPosterPart
    "ShowTitleAddShowTitletoSeason": "ShowTitleOnSeasonPosterPart",
    "ShowTitleFontAllCaps": "ShowTitleOnSeasonPosterPart",
    "ShowTitleAddTextStroke": "ShowTitleOnSeasonPosterPart",
    "ShowTitleStrokecolor": "ShowTitleOnSeasonPosterPart",
    "ShowTitleStrokewidth": "ShowTitleOnSeasonPosterPart",
    "ShowTitleFontcolor": "ShowTitleOnSeasonPosterPart",
    "ShowTitleMinPointSize": "ShowTitleOnSeasonPosterPart",
    "ShowTitleMaxPointSize": "ShowTitleOnSeasonPosterPart",
    "ShowTitleMaxWidth": "ShowTitleOnSeasonPosterPart",
    "ShowTitleMaxHeight": "ShowTitleOnSeasonPosterPart",
    "ShowTitleTextOffset": "ShowTitleOnSeasonPosterPart",
    "ShowTitleLineSpacing": "ShowTitleOnSeasonPosterPart",
    "ShowTitleTextGravity": "ShowTitleOnSeasonPosterPart",
    # CollectionTitlePosterPart
    "CollectionTitleAddCollectionTitle": "CollectionTitlePosterPart",
    "CollectionTitleCollectionTitle": "CollectionTitlePosterPart",
    "CollectionTitleFontAllCaps": "CollectionTitlePosterPart",
    "CollectionTitleAddTextStroke": "CollectionTitlePosterPart",
    "CollectionTitleStrokecolor": "CollectionTitlePosterPart",
    "CollectionTitleStrokewidth": "CollectionTitlePosterPart",
    "CollectionTitleFontcolor": "CollectionTitlePosterPart",
    "CollectionTitleMinPointSize": "CollectionTitlePosterPart",
    "CollectionTitleMaxPointSize": "CollectionTitlePosterPart",
    "CollectionTitleMaxWidth": "CollectionTitlePosterPart",
    "CollectionTitleMaxHeight": "CollectionTitlePosterPart",
    "CollectionTitleTextOffset": "CollectionTitlePosterPart",
    "CollectionTitleLineSpacing": "CollectionTitlePosterPart",
    "CollectionTitleTextGravity": "CollectionTitlePosterPart",
    # CollectionPosterOverlayPart
    "CollectionPosterFontAllCaps": "CollectionPosterOverlayPart",
    "CollectionPosterAddBorder": "CollectionPosterOverlayPart",
    "CollectionPosterAddText": "CollectionPosterOverlayPart",
    "CollectionPosterAddTextStroke": "CollectionPosterOverlayPart",
    "CollectionPosterStrokecolor": "CollectionPosterOverlayPart",
    "CollectionPosterStrokewidth": "CollectionPosterOverlayPart",
    "CollectionPosterAddOverlay": "CollectionPosterOverlayPart",
    "CollectionPosterFontcolor": "CollectionPosterOverlayPart",
    "CollectionPosterBordercolor": "CollectionPosterOverlayPart",
    "CollectionPosterMinPointSize": "CollectionPosterOverlayPart",
    "CollectionPosterMaxPointSize": "CollectionPosterOverlayPart",
    "CollectionPosterBorderwidth": "CollectionPosterOverlayPart",
    "CollectionPosterMaxWidth": "CollectionPosterOverlayPart",
    "CollectionPosterMaxHeight": "CollectionPosterOverlayPart",
    "CollectionPosterTextOffset": "CollectionPosterOverlayPart",
    "CollectionPosterLineSpacing": "CollectionPosterOverlayPart",
    "CollectionPosterTextGravity": "CollectionPosterOverlayPart",
}


# UI Grouping for better organization
UI_GROUPS = {
    "General Settings": [
        "AssetPath",
        "BackupPath",
        "ManualAssetPath",
        "maxLogs",
        "logLevel",
        "magickinstalllocation",
        "show_skipped",
        "LibraryFolders",
        "Posters",
        "SeasonPosters",
        "BackgroundPosters",
        "TitleCards",
        "AssetCleanup",
        "FollowSymlink",
        "SkipTBA",
        "SkipJapTitle",
        "SkipAddText",
        "DisableOnlineAssetFetch",
        "AutoUpdateIM",
        "AutoUpdatePosterizarr",
        "ForceRunningDeletion",
        "DisableHashValidation",
    ],
    "API Keys & Tokens": [
        "tvdbapi",
        "tmdbtoken",
        "FanartTvAPIKey",
        "FavProvider",
        "tmdb_vote_sorting",
    ],
    "Language & Preferences": [
        "PreferredLanguageOrder",
        "PreferredSeasonLanguageOrder",
        "PreferredBackgroundLanguageOrder",
    ],
    "Image Filters": [
        "WidthHeightFilter",
        "PosterMinWidth",
        "PosterMinHeight",
        "BgTcMinWidth",
        "BgTcMinHeight",
    ],
    "Plex Settings": [
        "UsePlex",
        "PlexUrl",
        "PlexToken",
        "PlexUploadExistingAssets",
        "PlexUpload",
        "PlexLibstoExclude",
    ],
    "Jellyfin Settings": [
        "UseJellyfin",
        "JellyfinUrl",
        "JellyfinAPIKey",
        "JellyfinUploadExistingAssets",
        "JellyfinReplaceThumbwithBackdrop",
        "JellyfinLibstoExclude",
    ],
    "Emby Settings": [
        "UseEmby",
        "EmbyUrl",
        "EmbyAPIKey",
        "EmbyUploadExistingAssets",
        "EmbyReplaceThumbwithBackdrop",
        "EmbyLibstoExclude",
    ],
    "Notifications": [
        "SendNotification",
        "Discord",
        "AppriseUrl",
        "DiscordUserName",
        "UseUptimeKuma",
        "UptimeKumaUrl",
    ],
    "Fonts": ["font", "backgroundfont", "titlecardfont", "collectionfont", "RTLFont"],
    "Overlay Files": [
        "overlayfile",
        "backgroundoverlayfile",
        "titlecardoverlayfile",
        "seasonoverlayfile",
        "collectionoverlayfile",
    ],
    "Resolution Overlays": [
        "UsePosterResolutionOverlays",
        "poster4k",
        "Poster1080p",
        "UseBackgroundResolutionOverlays",
        "Background4k",
        "Background1080p",
        "UseTCResolutionOverlays",
        "TC4k",
        "TC1080p",
    ],
    "Image Processing": ["ImageProcessing", "outputQuality"],
    "Text Formatting": ["NewLineOnSpecificSymbols", "NewLineSymbols"],
    "Poster Settings": [
        "PosterFontAllCaps",
        "PosterAddBorder",
        "PosterAddText",
        "PosterAddOverlay",
        "PosterFontcolor",
        "PosterBordercolor",
        "PosterMinPointSize",
        "PosterMaxPointSize",
        "PosterBorderwidth",
        "PosterMaxWidth",
        "PosterMaxHeight",
        "PosterTextOffset",
        "PosterAddTextStroke",
        "PosterStrokecolor",
        "PosterStrokewidth",
        "PosterLineSpacing",
        "PosterTextGravity",
    ],
    "Season Poster Settings": [
        "SeasonPosterFontAllCaps",
        "SeasonPosterAddBorder",
        "SeasonPosterAddText",
        "SeasonPosterAddOverlay",
        "SeasonPosterFontcolor",
        "SeasonPosterBordercolor",
        "SeasonPosterMinPointSize",
        "SeasonPosterMaxPointSize",
        "SeasonPosterBorderwidth",
        "SeasonPosterMaxWidth",
        "SeasonPosterMaxHeight",
        "SeasonPosterTextOffset",
        "SeasonPosterAddTextStroke",
        "SeasonPosterStrokecolor",
        "SeasonPosterStrokewidth",
        "SeasonPosterLineSpacing",
        "SeasonPosterShowFallback",
        "SeasonPosterTextGravity",
    ],
    "Background Settings": [
        "BackgroundFontAllCaps",
        "BackgroundAddOverlay",
        "BackgroundAddBorder",
        "BackgroundAddText",
        "BackgroundFontcolor",
        "BackgroundBordercolor",
        "BackgroundMinPointSize",
        "BackgroundMaxPointSize",
        "BackgroundBorderwidth",
        "BackgroundMaxWidth",
        "BackgroundMaxHeight",
        "BackgroundTextOffset",
        "BackgroundAddTextStroke",
        "BackgroundStrokecolor",
        "BackgroundStrokewidth",
        "BackgroundLineSpacing",
        "BackgroundTextGravity",
    ],
    "Title Card Overlay": [
        "TitleCardUseBackgroundAsTitleCard",
        "TitleCardAddOverlay",
        "TitleCardAddBorder",
        "TitleCardBordercolor",
        "TitleCardBorderwidth",
        "TitleCardBackgroundFallback",
    ],
    "Title Card Title Text": [
        "TitleCardTitleFontAllCaps",
        "TitleCardTitleAddEPTitleText",
        "TitleCardTitleFontcolor",
        "TitleCardTitleMinPointSize",
        "TitleCardTitleMaxPointSize",
        "TitleCardTitleMaxWidth",
        "TitleCardTitleMaxHeight",
        "TitleCardTitleTextOffset",
        "TitleCardTitleAddTextStroke",
        "TitleCardTitleStrokecolor",
        "TitleCardTitleStrokewidth",
        "TitleCardTitleLineSpacing",
        "TitleCardTitleTextGravity",
    ],
    "Title Card Episode Text": [
        "TitleCardEPSeasonTCText",
        "TitleCardEPEpisodeTCText",
        "TitleCardEPFontAllCaps",
        "TitleCardEPAddEPText",
        "TitleCardEPFontcolor",
        "TitleCardEPMinPointSize",
        "TitleCardEPMaxPointSize",
        "TitleCardEPMaxWidth",
        "TitleCardEPMaxHeight",
        "TitleCardEPTextOffset",
        "TitleCardEPAddTextStroke",
        "TitleCardEPStrokecolor",
        "TitleCardEPStrokewidth",
        "TitleCardEPLineSpacing",
        "TitleCardEPTextGravity",
    ],
    "Show Title on Season": [
        "ShowTitleAddShowTitletoSeason",
        "ShowTitleFontAllCaps",
        "ShowTitleAddTextStroke",
        "ShowTitleStrokecolor",
        "ShowTitleStrokewidth",
        "ShowTitleFontcolor",
        "ShowTitleMinPointSize",
        "ShowTitleMaxPointSize",
        "ShowTitleMaxWidth",
        "ShowTitleMaxHeight",
        "ShowTitleTextOffset",
        "ShowTitleLineSpacing",
        "ShowTitleTextGravity",
    ],
    "Collection Title": [
        "CollectionTitleAddCollectionTitle",
        "CollectionTitleCollectionTitle",
        "CollectionTitleFontAllCaps",
        "CollectionTitleAddTextStroke",
        "CollectionTitleStrokecolor",
        "CollectionTitleStrokewidth",
        "CollectionTitleFontcolor",
        "CollectionTitleMinPointSize",
        "CollectionTitleMaxPointSize",
        "CollectionTitleMaxWidth",
        "CollectionTitleMaxHeight",
        "CollectionTitleTextOffset",
        "CollectionTitleLineSpacing",
        "CollectionTitleTextGravity",
    ],
    "Collection Poster": [
        "CollectionPosterFontAllCaps",
        "CollectionPosterAddBorder",
        "CollectionPosterAddText",
        "CollectionPosterAddTextStroke",
        "CollectionPosterStrokecolor",
        "CollectionPosterStrokewidth",
        "CollectionPosterAddOverlay",
        "CollectionPosterFontcolor",
        "CollectionPosterBordercolor",
        "CollectionPosterMinPointSize",
        "CollectionPosterMaxPointSize",
        "CollectionPosterBorderwidth",
        "CollectionPosterMaxWidth",
        "CollectionPosterMaxHeight",
        "CollectionPosterTextOffset",
        "CollectionPosterLineSpacing",
        "CollectionPosterTextGravity",
    ],
}


def flatten_config(grouped_config):
    """
    Convert grouped config structure to flat structure for internal use.

    Example:
        {"ApiPart": {"tmdbtoken": "xxx"}} -> {"tmdbtoken": "xxx"}

    Special handling for duplicate keys (LibstoExclude, UploadExistingAssets, etc.)
    by adding service prefix.
    """
    flat = {}

    for group_name, group_data in grouped_config.items():
        if not isinstance(group_data, dict):
            continue

        for key, value in group_data.items():
            # Handle special cases where keys appear in multiple groups
            if key == "LibstoExclude":
                # Add prefix based on group
                if group_name == "PlexPart":
                    flat_key = "PlexLibstoExclude"
                elif group_name == "JellyfinPart":
                    flat_key = "JellyfinLibstoExclude"
                elif group_name == "EmbyPart":
                    flat_key = "EmbyLibstoExclude"
                else:
                    flat_key = key
            elif key == "UploadExistingAssets":
                if group_name == "PlexPart":
                    flat_key = "PlexUploadExistingAssets"
                elif group_name == "JellyfinPart":
                    flat_key = "JellyfinUploadExistingAssets"
                elif group_name == "EmbyPart":
                    flat_key = "EmbyUploadExistingAssets"
                else:
                    flat_key = key
            elif key == "ReplaceThumbwithBackdrop":
                if group_name == "JellyfinPart":
                    flat_key = "JellyfinReplaceThumbwithBackdrop"
                elif group_name == "EmbyPart":
                    flat_key = "EmbyReplaceThumbwithBackdrop"
                else:
                    flat_key = key
            else:
                # For unique keys in specific groups, add prefixes for clarity
                if group_name == "PosterOverlayPart":
                    flat_key = (
                        f"Poster{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"Poster{key}"
                    )
                elif group_name == "SeasonPosterOverlayPart":
                    flat_key = (
                        f"SeasonPoster{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"SeasonPoster{key}"
                    )
                elif group_name == "BackgroundOverlayPart":
                    flat_key = (
                        f"Background{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"Background{key}"
                    )
                elif group_name == "TitleCardOverlayPart":
                    flat_key = (
                        f"TitleCard{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"TitleCard{key}"
                    )
                elif group_name == "TitleCardTitleTextPart":
                    flat_key = (
                        f"TitleCardTitle{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"TitleCardTitle{key}"
                    )
                elif group_name == "TitleCardEPTextPart":
                    flat_key = (
                        f"TitleCardEP{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"TitleCardEP{key}"
                    )
                elif group_name == "ShowTitleOnSeasonPosterPart":
                    flat_key = (
                        f"ShowTitle{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"ShowTitle{key}"
                    )
                elif group_name == "CollectionTitlePosterPart":
                    flat_key = (
                        f"CollectionTitle{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"CollectionTitle{key}"
                    )
                elif group_name == "CollectionPosterOverlayPart":
                    flat_key = (
                        f"CollectionPoster{key[0].upper()}{key[1:]}"
                        if key[0].islower()
                        else f"CollectionPoster{key}"
                    )
                else:
                    # For simple groups (ApiPart, Notification, etc.), use original key
                    flat_key = key

            flat[flat_key] = value

    return flat


def unflatten_config(flat_config):
    """
    Convert flat config structure back to grouped structure for saving.

    Example:
        {"tmdbtoken": "xxx"} -> {"ApiPart": {"tmdbtoken": "xxx"}}
    """
    grouped = {}

    for key, value in flat_config.items():
        # Find the group for this key
        group_name = CONFIG_GROUPS.get(key)

        if not group_name:
            # Unknown key - try to determine group from prefix
            print(f"Warning: Unknown config key '{key}' - skipping")
            continue

        # Initialize group if it doesn't exist
        if group_name not in grouped:
            grouped[group_name] = {}

        # Remove prefix for storage (reverse of flatten logic)
        storage_key = key

        # Handle prefixed keys
        if key.startswith("Plex") and group_name == "PlexPart":
            if key == "PlexLibstoExclude":
                storage_key = "LibstoExclude"
            elif key == "PlexUploadExistingAssets":
                storage_key = "UploadExistingAssets"
            # PlexUrl, PlexUpload, etc. keep their original names
        elif key.startswith("Jellyfin") and group_name == "JellyfinPart":
            if key == "JellyfinLibstoExclude":
                storage_key = "LibstoExclude"
            elif key == "JellyfinUploadExistingAssets":
                storage_key = "UploadExistingAssets"
            elif key == "JellyfinReplaceThumbwithBackdrop":
                storage_key = "ReplaceThumbwithBackdrop"
        elif key.startswith("Emby") and group_name == "EmbyPart":
            if key == "EmbyLibstoExclude":
                storage_key = "LibstoExclude"
            elif key == "EmbyUploadExistingAssets":
                storage_key = "UploadExistingAssets"
            elif key == "EmbyReplaceThumbwithBackdrop":
                storage_key = "ReplaceThumbwithBackdrop"
        elif key.startswith("Poster") and group_name == "PosterOverlayPart":
            storage_key = key[6:]  # Remove "Poster" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif key.startswith("SeasonPoster") and group_name == "SeasonPosterOverlayPart":
            storage_key = key[12:]  # Remove "SeasonPoster" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif key.startswith("Background") and group_name == "BackgroundOverlayPart":
            storage_key = key[10:]  # Remove "Background" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif (
            key.startswith("TitleCardTitle") and group_name == "TitleCardTitleTextPart"
        ):
            storage_key = key[14:]  # Remove "TitleCardTitle" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif key.startswith("TitleCardEP") and group_name == "TitleCardEPTextPart":
            storage_key = key[11:]  # Remove "TitleCardEP" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif key.startswith("TitleCard") and group_name == "TitleCardOverlayPart":
            storage_key = key[9:]  # Remove "TitleCard" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif (
            key.startswith("ShowTitle") and group_name == "ShowTitleOnSeasonPosterPart"
        ):
            storage_key = key[9:]  # Remove "ShowTitle" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif (
            key.startswith("CollectionTitle")
            and group_name == "CollectionTitlePosterPart"
        ):
            storage_key = key[15:]  # Remove "CollectionTitle" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )
        elif (
            key.startswith("CollectionPoster")
            and group_name == "CollectionPosterOverlayPart"
        ):
            storage_key = key[16:]  # Remove "CollectionPoster" prefix
            storage_key = (
                storage_key[0].lower() + storage_key[1:] if storage_key else ""
            )

        grouped[group_name][storage_key] = value

    return grouped


# Friendly display names for UI
DISPLAY_NAMES = {
    # API Keys & Tokens
    "tvdbapi": "TVDB API Key",
    "tmdbtoken": "TMDB API Token",
    "FanartTvAPIKey": "Fanart.tv API Key",
    "PlexToken": "Plex Token",
    "JellyfinAPIKey": "Jellyfin API Key",
    "EmbyAPIKey": "Emby API Key",
    "FavProvider": "Favorite Provider",
    "tmdb_vote_sorting": "TMDB Vote Sorting",
    # Language & Preferences
    "PreferredLanguageOrder": "Preferred Language Order",
    "PreferredSeasonLanguageOrder": "Season Language Order",
    "PreferredBackgroundLanguageOrder": "Background Language Order",
    # Image Filters
    "WidthHeightFilter": "Width/Height Filter",
    "PosterMinWidth": "Poster Min Width",
    "PosterMinHeight": "Poster Min Height",
    "BgTcMinWidth": "Background/Title Card Min Width",
    "BgTcMinHeight": "Background/Title Card Min Height",
    # Plex Settings
    "PlexLibstoExclude": "Plex Libraries to Exclude",
    "PlexUrl": "Plex URL",
    "UsePlex": "Use Plex",
    "PlexUploadExistingAssets": "Upload Existing Assets to Plex",
    "PlexUpload": "Enable Plex Upload",
    # Jellyfin Settings
    "JellyfinLibstoExclude": "Jellyfin Libraries to Exclude",
    "JellyfinUrl": "Jellyfin URL",
    "UseJellyfin": "Use Jellyfin",
    "JellyfinUploadExistingAssets": "Upload Existing Assets to Jellyfin",
    "JellyfinReplaceThumbwithBackdrop": "Replace Thumbnail with Backdrop",
    # Emby Settings
    "EmbyLibstoExclude": "Emby Libraries to Exclude",
    "EmbyUrl": "Emby URL",
    "UseEmby": "Use Emby",
    "EmbyUploadExistingAssets": "Upload Existing Assets to Emby",
    "EmbyReplaceThumbwithBackdrop": "Replace Thumbnail with Backdrop",
    # Notifications
    "SendNotification": "Send Notifications",
    "AppriseUrl": "Apprise URL",
    "Discord": "Discord Webhook",
    "UseUptimeKuma": "Use Uptime Kuma",
    "UptimeKumaUrl": "Uptime Kuma URL",
    "DiscordUserName": "Discord Username",
    # General Settings
    "AssetPath": "Asset Path",
    "show_skipped": "Show Skipped Items",
    "magickinstalllocation": "ImageMagick Location",
    "maxLogs": "Maximum Log Files",
    "logLevel": "Log Level",
    "font": "Default Font",
    "backgroundfont": "Background Font",
    "titlecardfont": "Title Card Font",
    "collectionfont": "Collection Font",
    "RTLFont": "Right-to-Left Font",
    "overlayfile": "Overlay File",
    "backgroundoverlayfile": "Background Overlay File",
    "titlecardoverlayfile": "Title Card Overlay File",
    "seasonoverlayfile": "Season Overlay File",
    "collectionoverlayfile": "Collection Overlay File",
    "LibraryFolders": "Library Folders",
    "Posters": "Generate Posters",
    "SeasonPosters": "Generate Season Posters",
    "BackgroundPosters": "Generate Backgrounds",
    "TitleCards": "Generate Title Cards",
    "SkipTBA": "Skip TBA Episodes",
    "SkipJapTitle": "Skip Japanese Titles",
    "AssetCleanup": "Asset Cleanup",
    "AutoUpdateIM": "Auto-Update ImageMagick",
    "NewLineOnSpecificSymbols": "New Line on Specific Symbols",
    "NewLineSymbols": "New Line Symbols",
    "BackupPath": "Backup Path",
    "ForceRunningDeletion": "Force Running Deletion",
    "AutoUpdatePosterizarr": "Auto-Update Posterizarr",
    "ManualAssetPath": "Manual Asset Path",
    "SkipAddText": "Skip Add Text",
    "FollowSymlink": "Follow Symlinks",
    "poster4k": "4K Poster Overlay",
    "Poster1080p": "1080p Poster Overlay",
    "UsePosterResolutionOverlays": "Use Poster Resolution Overlays",
    "DisableHashValidation": "Disable Hash Validation",
    "Background4k": "4K Background Overlay",
    "Background1080p": "1080p Background Overlay",
    "TC4k": "4K Title Card Overlay",
    "TC1080p": "1080p Title Card Overlay",
    "UseBackgroundResolutionOverlays": "Use Background Resolution Overlays",
    "UseTCResolutionOverlays": "Use Title Card Resolution Overlays",
    "DisableOnlineAssetFetch": "Disable Online Asset Fetch",
    # Image Processing
    "ImageProcessing": "Image Processing",
    "outputQuality": "Output Quality",
    # Poster Settings
    "PosterFontAllCaps": "All Caps Font",
    "PosterAddBorder": "Add Border",
    "PosterAddText": "Add Text",
    "PosterAddOverlay": "Add Overlay",
    "PosterFontcolor": "Font Color",
    "PosterBordercolor": "Border Color",
    "PosterMinPointSize": "Min Font Size",
    "PosterMaxPointSize": "Max Font Size",
    "PosterBorderwidth": "Border Width",
    "PosterMaxWidth": "Max Text Width",
    "PosterMaxHeight": "Max Text Height",
    "PosterTextOffset": "Text Offset",
    "PosterAddTextStroke": "Add Text Stroke",
    "PosterStrokecolor": "Stroke Color",
    "PosterStrokewidth": "Stroke Width",
    "PosterLineSpacing": "Line Spacing",
    "PosterTextGravity": "Text Gravity",
    # Season Poster Settings
    "SeasonPosterFontAllCaps": "All Caps Font",
    "SeasonPosterAddBorder": "Add Border",
    "SeasonPosterAddText": "Add Text",
    "SeasonPosterAddOverlay": "Add Overlay",
    "SeasonPosterFontcolor": "Font Color",
    "SeasonPosterBordercolor": "Border Color",
    "SeasonPosterMinPointSize": "Min Font Size",
    "SeasonPosterMaxPointSize": "Max Font Size",
    "SeasonPosterBorderwidth": "Border Width",
    "SeasonPosterMaxWidth": "Max Text Width",
    "SeasonPosterMaxHeight": "Max Text Height",
    "SeasonPosterTextOffset": "Text Offset",
    "SeasonPosterAddTextStroke": "Add Text Stroke",
    "SeasonPosterStrokecolor": "Stroke Color",
    "SeasonPosterStrokewidth": "Stroke Width",
    "SeasonPosterLineSpacing": "Line Spacing",
    "SeasonPosterShowFallback": "Show Fallback",
    "SeasonPosterTextGravity": "Text Gravity",
    # Background Settings
    "BackgroundFontAllCaps": "All Caps Font",
    "BackgroundAddOverlay": "Add Overlay",
    "BackgroundAddBorder": "Add Border",
    "BackgroundAddText": "Add Text",
    "BackgroundFontcolor": "Font Color",
    "BackgroundBordercolor": "Border Color",
    "BackgroundMinPointSize": "Min Font Size",
    "BackgroundMaxPointSize": "Max Font Size",
    "BackgroundBorderwidth": "Border Width",
    "BackgroundMaxWidth": "Max Text Width",
    "BackgroundMaxHeight": "Max Text Height",
    "BackgroundTextOffset": "Text Offset",
    "BackgroundAddTextStroke": "Add Text Stroke",
    "BackgroundStrokecolor": "Stroke Color",
    "BackgroundStrokewidth": "Stroke Width",
    "BackgroundLineSpacing": "Line Spacing",
    "BackgroundTextGravity": "Text Gravity",
    # Title Card Overlay
    "TitleCardUseBackgroundAsTitleCard": "Use Background as Title Card",
    "TitleCardAddOverlay": "Add Overlay",
    "TitleCardAddBorder": "Add Border",
    "TitleCardBordercolor": "Border Color",
    "TitleCardBorderwidth": "Border Width",
    "TitleCardBackgroundFallback": "Background Fallback",
    # Title Card Title Text
    "TitleCardTitleFontAllCaps": "All Caps Font",
    "TitleCardTitleAddEPTitleText": "Add Episode Title Text",
    "TitleCardTitleFontcolor": "Font Color",
    "TitleCardTitleMinPointSize": "Min Font Size",
    "TitleCardTitleMaxPointSize": "Max Font Size",
    "TitleCardTitleMaxWidth": "Max Text Width",
    "TitleCardTitleMaxHeight": "Max Text Height",
    "TitleCardTitleTextOffset": "Text Offset",
    "TitleCardTitleAddTextStroke": "Add Text Stroke",
    "TitleCardTitleStrokecolor": "Stroke Color",
    "TitleCardTitleStrokewidth": "Stroke Width",
    "TitleCardTitleLineSpacing": "Line Spacing",
    "TitleCardTitleTextGravity": "Text Gravity",
    # Title Card Episode Text
    "TitleCardEPSeasonTCText": "Season Text Format",
    "TitleCardEPEpisodeTCText": "Episode Text Format",
    "TitleCardEPFontAllCaps": "All Caps Font",
    "TitleCardEPAddEPText": "Add Episode Text",
    "TitleCardEPFontcolor": "Font Color",
    "TitleCardEPMinPointSize": "Min Font Size",
    "TitleCardEPMaxPointSize": "Max Font Size",
    "TitleCardEPMaxWidth": "Max Text Width",
    "TitleCardEPMaxHeight": "Max Text Height",
    "TitleCardEPTextOffset": "Text Offset",
    "TitleCardEPAddTextStroke": "Add Text Stroke",
    "TitleCardEPStrokecolor": "Stroke Color",
    "TitleCardEPStrokewidth": "Stroke Width",
    "TitleCardEPLineSpacing": "Line Spacing",
    "TitleCardEPTextGravity": "Text Gravity",
    # Show Title on Season
    "ShowTitleAddShowTitletoSeason": "Add Show Title to Season",
    "ShowTitleFontAllCaps": "All Caps Font",
    "ShowTitleAddTextStroke": "Add Text Stroke",
    "ShowTitleStrokecolor": "Stroke Color",
    "ShowTitleStrokewidth": "Stroke Width",
    "ShowTitleFontcolor": "Font Color",
    "ShowTitleMinPointSize": "Min Font Size",
    "ShowTitleMaxPointSize": "Max Font Size",
    "ShowTitleMaxWidth": "Max Text Width",
    "ShowTitleMaxHeight": "Max Text Height",
    "ShowTitleTextOffset": "Text Offset",
    "ShowTitleLineSpacing": "Line Spacing",
    "ShowTitleTextGravity": "Text Gravity",
    # Collection Title
    "CollectionTitleAddCollectionTitle": "Add Collection Title",
    "CollectionTitleCollectionTitle": "Collection Title Text",
    "CollectionTitleFontAllCaps": "All Caps Font",
    "CollectionTitleAddTextStroke": "Add Text Stroke",
    "CollectionTitleStrokecolor": "Stroke Color",
    "CollectionTitleStrokewidth": "Stroke Width",
    "CollectionTitleFontcolor": "Font Color",
    "CollectionTitleMinPointSize": "Min Font Size",
    "CollectionTitleMaxPointSize": "Max Font Size",
    "CollectionTitleMaxWidth": "Max Text Width",
    "CollectionTitleMaxHeight": "Max Text Height",
    "CollectionTitleTextOffset": "Text Offset",
    "CollectionTitleLineSpacing": "Line Spacing",
    "CollectionTitleTextGravity": "Text Gravity",
    # Collection Poster
    "CollectionPosterFontAllCaps": "All Caps Font",
    "CollectionPosterAddBorder": "Add Border",
    "CollectionPosterAddText": "Add Text",
    "CollectionPosterAddTextStroke": "Add Text Stroke",
    "CollectionPosterStrokecolor": "Stroke Color",
    "CollectionPosterStrokewidth": "Stroke Width",
    "CollectionPosterAddOverlay": "Add Overlay",
    "CollectionPosterFontcolor": "Font Color",
    "CollectionPosterBordercolor": "Border Color",
    "CollectionPosterMinPointSize": "Min Font Size",
    "CollectionPosterMaxPointSize": "Max Font Size",
    "CollectionPosterBorderwidth": "Border Width",
    "CollectionPosterMaxWidth": "Max Text Width",
    "CollectionPosterMaxHeight": "Max Text Height",
    "CollectionPosterTextOffset": "Text Offset",
    "CollectionPosterLineSpacing": "Line Spacing",
    "CollectionPosterTextGravity": "Text Gravity",
}


def get_display_name(key):
    """Get friendly display name for a config key"""
    return DISPLAY_NAMES.get(key, key.replace("_", " ").title())


def get_tooltip(key):
    """Get tooltip description for a config key"""
    return CONFIG_TOOLTIPS.get(key, "")
