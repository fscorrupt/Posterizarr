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
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import ValidateButton from "./ValidateButton";

const API_URL = "/api";

// Comprehensive tooltip descriptions for all config variables
const CONFIG_TOOLTIPS = {
  // WebUI Settings
  basicAuthEnabled:
    "Enable Basic Authentication to protect the Web UI. Set to true to require username/password login (Default: false)",
  basicAuthUsername:
    "Username for Basic Authentication. Change this from the default 'admin' for better security (Default: admin)",
  basicAuthPassword:
    "Password for Basic Authentication. IMPORTANT: Change this from the default 'posterizarr' before enabling auth! (Default: posterizarr)",
  // ApiPart
  tvdbapi:
    "Your TVDB Project API key. If you are a TVDB subscriber, you can append your PIN to the end of your API key in the format YourApiKey#YourPin",
  tmdbtoken: "Your TMDB API Read Access Token (the really long one)",
  FanartTvAPIKey: "Your Fanart.tv Personal API Key",
  PlexToken: "Your Plex authentication token (Leave empty if not using Plex)",
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
    "Plex server URL (e.g., http://192.168.1.1:32400 or http://myplexserver.com:32400)",
  UsePlex:
    "If set to true, you tell the script to use a Plex Server (Default: true). Do not enable more than one media server",
  PlexUploadExistingAssets:
    "If set to true, the script will check local assets and upload them to Plex, but only if Plex does not already have EXIF data from Posterizarr, Kometa, or TCM",
  PlexUpload:
    "If set to true, Posterizarr will directly upload the artwork to Plex (handy if you do not use Kometa)",

  // JellyfinPart
  JellyfinLibstoExclude:
    "Jellyfin libraries, by local folder name, to exclude from processing (comma-separated list)",
  JellyfinUrl:
    "Jellyfin server URL (e.g., http://192.168.1.1:8096 or http://myplexserver.com:8096)",
  UseJellyfin:
    "If set to true, you tell the script to use a Jellyfin Server (Default: false). Do not enable more than one media server",
  JellyfinUploadExistingAssets:
    "If set to true, the script will check local assets and upload them to Jellyfin, but only if Jellyfin does not already have EXIF data from Posterizarr, Kometa, or TCM",
  JellyfinReplaceThumbwithBackdrop:
    "If set to true, the script will replace the Thumb picture with the backdrop image. This only occurs if BackgroundPosters is also set to true",

  // EmbyPart
  EmbyLibstoExclude:
    "Emby libraries, by local folder name, to exclude from processing (comma-separated list)",
  EmbyUrl:
    "Emby server URL (e.g., http://192.168.1.1:8096/emby or http://myplexserver.com:8096/emby)",
  UseEmby:
    "If set to true, you tell the script to use an Emby Server (Default: false). Do not enable more than one media server",
  EmbyUploadExistingAssets:
    "If set to true, the script will check local assets and upload them to Emby, but only if Emby does not already have EXIF data from Posterizarr, Kometa, or TCM",
  EmbyReplaceThumbwithBackdrop:
    "If set to true, the script will replace the Thumb picture with the backdrop image. This only occurs if BackgroundPosters is also set to true",

  // Notification
  SendNotification:
    "Set to true if you want to send notifications via Discord or Apprise, else false",
  AppriseUrl:
    "Only possible on Docker - URL for Apprise provider. See Apprise documentation for details",
  Discord: "Discord Webhook URL for notifications",
  DiscordUserName: "Username for the Discord webhook (default is Posterizarr)",
  UseUptimeKuma: "Set to true if you want to send webhook to Uptime-Kuma",
  UptimeKumaUrl: "Uptime-Kuma Webhook URL",

  // PrerequisitePart
  AssetPath:
    "Path to store generated posters. On Docker, this should be /assets",
  BackupPath: "Path to store/download Plex posters when using the backup mode",
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
  SkipTBA: "Set to true to skip TitleCard creation if the Title text is 'TBA'",
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
  PosterFontcolor: "Color of font text on posters (e.g., #FFFFFF for white)",
  PosterBordercolor: "Color of border on posters (e.g., #000000 for black)",
  PosterMinPointSize: "Minimum size of text in poster (in points)",
  PosterMaxPointSize: "Maximum size of text in poster (in points)",
  PosterBorderwidth: "Border width in pixels",
  PosterMaxWidth: "Maximum width of text box on poster",
  PosterMaxHeight: "Maximum height of text box on poster",
  PosterTextOffset:
    "Text box offset from the bottom of the picture (use +200 or -150 format)",
  PosterAddTextStroke: "Set to true to add stroke/outline to text",
  PosterStrokecolor: "Color of text stroke/outline (e.g., #000000 for black)",
  PosterStrokewidth: "Stroke width in pixels",
  PosterLineSpacing: "Adjust the height between lines of text (Default is 0)",
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
  BackgroundAddBorder: "Set to true to add a border to the background image",
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
  TitleCardTitleFontcolor: "Color of episode title font text on title cards",
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
  ShowTitleMinPointSize: "Minimum size of show title text on season posters",
  ShowTitleMaxPointSize: "Maximum size of show title text on season posters",
  ShowTitleMaxWidth: "Maximum width of show title text box on season posters",
  ShowTitleMaxHeight: "Maximum height of show title text box on season posters",
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
  CollectionTitleStrokecolor: "Color of collection title text stroke/outline",
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
  CollectionPosterStrokewidth: "Stroke width in pixels for collection posters",
  CollectionPosterAddOverlay:
    "Set to true to add the defined overlay file to the collection poster image",
  CollectionPosterFontcolor: "Color of font text on collection posters",
  CollectionPosterBordercolor: "Color of border on collection posters",
  CollectionPosterMinPointSize: "Minimum size of text in collection poster",
  CollectionPosterMaxPointSize: "Maximum size of text in collection poster",
  CollectionPosterBorderwidth: "Border width in pixels for collection posters",
  CollectionPosterMaxWidth: "Maximum width of text box on collection poster",
  CollectionPosterMaxHeight: "Maximum height of text box on collection poster",
  CollectionPosterTextOffset:
    "Text box offset from the bottom of the collection poster (use +200 or -150 format)",
  CollectionPosterLineSpacing:
    "Adjust the height between lines of text on collection posters (Default is 0)",
  CollectionPosterTextGravity:
    "Specifies the text alignment within the textbox on collection posters (Default is south)",
};

function ConfigEditor() {
  const location = useLocation();
  const [config, setConfig] = useState(null);
  const [uiGroups, setUiGroups] = useState(null);
  const [displayNames, setDisplayNames] = useState({});
  const [usingFlatStructure, setUsingFlatStructure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const hasInitializedGroups = useRef(false);

  // Map URL path to tab name
  const getActiveTabFromPath = () => {
    const path = location.pathname;
    if (path.includes("/config/webui")) return "WebUI";
    if (path.includes("/config/general")) return "General";
    if (path.includes("/config/services")) return "Services";
    if (path.includes("/config/api")) return "API";
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
    Services: {
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
    API: {
      groups: ["API Keys & Tokens", "ApiPart"],
      icon: Settings,
    },
    Languages: {
      groups: ["Language & Preferences"],
      icon: Type,
    },
    Visuals: {
      groups: [
        "Image Filters",
        "Text Formatting",
        "Fonts",
        "Overlay Files",
        "Resolution Overlays",
        "Image Processing",
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
  }, []);

  useEffect(() => {
    if (config && !hasInitializedGroups.current) {
      const firstGroup = tabs["General"]?.groups[0];
      if (firstGroup) {
        setExpandedGroups({ [firstGroup]: true });
        hasInitializedGroups.current = true;
      }
    }
  }, [config]);

  useEffect(() => {
    if (activeTab && config && hasInitializedGroups.current) {
      const firstGroup = getGroupsByTab(activeTab)[0];
      if (firstGroup) {
        setExpandedGroups((prev) => ({
          ...prev,
          [firstGroup]: true,
        }));
      }
    }
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

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/config`);
      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        setUiGroups(data.ui_groups || null);
        setDisplayNames(data.display_names || {});
        setUsingFlatStructure(data.using_flat_structure || false);

        console.log(
          "Config structure:",
          data.using_flat_structure ? "FLAT" : "GROUPED"
        );
        console.log(
          "Display names loaded:",
          Object.keys(data.display_names || {}).length
        );
      } else {
        setError("Failed to load config");
      }
    } catch (err) {
      setError(err.message);
      toast.error("Failed to load configuration", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);

    //  Save the OLD auth status BEFORE saving
    const oldAuthEnabled = usingFlatStructure
      ? config?.basicAuthEnabled
      : config?.WebUI?.basicAuthEnabled;

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
        toast.success("Configuration saved successfully!", {
          duration: 3000,
          position: "top-right",
        });

        //  Get NEW auth status AFTER saving
        const newAuthEnabled = usingFlatStructure
          ? config?.basicAuthEnabled
          : config?.WebUI?.basicAuthEnabled;

        // If Auth has just been ENABLED -> reload page
        if (!oldAuthEnabled && newAuthEnabled) {
          toast.success(
            "Basic Auth enabled! Page will reload in 2 seconds...",
            {
              duration: 2000,
              position: "top-right",
              icon: "🔒",
            }
          );

          // Wait 2 seconds, then reload

          setTimeout(() => {
            window.location.reload();
          }, 2000);
          return;
        }

        // If Auth was just DISABLED -> reload page too

        if (oldAuthEnabled && !newAuthEnabled) {
          toast.success(
            "Basic Auth disabled! Page will reload in 2 seconds...",
            {
              duration: 2000,
              position: "top-right",
              icon: "🔓",
            }
          );

          // Warte 2 Sekunden, dann reload
          setTimeout(() => {
            window.location.reload();
          }, 2000);
          return;
        }
      } else {
        setError("Failed to save config");
        toast.error("Failed to save configuration", {
          duration: 4000,
          position: "top-right",
        });
      }
    } catch (err) {
      setError(err.message);
      toast.error(`Error: ${err.message}`, {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (groupName) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const updateValue = (key, value) => {
    if (usingFlatStructure) {
      setConfig((prev) => ({
        ...prev,
        [key]: value,
      }));
    } else {
      const [section, field] = key.includes(".") ? key.split(".") : [null, key];
      if (section) {
        setConfig((prev) => ({
          ...prev,
          [section]: {
            ...prev[section],
            [field]: value,
          },
        }));
      }
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

  const renderInput = (groupName, key, value) => {
    const Icon = getInputIcon(key, value);
    const fieldKey = usingFlatStructure ? key : `${groupName}.${key}`;
    const displayName = getDisplayName(key);

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

      return (
        <div className="flex items-center justify-between h-[42px] px-4 bg-theme-bg rounded-lg border border-theme hover:border-theme-primary/30 transition-all">
          <div className="text-sm font-medium text-theme-text">
            {displayName}
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
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

                updateValue(fieldKey, newValue);
              }}
              className="sr-only peer"
              id={`${groupName}-${key}`}
            />
            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-theme-primary peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary"></div>
          </label>
        </div>
      );
    }

    // ============ DROPDOWN FOR FAVPROVIDER ============
    if (key === "FavProvider") {
      const providerOptions = ["tmdb", "tvdb", "fanart"];

      return (
        <div className="space-y-2">
          <div className="relative">
            <select
              value={stringValue.toLowerCase()}
              onChange={(e) => updateValue(fieldKey, e.target.value)}
              className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer appearance-none"
            >
              {providerOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted pointer-events-none" />
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
          <div className="relative">
            <select
              value={stringValue}
              onChange={(e) => updateValue(fieldKey, e.target.value)}
              className="w-full h-[42px] px-4 py-2.5 pr-10 bg-theme-bg border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all cursor-pointer appearance-none"
            >
              {sortingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-muted pointer-events-none" />
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
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
                placeholder="Enter Plex token"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            </div>
            <ValidateButton type="plex" config={config} label="Validate" />
          </div>
          <p className="text-xs text-theme-muted">
            Your Plex authentication token
          </p>
        </div>
      );
    }

    // Jellyfin API Key mit Validate-Button
    if (key === "JellyfinAPIKey") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
                placeholder="Enter Jellyfin API key"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            </div>
            <ValidateButton type="jellyfin" config={config} label="Validate" />
          </div>
          <p className="text-xs text-theme-muted">
            Create API key in Jellyfin at Settings → Advanced → API Keys
          </p>
        </div>
      );
    }

    // Emby API Key mit Validate-Button
    if (key === "EmbyAPIKey") {
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={stringValue}
                onChange={(e) => updateValue(fieldKey, e.target.value)}
                className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
                placeholder="Enter Emby API key"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
            </div>
            <ValidateButton type="emby" config={config} label="Validate" />
          </div>
          <p className="text-xs text-theme-muted">
            Create API key in Emby at Settings → Advanced → API Keys
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
            <ValidateButton type="tmdb" config={config} label="Validate" />
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
            <ValidateButton type="tvdb" config={config} label="Validate" />
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
            <ValidateButton type="fanart" config={config} label="Validate" />
          </div>
          <p className="text-xs text-theme-muted">
            Your Fanart.tv Personal API Key
          </p>
        </div>
      );
    }

    // ============ NOTIFICATIONS MIT VALIDATE-BUTTONS ============

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
            <ValidateButton type="discord" config={config} label="Test" />
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
            <ValidateButton type="apprise" config={config} label="Validate" />
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
            <ValidateButton type="uptimekuma" config={config} label="Test" />
          </div>
          <p className="text-xs text-theme-muted">
            Uptime Kuma push monitor URL (sends test ping when validated)
          </p>
        </div>
      );
    }

    // ============ REST OF THE FUNCTION (UNCHANGED) ============

    // Handle text_offset specially
    if (keyLower.includes("offset") || keyLower === "text_offset") {
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={stringValue}
            onChange={(e) => updateValue(fieldKey, e.target.value)}
            className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono"
            placeholder="+200 or -150"
          />
          <p className="text-xs text-theme-muted">
            Use + or - prefix (e.g., +200, -150)
          </p>
        </div>
      );
    }

    if (
      type === "number" ||
      keyLower.includes("port") ||
      keyLower.includes("size") ||
      keyLower.includes("width") ||
      keyLower.includes("height")
    ) {
      return (
        <div className="space-y-2">
          <input
            type="number"
            value={stringValue}
            onChange={(e) => updateValue(fieldKey, e.target.value)}
            className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
          />
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
            className="w-full px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono text-sm resize-none overflow-hidden min-h-[42px]"
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
          className="w-full h-[42px] px-4 py-2.5 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-950/40 rounded-xl p-6 border-2 border-red-600/50 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-300 text-lg font-semibold mb-2">
          Error Loading Configuration
        </p>
        <p className="text-red-200 mb-4">{error}</p>
        <button
          onClick={fetchConfig}
          className="px-6 py-2.5 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all shadow-lg hover:scale-105"
        >
          <RefreshCw className="w-5 h-5 inline mr-2" />
          Retry
        </button>
      </div>
    );
  }

  const TabIcon = tabs[activeTab]?.icon || Settings;

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-theme-text flex items-center gap-3">
            <TabIcon className="w-8 h-8 text-theme-primary" />
            Configure your Posterizarr {activeTab.toLowerCase()} settings
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all disabled:opacity-50 hover:scale-105 shadow-sm"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            Reload
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all shadow-lg hover:scale-105"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {saving ? "Saving..." : "Save Changes"}
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
            placeholder="Search settings by name or value..."
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
            Filtering settings matching "{searchQuery}"
          </p>
        )}
      </div>

      {/* Settings Groups */}
      <div className="space-y-4">
        {getFilteredGroupsByTab(activeTab).map((groupName) => {
          const GroupIcon = getGroupIconForDisplay(groupName);
          const isExpanded = expandedGroups[groupName];
          const fields = getFilteredFieldsForGroup(groupName);
          const settingsCount = fields.length;

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
                    <p className="text-sm text-theme-muted mt-1">
                      {settingsCount} setting
                      {settingsCount !== 1 ? "s" : ""}
                      {searchQuery && " (filtered)"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      isExpanded
                        ? "bg-theme-primary/20 text-theme-primary border border-theme-primary/30"
                        : "bg-theme-bg text-theme-muted border border-theme"
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
                    {fields.map((key) => {
                      const value = usingFlatStructure
                        ? config[key]
                        : config[groupName]?.[key];

                      const displayName = getDisplayName(key);

                      return (
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
                                  {key}
                                </span>
                              )}
                            </div>
                            {renderInput(groupName, key, value)}
                          </label>
                        </div>
                      );
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
              No settings found
            </h3>
            <p className="text-theme-muted mb-4">
              No settings match your search "{searchQuery}" in the {activeTab}{" "}
              section
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg font-medium transition-all"
            >
              Clear Search
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfigEditor;
