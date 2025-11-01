import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  Image as ImageIcon,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Trash2,
  Eye,
  AlertCircle,
  FolderOpen,
  Film,
  Layers,
  Tv,
  Download,
  LayoutGrid,
  FolderTree,
  Folder,
  ChevronRight,
  Home,
  CheckSquare,
  Square,
  Check,
  Calendar,
  HardDrive,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import ScrollToButtons from "./ScrollToButtons";
import CompactImageSizeSlider from "./CompactImageSizeSlider";

const API_URL = "/api";

function ManualAssets() {
  const { t } = useTranslation();
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [libraries, setLibraries] = useState([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [expandedLibraries, setExpandedLibraries] = useState({});
  const [expandedFolders, setExpandedFolders] = useState({});
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);

  // View mode: 'folder' (default) or 'grid'
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem("manual-assets-view-mode");
    return saved || "folder";
  });

  // Active library filter for grid view
  const [activeLibrary, setActiveLibrary] = useState("all");

  // Navigation state for folder view
  const [currentPath, setCurrentPath] = useState([]); // [libraryName, folderName]
  const [currentLibrary, setCurrentLibrary] = useState(null);
  const [currentFolder, setCurrentFolder] = useState(null);

  // Image size state with localStorage (2-10 range, default 5)
  const [imageSize, setImageSize] = useState(() => {
    const saved = localStorage.getItem("manual-assets-grid-size");
    return saved ? parseInt(saved) : 5;
  });

  // Save view mode to localStorage
  useEffect(() => {
    localStorage.setItem("manual-assets-view-mode", viewMode);
  }, [viewMode]);

  // Save image size to localStorage
  useEffect(() => {
    localStorage.setItem("manual-assets-grid-size", imageSize);
  }, [imageSize]);

  // Grid column classes based on size (2-10 columns)
  const getGridClass = (size) => {
    const classes = {
      2: "grid-cols-2 md:grid-cols-2 lg:grid-cols-2",
      3: "grid-cols-2 md:grid-cols-3 lg:grid-cols-3",
      4: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
      5: "grid-cols-2 md:grid-cols-4 lg:grid-cols-5",
      6: "grid-cols-2 md:grid-cols-4 lg:grid-cols-6",
      7: "grid-cols-2 md:grid-cols-5 lg:grid-cols-7",
      8: "grid-cols-2 md:grid-cols-5 lg:grid-cols-8",
      9: "grid-cols-2 md:grid-cols-6 lg:grid-cols-9",
      10: "grid-cols-2 md:grid-cols-6 lg:grid-cols-10",
    };
    return classes[size] || classes[5];
  };

  // Fetch manual assets
  const fetchAssets = async (showToast = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/manual-assets-gallery`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setLibraries(data.libraries || []);
      setTotalAssets(data.total_assets || 0);

      if (showToast && data.total_assets > 0) {
        showSuccess(
          `Loaded ${data.total_assets} manual asset(s) from ${data.libraries.length} library(ies)`
        );
      }
    } catch (error) {
      console.error("Error fetching manual assets:", error);
      const errorMsg = error.message || "Failed to load manual assets";
      setError(errorMsg);
      showError(errorMsg);
      setLibraries([]);
      setTotalAssets(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  // Toggle library expansion
  const toggleLibrary = (libraryName) => {
    setExpandedLibraries((prev) => ({
      ...prev,
      [libraryName]: !prev[libraryName],
    }));
  };

  // Toggle folder expansion
  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  // Handle asset selection for bulk delete
  const toggleAssetSelection = (assetPath) => {
    setSelectedAssets((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(assetPath)) {
        newSet.delete(assetPath);
      } else {
        newSet.add(assetPath);
      }
      return newSet;
    });
  };

  // Select all assets in view
  const selectAllAssets = () => {
    const allAssets = new Set();
    libraries.forEach((library) => {
      library.folders.forEach((folder) => {
        folder.assets.forEach((asset) => {
          if (matchesSearch(asset, folder, library)) {
            allAssets.add(asset.path);
          }
        });
      });
    });
    setSelectedAssets(allAssets);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedAssets(new Set());
  };

  // Delete single asset
  const deleteAsset = async (assetPath, assetName) => {
    if (!confirm(`Are you sure you want to delete "${assetName}"?`)) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/manual-assets/${encodeURIComponent(assetPath)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete asset");
      }

      showSuccess(`Deleted "${assetName}"`);
      fetchAssets(); // Refresh list
    } catch (error) {
      showError(`Failed to delete: ${error.message}`);
    }
  };

  // Bulk delete assets
  const bulkDeleteAssets = async () => {
    if (selectedAssets.size === 0) {
      showError("No assets selected");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete ${selectedAssets.size} asset(s)?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/manual-assets/bulk-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paths: Array.from(selectedAssets),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete assets");
      }

      const data = await response.json();
      if (data.failed && data.failed.length > 0) {
        showError(
          `Deleted ${data.deleted.length} asset(s). ${data.failed.length} failed.`
        );
      } else {
        showSuccess(`Successfully deleted ${data.deleted.length} asset(s)`);
      }

      clearSelection();
      setBulkDeleteMode(false);
      fetchAssets(); // Refresh list
    } catch (error) {
      showError(`Bulk delete failed: ${error.message}`);
    }
  };

  // Check if asset matches search query
  const matchesSearch = (asset, folder, library) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      asset.name.toLowerCase().includes(query) ||
      folder.name.toLowerCase().includes(query) ||
      library.name.toLowerCase().includes(query) ||
      asset.type.toLowerCase().includes(query)
    );
  };

  // Get asset type icon
  const getAssetTypeIcon = (type) => {
    switch (type) {
      case "poster":
        return <ImageIcon className="w-4 h-4" />;
      case "background":
        return <Layers className="w-4 h-4" />;
      case "season":
        return <Film className="w-4 h-4" />;
      case "titlecard":
        return <Tv className="w-4 h-4" />;
      default:
        return <ImageIcon className="w-4 h-4" />;
    }
  };

  // Get asset type badge color
  const getAssetTypeBadgeColor = (type) => {
    switch (type) {
      case "poster":
        return "bg-theme-primary/20 text-theme-primary border-theme-primary/30";
      case "background":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "season":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "titlecard":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      default:
        return "bg-theme-muted/20 text-theme-muted border-theme-muted/30";
    }
  };

  // Get asset aspect ratio based on type
  const getAssetAspectRatio = (type) => {
    switch (type) {
      case "background":
      case "titlecard":
        return "aspect-[16/9]"; // Landscape for backgrounds and title cards
      case "poster":
      case "season":
      default:
        return "aspect-[2/3]"; // Portrait for posters and seasons
    }
  };

  // Helper function to get media type label
  const getMediaTypeLabel = (type) => {
    switch (type) {
      case "poster":
        return "Movie";
      case "background":
        return "Background";
      case "season":
        return "Season";
      case "titlecard":
        return "Episode";
      default:
        return "Asset";
    }
  };

  // Get color for media type badge
  const getMediaTypeColor = (type) => {
    switch (type) {
      case "poster":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "background":
        return "bg-pink-500/20 text-pink-400 border-pink-500/50";
      case "season":
        return "bg-indigo-500/20 text-indigo-400 border-indigo-500/50";
      case "titlecard":
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/50";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  // Format timestamp for display
  const formatTimestamp = () => {
    try {
      return new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch (e) {
      return "Unknown";
    }
  };

  // Flatten all assets for grid view
  const getAllAssets = () => {
    const allAssets = [];
    libraries.forEach((library) => {
      library.folders.forEach((folder) => {
        folder.assets.forEach((asset) => {
          if (matchesSearch(asset, folder, library)) {
            // Filter by active library in grid view
            if (activeLibrary === "all" || library.name === activeLibrary) {
              allAssets.push({
                ...asset,
                libraryName: library.name,
                folderName: folder.name,
              });
            }
          }
        });
      });
    });
    return allAssets;
  };

  // Folder view navigation
  const navigateHome = () => {
    setCurrentPath([]);
    setCurrentLibrary(null);
    setCurrentFolder(null);
    setSearchQuery("");
  };

  const navigateToLibrary = (libraryName) => {
    setCurrentPath([libraryName]);
    setCurrentLibrary(libraryName);
    setCurrentFolder(null);
    setSearchQuery("");
  };

  const navigateToFolder = (libraryName, folderName) => {
    setCurrentPath([libraryName, folderName]);
    setCurrentLibrary(libraryName);
    setCurrentFolder(folderName);
    setSearchQuery("");
  };

  const navigateToLevel = (level) => {
    if (level === 0) {
      navigateHome();
    } else if (level === 1 && currentPath[0]) {
      navigateToLibrary(currentPath[0]);
    }
  };

  // Get current view data for folder view
  const getCurrentViewData = () => {
    if (currentPath.length === 0) {
      // Show libraries
      return {
        type: "libraries",
        items: libraries.filter((lib) =>
          lib.name.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      };
    } else if (currentPath.length === 1) {
      // Show folders in library
      const library = libraries.find((lib) => lib.name === currentPath[0]);
      if (!library) return { type: "folders", items: [] };
      return {
        type: "folders",
        items: library.folders.filter((folder) =>
          folder.name.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      };
    } else if (currentPath.length === 2) {
      // Show assets in folder
      const library = libraries.find((lib) => lib.name === currentPath[0]);
      if (!library) return { type: "assets", items: [] };
      const folder = library.folders.find((f) => f.name === currentPath[1]);
      if (!folder) return { type: "assets", items: [] };
      return {
        type: "assets",
        items: folder.assets.filter((asset) =>
          asset.name.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      };
    }
    return { type: "libraries", items: [] };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">Loading manual assets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-400" />
          <div>
            <h3 className="text-lg font-semibold text-red-400">
              Error Loading Manual Assets
            </h3>
            <p className="text-red-300/80">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScrollToButtons />

      {/* View Mode Card */}
      <div className="bg-theme-card border border-theme-border rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-theme-text mb-1">
              View Mode
            </h3>
            <p className="text-xs sm:text-sm text-theme-muted">
              {viewMode === "folder"
                ? "Browse assets by navigating through libraries and folders"
                : "Browse all assets by type (posters, backgrounds, seasons, titlecards)"}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-all shadow-sm ${
                viewMode === "grid"
                  ? "bg-theme-primary text-white border-2 border-theme-primary"
                  : "bg-theme-card hover:bg-theme-hover border border-theme-border hover:border-theme-primary/50 text-theme-text"
              }`}
            >
              <LayoutGrid className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                Grid View
              </span>
            </button>
            <button
              onClick={() => setViewMode("folder")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-all shadow-sm ${
                viewMode === "folder"
                  ? "bg-theme-primary text-white border-2 border-theme-primary"
                  : "bg-theme-card hover:bg-theme-hover border border-theme-border hover:border-theme-primary/50 text-theme-text"
              }`}
            >
              <FolderTree className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                Folder View
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid View - Folders and Controls */}
      {viewMode === "grid" && totalAssets > 0 && (
        <div className="bg-theme-card rounded-lg border border-theme-border p-3 sm:p-4">
          {/* Header with Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-theme-text flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-theme-primary" />
              Folders
            </h2>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Compact Image Size Slider */}
              <CompactImageSizeSlider
                value={imageSize}
                onChange={setImageSize}
                storageKey="manual-assets-grid-size"
              />
              {/* Select Mode Toggle */}
              <button
                onClick={() => {
                  setBulkDeleteMode(!bulkDeleteMode);
                  if (bulkDeleteMode) clearSelection();
                }}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg ${
                  bulkDeleteMode
                    ? "bg-orange-600 hover:bg-orange-700 text-white"
                    : "bg-theme-primary hover:bg-theme-primary/90 text-white"
                }`}
              >
                {bulkDeleteMode ? (
                  <>
                    <Square className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span className="hidden sm:inline">Cancel Select</span>
                    <span className="sm:hidden">Cancel</span>
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                    <span>Select</span>
                  </>
                )}
              </button>
              {/* Refresh Button */}
              <button
                onClick={() => fetchAssets(true)}
                disabled={loading}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme-border hover:border-theme-primary/50 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-theme-text text-sm font-medium transition-all shadow-sm"
              >
                <RefreshCw
                  className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 text-theme-primary ${
                    loading ? "animate-spin" : ""
                  }`}
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Library Folder Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setActiveLibrary("all")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shadow-sm ${
                activeLibrary === "all"
                  ? "bg-theme-primary text-white scale-105 border-2 border-theme-primary"
                  : "bg-theme-card text-theme-text hover:bg-theme-hover border border-theme-border hover:border-theme-primary/50 hover:scale-105"
              }`}
            >
              <Folder className="w-4 h-4 flex-shrink-0" />
              <span>All Libraries</span>
              <span className="ml-1 px-2 py-0.5 bg-black/20 rounded-full text-xs font-semibold">
                {libraries.reduce(
                  (sum, lib) =>
                    sum + lib.folders.reduce((s, f) => s + f.asset_count, 0),
                  0
                )}
              </span>
            </button>
            {libraries.map((library) => (
              <button
                key={library.name}
                onClick={() => setActiveLibrary(library.name)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shadow-sm ${
                  activeLibrary === library.name
                    ? "bg-theme-primary text-white scale-105 border-2 border-theme-primary"
                    : "bg-theme-card text-theme-text hover:bg-theme-hover border border-theme-border hover:border-theme-primary/50 hover:scale-105"
                }`}
              >
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-none">
                  {library.name}
                </span>
                <span className="ml-1 px-2 py-0.5 bg-black/20 rounded-full text-xs font-semibold">
                  {library.folders.reduce((sum, f) => sum + f.asset_count, 0)}
                </span>
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-theme-bg border border-theme-primary/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-primary text-base text-theme-text"
            />
          </div>

          {/* Bulk Delete Controls - Show when select mode is active */}
          {bulkDeleteMode && (
            <div className="flex items-center gap-2 pt-2 border-t border-theme-border">
              <button
                onClick={selectAllAssets}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium text-sm"
              >
                <CheckSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Select All</span>
              </button>
              <button
                onClick={clearSelection}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={selectedAssets.size === 0}
              >
                <Square className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
                <span className="sm:hidden">({selectedAssets.size})</span>
                <span className="hidden sm:inline">
                  ({selectedAssets.size})
                </span>
              </button>
              {selectedAssets.size > 0 && (
                <button
                  onClick={bulkDeleteAssets}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-medium shadow-lg text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete ({selectedAssets.size})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Assets List */}
      {totalAssets === 0 ? (
        <div className="bg-theme-card border border-theme rounded-lg p-12 text-center">
          <FolderOpen className="w-16 h-16 text-theme-muted mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-theme-text mb-2">
            No Manual Assets Found
          </h3>
          <p className="text-theme-muted">
            Assets saved without overlay processing will appear here.
            <br />
            Use the Asset Replacer with the overlay toggle OFF to save assets to
            the manualassets/ folder.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid View - Assets Grid */
        <div className="bg-theme-card border border-theme rounded-lg p-4">
          <div className={`grid ${getGridClass(imageSize)} gap-4`}>
            {getAllAssets().map((asset) => (
              <div
                key={asset.path}
                className={`relative group bg-theme-card border rounded-lg overflow-hidden transition-all hover:border-theme-primary/50 ${
                  bulkDeleteMode && selectedAssets.has(asset.path)
                    ? "ring-2 ring-theme-primary"
                    : "border-theme"
                }`}
              >
                {/* Selection Checkbox (Bulk Delete Mode) */}
                {bulkDeleteMode && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedAssets.has(asset.path)}
                      onChange={() => toggleAssetSelection(asset.path)}
                      className="w-5 h-5 rounded border-2 border-theme-primary bg-theme-card cursor-pointer"
                    />
                  </div>
                )}

                {/* Image */}
                <div
                  className={`${getAssetAspectRatio(
                    asset.type
                  )} bg-theme-darker relative cursor-pointer`}
                  onClick={() => {
                    if (bulkDeleteMode) {
                      toggleAssetSelection(asset.path);
                    } else {
                      setSelectedImage(asset);
                    }
                  }}
                >
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-8 h-8 text-white" />
                  </div>
                </div>

                {/* Asset Info */}
                <div className="p-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div
                      className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${getAssetTypeBadgeColor(
                        asset.type
                      )}`}
                    >
                      {getAssetTypeIcon(asset.type)}
                      <span className="capitalize">{asset.type}</span>
                    </div>
                  </div>
                  <p className="text-xs text-theme-text font-medium truncate mb-1">
                    {asset.name}
                  </p>
                  <p className="text-xs text-theme-muted truncate mb-1">
                    {asset.libraryName} / {asset.folderName}
                  </p>
                  <p className="text-xs text-theme-muted">
                    {(asset.size / 1024).toFixed(0)} KB
                  </p>

                  {/* Actions */}
                  {!bulkDeleteMode && (
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={() => setSelectedImage(asset)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-theme-bg hover:bg-theme-hover border border-theme rounded text-xs transition-all"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                      <button
                        onClick={() => deleteAsset(asset.path, asset.name)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded text-xs transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Folder View */
        <>
          {/* Breadcrumb Navigation */}
          <div className="bg-theme-card border border-theme-border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={navigateHome}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                  currentPath.length === 0
                    ? "bg-theme-primary text-white scale-105"
                    : "bg-theme-hover hover:bg-theme-primary/70 border border-theme-border text-theme-text"
                }`}
              >
                <Home className="w-4 h-4" />
                <span>Assets</span>
              </button>

              {currentPath.map((pathPart, index) => (
                <React.Fragment key={index}>
                  <ChevronRight className="w-4 h-4 text-theme-muted" />
                  <button
                    onClick={() => navigateToLevel(index + 1)}
                    className={`px-3 py-2 rounded-lg transition-all text-sm font-medium ${
                      index === currentPath.length - 1
                        ? "bg-theme-primary text-white scale-105"
                        : "bg-theme-hover hover:bg-theme-primary/70 border border-theme-border text-theme-text"
                    }`}
                  >
                    {pathPart}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Search and Controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
                  <input
                    type="text"
                    placeholder={
                      currentPath.length === 0
                        ? "Search libraries..."
                        : currentPath.length === 1
                        ? "Search items..."
                        : "Search assets..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-theme-bg border border-theme-primary/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-primary text-sm text-theme-text"
                  />
                </div>
              </div>

              {/* Image Size Slider (only when showing assets) */}
              {currentPath.length === 2 && (
                <CompactImageSizeSlider
                  value={imageSize}
                  onChange={setImageSize}
                  min={2}
                  max={10}
                />
              )}

              {/* Select Mode Controls */}
              {currentPath.length === 2 && (
                <>
                  {bulkDeleteMode && (
                    <>
                      <button
                        onClick={selectAllAssets}
                        className="flex items-center gap-2 px-4 py-2 bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium text-sm"
                      >
                        <CheckSquare className="w-5 h-5" />
                        Select All
                      </button>
                      <button
                        onClick={clearSelection}
                        className="flex items-center gap-2 px-4 py-2 bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={selectedAssets.size === 0}
                      >
                        <Square className="w-5 h-5" />
                        Deselect All
                      </button>
                      {selectedAssets.size > 0 && (
                        <button
                          onClick={bulkDeleteAssets}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-medium shadow-lg text-sm"
                        >
                          <Trash2 className="w-5 h-5" />
                          Delete ({selectedAssets.size})
                        </button>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => {
                      setBulkDeleteMode(!bulkDeleteMode);
                      if (bulkDeleteMode) clearSelection();
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-lg text-sm ${
                      bulkDeleteMode
                        ? "bg-orange-600 hover:bg-orange-700 text-white"
                        : "bg-theme-primary hover:bg-theme-primary/90 text-white"
                    }`}
                  >
                    {bulkDeleteMode ? (
                      <>
                        <Square className="w-5 h-5" />
                        Cancel Select
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-5 h-5" />
                        Select
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                onClick={() => fetchAssets(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme-border hover:border-theme-primary/50 rounded-lg text-theme-text font-medium transition-all shadow-sm text-sm"
              >
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 text-theme-primary" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          {(() => {
            const viewData = getCurrentViewData();

            if (viewData.type === "libraries") {
              // Show library folders
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {viewData.items.map((library) => (
                    <button
                      key={library.name}
                      onClick={() => navigateToLibrary(library.name)}
                      className="group relative bg-theme-card border border-theme-border rounded-lg p-4 transition-all text-left shadow-sm hover:shadow-md hover:border-theme-primary"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-3 rounded-lg border border-theme-border group-hover:bg-theme-primary group-hover:border-theme-primary transition-colors">
                          <Folder className="w-6 h-6 text-theme-muted group-hover:text-white transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-theme-text truncate mb-1">
                            {library.name}
                          </h3>
                          <div className="text-xs text-theme-muted space-y-1">
                            <div>
                              Total:{" "}
                              {library.folders.reduce(
                                (sum, f) => sum + f.asset_count,
                                0
                              )}{" "}
                              assets
                            </div>
                            <div>
                              Posters:{" "}
                              {library.folders.reduce(
                                (sum, f) =>
                                  sum +
                                  f.assets.filter((a) => a.type === "poster")
                                    .length,
                                0
                              )}
                            </div>
                            <div>
                              Backgrounds:{" "}
                              {library.folders.reduce(
                                (sum, f) =>
                                  sum +
                                  f.assets.filter(
                                    (a) => a.type === "background"
                                  ).length,
                                0
                              )}
                            </div>
                            <div>
                              Seasons:{" "}
                              {library.folders.reduce(
                                (sum, f) =>
                                  sum +
                                  f.assets.filter((a) => a.type === "season")
                                    .length,
                                0
                              )}
                            </div>
                            <div>
                              Episodes:{" "}
                              {library.folders.reduce(
                                (sum, f) =>
                                  sum +
                                  f.assets.filter((a) => a.type === "titlecard")
                                    .length,
                                0
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            } else if (viewData.type === "folders") {
              // Show item folders
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {viewData.items.map((folder) => (
                    <button
                      key={folder.path}
                      onClick={() =>
                        navigateToFolder(currentPath[0], folder.name)
                      }
                      className="group relative bg-theme-card border border-theme-border rounded-lg p-4 transition-all text-left shadow-sm hover:shadow-md hover:border-theme-primary"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-3 rounded-lg border border-theme-border group-hover:bg-theme-primary group-hover:border-theme-primary transition-colors">
                          <Folder className="w-6 h-6 text-theme-muted group-hover:text-white transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-theme-text truncate mb-1">
                            {folder.name}
                          </h3>
                          <div className="text-xs text-theme-muted">
                            {folder.asset_count} assets
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            } else {
              // Show assets grid
              return (
                <div className={`grid ${getGridClass(imageSize)} gap-4`}>
                  {viewData.items.map((asset) => (
                    <div
                      key={asset.path}
                      className={`relative group bg-theme-card border rounded-lg overflow-hidden transition-all shadow-sm hover:shadow-md ${
                        bulkDeleteMode && selectedAssets.has(asset.path)
                          ? "ring-2 ring-theme-primary border-theme-primary"
                          : "border-theme-border hover:border-theme-primary/50"
                      }`}
                    >
                      {/* Selection Checkbox (Bulk Delete Mode) */}
                      {bulkDeleteMode && (
                        <div className="absolute top-2 left-2 z-10">
                          <div
                            className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-all ${
                              selectedAssets.has(asset.path)
                                ? "bg-theme-primary border-theme-primary"
                                : "bg-white/90 border-gray-300"
                            }`}
                            onClick={() => toggleAssetSelection(asset.path)}
                          >
                            {selectedAssets.has(asset.path) && (
                              <Check className="w-4 h-4 text-white" />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Image */}
                      <div
                        className={`${getAssetAspectRatio(
                          asset.type
                        )} bg-gradient-to-br from-theme-bg to-theme-darker relative cursor-pointer overflow-hidden`}
                        onClick={() => {
                          if (bulkDeleteMode) {
                            toggleAssetSelection(asset.path);
                          } else {
                            setSelectedImage(asset);
                          }
                        }}
                      >
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="w-6 h-6 text-white drop-shadow-lg" />
                        </div>
                      </div>

                      {/* Asset Info */}
                      <div className="p-2.5">
                        <p className="text-xs text-theme-text font-semibold truncate mb-1">
                          {asset.name}
                        </p>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-theme-muted">
                            {(asset.size / 1024).toFixed(0)} KB
                          </span>
                          <div
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${getAssetTypeBadgeColor(
                              asset.type
                            )}`}
                          >
                            {getAssetTypeIcon(asset.type)}
                            <span className="capitalize text-xs">
                              {asset.type}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        {!bulkDeleteMode && (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setSelectedImage(asset)}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-theme-primary/10 hover:bg-theme-primary/20 border border-theme-primary/30 text-theme-primary rounded text-xs font-medium transition-all"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </button>
                            <button
                              onClick={() =>
                                deleteAsset(asset.path, asset.name)
                              }
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded text-xs font-medium transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
          })()}
        </>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-7xl max-h-[90vh] bg-theme-card rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col md:flex-row max-h-[90vh]">
              {/* Image */}
              <div className="flex-1 flex items-center justify-center bg-black p-4">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.name}
                  className="max-w-full max-h-[80vh] object-contain"
                />
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
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border text-sm font-medium ${getMediaTypeColor(
                          selectedImage.type
                        )}`}
                      >
                        {t(
                          `common.${getMediaTypeLabel(
                            selectedImage.type
                          ).toLowerCase()}`
                        )}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-theme-muted">Name</label>
                    <p className="text-theme-text break-all mt-1">
                      {selectedImage.name}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-theme-muted">Type</label>
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium mt-1 ${getAssetTypeBadgeColor(
                        selectedImage.type
                      )}`}
                    >
                      {getAssetTypeIcon(selectedImage.type)}
                      <span className="capitalize">{selectedImage.type}</span>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div>
                    <label className="text-sm text-theme-muted flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {t("common.lastViewed")}
                    </label>
                    <p className="text-theme-text mt-1 text-sm">
                      {formatTimestamp()}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-theme-muted flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      {t("common.path")}
                    </label>
                    <p className="text-theme-text text-sm break-all mt-1 font-mono bg-theme-bg p-2 rounded border border-theme">
                      {selectedImage.path}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-theme-muted">
                      {t("common.size")}
                    </label>
                    <p className="text-theme-text mt-1">
                      {(selectedImage.size / 1024).toFixed(2)} KB
                    </p>
                  </div>

                  <div className="pt-4 border-t border-theme space-y-2">
                    <a
                      href={selectedImage.url}
                      download={selectedImage.name}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 text-white rounded-lg transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${selectedImage.name}"? This cannot be undone.`
                          )
                        ) {
                          deleteAsset(selectedImage.path, selectedImage.name);
                          setSelectedImage(null);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManualAssets;
