// - CompactImageSizeSlider (5-10 Assets)
// - Dynamic poster sizing with CSS Grid
// - Single horizontal row, all posters visible
// - Theme-compatible
// - All badges at bottom (no overlay)
// - Cached data with silent background refresh (every 2 minutes)

import React, { useState, useEffect, useRef } from "react";
import {
  FileImage,
  ExternalLink,
  RefreshCw,
  Loader2,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  Folder,
  HardDrive,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDashboardLoading } from "../context/DashboardLoadingContext";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import CompactImageSizeSlider from "./CompactImageSizeSlider";

const API_URL = "/api";

let cachedAssets = null;

function RecentAssets({ refreshTrigger = 0 }) {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();
  const { startLoading, finishLoading } = useDashboardLoading();
  const hasInitiallyLoaded = useRef(false);
  const [assets, setAssets] = useState(cachedAssets || []);
  const [loading, setLoading] = useState(false); // No initial loading if cached
  const [error, setError] = useState(null); // Error state

  const [refreshing, setRefreshing] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null); // For modal

  // Tab filter state with localStorage
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem("recent-assets-tab");
    return saved || "All";
  });

  // Pagination offset state with localStorage per tab
  const [pageOffset, setPageOffset] = useState(() => {
    const saved = localStorage.getItem(`recent-assets-offset-${activeTab}`);
    return saved ? parseInt(saved) : 0;
  });

  // Asset count state with localStorage (5-10 range, default 10)
  const [assetCount, setAssetCount] = useState(() => {
    const saved = localStorage.getItem("recent-assets-count");
    const count = saved ? parseInt(saved) : 10;
    // Ensure count is between 5 and 10
    return Math.min(Math.max(count, 5), 10);
  });

  const fetchRecentAssets = async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
      startLoading("recent-assets");
    }
    setError(null);

    try {
      const response = await fetch(`${API_URL}/recent-assets`);
      const data = await response.json();

      if (data.success) {
        cachedAssets = data.assets; // Save to persistent cache
        setAssets(data.assets);
        setError(null);

        // Mark as loaded after first successful fetch
        if (!hasInitiallyLoaded.current) {
          hasInitiallyLoaded.current = true;
          finishLoading("recent-assets");
        }
      } else {
        const errorMsg = data.error || t("recentAssets.loadError");
        setError(errorMsg);
        showError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err.message || t("recentAssets.loadError");
      setError(errorMsg);
      showError(errorMsg);
      console.error("Error fetching recent assets:", err);
    } finally {
      setLoading(false);
      if (!silent) {
        setTimeout(() => {
          setRefreshing(false);
        }, 500);
      }
    }
  };

  useEffect(() => {
    // Register as loading and fetch on mount (silent mode = no loading spinner)
    startLoading("recent-assets");

    // Check cache first
    if (cachedAssets) {
      setAssets(cachedAssets);
      setLoading(false);
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("recent-assets");
      }
    } else {
      fetchRecentAssets(true);
    }

    // Background refresh every 2 minutes (silent)
    const interval = setInterval(() => {
      console.log("Auto-refreshing recent assets...");
      fetchRecentAssets(true);
    }, 2 * 60 * 1000);

    return () => {
      clearInterval(interval);
      // Don't finish loading on unmount - that happens when data is fetched
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for external refresh triggers (e.g., when a run finishes)
  useEffect(() => {
    if (refreshTrigger > 0) {
      console.log(
        "External refresh trigger received, updating recent assets..."
      );
      fetchRecentAssets(true);
    }
  }, [refreshTrigger]);

  // Listen for assetReplaced events (when assets are marked as resolved/unresolved)
  useEffect(() => {
    const handleAssetReplaced = () => {
      console.log(
        "Asset replaced/unresolve event received, refreshing recent assets..."
      );
      fetchRecentAssets(true);
    };

    window.addEventListener("assetReplaced", handleAssetReplaced);

    return () => {
      window.removeEventListener("assetReplaced", handleAssetReplaced);
    };
  }, []);

  const handleAssetCountChange = (newCount) => {
    // Ensure count is between 5 and 10
    const validCount = Math.min(Math.max(newCount, 5), 10);
    setAssetCount(validCount);
    localStorage.setItem("recent-assets-count", validCount.toString());
    // Reset offset when changing count
    setPageOffset(0);
    localStorage.setItem(`recent-assets-offset-${activeTab}`, "0");
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem("recent-assets-tab", tab);
    // Load offset for this tab or reset to 0
    const savedOffset = localStorage.getItem(`recent-assets-offset-${tab}`);
    setPageOffset(savedOffset ? parseInt(savedOffset) : 0);
  };

  const handlePageChange = (direction) => {
    const filteredAssets = filterAssetsByTab(assets);
    const maxOffset = Math.max(0, filteredAssets.length - assetCount);

    let newOffset = pageOffset;
    if (direction === "prev") {
      newOffset = Math.max(0, pageOffset - assetCount);
    } else if (direction === "next") {
      newOffset = Math.min(maxOffset, pageOffset + assetCount);
    }

    setPageOffset(newOffset);
    localStorage.setItem(
      `recent-assets-offset-${activeTab}`,
      newOffset.toString()
    );
  };

  // Filter assets based on active tab
  const filterAssetsByTab = (assetList) => {
    if (activeTab === "All") {
      return assetList;
    }

    return assetList.filter((asset) => {
      const type = asset.type?.toLowerCase() || "";

      switch (activeTab) {
        case "Posters":
          return type === "movie" || type === "poster" || type === "show";
        case "Backgrounds":
          return type.includes("background");
        case "Seasons":
          return type === "season";
        case "TitleCards":
          return (
            type === "episode" || type === "titlecard" || type === "title_card"
          );
        default:
          return true;
      }
    });
  };

  const getTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case "movie":
      case "poster":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "show":
        return "bg-purple-500/20 text-purple-400 border-purple-500/50";
      case "season":
        return "bg-indigo-500/20 text-indigo-400 border-indigo-500/50";
      case "episode":
      case "titlecard":
      case "title_card":
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/50";
      case "background":
        return "bg-pink-500/20 text-pink-400 border-pink-500/50";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  const getTypeLabel = (type) => {
    switch (type?.toLowerCase()) {
      case "titlecard":
      case "title_card":
        return "Episode";
      default:
        return type;
    }
  };

  // Get the media type label (Movie, Show, Season, Episode, Background)
  const getMediaTypeLabel = (asset) => {
    const type = asset.type?.toLowerCase() || "";

    switch (type) {
      case "movie":
      case "poster":
        return "Movie";
      case "show":
        return "Show";
      case "season":
        return "Season";
      case "episode":
      case "titlecard":
      case "title_card":
        return "Episode";
      case "background":
        return "Background";
      default:
        return "Asset";
    }
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Unknown";

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "Unknown";

      // Format: "Oct 29, 2025 at 3:45 PM"
      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      };

      return date.toLocaleString("en-US", options);
    } catch (e) {
      return "Unknown";
    }
  };

  // Determine if asset should use landscape aspect ratio
  const isLandscapeAsset = (type) => {
    const typeStr = type?.toLowerCase() || "";
    // Check for any background or titlecard/episode types
    const landscapeTypes = ["background", "episode", "titlecard", "title_card"];
    const isLandscape =
      landscapeTypes.some((t) => typeStr.includes(t)) ||
      typeStr.includes("background");
    return isLandscape;
  };

  const getLanguageColor = (language) => {
    if (language === "Textless") {
      return "bg-green-500/20 text-green-400 border-green-500/50";
    }
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  };

  // Get the assets to display based on slider value, active tab, and pagination
  const filteredAssets = filterAssetsByTab(assets);
  const displayedAssets = filteredAssets.slice(
    pageOffset,
    pageOffset + assetCount
  );

  // Calculate pagination info
  const totalPages = Math.ceil(filteredAssets.length / assetCount);
  const currentPage = Math.floor(pageOffset / assetCount) + 1;
  const hasPrevPage = pageOffset > 0;
  const hasNextPage = pageOffset + assetCount < filteredAssets.length;

  // Tab configuration - dynamically filter tabs based on available assets
  const allTabs = [
    { id: "All", label: "All" },
    { id: "Posters", label: "Posters" },
    { id: "Backgrounds", label: "Backgrounds" },
    { id: "Seasons", label: "Seasons" },
    { id: "TitleCards", label: "TitleCards" },
  ];

  // Filter tabs to only show those with assets
  const tabs = allTabs.filter((tab) => {
    if (tab.id === "All") {
      return assets.length > 0; // Always show "All" if there are any assets
    }
    // Count how many assets match this tab
    const tabAssets = assets.filter((asset) => {
      const type = asset.type?.toLowerCase() || "";
      switch (tab.id) {
        case "Posters":
          return type === "movie" || type === "poster" || type === "show";
        case "Backgrounds":
          return type.includes("background");
        case "Seasons":
          return type === "season";
        case "TitleCards":
          return (
            type === "episode" || type === "titlecard" || type === "title_card"
          );
        default:
          return false;
      }
    });
    return tabAssets.length > 0; // Only show tab if it has assets
  });

  // Don't render the card if there are no assets and not loading
  if (!loading && assets.length === 0) {
    return null;
  }

  return (
    <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
          <div className="p-2 rounded-lg bg-theme-primary/10">
            <FileImage className="w-5 h-5 text-theme-primary" />
          </div>
          {t("dashboard.recentAssets")}
        </h2>

        <div className="flex items-center gap-3">
          {/* Compact Image Size Slider */}
          <CompactImageSizeSlider
            value={assetCount}
            onChange={handleAssetCountChange}
            storageKey="recent-assets-count"
            min={5}
            max={10}
          />

          {/* Refresh Button - SystemInfo Style */}
          <button
            onClick={() => fetchRecentAssets()}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
            title={t("recentAssets.refreshTooltip")}
          >
            <RefreshCw
              className={`w-5 h-5 text-theme-primary ${
                refreshing ? "animate-spin" : ""
              }`}
            />
            <span className="text-sm font-medium">{t("common.refresh")}</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-theme-border scrollbar-track-transparent">
        {tabs.map((tab) => {
          const tabFilteredCount = filterAssetsByTab(assets).length;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap
                ${
                  isActive
                    ? "bg-theme-primary text-white shadow-lg"
                    : "bg-theme-bg text-theme-muted hover:text-theme-text hover:bg-theme-hover border border-theme"
                }
              `}
            >
              <span>{tab.label}</span>
              {isActive && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs font-semibold">
                  {tab.id === "All"
                    ? assets.length
                    : filterAssetsByTab(assets).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading && assets.length === 0 ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
        </div>
      ) : error && assets.length === 0 ? (
        <div className="text-center py-8 text-red-400">
          <p>Error: {error}</p>
          <button
            onClick={() => fetchRecentAssets()}
            className="mt-4 px-4 py-2 bg-theme-primary/20 hover:bg-theme-primary/30 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      ) : displayedAssets.length === 0 ? (
        <div className="text-center py-8 text-theme-muted">
          <FileImage className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>{t("recentAssets.noAssets")}</p>
        </div>
      ) : (
        <>
          {/* Flexible Grid - All posters visible in one row, responsive */}
          <div className="w-full overflow-x-auto">
            <div
              className="poster-grid"
              style={{
                "--poster-count": assetCount,
              }}
            >
              {displayedAssets.map((asset, index) => (
                <div
                  key={index}
                  onClick={() => setSelectedAsset(asset)}
                  className="bg-theme-bg rounded-lg overflow-hidden border border-theme hover:border-theme-primary transition-all group flex flex-col cursor-pointer"
                >
                  {/* Poster/Background Image - Dynamic Aspect Ratio */}
                  <div
                    className={`relative bg-theme-dark flex-shrink-0 ${
                      isLandscapeAsset(asset.type)
                        ? "aspect-[16/9]"
                        : "aspect-[2/3]"
                    }`}
                  >
                    {asset.has_poster ? (
                      <img
                        src={asset.poster_url}
                        alt={asset.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.parentElement.innerHTML = `
                            <div class="w-full h-full flex items-center justify-center bg-theme-dark">
                              <svg class="w-12 h-12 text-theme-muted opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          `;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff className="w-12 h-12 text-theme-muted opacity-50" />
                      </div>
                    )}

                    {/* Provider Link - shows on hover */}
                    {asset.provider_link && (
                      <a
                        href={asset.provider_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                        title="View on provider"
                      >
                        <ExternalLink className="w-4 h-4 text-white" />
                      </a>
                    )}
                  </div>

                  {/* Asset Info */}
                  <div className="p-3 bg-theme-card flex-1 flex flex-col justify-between">
                    <h3
                      className="font-semibold text-theme-text text-sm truncate mb-2"
                      title={asset.title}
                    >
                      {asset.title}
                    </h3>

                    {/* All Badges in one row */}
                    <div className="flex flex-wrap gap-1 mt-auto">
                      {/* Type Badge (Poster/Show/Season/Episode/Background) */}
                      {asset.type && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium border ${getTypeColor(
                            asset.type
                          )}`}
                        >
                          {getTypeLabel(asset.type)}
                        </span>
                      )}

                      {/* Library Badge */}
                      {asset.library && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/50">
                          {asset.library}
                        </span>
                      )}

                      {/* Manual Badge (replaces N/A) */}
                      {asset.is_manually_created && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50">
                          Manual
                        </span>
                      )}

                      {/* Language Badge (only if not manually created) */}
                      {!asset.is_manually_created &&
                        asset.language &&
                        asset.language !== "N/A" && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium border ${getLanguageColor(
                              asset.language
                            )}`}
                          >
                            {asset.language}
                          </span>
                        )}

                      {/* Fallback Badge */}
                      {asset.fallback && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/50">
                          FB
                        </span>
                      )}
                    </div>

                    {/* Source Folder (if from RotatedLogs)
                    {asset.source_folder && (
                      <p
                        className="text-xs text-theme-muted mt-2 truncate"
                        title={asset.source_folder}
                      >
                        📂 {asset.source_folder}
                      </p>
                    )} */}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer with count and pagination */}
          <div className="mt-4 pt-4 border-t border-theme">
            <div className="flex items-center justify-between">
              {/* Left: Count info */}
              <div className="text-sm text-theme-muted">
                Showing {pageOffset + 1}-
                {Math.min(pageOffset + assetCount, filteredAssets.length)} of{" "}
                {filteredAssets.length}{" "}
                {activeTab !== "All" && `${activeTab.toLowerCase()} `}
                {filteredAssets.length === 1 ? "asset" : "assets"}
                {activeTab !== "All" && ` (${assets.length} total)`}
              </div>

              {/* Right: Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange("prev")}
                    disabled={!hasPrevPage}
                    className="p-2 rounded-lg bg-theme-bg hover:bg-theme-hover border border-theme disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4 text-theme-text" />
                  </button>

                  <span className="text-sm text-theme-muted px-3">
                    Page {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => handlePageChange("next")}
                    disabled={!hasNextPage}
                    className="p-2 rounded-lg bg-theme-bg hover:bg-theme-hover border border-theme disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4 text-theme-text" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Asset Details Modal */}
      {selectedAsset && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedAsset(null)}
        >
          <div
            className="relative max-w-7xl max-h-[90vh] bg-theme-card rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedAsset(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col md:flex-row max-h-[90vh]">
              {/* Image */}
              <div className="flex-1 flex items-center justify-center bg-black p-4">
                {selectedAsset.has_poster ? (
                  <img
                    src={selectedAsset.poster_url}
                    alt={selectedAsset.title}
                    className="max-w-full max-h-[80vh] object-contain"
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextSibling.style.display = "flex";
                    }}
                  />
                ) : null}
                <div
                  className="text-center flex-col items-center justify-center"
                  style={{
                    display: selectedAsset.has_poster ? "none" : "flex",
                  }}
                >
                  <div className="p-4 rounded-full bg-theme-primary/20 inline-block mb-4">
                    <ImageOff className="w-16 h-16 text-theme-primary" />
                  </div>
                  <p className="text-white text-lg font-semibold mb-2">
                    Preview Not Available
                  </p>
                  <p className="text-gray-400 text-sm">
                    The image could not be loaded
                  </p>
                </div>
              </div>

              {/* Info Panel */}
              <div className="md:w-80 p-6 bg-theme-card overflow-y-auto">
                <h3 className="text-xl font-bold text-theme-text mb-4">
                  Asset Details
                </h3>

                <div className="space-y-4">
                  {/* Media Type */}
                  <div>
                    <label className="text-sm text-theme-muted">
                      {t("common.mediaType")}
                    </label>
                    <div className="mt-1">
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border text-sm font-medium ${getTypeColor(
                          selectedAsset.type
                        )}`}
                      >
                        {getTypeLabel(selectedAsset.type)}
                      </span>
                    </div>
                  </div>

                  {/* Title/Name */}
                  <div>
                    <label className="text-sm text-theme-muted">
                      {getMediaTypeLabel(selectedAsset) === "Episode"
                        ? "Episode Title"
                        : "Title"}
                    </label>
                    <p className="text-theme-text break-all mt-1">
                      {selectedAsset.title}
                    </p>
                  </div>

                  {/* Timestamps */}
                  <div>
                    <label className="text-sm text-theme-muted flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {t("common.created")}
                    </label>
                    <p className="text-theme-text mt-1 text-sm">
                      {selectedAsset.created
                        ? new Date(selectedAsset.created * 1000).toLocaleString(
                            "en-GB",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            }
                          )
                        : "Unknown"}
                    </p>
                  </div>

                  {selectedAsset.modified && (
                    <div>
                      <label className="text-sm text-theme-muted flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {t("common.modified")}
                      </label>
                      <p className="text-theme-text mt-1 text-sm">
                        {new Date(selectedAsset.modified * 1000).toLocaleString(
                          "en-GB",
                          {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          }
                        )}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-theme-muted flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {t("common.lastViewed")}
                    </label>
                    <p className="text-theme-text mt-1 text-sm">
                      {new Date().toLocaleString("en-GB", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </p>
                  </div>

                  {/* Library */}
                  {selectedAsset.library && (
                    <div>
                      <label className="text-sm text-theme-muted flex items-center gap-1">
                        <Folder className="w-3.5 h-3.5" />
                        Library
                      </label>
                      <p className="text-theme-text mt-1">
                        {selectedAsset.library}
                      </p>
                    </div>
                  )}

                  {/* Path */}
                  <div>
                    <label className="text-sm text-theme-muted flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      {t("common.path")}
                    </label>
                    <p className="text-theme-text text-sm break-all mt-1 font-mono bg-theme-bg p-2 rounded border border-theme">
                      {selectedAsset.rootfolder}
                    </p>
                  </div>

                  {/* Language Badge */}
                  {selectedAsset.language &&
                    selectedAsset.language !== "N/A" && (
                      <div>
                        <label className="text-sm text-theme-muted">
                          Language
                        </label>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border text-sm font-medium ${getLanguageColor(
                              selectedAsset.language
                            )}`}
                          >
                            {selectedAsset.language}
                          </span>
                        </div>
                      </div>
                    )}

                  {/* Additional Badges */}
                  {(selectedAsset.is_manually_created ||
                    selectedAsset.fallback ||
                    selectedAsset.text_truncated) && (
                    <div>
                      <label className="text-sm text-theme-muted">
                        Properties
                      </label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {/* Manual Badge */}
                        {selectedAsset.is_manually_created && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50">
                            Manual
                          </span>
                        )}

                        {/* Fallback Badge */}
                        {selectedAsset.fallback && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/50">
                            Fallback
                          </span>
                        )}

                        {/* Text Truncated Badge */}
                        {selectedAsset.text_truncated && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
                            Text Truncated
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Provider Link Button */}
                  {selectedAsset.provider_link && (
                    <div className="pt-4 border-t border-theme">
                      <a
                        href={selectedAsset.provider_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 text-white rounded-lg transition-all"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on Provider
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Poster Grid Styles */}
      <style jsx>{`
        .poster-grid {
          display: flex;
          gap: 1rem;
          align-items: flex-end;
        }

        /* Cards maintain their natural size */
        .poster-grid > div {
          display: flex;
          flex-direction: column;
          flex: 0 0
            calc(
              (100% - (var(--poster-count) - 1) * 1rem) / var(--poster-count)
            );
          min-width: 0;
        }

        /* Image container maintains aspect ratio */
        .poster-grid > div > div:first-child {
          flex-shrink: 0;
          width: 100%;
        }

        /* Info section */
        .poster-grid > div > div:last-child {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        /* Responsive: Tablet */
        @media (max-width: 1024px) {
          .poster-grid {
            flex-wrap: wrap;
            align-items: flex-start;
          }
          .poster-grid > div {
            flex: 0 0 calc((100% - 3rem) / 4);
            min-width: 180px;
          }
        }

        /* Responsive: Mobile */
        @media (max-width: 640px) {
          .poster-grid > div {
            flex: 0 0 calc((100% - 1rem) / 2);
            min-width: 140px;
          }
        }
      `}</style>
    </div>
  );
}

export default RecentAssets;
