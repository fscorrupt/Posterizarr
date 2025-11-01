import React, { useState, useEffect, useRef } from "react";
import {
  ImageIcon,
  Folder,
  Trash2,
  RefreshCw,
  Loader2,
  Search,
  ChevronDown,
  CheckSquare,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import CompactImageSizeSlider from "./CompactImageSizeSlider";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";
import AssetReplacer from "./AssetReplacer";
import ScrollToButtons from "./ScrollToButtons";
import ImagePreviewModal from "./ImagePreviewModal";

const API_URL = "/api";

function Gallery() {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [error, setError] = useState(null); // Local error state for loading display

  const [selectedImage, setSelectedImage] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [displayCount, setDisplayCount] = useState(50);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = localStorage.getItem("gallery-items-per-page");
    return saved ? parseInt(saved) : 50;
  });

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);

  // Asset replacer state
  const [replacerOpen, setReplacerOpen] = useState(false);
  const [assetToReplace, setAssetToReplace] = useState(null);

  // Dropdown state
  const [itemsPerPageDropdownOpen, setItemsPerPageDropdownOpen] =
    useState(false);
  const [itemsPerPageDropdownUp, setItemsPerPageDropdownUp] = useState(false);
  const itemsPerPageDropdownRef = useRef(null);

  // Cache busting timestamp for force-reloading images after replacement
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  // Image size state with localStorage (2-10 range, default 5)
  const [imageSize, setImageSize] = useState(() => {
    const saved = localStorage.getItem("gallery-poster-size");
    return saved ? parseInt(saved) : 5;
  });

  // Grid column classes based on size (2-10 columns)
  // Mobile: 2 columns, Tablet (md): 3-4 columns depending on size, Desktop (lg): full size selection
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

  const fetchFolders = async (showNotification = false) => {
    try {
      const response = await fetch(`${API_URL}/assets-folders`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setFolders(data.folders || []);

      if (showNotification && data.folders) {
        const totalPosters = data.folders.reduce(
          (sum, folder) => sum + (folder.poster_count || 0),
          0
        );
        const foldersWithPosters = data.folders.filter(
          (f) => f.poster_count > 0
        ).length;

        if (totalPosters > 0) {
          showSuccess(
            t("gallery.foldersLoaded", {
              folderCount: foldersWithPosters,
              posterCount: totalPosters,
            })
          );
        } else {
          showSuccess(
            t("gallery.foldersFound", { count: data.folders.length })
          );
        }
      }

      if (data.folders && data.folders.length > 0 && !activeFolder) {
        const folderWithImages = data.folders.find((f) => f.poster_count > 0);
        if (folderWithImages) {
          setActiveFolder(folderWithImages);
        }
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      const errorMsg = error.message || t("gallery.loadFoldersError");
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderImages = async (folder, showNotification = false) => {
    if (!folder) return;

    setImagesLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/assets-folder-images/posters/${folder.path}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      // Log media types for debugging
      if (data.images && data.images.length > 0) {
        const typeCounts = {};
        data.images.forEach((img) => {
          const type = img.type || "undefined";
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        console.log(
          `[Gallery] Loaded ${data.images.length} images from ${folder.name}:`,
          typeCounts
        );
        console.log(
          `[Gallery] Sample images:`,
          data.images.slice(0, 3).map((img) => ({
            name: img.name,
            path: img.path,
            type: img.type,
          }))
        );
      }

      if (showNotification && data.images && data.images.length > 0) {
        showSuccess(
          t("gallery.postersLoaded", {
            count: data.images.length,
            folder: folder.name,
          })
        );
      }
    } catch (error) {
      console.error("Error fetching images:", error);
      const errorMsg =
        error.message || t("gallery.loadImagesError", { folder: folder.name });
      setError(errorMsg);
      showError(errorMsg);
      setImages([]);
    } finally {
      setImagesLoading(false);
    }
  };

  // Click outside detection for dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        itemsPerPageDropdownRef.current &&
        !itemsPerPageDropdownRef.current.contains(event.target)
      ) {
        setItemsPerPageDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const formatDisplayPath = (path) => {
    return path;
  };

  // Helper function to get media type from filename/path
  const getMediaType = (imagePath, imageName) => {
    const path = imagePath.toLowerCase();
    const name = imageName.toLowerCase();

    // Check the folder structure
    if (path.includes("/seasons/") || path.includes("\\seasons\\")) {
      return "Season";
    }
    if (path.includes("/titlecards/") || path.includes("\\titlecards\\")) {
      return "Episode";
    }
    if (path.includes("/backgrounds/") || path.includes("\\backgrounds\\")) {
      return "Background";
    }

    // Check filename patterns
    if (
      name.includes("season") &&
      (name.includes("poster") || name.match(/s\d+/i))
    ) {
      return "Season";
    }
    if (name.includes("background")) {
      return "Background";
    }

    // Check if it's a show (has series/show in path or multiple seasons)
    if (
      path.includes("/series/") ||
      path.includes("\\series\\") ||
      path.includes("/shows/") ||
      path.includes("\\shows\\")
    ) {
      return "Show";
    }

    // Default to Movie for posters folder
    return "Movie";
  };

  // Get color for media type badge
  const getTypeColor = (type) => {
    switch (type) {
      case "Movie":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "Show":
        return "bg-purple-500/20 text-purple-400 border-purple-500/50";
      case "Season":
        return "bg-indigo-500/20 text-indigo-400 border-indigo-500/50";
      case "Episode":
        return "bg-cyan-500/20 text-cyan-400 border-cyan-500/50";
      case "Background":
        return "bg-pink-500/20 text-pink-400 border-pink-500/50";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  // Format timestamp for display
  const formatTimestamp = (filePath) => {
    try {
      // Try to get file modification time from the file system
      // Since we don't have direct access, we'll show when it was loaded
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

  const deletePoster = async (imagePath, imageName, event) => {
    if (event) {
      event.stopPropagation();
    }

    setDeletingImage(imagePath);
    try {
      const response = await fetch(
        `${API_URL}/gallery/${encodeURIComponent(imagePath)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete poster");
      }

      const data = await response.json();

      if (data.success) {
        showSuccess(t("gallery.posterDeleted", { name: imageName }));

        setImages(images.filter((img) => img.path !== imagePath));

        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }

        fetchFolders(false);
      } else {
        throw new Error(data.message || "Failed to delete poster");
      }
    } catch (error) {
      console.error("Error deleting poster:", error);
      showError(t("gallery.deleteError", { message: error.message }));
    } finally {
      setDeletingImage(null);
    }
  };

  const bulkDeletePosters = async () => {
    if (selectedImages.length === 0) return;

    setDeletingImage("bulk");
    try {
      const response = await fetch(`${API_URL}/gallery/bulk-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paths: selectedImages }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete posters");
      }

      const data = await response.json();

      if (data.success) {
        const deletedCount = data.deleted.length;
        const failedCount = data.failed.length;

        if (failedCount > 0) {
          showError(
            t("gallery.bulkDeletePartial", {
              deleted: deletedCount,
              failed: failedCount,
            })
          );
        } else {
          showSuccess(t("gallery.bulkDeleteSuccess", { count: deletedCount }));
        }

        // Remove deleted images from the list
        setImages(images.filter((img) => !data.deleted.includes(img.path)));

        // Clear selection
        setSelectedImages([]);
        setSelectMode(false);

        fetchFolders(false);
      } else {
        throw new Error(data.message || "Failed to delete posters");
      }
    } catch (error) {
      console.error("Error deleting posters:", error);
      showError(t("gallery.deleteError", { message: error.message }));
    } finally {
      setDeletingImage(null);
    }
  };

  const toggleImageSelection = (imagePath) => {
    setSelectedImages((prev) =>
      prev.includes(imagePath)
        ? prev.filter((path) => path !== imagePath)
        : [...prev, imagePath]
    );
  };

  const toggleSelectAll = () => {
    if (selectedImages.length === displayedImages.length) {
      setSelectedImages([]);
    } else {
      setSelectedImages(displayedImages.map((img) => img.path));
    }
  };

  const cancelSelectMode = () => {
    setSelectMode(false);
    setSelectedImages([]);
  };

  const loadMore = () => {
    setDisplayCount((prev) => prev + itemsPerPage);
  };

  const loadAll = () => {
    setDisplayCount(filteredImages.length);
  };

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value);
    localStorage.setItem("gallery-items-per-page", value.toString());
    setDisplayCount(value);
  };

  useEffect(() => {
    fetchFolders(false);
  }, []);

  useEffect(() => {
    if (activeFolder) {
      fetchFolderImages(activeFolder, false);
    }
  }, [activeFolder]);

  useEffect(() => {
    setDisplayCount(itemsPerPage);
  }, [searchTerm, activeFolder, itemsPerPage]);

  // Function to calculate dropdown position
  const calculateDropdownPosition = (ref) => {
    if (!ref.current) return false;

    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If more space above than below, open upward
    return spaceAbove > spaceBelow;
  };

  // Click outside detection for dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        itemsPerPageDropdownRef.current &&
        !itemsPerPageDropdownRef.current.contains(event.target)
      ) {
        setItemsPerPageDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredImages = images.filter(
    (img) =>
      img.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      img.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayedImages = filteredImages.slice(0, displayCount);
  const hasMore = filteredImages.length > displayCount;

  return (
    <div className="space-y-6">
      <ScrollToButtons />
      {/* Header */}

      {/* Folder Tabs */}
      {folders.length > 0 && (
        <div className="bg-theme-card rounded-lg border border-theme-border p-3 sm:p-4">
          {/* Header with Controls - Stack on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-theme-text flex items-center gap-2">
              <Folder className="w-5 h-5 text-theme-primary" />
              {t("gallery.folders")}
            </h2>
            {/* Controls - wrap on small screens */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Compact Image Size Slider */}
              <CompactImageSizeSlider
                value={imageSize}
                onChange={setImageSize}
                storageKey="gallery-poster-size"
              />
              {/* Select Mode Toggle */}
              {activeFolder && images.length > 0 && (
                <button
                  onClick={() => {
                    if (selectMode) {
                      cancelSelectMode();
                    } else {
                      setSelectMode(true);
                    }
                  }}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg ${
                    selectMode
                      ? "bg-orange-600 hover:bg-orange-700"
                      : "bg-theme-primary hover:bg-theme-primary/90"
                  }`}
                >
                  {selectMode ? (
                    <>
                      <Square className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="hidden sm:inline">
                        {t("gallery.cancelSelect")}
                      </span>
                      <span className="sm:hidden">
                        {t("gallery.cancelSelect") || "Cancel"}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="hidden sm:inline">
                        {t("gallery.select")}
                      </span>
                      <span className="sm:hidden">{t("gallery.select")}</span>
                    </>
                  )}
                </button>
              )}
              {/* Refresh Button */}
              <button
                onClick={() => {
                  fetchFolders(true);
                  if (activeFolder) {
                    fetchFolderImages(activeFolder, true);
                  }
                }}
                disabled={loading || imagesLoading}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-theme-text text-sm font-medium transition-all shadow-sm"
              >
                <RefreshCw
                  className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 text-theme-primary ${
                    loading || imagesLoading ? "animate-spin" : ""
                  }`}
                />
                <span className="hidden sm:inline">{t("gallery.refresh")}</span>
              </button>
            </div>
          </div>
          {/* Folder buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {folders
              .filter((folder) => folder.poster_count > 0)
              .map((folder) => (
                <button
                  key={folder.path}
                  onClick={() => setActiveFolder(folder)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap shadow-sm ${
                    activeFolder?.path === folder.path
                      ? "bg-theme-primary text-white scale-105 border-2 border-theme-primary"
                      : "bg-theme-card text-theme-text hover:bg-theme-hover border border-theme hover:border-theme-primary/50 hover:scale-105"
                  }`}
                >
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate max-w-[120px] sm:max-w-none">
                    {folder.name}
                  </span>
                  <span className="ml-1 px-2 py-0.5 bg-black/20 rounded-full text-xs font-semibold">
                    {folder.poster_count}
                  </span>
                </button>
              ))}
          </div>

          {/* Search bar */}
          {activeFolder && images.length > 0 && (
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t("gallery.searchPlaceholder", {
                  folder: activeFolder.name,
                })}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-theme-bg border border-theme-primary/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
              />
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-theme-card rounded-xl border border-theme">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">{t("gallery.loadingFolders")}</p>
        </div>
      ) : error ? (
        <div className="bg-red-950/40 rounded-xl p-8 border-2 border-red-600/50 text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-red-600/20 mb-4">
              <ImageIcon className="w-12 h-12 text-red-400" />
            </div>
            <h3 className="text-2xl font-semibold text-red-300 mb-2">
              {t("gallery.errorLoadingGallery")}
            </h3>
            <p className="text-red-200 text-sm mb-6 max-w-md">{error}</p>
            <button
              onClick={() => {
                fetchFolders(true);
                if (activeFolder) {
                  fetchFolderImages(activeFolder, true);
                }
              }}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all shadow-lg hover:scale-105"
            >
              <RefreshCw className="w-5 h-5" />
              {t("gallery.tryAgain")}
            </button>
          </div>
        </div>
      ) : !activeFolder ? (
        <div className="bg-theme-card rounded-xl p-12 border border-theme text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-theme-primary/20 mb-4">
              <Folder className="w-12 h-12 text-theme-primary" />
            </div>
            <h3 className="text-2xl font-semibold text-theme-text mb-2">
              {t("gallery.noFoldersFound")}
            </h3>
            <p className="text-theme-muted max-w-md">
              {t("gallery.noFoldersDescription")}
            </p>
          </div>
        </div>
      ) : imagesLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-theme-card rounded-xl border border-theme">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">{t("gallery.loadingPosters")}</p>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card rounded-xl p-12 border border-theme text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-theme-primary/20 mb-4">
              <ImageIcon className="w-12 h-12 text-theme-primary" />
            </div>
            <h3 className="text-2xl font-semibold text-theme-text mb-2">
              {searchTerm
                ? t("gallery.noMatchingPosters")
                : t("gallery.noPostersFound")}
            </h3>
            <p className="text-theme-muted max-w-md">
              {searchTerm
                ? t("gallery.adjustSearch")
                : t("gallery.noPostersInFolder", { folder: activeFolder.name })}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Selection controls - Responsive */}
          {selectMode && (
            <div className="bg-theme-card rounded-xl p-3 sm:p-4 border border-theme-primary">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text text-sm font-medium transition-all shadow-sm"
                  >
                    {selectedImages.length === displayedImages.length ? (
                      <>
                        <Square className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 text-theme-primary" />
                        <span className="text-sm sm:text-base">
                          {t("gallery.deselectAll")}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 text-theme-primary" />
                        <span className="text-sm sm:text-base">
                          {t("gallery.selectAll")}
                        </span>
                      </>
                    )}
                  </button>
                  <span className="text-sm sm:text-base text-theme-text font-medium">
                    {t("gallery.selected", { count: selectedImages.length })}
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (selectedImages.length > 0) {
                      setDeleteConfirm({
                        bulk: true,
                        count: selectedImages.length,
                      });
                    }
                  }}
                  disabled={
                    selectedImages.length === 0 || deletingImage === "bulk"
                  }
                  className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all"
                >
                  <Trash2
                    className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${
                      deletingImage === "bulk" ? "animate-spin" : ""
                    }`}
                  />
                  <span className="text-sm sm:text-base">
                    {t("gallery.deleteSelected", {
                      count: selectedImages.length,
                    })}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-theme-card rounded-xl p-4 border border-theme">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-text font-medium">
                {t("gallery.showing", {
                  displayed: displayedImages.length,
                  total: filteredImages.length,
                  folder: activeFolder.name,
                })}
              </span>
              {images.length !== filteredImages.length && (
                <span className="text-theme-primary font-semibold">
                  {t("gallery.filteredFrom", { total: images.length })}
                </span>
              )}
            </div>
          </div>

          <div className={`grid ${getGridClass(imageSize)} gap-4`}>
            {displayedImages.map((image, index) => (
              <div
                key={index}
                className={`group relative bg-theme-card rounded-lg border transition-all duration-200 overflow-hidden ${
                  selectMode && selectedImages.includes(image.path)
                    ? "border-theme-primary ring-2 ring-theme-primary"
                    : "border-theme-border hover:border-theme-primary"
                }`}
              >
                {selectMode ? (
                  <>
                    {/* Selection checkbox overlay */}
                    <div
                      className="absolute top-2 left-2 z-10 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleImageSelection(image.path);
                      }}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                          selectedImages.includes(image.path)
                            ? "bg-theme-primary text-white"
                            : "bg-black/50 text-white hover:bg-black/70"
                        }`}
                      >
                        {selectedImages.includes(image.path) ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </div>
                    </div>

                    <div
                      className="relative cursor-pointer aspect-[2/3] p-2"
                      onClick={() => toggleImageSelection(image.path)}
                    >
                      <img
                        src={`${image.url}?t=${cacheBuster}`}
                        alt={image.name}
                        className="w-full h-full object-cover rounded"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "flex";
                        }}
                      />
                      <div
                        className="w-full h-full flex items-center justify-center bg-gray-800 rounded"
                        style={{ display: "none" }}
                      >
                        <ImageIcon className="w-12 h-12 text-theme-primary" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({
                          path: image.path,
                          name: image.name,
                        });
                      }}
                      disabled={deletingImage === image.path}
                      className={`absolute top-2 right-2 z-10 p-2 rounded-lg transition-all shadow-lg backdrop-blur-sm ${
                        deletingImage === image.path
                          ? "bg-theme-muted cursor-not-allowed opacity-70"
                          : "bg-red-600/95 hover:bg-red-700 opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95"
                      }`}
                      title={t("gallery.deletePoster")}
                    >
                      <Trash2
                        className={`w-4 h-4 text-white ${
                          deletingImage === image.path ? "animate-spin" : ""
                        }`}
                      />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssetToReplace(image);
                        setReplacerOpen(true);
                      }}
                      className="absolute top-2 left-2 z-10 p-2 rounded-lg bg-theme-primary/95 hover:bg-theme-primary opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-sm hover:scale-110 active:scale-95"
                      title={t("gallery.replaceAsset")}
                    >
                      <RefreshCw className="w-4 h-4 text-white" />
                    </button>

                    <div
                      className="relative cursor-pointer aspect-[2/3] p-2"
                      onClick={() => setSelectedImage(image)}
                    >
                      <img
                        src={`${image.url}?t=${cacheBuster}`}
                        alt={image.name}
                        className="w-full h-full object-cover rounded"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "flex";
                        }}
                      />
                      <div
                        className="w-full h-full flex items-center justify-center bg-gray-800 rounded"
                        style={{ display: "none" }}
                      >
                        <ImageIcon className="w-12 h-12 text-theme-primary" />
                      </div>
                    </div>
                  </>
                )}

                <div className="p-3 border-t border-theme-border bg-theme-card">
                  <p
                    className="text-sm text-theme-text truncate"
                    title={formatDisplayPath(image.path)}
                  >
                    {image.path.split(/[\\/]/).slice(-2, -1)[0] || image.name}
                  </p>
                  <p className="text-xs text-theme-muted mt-1">
                    {(image.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-8 space-y-6">
              {/* Items per page selector */}
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-3 px-6 py-3 bg-theme-card border border-theme-border rounded-xl shadow-md">
                  <label className="text-sm font-medium text-theme-text">
                    {t("gallery.itemsPerPage")}:
                  </label>
                  <div className="relative" ref={itemsPerPageDropdownRef}>
                    <button
                      onClick={() => {
                        const shouldOpenUp = calculateDropdownPosition(
                          itemsPerPageDropdownRef
                        );
                        setItemsPerPageDropdownUp(shouldOpenUp);
                        setItemsPerPageDropdownOpen(!itemsPerPageDropdownOpen);
                      }}
                      className="px-4 py-2 bg-theme-bg text-theme-text border border-theme-border rounded-lg text-sm font-semibold hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary transition-all cursor-pointer shadow-sm flex items-center gap-2"
                    >
                      <span>{itemsPerPage}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          itemsPerPageDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {itemsPerPageDropdownOpen && (
                      <div
                        className={`absolute z-50 right-0 ${
                          itemsPerPageDropdownUp
                            ? "bottom-full mb-2"
                            : "top-full mt-2"
                        } bg-theme-card border border-theme-primary rounded-lg shadow-xl overflow-hidden min-w-[80px] max-h-60 overflow-y-auto`}
                      >
                        {[25, 50, 100, 200, 500].map((value) => (
                          <button
                            key={value}
                            onClick={() => {
                              handleItemsPerPageChange(value);
                              setItemsPerPageDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2 text-sm transition-all text-center ${
                              itemsPerPage === value
                                ? "bg-theme-primary text-white"
                                : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Load buttons */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={loadMore}
                  className="flex items-center gap-2 px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                  <ChevronDown className="w-4 h-4 text-theme-primary" />
                  <span className="text-theme-text">
                    {t("gallery.loadMore")}
                  </span>
                  <span className="ml-1 px-2 py-0.5 bg-theme-primary/20 rounded-full text-xs font-bold text-theme-primary">
                    {t("gallery.remaining", {
                      count: filteredImages.length - displayCount,
                    })}
                  </span>
                </button>
                <button
                  onClick={loadAll}
                  className="flex items-center gap-2 px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
                >
                  <ChevronDown className="w-4 h-4 text-theme-primary" />
                  <span className="text-theme-text">
                    {t("gallery.loadAll")}
                  </span>
                  <span className="ml-1 px-2 py-0.5 bg-theme-primary/20 rounded-full text-xs font-bold text-theme-primary">
                    {t("gallery.total", { count: filteredImages.length })}
                  </span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Image Preview Modal */}
      <ImagePreviewModal
        selectedImage={selectedImage}
        onClose={() => setSelectedImage(null)}
        onDelete={(image) => {
          setDeleteConfirm({
            path: image.path,
            name: image.name,
          });
        }}
        onReplace={(image) => {
          setAssetToReplace(image);
          setReplacerOpen(true);
        }}
        isDeleting={deletingImage === selectedImage?.path}
        cacheBuster={cacheBuster}
        formatDisplayPath={formatDisplayPath}
        formatTimestamp={formatTimestamp}
        getMediaType={getMediaType}
        getTypeColor={getTypeColor}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            if (deleteConfirm.bulk) {
              bulkDeletePosters();
            } else {
              deletePoster(deleteConfirm.path, deleteConfirm.name);
            }
            setDeleteConfirm(null);
          }
        }}
        title={
          deleteConfirm?.bulk
            ? t("gallery.deleteMultipleTitle")
            : t("gallery.deletePosterTitle")
        }
        message={
          deleteConfirm?.bulk
            ? t("gallery.deleteMultipleMessage", { count: deleteConfirm.count })
            : t("gallery.deletePosterMessage")
        }
        itemName={deleteConfirm?.bulk ? undefined : deleteConfirm?.name}
        confirmText={t("gallery.deleteButton")}
        type="danger"
      />

      {/* Asset Replacer Modal */}
      {replacerOpen && assetToReplace && (
        <AssetReplacer
          asset={assetToReplace}
          onClose={() => {
            setReplacerOpen(false);
            setAssetToReplace(null);
          }}
          onSuccess={() => {
            // Force cache refresh by updating timestamp
            setCacheBuster(Date.now());

            // Update selectedImage if it's still open to show the new image
            if (selectedImage && assetToReplace) {
              setSelectedImage({
                ...selectedImage,
                url: `${selectedImage.url.split("?")[0]}?t=${Date.now()}`,
              });
            }

            // Refresh the images after successful replacement
            setTimeout(() => {
              fetchFolderImages(activeFolder, false);
            }, 500);
            showSuccess(t("gallery.assetReplaced"));
          }}
        />
      )}
    </div>
  );
}

export default Gallery;
