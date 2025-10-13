// RecentAssets.jsx - Improved Version
// - CompactImageSizeSlider (5-10 Assets)
// - Dynamic poster sizing with CSS Grid
// - Single horizontal row, all posters visible
// - Theme-compatible
// - All badges at bottom (no overlay)
// - Cached data with silent background refresh (every 2 minutes)

import React, { useState, useEffect } from "react";
import { FileImage, ExternalLink, RefreshCw, ImageOff } from "lucide-react";
import Notification from "./Notification";
import CompactImageSizeSlider from "./CompactImageSizeSlider";

const API_URL = "/api";

let cachedAssets = null;

function RecentAssets() {
  const [assets, setAssets] = useState(cachedAssets || []);
  const [loading, setLoading] = useState(false); // No initial loading if cached
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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
    }
    setError(null);

    try {
      const response = await fetch(`${API_URL}/recent-assets`);
      const data = await response.json();

      if (data.success) {
        cachedAssets = data.assets; // 🎯 Save to persistent cache
        setAssets(data.assets);
      } else {
        setError(data.error || "Failed to load recent assets");
      }
    } catch (err) {
      setError(err.message);
      console.error("Error fetching recent assets:", err);
    } finally {
      setLoading(false);
      if (!silent) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  };

  useEffect(() => {
    // 🎯 Always fetch on mount (silent mode = no loading spinner)
    fetchRecentAssets(true);

    // 🎯 Background refresh every 2 minutes (silent)
    const interval = setInterval(() => fetchRecentAssets(true), 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleAssetCountChange = (newCount) => {
    // Ensure count is between 5 and 10
    const validCount = Math.min(Math.max(newCount, 5), 10);
    setAssetCount(validCount);
    localStorage.setItem("recent-assets-count", validCount.toString());
  };

  const getTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case "movie":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "show":
        return "bg-purple-500/20 text-purple-400 border-purple-500/50";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  const getLanguageColor = (language) => {
    if (language === "Textless") {
      return "bg-green-500/20 text-green-400 border-green-500/50";
    }
    return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
  };

  // Get the assets to display based on slider value
  const displayedAssets = assets.slice(0, assetCount);

  return (
    <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
      {/* Notification */}
      {error && (
        <Notification
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
          <div className="p-2 rounded-lg bg-theme-primary/10">
            <FileImage className="w-5 h-5 text-theme-primary" />
          </div>
          Recently Created Assets
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
            className="flex items-center gap-2 px-4 py-2 text-theme-muted hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-theme-hover rounded-lg"
            title="Refresh recent assets"
          >
            <RefreshCw
              className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && assets.length === 0 ? (
        <div className="flex justify-center items-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-theme-primary" />
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
          <p>No recent assets found</p>
        </div>
      ) : (
        <>
          {/* Flexible Grid - All posters visible in one row, responsive */}
          <div className="w-full">
            <div
              className="poster-grid gap-4"
              style={{
                "--poster-count": assetCount,
              }}
            >
              {displayedAssets.map((asset, index) => (
                <div
                  key={index}
                  className="bg-theme-bg rounded-lg overflow-hidden border border-theme hover:border-theme-primary transition-all group"
                >
                  {/* Poster Image */}
                  <div className="relative aspect-[2/3] bg-theme-dark">
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
                        className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                        title="View on provider"
                      >
                        <ExternalLink className="w-4 h-4 text-white" />
                      </a>
                    )}
                  </div>

                  {/* Asset Info */}
                  <div className="p-3 bg-theme-card">
                    <h3
                      className="font-semibold text-theme-text text-sm truncate mb-2"
                      title={asset.title}
                    >
                      {asset.title}
                    </h3>

                    {/* All Badges in one row */}
                    <div className="flex flex-wrap gap-1">
                      {/* Type Badge (Movie/Show) */}
                      {asset.type && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium border ${getTypeColor(
                            asset.type
                          )}`}
                        >
                          {asset.type}
                        </span>
                      )}

                      {/* Library Badge */}
                      {asset.library && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-300 border border-gray-500/50">
                          {asset.library}
                        </span>
                      )}

                      {/* Language Badge */}
                      {asset.language && (
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

          {/* Footer with count */}
          <div className="mt-4 pt-4 border-t border-theme text-center text-sm text-theme-muted">
            Showing {displayedAssets.length} of {assets.length} recent{" "}
            {assets.length === 1 ? "asset" : "assets"}
          </div>
        </>
      )}

      {/* Poster Grid Styles */}
      <style jsx>{`
        .poster-grid {
          display: grid;
          grid-template-columns: repeat(var(--poster-count), minmax(0, 1fr));
        }

        /* Responsive: Tablet */
        @media (max-width: 1024px) {
          .poster-grid {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          }
        }

        /* Responsive: Mobile */
        @media (max-width: 640px) {
          .poster-grid {
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          }
        }
      `}</style>
    </div>
  );
}

export default RecentAssets;
