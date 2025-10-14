import React, { useState, useEffect } from "react";
import {
  Folder,
  ChevronRight,
  Home,
  ImageIcon,
  Trash2,
  RefreshCw,
  Search,
  Film,
  Tv,
  FileImage,
} from "lucide-react";
import CompactImageSizeSlider from "./CompactImageSizeSlider";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";

const API_URL = "/api";

function FolderView() {
  const { showSuccess, showError, showInfo } = useToast();
  const [currentPath, setCurrentPath] = useState([]); // Navigation breadcrumb
  const [folders, setFolders] = useState([]); // Current level folders
  const [assets, setAssets] = useState([]); // Assets in current folder
  const [loading, setLoading] = useState(true);

  const [selectedImage, setSelectedImage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Image size state with localStorage (2-10 range, default 5)
  const [imageSize, setImageSize] = useState(() => {
    const saved = localStorage.getItem("folder-view-image-size");
    return saved ? parseInt(saved) : 5;
  });

  // Grid column classes based on size
  const getGridClass = (size) => {
    const classes = {
      2: "grid-cols-2 lg:grid-cols-2",
      3: "grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-2 lg:grid-cols-4",
      5: "grid-cols-2 lg:grid-cols-5",
      6: "grid-cols-2 lg:grid-cols-6",
      7: "grid-cols-2 lg:grid-cols-7",
      8: "grid-cols-2 lg:grid-cols-8",
      9: "grid-cols-2 lg:grid-cols-9",
      10: "grid-cols-2 lg:grid-cols-10",
    };
    return classes[size] || classes[5];
  };

  // Save image size to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("folder-view-image-size", imageSize.toString());
  }, [imageSize]);

  // Load data when path changes
  useEffect(() => {
    loadCurrentLevel();
  }, [currentPath]);

  const loadCurrentLevel = async () => {
    setLoading(true);
    showError(null);

    try {
      if (currentPath.length === 0) {
        // Root level - show libraries (top-level folders)
        await loadLibraries();
      } else if (currentPath.length === 1) {
        // Library level - show movie/show folders
        await loadItemFolders(currentPath[0]);
      } else if (currentPath.length === 2) {
        // Item level - show assets
        await loadItemAssets(currentPath[0], currentPath[1]);
      }
    } catch (err) {
      console.error("Error loading folder view:", err);
      showError(err.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  };

  const loadLibraries = async () => {
    const response = await fetch(`${API_URL}/assets-folders`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    setFolders(data.folders || []);
    setAssets([]);
  };

  const loadItemFolders = async (libraryPath) => {
    const response = await fetch(`${API_URL}/folder-view/items/${libraryPath}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    setFolders(data.folders || []);
    setAssets([]);
  };

  const loadItemAssets = async (libraryPath, itemPath) => {
    const fullPath = `${libraryPath}/${itemPath}`;
    const response = await fetch(
      `${API_URL}/folder-view/assets/${encodeURIComponent(fullPath)}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    setFolders([]);
    setAssets(data.assets || []);
  };

  const navigateToFolder = (folderName) => {
    setCurrentPath([...currentPath, folderName]);
    setSearchTerm("");
  };

  const navigateToLevel = (level) => {
    setCurrentPath(currentPath.slice(0, level));
    setSearchTerm("");
  };

  const navigateHome = () => {
    setCurrentPath([]);
    setSearchTerm("");
  };

  const handleRefresh = async () => {
    showSuccess(null);
    showError(null);
    await loadCurrentLevel();
    showSuccess("Content refreshed successfully");
  };

  const deletePoster = async (imagePath, imageName) => {
    setDeletingImage(imagePath);
    try {
      const response = await fetch(`${API_URL}/gallery/${imagePath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete image");
      }

      const data = await response.json();

      if (data.success) {
        showSuccess(`Successfully deleted ${imageName}`);

        // Close modal if open
        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }

        // Reload current level
        await loadCurrentLevel();
      } else {
        throw new Error(data.message || "Failed to delete image");
      }
    } catch (error) {
      console.error("Error deleting image:", error);
      showError(error.message || `Failed to delete ${imageName}`);
    } finally {
      setDeletingImage(null);
      setDeleteConfirm(null);
    }
  };

  // Filter folders and assets based on search
  const filteredFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAssets = assets.filter((asset) =>
    asset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAssetTypeIcon = (assetName) => {
    const name = assetName.toLowerCase();
    if (name.includes("poster")) return <ImageIcon className="w-4 h-4" />;
    if (name.includes("background")) return <FileImage className="w-4 h-4" />;
    if (name.includes("season")) return <Tv className="w-4 h-4" />;
    if (name.includes("titlecard")) return <Film className="w-4 h-4" />;
    return <ImageIcon className="w-4 h-4" />;
  };

  const getAssetAspectRatio = (assetName) => {
    const name = assetName.toLowerCase();
    // Backgrounds and titlecards (SXXEXX pattern) are horizontal (16:9)
    if (
      name.includes("background") ||
      name.includes("titlecard") ||
      /s\d{2}e\d{2}/i.test(name)
    ) {
      return "aspect-[16/9] w-full";
    }
    // Posters and seasons are vertical (2:3)
    return "aspect-[2/3] w-full";
  };

  const isHorizontalAsset = (assetName) => {
    const name = assetName.toLowerCase();
    return (
      name.includes("background") ||
      name.includes("titlecard") ||
      /s\d{2}e\d{2}/i.test(name)
    );
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deletePoster(deleteConfirm.path, deleteConfirm.name);
          }
        }}
        title="Delete Image"
        message="Are you sure you want to delete this image?"
        itemName={deleteConfirm?.name}
        confirmText="Delete"
        type="danger"
      />

      {/* Header with Breadcrumb */}
      <div className="bg-theme-card border border-theme-border rounded-lg p-4 space-y-4">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={navigateHome}
            className="flex items-center gap-2 px-3 py-2 bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all"
          >
            <Home className="w-4 h-4" />
            <span className="text-sm font-medium text-theme-text">Assets</span>
          </button>

          {currentPath.map((folder, index) => (
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
                {folder}
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
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-theme-bg border border-theme-primary/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-theme-primary text-sm"
              />
            </div>
          </div>

          {/* Image Size Slider (only when showing assets) */}
          {currentPath.length === 2 && assets.length > 0 && (
            <CompactImageSizeSlider
              value={imageSize}
              onChange={setImageSize}
              min={2}
              max={10}
            />
          )}

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-all font-medium shadow-lg"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-theme-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-theme-muted">Loading...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Folder Grid (Libraries or Items) */}
          {filteredFolders.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredFolders.map((folder) => (
                <button
                  key={folder.path || folder.name}
                  onClick={() => navigateToFolder(folder.name)}
                  className="group bg-theme-card border border-theme-border rounded-lg p-4 hover:border-theme-primary transition-all text-left shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-3 rounded-lg border border-theme-border group-hover:bg-theme-primary group-hover:border-theme-primary transition-colors">
                      <Folder className="w-6 h-6 text-theme-muted group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-theme-text truncate mb-1">
                        {folder.name}
                      </h3>
                      <div className="text-xs text-theme-muted space-y-1">
                        {currentPath.length === 0 && (
                          <>
                            <div>Total: {folder.total_count || 0} assets</div>
                            {folder.poster_count > 0 && (
                              <div>Posters: {folder.poster_count}</div>
                            )}
                            {folder.background_count > 0 && (
                              <div>Backgrounds: {folder.background_count}</div>
                            )}
                            {folder.season_count > 0 && (
                              <div>Seasons: {folder.season_count}</div>
                            )}
                            {folder.titlecard_count > 0 && (
                              <div>Episodes: {folder.titlecard_count}</div>
                            )}
                          </>
                        )}
                        {currentPath.length === 1 && folder.asset_count && (
                          <div>{folder.asset_count} assets</div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Assets Grid */}
          {filteredAssets.length > 0 && (
            <div className="asset-grid" style={{ "--grid-size": imageSize }}>
              {filteredAssets.map((asset) => {
                const isHorizontal = isHorizontalAsset(asset.name);
                return (
                  <div
                    key={asset.path}
                    className="group relative bg-theme-card border border-theme-border rounded-lg overflow-hidden hover:border-theme-primary transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col"
                    onClick={() => setSelectedImage(asset)}
                  >
                    {/* Asset Image */}
                    <div
                      className={`${getAssetAspectRatio(
                        asset.name
                      )} relative flex-shrink-0`}
                    >
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />

                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({
                            path: asset.path,
                            name: asset.name,
                          });
                        }}
                        disabled={deletingImage === asset.path}
                        className={`absolute top-2 right-2 z-10 p-2 rounded-lg transition-all ${
                          deletingImage === asset.path
                            ? "bg-gray-600 cursor-not-allowed"
                            : "bg-red-600/90 hover:bg-red-700 opacity-0 group-hover:opacity-100"
                        }`}
                        title="Delete image"
                      >
                        <Trash2
                          className={`w-4 h-4 text-white ${
                            deletingImage === asset.path ? "animate-spin" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {/* Asset Info */}
                    <div className="p-2 space-y-1">
                      <div className="flex items-center gap-2">
                        {getAssetTypeIcon(asset.name)}
                        <span className="text-xs font-medium text-theme-text truncate">
                          {asset.name}
                        </span>
                      </div>
                      <div className="text-xs text-theme-muted">
                        {formatFileSize(asset.size)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {filteredFolders.length === 0 && filteredAssets.length === 0 && (
            <div className="text-center py-12">
              <Folder className="w-16 h-16 text-theme-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-theme-text mb-2">
                {searchTerm
                  ? "No results found"
                  : currentPath.length === 0
                  ? "No libraries found"
                  : currentPath.length === 1
                  ? "No items found"
                  : "No assets found"}
              </h3>
              <p className="text-theme-muted">
                {searchTerm
                  ? "Try adjusting your search terms"
                  : "This folder is empty"}
              </p>
            </div>
          )}
        </>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-theme-card rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl border-2 border-theme-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b-2 border-theme flex justify-between items-center bg-theme-card">
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="text-xl font-bold text-theme-text truncate">
                  {selectedImage.name}
                </h3>
                <p className="text-sm text-theme-muted mt-1 truncate">
                  {currentPath.join(" / ")}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirm({
                    path: selectedImage.path,
                    name: selectedImage.name,
                  });
                }}
                disabled={deletingImage === selectedImage.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  deletingImage === selectedImage.path
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700 hover:scale-105"
                }`}
              >
                <Trash2
                  className={`w-4 h-4 ${
                    deletingImage === selectedImage.path ? "animate-spin" : ""
                  }`}
                />
                Delete
              </button>
            </div>

            {/* Modal Content - Image */}
            <div className="p-6 bg-theme-bg flex items-center justify-center">
              <div className="max-h-[65vh] flex items-center justify-center">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.name}
                  className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-2xl"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "block";
                  }}
                />
                <div className="text-center" style={{ display: "none" }}>
                  <div className="p-4 rounded-full bg-theme-primary/20 inline-block mb-4">
                    <ImageIcon className="w-16 h-16 text-theme-primary" />
                  </div>
                  <p className="text-theme-text text-lg font-semibold mb-2">
                    Image preview not available
                  </p>
                  <p className="text-theme-muted text-sm">
                    Use file explorer to view image
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-5 border-t-2 border-theme bg-theme-card flex justify-between items-center">
              <span className="text-sm text-theme-muted font-medium">
                Size: {formatFileSize(selectedImage.size)}
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="px-6 py-2.5 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-sm font-medium transition-all text-white shadow-lg hover:scale-105"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Grid Styles */}
      <style jsx>{`
        .asset-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: flex-end;
        }

        /* Dynamic grid item sizing based on image size slider */
        .asset-grid > div {
          flex: 0 0
            calc((100% - (var(--grid-size) - 1) * 1rem) / var(--grid-size));
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        /* Image container maintains aspect ratio */
        .asset-grid > div > div:first-child {
          flex-shrink: 0;
          width: 100%;
        }

        /* Info section */
        .asset-grid > div > div:last-child {
          display: flex;
          flex-direction: column;
        }

        /* Responsive breakpoints */
        @media (max-width: 1280px) {
          .asset-grid > div {
            flex: 0 0
              calc(
                (100% - (min(var(--grid-size), 8) - 1) * 1rem) /
                  min(var(--grid-size), 8)
              );
          }
        }

        @media (max-width: 1024px) {
          .asset-grid > div {
            flex: 0 0
              calc(
                (100% - (min(var(--grid-size), 6) - 1) * 1rem) /
                  min(var(--grid-size), 6)
              );
          }
        }

        @media (max-width: 768px) {
          .asset-grid > div {
            flex: 0 0
              calc(
                (100% - (min(var(--grid-size), 4) - 1) * 1rem) /
                  min(var(--grid-size), 4)
              );
          }
        }

        @media (max-width: 640px) {
          .asset-grid > div {
            flex: 0 0 calc((100% - 1rem) / 2);
            min-width: 140px;
          }
        }
      `}</style>
    </div>
  );
}

export default FolderView;
