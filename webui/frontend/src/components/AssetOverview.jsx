import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AlertTriangle,
  Globe,
  Database,
  Type,
  Edit,
  FileQuestion,
  RefreshCw,
  Loader2,
  Search,
  Replace,
  ChevronDown,
  CheckIcon,
  Star,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../context/ToastContext";
import AssetReplacer from "./AssetReplacer";
import ScrollToButtons from "./ScrollToButtons";

// Helper function to detect provider from URL and return badge styling
const getProviderBadge = (url) => {
  if (!url || url === "false" || url === false) {
    return {
      name: "Missing",
      color: "bg-gray-500/20 text-gray-400 border-gray-500/30",
      logo: null,
    };
  }

  const urlLower = url.toLowerCase();

  if (urlLower.includes("tmdb") || urlLower.includes("themoviedb")) {
    return {
      name: "TMDB",
      color:
        "bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30",
      logo: "/tmdb.png",
    };
  } else if (urlLower.includes("tvdb") || urlLower.includes("thetvdb")) {
    return {
      name: "TVDB",
      color:
        "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30",
      logo: "/tvdb.png",
    };
  } else if (urlLower.includes("fanart")) {
    return {
      name: "Fanart.tv",
      color:
        "bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30",
      logo: "/fanart.png",
    };
  } else if (urlLower.includes("plex")) {
    return {
      name: "Plex",
      color:
        "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30",
      logo: "/plex.png",
    };
  } else if (urlLower.includes("imdb")) {
    return {
      name: "IMDb",
      color:
        "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30",
      logo: "/imdb.png",
    };
  } else {
    return {
      name: "Other",
      color:
        "bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30",
      logo: null,
    };
  }
};

// Asset Row Component - Memoized to prevent unnecessary re-renders
const AssetRow = React.memo(
  ({
    asset,
    tags,
    showName,
    onNoEditsNeeded,
    onUnresolve,
    onReplace,
    isSelected,
    onToggleSelection,
    showCheckbox,
  }) => {
    const { t } = useTranslation();
    const [logoError, setLogoError] = useState(false);

    // Memoize badge computation based on DownloadSource
    const badge = useMemo(
      () => getProviderBadge(asset.DownloadSource),
      [asset.DownloadSource]
    );

    // Check if asset is resolved (Manual = "Yes" or "true" for legacy)
    const isResolved =
      asset.Manual === "Yes" ||
      asset.Manual === "true" ||
      asset.Manual === true;

    return (
      <div className="bg-theme-bg border border-theme rounded-lg p-4 hover:border-theme-primary/50 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Checkbox Column */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {showCheckbox && (
              <div className="flex items-center pt-1">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelection(asset.id)}
                  className="w-4 h-4 rounded border-theme-muted bg-theme-bg text-theme-primary focus:ring-2 focus:ring-theme-primary focus:ring-offset-0 cursor-pointer"
                  title={t("assetOverview.selectAsset")}
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-theme-text break-words">
                {showName ? (
                  <>
                    <span className="text-theme-primary">{showName}</span>
                    <span className="text-theme-muted mx-2">|</span>
                    <span>{asset.Title}</span>
                  </>
                ) : (
                  asset.Title
                )}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm text-theme-muted">
                <span className="font-medium">{t("assetOverview.type")}:</span>
                <span className="bg-theme-card px-2 py-0.5 rounded">
                  {asset.Type || "Unknown"}
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="font-medium">
                  {t("assetOverview.language")}:
                </span>
                <span className="bg-theme-card px-2 py-0.5 rounded">
                  {asset.Language &&
                  asset.Language !== "false" &&
                  asset.Language !== false
                    ? asset.Language
                    : "Unknown"}
                </span>
                <span className="hidden sm:inline">•</span>
                <span className="font-medium">
                  {t("assetOverview.source")}:
                </span>
                {asset.DownloadSource &&
                asset.DownloadSource !== "false" &&
                asset.DownloadSource !== false ? (
                  <a
                    href={asset.DownloadSource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title={asset.DownloadSource}
                  >
                    {badge.logo && !logoError ? (
                      <img
                        src={badge.logo}
                        alt={badge.name}
                        className="h-[35px] object-contain"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.color}`}
                      >
                        {badge.name}
                      </span>
                    )}
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.color}`}
                  >
                    {badge.name}
                  </span>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-3">
                {tags.map((tag, index) => (
                  <span
                    key={index}
                    className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${tag.color}`}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-start gap-2">
            {isResolved ? (
              // Show "Unresolve" button for resolved assets
              <button
                onClick={() => onUnresolve(asset)}
                className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text transition-all whitespace-nowrap shadow-sm"
                title={t("assetOverview.unresolveTooltip")}
              >
                <Edit className="w-4 h-4 text-theme-primary" />
                {t("assetOverview.unresolve")}
              </button>
            ) : (
              // Show "No Edits Needed" and "Replace" buttons for unresolved assets
              <>
                <button
                  onClick={() => onNoEditsNeeded(asset)}
                  className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text transition-all whitespace-nowrap shadow-sm"
                  title={t("assetOverview.noEditsNeededTooltip")}
                >
                  <CheckIcon className="w-4 h-4 text-theme-primary" />
                  {t("assetOverview.noEditsNeeded")}
                </button>
                <button
                  onClick={() => onReplace(asset)}
                  className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text transition-all whitespace-nowrap shadow-sm"
                  title={t("assetOverview.replaceTooltip")}
                >
                  <Replace className="w-4 h-4 text-theme-primary" />
                  {t("assetOverview.replace")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);

AssetRow.displayName = "AssetRow";

const AssetOverview = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("All Types");
  const [selectedLibrary, setSelectedLibrary] = useState("All Libraries");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedStatus, setSelectedStatus] = useState("Unresolved"); // New filter for resolved/unresolved
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showReplacer, setShowReplacer] = useState(false);

  // Selection state for bulk actions
  const [selectedAssetIds, setSelectedAssetIds] = useState(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Dropdown states
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [libraryDropdownOpen, setLibraryDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false); // New dropdown state

  // Dropdown position states (true = opens upward, false = opens downward)
  const [typeDropdownUp, setTypeDropdownUp] = useState(false);
  const [libraryDropdownUp, setLibraryDropdownUp] = useState(false);
  const [categoryDropdownUp, setCategoryDropdownUp] = useState(false);
  const [statusDropdownUp, setStatusDropdownUp] = useState(false); // New dropdown position

  // Refs for click outside detection
  const typeDropdownRef = useRef(null);
  const libraryDropdownRef = useRef(null);
  const categoryDropdownRef = useRef(null);
  const statusDropdownRef = useRef(null); // New ref

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/assets/overview");
      if (!response.ok) throw new Error(t("assetOverview.fetchError"));
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedAssetIds(new Set());
  }, [
    searchQuery,
    selectedType,
    selectedLibrary,
    selectedCategory,
    selectedStatus,
  ]);

  // Helper function to parse clean show name from Rootfolder
  const parseShowName = (rootfolder) => {
    if (!rootfolder) return null;

    // Remove TMDB/TVDB/IMDB IDs from the folder name
    // Pattern matches: [tvdb-123456], [tmdb-123456], [imdb-tt123456], etc.
    const cleanName = rootfolder
      .replace(/\s*\[tvdb-[^\]]+\]/gi, "")
      .replace(/\s*\[tmdb-[^\]]+\]/gi, "")
      .replace(/\s*\[imdb-[^\]]+\]/gi, "")
      .trim();

    return cleanName;
  };

  // Function to calculate dropdown position
  const calculateDropdownPosition = (ref) => {
    if (!ref.current) return false;

    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If more space above than below, open upward
    return spaceAbove > spaceBelow;
  };

  // Click outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        typeDropdownRef.current &&
        !typeDropdownRef.current.contains(event.target)
      ) {
        setTypeDropdownOpen(false);
      }
      if (
        libraryDropdownRef.current &&
        !libraryDropdownRef.current.contains(event.target)
      ) {
        setLibraryDropdownOpen(false);
      }
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target)
      ) {
        setCategoryDropdownOpen(false);
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target)
      ) {
        setStatusDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle opening the replacer
  const handleReplace = async (asset) => {
    // Instead of constructing the path manually (which doesn't work for Seasons/TitleCards),
    // we ask the backend to find the actual asset file in the filesystem
    try {
      const response = await fetch(`/api/imagechoices/${asset.id}/find-asset`);

      if (!response.ok) {
        console.error("Failed to find asset file:", await response.text());
        // Fallback to manual construction for backwards compatibility
        constructAssetManually(asset);
        return;
      }

      const data = await response.json();

      if (data.success && data.asset) {
        // Use the actual asset path from filesystem
        const assetTypeRaw = (asset.Type || "").toLowerCase();
        let mediaType = "movie";
        if (
          assetTypeRaw.includes("show") ||
          assetTypeRaw.includes("series") ||
          assetTypeRaw.includes("episode") ||
          assetTypeRaw.includes("season") ||
          assetTypeRaw.includes("titlecard") ||
          assetTypeRaw.includes("tv")
        ) {
          mediaType = "tv";
        }

        const assetForReplacer = {
          id: asset.id,
          title: asset.Title,
          name: data.asset.name,
          path: data.asset.path,
          type: mediaType,
          library: data.asset.library,
          url: data.asset.url,
          _dbData: asset,
          _originalType: asset.Type,
        };

        console.log("Found actual asset file from filesystem:", {
          dbRecord: {
            Title: asset.Title,
            Type: asset.Type,
            Rootfolder: asset.Rootfolder,
          },
          foundAsset: {
            path: data.asset.path,
            name: data.asset.name,
            type: mediaType,
          },
        });

        setSelectedAsset(assetForReplacer);
        setShowReplacer(true);
      } else {
        console.error("Backend found no asset file");
        constructAssetManually(asset);
      }
    } catch (error) {
      console.error("Error finding asset:", error);
      constructAssetManually(asset);
    }
  };

  // Fallback: Manual path construction (for backwards compatibility)
  const constructAssetManually = (asset) => {
    console.warn("Using manual path construction as fallback");

    let fullPath;

    if (asset.Rootfolder) {
      // Rootfolder contains: "Man-Thing (2005) {tmdb-18882}"
      // Determine filename based on asset type (same as actual file structure)
      const assetType = (asset.Type || "").toLowerCase();
      const title = asset.Title || "";
      let filename = "poster.jpg"; // Default

      if (assetType.includes("background")) {
        filename = "background.jpg";
      } else if (assetType.includes("season")) {
        // Extract season number from Title (e.g., "Show Name | Season04" or "Show Name | Season05")
        // NOT from Type field which only contains "Season"
        const seasonMatch = title.match(/season\s*(\d+)/i);
        if (seasonMatch) {
          const seasonNum = seasonMatch[1].padStart(2, "0");
          filename = `Season${seasonNum}.jpg`;
          console.log(`Season filename from title '${title}': ${filename}`);
        } else {
          filename = "Season01.jpg"; // Fallback to Season01 if no number found
          console.warn(
            `Could not extract season number from title '${title}', using Season01.jpg as fallback`
          );
        }
      } else if (
        assetType.includes("titlecard") ||
        assetType.includes("episode")
      ) {
        // Extract episode code from Title (e.g., "S04E01 | Episode Title")
        const episodeMatch = title.match(/(S\d+E\d+)/i);
        if (episodeMatch) {
          const episodeCode = episodeMatch[1].toUpperCase();
          filename = `${episodeCode}.jpg`;
          console.log(`Episode filename from title '${title}': ${filename}`);
        } else {
          filename = "S01E01.jpg"; // Fallback
          console.warn(
            `Could not extract episode code from title '${title}', using S01E01.jpg as fallback`
          );
        }
      }

      // Construct path like Gallery does: "LibraryName/Rootfolder/filename"
      fullPath = `${asset.LibraryName}/${asset.Rootfolder}/${filename}`;
    } else if (asset.Title) {
      // Fallback without Rootfolder
      const assetType = (asset.Type || "").toLowerCase();
      const filename = assetType.includes("background")
        ? "background.jpg"
        : "poster.jpg";
      fullPath = `${asset.LibraryName || "4K"}/${asset.Title}/${filename}`;
    } else {
      // Last fallback
      fullPath = `${asset.LibraryName || "4K"}/unknown.jpg`;
    }

    // Determine the correct type for AssetReplacer
    // AssetReplacer's extractMetadata expects:
    // - asset.type to determine media_type ("movie" vs "tv")
    // - asset.type or path to determine asset_type ("poster", "background", etc.)
    const assetTypeRaw = (asset.Type || "").toLowerCase();

    // Determine if it's a movie or TV show
    // DB Type examples:
    // - Movies: "Movie", "Movie Background"
    // - TV: "Show", "Show Background", "Season", "Season Poster", "TitleCard", "Episode"
    let mediaType = "movie"; // Default
    if (
      assetTypeRaw.includes("show") ||
      assetTypeRaw.includes("series") ||
      assetTypeRaw.includes("episode") ||
      assetTypeRaw.includes("season") ||
      assetTypeRaw.includes("titlecard") ||
      assetTypeRaw.includes("tv")
    ) {
      mediaType = "tv";
    }

    const assetForReplacer = {
      id: asset.id,
      title: asset.Title,
      name: fullPath.split("/").pop(), // Just the filename
      path: fullPath, // Relative path from assets folder (like Gallery)
      type: mediaType, // "movie" or "tv" - used by extractMetadata() to set media_type
      library: asset.LibraryName || "",
      url: `/poster_assets/${fullPath}`, // Same URL format as Gallery
      // Pass through original DB data for debugging
      _dbData: asset,
      _originalType: asset.Type, // Keep original for reference
    };

    console.log("Converting asset for replacer (Gallery-compatible format):", {
      original: {
        Title: asset.Title,
        Type: asset.Type,
        Rootfolder: asset.Rootfolder,
        LibraryName: asset.LibraryName,
      },
      converted: {
        path: assetForReplacer.path,
        name: assetForReplacer.name,
        url: assetForReplacer.url,
        type: assetForReplacer.type,
      },
    });

    setSelectedAsset(assetForReplacer);
    setShowReplacer(true);
  };

  // Handle successful replacement
  const handleReplaceSuccess = async () => {
    console.log("handleReplaceSuccess called for asset ID:", selectedAsset?.id);

    // Delete the DB entry after successful replacement
    try {
      console.log(
        "Sending DELETE request to /api/imagechoices/" + selectedAsset.id
      );
      const response = await fetch(`/api/imagechoices/${selectedAsset.id}`, {
        method: "DELETE",
      });

      console.log("DELETE response status:", response.status);

      if (response.ok) {
        console.log("DB entry deleted successfully after replacement");

        // Refresh the data to update the UI
        console.log("Refreshing asset data...");
        await fetchData();
        console.log("Asset data refreshed");

        // Trigger event to update sidebar badge count
        console.log("Dispatching assetReplaced event");
        window.dispatchEvent(new Event("assetReplaced"));
      } else {
        const errorText = await response.text();
        console.error("Failed to delete DB entry:", response.status, errorText);
      }
    } catch (error) {
      console.error("Error deleting DB entry:", error);
    }

    console.log("Closing replacer modal");
    setShowReplacer(false);
    setSelectedAsset(null);
  };

  // Handle closing the replacer
  const handleCloseReplacer = () => {
    setShowReplacer(false);
    setSelectedAsset(null);
  };

  // Handle marking asset as "No Edits Needed"
  const handleNoEditsNeeded = async (asset) => {
    console.log(`[AssetOverview] Marking asset as "No Edits Needed":`, {
      id: asset.id,
      title: asset.Title,
      type: asset.Type,
      library: asset.LibraryName,
    });

    try {
      // Build the complete record with all required fields
      const updateRecord = {
        Title: asset.Title,
        Type: asset.Type || null,
        Rootfolder: asset.Rootfolder || null,
        LibraryName: asset.LibraryName || null,
        Language: asset.Language || null,
        Fallback: asset.Fallback || null,
        TextTruncated: asset.TextTruncated || null,
        DownloadSource: asset.DownloadSource || null,
        FavProviderLink: asset.FavProviderLink || null,
        Manual: "Yes", // Mark as manually reviewed (Yes instead of true)
      };

      console.log(
        `[AssetOverview] Sending PUT request to /api/imagechoices/${asset.id}`,
        {
          method: "PUT",
          payload: updateRecord,
        }
      );

      const response = await fetch(`/api/imagechoices/${asset.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateRecord),
      });

      const responseData = await response.json();
      console.log(`[AssetOverview] PUT response:`, {
        ok: response.ok,
        status: response.status,
        data: responseData,
      });

      if (response.ok) {
        console.log(
          `[AssetOverview] ✅ Asset ${asset.id} marked as Manual=true (No Edits Needed)`
        );
        showSuccess(
          t("assetOverview.markedAsReviewed", { title: asset.Title })
        );

        // Refresh the data to update the UI
        await fetchData();

        // Trigger event to update sidebar badge count
        window.dispatchEvent(new Event("assetReplaced"));
      } else {
        console.error(
          `[AssetOverview] ❌ Failed to update asset Manual field:`,
          {
            status: response.status,
            statusText: response.statusText,
            error: responseData,
          }
        );
        showError(t("assetOverview.updateFailed", { title: asset.Title }));
      }
    } catch (error) {
      console.error(`[AssetOverview] ❌ Error updating asset:`, {
        error: error.message,
        stack: error.stack,
        asset: {
          id: asset.id,
          title: asset.Title,
        },
      });
      showError(t("assetOverview.updateError", { error: error.message }));
    }
  };

  // Handle marking asset as "Unresolve" (undo resolution)
  const handleUnresolve = async (asset) => {
    console.log(`[AssetOverview] Unresolving asset:`, {
      id: asset.id,
      title: asset.Title,
      type: asset.Type,
      library: asset.LibraryName,
    });

    try {
      // Build the complete record with Manual set to "false"
      const updateRecord = {
        Title: asset.Title,
        Type: asset.Type || null,
        Rootfolder: asset.Rootfolder || null,
        LibraryName: asset.LibraryName || null,
        Language: asset.Language || null,
        Fallback: asset.Fallback || null,
        TextTruncated: asset.TextTruncated || null,
        DownloadSource: asset.DownloadSource || null,
        FavProviderLink: asset.FavProviderLink || null,
        Manual: "No", // Mark as explicitly unresolved (No instead of false)
      };

      console.log(
        `[AssetOverview] Sending PUT request to /api/imagechoices/${asset.id}`,
        {
          method: "PUT",
          payload: updateRecord,
        }
      );

      const response = await fetch(`/api/imagechoices/${asset.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateRecord),
      });

      const responseData = await response.json();
      console.log(`[AssetOverview] PUT response:`, {
        ok: response.ok,
        status: response.status,
        data: responseData,
      });

      if (response.ok) {
        console.log(
          `[AssetOverview] ✅ Asset ${asset.id} marked as Manual=false (Unresolved)`
        );
        showSuccess(
          t("assetOverview.markedAsUnresolved", { title: asset.Title })
        );

        // Refresh the data to update the UI
        await fetchData();

        // Trigger event to update sidebar badge count
        window.dispatchEvent(new Event("assetReplaced"));
      } else {
        console.error(`[AssetOverview] ❌ Failed to unresolve asset:`, {
          status: response.status,
          statusText: response.statusText,
          error: responseData,
        });
        showError(t("assetOverview.unresolveFailed", { title: asset.Title }));
      }
    } catch (error) {
      console.error(`[AssetOverview] ❌ Error unresolving asset:`, {
        error: error.message,
        stack: error.stack,
        asset: {
          id: asset.id,
          title: asset.Title,
        },
      });
      showError(t("assetOverview.unresolveError", { error: error.message }));
    }
  };

  // Handle toggling selection of a single asset
  const handleToggleSelection = (assetId) => {
    setSelectedAssetIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  // Handle selecting/deselecting all filtered assets
  const handleSelectAll = () => {
    if (
      selectedAssetIds.size === filteredAssets.length &&
      filteredAssets.length > 0
    ) {
      // Deselect all
      setSelectedAssetIds(new Set());
    } else {
      // Select all filtered assets
      setSelectedAssetIds(new Set(filteredAssets.map((asset) => asset.id)));
    }
  };

  // Handle bulk mark as resolved
  const handleBulkMarkAsResolved = async () => {
    if (selectedAssetIds.size === 0) return;

    setIsBulkProcessing(true);
    const selectedAssets = filteredAssets.filter((asset) =>
      selectedAssetIds.has(asset.id)
    );

    console.log(
      `[AssetOverview] Bulk marking ${selectedAssets.length} assets as resolved`
    );

    try {
      let successCount = 0;
      let failCount = 0;

      // Process each selected asset
      for (const asset of selectedAssets) {
        try {
          const updateRecord = {
            Title: asset.Title,
            Type: asset.Type || null,
            Rootfolder: asset.Rootfolder || null,
            LibraryName: asset.LibraryName || null,
            Language: asset.Language || null,
            Fallback: asset.Fallback || null,
            TextTruncated: asset.TextTruncated || null,
            DownloadSource: asset.DownloadSource || null,
            FavProviderLink: asset.FavProviderLink || null,
            Manual: "Yes",
          };

          const response = await fetch(`/api/imagechoices/${asset.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updateRecord),
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
            console.error(
              `Failed to update asset ${asset.id}:`,
              await response.text()
            );
          }
        } catch (error) {
          failCount++;
          console.error(`Error updating asset ${asset.id}:`, error);
        }
      }

      // Clear selection after processing
      setSelectedAssetIds(new Set());

      // Refresh data
      await fetchData();

      // Trigger event to update sidebar badge count
      window.dispatchEvent(new Event("assetReplaced"));

      // Show result message
      if (successCount > 0 && failCount === 0) {
        showSuccess(
          t("assetOverview.bulkMarkSuccess", { count: successCount })
        );
      } else if (successCount > 0 && failCount > 0) {
        showSuccess(
          t("assetOverview.bulkMarkPartial", {
            success: successCount,
            failed: failCount,
          })
        );
      } else {
        showError(t("assetOverview.bulkMarkFailed"));
      }
    } catch (error) {
      console.error("[AssetOverview] Error in bulk mark as resolved:", error);
      showError(t("assetOverview.bulkMarkError", { error: error.message }));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Get all assets from all categories
  const allAssets = useMemo(() => {
    if (!data) return [];
    const assets = new Map();

    // Collect all unique assets
    Object.values(data.categories).forEach((category) => {
      category.assets.forEach((asset) => {
        if (!assets.has(asset.id)) {
          assets.set(asset.id, asset);
        }
      });
    });

    return Array.from(assets.values());
  }, [data]);

  // Get unique types and libraries for filters (based on selectedStatus)
  const types = useMemo(() => {
    let assetsToFilter = allAssets;

    // Filter based on status first
    if (selectedStatus === "Resolved") {
      // Show assets marked as "Yes" or "true" (legacy)
      assetsToFilter = assetsToFilter.filter(
        (asset) =>
          asset.Manual === "Yes" ||
          asset.Manual === "true" ||
          asset.Manual === true
      );
    } else if (selectedStatus === "Unresolved") {
      // Show everything except resolved ("Yes" or "true")
      assetsToFilter = assetsToFilter.filter(
        (asset) =>
          !asset.Manual ||
          (asset.Manual !== "Yes" &&
            asset.Manual !== "true" &&
            asset.Manual !== true)
      );
    }
    // "All" status shows everything

    const uniqueTypes = new Set(
      assetsToFilter.map((a) => a.Type).filter(Boolean)
    );
    return ["All Types", ...Array.from(uniqueTypes).sort()];
  }, [allAssets, selectedStatus]);

  const libraries = useMemo(() => {
    let assetsToFilter = allAssets;

    // Filter based on status first
    if (selectedStatus === "Resolved") {
      // Show assets marked as "Yes" or "true" (legacy)
      assetsToFilter = assetsToFilter.filter(
        (asset) =>
          asset.Manual === "Yes" ||
          asset.Manual === "true" ||
          asset.Manual === true
      );
    } else if (selectedStatus === "Unresolved") {
      // Show everything except resolved ("Yes" or "true")
      assetsToFilter = assetsToFilter.filter(
        (asset) =>
          !asset.Manual ||
          (asset.Manual !== "Yes" &&
            asset.Manual !== "true" &&
            asset.Manual !== true)
      );
    }
    // "All" status shows everything

    const uniqueLibs = new Set(
      assetsToFilter.map((a) => a.LibraryName).filter(Boolean)
    );
    return ["All Libraries", ...Array.from(uniqueLibs).sort()];
  }, [allAssets, selectedStatus]);

  // Category cards configuration (must be before filteredAssets to avoid circular dependency)
  const categoryCards = useMemo(() => {
    if (!data) return [];

    return [
      {
        key: "assets_with_issues",
        label: t("assetOverview.assetsWithIssues"),
        count: data.categories.assets_with_issues.count,
        icon: AlertTriangle,
        color: "text-yellow-400",
        bgColor: "bg-gradient-to-br from-yellow-900/30 to-yellow-950/20",
        borderColor: "border-yellow-900/40",
        hoverBorderColor: "hover:border-yellow-500/50",
      },
      {
        key: "missing_assets",
        label: t("assetOverview.missingAssets"),
        count: data.categories.missing_assets.count,
        icon: FileQuestion,
        color: "text-red-400",
        bgColor: "bg-gradient-to-br from-red-900/30 to-red-950/20",
        borderColor: "border-red-900/40",
        hoverBorderColor: "hover:border-red-500/50",
      },
      {
        key: "missing_assets_fav_provider",
        label: t("assetOverview.missingAssetsAtFavProvider"),
        count: data.categories.missing_assets_fav_provider.count,
        icon: Star,
        color: "text-orange-400",
        bgColor: "bg-gradient-to-br from-orange-900/30 to-orange-950/20",
        borderColor: "border-orange-900/40",
        hoverBorderColor: "hover:border-orange-500/50",
      },
      {
        key: "non_primary_lang",
        label: t("assetOverview.nonPrimaryLang"),
        count: data.categories.non_primary_lang.count,
        icon: Globe,
        color: "text-sky-400",
        bgColor: "bg-gradient-to-br from-sky-900/30 to-sky-950/20",
        borderColor: "border-sky-900/40",
        hoverBorderColor: "hover:border-sky-500/50",
      },
      {
        key: "non_primary_provider",
        label: t("assetOverview.nonPrimaryProvider"),
        count: data.categories.non_primary_provider.count,
        icon: Database,
        color: "text-emerald-400",
        bgColor: "bg-gradient-to-br from-emerald-900/30 to-emerald-950/20",
        borderColor: "border-emerald-900/40",
        hoverBorderColor: "hover:border-emerald-500/50",
      },
      {
        key: "truncated_text",
        label: t("assetOverview.truncatedTextCategory"),
        count: data.categories.truncated_text.count,
        icon: Type,
        color: "text-purple-400",
        bgColor: "bg-gradient-to-br from-purple-900/30 to-purple-950/20",
        borderColor: "border-purple-900/40",
        hoverBorderColor: "hover:border-purple-500/50",
      },
    ];
  }, [data, t]);

  // Filter assets based on selected category and filters
  const filteredAssets = useMemo(() => {
    if (!data) return [];

    let assets = [];

    // Select assets based on category
    if (selectedCategory === "All Categories") {
      assets = allAssets;
    } else {
      // Find the category card with matching label to get the correct key
      const categoryCard = categoryCards.find(
        (card) => card.label === selectedCategory
      );
      const categoryKey = categoryCard?.key;
      assets = categoryKey ? data.categories[categoryKey]?.assets || [] : [];
    }

    // Filter based on selected status
    if (selectedStatus === "Resolved") {
      // Show only resolved assets (Manual === "Yes" or "true" for legacy)
      assets = assets.filter(
        (asset) =>
          asset.Manual === "Yes" ||
          asset.Manual === "true" ||
          asset.Manual === true
      );
    } else if (selectedStatus === "Unresolved") {
      // Show only unresolved assets (not "Yes" or "true")
      assets = assets.filter(
        (asset) =>
          !asset.Manual ||
          (asset.Manual !== "Yes" &&
            asset.Manual !== "true" &&
            asset.Manual !== true)
      );
    }
    // If selectedStatus === "All", don't filter by Manual status

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      assets = assets.filter(
        (asset) =>
          asset.Title?.toLowerCase().includes(query) ||
          asset.Rootfolder?.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (selectedType !== "All Types") {
      assets = assets.filter((asset) => asset.Type === selectedType);
    }

    // Apply library filter
    if (selectedLibrary !== "All Libraries") {
      assets = assets.filter((asset) => asset.LibraryName === selectedLibrary);
    }

    return assets;
  }, [
    data,
    selectedCategory,
    selectedStatus,
    searchQuery,
    selectedType,
    selectedLibrary,
    allAssets,
    categoryCards,
  ]);

  // Get tags for an asset
  const getAssetTags = (asset) => {
    const tags = [];

    // 1. MISSING ASSET CHECK
    // Missing Asset Badge -> if DownloadSource is empty
    const downloadSource = asset.DownloadSource;
    const providerLink = asset.FavProviderLink;

    const isDownloadMissing =
      downloadSource === "false" || downloadSource === false || !downloadSource;

    const isProviderLinkMissing =
      providerLink === "false" || providerLink === false || !providerLink;

    // Missing Asset Badge (red) - only if DownloadSource is empty
    if (isDownloadMissing) {
      tags.push({
        label: t("assetOverview.missingAsset"),
        color: "bg-red-500/20 text-red-400 border-red-500/30",
      });
    }

    // Missing Asset at Favorite Provider Badge (orange) - only if FavProviderLink is empty
    if (isProviderLinkMissing) {
      tags.push({
        label: t("assetOverview.missingAssetAtFavProvider"),
        color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      });
    }

    // 2. NON-PRIMARY PROVIDER CHECK
    // Check if DownloadSource OR FavProviderLink don't match the primary provider
    // Only check if we have both DownloadSource AND FavProviderLink
    if (!isDownloadMissing && !isProviderLinkMissing) {
      const primaryProvider = data?.config?.primary_provider || "";

      if (primaryProvider) {
        const providerPatterns = {
          tmdb: ["tmdb", "themoviedb"],
          tvdb: ["tvdb", "thetvdb"],
          fanart: ["fanart"],
          plex: ["plex"],
        };

        const patterns = providerPatterns[primaryProvider] || [primaryProvider];

        // Check if DownloadSource contains the primary provider
        const isDownloadFromPrimaryProvider = patterns.some((pattern) =>
          downloadSource.toLowerCase().includes(pattern)
        );

        // Check if FavProviderLink contains the primary provider
        const isFavLinkFromPrimaryProvider = patterns.some((pattern) =>
          providerLink.toLowerCase().includes(pattern)
        );

        // Show badge if EITHER DownloadSource OR FavProviderLink is not from primary provider
        if (!isDownloadFromPrimaryProvider || !isFavLinkFromPrimaryProvider) {
          tags.push({
            label: t("assetOverview.notPrimaryProvider"),
            color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          });
        }
      }
    }

    // 3. NON-PRIMARY LANGUAGE CHECK
    // Check for "Unknown" language first (add badge for non-primary language)
    // This includes when Language is "unknown", "false", false, or missing
    if (
      !asset.Language ||
      asset.Language === "false" ||
      asset.Language === false ||
      asset.Language.toLowerCase() === "unknown"
    ) {
      tags.push({
        label: t("assetOverview.notPrimaryLanguage"),
        color: "bg-sky-500/20 text-sky-400 border-sky-500/30",
      });
    }
    // Language is a valid language code/string
    else if (data?.config?.primary_language) {
      const langNormalized =
        asset.Language.toLowerCase() === "textless"
          ? "xx"
          : asset.Language.toLowerCase();
      const primaryNormalized =
        data.config.primary_language.toLowerCase() === "textless"
          ? "xx"
          : data.config.primary_language.toLowerCase();

      if (langNormalized !== primaryNormalized) {
        tags.push({
          label: t("assetOverview.notPrimaryLanguage"),
          color: "bg-sky-500/20 text-sky-400 border-sky-500/30",
        });
      }
    } else if (!data?.config?.primary_language) {
      // No primary language set, anything that's not Textless/xx is non-primary
      if (!["textless", "xx"].includes(asset.Language.toLowerCase())) {
        tags.push({
          label: t("assetOverview.notPrimaryLanguage"),
          color: "bg-sky-500/20 text-sky-400 border-sky-500/30",
        });
      }
    }

    // 4. TRUNCATED TEXT CHECK
    if (
      asset.TextTruncated &&
      (asset.TextTruncated.toLowerCase() === "true" ||
        asset.TextTruncated === true)
    ) {
      tags.push({
        label: t("assetOverview.truncatedText"),
        color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      });
    }

    return tags;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">{t("assetOverview.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <div>
            <h3 className="text-lg font-semibold text-red-400">
              {t("assetOverview.errorLoadingData")}
            </h3>
            <p className="text-red-300/80">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {categoryCards.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedCategory === card.label;

          return (
            <button
              key={card.key}
              onClick={() =>
                setSelectedCategory(isSelected ? "All Categories" : card.label)
              }
              className={`relative p-5 rounded-xl border-2 transition-all duration-200 bg-black/60 ${
                card.borderColor
              } ${card.hoverBorderColor} ${
                isSelected
                  ? "ring-2 ring-theme-primary/50 scale-105 shadow-lg"
                  : "hover:scale-102 shadow-md"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <Icon className={`w-6 h-6 ${card.color}`} />
                <span className={`text-3xl font-bold ${card.color}`}>
                  {card.count}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-300 text-left">
                {card.label}
              </div>
              {isSelected && (
                <div className="absolute inset-0 bg-theme-primary/5 rounded-xl pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-theme-card border border-theme rounded-lg p-4">
        {/* First Row: 4 Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Status Filter */}
          <div className="relative" ref={statusDropdownRef}>
            <button
              onClick={() => {
                const shouldOpenUp =
                  calculateDropdownPosition(statusDropdownRef);
                setStatusDropdownUp(shouldOpenUp);
                setStatusDropdownOpen(!statusDropdownOpen);
              }}
              className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text text-sm flex items-center justify-between hover:bg-theme-hover hover:border-theme-primary/50 transition-all shadow-sm"
            >
              <span className="font-medium">
                {selectedStatus === "All"
                  ? t("assetOverview.allStatuses")
                  : selectedStatus === "Resolved"
                  ? t("assetOverview.resolved")
                  : t("assetOverview.unresolved")}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  statusDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {statusDropdownOpen && (
              <div
                className={`absolute z-50 w-full ${
                  statusDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl`}
              >
                {["All", "Resolved", "Unresolved"].map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setSelectedStatus(status);
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm transition-all ${
                      selectedStatus === status
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {status === "All"
                      ? t("assetOverview.allStatuses")
                      : status === "Resolved"
                      ? t("assetOverview.resolved")
                      : t("assetOverview.unresolved")}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type Filter */}
          <div className="relative" ref={typeDropdownRef}>
            <button
              onClick={() => {
                const shouldOpenUp = calculateDropdownPosition(typeDropdownRef);
                setTypeDropdownUp(shouldOpenUp);
                setTypeDropdownOpen(!typeDropdownOpen);
              }}
              className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text text-sm flex items-center justify-between hover:bg-theme-hover hover:border-theme-primary/50 transition-all shadow-sm"
            >
              <span className="font-medium">
                {selectedType === "All Types"
                  ? t("assetOverview.allTypes")
                  : selectedType}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  typeDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {typeDropdownOpen && (
              <div
                className={`absolute z-50 w-full ${
                  typeDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-60 overflow-y-auto`}
              >
                {types.map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setSelectedType(type);
                      setTypeDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm transition-all ${
                      selectedType === type
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {type === "All Types" ? t("assetOverview.allTypes") : type}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Library Filter */}
          <div className="relative" ref={libraryDropdownRef}>
            <button
              onClick={() => {
                const shouldOpenUp =
                  calculateDropdownPosition(libraryDropdownRef);
                setLibraryDropdownUp(shouldOpenUp);
                setLibraryDropdownOpen(!libraryDropdownOpen);
              }}
              className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text text-sm flex items-center justify-between hover:bg-theme-hover hover:border-theme-primary/50 transition-all shadow-sm"
            >
              <span className="font-medium">
                {selectedLibrary === "All Libraries"
                  ? t("assetOverview.allLibraries")
                  : selectedLibrary}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  libraryDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {libraryDropdownOpen && (
              <div
                className={`absolute z-50 w-full ${
                  libraryDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-60 overflow-y-auto`}
              >
                {libraries.map((lib) => (
                  <button
                    key={lib}
                    onClick={() => {
                      setSelectedLibrary(lib);
                      setLibraryDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm transition-all ${
                      selectedLibrary === lib
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {lib === "All Libraries"
                      ? t("assetOverview.allLibraries")
                      : lib}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Category Filter */}
          <div className="relative" ref={categoryDropdownRef}>
            <button
              onClick={() => {
                const shouldOpenUp =
                  calculateDropdownPosition(categoryDropdownRef);
                setCategoryDropdownUp(shouldOpenUp);
                setCategoryDropdownOpen(!categoryDropdownOpen);
              }}
              className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text text-sm flex items-center justify-between hover:bg-theme-hover hover:border-theme-primary/50 transition-all shadow-sm"
            >
              <span className="font-medium">
                {selectedCategory === "All Categories"
                  ? t("assetOverview.allCategories")
                  : selectedCategory}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  categoryDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {categoryDropdownOpen && (
              <div
                className={`absolute z-50 w-full ${
                  categoryDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-60 overflow-y-auto`}
              >
                <button
                  onClick={() => {
                    setSelectedCategory("All Categories");
                    setCategoryDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left text-sm transition-all ${
                    selectedCategory === "All Categories"
                      ? "bg-theme-primary text-white"
                      : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                  }`}
                >
                  {t("assetOverview.allCategories")}
                </button>
                {categoryCards.map((card) => (
                  <button
                    key={card.key}
                    onClick={() => {
                      setSelectedCategory(card.label);
                      setCategoryDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm transition-all ${
                      selectedCategory === card.label
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {card.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Second Row: Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
          <input
            type="text"
            placeholder={t("assetOverview.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
          />
        </div>
      </div>

      {/* Assets Grid */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        {/* Bulk Action Toolbar - Shows when items are selected */}
        {selectedAssetIds.size > 0 && (
          <div className="mb-4 p-4 bg-theme-primary/10 border border-theme-primary rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckIcon className="w-5 h-5 text-theme-primary" />
              <span className="text-theme-text font-medium">
                {t("assetOverview.selectedCount", {
                  count: selectedAssetIds.size,
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkMarkAsResolved}
                disabled={isBulkProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 disabled:bg-theme-primary/50 rounded-lg text-white font-medium transition-all shadow-sm disabled:cursor-not-allowed"
              >
                {isBulkProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("assetOverview.processing")}
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    {t("assetOverview.markSelectedAsResolved")}
                  </>
                )}
              </button>
              <button
                onClick={() => setSelectedAssetIds(new Set())}
                disabled={isBulkProcessing}
                className="px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("assetOverview.clearSelection")}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-theme-text">
            {selectedCategory === "All Categories"
              ? t("assetOverview.allAssets")
              : selectedCategory}
            <span className="text-theme-muted ml-2">
              ({filteredAssets.length})
            </span>
          </h2>

          <div className="flex items-center gap-2">
            {/* Select All Button */}
            {filteredAssets.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 rounded-lg text-sm font-medium transition-all shadow-sm"
                title={t("assetOverview.selectAllFiltered")}
              >
                <CheckIcon className="w-4 h-4 text-white" />
                <span className="text-white">
                  {t("assetOverview.selectAll")}
                </span>
              </button>
            )}

            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <RefreshCw className="w-4 h-4 text-theme-primary" />
              <span className="text-theme-text">{t("common.refresh")}</span>
            </button>
          </div>
        </div>

        {filteredAssets.length === 0 ? (
          <div className="text-center py-12">
            <FileQuestion className="w-16 h-16 text-theme-muted mx-auto mb-4" />
            <p className="text-theme-muted">
              {t("assetOverview.noAssetsFound")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAssets.map((asset) => {
              const tags = getAssetTags(asset);

              // Parse show name for episodes and titlecards only (not seasons)
              const assetType = (asset.Type || "").toLowerCase();
              const isEpisodeType =
                assetType.includes("episode") ||
                assetType.includes("titlecard");
              const showName = isEpisodeType
                ? parseShowName(asset.Rootfolder)
                : null;

              return (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  tags={tags}
                  showName={showName}
                  onNoEditsNeeded={handleNoEditsNeeded}
                  onReplace={handleReplace}
                  onUnresolve={handleUnresolve}
                  isSelected={selectedAssetIds.has(asset.id)}
                  onToggleSelection={handleToggleSelection}
                  showCheckbox={selectedAssetIds.size > 0}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Asset Replacer Modal */}
      {showReplacer && selectedAsset && (
        <AssetReplacer
          asset={selectedAsset}
          onClose={handleCloseReplacer}
          onSuccess={handleReplaceSuccess}
        />
      )}

      {/* Scroll To Buttons */}
      <ScrollToButtons />
    </div>
  );
};

export default AssetOverview;
