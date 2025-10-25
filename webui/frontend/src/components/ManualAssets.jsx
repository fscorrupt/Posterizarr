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
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import ScrollToButtons from "./ScrollToButtons";

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <FolderOpen className="w-8 h-8 text-theme-primary" />
            <h1 className="text-3xl font-bold text-theme-text">
              Manual Assets
            </h1>
          </div>
          <p className="text-theme-muted mt-2">
            Assets saved without overlay processing (from manualassets/ folder)
          </p>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-theme-muted">
              <span className="font-semibold text-theme-text">
                {totalAssets}
              </span>{" "}
              total asset(s)
            </span>
            <span className="text-theme-muted">
              <span className="font-semibold text-theme-text">
                {libraries.length}
              </span>{" "}
              library(ies)
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {bulkDeleteMode && (
            <>
              <button
                onClick={selectAllAssets}
                className="flex items-center gap-2 px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg text-sm font-medium transition-all"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="flex items-center gap-2 px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={selectedAssets.size === 0}
              >
                Clear ({selectedAssets.size})
              </button>
              <button
                onClick={bulkDeleteAssets}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={selectedAssets.size === 0}
              >
                <Trash2 className="w-4 h-4" />
                Delete ({selectedAssets.size})
              </button>
            </>
          )}
          <button
            onClick={() => {
              setBulkDeleteMode(!bulkDeleteMode);
              if (bulkDeleteMode) clearSelection();
            }}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all ${
              bulkDeleteMode
                ? "bg-theme-primary text-white border-theme-primary"
                : "bg-theme-card hover:bg-theme-hover border-theme text-theme-text"
            }`}
          >
            {bulkDeleteMode ? "Cancel" : "Bulk Delete"}
          </button>
          <button
            onClick={() => fetchAssets(true)}
            className="flex items-center gap-2 px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4 text-theme-primary" />
            <span className="text-theme-text">Refresh</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-theme-card border border-theme rounded-lg p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
          <input
            type="text"
            placeholder="Search by asset name, folder, library, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
          />
        </div>
      </div>

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
      ) : (
        <div className="space-y-4">
          {libraries.map((library) => {
            const hasMatchingAssets = library.folders.some((folder) =>
              folder.assets.some((asset) =>
                matchesSearch(asset, folder, library)
              )
            );

            if (!hasMatchingAssets && searchQuery.trim()) {
              return null;
            }

            return (
              <div
                key={library.name}
                className="bg-theme-card border border-theme rounded-lg overflow-hidden"
              >
                {/* Library Header */}
                <button
                  onClick={() => toggleLibrary(library.name)}
                  className="w-full flex items-center justify-between p-4 hover:bg-theme-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-theme-primary" />
                    <span className="text-lg font-semibold text-theme-text">
                      {library.name}
                    </span>
                    <span className="text-sm text-theme-muted">
                      ({library.folder_count} folder
                      {library.folder_count !== 1 ? "s" : ""})
                    </span>
                  </div>
                  {expandedLibraries[library.name] ? (
                    <ChevronUp className="w-5 h-5 text-theme-muted" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-theme-muted" />
                  )}
                </button>

                {/* Library Content */}
                {expandedLibraries[library.name] && (
                  <div className="border-t border-theme">
                    {library.folders.map((folder) => {
                      const matchingAssets = folder.assets.filter((asset) =>
                        matchesSearch(asset, folder, library)
                      );

                      if (matchingAssets.length === 0 && searchQuery.trim()) {
                        return null;
                      }

                      return (
                        <div
                          key={folder.path}
                          className="border-b border-theme last:border-b-0"
                        >
                          {/* Folder Header */}
                          <button
                            onClick={() => toggleFolder(folder.path)}
                            className="w-full flex items-center justify-between p-4 pl-8 hover:bg-theme-hover transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Film className="w-4 h-4 text-theme-primary" />
                              <span className="text-base font-medium text-theme-text">
                                {folder.name}
                              </span>
                              <span className="text-sm text-theme-muted">
                                ({folder.asset_count} asset
                                {folder.asset_count !== 1 ? "s" : ""})
                              </span>
                            </div>
                            {expandedFolders[folder.path] ? (
                              <ChevronUp className="w-4 h-4 text-theme-muted" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-theme-muted" />
                            )}
                          </button>

                          {/* Assets Grid */}
                          {expandedFolders[folder.path] && (
                            <div className="p-4 pl-8 bg-theme-bg">
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {matchingAssets.map((asset) => (
                                  <div
                                    key={asset.path}
                                    className={`relative group bg-theme-card border rounded-lg overflow-hidden transition-all hover:border-theme-primary/50 ${
                                      bulkDeleteMode &&
                                      selectedAssets.has(asset.path)
                                        ? "ring-2 ring-theme-primary"
                                        : "border-theme"
                                    }`}
                                  >
                                    {/* Selection Checkbox (Bulk Delete Mode) */}
                                    {bulkDeleteMode && (
                                      <div className="absolute top-2 left-2 z-10">
                                        <input
                                          type="checkbox"
                                          checked={selectedAssets.has(
                                            asset.path
                                          )}
                                          onChange={() =>
                                            toggleAssetSelection(asset.path)
                                          }
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
                                          <span className="capitalize">
                                            {asset.type}
                                          </span>
                                        </div>
                                      </div>
                                      <p className="text-xs text-theme-text font-medium truncate mb-1">
                                        {asset.name}
                                      </p>
                                      <p className="text-xs text-theme-muted">
                                        {(asset.size / 1024).toFixed(0)} KB
                                      </p>

                                      {/* Actions */}
                                      {!bulkDeleteMode && (
                                        <div className="flex gap-1 mt-2">
                                          <button
                                            onClick={() =>
                                              setSelectedImage(asset)
                                            }
                                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-theme-bg hover:bg-theme-hover border border-theme rounded text-xs transition-all"
                                          >
                                            <Eye className="w-3 h-3" />
                                            View
                                          </button>
                                          <button
                                            onClick={() =>
                                              deleteAsset(
                                                asset.path,
                                                asset.name
                                              )
                                            }
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
                  <div>
                    <label className="text-sm text-theme-muted">Name</label>
                    <p className="text-theme-text break-all">
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

                  <div>
                    <label className="text-sm text-theme-muted">Path</label>
                    <p className="text-theme-text text-sm break-all">
                      {selectedImage.path}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-theme-muted">Size</label>
                    <p className="text-theme-text">
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
