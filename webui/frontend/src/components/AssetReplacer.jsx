import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Upload,
  RefreshCw,
  Download,
  Check,
  Star,
  Image as ImageIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";

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
        console.log(
          `✅ Log file ${logFileName} exists after ${i + 1} attempts`
        );
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
    `⚠️ Log file ${logFileName} not found after ${maxAttempts} attempts`
  );
  return false;
};

function AssetReplacer({ asset, onClose, onSuccess }) {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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
  const [activeProviderTab, setActiveProviderTab] = useState("tmdb"); // Provider tabs: tmdb, tvdb, fanart

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
    // Extract metadata from path - NO ID extraction, just path information
    // We'll let users search manually by title + year
    let title = null;
    let year = null;
    let folderName = null;
    let libraryName = null;

    // Extract library name (parent folder: "4K", "TV", etc.)
    const pathSegments = asset.path?.split(/[\/\\]/).filter(Boolean);
    if (pathSegments && pathSegments.length > 0) {
      // Find library name - usually the top-level folder like "4K" or "TV"
      for (let i = 0; i < pathSegments.length; i++) {
        // Common library folder names
        if (pathSegments[i].match(/^(4K|TV|Movies|Series|anime)$/i)) {
          libraryName = pathSegments[i];
          break;
        }
      }
      // If not found, use the first segment as library name
      if (!libraryName && pathSegments.length > 0) {
        libraryName = pathSegments[0];
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

    // For seasons and titlecards, extract title from parent folder (show name)
    if (assetType === "season" || assetType === "titlecard") {
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

          // Extract title and year - remove ALL tags {xxx-yyy}
          // Pattern: "Show Name (2020) {tmdb-123}" or "Show Name (2020) {imdb-tt123}{tvdb-456}"
          const cleanFolder = showFolder.replace(/\s*\{[^}]+\}/g, "").trim();

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

            // Clean the folder name from ALL tags
            const cleanSegment = segment.replace(/\s*\{[^}]+\}/g, "").trim();

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

            // Remove year and ALL ID tags, and file extension
            const cleanTitle = folderSegment
              .replace(/\s*\(\d{4}\)\s*/, "")
              .replace(/\s*\{[^}]+\}/g, "")
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
    const hasSeason = asset.path?.match(/Season\d+/i);
    const hasEpisode = asset.path?.match(/S\d+E\d+/i);
    const hasTVFolder = asset.path?.match(/[\/\\](TV|Series)[\/\\]/i);
    const isTV = hasSeason || hasEpisode || hasTVFolder || asset.type === "tv";
    const mediaType = isTV ? "tv" : "movie";

    // Extract season/episode numbers
    const seasonMatch = asset.path?.match(/Season(\d+)/);
    const episodeMatch = asset.path?.match(/S(\d+)E(\d+)/);

    return {
      // NO ID extraction - users will search manually
      tmdb_id: null,
      tvdb_id: null,
      title: title,
      year: year,
      folder_name: folderName,
      library_name: libraryName,
      media_type: mediaType,
      asset_type: assetType,
      season_number: seasonMatch
        ? parseInt(seasonMatch[1])
        : episodeMatch
        ? parseInt(episodeMatch[1])
        : null,
      episode_number: episodeMatch ? parseInt(episodeMatch[2]) : null,
    };
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

          console.log("🔍 Raw config response:", data);

          // Handle both flat and grouped config structures
          let configSource;
          if (data.using_flat_structure) {
            // Flat structure: config keys are directly in data.config
            configSource = data.config || {};
            console.log("📦 Using flat config structure");
          } else {
            // Grouped structure: config keys are under ApiPart
            configSource = data.config?.ApiPart || data.ApiPart || {};
            console.log("📦 Using grouped config structure");
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

          if (
            backgroundOrder.length === 1 &&
            backgroundOrder[0] === "PleaseFillMe"
          ) {
            // Use poster language order as fallback
            backgroundOrder = posterOrder;
          }

          setLanguageOrder({
            poster: posterOrder,
            background: backgroundOrder,
            season: seasonOrder,
          });

          console.log("📋 Loaded language preferences:", {
            poster: posterOrder,
            background: backgroundOrder,
            season: seasonOrder,
            rawBackground: configSource.PreferredBackgroundLanguageOrder,
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
      // For season posters, format as "Season XX"
      if (metadata.asset_type === "season") {
        const seasonNum = String(metadata.season_number).padStart(2, "0");
        setManualForm((prev) => ({
          ...prev,
          seasonPosterName: `Season ${seasonNum}`,
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
      setManualForm((prev) => ({
        ...prev,
        episodeNumber: episodeNum,
      }));
      // Also set for manual search
      setManualSearchForm((prev) => ({
        ...prev,
        episodeNumber: String(metadata.episode_number),
      }));
    }
  }, [metadata.episode_number]);

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
    if (metadata.season_number && metadata.episode_number) {
      parts.push(
        `S${String(metadata.season_number).padStart(2, "0")}E${String(
          metadata.episode_number
        ).padStart(2, "0")}`
      );
    } else if (metadata.season_number) {
      parts.push(`Season ${metadata.season_number}`);
    }

    // Add asset type
    const assetTypeLabel =
      {
        poster: "Poster",
        background: "Background",
        season: "Season Poster",
        titlecard: "Title Card",
      }[metadata.asset_type] || "Asset";

    if (parts.length > 0) {
      return `${parts.join(" ")} - ${assetTypeLabel}`;
    }

    // Fallback to filename
    return asset.name || "Unknown Asset";
  };

  // Sort previews by preferred language order
  const sortByLanguagePreference = (previews, assetType) => {
    // Determine which language order to use
    let preferredOrder = [];
    if (assetType === "background" || assetType === "titlecard") {
      preferredOrder = languageOrder.background;
    } else if (assetType === "season") {
      preferredOrder = languageOrder.season;
    } else {
      // poster or default
      preferredOrder = languageOrder.poster;
    }

    // If no language order configured, return as-is
    if (!preferredOrder || preferredOrder.length === 0) {
      console.log(
        `⚠️ No language order configured for ${assetType}, returning unsorted`
      );
      return previews;
    }

    // Normalize preferred order to lowercase for case-insensitive comparison
    const normalizedOrder = preferredOrder.map((lang) => lang.toLowerCase());

    console.log(
      `🔤 Sorting ${assetType} (${previews.length} items) by language order:`,
      preferredOrder
    );

    const sorted = [...previews].sort((a, b) => {
      // Normalize languages to lowercase, handle null/undefined
      const langA = (a.language || "null").toLowerCase();
      const langB = (b.language || "null").toLowerCase();

      // Get priority indices (lower = higher priority)
      const priorityA = normalizedOrder.indexOf(langA);
      const priorityB = normalizedOrder.indexOf(langB);

      console.log(
        `  Comparing: ${a.language} (${langA}, priority: ${priorityA}) vs ${b.language} (${langB}, priority: ${priorityB})`
      );

      // If both languages are in the preferred order, sort by their position
      if (priorityA !== -1 && priorityB !== -1) {
        return priorityA - priorityB;
      }

      // If only A is in preferred order, it comes first
      if (priorityA !== -1) return -1;

      // If only B is in preferred order, it comes first
      if (priorityB !== -1) return 1;

      // For languages not in the preferred order, maintain original order
      // But prioritize by vote_average if available
      if (a.vote_average !== undefined && b.vote_average !== undefined) {
        return b.vote_average - a.vote_average;
      }

      // Otherwise by likes (for Fanart)
      if (a.likes !== undefined && b.likes !== undefined) {
        return b.likes - a.likes;
      }

      return 0;
    });

    console.log(
      `✅ Sorted result - first 5 languages:`,
      sorted.slice(0, 5).map((p) => p.language)
    );

    return sorted;
  };

  const fetchPreviews = async () => {
    setLoading(true);
    showError(null);

    try {
      let metadata = extractMetadata();

      // Override with manual search if enabled
      if (manualSearch) {
        if (!searchTitle.trim()) {
          showError(t("assetReplacer.enterTitleError"));
          setLoading(false);
          return;
        }

        metadata = {
          ...metadata,
          title: searchTitle.trim(),
          year: searchYear ? parseInt(searchYear) : null,
          tmdb_id: null,
          tvdb_id: null,
        };
      }

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

      const data = await response.json();

      if (data.success) {
        console.log("📥 Received results from API:");
        console.log("  TMDB:", data.results.tmdb?.length || 0, "items");
        console.log("  TVDB:", data.results.tvdb?.length || 0, "items");
        console.log("  Fanart:", data.results.fanart?.length || 0, "items");
        console.log("  Asset type:", metadata.asset_type);
        console.log("  Current language order:", languageOrder);

        // Sort each source's results by language preference
        const sortedResults = {
          tmdb: sortByLanguagePreference(
            data.results.tmdb || [],
            metadata.asset_type
          ),
          tvdb: sortByLanguagePreference(
            data.results.tvdb || [],
            metadata.asset_type
          ),
          fanart: sortByLanguagePreference(
            data.results.fanart || [],
            metadata.asset_type
          ),
        };

        setPreviews(sortedResults);
        showSuccess(
          t("assetReplacer.foundReplacements", {
            count: data.total_count,
            sources: Object.keys(sortedResults).filter(
              (k) => sortedResults[k].length > 0
            ).length,
          })
        );

        // Auto-switch to first provider with results
        if (sortedResults.tmdb.length > 0) {
          setActiveProviderTab("tmdb");
        } else if (sortedResults.tvdb.length > 0) {
          setActiveProviderTab("tvdb");
        } else if (sortedResults.fanart.length > 0) {
          setActiveProviderTab("fanart");
        }

        setActiveTab("previews");
      } else {
        showError(t("assetReplacer.fetchPreviewsError"));
      }
    } catch (err) {
      showError(
        t("assetReplacer.errorFetchingPreviews", { error: err.message })
      );
      console.error("Error fetching previews:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showError(t("assetReplacer.selectImageError"));
      return;
    }

    // Show preview of uploaded image
    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(reader.result);
    };
    reader.readAsDataURL(file);

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

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(url, {
        method: "POST",
        body: formData,
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

          // Call onSuccess to delete DB entry before navigating
          onSuccess?.();

          console.log("🎯 Waiting for log file: Manuallog.log");

          // Wait for log file to be created before navigating
          const logExists = await waitForLogFile("Manuallog.log");

          if (logExists) {
            console.log("🎯 Redirecting to LogViewer with log: Manuallog.log");
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          } else {
            console.warn(
              "⚠️ Log file Manuallog.log not found, redirecting anyway"
            );
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          }
        } else {
          showSuccess(t("assetReplacer.replacedSuccessfully"));
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 2000);
        }
      } else {
        showError(t("assetReplacer.uploadError"));
      }
    } catch (err) {
      showError(t("assetReplacer.errorUploadingFile", { error: err.message }));
      console.error("Error uploading file:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleSelectPreview = async (preview) => {
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

          // Call onSuccess to delete DB entry before navigating
          onSuccess?.();

          console.log("🎯 Waiting for log file: Manuallog.log");

          // Wait for log file to be created before navigating
          const logExists = await waitForLogFile("Manuallog.log");

          if (logExists) {
            console.log("🎯 Redirecting to LogViewer with log: Manuallog.log");
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          } else {
            console.warn(
              "⚠️ Log file Manuallog.log not found, redirecting anyway"
            );
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          }
        } else {
          showSuccess(t("assetReplacer.replacedSuccessfully"));
          setTimeout(() => {
            onSuccess?.();
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-theme-card rounded-xl border border-theme max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-theme p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <h2 className="text-2xl font-bold text-theme-text flex items-center gap-3">
                <div className="p-2 rounded-lg bg-theme-primary/10">
                  <RefreshCw className="w-6 h-6 text-theme-primary" />
                </div>
                {t("assetReplacer.title")}
              </h2>
              <p className="text-theme-text mt-2 text-lg font-medium">
                {getDisplayName()}
              </p>
              <p className="text-theme-muted text-sm mt-1">{asset.name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-theme-hover rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-theme-muted" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-theme px-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                activeTab === "upload"
                  ? "text-theme-primary border-theme-primary"
                  : "text-theme-muted border-transparent hover:text-theme-text"
              }`}
            >
              <Upload className="w-4 h-4 inline mr-2" />
              {t("assetReplacer.uploadCustom")}
            </button>
            <button
              onClick={() => setActiveTab("previews")}
              className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                activeTab === "previews"
                  ? "text-theme-primary border-theme-primary"
                  : "text-theme-muted border-transparent hover:text-theme-text"
              }`}
            >
              <ImageIcon className="w-4 h-4 inline mr-2" />
              {t("assetReplacer.servicePreviews")}
              {totalPreviews > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-theme-primary/20 text-theme-primary rounded-full text-xs">
                  {totalPreviews}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "upload" && (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Process with Overlays Toggle */}
              {(metadata.asset_type === "poster" ||
                metadata.asset_type === "background" ||
                metadata.asset_type === "season" ||
                metadata.asset_type === "titlecard") && (
                <div className="bg-theme-hover border border-theme rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-theme-text">
                        Process with overlays after replace
                      </h4>
                      <p className="text-xs text-theme-muted mt-0.5">
                        Applies borders, overlays & text to the replaced asset
                        based on overlay settings.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setProcessWithOverlays(!processWithOverlays)
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-theme-bg ${
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
                            placeholder="e.g., Season 01"
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
                              Season Number *
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
                              placeholder="e.g., 01"
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
              <div className="bg-theme-hover border border-theme rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-theme-text">
                      {t("assetReplacer.manualSearchByTitle")}
                    </h4>
                    <p className="text-xs text-theme-muted mt-0.5">
                      Search for assets instead of using detected metadata
                    </p>
                  </div>
                  <button
                    onClick={() => setManualSearch(!manualSearch)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-theme-bg ${
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
                            Season Number *
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
                            placeholder="1"
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
                        onClick={fetchPreviews}
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-theme-primary text-white rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        <Download className="w-4 h-4" />
                        {loading
                          ? t("common.loading")
                          : t("assetReplacer.fetchFromServices")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Section */}
              <div className="bg-theme-card border border-theme rounded-lg p-6">
                <div className="flex items-start gap-4">
                  {/* Upload Area */}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-theme-text mb-3">
                      {t("assetReplacer.uploadYourOwnImage")}
                    </h3>
                    <label className="block border-2 border-dashed border-theme rounded-lg p-6 text-center cursor-pointer hover:border-theme-primary transition-colors">
                      <Upload className="w-10 h-10 text-theme-muted mx-auto mb-2" />
                      <p className="text-sm text-theme-muted mb-3">
                        {t("assetReplacer.selectCustomImage")}
                      </p>
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-theme-primary text-white rounded-lg hover:bg-opacity-90 transition-colors text-sm">
                        <Upload className="w-4 h-4" />
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
                    <div className="w-48 flex-shrink-0">
                      <p className="text-xs font-medium text-theme-text mb-2">
                        Preview:
                      </p>
                      <div
                        className={`relative bg-theme rounded-lg overflow-hidden border border-theme ${
                          useHorizontalLayout ? "aspect-[16/9]" : "aspect-[2/3]"
                        }`}
                      >
                        <img
                          src={uploadedImage}
                          alt="Upload preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-theme"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-theme-bg text-theme-muted">
                    {manualSearch
                      ? t("assetReplacer.searchForAssets")
                      : t("assetReplacer.orFetchFromServices")}
                  </span>
                </div>
              </div>

              {/* Fetch Previews Button */}
              <div className="text-center">
                <button
                  onClick={fetchPreviews}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-theme-hover text-theme-text rounded-lg hover:bg-theme-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-5 h-5" />
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
                  <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mb-4" />
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
                    onClick={fetchPreviews}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-theme-primary text-white rounded-lg hover:bg-opacity-90 transition-colors"
                  >
                    <Download className="w-5 h-5" />
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
                                onSelect={() => handleSelectPreview(preview)}
                                disabled={uploading}
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
                                onSelect={() => handleSelectPreview(preview)}
                                disabled={uploading}
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
                                onSelect={() => handleSelectPreview(preview)}
                                disabled={uploading}
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
    </div>
  );
}

function PreviewCard({ preview, onSelect, disabled, isHorizontal = false }) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

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
            <RefreshCw className="w-8 h-8 animate-spin text-theme-muted" />
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
