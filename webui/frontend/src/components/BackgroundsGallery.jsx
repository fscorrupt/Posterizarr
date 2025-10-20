import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
  Folder,
  Trash2,
  RefreshCw,
  Search,
  ChevronDown,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import CompactImageSizeSlider from "./CompactImageSizeSlider";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";
import AssetReplacer from "./AssetReplacer";
import ScrollToButtons from "./ScrollToButtons";

const API_URL = "/api";

function BackgroundsGallery() {
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
    const saved = localStorage.getItem("background-items-per-page");
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
    const saved = localStorage.getItem("gallery-background-size");
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
        const totalBackgrounds = data.folders.reduce(
          (sum, folder) => sum + (folder.background_count || 0),
          0
        );
        const foldersWithBackgrounds = data.folders.filter(
          (f) => f.background_count > 0
        ).length;

        if (totalBackgrounds > 0) {
          showSuccess(
            t("backgroundsGallery.foldersLoaded", {
              folders: foldersWithBackgrounds,
              backgrounds: totalBackgrounds,
            })
          );
        } else {
          showSuccess(
            t("backgroundsGallery.foldersFoundEmpty", {
              count: data.folders.length,
            })
          );
        }
      }

      if (data.folders && data.folders.length > 0 && !activeFolder) {
        const folderWithImages = data.folders.find(
          (f) => f.background_count > 0
        );
        if (folderWithImages) {
          setActiveFolder(folderWithImages);
        }
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      const errorMsg =
        error.message || t("backgroundsGallery.failedLoadFolders");
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
        `${API_URL}/assets-folder-images/backgrounds/${folder.path}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showNotification && data.images && data.images.length > 0) {
        showSuccess(
          t("backgroundsGallery.loadedFromFolder", {
            count: data.images.length,
            folder: folder.name,
          })
        );
      }
    } catch (error) {
      console.error("Error fetching images:", error);
      const errorMsg =
        error.message ||
        t("backgroundsGallery.failedLoadImages", { folder: folder.name });
      setError(errorMsg);
      showError(errorMsg);
      setImages([]);
    } finally {
      setImagesLoading(false);
    }
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

  const deleteBackground = async (imagePath, imageName, event) => {
    if (event) {
      event.stopPropagation();
    }

    setDeletingImage(imagePath);
    try {
      const response = await fetch(`${API_URL}/backgrounds/${imagePath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.detail || t("backgroundsGallery.failedDeleteBackground")
        );
      }

      const data = await response.json();

      if (data.success) {
        showSuccess(t("backgroundsGallery.deleteSuccess", { name: imageName }));

        setImages(images.filter((img) => img.path !== imagePath));

        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }

        fetchFolders(false);
      } else {
        throw new Error(
          data.message || t("backgroundsGallery.failedDeleteBackground")
        );
      }
    } catch (error) {
      console.error("Error deleting background:", error);
      showError(t("backgroundsGallery.deleteError", { error: error.message }));
    } finally {
      setDeletingImage(null);
    }
  };

  const bulkDeleteBackgrounds = async () => {
    if (selectedImages.length === 0) return;

    setDeletingImage("bulk");
    try {
      const response = await fetch(`${API_URL}/backgrounds/bulk-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paths: selectedImages }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          data.detail || t("backgroundsGallery.failedBulkDelete")
        );
      }

      const data = await response.json();

      if (data.success) {
        const deletedCount = data.deleted.length;
        const failedCount = data.failed.length;

        if (failedCount > 0) {
          showError(
            t("backgroundsGallery.bulkDeletePartial", {
              deleted: deletedCount,
              failed: failedCount,
            })
          );
        } else {
          showSuccess(
            t("backgroundsGallery.bulkDeleteSuccess", { count: deletedCount })
          );
        }

        // Remove deleted images from the list
        setImages(images.filter((img) => !data.deleted.includes(img.path)));

        // Clear selection
        setSelectedImages([]);
        setSelectMode(false);

        fetchFolders(false);
      } else {
        throw new Error(
          data.message || t("backgroundsGallery.failedBulkDelete")
        );
      }
    } catch (error) {
      console.error("Error deleting backgrounds:", error);
      showError(t("backgroundsGallery.deleteError", { error: error.message }));
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
    localStorage.setItem("background-items-per-page", value.toString());
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
        <div className="bg-theme-card rounded-lg border border-theme-border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-theme-text flex items-center gap-2">
              <Folder className="w-5 h-5 text-theme-primary" />
              {t("backgroundsGallery.folders")}
            </h2>
            <div className="flex items-center gap-3">
              {/* Compact Image Size Slider */}
              <CompactImageSizeSlider
                value={imageSize}
                onChange={setImageSize}
                storageKey="gallery-background-size"
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
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-sm ${
                    selectMode
                      ? "bg-orange-600 hover:bg-orange-700 text-white"
                      : "bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text"
                  }`}
                >
                  {selectMode ? (
                    <>
                      <Square className="w-5 h-5" />
                      {t("backgroundsGallery.cancelSelect")}
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-5 h-5 text-theme-primary" />
                      {t("backgroundsGallery.select")}
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
                className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-theme-text font-medium transition-all shadow-sm"
              >
                <RefreshCw
                  className={`w-5 h-5 text-theme-primary ${
                    loading || imagesLoading ? "animate-spin" : ""
                  }`}
                />
                {t("common.refresh")}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {folders
              .filter((folder) => folder.background_count > 0)
              .map((folder) => (
                <button
                  key={folder.path}
                  onClick={() => setActiveFolder(folder)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap shadow-sm ${
                    activeFolder?.path === folder.path
                      ? "bg-theme-primary text-white scale-105 border-2 border-theme-primary"
                      : "bg-theme-card text-theme-text hover:bg-theme-hover border border-theme hover:border-theme-primary/50 hover:scale-105"
                  }`}
                >
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  {folder.name}
                  <span className="ml-1 px-2 py-0.5 bg-black/20 rounded-full text-xs font-semibold">
                    {folder.background_count}
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
                placeholder={t("backgroundsGallery.searchPlaceholder", {
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
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">
            {t("backgroundsGallery.loadingFolders")}
          </p>
        </div>
      ) : error ? (
        <div className="bg-red-950/40 rounded-xl p-8 border-2 border-red-600/50 text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-red-600/20 mb-4">
              <Layers className="w-12 h-12 text-red-400" />
            </div>
            <h3 className="text-2xl font-semibold text-red-300 mb-2">
              {t("backgroundsGallery.errorTitle")}
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
              {t("backgroundsGallery.tryAgain")}
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
              {t("backgroundsGallery.noFoldersTitle")}
            </h3>
            <p className="text-theme-muted max-w-md">
              {t("backgroundsGallery.noFoldersDescription")}
            </p>
          </div>
        </div>
      ) : imagesLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-theme-card rounded-xl border border-theme">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">
            {t("backgroundsGallery.loadingBackgrounds")}
          </p>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card rounded-xl p-12 border border-theme text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-theme-primary/20 mb-4">
              <Layers className="w-12 h-12 text-theme-primary" />
            </div>
            <h3 className="text-2xl font-semibold text-theme-text mb-2">
              {searchTerm
                ? t("backgroundsGallery.noMatchingTitle")
                : t("backgroundsGallery.noBackgroundsTitle")}
            </h3>
            <p className="text-theme-muted max-w-md">
              {searchTerm
                ? t("backgroundsGallery.noMatchingDescription")
                : t("backgroundsGallery.noBackgroundsDescription", {
                    folder: activeFolder.name,
                  })}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Selection controls */}
          {selectMode && (
            <div className="bg-theme-card rounded-xl p-4 border border-theme-primary">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-text font-medium transition-all shadow-sm"
                  >
                    {selectedImages.length === displayedImages.length ? (
                      <>
                        <Square className="w-5 h-5 text-theme-primary" />
                        {t("backgroundsGallery.deselectAll")}
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-5 h-5 text-theme-primary" />
                        {t("backgroundsGallery.selectAll")}
                      </>
                    )}
                  </button>
                  <span className="text-theme-text font-medium">
                    {t("backgroundsGallery.selectedCount", {
                      count: selectedImages.length,
                    })}
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
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all"
                >
                  <Trash2
                    className={`w-5 h-5 ${
                      deletingImage === "bulk" ? "animate-spin" : ""
                    }`}
                  />
                  {t("backgroundsGallery.deleteSelected", {
                    count: selectedImages.length,
                  })}
                </button>
              </div>
            </div>
          )}

          <div className="bg-theme-card rounded-xl p-4 border border-theme">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-text font-medium">
                {t("backgroundsGallery.showingCount", {
                  displayed: displayedImages.length,
                  filtered: filteredImages.length,
                  folder: activeFolder.name,
                })}
              </span>
              {images.length !== filteredImages.length && (
                <span className="text-theme-primary font-semibold">
                  {t("backgroundsGallery.filteredFrom", {
                    total: images.length,
                  })}
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
                      className="relative cursor-pointer aspect-[16/9] p-2"
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
                        <Layers className="w-12 h-12 text-theme-primary" />
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
                      title={t("backgroundsGallery.deleteTooltip")}
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
                        setAssetToReplace({ ...image, type: "background" });
                        setReplacerOpen(true);
                      }}
                      className="absolute top-2 left-2 z-10 p-2 rounded-lg bg-theme-primary/95 hover:bg-theme-primary opacity-0 group-hover:opacity-100 transition-all shadow-lg backdrop-blur-sm hover:scale-110 active:scale-95"
                      title={t("backgroundsGallery.replaceTooltip")}
                    >
                      <RefreshCw className="w-4 h-4 text-white" />
                    </button>

                    <div
                      className="relative cursor-pointer aspect-[16/9] p-2"
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
                        <Layers className="w-12 h-12 text-theme-primary" />
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
                    {t("backgroundsGallery.itemsPerPage")}
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
                                : "text-theme-text hover:bg-theme-primary/30 hover:border-theme-primary/20"
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
                    {t("backgroundsGallery.loadMore")}
                  </span>
                  <span className="ml-1 px-2 py-0.5 bg-theme-primary/20 rounded-full text-xs font-bold text-theme-primary">
                    {t("backgroundsGallery.remaining", {
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
                    {t("backgroundsGallery.loadAll")}
                  </span>
                  <span className="ml-1 px-2 py-0.5 bg-theme-primary/20 rounded-full text-xs font-bold text-theme-primary">
                    {t("backgroundsGallery.total", {
                      count: filteredImages.length,
                    })}
                  </span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-theme-card rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-theme-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 px-4 sm:px-6 py-4 border-b border-theme-hover bg-gradient-to-r from-theme-card to-theme-hover">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-theme-text mb-1 break-words">
                    {selectedImage.path.split(/[\\/]/).slice(-2, -1)[0] ||
                      "Unknown"}
                  </h3>
                  <p className="text-xs sm:text-sm text-theme-muted truncate">
                    {formatDisplayPath(selectedImage.path)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="flex-shrink-0 p-2 hover:bg-theme-hover rounded-lg transition-colors sm:hidden"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-theme-text" />
                </button>
              </div>
            </div>

            {/* Image Content */}
            <div className="p-4 sm:p-6 bg-theme-bg flex items-center justify-center">
              <div className="max-h-[50vh] sm:max-h-[65vh] flex items-center justify-center">
                <img
                  src={`${selectedImage.url}?t=${cacheBuster}`}
                  alt={selectedImage.name}
                  className="max-w-full max-h-[50vh] sm:max-h-[65vh] object-contain rounded-lg shadow-2xl"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "block";
                  }}
                />
                <div className="text-center" style={{ display: "none" }}>
                  <div className="p-4 rounded-full bg-theme-primary/20 inline-block mb-4">
                    <Layers className="w-16 h-16 text-theme-primary" />
                  </div>
                  <p className="text-theme-text text-lg font-semibold mb-2">
                    {t("backgroundsGallery.previewNotAvailable")}
                  </p>
                  <p className="text-theme-muted text-sm">
                    {t("backgroundsGallery.useFileExplorer")}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer with Actions */}
            <div className="sticky bottom-0 px-4 sm:px-6 py-4 border-t border-theme-hover bg-theme-card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {/* File Size Info */}
                <span className="text-xs sm:text-sm text-theme-muted font-medium">
                  {t("backgroundsGallery.size", {
                    size: (selectedImage.size / 1024).toFixed(2),
                  })}
                </span>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssetToReplace({
                        ...selectedImage,
                        type: "background",
                      });
                      setReplacerOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors bg-theme-primary text-white hover:bg-theme-primary/90"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t("backgroundsGallery.replace")}
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({
                        path: selectedImage.path,
                        name: selectedImage.name,
                      });
                    }}
                    disabled={deletingImage === selectedImage.path}
                    className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                      deletingImage === selectedImage.path
                        ? "bg-theme-muted cursor-not-allowed opacity-50"
                        : "bg-red-600 hover:bg-red-700 text-white"
                    }`}
                  >
                    <Trash2
                      className={`w-4 h-4 ${
                        deletingImage === selectedImage.path
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    {t("common.delete")}
                  </button>

                  <button
                    onClick={() => setSelectedImage(null)}
                    className="hidden sm:flex items-center justify-center px-5 py-2.5 bg-theme-hover hover:bg-theme-hover/80 rounded-lg font-medium transition-colors text-theme-text border border-theme-hover"
                  >
                    {t("common.close")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            if (deleteConfirm.bulk) {
              bulkDeleteBackgrounds();
            } else {
              deleteBackground(deleteConfirm.path, deleteConfirm.name);
            }
            setDeleteConfirm(null);
          }
        }}
        title={
          deleteConfirm?.bulk
            ? t("backgroundsGallery.deleteMultipleTitle")
            : t("backgroundsGallery.deleteSingleTitle")
        }
        message={
          deleteConfirm?.bulk
            ? t("backgroundsGallery.deleteMultipleMessage", {
                count: deleteConfirm.count,
              })
            : t("backgroundsGallery.deleteSingleMessage")
        }
        itemName={deleteConfirm?.bulk ? undefined : deleteConfirm?.name}
        confirmText={t("common.delete")}
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
            showSuccess(t("backgroundsGallery.replaceSuccess"));
          }}
        />
      )}
    </div>
  );
}

export default BackgroundsGallery;
