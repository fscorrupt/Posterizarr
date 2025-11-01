import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Upload,
  RefreshCw,
  Loader2,
  Download,
  Check,
  Star,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";

const API_URL = "/api";

// ============================================================================
// WAIT FOR LOG FILE - Polls backend until log file exists
// ============================================================================
const waitForLogFile = async (logFileName, maxAttempts = 30, delayMs = 200) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${API_URL}/logs/${logFileName}/exists`);
      const data = await response.json();

      if (data.exists) {
        console.log(`Log file ${logFileName} exists after ${i + 1} attempts`);
        return true;
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`Error checking log file existence: ${error}`);
      // Continue trying even if there's an error
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(
    `Log file ${logFileName} not found after ${maxAttempts} attempts`
  );
  return false;
};

function AssetReplacer({ asset, onClose, onSuccess }) {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPosterizarrRunning, setIsPosterizarrRunning] = useState(false);
  const [previews, setPreviews] = useState({ tmdb: [], tvdb: [], fanart: [] });
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [languageOrder, setLanguageOrder] = useState({
    poster: [],
    background: [],
    season: [],
  });

  const [activeTab, setActiveTab] = useState("upload");
  const [processWithOverlays, setProcessWithOverlays] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null); // Store the actual file
  const [imageDimensions, setImageDimensions] = useState(null); // Store {width, height}
  const [isDimensionValid, setIsDimensionValid] = useState(false); // Track if dimensions are valid
  const [activeProviderTab, setActiveProviderTab] = useState("tmdb"); // Provider tabs: tmdb, tvdb, fanart

  // Confirmation dialog states
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [showPreviewConfirm, setShowPreviewConfirm] = useState(false);
  const [showFetchConfirm, setShowFetchConfirm] = useState(false);
  const [pendingPreview, setPendingPreview] = useState(null);
  const [pendingFetchParams, setPendingFetchParams] = useState(null);

  // Manual form for editable parameters (overlay processing)
  const [manualForm, setManualForm] = useState({
    titletext: "",
    foldername: "",
    libraryname: "",
    seasonPosterName: "", // For season posters and titlecards
    episodeNumber: "", // For titlecards
    episodeTitleName: "", // For titlecards
  });

  // Manual search state (separate from manual form!)
  const [manualSearchForm, setManualSearchForm] = useState({
    seasonNumber: "", // For searching seasons
    episodeNumber: "", // For searching episodes
  });

  // Extract metadata from asset
  const extractMetadata = () => {
    console.log("=== AssetReplacer: Extracting Metadata ===");
    console.log("Asset path:", asset.path);
    console.log("Asset type:", asset.type);
    console.log("Asset _dbData:", asset._dbData);

    // Extract metadata from path including provider IDs if present
    let title = null;
    let year = null;
    let folderName = null;
    let libraryName = null;
    let tmdb_id = null;
    let tvdb_id = null;
    let imdb_id = null;

    // Extract library name (parent folder: "4K", "TV", etc.)
    const pathSegments = asset.path?.split(/[\/\\]/).filter(Boolean);
    console.log("Path segments:", pathSegments);

    if (pathSegments && pathSegments.length > 0) {
      // Find library name - usually the top-level folder like "4K" or "TV"
      for (let i = 0; i < pathSegments.length; i++) {
        // Common library folder names
        if (pathSegments[i].match(/^(4K|TV|Movies|Series|anime)$/i)) {
          libraryName = pathSegments[i];
          console.log(`Found library name: ${libraryName}`);
          break;
        }
      }
      // If not found, use the first segment as library name
      if (!libraryName && pathSegments.length > 0) {
        libraryName = pathSegments[0];
        console.log(`Using first segment as library name: ${libraryName}`);
      }
    }

    // Determine asset type first (needed for title extraction logic)
    let assetType = "poster";
    if (asset.path?.includes("background") || asset.type === "background") {
      assetType = "background";
    } else if (asset.path?.includes("Season") || asset.type === "season") {
      assetType = "season";
    } else if (asset.path?.match(/S\d+E\d+/) || asset.type === "titlecard") {
      assetType = "titlecard";
    }
    console.log(`Detected asset type: ${assetType}`);

    // For seasons and titlecards, extract title from parent folder (show name)
    if (assetType === "season" || assetType === "titlecard") {
      console.log("Processing TV show asset (season or titlecard)");
      // Path format: ".../Show Name (Year) {tvdb-123}/Season01/..." or ".../Show Name (Year) {tvdb-123}/S01E01.jpg"

      if (pathSegments && pathSegments.length > 1) {
        // Find the show folder (parent of Season folder or file)
        let showFolderIndex = -1;
        for (let i = pathSegments.length - 1; i >= 0; i--) {
          if (
            pathSegments[i].match(/Season\d+/i) ||
            pathSegments[i].match(/S\d+E\d+/)
          ) {
            showFolderIndex = i - 1;
            break;
          }
        }

        // If no Season folder found, try to find show folder by looking for {tvdb-} or {tmdb-}
        if (showFolderIndex === -1) {
          for (let i = 0; i < pathSegments.length; i++) {
            if (pathSegments[i].match(/\{(tvdb|tmdb)-\d+\}/)) {
              showFolderIndex = i;
              break;
            }
          }
        }

        if (showFolderIndex >= 0 && pathSegments[showFolderIndex]) {
          const showFolder = pathSegments[showFolderIndex];
          folderName = showFolder; // Store the full folder name

          // Extract title and year - remove ALL ID tags in various formats:
          // {tmdb-123}, {tvdb-456}, {imdb-tt123}, [tmdb-123], [tvdb-456], (tmdb-123), (xxx-yyy), etc.
          // Pattern: "Show Name (2020) {tmdb-123}" or "Show Name (2020) [imdb-tt123][tvdb-456]" or "Show Name (2020) (tmdb-123)"
          let cleanFolder = showFolder
            .replace(/\s*\{[^}]+\}/g, "") // Remove {xxx-yyy}
            .replace(/\s*\[[^\]]+\]/g, "") // Remove [xxx-yyy]
            .replace(/\s*\((tmdb|tvdb|imdb)-[^)]+\)/gi, "") // Remove (tmdb-xxx), (tvdb-xxx), (imdb-xxx)
            .replace(/\s*\([a-z]+-[^)]+\)/gi, "") // Remove generic (xxx-yyy) format
            .trim();

          // Now extract title and year
          const showMatch = cleanFolder.match(/^(.+?)\s*\((\d{4})\)\s*$/);
          if (showMatch) {
            title = showMatch[1].trim();
            year = parseInt(showMatch[2]);
          } else {
            // Fallback: try to extract year separately
            const yearMatch = cleanFolder.match(/\((\d{4})\)/);
            if (yearMatch) {
              year = parseInt(yearMatch[1]);
              title = cleanFolder.replace(/\s*\(\d{4}\)\s*/, "").trim();
            } else {
              title = cleanFolder;
            }
          }
        }
      }
    } else {
      // For movies/posters/backgrounds: extract from the main folder/file
      // Find folder with year pattern (ignoring ALL tags)
      if (pathSegments && pathSegments.length > 0) {
        for (let i = pathSegments.length - 1; i >= 0; i--) {
          const segment = pathSegments[i];
          // Check if this segment has a year pattern
          if (segment.match(/\(\d{4}\)/)) {
            folderName = segment;

            // Clean the folder name from ALL ID tags in various formats:
            // {tmdb-123}, [tvdb-456], (imdb-tt123), (xxx-yyy), etc.
            let cleanSegment = segment
              .replace(/\s*\{[^}]+\}/g, "") // Remove {xxx-yyy}
              .replace(/\s*\[[^\]]+\]/g, "") // Remove [xxx-yyy]
              .replace(/\s*\((tmdb|tvdb|imdb)-[^)]+\)/gi, "") // Remove (tmdb-xxx), (tvdb-xxx), (imdb-xxx)
              .replace(/\s*\([a-z]+-[^)]+\)/gi, "") // Remove generic (xxx-yyy) format
              .trim();

            // Extract title and year
            const match = cleanSegment.match(/^(.+?)\s*\((\d{4})\)\s*$/);
            if (match) {
              title = match[1].trim();
              year = parseInt(match[2]);
            } else {
              // Fallback
              const yearMatch = cleanSegment.match(/\((\d{4})\)/);
              if (yearMatch) {
                year = parseInt(yearMatch[1]);
                title = cleanSegment.replace(/\s*\(\d{4}\)\s*/, "").trim();
              } else {
                title = cleanSegment;
              }
            }
            break;
          }
        }

        // If no folder with year found, try fallback
        if (!folderName) {
          const yearMatch = asset.path?.match(/\((\d{4})\)/);
          if (yearMatch) {
            year = parseInt(yearMatch[1]);
          }

          // Try to extract title from last folder/file segment
          if (pathSegments && pathSegments.length > 0) {
            const lastSegment = pathSegments[pathSegments.length - 1];
            // Check if it's a file (has extension)
            const isFile = lastSegment.match(/\.[^.]+$/);
            const folderSegment =
              isFile && pathSegments.length > 1
                ? pathSegments[pathSegments.length - 2]
                : lastSegment;

            folderName = folderSegment;

            // Remove year and ALL ID tags (in various bracket formats), and file extension
            // Filters: {tmdb-123}, [tvdb-456], (imdb-tt123), (xxx-yyy), etc.
            const cleanTitle = folderSegment
              .replace(/\s*\(\d{4}\)\s*/, "")
              .replace(/\s*\{[^}]+\}/g, "") // Remove {xxx-yyy}
              .replace(/\s*\[[^\]]+\]/g, "") // Remove [xxx-yyy]
              .replace(/\s*\((tmdb|tvdb|imdb)-[^)]+\)/gi, "") // Remove (tmdb-xxx), (tvdb-xxx), (imdb-xxx)
              .replace(/\s*\([a-z]+-[^)]+\)/gi, "") // Remove generic (xxx-yyy) format
              .replace(/\.[^.]+$/, "")
              .trim();
            if (cleanTitle) {
              title = cleanTitle;
            }
          }
        }
      }
    }

    // Determine media type - check for TV indicators (Season folders, episode patterns, or TV in path)
    // Support Season 0/00 (Special Seasons) as well as regular seasons
    const hasSeason = asset.path?.match(/Season\d+/i);
    const hasEpisode = asset.path?.match(/S\d+E\d+/i);
    const hasTVFolder = asset.path?.match(/[\/\\](TV|Series)[\/\\]/i);
    // Also check for TVDB/TMDB IDs in brackets which indicate TV shows
    const hasTVDBId = asset.path?.match(/\[tvdb-\d+\]/i);
    const isTV =
      hasSeason ||
      hasEpisode ||
      hasTVFolder ||
      hasTVDBId ||
      asset.type === "tv";
    const mediaType = isTV ? "tv" : "movie";

    // Extract season/episode numbers
    // Priority 1: From DB Title field (if asset comes from AssetOverview)
    // Priority 2: From asset path
    // Note: Season 0 or 00 represents Special Seasons
    let seasonNumber = null;
    let episodeNumber = null;

    // Check if we have DB data (from AssetOverview)
    const dbTitle = asset._dbData?.Title || "";

    if (dbTitle) {
      // Extract from DB Title field
      // Format: "Show Name | Season04" or "S04E01 | Episode Title"
      // Support Season 0/00 (Special Seasons) - match 0+ digits to allow Season0, Season00, etc.
      const dbSeasonMatch = dbTitle.match(/Season\s*(\d+)/i);
      const dbEpisodeMatch = dbTitle.match(/S(\d+)E(\d+)/i);

      if (dbSeasonMatch) {
        seasonNumber = parseInt(dbSeasonMatch[1]);
        console.log(
          `Season number from DB Title '${dbTitle}': ${seasonNumber}${
            seasonNumber === 0 ? " (Special Season)" : ""
          }`
        );
      }

      if (dbEpisodeMatch) {
        seasonNumber = parseInt(dbEpisodeMatch[1]);
        episodeNumber = parseInt(dbEpisodeMatch[2]);
        console.log(
          `Episode info from DB Title '${dbTitle}': S${seasonNumber}E${episodeNumber}${
            seasonNumber === 0 ? " (Special Season)" : ""
          }`
        );
      }
    }

    // Fallback: Extract from path if not found in DB
    if (seasonNumber === null || episodeNumber === null) {
      // Support Season 0/00 (Special Seasons) - match 0+ digits to allow Season0, Season00, etc.
      const pathSeasonMatch = asset.path?.match(/Season(\d+)/i);
      const pathEpisodeMatch = asset.path?.match(/S(\d+)E(\d+)/i);

      if (pathSeasonMatch && seasonNumber === null) {
        seasonNumber = parseInt(pathSeasonMatch[1]);
      }

      if (pathEpisodeMatch) {
        if (seasonNumber === null) {
          seasonNumber = parseInt(pathEpisodeMatch[1]);
        }
        if (episodeNumber === null) {
          episodeNumber = parseInt(pathEpisodeMatch[2]);
        }
      }
    }

    // Extract provider IDs from folder name if present
    // Supports formats: {tmdb-123}, [tmdb-123], (tmdb-123), {tvdb-456}, [tvdb-456], {imdb-tt123}, etc.
    if (folderName) {
      // TMDB ID - match various bracket formats
      const tmdbMatch = folderName.match(/[\[{(]tmdb-(\d+)[\]})]/i);
      if (tmdbMatch) {
        tmdb_id = tmdbMatch[1];
        console.log(`Extracted TMDB ID from folder: ${tmdb_id}`);
      }

      // TVDB ID - match various bracket formats
      const tvdbMatch = folderName.match(/[\[{(]tvdb-(\d+)[\]})]/i);
      if (tvdbMatch) {
        tvdb_id = tvdbMatch[1];
        console.log(`Extracted TVDB ID from folder: ${tvdb_id}`);
      }

      // IMDB ID - match various bracket formats (format: tt1234567)
      const imdbMatch = folderName.match(/[\[{(]imdb-(tt\d+)[\]})]/i);
      if (imdbMatch) {
        imdb_id = imdbMatch[1];
        console.log(`Extracted IMDB ID from folder: ${imdb_id}`);
      }
    }

    // Fallback: Use provider IDs from database if not found in folder name
    // Database fields: tmdb_id, tvdb_id (from ImageChoices.db)
    if (!tmdb_id && asset._dbData?.tmdb_id) {
      tmdb_id = asset._dbData.tmdb_id;
      console.log(`Using TMDB ID from database: ${tmdb_id}`);
    }
    if (!tvdb_id && asset._dbData?.tvdb_id) {
      tvdb_id = asset._dbData.tvdb_id;
      console.log(`Using TVDB ID from database: ${tvdb_id}`);
    }

    const metadata = {
      tmdb_id: tmdb_id,
      tvdb_id: tvdb_id,
      imdb_id: imdb_id,
      title: title,
      year: year,
      folder_name: folderName,
      library_name: libraryName,
      media_type: mediaType,
      asset_type: assetType,
      season_number: seasonNumber,
      episode_number: episodeNumber,
    };

    console.log("=== Extracted Metadata ===");
    console.log("Title:", title);
    console.log("Year:", year);
    console.log("Folder Name:", folderName);
    console.log("Library Name:", libraryName);
    console.log("TMDB ID:", tmdb_id);
    console.log("TVDB ID:", tvdb_id);
    console.log("IMDB ID:", imdb_id);
    console.log("Media Type:", mediaType);
    console.log("Asset Type:", assetType);
    console.log("Season Number:", seasonNumber);
    console.log("Episode Number:", episodeNumber);
    console.log("==========================");

    return metadata;
  };

  // Determine if we should use horizontal layout (backgrounds and titlecards)
  // Use useMemo to recalculate metadata only when asset changes
  const metadata = React.useMemo(() => extractMetadata(), [asset]);
  const useHorizontalLayout =
    metadata.asset_type === "background" || metadata.asset_type === "titlecard";

  // Manual search state - initialize with detected metadata
  const [manualSearch, setManualSearch] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchYear, setSearchYear] = useState("");

  // Check if Posterizarr is running on component mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/status`);
        if (response.ok) {
          const data = await response.json();
          setIsPosterizarrRunning(data.running || false);

          if (data.running) {
            console.log(
              "Posterizarr is currently running, replacement operations will be blocked"
            );
          }
        }
      } catch (error) {
        console.error("Error checking Posterizarr status:", error);
      }
    };

    checkStatus();
    // Poll status every 3 seconds while component is mounted
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Update search fields when metadata changes (when switching assets)
  useEffect(() => {
    setSearchTitle(metadata.title || "");
    setSearchYear(metadata.year ? String(metadata.year) : "");
    // Reset previews when switching to a new asset
    setPreviews({ tmdb: [], tvdb: [], fanart: [] });
    setSelectedPreview(null);
  }, [metadata]);

  // Fetch language order preferences from config
  useEffect(() => {
    const fetchLanguageOrder = async () => {
      try {
        const response = await fetch(`${API_URL}/config`);
        if (response.ok) {
          const data = await response.json();

          console.log("Raw config response:", data);

          // Handle both flat and grouped config structures
          let configSource;
          if (data.using_flat_structure) {
            // Flat structure: config keys are directly in data.config
            configSource = data.config || {};
            console.log("Using flat config structure");
          } else {
            // Grouped structure: config keys are under ApiPart
            configSource = data.config?.ApiPart || data.ApiPart || {};
            console.log("Using grouped config structure");
          }

          // Process PreferredBackgroundLanguageOrder - handle "PleaseFillMe"
          let backgroundOrder =
            configSource.PreferredBackgroundLanguageOrder ||
            configSource.preferredbackgroundlanguageorder ||
            [];

          let posterOrder =
            configSource.PreferredLanguageOrder ||
            configSource.preferredlanguageorder ||
            [];

          let seasonOrder =
            configSource.PreferredSeasonLanguageOrder ||
            configSource.preferredseasonlanguageorder ||
            [];

          let tcOrder =
            configSource.PreferredTCLanguageOrder ||
            configSource.preferredtclanguageorder ||
            [];

          if (
            backgroundOrder.length === 1 &&
            backgroundOrder[0] === "PleaseFillMe"
          ) {
            // Use poster language order as fallback
            backgroundOrder = posterOrder;
          }

          if (tcOrder.length === 1 && tcOrder[0] === "PleaseFillMe") {
            // Use poster language order as fallback
            tcOrder = posterOrder;
          }

          setLanguageOrder({
            poster: posterOrder,
            background: backgroundOrder,
            season: seasonOrder,
            titlecard: tcOrder,
          });

          console.log("Loaded language preferences:", {
            poster: posterOrder,
            background: backgroundOrder,
            season: seasonOrder,
            titlecard: tcOrder,
            rawBackground: configSource.PreferredBackgroundLanguageOrder,
            rawTitleCard: configSource.PreferredTCLanguageOrder,
          });
        }
      } catch (error) {
        console.error("Error fetching language order config:", error);
      }
    };

    fetchLanguageOrder();
  }, []);

  // Initialize season number from metadata
  useEffect(() => {
    if (metadata.season_number) {
      // For season posters, just use the number (e.g., "17")
      // User can manually add "Season " prefix if they want it
      if (metadata.asset_type === "season") {
        const seasonNum = String(metadata.season_number).padStart(2, "0");
        setManualForm((prev) => ({
          ...prev,
          seasonPosterName: seasonNum,
        }));
        // Also set for manual search
        setManualSearchForm((prev) => ({
          ...prev,
          seasonNumber: String(metadata.season_number),
        }));
      } else if (metadata.asset_type === "titlecard") {
        // For titlecards, just the number
        const seasonNum = String(metadata.season_number).padStart(2, "0");
        setManualForm((prev) => ({
          ...prev,
          seasonPosterName: seasonNum,
        }));
        // Also set for manual search
        setManualSearchForm((prev) => ({
          ...prev,
          seasonNumber: String(metadata.season_number),
        }));
      }
    }
  }, [metadata.season_number, metadata.asset_type]);

  // Initialize episode data from metadata (for titlecards)
  useEffect(() => {
    if (metadata.episode_number) {
      const episodeNum = String(metadata.episode_number).padStart(2, "0");

      // Extract episode title from DB if available
      // Format: "S04E01 | Episode Title"
      let episodeTitleName = "";
      const dbTitle = asset._dbData?.Title || "";
      if (dbTitle && dbTitle.includes("|")) {
        const parts = dbTitle.split("|");
        if (parts.length >= 2) {
          episodeTitleName = parts[1].trim();
          console.log(`Episode title from DB: '${episodeTitleName}'`);
        }
      }

      setManualForm((prev) => ({
        ...prev,
        episodeNumber: episodeNum,
        episodeTitleName: episodeTitleName || prev.episodeTitleName,
      }));
      // Also set for manual search
      setManualSearchForm((prev) => ({
        ...prev,
        episodeNumber: String(metadata.episode_number),
      }));
    }
  }, [metadata.episode_number, asset._dbData]);

  // Initialize title text from metadata
  useEffect(() => {
    if (metadata.title) {
      setManualForm((prev) => ({
        ...prev,
        titletext: metadata.title,
        foldername: metadata.folder_name || "",
        libraryname: metadata.library_name || "",
      }));
    }
  }, [metadata.title, metadata.folder_name, metadata.library_name]);

  // Format display name with metadata
  const getDisplayName = () => {
    const parts = [];

    // Add title if available
    if (metadata.title) {
      parts.push(metadata.title);
    }

    // Add year if available
    if (metadata.year) {
      parts.push(`(${metadata.year})`);
    }

    // Add season/episode info
    if (metadata.season_number !== null && metadata.episode_number) {
      parts.push(
        `S${String(metadata.season_number).padStart(2, "0")}E${String(
          metadata.episode_number
        ).padStart(2, "0")}`
      );
    } else if (metadata.season_number !== null) {
      // Season 0 is "Specials"
      parts.push(
        metadata.season_number === 0
          ? "Specials"
          : `Season ${metadata.season_number}`
      );
    }

    // Add asset type
    const assetTypeLabel =
      {
        poster: "Poster",
        background: "Background",
        season:
          metadata.season_number === 0
            ? "Special Season Poster"
            : "Season Poster",
        titlecard: "Title Card",
      }[metadata.asset_type] || "Asset";

    if (parts.length > 0) {
      return `${parts.join(" ")} - ${assetTypeLabel}`;
    }

    // Fallback to filename
    return asset.name || "Unknown Asset";
  };

  const handleFetchClick = () => {
    console.log("=== AssetReplacer: Fetch Button Clicked ===");

    // Validation
    let metadata = extractMetadata();

    if (manualSearch) {
      console.log("Using manual search mode");
      if (!searchTitle.trim()) {
        console.warn("Manual search: No title provided");
        showError(t("assetReplacer.enterTitleError"));
        return;
      }

      console.log("Manual search params:", {
        searchTitle,
        searchYear,
        manualSearchForm,
      });

      metadata = {
        ...metadata,
        title: searchTitle.trim(),
        year: searchYear ? parseInt(searchYear) : null,
        // Keep IDs from folder name if they exist, otherwise null
        tmdb_id: metadata.tmdb_id || null,
        tvdb_id: metadata.tvdb_id || null,
        imdb_id: metadata.imdb_id || null,
        season_number: manualSearchForm.seasonNumber
          ? parseInt(manualSearchForm.seasonNumber)
          : metadata.season_number,
        episode_number: manualSearchForm.episodeNumber
          ? parseInt(manualSearchForm.episodeNumber)
          : metadata.episode_number,
      };

      console.log("Updated metadata with manual search:", metadata);
    }

    // Store params and show confirmation
    console.log("Storing fetch params and showing confirmation dialog");
    setPendingFetchParams({ metadata, manualSearch });
    setShowFetchConfirm(true);
  };

  const fetchPreviews = async () => {
    console.log("=== AssetReplacer: Fetching Previews ===");
    setShowFetchConfirm(false);

    if (!pendingFetchParams) {
      console.error("No pending fetch params found!");
      return;
    }

    const { metadata, manualSearch: isManualSearch } = pendingFetchParams;
    console.log("Fetch params:", { metadata, isManualSearch });

    setLoading(true);
    showError(null);

    try {
      // Debug logging
      console.log("Fetching previews with metadata:", {
        asset_path: asset.path,
        title: metadata.title,
        year: metadata.year,
        media_type: metadata.media_type,
        asset_type: metadata.asset_type,
        season_number: metadata.season_number,
        episode_number: metadata.episode_number,
        manual_search: isManualSearch,
      });

      const response = await fetch(`${API_URL}/assets/fetch-replacements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_path: asset.path,
          ...metadata,
        }),
      });

      console.log("API response status:", response.status);
      const data = await response.json();
      console.log("API response data:", data);

      if (data.success) {
        console.log("✓ Successfully received results from API:");
        console.log("  TMDB:", data.results.tmdb?.length || 0, "items");
        console.log("  TVDB:", data.results.tvdb?.length || 0, "items");
        console.log("  Fanart:", data.results.fanart?.length || 0, "items");
        console.log("  Asset type:", metadata.asset_type);
        console.log(
          "  Results are already sorted by backend using language preferences"
        );

        // Backend already sorted by language preference, use results directly
        const results = {
          tmdb: data.results.tmdb || [],
          tvdb: data.results.tvdb || [],
          fanart: data.results.fanart || [],
        };

        setPreviews(results);
        showSuccess(
          t("assetReplacer.foundReplacements", {
            count: data.total_count,
            sources: Object.keys(results).filter((k) => results[k].length > 0)
              .length,
          })
        );

        // Auto-switch to first provider with results
        if (results.tmdb.length > 0) {
          console.log("Auto-switching to TMDB tab (has results)");
          setActiveProviderTab("tmdb");
        } else if (results.tvdb.length > 0) {
          console.log("Auto-switching to TVDB tab (has results)");
          setActiveProviderTab("tvdb");
        } else if (results.fanart.length > 0) {
          console.log("Auto-switching to Fanart tab (has results)");
          setActiveProviderTab("fanart");
        }

        console.log("Switching to previews tab");
        setActiveTab("previews");
      } else {
        console.error("API returned error:", data.error || "Unknown error");
        showError(t("assetReplacer.fetchPreviewsError"));
      }
    } catch (err) {
      console.error("✗ Error fetching previews:", err);
      showError(
        t("assetReplacer.errorFetchingPreviews", { error: err.message })
      );
      console.error("Error fetching previews:", err);
    } finally {
      setLoading(false);
      console.log("=== Fetch Complete ===");
    }
  };

  const handleFileUpload = async (event) => {
    console.log("=== AssetReplacer: File Upload ===");
    const file = event.target.files[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log("File selected:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Validate file type
    if (!file.type.startsWith("image/")) {
      console.error("Invalid file type:", file.type);
      showError(t("assetReplacer.selectImageError"));
      return;
    }

    // Store the file for later upload
    setUploadedFile(file);
    console.log("File stored for upload");

    // Show preview of uploaded image and check ratio
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result);
      console.log("Image preview loaded");

      // Create an Image object to get dimensions
      const img = new Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        setImageDimensions({ width, height });
        console.log(`Image dimensions: ${width}x${height}`);

        // Define target ratios and tolerance
        const POSTER_RATIO = 2 / 3; // ~0.667
        const BACKGROUND_RATIO = 16 / 9; // ~1.778
        // Using 0.05 absolute tolerance (matches the 5% relative tolerance on 16:9, and is close for 2:3)
        const TOLERANCE = 0.05;

        // Check for zero height
        if (height === 0) {
          setIsDimensionValid(false);
          // You may need to add this new translation key
          showError(
            t("assetReplacer.imageHeightZero", "Image height cannot be zero.")
          );
          return;
        }

        const imageRatio = width / height;
        let isValid = false;
        let expectedRatio = 0;
        let expectedRatioString = "";

        // Determine required ratio based on asset type
        if (
          metadata.asset_type === "poster" ||
          metadata.asset_type === "season"
        ) {
          expectedRatio = POSTER_RATIO;
          expectedRatioString = "2:3";
          isValid = Math.abs(imageRatio - POSTER_RATIO) <= TOLERANCE;
          console.log(
            `Checking poster ratio: ${imageRatio.toFixed(
              3
            )} vs ${POSTER_RATIO.toFixed(
              3
            )}, tolerance: ${TOLERANCE}, valid: ${isValid}`
          );
        } else {
          // background or titlecard
          expectedRatio = BACKGROUND_RATIO;
          expectedRatioString = "16:9";
          isValid = Math.abs(imageRatio - BACKGROUND_RATIO) <= TOLERANCE;
          console.log(
            `Checking background/titlecard ratio: ${imageRatio.toFixed(
              3
            )} vs ${BACKGROUND_RATIO.toFixed(
              3
            )}, tolerance: ${TOLERANCE}, valid: ${isValid}`
          );
        }

        // Check if ratio is valid
        setIsDimensionValid(isValid);
        console.log(
          `Image dimension validation result: ${isValid ? "VALID" : "INVALID"}`
        );

        if (!isValid) {
          console.warn(
            `Image ratio mismatch! Got ${imageRatio.toFixed(
              3
            )}, expected ${expectedRatio.toFixed(3)} (${expectedRatioString})`
          );
          // You will need to add/update this translation key
          showError(
            t("assetReplacer.invalidImageRatio", {
              width,
              height,
              ratio: imageRatio.toFixed(3),
              expectedRatioString: expectedRatioString,
              expectedRatio: expectedRatio.toFixed(3),
            })
          );
        } else {
          // Re-use existing success message
          showSuccess(
            t("assetReplacer.imageDimensionsValid", { width, height })
          );
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleUploadClick = () => {
    console.log("=== AssetReplacer: Upload Click ===");
    console.log("File uploaded:", !!uploadedFile);
    console.log("Dimensions valid:", isDimensionValid);
    console.log("Posterizarr running:", isPosterizarrRunning);

    if (!uploadedFile || !isDimensionValid) {
      console.warn("Upload validation failed: no file or invalid dimensions");
      showError(t("assetReplacer.selectValidImage"));
      return;
    }

    // Check if Posterizarr is running
    if (isPosterizarrRunning) {
      console.warn("Upload blocked: Posterizarr is running");
      showError(t("assetReplacer.posterizarrRunningError"));
      return;
    }

    console.log("Showing upload confirmation dialog");
    // Show confirmation dialog
    setShowUploadConfirm(true);
  };

  const handleConfirmUpload = async () => {
    console.log("=== AssetReplacer: Confirmed Upload ===");
    console.log("Process with overlays:", processWithOverlays);
    console.log("Manual form:", manualForm);

    setShowUploadConfirm(false);
    setUploading(true);
    showError(null);

    try {
      // Build URL with process_with_overlays parameter
      let url = `${API_URL}/assets/upload-replacement?asset_path=${encodeURIComponent(
        asset.path
      )}&process_with_overlays=${processWithOverlays}`;

      // Add overlay processing parameters if checkbox is checked
      if (processWithOverlays) {
        const titleText = manualForm?.titletext || metadata.title;
        const folderName = manualForm?.foldername || metadata.folder_name;
        const libraryName = manualForm?.libraryname || metadata.library_name;

        // Validation
        if (!titleText || !titleText.trim()) {
          showError(t("assetReplacer.enterTitleTextError"));
          setUploading(false);
          return;
        }
        if (!folderName || !folderName.trim()) {
          showError(t("assetReplacer.enterFolderNameError"));
          setUploading(false);
          return;
        }
        if (!libraryName || !libraryName.trim()) {
          showError(t("assetReplacer.enterLibraryNameError"));
          setUploading(false);
          return;
        }

        // Add parameters to URL
        url += `&title_text=${encodeURIComponent(titleText)}`;
        url += `&folder_name=${encodeURIComponent(folderName)}`;
        url += `&library_name=${encodeURIComponent(libraryName)}`;

        // For season posters
        if (metadata.asset_type === "season") {
          const seasonPosterName = manualForm?.seasonPosterName;
          if (!seasonPosterName || !seasonPosterName.trim()) {
            showError(t("assetReplacer.enterSeasonNumberError"));
            setUploading(false);
            return;
          }
          url += `&season_number=${encodeURIComponent(seasonPosterName)}`;
        }

        // For titlecards
        if (metadata.asset_type === "titlecard") {
          const episodeNumber = manualForm?.episodeNumber;
          const episodeTitleName = manualForm?.episodeTitleName;

          if (!episodeNumber || !episodeNumber.trim()) {
            showError(t("assetReplacer.enterEpisodeNumberError"));
            setUploading(false);
            return;
          }
          if (!episodeTitleName || !episodeTitleName.trim()) {
            showError(t("assetReplacer.enterEpisodeTitleError"));
            setUploading(false);
            return;
          }

          url += `&episode_number=${encodeURIComponent(episodeNumber)}`;
          url += `&episode_title=${encodeURIComponent(episodeTitleName)}`;
        }
      }

      console.log("Upload URL:", url);

      const formData = new FormData();
      formData.append("file", uploadedFile);

      console.log("Sending upload request...");
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      console.log("Upload response status:", response.status);

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = `Server error: ${response.status}`;

        if (contentType && contentType.includes("application/json")) {
          try {
            const errorData = await response.json();
            console.error("Upload error (JSON):", errorData);
            errorMessage =
              errorData.detail || errorData.message || errorMessage;
          } catch (e) {
            console.error("Failed to parse JSON error:", e);
            // Failed to parse JSON error
          }
        } else {
          // Non-JSON response (possibly HTML error page)
          const text = await response.text();
          console.error("Non-JSON response:", text.substring(0, 500));
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("Upload response data:", data);

      if (data.success) {
        if (data.manual_run_triggered) {
          console.log("✓ Upload successful - Manual run triggered");
          showSuccess(t("assetReplacer.replacedAndQueued"));
          // Dispatch event to update badge counts
          window.dispatchEvent(new Event("assetReplaced"));

          // Call onSuccess to delete DB entry
          console.log(
            "Calling onSuccess callback to delete DB entry (upload path)"
          );
          if (onSuccess) {
            await onSuccess();
          }
          onClose();
        } else {
          showSuccess(t("assetReplacer.replacedSuccessfully"));
          // Dispatch event to update badge counts
          window.dispatchEvent(new Event("assetReplaced"));
          setTimeout(async () => {
            console.log(
              "Calling onSuccess callback to delete DB entry (upload no-queue path)"
            );
            if (onSuccess) {
              await onSuccess();
            }
            onClose();
          }, 2000);
        }
      } else {
        showError(t("assetReplacer.uploadError"));
      }
    } catch (err) {
      console.error("✗ Error uploading file:", err);
      showError(t("assetReplacer.errorUploadingFile", { error: err.message }));
      console.error("Error uploading file:", err);
    } finally {
      setUploading(false);
      console.log("=== Upload Complete ===");
    }
  };

  const handlePreviewClick = (preview) => {
    console.log("=== AssetReplacer: Preview Click ===");
    console.log("Preview:", preview);
    console.log("Posterizarr running:", isPosterizarrRunning);

    // Check if Posterizarr is running
    if (isPosterizarrRunning) {
      console.warn("Preview selection blocked: Posterizarr is running");
      showError(t("assetReplacer.posterizarrRunningError"));
      return;
    }

    console.log("Showing preview confirmation dialog");
    // Store the preview and show confirmation
    setPendingPreview(preview);
    setShowPreviewConfirm(true);
  };

  const handleSelectPreview = async () => {
    console.log("=== AssetReplacer: Confirmed Preview Selection ===");
    console.log("Process with overlays:", processWithOverlays);

    setShowPreviewConfirm(false);
    const preview = pendingPreview;

    if (!preview) {
      console.error("No pending preview found!");
      return;
    }

    console.log("Selected preview:", preview);

    setUploading(true);
    showError(null);

    // Validation for poster/background with overlays
    if (
      processWithOverlays &&
      (metadata.asset_type === "poster" || metadata.asset_type === "background")
    ) {
      const titleText = manualForm?.titletext || metadata.title;
      const folderName = manualForm?.foldername || metadata.folder_name;
      const libraryName = manualForm?.libraryname || metadata.library_name;

      if (!titleText || !titleText.trim()) {
        showError(t("assetReplacer.enterTitleTextError"));
        setUploading(false);
        return;
      }
      if (!folderName || !folderName.trim()) {
        showError(t("assetReplacer.enterFolderNameError"));
        setUploading(false);
        return;
      }
      if (!libraryName || !libraryName.trim()) {
        showError(t("assetReplacer.enterLibraryNameError"));
        setUploading(false);
        return;
      }
    }

    // Validation for season posters
    if (processWithOverlays && metadata.asset_type === "season") {
      const titleText = manualForm?.titletext || metadata.title;
      const folderName = manualForm?.foldername || metadata.folder_name;
      const libraryName = manualForm?.libraryname || metadata.library_name;
      const seasonPosterName = manualForm?.seasonPosterName;

      if (!titleText || !titleText.trim()) {
        showError(t("assetReplacer.enterTitleTextError"));
        setUploading(false);
        return;
      }
      if (!folderName || !folderName.trim()) {
        showError(t("assetReplacer.enterFolderNameError"));
        setUploading(false);
        return;
      }
      if (!libraryName || !libraryName.trim()) {
        showError(t("assetReplacer.enterLibraryNameError"));
        setUploading(false);
        return;
      }
      if (!seasonPosterName || !seasonPosterName.trim()) {
        showError(t("assetReplacer.enterSeasonPosterNameError"));
        setUploading(false);
        return;
      }
    }

    // Validation for title cards
    if (processWithOverlays && metadata.asset_type === "titlecard") {
      const folderName = manualForm?.foldername || metadata.folder_name;
      const libraryName = manualForm?.libraryname || metadata.library_name;
      const seasonPosterName = manualForm?.seasonPosterName;
      const episodeNumber = manualForm?.episodeNumber;
      const episodeTitleName = manualForm?.episodeTitleName;

      if (!folderName || !folderName.trim()) {
        showError(t("assetReplacer.enterFolderNameError"));
        setUploading(false);
        return;
      }
      if (!libraryName || !libraryName.trim()) {
        showError(t("assetReplacer.enterLibraryNameError"));
        setUploading(false);
        return;
      }
      if (!seasonPosterName || !seasonPosterName.trim()) {
        showError(t("assetReplacer.enterSeasonPosterNameError"));
        setUploading(false);
        return;
      }
      if (!episodeNumber || !episodeNumber.trim()) {
        showError(t("assetReplacer.enterEpisodeNumberError"));
        setUploading(false);
        return;
      }
      if (!episodeTitleName || !episodeTitleName.trim()) {
        showError(t("assetReplacer.enterEpisodeTitleError"));
        setUploading(false);
        return;
      }
    }

    try {
      // Build URL with parameters
      let url = `${API_URL}/assets/replace-from-url?asset_path=${encodeURIComponent(
        asset.path
      )}&image_url=${encodeURIComponent(
        preview.original_url
      )}&process_with_overlays=${processWithOverlays}`;

      // Add title text if provided (for poster/background/season)
      if (processWithOverlays && metadata.asset_type !== "titlecard") {
        const titleText = manualForm?.titletext || metadata.title;
        const folderName = manualForm?.foldername || metadata.folder_name;
        const libraryName = manualForm?.libraryname || metadata.library_name;

        if (titleText) {
          url += `&title_text=${encodeURIComponent(titleText)}`;
        }
        if (folderName) {
          url += `&folder_name=${encodeURIComponent(folderName)}`;
        }
        if (libraryName) {
          url += `&library_name=${encodeURIComponent(libraryName)}`;
        }
      }

      // Add season number if applicable (for season posters)
      if (processWithOverlays && metadata.asset_type === "season") {
        const seasonPosterName = manualForm?.seasonPosterName;
        if (seasonPosterName) {
          url += `&season_number=${encodeURIComponent(seasonPosterName)}`;
        }
      }

      // Add episode data for titlecards
      if (processWithOverlays && metadata.asset_type === "titlecard") {
        const folderName = manualForm?.foldername || metadata.folder_name;
        const libraryName = manualForm?.libraryname || metadata.library_name;
        const seasonPosterName = manualForm?.seasonPosterName;
        const episodeNumber = manualForm?.episodeNumber;
        const episodeTitleName = manualForm?.episodeTitleName;

        if (folderName) {
          url += `&folder_name=${encodeURIComponent(folderName)}`;
        }
        if (libraryName) {
          url += `&library_name=${encodeURIComponent(libraryName)}`;
        }
        if (seasonPosterName) {
          url += `&season_number=${encodeURIComponent(seasonPosterName)}`;
        }
        if (episodeNumber) {
          url += `&episode_number=${encodeURIComponent(episodeNumber)}`;
        }
        if (episodeTitleName) {
          url += `&episode_title=${encodeURIComponent(episodeTitleName)}`;
        }
      }

      const response = await fetch(url, {
        method: "POST",
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMessage = `Server error: ${response.status}`;

        if (contentType && contentType.includes("application/json")) {
          try {
            const errorData = await response.json();
            errorMessage =
              errorData.detail || errorData.message || errorMessage;
          } catch (e) {
            // Failed to parse JSON error
          }
        } else {
          // Non-JSON response (possibly HTML error page)
          const text = await response.text();
          console.error("Non-JSON response:", text.substring(0, 500));
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success) {
        if (data.manual_run_triggered) {
          showSuccess(t("assetReplacer.replacedAndQueued"));
          // Dispatch event to update badge counts
          window.dispatchEvent(new Event("assetReplaced"));

          // Call onSuccess to delete DB entry
          console.log(
            "Calling onSuccess callback to delete DB entry (preview path)"
          );
          if (onSuccess) {
            await onSuccess();
          }
          onClose();
        } else {
          showSuccess(t("assetReplacer.replacedSuccessfully"));
          // Dispatch event to update badge counts
          window.dispatchEvent(new Event("assetReplaced"));
          setTimeout(async () => {
            console.log(
              "Calling onSuccess callback to delete DB entry (preview no-queue path)"
            );
            if (onSuccess) {
              await onSuccess();
            }
            onClose();
          }, 2000);
        }
      } else {
        showError(t("assetReplacer.replaceError"));
      }
    } catch (err) {
      showError(t("assetReplacer.errorReplacingAsset", { error: err.message }));
      console.error("Error replacing asset:", err);
    } finally {
      setUploading(false);
    }
  };

  const getSourceColor = (source) => {
    switch (source.toLowerCase()) {
      case "tmdb":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "tvdb":
        return "bg-green-500/20 text-green-400 border-green-500/50";
      case "fanart.tv":
        return "bg-purple-500/20 text-purple-400 border-purple-500/50";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  const totalPreviews = Object.values(previews).flat().length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-theme-card rounded-none sm:rounded-xl border-0 sm:border border-theme max-w-6xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Posterizarr Running Warning */}
        {isPosterizarrRunning && (
          <div className="bg-orange-900/30 border-b-4 border-orange-500 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-orange-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-orange-200">
                  Posterizarr is Currently Running
                </p>
                <p className="text-sm text-orange-300/80">
                  Asset replacement is disabled while Posterizarr is processing.
                  Please wait until all operations are completed before using
                  the replace or manual update options.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="border-b border-theme p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-2xl font-bold text-theme-text flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-theme-primary/10">
                  <RefreshCw className="w-4 h-4 sm:w-6 sm:h-6 text-theme-primary" />
                </div>
                <span className="break-words">{t("assetReplacer.title")}</span>
              </h2>
              <p className="text-base sm:text-xl font-bold text-theme-text mt-2 sm:mt-3 break-words">
                {asset.path.split(/[\\/]/).slice(-2, -1)[0] || "Unknown"}
              </p>
              <p className="text-xs sm:text-sm text-theme-muted break-all mt-1">
                {asset.path}
              </p>
              <p className="text-xs sm:text-sm text-theme-muted mt-1">
                {metadata.asset_type === "poster" &&
                  metadata.media_type === "movie" &&
                  "Movie Poster"}
                {metadata.asset_type === "poster" &&
                  metadata.media_type === "tv" &&
                  "Show Poster"}
                {metadata.asset_type === "background" &&
                  metadata.media_type === "movie" &&
                  "Movie Background"}
                {metadata.asset_type === "background" &&
                  metadata.media_type === "tv" &&
                  "Show Background"}
                {metadata.asset_type === "season" && "Season Poster"}
                {metadata.asset_type === "titlecard" && "Episode Title Card"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 p-2 hover:bg-theme-hover rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-theme-muted" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-theme px-4 sm:px-6">
          <div className="flex gap-2 sm:gap-4 -mb-px overflow-x-auto">
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-3 sm:px-4 py-2 sm:py-3 font-medium transition-colors border-b-2 whitespace-nowrap text-sm sm:text-base ${
                activeTab === "upload"
                  ? "text-theme-primary border-theme-primary"
                  : "text-theme-muted border-transparent hover:text-theme-text"
              }`}
            >
              <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">
                {t("assetReplacer.uploadCustom")}
              </span>
              <span className="sm:hidden">Upload</span>
            </button>
            <button
              onClick={() => setActiveTab("previews")}
              className={`px-3 sm:px-4 py-2 sm:py-3 font-medium transition-colors border-b-2 whitespace-nowrap text-sm sm:text-base ${
                activeTab === "previews"
                  ? "text-theme-primary border-theme-primary"
                  : "text-theme-muted border-transparent hover:text-theme-text"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 inline mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">
                {t("assetReplacer.servicePreviews")}
              </span>
              <span className="sm:hidden">Previews</span>
              {totalPreviews > 0 && (
                <span className="ml-1.5 sm:ml-2 px-1.5 sm:px-2 py-0.5 bg-theme-primary/20 text-theme-primary rounded-full text-xs">
                  {totalPreviews}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "upload" && (
            <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
              {/* Process with Overlays Toggle */}
              {(metadata.asset_type === "poster" ||
                metadata.asset_type === "background" ||
                metadata.asset_type === "season" ||
                metadata.asset_type === "titlecard") && (
                <div className="bg-theme-hover border border-theme rounded-lg p-3 sm:p-4">
                  <div className="flex items-start sm:items-center justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs sm:text-sm font-medium text-theme-text break-words">
                        Process with overlays after replace
                      </h4>
                      <p className="text-xs text-theme-muted mt-0.5 leading-relaxed">
                        {processWithOverlays
                          ? "Applies borders, overlays & text to the replaced asset based on overlay settings. Asset will be saved to assets/ folder."
                          : "Direct replacement without overlay processing. Asset will be saved to manualassets/ folder for manual use."}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setProcessWithOverlays(!processWithOverlays)
                      }
                      className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-theme-bg ${
                        processWithOverlays ? "bg-theme-primary" : "bg-gray-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          processWithOverlays
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Parameter Inputs - Shown when overlay processing is enabled */}
                  {processWithOverlays && (
                    <div className="mt-4 pt-4 border-t border-theme space-y-3">
                      <div className="text-center mb-3">
                        <p className="text-xs font-medium text-theme-text">
                          📝 Manual Run Parameters
                        </p>
                      </div>

                      {/* Title Text - For all types except titlecard */}
                      {metadata.asset_type !== "titlecard" && (
                        <div>
                          <label className="block text-xs font-medium text-theme-text mb-1">
                            Title Text *
                          </label>
                          <input
                            type="text"
                            value={manualForm?.titletext || ""}
                            onChange={(e) =>
                              setManualForm({
                                ...manualForm,
                                titletext: e.target.value,
                              })
                            }
                            placeholder="e.g., A Shaun the Sheep Movie"
                            className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                          />
                        </div>
                      )}

                      {/* Folder Name */}
                      {metadata.asset_type !== "collection" && (
                        <div>
                          <label className="block text-xs font-medium text-theme-text mb-1">
                            Folder Name *
                          </label>
                          <input
                            type="text"
                            value={manualForm?.foldername || ""}
                            onChange={(e) =>
                              setManualForm({
                                ...manualForm,
                                foldername: e.target.value,
                              })
                            }
                            placeholder="e.g., Movie Name (2019) {tmdb-123}"
                            className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                          />
                        </div>
                      )}

                      {/* Library Name */}
                      <div>
                        <label className="block text-xs font-medium text-theme-text mb-1">
                          Library Name *
                        </label>
                        <input
                          type="text"
                          value={manualForm?.libraryname || ""}
                          onChange={(e) =>
                            setManualForm({
                              ...manualForm,
                              libraryname: e.target.value,
                            })
                          }
                          placeholder="e.g., 4K"
                          className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                        />
                      </div>

                      {/* Season Number - For season posters */}
                      {metadata.asset_type === "season" && (
                        <div>
                          <label className="block text-xs font-medium text-theme-text mb-1">
                            Season Poster Name *
                          </label>
                          <input
                            type="text"
                            value={manualForm.seasonPosterName}
                            onChange={(e) =>
                              setManualForm({
                                ...manualForm,
                                seasonPosterName: e.target.value,
                              })
                            }
                            placeholder="Season 01 or Season 00 (Specials) or 'Title | Season 01' (to apply Title Text)"
                            className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                          />
                        </div>
                      )}

                      {/* TitleCard-specific fields */}
                      {metadata.asset_type === "titlecard" && (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-theme-text mb-1">
                              Episode Title *
                            </label>
                            <input
                              type="text"
                              value={manualForm.episodeTitleName}
                              onChange={(e) =>
                                setManualForm({
                                  ...manualForm,
                                  episodeTitleName: e.target.value,
                                })
                              }
                              placeholder="e.g., Pilot"
                              className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-theme-text mb-1">
                              Season Number * (0 = Specials)
                            </label>
                            <input
                              type="text"
                              value={manualForm.seasonPosterName}
                              onChange={(e) =>
                                setManualForm({
                                  ...manualForm,
                                  seasonPosterName: e.target.value,
                                })
                              }
                              placeholder="e.g., 01 or 00 (Specials)"
                              className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-theme-text mb-1">
                              Episode Number *
                            </label>
                            <input
                              type="text"
                              value={manualForm.episodeNumber}
                              onChange={(e) =>
                                setManualForm({
                                  ...manualForm,
                                  episodeNumber: e.target.value,
                                })
                              }
                              placeholder="e.g., 01"
                              className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Manual Search Toggle */}
              <div className="bg-theme-hover border border-theme rounded-lg p-3 sm:p-4">
                <div className="flex items-start sm:items-center justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs sm:text-sm font-medium text-theme-text break-words">
                      {t("assetReplacer.manualSearchByTitle")}
                    </h4>
                    <p className="text-xs text-theme-muted mt-0.5 leading-relaxed">
                      Search for assets instead of using detected metadata
                    </p>
                  </div>
                  <button
                    onClick={() => setManualSearch(!manualSearch)}
                    className={`flex-shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-theme-bg ${
                      manualSearch ? "bg-theme-primary" : "bg-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        manualSearch ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Manual Search Fields */}
                {manualSearch && (
                  <div className="mt-4 pt-4 border-t border-theme space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-theme-text mb-1">
                        Title *
                      </label>
                      <input
                        type="text"
                        value={searchTitle}
                        onChange={(e) => setSearchTitle(e.target.value)}
                        placeholder="Enter movie/show title..."
                        className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-theme-text mb-1">
                        Year (optional)
                      </label>
                      <input
                        type="number"
                        value={searchYear}
                        onChange={(e) => setSearchYear(e.target.value)}
                        placeholder="2024"
                        min="1900"
                        max="2100"
                        className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                      />
                    </div>

                    {/* Season/Episode fields for TV content */}
                    {(metadata.asset_type === "season" ||
                      metadata.asset_type === "titlecard") && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-theme-text mb-1">
                            Season Number * (0 = Specials)
                          </label>
                          <input
                            type="number"
                            value={manualSearchForm.seasonNumber}
                            onChange={(e) =>
                              setManualSearchForm({
                                ...manualSearchForm,
                                seasonNumber: e.target.value,
                              })
                            }
                            placeholder="1 (or 0 for Specials)"
                            min="0"
                            className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                          />
                        </div>

                        {metadata.asset_type === "titlecard" && (
                          <div>
                            <label className="block text-xs font-medium text-theme-text mb-1">
                              Episode Number *
                            </label>
                            <input
                              type="number"
                              value={manualSearchForm.episodeNumber}
                              onChange={(e) =>
                                setManualSearchForm({
                                  ...manualSearchForm,
                                  episodeNumber: e.target.value,
                                })
                              }
                              placeholder="1"
                              min="0"
                              className="w-full px-2 py-1.5 text-sm bg-theme-bg border border-theme rounded text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* Fetch Button inside Manual Search */}
                    <div className="pt-3 border-t border-theme">
                      <button
                        onClick={handleFetchClick}
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm"
                      >
                        <Download className="w-4 h-4 text-theme-primary" />
                        {loading
                          ? t("common.loading")
                          : t("assetReplacer.fetchFromServices")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Section */}
              <div className="bg-theme-card border border-theme rounded-lg p-4 sm:p-6">
                {/* Recommended Size Info */}
                <div className="mb-4 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-xs text-blue-400 flex items-center gap-2">
                    <span className="font-semibold">ℹ️ Recommended sizes:</span>
                    {metadata.asset_type === "poster" ||
                    metadata.asset_type === "season" ? (
                      <span>Posters: 1000×1500px or higher (2:3 ratio)</span>
                    ) : (
                      <span>
                        Backgrounds/Title Cards: 1920×1080px or higher (16:9
                        ratio)
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                  {/* Upload Area */}
                  <div className="flex-1 w-full">
                    <h3 className="text-base sm:text-lg font-semibold text-theme-text mb-3">
                      {t("assetReplacer.uploadYourOwnImage")}
                    </h3>
                    <label className="block border-2 border-dashed border-theme rounded-lg p-4 sm:p-6 text-center cursor-pointer hover:border-theme-primary transition-colors">
                      <Upload className="w-8 h-8 sm:w-10 sm:h-10 text-theme-muted mx-auto mb-2" />
                      <p className="text-xs sm:text-sm text-theme-muted mb-2 sm:mb-3">
                        {t("assetReplacer.selectCustomImage")}
                      </p>
                      <span className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text rounded-lg transition-all text-xs sm:text-sm shadow-sm">
                        <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-theme-primary" />
                        {uploading
                          ? t("assetReplacer.uploading")
                          : t("assetReplacer.chooseFile")}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>

                  {/* Preview of Uploaded Image */}
                  {uploadedImage && (
                    <div className="w-full sm:w-48 flex-shrink-0">
                      <p className="text-xs font-medium text-theme-text mb-2">
                        Preview:
                      </p>
                      <div
                        className={`relative bg-theme rounded-lg overflow-hidden border border-theme mx-auto ${
                          useHorizontalLayout
                            ? "aspect-[16/9] max-w-xs"
                            : "aspect-[2/3] max-w-[12rem]"
                        }`}
                      >
                        <img
                          src={uploadedImage}
                          alt="Upload preview"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Dimension Info */}
                      {imageDimensions && (
                        <div
                          className={`mt-2 text-xs text-center p-2 rounded ${
                            isDimensionValid
                              ? "bg-green-500/10 text-green-400 border border-green-500/30"
                              : "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}
                        >
                          {imageDimensions.width}x{imageDimensions.height}px
                          {isDimensionValid ? " ✓" : " ✗"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Upload Asset Button */}
                {uploadedImage && (
                  <div className="mt-4">
                    <button
                      onClick={handleUploadClick}
                      disabled={
                        !isDimensionValid || uploading || isPosterizarrRunning
                      }
                      className={`w-full px-4 py-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                        isDimensionValid && !uploading && !isPosterizarrRunning
                          ? "bg-theme-primary hover:bg-theme-primary/90 text-white cursor-pointer shadow-lg hover:shadow-xl"
                          : "bg-gray-500/20 text-gray-500 cursor-not-allowed border border-gray-500/30"
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      {uploading
                        ? t("assetReplacer.uploadingAsset")
                        : isPosterizarrRunning
                        ? "Upload Disabled (Running)"
                        : t("assetReplacer.uploadAssetButton")}
                    </button>
                    {!isDimensionValid && !isPosterizarrRunning && (
                      <p className="mt-2 text-xs text-red-400 text-center">
                        {t("assetReplacer.dimensionRequirement")}
                      </p>
                    )}
                    {isPosterizarrRunning && (
                      <p className="mt-2 text-xs text-orange-400 text-center">
                        Asset replacement is disabled while Posterizarr is
                        running
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-theme"></div>
                </div>
                <div className="relative flex justify-center text-xs sm:text-sm">
                  <span className="px-3 sm:px-4 bg-theme-bg text-theme-muted">
                    {manualSearch
                      ? t("assetReplacer.searchForAssets")
                      : t("assetReplacer.orFetchFromServices")}
                  </span>
                </div>
              </div>

              {/* Fetch Previews Button */}
              <div className="text-center">
                <button
                  onClick={handleFetchClick}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-sm sm:text-base w-full sm:w-auto"
                >
                  <Download className="w-4 h-4 sm:w-5 sm:h-5 text-theme-primary" />
                  {loading
                    ? t("common.loading")
                    : t("assetReplacer.fetchFromServices")}
                </button>
              </div>
            </div>
          )}

          {activeTab === "previews" && (
            <div>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-12 h-12 animate-spin text-theme-primary mb-4" />
                  <p className="text-theme-muted">
                    {t("assetReplacer.fetchingPreviews")}
                  </p>
                </div>
              ) : totalPreviews === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-16 h-16 text-theme-muted mx-auto mb-4" />
                  <p className="text-theme-muted mb-4">
                    {t("assetReplacer.noPreviewsLoaded")}
                  </p>
                  <button
                    onClick={handleFetchClick}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text rounded-lg transition-all shadow-sm"
                  >
                    <Download className="w-5 h-5 text-theme-primary" />
                    {t("assetReplacer.fetchPreviews")}
                  </button>
                </div>
              ) : (
                <div>
                  {/* Provider Tabs */}
                  <div className="border-b border-theme mb-6">
                    <div className="flex gap-2">
                      {/* TMDB Tab */}
                      <button
                        onClick={() => setActiveProviderTab("tmdb")}
                        className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                          activeProviderTab === "tmdb"
                            ? "text-blue-400 border-blue-400 bg-blue-500/10"
                            : "text-theme-muted border-transparent hover:text-theme-text hover:bg-theme-hover"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          TMDB
                          {previews.tmdb.length > 0 && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                activeProviderTab === "tmdb"
                                  ? "bg-blue-500/30 text-blue-300"
                                  : "bg-theme-primary/20 text-theme-primary"
                              }`}
                            >
                              {previews.tmdb.length}
                            </span>
                          )}
                        </span>
                      </button>

                      {/* TVDB Tab */}
                      <button
                        onClick={() => setActiveProviderTab("tvdb")}
                        className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                          activeProviderTab === "tvdb"
                            ? "text-green-400 border-green-400 bg-green-500/10"
                            : "text-theme-muted border-transparent hover:text-theme-text hover:bg-theme-hover"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          TVDB
                          {previews.tvdb.length > 0 && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                activeProviderTab === "tvdb"
                                  ? "bg-green-500/30 text-green-300"
                                  : "bg-theme-primary/20 text-theme-primary"
                              }`}
                            >
                              {previews.tvdb.length}
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Fanart.tv Tab */}
                      <button
                        onClick={() => setActiveProviderTab("fanart")}
                        className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                          activeProviderTab === "fanart"
                            ? "text-purple-400 border-purple-400 bg-purple-500/10"
                            : "text-theme-muted border-transparent hover:text-theme-text hover:bg-theme-hover"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          Fanart.tv
                          {previews.fanart.length > 0 && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                activeProviderTab === "fanart"
                                  ? "bg-purple-500/30 text-purple-300"
                                  : "bg-theme-primary/20 text-theme-primary"
                              }`}
                            >
                              {previews.fanart.length}
                            </span>
                          )}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Provider Content */}
                  <div>
                    {/* TMDB Content */}
                    {activeProviderTab === "tmdb" && (
                      <div>
                        {previews.tmdb.length > 0 ? (
                          <div
                            className={
                              useHorizontalLayout
                                ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                                : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                            }
                          >
                            {previews.tmdb.map((preview, index) => (
                              <PreviewCard
                                key={`tmdb-${index}`}
                                preview={preview}
                                onSelect={() => handlePreviewClick(preview)}
                                disabled={uploading || isPosterizarrRunning}
                                isHorizontal={useHorizontalLayout}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <ImageIcon className="w-12 h-12 text-theme-muted mx-auto mb-3" />
                            <p className="text-theme-muted">
                              No TMDB results found
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TVDB Content */}
                    {activeProviderTab === "tvdb" && (
                      <div>
                        {previews.tvdb.length > 0 ? (
                          <div
                            className={
                              useHorizontalLayout
                                ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                                : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                            }
                          >
                            {previews.tvdb.map((preview, index) => (
                              <PreviewCard
                                key={`tvdb-${index}`}
                                preview={preview}
                                onSelect={() => handlePreviewClick(preview)}
                                disabled={uploading || isPosterizarrRunning}
                                isHorizontal={useHorizontalLayout}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <ImageIcon className="w-12 h-12 text-theme-muted mx-auto mb-3" />
                            <p className="text-theme-muted">
                              No TVDB results found
                            </p>
                            <p className="text-xs text-theme-muted mt-2">
                              TVDB is mainly for TV shows
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fanart.tv Content */}
                    {activeProviderTab === "fanart" && (
                      <div>
                        {previews.fanart.length > 0 ? (
                          <div
                            className={
                              useHorizontalLayout
                                ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                                : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                            }
                          >
                            {previews.fanart.map((preview, index) => (
                              <PreviewCard
                                key={`fanart-${index}`}
                                preview={preview}
                                onSelect={() => handlePreviewClick(preview)}
                                disabled={uploading || isPosterizarrRunning}
                                isHorizontal={useHorizontalLayout}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <ImageIcon className="w-12 h-12 text-theme-muted mx-auto mb-3" />
                            <p className="text-theme-muted">
                              No Fanart.tv results found
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showUploadConfirm}
        onClose={() => setShowUploadConfirm(false)}
        onConfirm={handleConfirmUpload}
        title={t("assetReplacer.confirmReplaceTitle")}
        message={
          <>
            {t("assetReplacer.confirmReplaceMessage")}
            {!processWithOverlays && (
              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300 leading-relaxed">
                  <strong>ℹ️ Note:</strong> If you do not check "Process with
                  overlays after replace", the asset will be placed in the
                  manualassets directory and the poster will be recreated by
                  Posterizarr during the next normal/scheduled run.
                </p>
              </div>
            )}
          </>
        }
        confirmText={t("assetReplacer.confirmReplaceButton")}
        type="warning"
      />

      {/* Preview Selection Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showPreviewConfirm}
        onClose={() => {
          setShowPreviewConfirm(false);
          setPendingPreview(null);
        }}
        onConfirm={handleSelectPreview}
        title={t("assetReplacer.confirmReplaceTitle")}
        message={
          <>
            {t("assetReplacer.confirmReplaceMessage")}
            {!processWithOverlays && (
              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300 leading-relaxed">
                  <strong>ℹ️ Note:</strong> If you do not check "Process with
                  overlays after replace", the asset will be placed in the
                  manualassets directory and the poster will be recreated by
                  Posterizarr during the next normal/scheduled run.
                </p>
              </div>
            )}
          </>
        }
        confirmText={t("assetReplacer.confirmReplaceButton")}
        type="warning"
      />

      {/* Fetch Previews Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showFetchConfirm}
        onClose={() => {
          setShowFetchConfirm(false);
          setPendingFetchParams(null);
        }}
        onConfirm={fetchPreviews}
        title={t("assetReplacer.confirmFetchTitle")}
        message={t("assetReplacer.confirmFetchMessage")}
        confirmText={t("assetReplacer.confirmFetchButton")}
        type="info"
      />
    </div>
  );
}

function PreviewCard({ preview, onSelect, disabled, isHorizontal = false }) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleDownload = async (e) => {
    e.stopPropagation(); // Prevent card selection when clicking download
    try {
      const response = await fetch(preview.original_url || preview.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Create filename from source and metadata
      const source = preview.source?.toLowerCase() || "image";
      const lang = preview.language || "";
      const timestamp = Date.now();
      const extension =
        preview.original_url?.split(".").pop()?.split("?")[0] || "jpg";
      a.download = `${source}_${lang}_${timestamp}.${extension}`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  return (
    <div
      className="group relative bg-theme-hover rounded-lg overflow-hidden border border-theme hover:border-theme-primary transition-all cursor-pointer"
      onClick={disabled ? undefined : onSelect}
    >
      <div
        className={`relative bg-theme ${
          isHorizontal ? "aspect-[16/9]" : "aspect-[2/3]"
        }`}
      >
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-theme-muted" />
          </div>
        )}
        {imageError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-theme-muted" />
          </div>
        ) : (
          <img
            src={preview.url}
            alt="Preview"
            className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-300 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}

        {/* Hover overlay with metadata */}
        <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center">
          {/* Download Button - Top Right */}
          <button
            onClick={handleDownload}
            className="absolute top-2 right-2 px-3 py-2 bg-theme-primary hover:bg-theme-primary/80 rounded-lg transition-all shadow-lg z-10 flex items-center gap-2"
            title={t("assetReplacer.download") || "Download"}
          >
            <Download className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-medium">
              {t("assetReplacer.download")}
            </span>
          </button>

          {/* Select Button */}
          <Check className="w-10 h-10 text-green-400 mb-3" />

          {/* Source Badge */}
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold mb-2 ${
              preview.source === "TMDB"
                ? "bg-blue-500 text-white"
                : preview.source === "TVDB"
                ? "bg-green-500 text-white"
                : preview.source === "Fanart.tv"
                ? "bg-purple-500 text-white"
                : "bg-gray-500 text-white"
            }`}
          >
            {preview.source}
          </div>

          {/* Metadata Badges */}
          <div className="flex flex-wrap gap-1.5 justify-center mt-2">
            {/* Dimensions */}
            {(preview.width || preview.height) && (
              <span className="bg-slate-600 px-2 py-1 rounded text-xs text-white font-medium">
                {preview.width} × {preview.height}
              </span>
            )}
            {/* Language */}
            {preview.language && (
              <span className="bg-theme-primary px-2 py-1 rounded text-xs text-white font-medium">
                {preview.language.toUpperCase()}
              </span>
            )}

            {/* Vote Average (TMDB/TVDB) */}
            {preview.vote_average !== undefined && preview.vote_average > 0 && (
              <span className="bg-yellow-500 px-2 py-1 rounded text-xs text-white font-medium flex items-center gap-1">
                <Star className="w-3 h-3" />
                {preview.vote_average.toFixed(1)}
              </span>
            )}

            {/* Likes (Fanart.tv) */}
            {preview.likes !== undefined && preview.likes > 0 && (
              <span className="bg-red-500 px-2 py-1 rounded text-xs text-white font-medium">
                ❤️ {preview.likes}
              </span>
            )}

            {/* Asset Type */}
            {preview.type && (
              <span className="bg-gray-600 px-2 py-1 rounded text-xs text-white font-medium">
                {preview.type === "episode_still"
                  ? "Episode"
                  : preview.type === "season_poster"
                  ? "Season"
                  : preview.type === "backdrop"
                  ? "Backdrop"
                  : preview.type === "poster"
                  ? "Poster"
                  : preview.type}
              </span>
            )}
          </div>

          {/* Select Text */}
          <p className="text-white text-sm font-semibold mt-3 flex items-center gap-2">
            <Check className="w-4 h-4" />
            {disabled
              ? t("assetReplacer.uploading")
              : t("assetReplacer.select")}
          </p>
        </div>
      </div>
    </div>
  );
}

export default AssetReplacer;
