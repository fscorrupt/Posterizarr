import React, { useState, useEffect } from "react";
import {
  X,
  Upload,
  RefreshCw,
  Download,
  Check,
  Star,
  Image as ImageIcon,
} from "lucide-react";
import Notification from "./Notification";

const API_URL = "/api";

function AssetReplacer({ asset, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState({ tmdb: [], tvdb: [], fanart: [] });
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState("upload");

  // Extract metadata from asset
  const extractMetadata = () => {
    // Try to extract IDs from path/filename
    // Format: "Movie Name (Year) {tmdb-12345}" or "{tvdb-67890}"
    const tmdbMatch = asset.path?.match(/\{tmdb-(\d+)\}/);
    const tvdbMatch = asset.path?.match(/\{tvdb-(\d+)\}/);

    // Extract title and year from path
    // Format examples: "Movie Name (2024) {tmdb-12345}" or "Show Name (2020) {tvdb-67890}"
    let title = null;
    let year = null;

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
      const pathSegments = asset.path?.split(/[\/\\]/).filter(Boolean);

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
          // Extract title and year from show folder: "Show Name (2020) {tvdb-123}"
          const showMatch = showFolder.match(/^(.+?)\s*\((\d{4})\)\s*\{/);
          if (showMatch) {
            title = showMatch[1].trim();
            year = parseInt(showMatch[2]);
          } else {
            // Fallback: clean the folder name
            title = showFolder
              .replace(/\s*\(\d{4}\)\s*/, "")
              .replace(/\s*\{[^}]+\}\s*/, "")
              .trim();

            // Try to extract year separately
            const yearMatch = showFolder.match(/\((\d{4})\)/);
            if (yearMatch) {
              year = parseInt(yearMatch[1]);
            }
          }
        }
      }
    } else {
      // For movies/posters/backgrounds: extract from the main folder/file
      // Try to extract title and year from common patterns
      const titleYearMatch = asset.path?.match(
        /[\/\\]([^\/\\]+?)\s*\((\d{4})\)\s*\{/
      );
      if (titleYearMatch) {
        title = titleYearMatch[1].trim();
        year = parseInt(titleYearMatch[2]);
      } else {
        // Fallback: Try just year in parentheses
        const yearMatch = asset.path?.match(/\((\d{4})\)/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }

        // Try to extract title from last folder/file segment
        const pathSegments = asset.path?.split(/[\/\\]/).filter(Boolean);
        if (pathSegments && pathSegments.length > 0) {
          const lastSegment = pathSegments[pathSegments.length - 1];
          // Remove year, ID tags, and file extension
          const cleanTitle = lastSegment
            .replace(/\s*\(\d{4}\)\s*/, "")
            .replace(/\s*\{[^}]+\}\s*/, "")
            .replace(/\.[^.]+$/, "")
            .trim();
          if (cleanTitle) {
            title = cleanTitle;
          }
        }
      }
    }

    // Determine media type
    const isMovie = asset.path?.includes("4K") || asset.type === "movie";
    const mediaType = isMovie ? "movie" : "tv";

    // Extract season/episode numbers
    const seasonMatch = asset.path?.match(/Season(\d+)/);
    const episodeMatch = asset.path?.match(/S(\d+)E(\d+)/);

    return {
      tmdb_id: tmdbMatch ? tmdbMatch[1] : null,
      tvdb_id: tvdbMatch ? tvdbMatch[1] : null,
      title: title,
      year: year,
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
  const metadata = extractMetadata();
  const useHorizontalLayout =
    metadata.asset_type === "background" || metadata.asset_type === "titlecard";

  // Manual search state - initialize with detected metadata
  const [manualSearch, setManualSearch] = useState(false);
  const [searchTitle, setSearchTitle] = useState(metadata.title || "");
  const [searchYear, setSearchYear] = useState(
    metadata.year ? String(metadata.year) : ""
  );

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

  const fetchPreviews = async () => {
    setLoading(true);
    setError(null);

    try {
      let metadata = extractMetadata();

      // Override with manual search if enabled
      if (manualSearch) {
        if (!searchTitle.trim()) {
          setError("Please enter a title to search for");
          setLoading(false);
          return;
        }
        metadata = {
          ...metadata,
          title: searchTitle.trim(),
          year: searchYear ? parseInt(searchYear) : null,
          tmdb_id: null, // Clear ID to force search by title
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
        setPreviews(data.results);
        setSuccess(
          `Found ${data.total_count} replacement options from ${
            Object.keys(data.results).filter((k) => data.results[k].length > 0)
              .length
          } sources`
        );
        setActiveTab("previews");
      } else {
        setError("Failed to fetch previews");
      }
    } catch (err) {
      setError(`Error fetching previews: ${err.message}`);
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
      setError("Please select an image file");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${API_URL}/assets/upload-replacement?asset_path=${encodeURIComponent(
          asset.path
        )}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (data.success) {
        setSuccess("Asset replaced successfully!");
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1500);
      } else {
        setError("Failed to upload asset");
      }
    } catch (err) {
      setError(`Error uploading file: ${err.message}`);
      console.error("Error uploading file:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleSelectPreview = async (preview) => {
    setUploading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/assets/replace-from-url?asset_path=${encodeURIComponent(
          asset.path
        )}&image_url=${encodeURIComponent(preview.original_url)}`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (data.success) {
        setSuccess("Asset replaced successfully!");
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1500);
      } else {
        setError("Failed to replace asset");
      }
    } catch (err) {
      setError(`Error replacing asset: ${err.message}`);
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
        {/* Notifications */}
        {error && (
          <div className="absolute top-4 right-4 z-10">
            <Notification
              type="error"
              message={error}
              onClose={() => setError(null)}
            />
          </div>
        )}
        {success && (
          <div className="absolute top-4 right-4 z-10">
            <Notification
              type="success"
              message={success}
              onClose={() => setSuccess(null)}
            />
          </div>
        )}

        {/* Header */}
        <div className="border-b border-theme p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <h2 className="text-2xl font-bold text-theme-text flex items-center gap-3">
                <div className="p-2 rounded-lg bg-theme-primary/10">
                  <RefreshCw className="w-6 h-6 text-theme-primary" />
                </div>
                Replace Asset
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
              Upload Custom
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
              Service Previews
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
            <div className="max-w-2xl mx-auto">
              <div className="border-2 border-dashed border-theme rounded-xl p-12 text-center">
                <Upload className="w-16 h-16 text-theme-muted mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-theme-text mb-2">
                  Upload Your Own Image
                </h3>
                <p className="text-theme-muted mb-6">
                  Select a custom image to replace this asset
                </p>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-theme-primary text-white rounded-lg hover:bg-opacity-90 transition-colors cursor-pointer">
                  <Upload className="w-5 h-5" />
                  {uploading ? "Uploading..." : "Choose File"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              <div className="mt-8">
                {/* Manual Search Toggle */}
                <div className="mb-4 flex items-center justify-center gap-2">
                  <label className="flex items-center gap-2 text-theme-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualSearch}
                      onChange={(e) => setManualSearch(e.target.checked)}
                      className="w-4 h-4 rounded border-theme-muted text-theme-primary focus:ring-theme-primary"
                    />
                    <span className="text-sm">Manual search by title</span>
                  </label>
                </div>

                {/* Manual Search Fields */}
                {manualSearch && (
                  <div className="mb-4 bg-theme-card border border-theme rounded-lg p-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-theme-text mb-1">
                        Title *
                      </label>
                      <input
                        type="text"
                        value={searchTitle}
                        onChange={(e) => setSearchTitle(e.target.value)}
                        placeholder="Enter movie/show title..."
                        className="w-full px-3 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-theme-text mb-1">
                        Year (optional)
                      </label>
                      <input
                        type="number"
                        value={searchYear}
                        onChange={(e) => setSearchYear(e.target.value)}
                        placeholder="2024"
                        min="1900"
                        max="2100"
                        className="w-full px-3 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
                      />
                    </div>
                    <p className="text-xs text-theme-muted">
                      This will search for assets instead of using the detected
                      metadata
                    </p>
                  </div>
                )}

                <div className="text-center">
                  <p className="text-theme-muted mb-4">
                    {manualSearch
                      ? "Search for assets:"
                      : "Or fetch from services:"}
                  </p>
                  <button
                    onClick={fetchPreviews}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-theme-hover text-theme-text rounded-lg hover:bg-theme-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-5 h-5" />
                    {loading ? "Loading..." : "Fetch from TMDB/TVDB/Fanart"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "previews" && (
            <div>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mb-4" />
                  <p className="text-theme-muted">
                    Fetching previews from services...
                  </p>
                </div>
              ) : totalPreviews === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-16 h-16 text-theme-muted mx-auto mb-4" />
                  <p className="text-theme-muted mb-4">
                    No previews loaded yet
                  </p>
                  <button
                    onClick={fetchPreviews}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-theme-primary text-white rounded-lg hover:bg-opacity-90 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Fetch Previews
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* TMDB Results */}
                  {previews.tmdb.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-theme-text mb-4 flex items-center gap-2">
                        <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium">
                          TMDB
                        </span>
                        <span className="text-theme-muted text-sm">
                          ({previews.tmdb.length} results)
                        </span>
                      </h3>
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
                    </div>
                  )}

                  {/* TVDB Results */}
                  {previews.tvdb.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-theme-text mb-4 flex items-center gap-2">
                        <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium">
                          TVDB
                        </span>
                        <span className="text-theme-muted text-sm">
                          ({previews.tvdb.length} results)
                        </span>
                      </h3>
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
                    </div>
                  )}

                  {/* Fanart Results */}
                  {previews.fanart.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-theme-text mb-4 flex items-center gap-2">
                        <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-medium">
                          Fanart.tv
                        </span>
                        <span className="text-theme-muted text-sm">
                          ({previews.fanart.length} results)
                        </span>
                      </h3>
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
                    </div>
                  )}
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
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className="group relative bg-theme-hover rounded-lg overflow-hidden border border-theme hover:border-theme-primary transition-all">
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
            className={`w-full h-full object-cover transition-opacity ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <button
            onClick={onSelect}
            disabled={disabled}
            className="px-4 py-2 bg-theme-primary text-white rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Select
          </button>
        </div>
      </div>

      {/* Info badges */}
      <div className="p-2 space-y-1">
        {preview.language && (
          <div className="text-xs px-2 py-1 bg-theme-primary/20 text-theme-primary rounded inline-block">
            {preview.language.toUpperCase()}
          </div>
        )}
        {preview.vote_average > 0 && (
          <div className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded inline-block ml-1">
            <Star className="w-3 h-3 inline mr-1" />
            {preview.vote_average.toFixed(1)}
          </div>
        )}
        {preview.likes > 0 && (
          <div className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded inline-block ml-1">
            ❤️ {preview.likes}
          </div>
        )}
      </div>
    </div>
  );
}

export default AssetReplacer;
