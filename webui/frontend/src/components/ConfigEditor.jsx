import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  Save,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Settings,
  Database,
  Palette,
  Type,
  Bell,
  Check,
  X,
  List,
  Lock,
  Hash,
  Loader2,
  Search,
  HelpCircle,
  Upload,
  Image,
  Eye,
  Expand,
  Minimize,
  ExternalLink,
  Github,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import ValidateButton from "./ValidateButton";
import Notification from "./Notification";
import LanguageOrderSelector from "./LanguageOrderSelector";
import LibraryExclusionSelector from "./LibraryExclusionSelector";
import { useToast } from "../context/ToastContext";

const API_URL = "/api";

// Mapping von Gruppen zu README-Abschnitten
const README_LINKS = {
  "WebUI Settings": "https://github.com/fscorrupt/Posterizarr#webui",
  "API Keys & Tokens": "https://github.com/fscorrupt/Posterizarr#apipart",
  ApiPart: "https://github.com/fscorrupt/Posterizarr#apipart",
  "Language & Preferences": "https://github.com/fscorrupt/Posterizarr#apipart",
  "Image Filters": "https://github.com/fscorrupt/Posterizarr#apipart",
  "Plex Settings": "https://github.com/fscorrupt/Posterizarr#plexpart",
  PlexPart: "https://github.com/fscorrupt/Posterizarr#plexpart",
  "Jellyfin Settings": "https://github.com/fscorrupt/Posterizarr#jellyfinpart",
  JellyfinPart: "https://github.com/fscorrupt/Posterizarr#jellyfinpart",
  "Emby Settings": "https://github.com/fscorrupt/Posterizarr#embypart",
  EmbyPart: "https://github.com/fscorrupt/Posterizarr#embypart",
  Notifications: "https://github.com/fscorrupt/Posterizarr#notification",
  Notification: "https://github.com/fscorrupt/Posterizarr#notification",
  "General Settings":
    "https://github.com/fscorrupt/Posterizarr#prerequisitepart",
  PrerequisitePart: "https://github.com/fscorrupt/Posterizarr#prerequisitepart",
  "Overlay Files": "https://github.com/fscorrupt/Posterizarr#prerequisitepart",
  "Resolution Overlays":
    "https://github.com/fscorrupt/Posterizarr#prerequisitepart",
  Fonts: "https://github.com/fscorrupt/Posterizarr#prerequisitepart",
  "Text Formatting":
    "https://github.com/fscorrupt/Posterizarr#prerequisitepart",
  "Image Processing": "https://github.com/fscorrupt/Posterizarr#overlaypart",
  OverlayPart: "https://github.com/fscorrupt/Posterizarr#overlaypart",
  "Poster Settings":
    "https://github.com/fscorrupt/Posterizarr#posteroverlaypart",
  PosterOverlayPart:
    "https://github.com/fscorrupt/Posterizarr#posteroverlaypart",
  "Season Poster Settings":
    "https://github.com/fscorrupt/Posterizarr#seasonposteroverlaypart",
  SeasonPosterOverlayPart:
    "https://github.com/fscorrupt/Posterizarr#seasonposteroverlaypart",
  "Show Title on Season":
    "https://github.com/fscorrupt/Posterizarr#showtilteonseasonposterpart",
  ShowTitleOnSeasonPosterPart:
    "https://github.com/fscorrupt/Posterizarr#showtilteonseasonposterpart",
  "Background Settings":
    "https://github.com/fscorrupt/Posterizarr#backgroundoverlaypart",
  BackgroundOverlayPart:
    "https://github.com/fscorrupt/Posterizarr#backgroundoverlaypart",
  "Title Card Overlay":
    "https://github.com/fscorrupt/Posterizarr#titlecardoverlaypart",
  TitleCardOverlayPart:
    "https://github.com/fscorrupt/Posterizarr#titlecardoverlaypart",
  "Title Card Title Text":
    "https://github.com/fscorrupt/Posterizarr#titlecardtitletextpart",
  TitleCardTitleTextPart:
    "https://github.com/fscorrupt/Posterizarr#titlecardtitletextpart",
  "Title Card Episode Text":
    "https://github.com/fscorrupt/Posterizarr#titlecardepisodetextpart",
  TitleCardEPTextPart:
    "https://github.com/fscorrupt/Posterizarr#titlecardepisodetextpart",
  "Collection Poster":
    "https://github.com/fscorrupt/Posterizarr#collectionposteroverlaypart",
  CollectionPosterOverlayPart:
    "https://github.com/fscorrupt/Posterizarr#collectionposteroverlaypart",
  "Collection Title":
    "https://github.com/fscorrupt/Posterizarr#collectiontitleposterpart",
  CollectionTitlePosterPart:
    "https://github.com/fscorrupt/Posterizarr#collectiontitleposterpart",
};

// Comprehensive tooltip descriptions for all config variables
const getConfigTooltips = (language) => {
  const tooltips = {
    en: {
      // WebUI Settings
      basicAuthEnabled:
        "Enable Basic Authentication to protect the Web UI. Set to true to require username/password login (Default: false)",
      basicAuthUsername:
        "Username for Basic Authentication. Change this from the default 'admin' for better security (Default: admin)",
      basicAuthPassword:
        "Password for Basic Authentication. IMPORTANT: Change this from the default 'posterizarr' before enabling auth! (Default: posterizarr)",
      webuiLogLevel:
        "Set the log level for the WebUI backend server. DEBUG: Most detailed logging; INFO: General information (default); WARNING: Only warnings and errors; ERROR: Only errors; CRITICAL: Only critical errors",
      // ApiPart
      tvdbapi:
        "Your TVDB Project API key. If you are a TVDB subscriber, you can append your PIN to the end of your API key in the format YourApiKey#YourPin",
      tmdbtoken: "Your TMDB API Read Access Token (the really long one)",
      FanartTvAPIKey: "Your Fanart.tv Personal API Key",
      PlexToken:
        "Your Plex authentication token (Leave empty if not using Plex)",
      JellyfinAPIKey:
        "Your Jellyfin API key (You can create an API key from inside Jellyfin at Settings > Advanced > Api Keys)",
      EmbyAPIKey:
        "Your Emby API key (You can create an API key from inside Emby at Settings > Advanced > Api Keys)",
      FavProvider:
        "Set your preferred provider: tmdb (recommended), fanart, tvdb, or plex (not recommended for textless)",
      tmdb_vote_sorting:
        "Picture sorting via TMDB API: vote_average, vote_count, or primary (default TMDB view)",
      PreferredLanguageOrder:
        "Specify language preferences. Default is xx,en,de (xx is Textless). Use 2-digit ISO 3166-1 language codes. Setting to 'xx' only searches for textless posters",
      PreferredSeasonLanguageOrder:
        "Specify language preferences for seasons. Default is xx,en,de (xx is Textless). Use 2-digit ISO 3166-1 language codes",
      PreferredBackgroundLanguageOrder:
        "Specify language preferences for backgrounds. Default is PleaseFillMe (will take your poster lang order). Setting to 'xx' only searches for textless",
      PreferredTCLanguageOrder:
        "Specify language preferences for title cards/episode stills. Default is PleaseFillMe (will take your poster lang order). Use 2-digit ISO 3166-1 language codes",
      WidthHeightFilter:
        "If set to true, an additional resolution filter will be applied to Posters/Backgrounds (TMDB and TVDB) and Titlecards (TMDB only)",
      PosterMinWidth:
        "Minimum poster width filter—greater than or equal to specified value (default: 2000)",
      PosterMinHeight:
        "Minimum poster height filter—greater than or equal to specified value (default: 3000)",
      BgTcMinWidth:
        "Minimum background/titlecard width filter—greater than or equal to specified value (default: 3840)",
      BgTcMinHeight:
        "Minimum background/titlecard height filter—greater than or equal to specified value (default: 2160)",

      // PlexPart
      PlexLibstoExclude:
        "Plex libraries, by name, to exclude from processing (comma-separated list)",
      PlexUrl:
        "Plex server URL (e.g., http://192.168.1.1:32400 or http://myplexserver.com:32400). This field is only enabled when Plex is selected as your active media server",
      UsePlex:
        "Enable Plex as your media server. NOTE: Only ONE media server can be active at a time (Plex, Jellyfin, or Emby)",
      PlexUploadExistingAssets:
        "If set to true, the script will check local assets and upload them to Plex, but only if Plex does not already have EXIF data from Posterizarr, Kometa, or TCM",
      PlexUpload:
        "If set to true, Posterizarr will directly upload the artwork to Plex (handy if you do not use Kometa)",

      // JellyfinPart
      JellyfinLibstoExclude:
        "Jellyfin libraries, by local folder name, to exclude from processing (comma-separated list)",
      JellyfinUrl:
        "Jellyfin server URL (e.g., http://192.168.1.1:8096 or http://myplexserver.com:8096). This field is enabled when either Jellyfin is selected as your active media server OR when JellySync is enabled",
      UseJellyfin:
        "Enable Jellyfin as your media server. NOTE: Only ONE media server can be active at a time (Plex, Jellyfin, or Emby)",
      UseJellySync:
        "Enable synchronization with your Jellyfin server. When enabled, the Jellyfin URL and API Key fields become available for configuration. NOTE: This toggle is disabled when Jellyfin is selected as the active media server",
      JellyfinUploadExistingAssets:
        "If set to true, the script will check local assets and upload them to Jellyfin, but only if Jellyfin does not already have EXIF data from Posterizarr, Kometa, or TCM. NOTE: This requires UseJellyfin to be enabled",
      JellyfinReplaceThumbwithBackdrop:
        "If set to true, the script will replace the Thumb picture with the backdrop image. This only occurs if BackgroundPosters is also set to true. NOTE: This requires UseJellyfin to be enabled",

      // EmbyPart
      EmbyLibstoExclude:
        "Emby libraries, by local folder name, to exclude from processing (comma-separated list)",
      EmbyUrl:
        "Emby server URL (e.g., http://192.168.1.1:8096/emby or http://myplexserver.com:8096/emby). This field is enabled when either Emby is selected as your active media server OR when EmbySync is enabled",
      UseEmby:
        "Enable Emby as your media server. NOTE: Only ONE media server can be active at a time (Plex, Jellyfin, or Emby)",
      UseEmbySync:
        "Enable synchronization with your Emby server. When enabled, the Emby URL and API Key fields become available for configuration. NOTE: This toggle is disabled when Emby is selected as the active media server",
      EmbyUploadExistingAssets:
        "If set to true, the script will check local assets and upload them to Emby, but only if Emby does not already have EXIF data from Posterizarr, Kometa, or TCM. NOTE: This requires UseEmby to be enabled",
      EmbyReplaceThumbwithBackdrop:
        "If set to true, the script will replace the Thumb picture with the backdrop image. This only occurs if BackgroundPosters is also set to true. NOTE: This requires UseEmby to be enabled",

      // Notification
      SendNotification:
        "Set to true if you want to send notifications via Discord or Apprise, else false",
      AppriseUrl:
        "Only possible on Docker - URL for Apprise provider. See Apprise documentation for details",
      Discord: "Discord Webhook URL for notifications",
      DiscordUserName:
        "Username for the Discord webhook (default is Posterizarr)",
      UseUptimeKuma: "Set to true if you want to send webhook to Uptime-Kuma",
      UptimeKumaUrl: "Uptime-Kuma Webhook URL",

      // PrerequisitePart
      AssetPath:
        "Path to store generated posters. On Docker, this should be /assets",
      BackupPath:
        "Path to store/download Plex posters when using the backup mode",
      ManualAssetPath:
        "If assets are placed in this directory with the exact naming convention, they will be preferred (must follow same naming convention as /assets)",
      SkipAddText:
        "If set to true, Posterizarr will skip adding text to the poster if it is flagged as a 'Poster with text' by the provider",
      FollowSymlink:
        "If set to true, Posterizarr will follow symbolic links in the specified directories during hashtable creation",
      ForceRunningDeletion:
        "If set to true, Posterizarr will automatically delete the Running File. WARNING: May result in multiple concurrent runs sharing the same temp directory",
      AutoUpdatePosterizarr:
        "If set to true, Posterizarr will update itself to latest version (Only for non-Docker systems)",
      show_skipped:
        "If set to true, verbose logging of already created assets will be displayed. On large libraries, this may appear as if the script is hanging",
      magickinstalllocation:
        "The path to the ImageMagick installation where magick.exe is located. If using portable version, leave as './magick'. Container manages this automatically",
      maxLogs:
        "Number of Log folders you want to keep in RotatedLogs Folder (Log History)",
      logLevel:
        "Sets the verbosity of logging. 1 = Warning/Error. 2 = Info/Warning/Error (default). 3 = Info/Warning/Error/Debug (most verbose)",
      font: "Default font file name for text overlays",
      RTLFont:
        "Right-to-Left font file name for RTL languages (Arabic, Hebrew, etc.)",
      backgroundfont: "Font file name for background text",
      titlecardfont: "Font file name for title card text",
      collectionfont: "Font file name for collection titles",
      overlayfile: "Default overlay file name (e.g., overlay.png)",
      seasonoverlayfile: "Season poster overlay file name",
      backgroundoverlayfile: "Background overlay file name",
      titlecardoverlayfile: "Title Card overlay file name",
      collectionoverlayfile: "Collection overlay file name",
      poster4k:
        "4K Poster overlay file name (overlay must match Poster dimensions 2000x3000)",
      Poster1080p:
        "1080p Poster overlay file name (overlay must match Poster dimensions 2000x3000)",
      Background4k:
        "4K Background overlay file name (overlay must match Background dimensions 3840x2160)",
      Background1080p:
        "1080p Background overlay file name (overlay must match Background dimensions 3840x2160)",
      TC4k: "4K TitleCard overlay file name (overlay must match dimensions 3840x2160)",
      TC1080p:
        "1080p TitleCard overlay file name (overlay must match dimensions 3840x2160)",
      UsePosterResolutionOverlays:
        "Set to true to apply specific overlay with resolution for 4k/1080p posters. If you only want 4k, add your default overlay file also for Poster1080p",
      UseBackgroundResolutionOverlays:
        "Set to true to apply specific overlay with resolution for 4k/1080p backgrounds. If you only want 4k, add your default overlay file also for Background1080p",
      UseTCResolutionOverlays:
        "Set to true to apply specific overlay with resolution for 4k/1080p title cards. If you only want 4k, add your default overlay file for TC1080p",
      LibraryFolders:
        "Set to false for asset structure in one flat folder or true to split into library media folders like Kometa needs it",
      Posters: "Set to true to create movie/show posters",
      SeasonPosters: "Set to true to also create season posters",
      BackgroundPosters: "Set to true to also create background posters",
      TitleCards: "Set to true to also create title cards",
      SkipTBA:
        "Set to true to skip TitleCard creation if the Title text is 'TBA'",
      SkipJapTitle:
        "Set to true to skip TitleCard creation if the Title text is Japanese or Chinese",
      AssetCleanup:
        "Set to true to cleanup Assets that are no longer in Plex. IMPORTANT: Risk of data loss from excluded libraries - ensure all active asset libraries are included",
      AutoUpdateIM:
        "Set to true to Auto-Update ImageMagick Portable Version (Does not work with Docker/Unraid). Warning: Untested versions may break things",
      NewLineOnSpecificSymbols:
        "Set to true to enable automatic insertion of a newline character at each occurrence of specific symbols in NewLineSymbols within the title text",
      NewLineSymbols:
        "A list of symbols that will trigger a newline insertion when NewLineOnSpecificSymbols is true. Separate each symbol with comma (e.g., ' - ', ':')",
      DisableHashValidation:
        "Set to true to skip hash validation (Default: false). Note: This may produce bloat, as every item will be re-uploaded to media servers",
      DisableOnlineAssetFetch:
        "Set to true to skip all online lookups and use only locally available assets (Default: false)",

      // OverlayPart
      ImageProcessing:
        "Set to true if you want the ImageMagick part (text, overlay and/or border); if false, it only downloads the posters",
      outputQuality:
        "Image output quality (default is 92%). Setting to 100% doubles the image size",

      // PosterOverlayPart
      PosterFontAllCaps: "Set to true for all caps text on posters, else false",
      PosterAddBorder: "Set to true to add a border to the poster image",
      PosterAddText: "Set to true to add text to the poster image",
      PosterAddOverlay:
        "Set to true to add the defined overlay file to the poster image",
      PosterFontcolor:
        "Color of font text on posters (e.g., #FFFFFF for white)",
      PosterBordercolor: "Color of border on posters (e.g., #000000 for black)",
      PosterMinPointSize: "Minimum size of text in poster (in points)",
      PosterMaxPointSize: "Maximum size of text in poster (in points)",
      PosterBorderwidth: "Border width in pixels",
      PosterMaxWidth: "Maximum width of text box on poster",
      PosterMaxHeight: "Maximum height of text box on poster",
      PosterTextOffset:
        "Text box offset from the bottom of the picture (use +200 or -150 format)",
      PosterAddTextStroke: "Set to true to add stroke/outline to text",
      PosterStrokecolor:
        "Color of text stroke/outline (e.g., #000000 for black)",
      PosterStrokewidth: "Stroke width in pixels",
      PosterLineSpacing:
        "Adjust the height between lines of text (Default is 0)",
      PosterTextGravity:
        "Specifies the text alignment within the textbox (Default is south = bottom center)",

      // SeasonPosterOverlayPart
      SeasonPosterFontAllCaps:
        "Set to true for all caps text on season posters, else false",
      SeasonPosterAddBorder:
        "Set to true to add a border to the season poster image",
      SeasonPosterAddText: "Set to true to add text to the season poster image",
      SeasonPosterAddOverlay:
        "Set to true to add the defined overlay file to the season poster image",
      SeasonPosterFontcolor: "Color of font text on season posters",
      SeasonPosterBordercolor: "Color of border on season posters",
      SeasonPosterMinPointSize: "Minimum size of text in season poster",
      SeasonPosterMaxPointSize: "Maximum size of text in season poster",
      SeasonPosterBorderwidth: "Border width in pixels for season posters",
      SeasonPosterMaxWidth: "Maximum width of text box on season poster",
      SeasonPosterMaxHeight: "Maximum height of text box on season poster",
      SeasonPosterTextOffset:
        "Text box offset from the bottom of the season poster (use +200 or -150 format)",
      SeasonPosterAddTextStroke:
        "Set to true to add stroke/outline to text on season posters",
      SeasonPosterStrokecolor: "Color of text stroke/outline on season posters",
      SeasonPosterStrokewidth: "Stroke width in pixels for season posters",
      SeasonPosterLineSpacing:
        "Adjust the height between lines of text on season posters (Default is 0)",
      SeasonPosterShowFallback:
        "Set to true if you want to fallback to show poster if no season poster was found",
      SeasonPosterTextGravity:
        "Specifies the text alignment within the textbox on season posters (Default is south)",

      // BackgroundOverlayPart
      BackgroundFontAllCaps:
        "Set to true for all caps text on backgrounds, else false",
      BackgroundAddOverlay:
        "Set to true to add the defined background overlay file to the background image",
      BackgroundAddBorder:
        "Set to true to add a border to the background image",
      BackgroundAddText: "Set to true to add text to the background image",
      BackgroundFontcolor: "Color of font text on backgrounds",
      BackgroundBordercolor: "Color of border on backgrounds",
      BackgroundMinPointSize: "Minimum size of text in background image",
      BackgroundMaxPointSize: "Maximum size of text in background image",
      BackgroundBorderwidth: "Border width in pixels for backgrounds",
      BackgroundMaxWidth: "Maximum width of text box in background image",
      BackgroundMaxHeight: "Maximum height of text box in background image",
      BackgroundTextOffset:
        "Text box offset from the bottom of the background image (use +200 or -150 format)",
      BackgroundAddTextStroke:
        "Set to true to add stroke/outline to text on backgrounds",
      BackgroundStrokecolor: "Color of text stroke/outline on backgrounds",
      BackgroundStrokewidth: "Stroke width in pixels for backgrounds",
      BackgroundLineSpacing:
        "Adjust the height between lines of text on backgrounds (Default is 0)",
      BackgroundTextGravity:
        "Specifies the text alignment within the textbox on backgrounds (Default is south)",

      // TitleCardOverlayPart
      TitleCardUseBackgroundAsTitleCard:
        "Set to true if you prefer show background as TitleCard (default is false, which uses episode image)",
      TitleCardAddOverlay:
        "Set to true to add the defined TitleCard overlay file to the TitleCard image",
      TitleCardAddBorder: "Set to true to add a border to the TitleCard image",
      TitleCardBordercolor: "Color of border on title cards",
      TitleCardBorderwidth: "Border width in pixels for title cards",
      TitleCardBackgroundFallback:
        "Set to false if you want to skip Background fallback for TitleCard images if no TitleCard was found",

      // TitleCardTitleTextPart
      TitleCardTitleFontAllCaps:
        "Set to true for all caps episode title text on title cards, else false",
      TitleCardTitleAddEPTitleText:
        "Set to true to add episode title text to the TitleCard image",
      TitleCardTitleFontcolor:
        "Color of episode title font text on title cards",
      TitleCardTitleMinPointSize:
        "Minimum size of episode title text in TitleCard image",
      TitleCardTitleMaxPointSize:
        "Maximum size of episode title text in TitleCard image",
      TitleCardTitleMaxWidth:
        "Maximum width of episode title text box in TitleCard image",
      TitleCardTitleMaxHeight:
        "Maximum height of episode title text box in TitleCard image",
      TitleCardTitleTextOffset:
        "Episode title text box offset from the bottom of the TitleCard image (use +200 or -150 format)",
      TitleCardTitleAddTextStroke:
        "Set to true to add stroke/outline to episode title text on title cards",
      TitleCardTitleStrokecolor:
        "Color of episode title text stroke/outline on title cards",
      TitleCardTitleStrokewidth:
        "Stroke width in pixels for episode title text on title cards",
      TitleCardTitleLineSpacing:
        "Adjust the height between lines of episode title text on title cards (Default is 0)",
      TitleCardTitleTextGravity:
        "Specifies the episode title text alignment within the textbox on title cards (Default is south)",

      // TitleCardEPTextPart
      TitleCardEPSeasonTCText:
        "You can specify the default text for 'Season' that appears on TitleCard (e.g., 'STAFFEL' for German, 'SÄSONG' for Swedish)",
      TitleCardEPEpisodeTCText:
        "You can specify the default text for 'Episode' that appears on TitleCard (e.g., 'EPISODE', 'AVSNITT' for Swedish)",
      TitleCardEPFontAllCaps:
        "Set to true for all caps episode number text on title cards, else false",
      TitleCardEPAddEPText:
        "Set to true to add episode number text (Season X • Episode Y) to the TitleCard image",
      TitleCardEPFontcolor: "Color of episode number font text on title cards",
      TitleCardEPMinPointSize:
        "Minimum size of episode number text in TitleCard image",
      TitleCardEPMaxPointSize:
        "Maximum size of episode number text in TitleCard image",
      TitleCardEPMaxWidth:
        "Maximum width of episode number text box in TitleCard image",
      TitleCardEPMaxHeight:
        "Maximum height of episode number text box in TitleCard image",
      TitleCardEPTextOffset:
        "Episode number text box offset from the bottom of the TitleCard image (use +200 or -150 format)",
      TitleCardEPAddTextStroke:
        "Set to true to add stroke/outline to episode number text on title cards",
      TitleCardEPStrokecolor:
        "Color of episode number text stroke/outline on title cards",
      TitleCardEPStrokewidth:
        "Stroke width in pixels for episode number text on title cards",
      TitleCardEPLineSpacing:
        "Adjust the height between lines of episode number text on title cards (Default is 0)",
      TitleCardEPTextGravity:
        "Specifies the episode number text alignment within the textbox on title cards (Default is south)",

      // ShowTitleOnSeasonPosterPart
      ShowTitleAddShowTitletoSeason:
        "If set to true, it will add show title to season poster (Default: false)",
      ShowTitleFontAllCaps:
        "Set to true for all caps show title text on season posters, else false",
      ShowTitleAddTextStroke:
        "Set to true to add stroke/outline to show title text on season posters",
      ShowTitleStrokecolor:
        "Color of show title text stroke/outline on season posters",
      ShowTitleStrokewidth:
        "Stroke width in pixels for show title text on season posters",
      ShowTitleFontcolor: "Color of show title font text on season posters",
      ShowTitleMinPointSize:
        "Minimum size of show title text on season posters",
      ShowTitleMaxPointSize:
        "Maximum size of show title text on season posters",
      ShowTitleMaxWidth:
        "Maximum width of show title text box on season posters",
      ShowTitleMaxHeight:
        "Maximum height of show title text box on season posters",
      ShowTitleTextOffset:
        "Show title text box offset from the bottom of the season poster (use +200 or -150 format)",
      ShowTitleLineSpacing:
        "Adjust the height between lines of show title text on season posters (Default is 0)",
      ShowTitleTextGravity:
        "Specifies the show title text alignment within the textbox on season posters (Default is south)",

      // CollectionTitlePosterPart
      CollectionTitleAddCollectionTitle:
        "Set to true to add collection title text to collection posters",
      CollectionTitleCollectionTitle:
        "The text to display as collection title (e.g., 'COLLECTION', 'SAMMLUNG')",
      CollectionTitleFontAllCaps:
        "Set to true for all caps collection title text, else false",
      CollectionTitleAddTextStroke:
        "Set to true to add stroke/outline to collection title text",
      CollectionTitleStrokecolor:
        "Color of collection title text stroke/outline",
      CollectionTitleStrokewidth:
        "Stroke width in pixels for collection title text",
      CollectionTitleFontcolor: "Color of collection title font text",
      CollectionTitleMinPointSize: "Minimum size of collection title text",
      CollectionTitleMaxPointSize: "Maximum size of collection title text",
      CollectionTitleMaxWidth: "Maximum width of collection title text box",
      CollectionTitleMaxHeight: "Maximum height of collection title text box",
      CollectionTitleTextOffset:
        "Collection title text box offset from the bottom of the poster (use +200 or -150 format)",
      CollectionTitleLineSpacing:
        "Adjust the height between lines of collection title text (Default is 0)",
      CollectionTitleTextGravity:
        "Specifies the collection title text alignment within the textbox (Default is south)",

      // CollectionPosterOverlayPart
      CollectionPosterFontAllCaps:
        "Set to true for all caps text on collection posters, else false",
      CollectionPosterAddBorder:
        "Set to true to add a border to the collection poster image",
      CollectionPosterAddText:
        "Set to true to add text to the collection poster image",
      CollectionPosterAddTextStroke:
        "Set to true to add stroke/outline to text on collection posters",
      CollectionPosterStrokecolor:
        "Color of text stroke/outline on collection posters",
      CollectionPosterStrokewidth:
        "Stroke width in pixels for collection posters",
      CollectionPosterAddOverlay:
        "Set to true to add the defined overlay file to the collection poster image",
      CollectionPosterFontcolor: "Color of font text on collection posters",
      CollectionPosterBordercolor: "Color of border on collection posters",
      CollectionPosterMinPointSize: "Minimum size of text in collection poster",
      CollectionPosterMaxPointSize: "Maximum size of text in collection poster",
      CollectionPosterBorderwidth:
        "Border width in pixels for collection posters",
      CollectionPosterMaxWidth:
        "Maximum width of text box on collection poster",
      CollectionPosterMaxHeight:
        "Maximum height of text box on collection poster",
      CollectionPosterTextOffset:
        "Text box offset from the bottom of the collection poster (use +200 or -150 format)",
      CollectionPosterLineSpacing:
        "Adjust the height between lines of text on collection posters (Default is 0)",
      CollectionPosterTextGravity:
        "Specifies the text alignment within the textbox on collection posters (Default is south)",
    },
    de: {
      // WebUI Settings
      basicAuthEnabled:
        "Aktivieren Sie die Basis-Authentifizierung zum Schutz der Web-UI. Setzen Sie auf true, um Benutzername/Passwort-Anmeldung zu erfordern (Standard: false)",
      basicAuthUsername:
        "Benutzername für Basis-Authentifizierung. Ändern Sie dies vom Standard 'admin' für bessere Sicherheit (Standard: admin)",
      basicAuthPassword:
        "Passwort für Basis-Authentifizierung. WICHTIG: Ändern Sie dies vom Standard 'posterizarr', bevor Sie die Authentifizierung aktivieren! (Standard: posterizarr)",
      webuiLogLevel:
        "Legen Sie die Log-Stufe für den WebUI-Backend-Server fest. DEBUG: Detaillierteste Protokollierung; INFO: Allgemeine Informationen (Standard); WARNING: Nur Warnungen und Fehler; ERROR: Nur Fehler; CRITICAL: Nur kritische Fehler",
      // ApiPart
      tvdbapi:
        "Ihr TVDB Project API-Schlüssel. Wenn Sie ein TVDB-Abonnent sind, können Sie Ihre PIN am Ende Ihres API-Schlüssels im Format IhrApiKey#IhrPin anhängen",
      tmdbtoken: "Ihr TMDB API Read Access Token (der sehr lange)",
      FanartTvAPIKey: "Ihr Fanart.tv Personal API-Schlüssel",
      PlexToken:
        "Ihr Plex-Authentifizierungstoken (Leer lassen, wenn Plex nicht verwendet wird)",
      JellyfinAPIKey:
        "Ihr Jellyfin API-Schlüssel (Sie können einen API-Schlüssel in Jellyfin erstellen unter Einstellungen > Erweitert > Api-Schlüssel)",
      EmbyAPIKey:
        "Ihr Emby API-Schlüssel (Sie können einen API-Schlüssel in Emby erstellen unter Einstellungen > Erweitert > Api-Schlüssel)",
      FavProvider:
        "Setzen Sie Ihren bevorzugten Anbieter: tmdb (empfohlen), fanart, tvdb oder plex (nicht empfohlen für textlos)",
      tmdb_vote_sorting:
        "Bildsortierung über TMDB API: vote_average, vote_count oder primary (Standard-TMDB-Ansicht)",
      PreferredLanguageOrder:
        "Sprachpräferenzen festlegen. Standard ist xx,en,de (xx ist Textlos). Verwenden Sie 2-stellige ISO 3166-1 Sprachcodes. Einstellung auf 'xx' sucht nur nach textlosen Postern",
      PreferredSeasonLanguageOrder:
        "Sprachpräferenzen für Staffeln festlegen. Standard ist xx,en,de (xx ist Textlos). Verwenden Sie 2-stellige ISO 3166-1 Sprachcodes",
      PreferredBackgroundLanguageOrder:
        "Sprachpräferenzen für Hintergründe festlegen. Standard ist PleaseFillMe (übernimmt Ihre Poster-Sprachreihenfolge). Einstellung auf 'xx' sucht nur nach textlosen",
      PreferredTCLanguageOrder:
        "Sprachpräferenzen für Titelkarten/Episodenbilder festlegen. Standard ist PleaseFillMe (übernimmt Ihre Poster-Sprachreihenfolge). Verwenden Sie 2-stellige ISO 3166-1 Sprachcodes",
      WidthHeightFilter:
        "Wenn auf true gesetzt, wird ein zusätzlicher Auflösungsfilter auf Poster/Hintergründe (TMDB und TVDB) und Titelkarten (nur TMDB) angewendet",
      PosterMinWidth:
        "Mindestbreite für Poster-Filter – größer oder gleich dem angegebenen Wert (Standard: 2000)",
      PosterMinHeight:
        "Mindesthöhe für Poster-Filter – größer oder gleich dem angegebenen Wert (Standard: 3000)",
      BgTcMinWidth:
        "Mindestbreite für Hintergrund/Titelkarten-Filter – größer oder gleich dem angegebenen Wert (Standard: 3840)",
      BgTcMinHeight:
        "Mindesthöhe für Hintergrund/Titelkarten-Filter – größer oder gleich dem angegebenen Wert (Standard: 2160)",

      // PlexPart
      PlexLibstoExclude:
        "Plex-Bibliotheken, nach Namen, die von der Verarbeitung ausgeschlossen werden sollen (kommagetrennte Liste)",
      PlexUrl:
        "Plex-Server-URL (z.B. http://192.168.1.1:32400 oder http://meinplexserver.com:32400). Dieses Feld ist nur aktiviert, wenn Plex als aktiver Medienserver ausgewählt ist",
      UsePlex:
        "Plex als Medienserver aktivieren. HINWEIS: Nur EIN Medienserver kann gleichzeitig aktiv sein (Plex, Jellyfin oder Emby)",
      PlexUploadExistingAssets:
        "Wenn auf true gesetzt, prüft das Skript lokale Assets und lädt sie zu Plex hoch, aber nur wenn Plex noch keine EXIF-Daten von Posterizarr, Kometa oder TCM hat",
      PlexUpload:
        "Wenn auf true gesetzt, lädt Posterizarr die Grafiken direkt zu Plex hoch (praktisch, wenn Sie Kometa nicht verwenden)",

      // JellyfinPart
      JellyfinLibstoExclude:
        "Jellyfin-Bibliotheken, nach lokalem Ordnernamen, die von der Verarbeitung ausgeschlossen werden sollen (kommagetrennte Liste)",
      JellyfinUrl:
        "Jellyfin-Server-URL (z.B. http://192.168.1.1:8096 oder http://meinplexserver.com:8096). Dieses Feld ist aktiviert, wenn entweder Jellyfin als aktiver Medienserver ausgewählt ist ODER wenn JellySync aktiviert ist",
      UseJellyfin:
        "Jellyfin als Medienserver aktivieren. HINWEIS: Nur EIN Medienserver kann gleichzeitig aktiv sein (Plex, Jellyfin oder Emby)",
      UseJellySync:
        "Synchronisation mit Ihrem Jellyfin-Server aktivieren. Wenn aktiviert, werden die Felder Jellyfin-URL und API-Schlüssel für die Konfiguration verfügbar. HINWEIS: Dieser Schalter ist deaktiviert, wenn Jellyfin als aktiver Medienserver ausgewählt ist",
      JellyfinUploadExistingAssets:
        "Wenn auf true gesetzt, prüft das Skript lokale Assets und lädt sie zu Jellyfin hoch, aber nur wenn Jellyfin noch keine EXIF-Daten von Posterizarr, Kometa oder TCM hat. HINWEIS: Dies erfordert, dass UseJellyfin aktiviert ist",
      JellyfinReplaceThumbwithBackdrop:
        "Wenn auf true gesetzt, ersetzt das Skript das Thumb-Bild durch das Backdrop-Bild. Dies geschieht nur, wenn BackgroundPosters ebenfalls auf true gesetzt ist. HINWEIS: Dies erfordert, dass UseJellyfin aktiviert ist",

      // EmbyPart
      EmbyLibstoExclude:
        "Emby-Bibliotheken, nach lokalem Ordnernamen, die von der Verarbeitung ausgeschlossen werden sollen (kommagetrennte Liste)",
      EmbyUrl:
        "Emby-Server-URL (z.B. http://192.168.1.1:8096/emby oder http://meinplexserver.com:8096/emby). Dieses Feld ist aktiviert, wenn entweder Emby als aktiver Medienserver ausgewählt ist ODER wenn EmbySync aktiviert ist",
      UseEmby:
        "Emby als Medienserver aktivieren. HINWEIS: Nur EIN Medienserver kann gleichzeitig aktiv sein (Plex, Jellyfin oder Emby)",
      UseEmbySync:
        "Synchronisation mit Ihrem Emby-Server aktivieren. Wenn aktiviert, werden die Felder Emby-URL und API-Schlüssel für die Konfiguration verfügbar. HINWEIS: Dieser Schalter ist deaktiviert, wenn Emby als aktiver Medienserver ausgewählt ist",
      EmbyUploadExistingAssets:
        "Wenn auf true gesetzt, prüft das Skript lokale Assets und lädt sie zu Emby hoch, aber nur wenn Emby noch keine EXIF-Daten von Posterizarr, Kometa oder TCM hat. HINWEIS: Dies erfordert, dass UseEmby aktiviert ist",
      EmbyReplaceThumbwithBackdrop:
        "Wenn auf true gesetzt, ersetzt das Skript das Thumb-Bild durch das Backdrop-Bild. Dies geschieht nur, wenn BackgroundPosters ebenfalls auf true gesetzt ist. HINWEIS: Dies erfordert, dass UseEmby aktiviert ist",

      // Notification
      SendNotification:
        "Auf true setzen, wenn Sie Benachrichtigungen per Discord oder Apprise senden möchten, sonst false",
      AppriseUrl:
        "Nur auf Docker möglich - URL für Apprise-Anbieter. Siehe Apprise-Dokumentation für Details",
      Discord: "Discord Webhook-URL für Benachrichtigungen",
      DiscordUserName:
        "Benutzername für den Discord-Webhook (Standard ist Posterizarr)",
      UseUptimeKuma:
        "Auf true setzen, wenn Sie Webhook an Uptime-Kuma senden möchten",
      UptimeKumaUrl: "Uptime-Kuma Webhook-URL",

      // PrerequisitePart
      AssetPath:
        "Pfad zum Speichern generierter Poster. Auf Docker sollte dies /assets sein",
      BackupPath:
        "Pfad zum Speichern/Herunterladen von Plex-Postern im Backup-Modus",
      ManualAssetPath:
        "Wenn Assets in diesem Verzeichnis mit der exakten Namenskonvention platziert werden, werden sie bevorzugt (muss dieselbe Namenskonvention wie /assets befolgen)",
      SkipAddText:
        "Wenn auf true gesetzt, überspringt Posterizarr das Hinzufügen von Text zum Poster, wenn es vom Anbieter als 'Poster mit Text' gekennzeichnet ist",
      FollowSymlink:
        "Wenn auf true gesetzt, folgt Posterizarr symbolischen Links in den angegebenen Verzeichnissen während der Hashtabellen-Erstellung",
      ForceRunningDeletion:
        "Wenn auf true gesetzt, löscht Posterizarr automatisch die Running-Datei. WARNUNG: Kann dazu führen, dass mehrere gleichzeitige Läufe dasselbe Temp-Verzeichnis teilen",
      AutoUpdatePosterizarr:
        "Wenn auf true gesetzt, aktualisiert sich Posterizarr selbst auf die neueste Version (Nur für Nicht-Docker-Systeme)",
      show_skipped:
        "Wenn auf true gesetzt, wird ausführliches Logging bereits erstellter Assets angezeigt. Bei großen Bibliotheken kann es so aussehen, als ob das Skript hängt",
      magickinstalllocation:
        "Der Pfad zur ImageMagick-Installation, wo sich magick.exe befindet. Wenn Sie die portable Version verwenden, lassen Sie './magick'. Container verwalten dies automatisch",
      maxLogs:
        "Anzahl der Log-Ordner, die Sie im RotatedLogs-Ordner behalten möchten (Log-Historie)",
      logLevel:
        "Setzt die Ausführlichkeit des Loggings. 1 = Warnung/Fehler. 2 = Info/Warnung/Fehler (Standard). 3 = Info/Warnung/Fehler/Debug (am ausführlichsten)",
      font: "Standard-Schriftartdatei für Text-Overlays",
      RTLFont:
        "Rechts-nach-Links-Schriftartdatei für RTL-Sprachen (Arabisch, Hebräisch, etc.)",
      backgroundfont: "Schriftartdatei für Hintergrundtext",
      titlecardfont: "Schriftartdatei für Titelkarten-Text",
      collectionfont: "Schriftartdatei für Sammlungstitel",
      overlayfile: "Standard-Overlay-Dateiname (z.B. overlay.png)",
      seasonoverlayfile: "Staffelposter-Overlay-Dateiname",
      backgroundoverlayfile: "Hintergrund-Overlay-Dateiname",
      titlecardoverlayfile: "Titelkarten-Overlay-Dateiname",
      collectionoverlayfile: "Sammlungs-Overlay-Dateiname",
      poster4k:
        "4K-Poster-Overlay-Dateiname (Overlay muss Poster-Dimensionen 2000x3000 entsprechen)",
      Poster1080p:
        "1080p-Poster-Overlay-Dateiname (Overlay muss Poster-Dimensionen 2000x3000 entsprechen)",
      Background4k:
        "4K-Hintergrund-Overlay-Dateiname (Overlay muss Hintergrund-Dimensionen 3840x2160 entsprechen)",
      Background1080p:
        "1080p-Hintergrund-Overlay-Dateiname (Overlay muss Hintergrund-Dimensionen 3840x2160 entsprechen)",
      TC4k: "4K-Titelkarten-Overlay-Dateiname (Overlay muss Dimensionen 3840x2160 entsprechen)",
      TC1080p:
        "1080p-Titelkarten-Overlay-Dateiname (Overlay muss Dimensionen 3840x2160 entsprechen)",
      UsePosterResolutionOverlays:
        "Auf true setzen, um spezifisches Overlay mit Auflösung für 4k/1080p-Poster anzuwenden. Wenn Sie nur 4k möchten, fügen Sie Ihre Standard-Overlay-Datei auch für Poster1080p hinzu",
      UseBackgroundResolutionOverlays:
        "Auf true setzen, um spezifisches Overlay mit Auflösung für 4k/1080p-Hintergründe anzuwenden. Wenn Sie nur 4k möchten, fügen Sie Ihre Standard-Overlay-Datei auch für Background1080p hinzu",
      UseTCResolutionOverlays:
        "Auf true setzen, um spezifisches Overlay mit Auflösung für 4k/1080p-Titelkarten anzuwenden. Wenn Sie nur 4k möchten, fügen Sie Ihre Standard-Overlay-Datei für TC1080p hinzu",
      LibraryFolders:
        "Auf false setzen für Asset-Struktur in einem flachen Ordner oder auf true, um in Bibliotheks-Medienordner aufzuteilen, wie Kometa es benötigt",
      Posters: "Auf true setzen, um Film-/Serienposter zu erstellen",
      SeasonPosters: "Auf true setzen, um auch Staffelposter zu erstellen",
      BackgroundPosters:
        "Auf true setzen, um auch Hintergrundposter zu erstellen",
      TitleCards: "Auf true setzen, um auch Titelkarten zu erstellen",
      SkipTBA:
        "Auf true setzen, um Titelkarten-Erstellung zu überspringen, wenn der Titeltext 'TBA' ist",
      SkipJapTitle:
        "Auf true setzen, um Titelkarten-Erstellung zu überspringen, wenn der Titeltext Japanisch oder Chinesisch ist",
      AssetCleanup:
        "Auf true setzen, um Assets zu bereinigen, die nicht mehr in Plex sind. WICHTIG: Risiko von Datenverlust durch ausgeschlossene Bibliotheken - stellen Sie sicher, dass alle aktiven Asset-Bibliotheken eingeschlossen sind",
      AutoUpdateIM:
        "Auf true setzen, um ImageMagick Portable Version automatisch zu aktualisieren (Funktioniert nicht mit Docker/Unraid). Warnung: Ungetestete Versionen können Probleme verursachen",
      NewLineOnSpecificSymbols:
        "Auf true setzen, um automatisches Einfügen eines Zeilenumbruchs bei jedem Vorkommen bestimmter Symbole in NewLineSymbols innerhalb des Titeltexts zu aktivieren",
      NewLineSymbols:
        "Eine Liste von Symbolen, die einen Zeilenumbruch auslösen, wenn NewLineOnSpecificSymbols true ist. Trennen Sie jedes Symbol mit Komma (z.B. ' - ', ':')",
      DisableHashValidation:
        "Auf true setzen, um Hash-Validierung zu überspringen (Standard: false). Hinweis: Dies kann Bloat erzeugen, da jedes Element erneut auf Medienserver hochgeladen wird",
      DisableOnlineAssetFetch:
        "Auf true setzen, um alle Online-Lookups zu überspringen und nur lokal verfügbare Assets zu verwenden (Standard: false)",

      // OverlayPart
      ImageProcessing:
        "Auf true setzen, wenn Sie den ImageMagick-Teil (Text, Overlay und/oder Rahmen) möchten; wenn false, werden nur die Poster heruntergeladen",
      outputQuality:
        "Bild-Ausgabequalität (Standard ist 92%). Einstellung auf 100% verdoppelt die Bildgröße",

      // PosterOverlayPart
      PosterFontAllCaps:
        "Auf true setzen für Großbuchstaben-Text auf Postern, sonst false",
      PosterAddBorder:
        "Auf true setzen, um einen Rahmen zum Posterbild hinzuzufügen",
      PosterAddText: "Auf true setzen, um Text zum Posterbild hinzuzufügen",
      PosterAddOverlay:
        "Auf true setzen, um die definierte Overlay-Datei zum Posterbild hinzuzufügen",
      PosterFontcolor:
        "Farbe des Schrifttexts auf Postern (z.B. #FFFFFF für Weiß)",
      PosterBordercolor:
        "Farbe des Rahmens auf Postern (z.B. #000000 für Schwarz)",
      PosterMinPointSize: "Minimale Textgröße im Poster (in Punkten)",
      PosterMaxPointSize: "Maximale Textgröße im Poster (in Punkten)",
      PosterBorderwidth: "Rahmenbreite in Pixeln",
      PosterMaxWidth: "Maximale Breite der Textbox auf dem Poster",
      PosterMaxHeight: "Maximale Höhe der Textbox auf dem Poster",
      PosterTextOffset:
        "Textbox-Versatz vom unteren Rand des Bildes (Format +200 oder -150 verwenden)",
      PosterAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Text hinzuzufügen",
      PosterStrokecolor:
        "Farbe der Textkontur/Umrandung (z.B. #000000 für Schwarz)",
      PosterStrokewidth: "Konturbreite in Pixeln",
      PosterLineSpacing: "Höhe zwischen Textzeilen anpassen (Standard ist 0)",
      PosterTextGravity:
        "Gibt die Textausrichtung innerhalb der Textbox an (Standard ist south = unten zentriert)",

      // SeasonPosterOverlayPart
      SeasonPosterFontAllCaps:
        "Auf true setzen für Großbuchstaben-Text auf Staffelpostern, sonst false",
      SeasonPosterAddBorder:
        "Auf true setzen, um einen Rahmen zum Staffelposterbild hinzuzufügen",
      SeasonPosterAddText:
        "Auf true setzen, um Text zum Staffelposterbild hinzuzufügen",
      SeasonPosterAddOverlay:
        "Auf true setzen, um die definierte Overlay-Datei zum Staffelposterbild hinzuzufügen",
      SeasonPosterFontcolor: "Farbe des Schrifttexts auf Staffelpostern",
      SeasonPosterBordercolor: "Farbe des Rahmens auf Staffelpostern",
      SeasonPosterMinPointSize: "Minimale Textgröße im Staffelposter",
      SeasonPosterMaxPointSize: "Maximale Textgröße im Staffelposter",
      SeasonPosterBorderwidth: "Rahmenbreite in Pixeln für Staffelposter",
      SeasonPosterMaxWidth: "Maximale Breite der Textbox auf dem Staffelposter",
      SeasonPosterMaxHeight: "Maximale Höhe der Textbox auf dem Staffelposter",
      SeasonPosterTextOffset:
        "Textbox-Versatz vom unteren Rand des Staffelposters (Format +200 oder -150 verwenden)",
      SeasonPosterAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Text auf Staffelpostern hinzuzufügen",
      SeasonPosterStrokecolor:
        "Farbe der Textkontur/Umrandung auf Staffelpostern",
      SeasonPosterStrokewidth: "Konturbreite in Pixeln für Staffelposter",
      SeasonPosterLineSpacing:
        "Höhe zwischen Textzeilen auf Staffelpostern anpassen (Standard ist 0)",
      SeasonPosterShowFallback:
        "Auf true setzen, wenn Sie auf Serienposter zurückgreifen möchten, wenn kein Staffelposter gefunden wurde",
      SeasonPosterTextGravity:
        "Gibt die Textausrichtung innerhalb der Textbox auf Staffelpostern an (Standard ist south)",

      // BackgroundOverlayPart
      BackgroundFontAllCaps:
        "Auf true setzen für Großbuchstaben-Text auf Hintergründen, sonst false",
      BackgroundAddOverlay:
        "Auf true setzen, um die definierte Hintergrund-Overlay-Datei zum Hintergrundbild hinzuzufügen",
      BackgroundAddBorder:
        "Auf true setzen, um einen Rahmen zum Hintergrundbild hinzuzufügen",
      BackgroundAddText:
        "Auf true setzen, um Text zum Hintergrundbild hinzuzufügen",
      BackgroundFontcolor: "Farbe des Schrifttexts auf Hintergründen",
      BackgroundBordercolor: "Farbe des Rahmens auf Hintergründen",
      BackgroundMinPointSize: "Minimale Textgröße im Hintergrundbild",
      BackgroundMaxPointSize: "Maximale Textgröße im Hintergrundbild",
      BackgroundBorderwidth: "Rahmenbreite in Pixeln für Hintergründe",
      BackgroundMaxWidth: "Maximale Breite der Textbox im Hintergrundbild",
      BackgroundMaxHeight: "Maximale Höhe der Textbox im Hintergrundbild",
      BackgroundTextOffset:
        "Textbox-Versatz vom unteren Rand des Hintergrundbildes (Format +200 oder -150 verwenden)",
      BackgroundAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Text auf Hintergründen hinzuzufügen",
      BackgroundStrokecolor: "Farbe der Textkontur/Umrandung auf Hintergründen",
      BackgroundStrokewidth: "Konturbreite in Pixeln für Hintergründe",
      BackgroundLineSpacing:
        "Höhe zwischen Textzeilen auf Hintergründen anpassen (Standard ist 0)",
      BackgroundTextGravity:
        "Gibt die Textausrichtung innerhalb der Textbox auf Hintergründen an (Standard ist south)",

      // TitleCardOverlayPart
      TitleCardUseBackgroundAsTitleCard:
        "Auf true setzen, wenn Sie Serien-Hintergrund als Titelkarte bevorzugen (Standard ist false, welches Episodenbild verwendet)",
      TitleCardAddOverlay:
        "Auf true setzen, um die definierte Titelkarten-Overlay-Datei zum Titelkartenbild hinzuzufügen",
      TitleCardAddBorder:
        "Auf true setzen, um einen Rahmen zum Titelkartenbild hinzuzufügen",
      TitleCardBordercolor: "Farbe des Rahmens auf Titelkarten",
      TitleCardBorderwidth: "Rahmenbreite in Pixeln für Titelkarten",
      TitleCardBackgroundFallback:
        "Auf false setzen, wenn Sie Hintergrund-Fallback für Titelkartenbilder überspringen möchten, wenn keine Titelkarte gefunden wurde",

      // TitleCardTitleTextPart
      TitleCardTitleFontAllCaps:
        "Auf true setzen für Großbuchstaben-Episodentiteltext auf Titelkarten, sonst false",
      TitleCardTitleAddEPTitleText:
        "Auf true setzen, um Episodentiteltext zum Titelkartenbild hinzuzufügen",
      TitleCardTitleFontcolor:
        "Farbe des Episodentitel-Schrifttexts auf Titelkarten",
      TitleCardTitleMinPointSize:
        "Minimale Größe des Episodentiteltexts im Titelkartenbild",
      TitleCardTitleMaxPointSize:
        "Maximale Größe des Episodentiteltexts im Titelkartenbild",
      TitleCardTitleMaxWidth:
        "Maximale Breite der Episodentitel-Textbox im Titelkartenbild",
      TitleCardTitleMaxHeight:
        "Maximale Höhe der Episodentitel-Textbox im Titelkartenbild",
      TitleCardTitleTextOffset:
        "Episodentitel-Textbox-Versatz vom unteren Rand des Titelkartenbildes (Format +200 oder -150 verwenden)",
      TitleCardTitleAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Episodentiteltext auf Titelkarten hinzuzufügen",
      TitleCardTitleStrokecolor:
        "Farbe der Episodentiteltext-Kontur/Umrandung auf Titelkarten",
      TitleCardTitleStrokewidth:
        "Konturbreite in Pixeln für Episodentiteltext auf Titelkarten",
      TitleCardTitleLineSpacing:
        "Höhe zwischen Zeilen des Episodentiteltexts auf Titelkarten anpassen (Standard ist 0)",
      TitleCardTitleTextGravity:
        "Gibt die Episodentiteltext-Ausrichtung innerhalb der Textbox auf Titelkarten an (Standard ist south)",

      // TitleCardEPTextPart
      TitleCardEPSeasonTCText:
        "Sie können den Standardtext für 'Season' festlegen, der auf Titelkarten erscheint (z.B. 'STAFFEL' für Deutsch, 'SÄSONG' für Schwedisch)",
      TitleCardEPEpisodeTCText:
        "Sie können den Standardtext für 'Episode' festlegen, der auf Titelkarten erscheint (z.B. 'EPISODE', 'AVSNITT' für Schwedisch)",
      TitleCardEPFontAllCaps:
        "Auf true setzen für Großbuchstaben-Episodennummerntext auf Titelkarten, sonst false",
      TitleCardEPAddEPText:
        "Auf true setzen, um Episodennummerntext (Staffel X • Episode Y) zum Titelkartenbild hinzuzufügen",
      TitleCardEPFontcolor:
        "Farbe des Episodennummern-Schrifttexts auf Titelkarten",
      TitleCardEPMinPointSize:
        "Minimale Größe des Episodennummerntexts im Titelkartenbild",
      TitleCardEPMaxPointSize:
        "Maximale Größe des Episodennummerntexts im Titelkartenbild",
      TitleCardEPMaxWidth:
        "Maximale Breite der Episodennummern-Textbox im Titelkartenbild",
      TitleCardEPMaxHeight:
        "Maximale Höhe der Episodennummern-Textbox im Titelkartenbild",
      TitleCardEPTextOffset:
        "Episodennummern-Textbox-Versatz vom unteren Rand des Titelkartenbildes (Format +200 oder -150 verwenden)",
      TitleCardEPAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Episodennummerntext auf Titelkarten hinzuzufügen",
      TitleCardEPStrokecolor:
        "Farbe der Episodennummerntext-Kontur/Umrandung auf Titelkarten",
      TitleCardEPStrokewidth:
        "Konturbreite in Pixeln für Episodennummerntext auf Titelkarten",
      TitleCardEPLineSpacing:
        "Höhe zwischen Zeilen des Episodennummerntexts auf Titelkarten anpassen (Standard ist 0)",
      TitleCardEPTextGravity:
        "Gibt die Episodennummerntext-Ausrichtung innerhalb der Textbox auf Titelkarten an (Standard ist south)",

      // ShowTitleOnSeasonPosterPart
      ShowTitleAddShowTitletoSeason:
        "Wenn auf true gesetzt, wird Serientitel zum Staffelposter hinzugefügt (Standard: false)",
      ShowTitleFontAllCaps:
        "Auf true setzen für Großbuchstaben-Serientiteltext auf Staffelpostern, sonst false",
      ShowTitleAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Serientiteltext auf Staffelpostern hinzuzufügen",
      ShowTitleStrokecolor:
        "Farbe der Serientiteltext-Kontur/Umrandung auf Staffelpostern",
      ShowTitleStrokewidth:
        "Konturbreite in Pixeln für Serientiteltext auf Staffelpostern",
      ShowTitleFontcolor:
        "Farbe des Serientitel-Schrifttexts auf Staffelpostern",
      ShowTitleMinPointSize:
        "Minimale Größe des Serientiteltexts auf Staffelpostern",
      ShowTitleMaxPointSize:
        "Maximale Größe des Serientiteltexts auf Staffelpostern",
      ShowTitleMaxWidth:
        "Maximale Breite der Serientitel-Textbox auf Staffelpostern",
      ShowTitleMaxHeight:
        "Maximale Höhe der Serientitel-Textbox auf Staffelpostern",
      ShowTitleTextOffset:
        "Serientitel-Textbox-Versatz vom unteren Rand des Staffelposters (Format +200 oder -150 verwenden)",
      ShowTitleLineSpacing:
        "Höhe zwischen Zeilen des Serientiteltexts auf Staffelpostern anpassen (Standard ist 0)",
      ShowTitleTextGravity:
        "Gibt die Serientiteltext-Ausrichtung innerhalb der Textbox auf Staffelpostern an (Standard ist south)",

      // CollectionTitlePosterPart
      CollectionTitleAddCollectionTitle:
        "Auf true setzen, um Sammlungstiteltext zu Sammlungspostern hinzuzufügen",
      CollectionTitleCollectionTitle:
        "Der als Sammlungstitel anzuzeigende Text (z.B. 'COLLECTION', 'SAMMLUNG')",
      CollectionTitleFontAllCaps:
        "Auf true setzen für Großbuchstaben-Sammlungstiteltext, sonst false",
      CollectionTitleAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Sammlungstiteltext hinzuzufügen",
      CollectionTitleStrokecolor:
        "Farbe der Sammlungstiteltext-Kontur/Umrandung",
      CollectionTitleStrokewidth:
        "Konturbreite in Pixeln für Sammlungstiteltext",
      CollectionTitleFontcolor: "Farbe des Sammlungstitel-Schrifttexts",
      CollectionTitleMinPointSize: "Minimale Größe des Sammlungstiteltexts",
      CollectionTitleMaxPointSize: "Maximale Größe des Sammlungstiteltexts",
      CollectionTitleMaxWidth: "Maximale Breite der Sammlungstitel-Textbox",
      CollectionTitleMaxHeight: "Maximale Höhe der Sammlungstitel-Textbox",
      CollectionTitleTextOffset:
        "Sammlungstitel-Textbox-Versatz vom unteren Rand des Posters (Format +200 oder -150 verwenden)",
      CollectionTitleLineSpacing:
        "Höhe zwischen Zeilen des Sammlungstiteltexts anpassen (Standard ist 0)",
      CollectionTitleTextGravity:
        "Gibt die Sammlungstiteltext-Ausrichtung innerhalb der Textbox an (Standard ist south)",

      // CollectionPosterOverlayPart
      CollectionPosterFontAllCaps:
        "Auf true setzen für Großbuchstaben-Text auf Sammlungspostern, sonst false",
      CollectionPosterAddBorder:
        "Auf true setzen, um einen Rahmen zum Sammlungsposterbild hinzuzufügen",
      CollectionPosterAddText:
        "Auf true setzen, um Text zum Sammlungsposterbild hinzuzufügen",
      CollectionPosterAddTextStroke:
        "Auf true setzen, um Kontur/Umrandung zum Text auf Sammlungspostern hinzuzufügen",
      CollectionPosterStrokecolor:
        "Farbe der Textkontur/Umrandung auf Sammlungspostern",
      CollectionPosterStrokewidth: "Konturbreite in Pixeln für Sammlungsposter",
      CollectionPosterAddOverlay:
        "Auf true setzen, um die definierte Overlay-Datei zum Sammlungsposterbild hinzuzufügen",
      CollectionPosterFontcolor: "Farbe des Schrifttexts auf Sammlungspostern",
      CollectionPosterBordercolor: "Farbe des Rahmens auf Sammlungspostern",
      CollectionPosterMinPointSize: "Minimale Textgröße im Sammlungsposter",
      CollectionPosterMaxPointSize: "Maximale Textgröße im Sammlungsposter",
      CollectionPosterBorderwidth: "Rahmenbreite in Pixeln für Sammlungsposter",
      CollectionPosterMaxWidth:
        "Maximale Breite der Textbox auf dem Sammlungsposter",
      CollectionPosterMaxHeight:
        "Maximale Höhe der Textbox auf dem Sammlungsposter",
      CollectionPosterTextOffset:
        "Textbox-Versatz vom unteren Rand des Sammlungsposters (Format +200 oder -150 verwenden)",
      CollectionPosterLineSpacing:
        "Höhe zwischen Textzeilen auf Sammlungspostern anpassen (Standard ist 0)",
      CollectionPosterTextGravity:
        "Gibt die Textausrichtung innerhalb der Textbox auf Sammlungspostern an (Standard ist south)",
    },
  };

  return tooltips[language] || tooltips.en;
};

// Helper function to remove redundant prefixes from setting keys for display
const getCleanSettingKey = (key) => {
  const prefixes = [
    "CollectionTitle",
    "CollectionPoster",
    "SeasonPoster",
    "TitleCardTitle",
    "TitleCardEP",
    "TitleCard",
    "ShowTitle",
    "Background",
    "Poster",
  ];

  for (const prefix of prefixes) {
    if (key.startsWith(prefix)) {
      const remainder = key.slice(prefix.length);
      // Only remove prefix if there's something left after it
      if (remainder) {
        return remainder;
      }
    }
  }

  return key;
};

function ConfigEditor() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { showSuccess, showError, showInfo } = useToast();
  const CONFIG_TOOLTIPS = getConfigTooltips(i18n.language);
  const [config, setConfig] = useState(null);
  const [uiGroups, setUiGroups] = useState(null);
  const [displayNames, setDisplayNames] = useState({});
  const [usingFlatStructure, setUsingFlatStructure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null); // Error state for display
  const [expandedGroups, setExpandedGroups] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [overlayFiles, setOverlayFiles] = useState([]);
  const [uploadingOverlay, setUploadingOverlay] = useState(false);
  const [previewOverlay, setPreviewOverlay] = useState(null); // For preview modal
  const [fontFiles, setFontFiles] = useState([]);
  const [uploadingFont, setUploadingFont] = useState(false);
  const [previewFont, setPreviewFont] = useState(null); // For font preview modal
  const hasInitializedGroups = useRef(false);
  const initialAuthStatus = useRef(null); // Track initial auth status when config is loaded

  // Auto-save state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const autoSaveTimerRef = useRef(null);
  const lastSavedConfigRef = useRef(null);

  // UI-only state for Sync toggles (not saved to config)
  const [useJellySync, setUseJellySync] = useState(false);
  const [useEmbySync, setUseEmbySync] = useState(false);

  // Validation state for min/max pairs
  const [validationErrors, setValidationErrors] = useState({});

  // Define min/max field pairs that need validation
  const MIN_MAX_PAIRS = [
    { min: "PosterMinPointSize", max: "PosterMaxPointSize" },
    { min: "SeasonPosterMinPointSize", max: "SeasonPosterMaxPointSize" },
    { min: "BackgroundMinPointSize", max: "BackgroundMaxPointSize" },
    { min: "TitleCardTitleMinPointSize", max: "TitleCardTitleMaxPointSize" },
    { min: "TitleCardEPMinPointSize", max: "TitleCardEPMaxPointSize" },
    { min: "ShowTitleMinPointSize", max: "ShowTitleMaxPointSize" },
    { min: "CollectionTitleMinPointSize", max: "CollectionTitleMaxPointSize" },
    {
      min: "CollectionPosterMinPointSize",
      max: "CollectionPosterMaxPointSize",
    },
  ];

  // Define parent-child dimension constraints
  // Text max width/height cannot exceed parent poster/background min width/height
  const PARENT_CHILD_CONSTRAINTS = [
    // Poster-based constraints (use PosterMinWidth/PosterMinHeight as parent)
    { parent: "PosterMinWidth", child: "PosterMaxWidth", type: "width" },
    { parent: "PosterMinHeight", child: "PosterMaxHeight", type: "height" },
    { parent: "PosterMinWidth", child: "SeasonPosterMaxWidth", type: "width" },
    {
      parent: "PosterMinHeight",
      child: "SeasonPosterMaxHeight",
      type: "height",
    },
    {
      parent: "PosterMinWidth",
      child: "CollectionPosterMaxWidth",
      type: "width",
    },
    {
      parent: "PosterMinHeight",
      child: "CollectionPosterMaxHeight",
      type: "height",
    },
    {
      parent: "PosterMinWidth",
      child: "CollectionTitleMaxWidth",
      type: "width",
    },
    {
      parent: "PosterMinHeight",
      child: "CollectionTitleMaxHeight",
      type: "height",
    },

    // Background/TitleCard-based constraints (use BgTcMinWidth/BgTcMinHeight as parent)
    { parent: "BgTcMinWidth", child: "BackgroundMaxWidth", type: "width" },
    { parent: "BgTcMinHeight", child: "BackgroundMaxHeight", type: "height" },
    { parent: "BgTcMinWidth", child: "TitleCardTitleMaxWidth", type: "width" },
    {
      parent: "BgTcMinHeight",
      child: "TitleCardTitleMaxHeight",
      type: "height",
    },
    { parent: "BgTcMinWidth", child: "TitleCardEPMaxWidth", type: "width" },
    { parent: "BgTcMinHeight", child: "TitleCardEPMaxHeight", type: "height" },
    { parent: "BgTcMinWidth", child: "ShowTitleMaxWidth", type: "width" },
    { parent: "BgTcMinHeight", child: "ShowTitleMaxHeight", type: "height" },
  ];

  // Dropdown states - using object to handle multiple instances per field type
  const [openDropdowns, setOpenDropdowns] = useState({});
  const [dropdownPositions, setDropdownPositions] = useState({}); // Track if dropdown opens up or down
  const dropdownRefs = useRef({});

  const toggleDropdown = (key) => {
    // Calculate position before toggling if dropdown is about to open
    if (!openDropdowns[key]) {
      const ref = dropdownRefs.current[key];
      if (ref) {
        const shouldOpenUp = calculateDropdownPosition({ current: ref });
        setDropdownPositions((prev) => ({
          ...prev,
          [key]: shouldOpenUp,
        }));
      }
    }

    setOpenDropdowns((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const closeDropdown = (key) => {
    setOpenDropdowns((prev) => ({
      ...prev,
      [key]: false,
    }));
  };

  const isDropdownOpen = (key) => openDropdowns[key] || false;
  const isDropdownUp = (key) => dropdownPositions[key] || false;

  // Legacy single dropdown states for non-repeating fields
  const [favProviderDropdownOpen, setFavProviderDropdownOpen] = useState(false);
  const [tmdbSortingDropdownOpen, setTmdbSortingDropdownOpen] = useState(false);
  const [logLevelDropdownOpen, setLogLevelDropdownOpen] = useState(false);
  const [webuiLogLevelDropdownOpen, setWebuiLogLevelDropdownOpen] =
    useState(false);
  const [favProviderDropdownUp, setFavProviderDropdownUp] = useState(false);
  const [tmdbSortingDropdownUp, setTmdbSortingDropdownUp] = useState(false);
  const [logLevelDropdownUp, setLogLevelDropdownUp] = useState(false);
  const [webuiLogLevelDropdownUp, setWebuiLogLevelDropdownUp] = useState(false);

  const favProviderDropdownRef = useRef(null);
  const tmdbSortingDropdownRef = useRef(null);
  const logLevelDropdownRef = useRef(null);
  const webuiLogLevelDropdownRef = useRef(null);

  // WebUI Log Level state
  const [webuiLogLevel, setWebuiLogLevel] = useState("INFO");

  // List of overlay file fields
  const OVERLAY_FILE_FIELDS = [
    "overlayfile",
    "seasonoverlayfile",
    "backgroundoverlayfile",
    "titlecardoverlayfile",
    "collectionoverlayfile",
    "poster4k",
    "Poster1080p",
    "Background4k",
    "Background1080p",
    "TC4k",
    "TC1080p",
  ];

  // List of font file fields
  const FONT_FILE_FIELDS = [
    "font",
    "RTLFont",
    "backgroundfont",
    "titlecardfont",
    "collectionfont",
  ];

  // Map URL path to tab name
  const getActiveTabFromPath = () => {
    const path = location.pathname;
    if (path.includes("/config/webui")) return "WebUI";
    if (path.includes("/config/general")) return "General";
    if (path.includes("/config/services")) return "Media Servers";
    if (path.includes("/config/api")) return "Service APIs";
    if (path.includes("/config/languages")) return "Languages";
    if (path.includes("/config/visuals")) return "Visuals";
    if (path.includes("/config/overlays")) return "Overlays";
    if (path.includes("/config/collections")) return "Collections";
    if (path.includes("/config/notifications")) return "Notifications";
    return "General"; // Default
  };

  const activeTab = getActiveTabFromPath();

  // Auto-resize textarea function
  const autoResize = (textarea) => {
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }
  };

  // Tab organization
  const tabs = {
    WebUI: {
      groups: ["WebUI Settings"],
      icon: Lock,
    },
    General: {
      groups: ["General Settings", "PrerequisitePart"],
      icon: Settings,
    },
    "Media Servers": {
      groups: [
        "Plex Settings",
        "Jellyfin Settings",
        "Emby Settings",
        "PlexPart",
        "JellyfinPart",
        "EmbyPart",
      ],
      icon: Database,
    },
    "Service APIs": {
      groups: ["API Keys & Tokens", "ApiPart"],
      icon: Settings,
    },
    Languages: {
      groups: ["Language & Preferences"],
      icon: Type,
    },
    Visuals: {
      groups: [
        "Image Processing",
        "Image Filters",
        "Overlay Files",
        "Resolution Overlays",
        "Fonts",
        "Text Formatting",
        "OverlayPart",
      ],
      icon: Palette,
    },
    Overlays: {
      groups: [
        "Poster Settings",
        "Season Poster Settings",
        "Background Settings",
        "Title Card Overlay",
        "Title Card Title Text",
        "Title Card Episode Text",
        "Show Title on Season",
        "PosterOverlayPart",
        "SeasonPosterOverlayPart",
        "BackgroundOverlayPart",
        "TitleCardOverlayPart",
        "TitleCardTitleTextPart",
        "TitleCardEPTextPart",
        "ShowTitleOnSeasonPosterPart",
      ],
      icon: Palette,
    },
    Collections: {
      groups: [
        "Collection Title",
        "Collection Poster",
        "CollectionTitlePosterPart",
        "CollectionPosterOverlayPart",
      ],
      icon: Type,
    },
    Notifications: {
      groups: ["Notifications", "Notification"],
      icon: Bell,
    },
  };

  useEffect(() => {
    fetchConfig();
    fetchOverlayFiles();
    fetchFontFiles();
    fetchWebuiLogLevel();
  }, []);

  // Add keyboard shortcut for saving (Ctrl+Enter or Cmd+Enter)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Save on Ctrl+Enter (Windows/Linux) or Cmd+Enter (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!saving) {
          saveConfig();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [saving, config]);

  useEffect(() => {
    if (config && !hasInitializedGroups.current) {
      const groups = getGroupsByTab(activeTab);
      // Only auto-expand if there's exactly one section
      if (groups.length === 1) {
        setExpandedGroups({ [groups[0]]: true });
      }
      hasInitializedGroups.current = true;
    }
  }, [config, activeTab]);

  useEffect(() => {
    if (activeTab && config && hasInitializedGroups.current) {
      const groups = getGroupsByTab(activeTab);
      // Only auto-expand if there's exactly one section
      if (groups.length === 1) {
        setExpandedGroups((prev) => ({
          ...prev,
          [groups[0]]: true,
        }));
      }
    }
  }, [activeTab]);

  // Scroll to top when changing tabs
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  // Auto-expand groups when searching
  useEffect(() => {
    if (searchQuery && activeTab) {
      const filteredGroups = getFilteredGroupsByTab(activeTab);
      const newExpandedState = {};
      filteredGroups.forEach((groupName) => {
        newExpandedState[groupName] = true;
      });
      setExpandedGroups(newExpandedState);
    }
  }, [searchQuery, activeTab]);

  // Auto-save when config changes (with 5 second debounce)
  useEffect(() => {
    if (!config || !autoSaveEnabled || !lastSavedConfigRef.current) return;

    const currentConfigStr = JSON.stringify(config);
    const hasChanges = currentConfigStr !== lastSavedConfigRef.current;

    if (hasChanges) {
      setHasUnsavedChanges(true);

      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set new timer for auto-save after 5 seconds of inactivity
      autoSaveTimerRef.current = setTimeout(() => {
        console.log("Auto-saving config after 5 seconds of inactivity...");
        saveConfig(true); // true = auto-save
      }, 5000);
    }

    // Cleanup timer on unmount
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [config, autoSaveEnabled]);

  // Function to calculate dropdown position
  const calculateDropdownPosition = (ref) => {
    if (!ref || !ref.current) return false;

    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Dropdown max height is 240px (max-h-60 = 15rem = 240px)
    // Add buffer of 8px for margin
    const dropdownHeight = 248;

    // Only open upward if there's enough space above AND more space above than below
    // This prevents cut-off at the top of the screen
    if (spaceAbove > spaceBelow && spaceAbove >= dropdownHeight) {
      return true;
    }

    return false;
  };

  // Click-outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check dynamic dropdowns (overlay, font, gravity, color)
      Object.keys(dropdownRefs.current).forEach((key) => {
        const ref = dropdownRefs.current[key];
        if (ref && !ref.contains(event.target)) {
          closeDropdown(key);
        }
      });

      // Check static dropdowns
      if (
        favProviderDropdownRef.current &&
        !favProviderDropdownRef.current.contains(event.target)
      ) {
        setFavProviderDropdownOpen(false);
      }
      if (
        tmdbSortingDropdownRef.current &&
        !tmdbSortingDropdownRef.current.contains(event.target)
      ) {
        setTmdbSortingDropdownOpen(false);
      }
      if (
        logLevelDropdownRef.current &&
        !logLevelDropdownRef.current.contains(event.target)
      ) {
        setLogLevelDropdownOpen(false);
      }
      if (
        webuiLogLevelDropdownRef.current &&
        !webuiLogLevelDropdownRef.current.contains(event.target)
      ) {
        setWebuiLogLevelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null); // Clear any previous errors
    try {
      const response = await fetch(`${API_URL}/config`);
      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        setUiGroups(data.ui_groups || null);
        setDisplayNames(data.display_names || {});
        setUsingFlatStructure(data.using_flat_structure || false);

        // Store config for change detection
        lastSavedConfigRef.current = JSON.stringify(data.config);
        setHasUnsavedChanges(false);

        // Store initial auth status when config is first loaded
        if (initialAuthStatus.current === null) {
          const authEnabled = data.using_flat_structure
            ? data.config?.basicAuthEnabled
            : data.config?.WebUI?.basicAuthEnabled;
          initialAuthStatus.current = Boolean(authEnabled);
          console.log("Initial auth status saved:", initialAuthStatus.current);
        }

        // Validate min/max pairs on initial load
        validateMinMaxPairs(data.config);

        console.log(
          "Config structure:",
          data.using_flat_structure ? "FLAT" : "GROUPED"
        );
        console.log(
          "Display names loaded:",
          Object.keys(data.display_names || {}).length
        );
      } else {
        const errorMsg = "Failed to load config";
        setError(errorMsg);
        showError(errorMsg);
      }
    } catch (err) {
      const errorMsg = `Failed to load configuration: ${err.message}`;
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const fetchOverlayFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/overlayfiles`);
      const data = await response.json();

      if (data.success) {
        // Filter only image files (not fonts)
        const imageFiles = (data.files || []).filter(
          (file) => file.type === "image"
        );
        setOverlayFiles(imageFiles);
        console.log(`Loaded ${imageFiles.length} overlay files`);
      }
    } catch (err) {
      console.error("Failed to load overlay files:", err);
    }
  };

  const handleOverlayFileUpload = async (file) => {
    if (!file) return;

    setUploadingOverlay(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/overlayfiles/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(`File "${data.filename}" uploaded successfully!`);
        // Refresh overlay files list
        await fetchOverlayFiles();
      } else {
        showError(data.detail || "Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      showError("Failed to upload file");
    } finally {
      setUploadingOverlay(false);
    }
  };

  const fetchFontFiles = async () => {
    try {
      const response = await fetch(`${API_URL}/fonts`);
      const data = await response.json();

      if (data.success) {
        setFontFiles(data.files || []);
        console.log(`Loaded ${data.files.length} font files`);
      }
    } catch (err) {
      console.error("Failed to load font files:", err);
    }
  };

  // Fetch WebUI backend log level
  const fetchWebuiLogLevel = async () => {
    try {
      const response = await fetch(`${API_URL}/webui-settings`);
      const data = await response.json();

      if (data.success && data.settings.log_level) {
        setWebuiLogLevel(data.settings.log_level);
        console.log(`WebUI Log Level loaded: ${data.settings.log_level}`);
      }
    } catch (err) {
      console.error("Failed to load WebUI log level:", err);
    }
  };

  // Update WebUI backend log level
  const updateWebuiLogLevel = async (level) => {
    try {
      const response = await fetch(`${API_URL}/webui-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settings: {
            log_level: level,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setWebuiLogLevel(level);
        showSuccess(`WebUI Backend Log Level set to ${level}`);
        console.log(`WebUI Log Level updated to: ${level}`);
      } else {
        showError(data.detail || "Failed to update log level");
      }
    } catch (err) {
      console.error("Failed to update WebUI log level:", err);
      showError("Failed to update log level");
    }
  };

  const handleFontFileUpload = async (file) => {
    if (!file) return;

    setUploadingFont(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/fonts/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(`Font "${data.filename}" uploaded successfully!`);
        // Refresh font files list
        await fetchFontFiles();
      } else {
        showError(data.detail || "Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
      showError("Failed to upload file");
    } finally {
      setUploadingFont(false);
    }
  };

  const saveConfig = async (isAutoSave = false) => {
    // Validate min/max pairs before saving
    const isValid = validateMinMaxPairs(config);

    if (!isValid) {
      const errorCount = Object.keys(validationErrors).length;
      showError(
        `Cannot save: ${errorCount} validation ${
          errorCount === 1 ? "error" : "errors"
        } found. Please fix value conflicts.`
      );
      return;
    }

    setSaving(true);
    setError(null);

    //  Get the ORIGINAL auth status from when config was loaded
    const oldAuthEnabled = initialAuthStatus.current;

    //  Get CURRENT auth status from the config being saved
    const newAuthEnabled = usingFlatStructure
      ? config?.basicAuthEnabled
      : config?.WebUI?.basicAuthEnabled;

    // Check if auth status is changing
    const authChanging = oldAuthEnabled !== Boolean(newAuthEnabled);

    if (!isAutoSave) {
      console.log("Auth status check:", {
        oldAuthEnabled,
        newAuthEnabled: Boolean(newAuthEnabled),
        authChanging,
      });
    }

    try {
      const response = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config }), // Send flat config directly
      });

      const data = await response.json();

      if (data.success) {
        // Update saved config reference
        lastSavedConfigRef.current = JSON.stringify(config);
        setHasUnsavedChanges(false);

        // If Auth status is changing, immediately reload without showing messages
        if (authChanging) {
          console.log("Auth status changed - reloading page...");

          // Clear any existing auth credentials from session storage
          sessionStorage.removeItem("auth_credentials");

          // Immediately force a full page reload
          // Use replace to prevent back button issues
          window.location.replace(window.location.href);
          return; // This prevents any further execution
        }

        // Normal save without auth change - update initial auth status
        initialAuthStatus.current = Boolean(newAuthEnabled);

        // Show success message
        if (isAutoSave) {
          console.log(`Auto-saved config (${data.changes_count || 0} changes)`);
          showInfo(
            t("configEditor.autoSaved", { count: data.changes_count || 0 })
          );
        } else {
          showSuccess(
            t("configEditor.savedSuccessfully", {
              count: data.changes_count || 0,
            })
          );
        }
      } else {
        showError("Failed to save configuration");
      }
    } catch (err) {
      if (!isAutoSave) {
        showError(`Error: ${err.message}`);
      } else {
        console.error("Auto-save error:", err.message);
      }
    } finally {
      // Only reset saving state if not reloading
      if (!authChanging) {
        setSaving(false);
      }
    }
  };

  const toggleGroup = (groupName) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // Validate min/max pairs in the config
  const validateMinMaxPairs = (configToValidate) => {
    const errors = {};

    // Validate standard min/max pairs (e.g., MinPointSize vs MaxPointSize)
    MIN_MAX_PAIRS.forEach(({ min, max }) => {
      let minValue, maxValue;

      // Get values from flat or nested structure
      if (usingFlatStructure) {
        minValue = configToValidate[min];
        maxValue = configToValidate[max];
      } else {
        // Try to find the values in the nested structure
        for (const section of Object.keys(configToValidate || {})) {
          if (configToValidate[section]?.[min] !== undefined) {
            minValue = configToValidate[section][min];
          }
          if (configToValidate[section]?.[max] !== undefined) {
            maxValue = configToValidate[section][max];
          }
        }
      }

      // Convert to numbers for comparison
      const minNum = parseFloat(minValue);
      const maxNum = parseFloat(maxValue);

      // Only validate if both values exist and are valid numbers
      if (!isNaN(minNum) && !isNaN(maxNum)) {
        if (minNum > maxNum) {
          errors[
            min
          ] = `Minimum value (${minNum}) cannot be greater than maximum value (${maxNum})`;
          errors[
            max
          ] = `Maximum value (${maxNum}) cannot be less than minimum value (${minNum})`;
        }
      }
    });

    // Validate parent-child dimension constraints
    // Text max width/height cannot exceed parent poster/background min width/height
    PARENT_CHILD_CONSTRAINTS.forEach(({ parent, child, type }) => {
      let parentValue, childValue;

      // Get values from flat or nested structure
      if (usingFlatStructure) {
        parentValue = configToValidate[parent];
        childValue = configToValidate[child];
      } else {
        // Try to find the values in the nested structure
        for (const section of Object.keys(configToValidate || {})) {
          if (configToValidate[section]?.[parent] !== undefined) {
            parentValue = configToValidate[section][parent];
          }
          if (configToValidate[section]?.[child] !== undefined) {
            childValue = configToValidate[section][child];
          }
        }
      }

      // Convert to numbers for comparison
      const parentNum = parseFloat(parentValue);
      const childNum = parseFloat(childValue);

      // Only validate if both values exist and are valid numbers
      if (!isNaN(parentNum) && !isNaN(childNum)) {
        if (childNum > parentNum) {
          const dimension = type === "width" ? "width" : "height";
          errors[
            child
          ] = `Text ${dimension} (${childNum}) cannot be greater than parent image ${dimension} (${parentNum})`;
        }
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateValue = (key, value) => {
    let updatedConfig;

    if (usingFlatStructure) {
      updatedConfig = {
        ...config,
        [key]: value,
      };
      setConfig(updatedConfig);
    } else {
      const [section, field] = key.includes(".") ? key.split(".") : [null, key];
      if (section) {
        updatedConfig = {
          ...config,
          [section]: {
            ...config[section],
            [field]: value,
          },
        };
        setConfig(updatedConfig);
      }
    }

    // Check if this field is part of a min/max pair OR parent-child constraint and trigger validation
    const isMinMaxField = MIN_MAX_PAIRS.some(
      ({ min, max }) =>
        key === min ||
        key === max ||
        key.endsWith(`.${min}`) ||
        key.endsWith(`.${max}`)
    );

    const isParentChildField = PARENT_CHILD_CONSTRAINTS.some(
      ({ parent, child }) =>
        key === parent ||
        key === child ||
        key.endsWith(`.${parent}`) ||
        key.endsWith(`.${child}`)
    );

    if ((isMinMaxField || isParentChildField) && updatedConfig) {
      // Use setTimeout to ensure state has updated before validating
      setTimeout(() => validateMinMaxPairs(updatedConfig), 0);
    }
  };

  const getDisplayName = (key) => {
    if (displayNames[key]) {
      return displayNames[key];
    }
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .trim();
  };

  const getGroupsByTab = (tabName) => {
    if (!config) return [];

    const tabGroups = tabs[tabName]?.groups || [];

    if (usingFlatStructure && uiGroups) {
      return tabGroups.filter((groupName) => {
        const groupKeys = uiGroups[groupName] || [];
        return groupKeys.some((key) => key in config);
      });
    } else {
      return tabGroups.filter((groupName) => config[groupName]);
    }
  };

  const getFieldsForGroup = (groupName) => {
    if (!config) return [];

    if (usingFlatStructure && uiGroups) {
      const groupKeys = uiGroups[groupName] || [];
      return groupKeys.filter((key) => key in config);
    } else {
      return Object.keys(config[groupName] || {});
    }
  };

  const formatGroupName = (groupName) => {
    if (groupName.includes(" ")) {
      return groupName;
    }
    return groupName
      .replace(/Part$/, "")
      .replace(/([A-Z])/g, " $1")
      .trim();
  };

  const getGroupIcon = (groupName) => {
    if (
      groupName.includes("Plex") ||
      groupName.includes("Jellyfin") ||
      groupName.includes("Emby") ||
      groupName.includes("Server") ||
      groupName.includes("Settings")
    )
      return Database;
    if (groupName.includes("Overlay") || groupName.includes("Visual"))
      return Palette;
    if (
      groupName.includes("Text") ||
      groupName.includes("Font") ||
      groupName.includes("Collection")
    )
      return Type;
    if (groupName.includes("Notification")) return Bell;
    return Settings;
  };

  const getInputIcon = (key, value) => {
    const keyLower = key.toLowerCase();

    if (typeof value === "boolean" || value === "true" || value === "false")
      return Check;
    if (Array.isArray(value)) return List;
    if (
      keyLower.includes("password") ||
      keyLower.includes("token") ||
      keyLower.includes("key") ||
      keyLower.includes("secret")
    )
      return Lock;
    if (typeof value === "number") return Hash;
    return Type;
  };

  // Filter functions for search
  const matchesSearch = (text) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const getFilteredFieldsForGroup = (groupName) => {
    const allFields = getFieldsForGroup(groupName);
    if (!searchQuery.trim()) return allFields;

    return allFields.filter((key) => {
      const displayName = getDisplayName(key);
      const value = usingFlatStructure ? config[key] : config[groupName]?.[key];
      const stringValue =
        value === null || value === undefined ? "" : String(value);

      // Search in key name, display name, and value
      return (
        matchesSearch(key) ||
        matchesSearch(displayName) ||
        matchesSearch(stringValue)
      );
    });
  };

  const getFilteredGroupsByTab = (tabName) => {
    const groups = getGroupsByTab(tabName);
    if (!searchQuery.trim()) return groups;

    return groups.filter((groupName) => {
      // Check if group name matches
      if (
        matchesSearch(groupName) ||
        matchesSearch(formatGroupName(groupName))
      ) {
        return true;
      }

      // Check if any field in the group matches
      const fieldsInGroup = getFilteredFieldsForGroup(groupName);
      return fieldsInGroup.length > 0;
    });
  };

  // Tooltip Component
  const Tooltip = ({ text, children }) => {
    if (!text) return children;

    return (
      <div className="group relative inline-flex items-center">
        {children}
        <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 w-80">
          <div className="bg-gray-900 text-white text-sm rounded-lg px-4 py-3 shadow-xl border border-gray-700">
            <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-900 border-l border-b border-gray-700 rotate-45"></div>
            {text}
          </div>
        </div>
      </div>
    );
  };

  const getGroupIconForDisplay = (groupName) => {
    const tabIcon = tabs[activeTab]?.icon;
    if (tabIcon) {
      return tabIcon;
    }
    // Fallback auf die alte Logik
    return getGroupIcon(groupName);
  };

  // Get README link for a group
  const getReadmeLink = (groupName) => {
    return README_LINKS[groupName] || null;
  };

  // Helper function to check if a media server field should be disabled
  const isFieldDisabled = (key, groupName) => {
    if (!config) return false;

    const getValue = (fieldKey) => {
      const val = usingFlatStructure
        ? config[fieldKey]
        : config[fieldKey.split(".")[0]]?.[fieldKey.split(".")[1]];
      return val === "true" || val === true;
    };

    // Mapping between UI display group names and their prefixes in flat config
    const groupPrefixMap = {
      "Poster Settings": "Poster",
      "Season Poster Settings": "SeasonPoster",
      "Background Settings": "Background",
      "Title Card Overlay": "TitleCard",
      "Title Card Title Text": "TitleCardTitle",
      "Title Card Episode Text": "TitleCardEP",
      "Show Title on Season": "ShowTitle",
      "Collection Title": "CollectionTitle",
      "Collection Poster": "CollectionPoster",
    };

    const getGroupValue = (group, field) => {
      if (usingFlatStructure) {
        // In flat structure, fields are prefixed with group prefix
        const prefix = groupPrefixMap[group] || "";
        const flatKey = prefix + field;
        const val = config[flatKey];

        // Convert string booleans to actual booleans
        const boolVal = val === "true" || val === true;

        // Debug logging
        console.log(
          `Checking ${group}.${field} -> ${flatKey} = ${val} (converted to: ${boolVal})`
        );

        return boolVal;
      }
      const val = config[group]?.[field];
      const boolVal = val === "true" || val === true;
      console.log(
        `Checking ${group}.${field} (nested) = ${val} (converted to: ${boolVal})`
      );
      return boolVal;
    };

    // Check media server status
    const plexEnabled = getValue("UsePlex");
    const jellyfinEnabled = getValue("UseJellyfin");
    const embyEnabled = getValue("UseEmby");

    // === PLEX FIELDS ===
    // All Plex fields are disabled if Plex is not enabled
    const plexFields = [
      "PlexUrl",
      "PlexToken",
      "PlexLibstoExclude",
      "PlexUploadExistingAssets",
      "PlexUpload",
    ];
    if (plexFields.includes(key) && !plexEnabled) {
      return true;
    }

    // === JELLYFIN FIELDS ===
    // Connection fields (URL, API, Libs) are enabled if Jellyfin OR JellySync is enabled
    const jellyfinConnectionFields = [
      "JellyfinUrl",
      "JellyfinAPIKey",
      "JellyfinLibstoExclude",
    ];
    if (
      jellyfinConnectionFields.includes(key) &&
      !jellyfinEnabled &&
      !useJellySync
    ) {
      return true;
    }

    // Upload/Replace fields ONLY depend on UseJellyfin (NOT on Sync)
    const jellyfinUploadFields = [
      "JellyfinUploadExistingAssets",
      "JellyfinReplaceThumbwithBackdrop",
    ];
    if (jellyfinUploadFields.includes(key) && !jellyfinEnabled) {
      return true;
    }

    // === EMBY FIELDS ===
    // Connection fields (URL, API, Libs) are enabled if Emby OR EmbySync is enabled
    const embyConnectionFields = ["EmbyUrl", "EmbyAPIKey", "EmbyLibstoExclude"];
    if (embyConnectionFields.includes(key) && !embyEnabled && !useEmbySync) {
      return true;
    }

    // Upload/Replace fields ONLY depend on UseEmby (NOT on Sync)
    const embyUploadFields = [
      "EmbyUploadExistingAssets",
      "EmbyReplaceThumbwithBackdrop",
    ];
    if (embyUploadFields.includes(key) && !embyEnabled) {
      return true;
    }

    // === OVERLAY AND TEXT CONDITIONAL DISABLING ===
    const keyLower = key.toLowerCase();

    console.log(
      `isFieldDisabled called: key="${key}", groupName="${groupName}", keyLower="${keyLower}"`
    );

    // Groups where AddBorder affects bordercolor and borderwidth
    const borderGroups = [
      "Collection Poster",
      "Background Settings",
      "Season Poster Settings",
      "Poster Settings",
      "Title Card Overlay",
    ];

    // Groups where AddText affects text-related fields
    const textGroups = [
      "Collection Poster",
      "Background Settings",
      "Season Poster Settings",
      "Poster Settings",
    ];

    // Groups where AddTextStroke affects stroke fields
    const strokeGroups = [
      "Collection Poster",
      "Background Settings",
      "Season Poster Settings",
      "Poster Settings",
      "Show Title on Season",
      "Title Card Title Text",
      "Title Card Episode Text",
      "Collection Title",
    ];

    // Border-related fields
    if (
      borderGroups.includes(groupName) &&
      (keyLower.includes("bordercolor") || keyLower.includes("borderwidth"))
    ) {
      console.log(`🔶 Border field detected in ${groupName}`);
      const addBorder = getGroupValue(groupName, "AddBorder");
      console.log(`   AddBorder = ${addBorder}, returning ${!addBorder}`);
      if (!addBorder) return true;
    }

    // Text-related fields (when AddText is false)
    const textFieldSuffixes = [
      "addtextstroke",
      "strokecolor",
      "strokewidth",
      "minpointsize",
      "maxpointsize",
      "maxwidth",
      "maxheight",
      "text_offset",
      "textoffset", // Flat structure uses CamelCase without underscore
      "linespacing",
      "textgravity",
      "fontallcaps",
      "fontcolor",
    ];

    if (
      textGroups.includes(groupName) &&
      textFieldSuffixes.some((suffix) => keyLower.endsWith(suffix))
    ) {
      console.log(`Text field detected: ${keyLower} in ${groupName}`);
      const addText = getGroupValue(groupName, "AddText");
      console.log(`   AddText = ${addText}, returning ${!addText}`);
      if (!addText) return true;
    }

    // Stroke-related fields (when AddTextStroke is false)
    const strokeFieldSuffixes = ["strokecolor", "strokewidth"];

    if (
      strokeGroups.includes(groupName) &&
      strokeFieldSuffixes.some((suffix) => keyLower.endsWith(suffix))
    ) {
      console.log(`Stroke field detected: ${keyLower} in ${groupName}`);
      const addTextStroke = getGroupValue(groupName, "AddTextStroke");
      console.log(
        `   AddTextStroke = ${addTextStroke}, returning ${!addTextStroke}`
      );
      if (!addTextStroke) return true;
    }

    // Show Title on Season - when AddShowTitletoSeason is false
    if (
      groupName === "Show Title on Season" &&
      textFieldSuffixes.some((suffix) => keyLower.endsWith(suffix))
    ) {
      console.log(`📺 Show Title field detected: ${keyLower}`);
      const addShowTitle = getGroupValue(groupName, "AddShowTitletoSeason");
      console.log(
        `   AddShowTitletoSeason = ${addShowTitle}, returning ${!addShowTitle}`
      );
      if (!addShowTitle) return true;
    }

    // Title Card Title Text - when AddEPTitleText is false
    if (
      groupName === "Title Card Title Text" &&
      textFieldSuffixes.some((suffix) => keyLower.endsWith(suffix))
    ) {
      console.log(`🎬 Title Card Title field detected: ${keyLower}`);
      const addEPTitleText = getGroupValue(groupName, "AddEPTitleText");
      console.log(
        `   AddEPTitleText = ${addEPTitleText}, returning ${!addEPTitleText}`
      );
      if (!addEPTitleText) return true;
    }

    // Title Card Episode Text - when AddEPText is false
    if (
      groupName === "Title Card Episode Text" &&
      textFieldSuffixes.some((suffix) => keyLower.endsWith(suffix))
    ) {
      console.log(`🎞️ Title Card Episode field detected: ${keyLower}`);
      const addEPText = getGroupValue(groupName, "AddEPText");
      console.log(`   AddEPText = ${addEPText}, returning ${!addEPText}`);
      if (!addEPText) return true;
    }

    // Collection Title - when AddCollectionTitle is false
    if (
      groupName === "Collection Title" &&
      textFieldSuffixes.some((suffix) => keyLower.endsWith(suffix))
    ) {
      console.log(`Collection Title field detected: ${keyLower}`);
      const addCollectionTitle = getGroupValue(groupName, "AddCollectionTitle");
      console.log(
        `   AddCollectionTitle = ${addCollectionTitle}, returning ${!addCollectionTitle}`
      );
      if (!addCollectionTitle) return true;
    }

    return false;
  };

  const renderInput = (groupName, key, value) => {
    const Icon = getInputIcon(key, value);
    const fieldKey = usingFlatStructure ? key : `${groupName}.${key}`;
    const displayName = getDisplayName(key);

    // ============ OVERLAY FILE DROPDOWN WITH UPLOAD ============
    if (OVERLAY_FILE_FIELDS.includes(key)) {
      const stringValue =
        value === null || value === undefined ? "" : String(value);
      const dropdownKey = `overlay-${fieldKey}`;

      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            {/* Dropdown */}
            <div
              className="relative flex-1"
              ref={(el) => (dropdownRefs.current[dropdownKey] = el)}
            >
              <button
                onClick={() => toggleDropdown(dropdownKey)}
                className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between"
              >
                <span
                  className={
                    stringValue ? "text-theme-text" : "text-theme-muted"
                  }
                >
                  {stringValue || "-- Select Overlay File --"}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-theme-muted transition-transform ${
                    isDropdownOpen(dropdownKey) ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isDropdownOpen(dropdownKey) && (
                <div
                  className="fixed z-50 bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-60 overflow-y-auto"
                  style={{
                    left: dropdownRefs.current[
                      dropdownKey
                    ]?.getBoundingClientRect().left,
                    width: dropdownRefs.current[dropdownKey]?.offsetWidth,
                    ...(isDropdownUp(dropdownKey)
                      ? {
                          bottom:
                            window.innerHeight -
                            dropdownRefs.current[
                              dropdownKey
                            ]?.getBoundingClientRect().top +
                            8,
                        }
                      : {
                          top:
                            dropdownRefs.current[
                              dropdownKey
                            ]?.getBoundingClientRect().bottom + 8,
                        }),
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      closeDropdown(dropdownKey);
                      updateValue(fieldKey, "");
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      !stringValue
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    -- Select Overlay File --
                  </button>
                  {overlayFiles.map((file) => (
                    <button
                      key={file.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        closeDropdown(dropdownKey);
                        updateValue(fieldKey, file.name);
                      }}
                      className={`w-full px-4 py-2 text-sm transition-all text-left ${
                        stringValue === file.name
                          ? "bg-theme-primary text-white"
                          : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                      }`}
                    >
                      {file.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Upload Button */}
            <label
              className={`flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm cursor-pointer ${
                uploadingOverlay ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <input
                type="file"
                accept=".png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleOverlayFileUpload(file);
                    e.target.value = ""; // Reset input
                  }
                }}
                className="hidden"
                disabled={uploadingOverlay}
              />
              {uploadingOverlay ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Upload</span>
            </label>

            {/* Preview Button */}
            {stringValue && (
              <button
                onClick={() => setPreviewOverlay(stringValue)}
                className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
                title="Preview overlay image"
              >
                <Eye className="w-4 h-4" />
                <span>Preview</span>
              </button>
            )}
          </div>

          {/* Current file display */}
          {stringValue && (
            <p className="text-xs text-theme-muted">
              Current:{" "}
              <span className="font-mono text-theme-primary">
                {stringValue}
              </span>
            </p>
          )}

          {/* Help text */}
          <p className="text-xs text-theme-muted">
            Upload PNG, JPG, or JPEG files to the Overlayfiles directory
          </p>
        </div>
      );
    }

    // ============ FONT FILE DROPDOWN WITH UPLOAD ============
    if (FONT_FILE_FIELDS.includes(key)) {
      const stringValue =
        value === null || value === undefined ? "" : String(value);
      const dropdownKey = `font-${fieldKey}`;

      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            {/* Dropdown */}
            <div
              className="relative flex-1"
              ref={(el) => (dropdownRefs.current[dropdownKey] = el)}
            >
              <button
                onClick={() => toggleDropdown(dropdownKey)}
                className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between"
              >
                <span
                  className={
                    stringValue ? "text-theme-text" : "text-theme-muted"
                  }
                >
                  {stringValue || "-- Select Font File --"}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-theme-muted transition-transform ${
                    isDropdownOpen(dropdownKey) ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isDropdownOpen(dropdownKey) && (
                <div
                  className="fixed z-50 bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-60 overflow-y-auto"
                  style={{
                    left: dropdownRefs.current[
                      dropdownKey
                    ]?.getBoundingClientRect().left,
                    width: dropdownRefs.current[dropdownKey]?.offsetWidth,
                    ...(isDropdownUp(dropdownKey)
                      ? {
                          bottom:
                            window.innerHeight -
                            dropdownRefs.current[
                              dropdownKey
                            ]?.getBoundingClientRect().top +
                            8,
                        }
                      : {
                          top:
                            dropdownRefs.current[
                              dropdownKey
                            ]?.getBoundingClientRect().bottom + 8,
                        }),
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      closeDropdown(dropdownKey);
                      updateValue(fieldKey, "");
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      !stringValue
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    -- Select Font File --
                  </button>
                  {fontFiles.map((file) => (
                    <button
                      key={file}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        closeDropdown(dropdownKey);
                        updateValue(fieldKey, file);
                      }}
                      className={`w-full px-4 py-2 text-sm transition-all text-left ${
                        stringValue === file
                          ? "bg-theme-primary text-white"
                          : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                      }`}
                    >
                      {file}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Upload Button */}
            <label
              className={`flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm cursor-pointer ${
                uploadingFont ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <input
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFontFileUpload(file);
                    e.target.value = ""; // Reset input
                  }
                }}
                className="hidden"
                disabled={uploadingFont}
              />
              {uploadingFont ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Upload</span>
            </label>

            {/* Preview Button */}
            {stringValue && (
              <button
                onClick={() => setPreviewFont(stringValue)}
                className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
                title="Preview font"
              >
                <Eye className="w-4 h-4" />
                <span>Preview</span>
              </button>
            )}
          </div>

          {/* Current file display */}
          {stringValue && (
            <p className="text-xs text-theme-muted">
              Current:{" "}
              <span className="font-mono text-theme-primary">
                {stringValue}
              </span>
            </p>
          )}

          {/* Help text */}
          <p className="text-xs text-theme-muted">
            Upload TTF, OTF, WOFF, or WOFF2 font files to the Overlayfiles
            directory
          </p>
        </div>
      );
    }

    // ============ LANGUAGE ORDER SELECTOR ============
    if (
      key === "PreferredLanguageOrder" ||
      key === "PreferredSeasonLanguageOrder" ||
      key === "PreferredBackgroundLanguageOrder" ||
      key === "PreferredTCLanguageOrder"
    ) {
      return (
        <LanguageOrderSelector
          value={Array.isArray(value) ? value : []}
          onChange={(newValue) => updateValue(fieldKey, newValue)}
          label={displayName}
          helpText={CONFIG_TOOLTIPS[key]}
        />
      );
    }

    // ============ LIBRARY EXCLUSION SELECTOR ============
    if (key === "PlexLibstoExclude") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <LibraryExclusionSelector
          value={Array.isArray(value) ? value : []}
          onChange={(newValue) => updateValue(fieldKey, newValue)}
          helpText={CONFIG_TOOLTIPS[key]}
          mediaServerType="plex"
          config={config}
          disabled={disabled}
          showIncluded={true}
        />
      );
    }

    if (key === "JellyfinLibstoExclude") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <LibraryExclusionSelector
          value={Array.isArray(value) ? value : []}
          onChange={(newValue) => updateValue(fieldKey, newValue)}
          helpText={CONFIG_TOOLTIPS[key]}
          mediaServerType="jellyfin"
          config={config}
          disabled={disabled}
          showIncluded={true}
        />
      );
    }

    if (key === "EmbyLibstoExclude") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <LibraryExclusionSelector
          value={Array.isArray(value) ? value : []}
          onChange={(newValue) => updateValue(fieldKey, newValue)}
          helpText={CONFIG_TOOLTIPS[key]}
          mediaServerType="emby"
          config={config}
          disabled={disabled}
          showIncluded={true}
        />
      );
    }

    // Handle arrays with pill-style tags
    if (Array.isArray(value)) {
      return (
        <div className="space-y-3">
          <textarea
            defaultValue={value.join(", ")}
            onBlur={(e) => {
              const arrayValue = e.target.value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item !== "");
              updateValue(fieldKey, arrayValue);
            }}
            onInput={(e) => autoResize(e.target)}
            ref={(textarea) => textarea && autoResize(textarea)}
            rows={1}
            className="w-full px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px]"
            placeholder="Enter comma-separated values"
          />
          {value.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-theme-bg rounded-lg border border-theme">
              {value.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-theme-primary/20 text-theme-primary rounded-full text-sm border border-theme-primary/30"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    const type = typeof value;
    const keyLower = key.toLowerCase();
    const stringValue =
      value === null || value === undefined ? "" : String(value);

    // Enhanced boolean toggle switch - supports 3 types: Boolean, "true"/"false", "True"/"False"
    if (
      type === "boolean" ||
      value === "true" ||
      value === "false" ||
      value === "True" ||
      value === "False"
    ) {
      // List of fields stored as real booleans (true/false)
      const booleanFields = ["basicAuthEnabled"];

      // List of fields stored as string "true"/"false" (lowercase)
      const lowercaseStringBooleanFields = [
        "UsePlex",
        "UseJellyfin",
        "UseEmby",
        "WidthHeightFilter",
        "PlexUploadExistingAssets",
        "JellyfinUploadExistingAssets",
        "JellyfinReplaceThumbwithBackdrop",
        "EmbyUploadExistingAssets",
        "EmbyReplaceThumbwithBackdrop",
        "show_skipped",
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
        "ImageProcessing",
        "NewLineOnSpecificSymbols",
        "Posters",
        "SeasonPosters",
        "BackgroundPosters",
        "TitleCards",
        "LibraryFolders",
        "PlexUpload",
        "PosterFontAllCaps",
        "PosterAddBorder",
        "PosterAddText",
        "PosterAddOverlay",
        "PosterAddTextStroke",
        "BackgroundFontAllCaps",
        "BackgroundAddOverlay",
        "BackgroundAddBorder",
        "BackgroundAddText",
        "BackgroundAddTextStroke",
        "TitleCardUseBackgroundAsTitleCard",
        "TitleCardAddOverlay",
        "TitleCardAddBorder",
        "TitleCardBackgroundFallback",
        "TitleCardTitleFontAllCaps",
        "TitleCardTitleAddEPTitleText",
        "TitleCardTitleAddTextStroke",
        "TitleCardEPFontAllCaps",
        "TitleCardEPAddEPText",
        "TitleCardEPAddTextStroke",
        "SeasonPosterFontAllCaps",
        "SeasonPosterAddBorder",
        "SeasonPosterAddText",
        "SeasonPosterAddOverlay",
        "SeasonPosterAddTextStroke",
        "SeasonPosterShowFallback",
        "ShowTitleAddShowTitletoSeason",
        "ShowTitleFontAllCaps",
        "ShowTitleAddTextStroke",
        "CollectionTitleAddCollectionTitle",
        "CollectionTitleFontAllCaps",
        "CollectionTitleAddTextStroke",
        "CollectionPosterFontAllCaps",
        "CollectionPosterAddBorder",
        "CollectionPosterAddText",
        "CollectionPosterAddTextStroke",
        "CollectionPosterAddOverlay",
        "UsePosterResolutionOverlays",
        "UseBackgroundResolutionOverlays",
        "UseTCResolutionOverlays",
      ];

      // List of fields stored as string "True"/"False" (CAPITAL)
      const capitalizedStringBooleanFields = [
        "SendNotification",
        "UseUptimeKuma",
      ];

      // Determine which type to use
      const isBoolean = booleanFields.includes(key);
      const isCapitalizedString = capitalizedStringBooleanFields.includes(key);
      const isLowercaseString = lowercaseStringBooleanFields.includes(key);

      // Determine current state (enabled/disabled)
      const isEnabled =
        value === "true" || value === true || value === "True" || value === 1;

      // Special handling for Media Server toggles (only one can be active)
      const isMediaServerToggle = [
        "UsePlex",
        "UseJellyfin",
        "UseEmby",
      ].includes(key);

      // Check if this field should be disabled
      const disabled = isFieldDisabled(key, groupName);

      // Determine the reason for being disabled
      const getDisabledReason = () => {
        if (!disabled) return null;

        // Check for media server dependencies
        if (key.includes("Plex")) return "Plex to be enabled";
        if (key.includes("Jellyfin")) return "Jellyfin to be enabled";
        if (key.includes("Emby")) return "Emby to be enabled";

        // Check for overlay/text dependencies based on field type
        const keyLower = key.toLowerCase();

        // Border fields
        if (
          keyLower.includes("bordercolor") ||
          keyLower.includes("borderwidth")
        ) {
          return "Add Border to be enabled";
        }

        // Text stroke fields
        if (
          keyLower.includes("strokecolor") ||
          keyLower.includes("strokewidth")
        ) {
          return "Add Text Stroke to be enabled";
        }

        // General text fields
        if (
          keyLower.includes("fontallcaps") ||
          keyLower.includes("fontcolor") ||
          keyLower.includes("minpointsize") ||
          keyLower.includes("maxpointsize") ||
          keyLower.includes("maxwidth") ||
          keyLower.includes("maxheight") ||
          keyLower.includes("linespacing") ||
          keyLower.includes("textgravity") ||
          keyLower.includes("addtextstroke") ||
          keyLower.includes("textoffset")
        ) {
          return "Add Text to be enabled";
        }

        return "required settings to be enabled";
      };

      return (
        <div
          className={`flex items-center justify-between h-[42px] px-4 bg-theme-bg rounded-lg border border-theme transition-all ${
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:border-theme-primary/30"
          }`}
        >
          <div className="text-sm font-medium text-theme-text">
            {displayName}
            {disabled && (
              <span className="text-xs text-theme-muted ml-2">
                (Requires {getDisabledReason()})
              </span>
            )}
          </div>
          <label
            className={`relative inline-flex items-center ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={isEnabled}
              disabled={disabled}
              onChange={(e) => {
                // Decide based on field type which value to save
                let newValue;

                if (isBoolean) {
                  // Real booleans for Auth
                  newValue = e.target.checked;
                } else if (isCapitalizedString) {
                  // String with capital letters for Notifications
                  newValue = e.target.checked ? "True" : "False";
                } else {
                  // String with lowercase letters for everything else (default)
                  newValue = e.target.checked ? "true" : "false";
                }

                // Special handling for Media Server toggles - Radio button behavior
                if (isMediaServerToggle && e.target.checked) {
                  // When turning ON a media server, turn OFF the others
                  const serverFields = ["UsePlex", "UseJellyfin", "UseEmby"];
                  serverFields.forEach((serverKey) => {
                    if (serverKey !== key) {
                      updateValue(serverKey, "false");
                    }
                  });
                }

                updateValue(fieldKey, newValue);
              }}
              className="sr-only peer"
              id={`${groupName}-${key}`}
            />
            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-theme-primary peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
          </label>
        </div>
      );
    }

    // ============ DROPDOWN FOR FAVPROVIDER ============
    if (key === "FavProvider") {
      const providerOptions = ["tmdb", "tvdb", "fanart"];

      return (
        <div className="space-y-2">
          <div className="relative" ref={favProviderDropdownRef}>
            <button
              onClick={() => {
                const shouldOpenUp = calculateDropdownPosition(
                  favProviderDropdownRef
                );
                setFavProviderDropdownUp(shouldOpenUp);
                setFavProviderDropdownOpen(!favProviderDropdownOpen);
              }}
              className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between"
            >
              <span>{stringValue.toUpperCase()}</span>
              <ChevronDown
                className={`w-5 h-5 text-theme-muted transition-transform ${
                  favProviderDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {favProviderDropdownOpen && (
              <div
                className={`absolute z-50 left-0 right-0 ${
                  favProviderDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl overflow-hidden`}
              >
                {providerOptions.map((option) => (
                  <button
                    key={option}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setFavProviderDropdownOpen(false);
                      updateValue(fieldKey, option);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      stringValue.toLowerCase() === option
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-theme-muted">
            Select your preferred metadata provider (recommended: TMDB)
          </p>
        </div>
      );
    }

    // ============ DROPDOWN FOR TMDB_VOTE_SORTING ============
    if (key === "tmdb_vote_sorting") {
      const sortingOptions = [
        { value: "vote_average", label: "Vote Average" },
        { value: "vote_count", label: "Vote Count" },
        { value: "primary", label: "Primary (Default TMDB View)" },
      ];

      return (
        <div className="space-y-2">
          <div className="relative" ref={tmdbSortingDropdownRef}>
            <button
              onClick={() => {
                const shouldOpenUp = calculateDropdownPosition(
                  tmdbSortingDropdownRef
                );
                setTmdbSortingDropdownUp(shouldOpenUp);
                setTmdbSortingDropdownOpen(!tmdbSortingDropdownOpen);
              }}
              className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between"
            >
              <span>
                {sortingOptions.find((opt) => opt.value === stringValue)
                  ?.label || "Select sorting"}
              </span>
              <ChevronDown
                className={`w-5 h-5 text-theme-muted transition-transform ${
                  tmdbSortingDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {tmdbSortingDropdownOpen && (
              <div
                className={`absolute z-50 left-0 right-0 ${
                  tmdbSortingDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl overflow-hidden`}
              >
                {sortingOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setTmdbSortingDropdownOpen(false);
                      updateValue(fieldKey, option.value);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      stringValue === option.value
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-theme-muted">
            Picture sorting method via TMDB API
          </p>
        </div>
      );
    }

    // ============ SERVICES MIT VALIDATE-BUTTONS ============

    // Plex Token mit Validate-Button
    if (key === "PlexToken") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                disabled={disabled}
                className={`w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10 ${
                  disabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
                placeholder={
                  disabled ? "Enable Plex first" : "Enter Plex token"
                }
              />
              <Lock
                className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted ${
                  disabled ? "opacity-50" : ""
                }`}
              />
            </div>
            <ValidateButton
              type="plex"
              config={config}
              label="Validate"
              onSuccess={showSuccess}
              onError={showError}
              disabled={disabled}
            />
          </div>
          <p className="text-xs text-theme-muted">
            {disabled
              ? "This field is only available when Plex is selected as your media server"
              : "Your Plex authentication token"}
          </p>
        </div>
      );
    }

    // Jellyfin API Key mit Validate-Button
    if (key === "JellyfinAPIKey") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                disabled={disabled}
                className={`w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10 ${
                  disabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
                placeholder={
                  disabled
                    ? "Enable Jellyfin or JellySync first"
                    : "Enter Jellyfin API key"
                }
              />
              <Lock
                className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted ${
                  disabled ? "opacity-50" : ""
                }`}
              />
            </div>
            <ValidateButton
              type="jellyfin"
              config={config}
              label="Validate"
              onSuccess={showSuccess}
              onError={showError}
              disabled={disabled}
            />
          </div>
          <p className="text-xs text-theme-muted">
            {disabled
              ? "This field is available when Jellyfin is selected as your media server OR when JellySync is enabled"
              : "Create API key in Jellyfin at Settings → Advanced → API Keys"}
          </p>
        </div>
      );
    }

    // Emby API Key mit Validate-Button
    if (key === "EmbyAPIKey") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                disabled={disabled}
                className={`w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10 ${
                  disabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
                placeholder={
                  disabled
                    ? "Enable Emby or EmbySync first"
                    : "Enter Emby API key"
                }
              />
              <Lock
                className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted ${
                  disabled ? "opacity-50" : ""
                }`}
              />
            </div>
            <ValidateButton
              type="emby"
              config={config}
              label="Validate"
              onSuccess={showSuccess}
              onError={showError}
              disabled={disabled}
            />
          </div>
          <p className="text-xs text-theme-muted">
            {disabled
              ? "This field is available when Emby is selected as your media server OR when EmbySync is enabled"
              : "Create API key in Emby at Settings → Advanced → API Keys"}
          </p>
        </div>
      );
    }

    // ============ MEDIA SERVER URL FIELDS ============

    // Plex URL
    if (key === "PlexUrl") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <div className="space-y-2">
          <textarea
            value={stringValue}
            onChange={(e) => {
              updateValue(fieldKey, e.target.value);
              autoResize(e.target);
            }}
            onInput={(e) => autoResize(e.target)}
            ref={(textarea) => textarea && autoResize(textarea)}
            disabled={disabled}
            rows={1}
            className={`w-full px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px] ${
              disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            placeholder={
              disabled ? "Enable Plex first" : "http://192.168.1.1:32400"
            }
          />
          <p className="text-xs text-theme-muted">
            {disabled
              ? "This field is only available when Plex is selected as your media server"
              : "Your Plex server URL (e.g., http://192.168.1.1:32400)"}
          </p>
        </div>
      );
    }

    // Jellyfin URL
    if (key === "JellyfinUrl") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <div className="space-y-2">
          <textarea
            value={stringValue}
            onChange={(e) => {
              updateValue(fieldKey, e.target.value);
              autoResize(e.target);
            }}
            onInput={(e) => autoResize(e.target)}
            ref={(textarea) => textarea && autoResize(textarea)}
            disabled={disabled}
            rows={1}
            className={`w-full px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px] ${
              disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            placeholder={
              disabled
                ? "Enable Jellyfin or JellySync first"
                : "http://192.168.1.1:8096"
            }
          />
          <p className="text-xs text-theme-muted">
            {disabled
              ? "This field is available when Jellyfin is selected as your media server OR when JellySync is enabled"
              : "Your Jellyfin server URL (e.g., http://192.168.1.1:8096)"}
          </p>
        </div>
      );
    }

    // Emby URL
    if (key === "EmbyUrl") {
      const disabled = isFieldDisabled(key, groupName);

      return (
        <div className="space-y-2">
          <textarea
            value={stringValue}
            onChange={(e) => {
              updateValue(fieldKey, e.target.value);
              autoResize(e.target);
            }}
            onInput={(e) => autoResize(e.target)}
            ref={(textarea) => textarea && autoResize(textarea)}
            disabled={disabled}
            rows={1}
            className={`w-full px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px] ${
              disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            placeholder={
              disabled
                ? "Enable Emby or EmbySync first"
                : "http://192.168.1.1:8096/emby"
            }
          />
          <p className="text-xs text-theme-muted">
            {disabled
              ? "This field is available when Emby is selected as your media server OR when EmbySync is enabled"
              : "Your Emby server URL (e.g., http://192.168.1.1:8096/emby)"}
          </p>
        </div>
      );
    }

    // ============ API KEYS MIT VALIDATE-BUTTONS ============

    // TMDB Token mit Validate-Button
    if (key === "tmdbtoken") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
                placeholder="Enter TMDB Read Access Token"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            </div>
            <ValidateButton
              type="tmdb"
              config={config}
              label="Validate"
              onSuccess={showSuccess}
              onError={showError}
            />
          </div>
          <p className="text-xs text-theme-muted">
            Your TMDB API Read Access Token (the really long one)
          </p>
        </div>
      );
    }

    // TVDB API Key mit Validate-Button
    if (key === "tvdbapi") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
                placeholder="Enter TVDB API Key (optionally with #PIN)"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            </div>
            <ValidateButton
              type="tvdb"
              config={config}
              label="Validate"
              onSuccess={showSuccess}
              onError={showError}
            />
          </div>
          <p className="text-xs text-theme-muted">
            Format: YourApiKey or YourApiKey#YourPin (for subscribers)
          </p>
        </div>
      );
    }

    // Fanart.tv API Key mit Validate-Button
    if (key === "FanartTvAPIKey") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
                placeholder="Enter Fanart.tv Personal API Key"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            </div>
            <ValidateButton
              type="fanart"
              config={config}
              label="Validate"
              onSuccess={showSuccess}
              onError={showError}
            />
          </div>
          <p className="text-xs text-theme-muted">
            Your Fanart.tv Personal API Key
          </p>
        </div>
      );
    }

    // ============ NOTIFICATIONS with VALIDATE-BUTTONS ============

    // Discord Webhook mit Validate-Button
    if (key === "Discord") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <textarea
              value={stringValue}
              onChange={(e) => {
                updateValue(fieldKey, e.target.value);
                autoResize(e.target);
              }}
              onInput={(e) => autoResize(e.target)}
              ref={(textarea) => textarea && autoResize(textarea)}
              rows={1}
              className="flex-1 px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px]"
              placeholder="https://discord.com/api/webhooks/..."
            />
            <ValidateButton
              type="discord"
              config={config}
              label="Test"
              onSuccess={showSuccess}
              onError={showError}
            />
          </div>
          <p className="text-xs text-theme-muted">
            Discord webhook URL (sends a test message when validated)
          </p>
        </div>
      );
    }

    // Apprise URL mit Validate-Button
    if (key === "AppriseUrl") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <textarea
              value={stringValue}
              onChange={(e) => {
                updateValue(fieldKey, e.target.value);
                autoResize(e.target);
              }}
              onInput={(e) => autoResize(e.target)}
              ref={(textarea) => textarea && autoResize(textarea)}
              rows={1}
              className="flex-1 px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px]"
              placeholder="discord://... or telegram://... etc."
            />
            <ValidateButton
              type="apprise"
              config={config}
              label="Validate"
              onSuccess={showSuccess}
              onError={showError}
            />
          </div>
          <p className="text-xs text-theme-muted">
            Apprise notification URL (format check only)
          </p>
        </div>
      );
    }

    // Uptime Kuma URL mit Validate-Button
    if (key === "UptimeKumaUrl") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <textarea
              value={stringValue}
              onChange={(e) => {
                updateValue(fieldKey, e.target.value);
                autoResize(e.target);
              }}
              onInput={(e) => autoResize(e.target)}
              ref={(textarea) => textarea && autoResize(textarea)}
              rows={1}
              className="flex-1 px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px]"
              placeholder="https://uptime-kuma.domain.com/api/push/..."
            />
            <ValidateButton
              type="uptimekuma"
              config={config}
              label="Test"
              onSuccess={showSuccess}
              onError={showError}
            />
          </div>
          <p className="text-xs text-theme-muted">
            Uptime Kuma push monitor URL (sends test ping when validated)
          </p>
        </div>
      );
    }

    // Handle text_offset specially with enhanced number input
    if (keyLower.includes("offset") || keyLower === "text_offset") {
      const disabled = isFieldDisabled(key, groupName);

      // Parse the current value - keep the sign!
      let parsedValue = 0;
      if (stringValue) {
        // Remove + if present, keep - if present
        const cleanValue = stringValue.replace(/^\+/, "");
        parsedValue = parseInt(cleanValue, 10) || 0;
      }

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={parsedValue}
              disabled={disabled}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || val === "-") {
                  updateValue(fieldKey, "");
                } else {
                  const num = parseInt(val, 10);
                  if (!isNaN(num)) {
                    // Format with explicit + or - sign
                    const formattedValue = num >= 0 ? `+${num}` : `${num}`;
                    updateValue(fieldKey, formattedValue);
                  }
                }
              }}
              onBlur={(e) => {
                // Ensure proper formatting on blur
                const val = e.target.value;
                if (val === "" || val === "-" || val === "+") {
                  updateValue(fieldKey, "+0");
                } else {
                  const num = parseInt(val, 10);
                  if (!isNaN(num)) {
                    const formattedValue = num >= 0 ? `+${num}` : `${num}`;
                    updateValue(fieldKey, formattedValue);
                  }
                }
              }}
              className={`flex-1 h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono ${
                disabled ? "opacity-50 cursor-not-allowed" : ""
              }`}
              placeholder="0"
            />
            <div className="flex items-center gap-1 px-3 py-2 bg-theme-bg border border-theme rounded-lg text-theme-muted text-sm font-mono min-w-[60px] justify-center">
              <span
                className={`font-bold ${
                  parsedValue >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {parsedValue >= 0 ? "+" : "-"}
              </span>
              <span>{Math.abs(parsedValue)}</span>
            </div>
          </div>
          <p className="text-xs text-theme-muted">
            Offset from bottom of image. Positive (+) moves up, negative (-)
            moves down
          </p>
        </div>
      );
    }

    // ============ LOG LEVEL (1, 2, or 3) ============
    if (key === "logLevel") {
      const numValue = String(stringValue || "2");
      const logLevelOptions = [
        { value: "1", label: "1 - Warning/Error messages only" },
        { value: "2", label: "2 - Info/Warning/Error messages (Default)" },
        { value: "3", label: "3 - Info/Warning/Error/Debug (Most verbose)" },
      ];

      return (
        <div className="space-y-2">
          <div className="relative" ref={logLevelDropdownRef}>
            <button
              onClick={() => {
                const shouldOpenUp =
                  calculateDropdownPosition(logLevelDropdownRef);
                setLogLevelDropdownUp(shouldOpenUp);
                setLogLevelDropdownOpen(!logLevelDropdownOpen);
              }}
              className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between"
            >
              <span>
                {logLevelOptions.find((opt) => opt.value === numValue)?.label ||
                  "Select log level"}
              </span>
              <ChevronDown
                className={`w-5 h-5 text-theme-muted transition-transform ${
                  logLevelDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {logLevelDropdownOpen && (
              <div
                className={`absolute z-50 left-0 right-0 ${
                  logLevelDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl overflow-hidden`}
              >
                {logLevelOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setLogLevelDropdownOpen(false);
                      updateValue(fieldKey, option.value);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      numValue === option.value
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-theme-muted">
            Logging verbosity: 1 = Warning/Error, 2 = Info/Warning/Error
            (default), 3 = Info/Warning/Error/Debug
          </p>
        </div>
      );
    }

    // ============ TEXT GRAVITY (Alignment) ============
    if (keyLower.includes("gravity") || keyLower.endsWith("textgravity")) {
      const gravityValue = String(stringValue || "South");
      const disabled = isFieldDisabled(key, groupName);
      const gravityOptions = [
        { value: "NorthWest", label: "NorthWest (Top Left)" },
        { value: "North", label: "North (Top Center)" },
        { value: "NorthEast", label: "NorthEast (Top Right)" },
        { value: "West", label: "West (Middle Left)" },
        { value: "Center", label: "Center (Middle Center)" },
        { value: "East", label: "East (Middle Right)" },
        { value: "SouthWest", label: "SouthWest (Bottom Left)" },
        { value: "South", label: "South (Bottom Center)" },
        { value: "SouthEast", label: "SouthEast (Bottom Right)" },
      ];

      const dropdownKey = `gravity-${fieldKey}`;

      return (
        <div className="space-y-2">
          <div
            className="relative"
            ref={(el) => (dropdownRefs.current[dropdownKey] = el)}
          >
            <button
              onClick={() => !disabled && toggleDropdown(dropdownKey)}
              disabled={disabled}
              className={`w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between ${
                disabled
                  ? "opacity-50 cursor-not-allowed hover:bg-theme-bg hover:border-theme"
                  : ""
              }`}
            >
              <span>
                {gravityOptions.find((opt) => opt.value === gravityValue)
                  ?.label || gravityValue}
              </span>
              <ChevronDown
                className={`w-5 h-5 text-theme-muted transition-transform ${
                  isDropdownOpen(dropdownKey) ? "rotate-180" : ""
                }`}
              />
            </button>

            {isDropdownOpen(dropdownKey) && !disabled && (
              <div
                className="fixed z-50 bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-60 overflow-y-auto"
                style={{
                  left: dropdownRefs.current[
                    dropdownKey
                  ]?.getBoundingClientRect().left,
                  width: dropdownRefs.current[dropdownKey]?.offsetWidth,
                  ...(isDropdownUp(dropdownKey)
                    ? {
                        bottom:
                          window.innerHeight -
                          dropdownRefs.current[
                            dropdownKey
                          ]?.getBoundingClientRect().top +
                          8,
                      }
                    : {
                        top:
                          dropdownRefs.current[
                            dropdownKey
                          ]?.getBoundingClientRect().bottom + 8,
                      }),
                }}
              >
                {gravityOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      closeDropdown(dropdownKey);
                      updateValue(fieldKey, option.value);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      gravityValue === option.value
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-theme-muted">
            Text alignment position within the text box
          </p>
        </div>
      );
    }

    // ============ OUTPUT QUALITY (1-100%) ============
    if (key === "outputQuality") {
      // Parse the value - handle both "92" and "92%" formats for display
      // Strip % for input display, but save WITH % to config
      let displayValue = String(stringValue || "").trim();
      if (displayValue.endsWith("%")) {
        displayValue = displayValue.slice(0, -1).trim();
      }

      const numValue = displayValue === "" ? "" : Number(displayValue);
      const isInvalid =
        displayValue !== "" &&
        (numValue < 1 || numValue > 100 || isNaN(numValue));

      return (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={displayValue}
              onChange={(e) => {
                const val = e.target.value.trim();
                // Allow empty or valid integers between 1-100
                // Store WITH % symbol for backend compatibility
                if (val === "") {
                  updateValue(fieldKey, "");
                } else {
                  const numVal = Number(val);
                  if (
                    !isNaN(numVal) &&
                    numVal >= 1 &&
                    numVal <= 100 &&
                    Number.isInteger(numVal)
                  ) {
                    // Save with % symbol (integers only)
                    updateValue(fieldKey, val + "%");
                  }
                }
              }}
              onBlur={(e) => {
                // Enforce bounds on blur and round to integer
                let val = e.target.value.trim();
                if (val !== "") {
                  const numVal = Number(val);
                  if (!isNaN(numVal)) {
                    const intVal = Math.round(numVal);
                    if (intVal < 1) {
                      updateValue(fieldKey, "1%");
                    } else if (intVal > 100) {
                      updateValue(fieldKey, "100%");
                    } else {
                      // Save with % symbol (integers only)
                      updateValue(fieldKey, String(intVal) + "%");
                    }
                  }
                }
              }}
              className={`w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border ${
                isInvalid ? "border-red-500" : "border-theme"
              } rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all`}
              placeholder="1-100"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted text-sm font-medium pointer-events-none">
              %
            </span>
          </div>
          <p className="text-xs text-theme-muted">
            Image quality percentage (1-100). Default: 92%. Setting to 100%
            doubles file size
          </p>
          {isInvalid && (
            <p className="text-xs text-red-400">
              Value must be between 1 and 100
            </p>
          )}
        </div>
      );
    }

    // ============ COLOR FIELDS (WITH COLOR PICKER) ============
    if (
      keyLower.includes("color") ||
      keyLower.includes("fontcolor") ||
      keyLower.includes("bordercolor") ||
      keyLower.includes("strokecolor")
    ) {
      const disabled = isFieldDisabled(key, groupName);

      // Determine if current value is hex or color name
      const isHexColor = stringValue.match(/^#[0-9A-Fa-f]{6}$/);
      const currentInputType = isHexColor ? "hex" : "name";

      // Common CSS color names supported by ImageMagick
      const colorNames = [
        "white",
        "black",
        "red",
        "green",
        "blue",
        "yellow",
        "cyan",
        "magenta",
        "gray",
        "grey",
        "silver",
        "maroon",
        "olive",
        "lime",
        "aqua",
        "teal",
        "navy",
        "fuchsia",
        "purple",
        "orange",
        "brown",
        "pink",
        "gold",
        "violet",
        "indigo",
        "turquoise",
        "tan",
        "khaki",
        "coral",
        "salmon",
        "crimson",
        "lavender",
        "plum",
        "orchid",
        "chocolate",
        "sienna",
      ].sort();

      // Convert hex to RGB for preview contrast calculation
      const hexToRgb = (hex) => {
        if (!hex || !hex.startsWith("#")) return null;
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
            }
          : null;
      };

      const rgb = isHexColor ? hexToRgb(stringValue) : null;

      return (
        <div className="space-y-2">
          {/* Input Type Toggle */}
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => {
                if (currentInputType === "hex" && !disabled) {
                  // Switch to name, default to white
                  updateValue(fieldKey, "white");
                }
              }}
              disabled={disabled}
              className={`flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm ${
                currentInputType === "name"
                  ? "bg-theme-primary text-white border-theme-primary"
                  : ""
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Color Name
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentInputType === "name" && !disabled) {
                  // Switch to hex, default to white
                  updateValue(fieldKey, "#FFFFFF");
                }
              }}
              disabled={disabled}
              className={`flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm ${
                currentInputType === "hex"
                  ? "bg-theme-primary text-white border-theme-primary"
                  : ""
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              Hex Code
            </button>
          </div>

          {currentInputType === "name" ? (
            // Color Name Dropdown
            <div
              className="relative"
              ref={(el) => (dropdownRefs.current[`color-${fieldKey}`] = el)}
            >
              <button
                onClick={() => !disabled && toggleDropdown(`color-${fieldKey}`)}
                disabled={disabled}
                className={`w-full h-[42px] pl-12 pr-10 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between ${
                  disabled
                    ? "opacity-50 cursor-not-allowed hover:bg-theme-bg hover:border-theme"
                    : ""
                }`}
              >
                <span
                  className={
                    stringValue ? "text-theme-text" : "text-theme-muted"
                  }
                >
                  {stringValue
                    ? stringValue.charAt(0).toUpperCase() + stringValue.slice(1)
                    : "-- Select Color --"}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-theme-muted transition-transform ${
                    isDropdownOpen(`color-${fieldKey}`) ? "rotate-180" : ""
                  }`}
                />
              </button>

              {stringValue && (
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded border-2 border-gray-400 shadow-sm pointer-events-none z-10"
                  style={{ backgroundColor: stringValue }}
                  title={stringValue}
                />
              )}

              {isDropdownOpen(`color-${fieldKey}`) && !disabled && (
                <div
                  className="fixed z-50 bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-60 overflow-y-auto"
                  style={{
                    left: dropdownRefs.current[
                      `color-${fieldKey}`
                    ]?.getBoundingClientRect().left,
                    width:
                      dropdownRefs.current[`color-${fieldKey}`]?.offsetWidth,
                    ...(isDropdownUp(`color-${fieldKey}`)
                      ? {
                          bottom:
                            window.innerHeight -
                            dropdownRefs.current[
                              `color-${fieldKey}`
                            ]?.getBoundingClientRect().top +
                            8,
                        }
                      : {
                          top:
                            dropdownRefs.current[
                              `color-${fieldKey}`
                            ]?.getBoundingClientRect().bottom + 8,
                        }),
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      closeDropdown(`color-${fieldKey}`);
                      updateValue(fieldKey, "");
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      !stringValue
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    -- Select Color --
                  </button>
                  {colorNames.map((color) => (
                    <button
                      key={color}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        closeDropdown(`color-${fieldKey}`);
                        updateValue(fieldKey, color);
                      }}
                      className={`w-full px-4 py-2 text-sm transition-all text-left flex items-center gap-2 ${
                        stringValue.toLowerCase() === color
                          ? "bg-theme-primary text-white"
                          : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded border border-gray-400"
                        style={{ backgroundColor: color }}
                      />
                      {color.charAt(0).toUpperCase() + color.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Hex Color Picker
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={stringValue}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    // Allow empty or partial hex while typing
                    if (
                      val === "" ||
                      val === "#" ||
                      /^#[0-9A-F]{0,6}$/.test(val)
                    ) {
                      updateValue(fieldKey, val);
                    }
                  }}
                  onBlur={(e) => {
                    // Validate and fix on blur
                    let val = e.target.value.toUpperCase();
                    if (!val.startsWith("#")) {
                      val = "#" + val;
                    }
                    // Pad with zeros if incomplete
                    if (val.length < 7) {
                      val = val.padEnd(7, "0");
                    }
                    // Validate hex format
                    if (/^#[0-9A-F]{6}$/.test(val)) {
                      updateValue(fieldKey, val);
                    } else {
                      // Fallback to white if invalid
                      updateValue(fieldKey, "#FFFFFF");
                    }
                  }}
                  disabled={disabled}
                  className={`w-full h-[42px] px-12 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono ${
                    disabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  placeholder="#FFFFFF"
                  maxLength={7}
                />
                {/* Color preview swatch on the left */}
                <div
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded border-2 border-white shadow-sm cursor-pointer"
                  style={{ backgroundColor: stringValue || "#FFFFFF" }}
                  title={stringValue}
                />
              </div>
              {/* Native color picker */}
              <input
                type="color"
                value={
                  stringValue && /^#[0-9A-Fa-f]{6}$/.test(stringValue)
                    ? stringValue
                    : "#FFFFFF"
                }
                onChange={(e) =>
                  updateValue(fieldKey, e.target.value.toUpperCase())
                }
                disabled={disabled}
                className={`h-[42px] w-[42px] bg-theme-bg border border-theme rounded-lg cursor-pointer ${
                  disabled ? "opacity-50 cursor-not-allowed" : ""
                }`}
                title="Pick color"
              />
            </div>
          )}

          {/* Preview and current value */}
          <div className="flex items-center gap-2 text-xs text-theme-muted">
            <div
              className="w-full h-8 rounded border border-theme flex items-center justify-center font-mono text-sm"
              style={{
                backgroundColor: stringValue || "#FFFFFF",
                color:
                  rgb && rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114 > 128
                    ? "#000000"
                    : "#FFFFFF",
              }}
            >
              {stringValue || "No color"}
            </div>
          </div>
          <p className="text-xs text-theme-muted">
            Choose a color name or hex code (e.g., #FFFFFF)
          </p>
        </div>
      );
    }

    // ============ NUMERIC FIELDS (WITH VALIDATION) ============
    if (
      type === "number" ||
      keyLower.includes("port") ||
      keyLower.includes("size") ||
      keyLower.includes("width") ||
      keyLower.includes("height") ||
      keyLower.includes("pointsize") ||
      keyLower.includes("borderwidth") ||
      keyLower.includes("strokewidth") ||
      keyLower.includes("spacing") ||
      keyLower === "maxlogs"
    ) {
      const disabled = isFieldDisabled(key, groupName);
      const hasError = validationErrors[key];

      return (
        <div className="space-y-2">
          <input
            type="number"
            min="0"
            step="1"
            value={stringValue}
            onChange={(e) => {
              const val = e.target.value;
              // Only allow empty string or valid non-negative numbers
              if (val === "" || (!isNaN(val) && Number(val) >= 0)) {
                updateValue(fieldKey, val);
              }
            }}
            onKeyDown={(e) => {
              // Prevent minus sign, 'e', '+', and other non-numeric keys
              if (
                e.key === "-" ||
                e.key === "e" ||
                e.key === "E" ||
                e.key === "+"
              ) {
                e.preventDefault();
              }
            }}
            disabled={disabled}
            className={`w-full h-[42px] px-4 py-2.5 bg-theme-bg border ${
              hasError ? "border-red-500" : "border-theme"
            } rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 ${
              hasError
                ? "focus:ring-red-500 focus:border-red-500"
                : "focus:ring-theme-primary focus:border-theme-primary"
            } transition-all ${
              disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            placeholder="Enter number"
          />
          {hasError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {hasError}
            </p>
          )}
        </div>
      );
    }

    // Generic password/token/key/secret handling (WITHOUT Validate button for other fields)
    if (
      keyLower.includes("password") ||
      keyLower.includes("token") ||
      keyLower.includes("key") ||
      keyLower.includes("secret")
    ) {
      return (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={stringValue}
              onChange={(e) => updateValue(fieldKey, e.target.value)}
              className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
              placeholder="Enter secure value"
            />
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
          </div>
        </div>
      );
    }

    // Check if field should be disabled
    const disabled = isFieldDisabled(key, groupName);

    if (
      stringValue.length > 100 ||
      keyLower.includes("path") ||
      keyLower.includes("url")
    ) {
      return (
        <div className="space-y-2">
          <textarea
            value={stringValue}
            onChange={(e) => {
              updateValue(fieldKey, e.target.value);
              autoResize(e.target);
            }}
            onInput={(e) => autoResize(e.target)}
            ref={(textarea) => textarea && autoResize(textarea)}
            rows={1}
            disabled={disabled}
            className={`w-full px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px] ${
              disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <input
          type="text"
          value={stringValue}
          onChange={(e) => updateValue(fieldKey, e.target.value)}
          disabled={disabled}
          className={`w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">{t("configEditor.loadingConfig")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/40 rounded-xl p-6 border-2 border-red-600/50 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-300 text-lg font-semibold mb-2">
          {t("configEditor.errorLoadingConfig")}
        </p>
        <p className="text-red-200 mb-4">{error}</p>
        <button
          onClick={fetchConfig}
          className="px-6 py-2.5 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all shadow-lg hover:scale-105"
        >
          <RefreshCw className="w-5 h-5 inline mr-2" />
          {t("configEditor.retry")}
        </button>
      </div>
    );
  }

  const TabIcon = tabs[activeTab]?.icon || Settings;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        {/* Left side - Unsaved changes indicator */}
        <div className="flex items-center gap-4">
          {hasUnsavedChanges && (
            <span className="flex items-center gap-1 text-xs text-yellow-500">
              <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
              Unsaved changes
            </span>
          )}
          {Object.keys(validationErrors).length > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="w-3 h-3" />
              {Object.keys(validationErrors).length} validation{" "}
              {Object.keys(validationErrors).length === 1 ? "error" : "errors"}
            </span>
          )}
        </div>

        {/* Right side - Buttons */}
        <div className="flex gap-3">
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-4 h-4 text-theme-primary ${
                loading ? "animate-spin" : ""
              }`}
            />
            <span className="text-theme-text">{t("configEditor.reload")}</span>
          </button>
          <button
            onClick={() => saveConfig(false)}
            disabled={saving || Object.keys(validationErrors).length > 0}
            className={`flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border ${
              Object.keys(validationErrors).length > 0
                ? "border-red-500"
                : hasUnsavedChanges
                ? "border-yellow-500 animate-pulse"
                : "border-theme"
            } hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed`}
            title={
              Object.keys(validationErrors).length > 0
                ? "Fix validation errors before saving"
                : t("configEditor.saveConfigTitle")
            }
          >
            {saving ? (
              <Loader2 className="w-4 h-4 text-theme-primary animate-spin" />
            ) : (
              <Save
                className={`w-4 h-4 ${
                  Object.keys(validationErrors).length > 0
                    ? "text-red-500"
                    : hasUnsavedChanges
                    ? "text-yellow-500"
                    : "text-theme-primary"
                }`}
              />
            )}
            <span className="text-theme-text">
              {saving
                ? t("configEditor.saving")
                : t("configEditor.saveChanges")}
            </span>
            {!saving && (
              <span className="hidden sm:inline text-xs opacity-70 ml-1">
                (Ctrl+↵)
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Auto-Save Toggle */}
      <div className="bg-theme-card rounded-xl p-4 border border-theme shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-theme-primary/10">
              <Save className="w-5 h-5 text-theme-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-theme-text">
                {t("configEditor.autoSave")}
              </h3>
              <p className="text-xs text-theme-muted mt-0.5">
                {t("configEditor.autoSaveDescription")}
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-theme-bg ${
              autoSaveEnabled ? "bg-theme-primary" : "bg-gray-600"
            }`}
            aria-label={t("configEditor.autoSave")}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                autoSaveEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-theme-card rounded-xl p-4 border border-theme shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("configEditor.searchPlaceholder")}
            className="w-full pl-12 pr-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-text transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-sm text-theme-muted mt-2">
            {t("configEditor.filteringSettings", { query: searchQuery })}
          </p>
        )}
      </div>

      {/* Expand/Collapse All Controls */}
      <div className="bg-theme-card rounded-xl p-4 border border-theme shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-theme-text">
            <span className="font-medium">
              {t("configEditor.section", {
                count: getFilteredGroupsByTab(activeTab).filter(
                  (groupName) => getFilteredFieldsForGroup(groupName).length > 0
                ).length,
              })}
            </span>
            {searchQuery && (
              <span className="ml-2 text-theme-muted text-sm">
                ({t("configEditor.filtered")})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const allGroups = getFilteredGroupsByTab(activeTab);
                const newExpandedState = {};
                allGroups.forEach((groupName) => {
                  if (getFilteredFieldsForGroup(groupName).length > 0) {
                    newExpandedState[groupName] = true;
                  }
                });
                setExpandedGroups(newExpandedState);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <Expand className="w-4 h-4 text-theme-primary" />
              {t("configEditor.expandAll")}
            </button>
            <button
              onClick={() => {
                setExpandedGroups({});
              }}
              className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <Minimize className="w-4 h-4 text-theme-primary" />
              {t("configEditor.collapseAll")}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Groups */}
      <div className="space-y-4">
        {getFilteredGroupsByTab(activeTab).map((groupName) => {
          const GroupIcon = getGroupIconForDisplay(groupName);
          const isExpanded = expandedGroups[groupName];
          const fields = getFilteredFieldsForGroup(groupName);
          const settingsCount = fields.length;
          const readmeLink = getReadmeLink(groupName);

          // Don't show groups with no matching fields when searching
          if (searchQuery && settingsCount === 0) return null;

          return (
            <div
              key={groupName}
              className="bg-theme-card rounded-xl border border-theme overflow-hidden hover:border-theme-primary/50 transition-all shadow-sm"
            >
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(groupName)}
                className="w-full px-6 py-5 flex items-center justify-between hover:bg-theme-hover transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-theme-primary/10 group-hover:bg-theme-primary/20 group-hover:scale-110 transition-all">
                    <GroupIcon className="w-6 h-6 text-theme-primary" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xl font-semibold text-theme-primary">
                      {formatGroupName(groupName)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-theme-muted">
                        {settingsCount} setting
                        {settingsCount !== 1 ? "s" : ""}
                        {searchQuery && " (filtered)"}
                      </p>
                      {readmeLink && (
                        <a
                          href={readmeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text rounded-lg transition-all shadow-sm hover:scale-105"
                          title="Open settings documentation in GitHub README"
                        >
                          <Github className="w-3.5 h-3.5 text-theme-primary" />
                          <span>SETTINGS WIKI</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isExpanded
                        ? "bg-theme-card text-theme-primary border border-theme-primary/50 shadow-sm"
                        : "bg-theme-card text-theme-muted border border-theme"
                    }`}
                  >
                    {isExpanded ? "Open" : "Closed"}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-6 h-6 text-theme-primary transition-transform" />
                  ) : (
                    <ChevronRight className="w-6 h-6 text-theme-muted transition-transform" />
                  )}
                </div>
              </button>

              {/* Group Content */}
              {isExpanded && (
                <div className="px-6 pb-6 border-t border-theme bg-theme-bg/30">
                  <div className="pt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {fields.map((key, index) => {
                      const value = usingFlatStructure
                        ? config[key]
                        : config[groupName]?.[key];

                      const displayName = getDisplayName(key);

                      // Create array to hold the field(s) to render
                      const fieldsToRender = [];

                      // Main field
                      fieldsToRender.push(
                        <div key={key} className="space-y-3">
                          <label className="block">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-theme-primary">
                                  {displayName}
                                </span>
                                {CONFIG_TOOLTIPS[key] && (
                                  <Tooltip text={CONFIG_TOOLTIPS[key]}>
                                    <HelpCircle className="w-4 h-4 text-theme-muted hover:text-theme-primary cursor-help transition-colors" />
                                  </Tooltip>
                                )}
                              </div>
                              {key !== displayName && (
                                <span className="text-xs text-theme-muted font-mono bg-theme-bg px-2 py-1 rounded">
                                  {getCleanSettingKey(key)}
                                </span>
                              )}
                            </div>
                            {renderInput(groupName, key, value)}
                          </label>
                        </div>
                      );

                      // Insert WebUI Log Level dropdown after basicAuthPassword in WebUI Settings
                      if (
                        key === "basicAuthPassword" &&
                        groupName === "WebUI Settings"
                      ) {
                        fieldsToRender.push(
                          <div key="webuiLogLevel-ui" className="space-y-3">
                            <label className="block">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-theme-primary">
                                    WebUI Backend Log Level
                                  </span>
                                  {CONFIG_TOOLTIPS["webuiLogLevel"] && (
                                    <Tooltip
                                      text={CONFIG_TOOLTIPS["webuiLogLevel"]}
                                    >
                                      <HelpCircle className="w-4 h-4 text-theme-muted hover:text-theme-primary cursor-help transition-colors" />
                                    </Tooltip>
                                  )}
                                </div>
                              </div>

                              {/* WebUI Log Level Dropdown */}
                              <div
                                className="relative"
                                ref={webuiLogLevelDropdownRef}
                              >
                                <button
                                  onClick={() => {
                                    const shouldOpenUp =
                                      calculateDropdownPosition(
                                        webuiLogLevelDropdownRef
                                      );
                                    setWebuiLogLevelDropdownUp(shouldOpenUp);
                                    setWebuiLogLevelDropdownOpen(
                                      !webuiLogLevelDropdownOpen
                                    );
                                  }}
                                  className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer shadow-sm flex items-center justify-between"
                                >
                                  <span className="text-theme-text">
                                    {webuiLogLevel}
                                  </span>
                                  <ChevronDown
                                    className={`w-5 h-5 text-theme-muted transition-transform ${
                                      webuiLogLevelDropdownOpen
                                        ? "rotate-180"
                                        : ""
                                    }`}
                                  />
                                </button>

                                {webuiLogLevelDropdownOpen && (
                                  <div
                                    className={`absolute z-50 left-0 right-0 ${
                                      webuiLogLevelDropdownUp
                                        ? "bottom-full mb-2"
                                        : "top-full mt-2"
                                    } bg-theme-card border border-theme-primary rounded-lg shadow-xl`}
                                  >
                                    {[
                                      "DEBUG",
                                      "INFO",
                                      "WARNING",
                                      "ERROR",
                                      "CRITICAL",
                                    ].map((level) => (
                                      <button
                                        key={level}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setWebuiLogLevelDropdownOpen(false);
                                          updateWebuiLogLevel(level);
                                        }}
                                        className={`w-full px-4 py-2 text-sm transition-all text-left ${
                                          webuiLogLevel === level
                                            ? "bg-theme-primary text-white"
                                            : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                                        }`}
                                      >
                                        {level}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </label>
                          </div>
                        );
                      }

                      // Insert UseJellySync after UseJellyfin
                      if (
                        key === "UseJellyfin" &&
                        (groupName === "JellyfinPart" ||
                          groupName === "Jellyfin Settings")
                      ) {
                        // Check if UseJellyfin is enabled - if yes, disable the Sync toggle
                        const jellyfinEnabled = usingFlatStructure
                          ? config["UseJellyfin"] === "true" ||
                            config["UseJellyfin"] === true
                          : config["JellyfinPart"]?.UseJellyfin === "true" ||
                            config["JellyfinPart"]?.UseJellyfin === true;

                        fieldsToRender.push(
                          <div key="UseJellySync-ui" className="space-y-3">
                            <label className="block">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-theme-primary">
                                    Use JellySync
                                  </span>
                                  {CONFIG_TOOLTIPS["UseJellySync"] && (
                                    <Tooltip
                                      text={CONFIG_TOOLTIPS["UseJellySync"]}
                                    >
                                      <HelpCircle className="w-4 h-4 text-theme-muted hover:text-theme-primary cursor-help transition-colors" />
                                    </Tooltip>
                                  )}
                                </div>
                                <span className="text-xs text-theme-muted font-mono bg-theme-bg px-2 py-1 rounded">
                                  UI Only
                                </span>
                              </div>
                              <div
                                className={`flex items-center justify-between h-[42px] px-4 bg-theme-bg rounded-lg border border-theme transition-all ${
                                  jellyfinEnabled
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:border-theme-primary/30"
                                }`}
                              >
                                <div className="text-sm font-medium text-theme-text">
                                  Use JellySync
                                  {jellyfinEnabled && (
                                    <span className="text-xs text-theme-muted ml-2">
                                      (Disabled when Jellyfin is active)
                                    </span>
                                  )}
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={useJellySync}
                                    onChange={(e) =>
                                      setUseJellySync(e.target.checked)
                                    }
                                    disabled={jellyfinEnabled}
                                    className="sr-only peer"
                                  />
                                  <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-theme-primary peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                                </label>
                              </div>
                            </label>
                          </div>
                        );
                      }

                      // Insert UseEmbySync after UseEmby
                      if (
                        key === "UseEmby" &&
                        (groupName === "EmbyPart" ||
                          groupName === "Emby Settings")
                      ) {
                        // Check if UseEmby is enabled - if yes, disable the Sync toggle
                        const embyEnabled = usingFlatStructure
                          ? config["UseEmby"] === "true" ||
                            config["UseEmby"] === true
                          : config["EmbyPart"]?.UseEmby === "true" ||
                            config["EmbyPart"]?.UseEmby === true;

                        fieldsToRender.push(
                          <div key="UseEmbySync-ui" className="space-y-3">
                            <label className="block">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-theme-primary">
                                    Use EmbySync
                                  </span>
                                  {CONFIG_TOOLTIPS["UseEmbySync"] && (
                                    <Tooltip
                                      text={CONFIG_TOOLTIPS["UseEmbySync"]}
                                    >
                                      <HelpCircle className="w-4 h-4 text-theme-muted hover:text-theme-primary cursor-help transition-colors" />
                                    </Tooltip>
                                  )}
                                </div>
                                <span className="text-xs text-theme-muted font-mono bg-theme-bg px-2 py-1 rounded">
                                  UI Only
                                </span>
                              </div>
                              <div
                                className={`flex items-center justify-between h-[42px] px-4 bg-theme-bg rounded-lg border border-theme transition-all ${
                                  embyEnabled
                                    ? "opacity-50 cursor-not-allowed"
                                    : "hover:border-theme-primary/30"
                                }`}
                              >
                                <div className="text-sm font-medium text-theme-text">
                                  Use EmbySync
                                  {embyEnabled && (
                                    <span className="text-xs text-theme-muted ml-2">
                                      (Disabled when Emby is active)
                                    </span>
                                  )}
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={useEmbySync}
                                    onChange={(e) =>
                                      setUseEmbySync(e.target.checked)
                                    }
                                    disabled={embyEnabled}
                                    className="sr-only peer"
                                  />
                                  <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-theme-primary peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                                </label>
                              </div>
                            </label>
                          </div>
                        );
                      }

                      return fieldsToRender;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* No Results Message */}
        {searchQuery && getFilteredGroupsByTab(activeTab).length === 0 && (
          <div className="bg-theme-card rounded-xl p-12 border border-theme text-center">
            <Search className="w-12 h-12 text-theme-muted mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold text-theme-text mb-2">
              {t("configEditor.noSettingsFound")}
            </h3>
            <p className="text-theme-muted mb-4">
              {t("configEditor.noSettingsMatch", {
                query: searchQuery,
                tab: activeTab,
              })}
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text font-medium transition-all shadow-sm"
            >
              {t("configEditor.clearSearch")}
            </button>
          </div>
        )}
      </div>

      {/* Overlay Preview Modal */}
      {previewOverlay && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setPreviewOverlay(null)}
        >
          <div
            className="bg-theme-card rounded-xl border border-theme shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-theme sticky top-0 bg-theme-card z-10">
              <div className="flex items-center gap-3">
                <Image className="w-5 h-5 text-theme-primary" />
                <h3 className="text-lg font-semibold text-theme-text">
                  {t("configEditor.overlayPreview")}
                </h3>
              </div>
              <button
                onClick={() => setPreviewOverlay(null)}
                className="p-2 hover:bg-theme-hover rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-theme-text" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-theme-muted mb-1">
                  {t("configEditor.filename")}:
                </p>
                <p className="text-theme-text font-mono bg-theme-bg px-3 py-2 rounded-lg border border-theme">
                  {previewOverlay}
                </p>
              </div>

              {/* Image Preview with Checkered Background */}
              <div className="relative bg-theme-bg rounded-lg border border-theme p-4 flex items-center justify-center overflow-hidden">
                {/* Checkered background for transparency */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    backgroundImage: `
                      linear-gradient(45deg, #3a3a3a 25%, transparent 25%),
                      linear-gradient(-45deg, #3a3a3a 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, #3a3a3a 75%),
                      linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)
                    `,
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  }}
                ></div>
                <img
                  src={`${API_URL}/overlayfiles/preview/${encodeURIComponent(
                    previewOverlay
                  )}`}
                  alt={previewOverlay}
                  className="relative z-10 max-w-full h-auto object-contain rounded-lg shadow-lg"
                  style={{ maxHeight: "55vh" }}
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "flex";
                  }}
                />
                <div
                  className="hidden flex-col items-center gap-3 text-theme-muted relative z-10"
                  style={{ display: "none" }}
                >
                  <AlertCircle className="w-12 h-12" />
                  <p>{t("configEditor.failedLoadImage")}</p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setPreviewOverlay(null)}
                  className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Font Preview Modal */}
      {previewFont && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={() => setPreviewFont(null)}
        >
          <div
            className="bg-theme-card rounded-xl border border-theme shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-theme sticky top-0 bg-theme-card z-10">
              <div className="flex items-center gap-3">
                <Type className="w-5 h-5 text-theme-primary" />
                <h3 className="text-lg font-semibold text-theme-text">
                  {t("configEditor.fontPreview")}
                </h3>
              </div>
              <button
                onClick={() => setPreviewFont(null)}
                className="p-2 hover:bg-theme-hover rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-theme-text" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-theme-muted mb-1">
                  {t("configEditor.filename")}:
                </p>
                <p className="text-theme-text font-mono bg-theme-bg px-3 py-2 rounded-lg border border-theme">
                  {previewFont}
                </p>
              </div>

              {/* Font Preview Samples */}
              <div className="space-y-3">
                <div className="bg-theme-bg rounded-lg border border-theme p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-theme-muted mb-1">
                        {t("configEditor.uppercase")}:
                      </p>
                      <img
                        src={`${API_URL}/fonts/preview/${encodeURIComponent(
                          previewFont
                        )}?text=ABCDEFGHIJKLMNOPQRSTUVWXYZ`}
                        alt="Uppercase letters"
                        className="w-full h-auto object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-theme-muted mb-1">
                        {t("configEditor.lowercase")}:
                      </p>
                      <img
                        src={`${API_URL}/fonts/preview/${encodeURIComponent(
                          previewFont
                        )}?text=abcdefghijklmnopqrstuvwxyz`}
                        alt="Lowercase letters"
                        className="w-full h-auto object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-theme-muted mb-1">
                        {t("configEditor.numbers")}:
                      </p>
                      <img
                        src={`${API_URL}/fonts/preview/${encodeURIComponent(
                          previewFont
                        )}?text=0123456789`}
                        alt="Numbers"
                        className="w-full h-auto object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-theme-muted mb-1">
                        {t("configEditor.sample")}:
                      </p>
                      <img
                        src={`${API_URL}/fonts/preview/${encodeURIComponent(
                          previewFont
                        )}?text=The Quick Brown Fox Jumps Over The Lazy Dog`}
                        alt="Sample text"
                        className="w-full h-auto object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setPreviewFont(null)}
                  className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfigEditor;
