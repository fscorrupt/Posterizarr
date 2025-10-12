import React, { useState, useEffect } from "react";
import {
  Film,
  Folder,
  Trash2,
  RefreshCw,
  Search,
  ChevronDown,
  ImageIcon,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import CompactImageSizeSlider from "./CompactImageSizeSlider";

const API_URL = "/api";

function SeasonGallery() {
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [displayCount, setDisplayCount] = useState(50);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = localStorage.getItem("season-items-per-page");
    return saved ? parseInt(saved) : 50;
  });

  // Image size state with localStorage (2-10 range, default 5)
  const [imageSize, setImageSize] = useState(() => {
    const saved = localStorage.getItem("gallery-season-size");
    return saved ? parseInt(saved) : 5;
  });

  // Grid column classes based on size (2-10 columns)
  // Mobile always shows 2 columns, desktop shows the selected amount
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

  const fetchFolders = async (showToast = false) => {
    try {
      const response = await fetch(`${API_URL}/assets-folders`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setFolders(data.folders || []);

      if (showToast && data.folders && data.folders.length > 0) {
        toast.success(`Found: ${data.folders.length} folders`, {
          duration: 2000,
          position: "top-right",
        });
      }

      if (data.folders && data.folders.length > 0 && !activeFolder) {
        const folderWithImages = data.folders.find((f) => f.season_count > 0);
        if (folderWithImages) {
          setActiveFolder(folderWithImages);
        }
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      setError(error.message);
      toast.error("Failed to load folders", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFolderImages = async (folder, showToast = false) => {
    if (!folder) return;

    setImagesLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/assets-folder-images/seasons/${folder.path}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showToast && data.images && data.images.length > 0) {
        toast.success(
          `Loaded ${data.images.length} seasons from ${folder.name}`,
          {
            duration: 2000,
            position: "top-right",
          }
        );
      }
    } catch (error) {
      console.error("Error fetching images:", error);
      setError(error.message);
      setImages([]);
      toast.error(`Failed to load images from ${folder.name}`, {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setImagesLoading(false);
    }
  };

  const formatDisplayPath = (path) => {
    const parts = path.split(/[\\/]/);
    if (parts.length > 1) {
      return parts.slice(1).join("/");
    }
    return path;
  };

  const deleteSeason = async (imagePath, imageName, event) => {
    if (event) {
      event.stopPropagation();
    }

    if (!window.confirm(`Do you really want to delete "${imageName}"?`)) {
      return;
    }

    setDeletingImage(imagePath);
    try {
      const response = await fetch(`${API_URL}/seasons/${imagePath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete season");
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`Season "${imageName}" deleted successfully`, {
          duration: 3000,
          position: "top-right",
        });

        setImages(images.filter((img) => img.path !== imagePath));

        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }

        fetchFolders(false);
      } else {
        throw new Error(data.message || "Failed to delete season");
      }
    } catch (error) {
      console.error("Error deleting season:", error);
      toast.error(`Error while deleting: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setDeletingImage(null);
    }
  };

  const loadMore = () => {
    setDisplayCount((prev) => prev + itemsPerPage);
  };

  const loadAll = () => {
    setDisplayCount(filteredImages.length);
  };

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value);
    localStorage.setItem("season-items-per-page", value.toString());
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
      <Toaster />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-theme-text flex items-center gap-3">
          <Film className="w-8 h-8 text-theme-primary" />
          Browse and manage your season poster's
        </h1>
      </div>

      {/* Folder Tabs */}
      {folders.length > 0 && (
        <div className="">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-theme-text flex items-center gap-2">
              <Folder className="w-5 h-5 text-theme-primary" />
              Folders
            </h2>
            <div className="flex items-center gap-3">
              {/* Compact Image Size Slider */}
              <CompactImageSizeSlider
                value={imageSize}
                onChange={setImageSize}
                storageKey="gallery-season-size"
              />
              {/* Refresh Button */}
              <button
                onClick={() => {
                  fetchFolders(true);
                  if (activeFolder) {
                    fetchFolderImages(activeFolder, true);
                  }
                }}
                disabled={loading || imagesLoading}
                className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg"
              >
                <RefreshCw
                  className={`w-5 h-5 ${
                    loading || imagesLoading ? "animate-spin" : ""
                  }`}
                />
                Refresh
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {folders
              .filter((folder) => folder.season_count > 0)
              .map((folder) => (
                <button
                  key={folder.path}
                  onClick={() => setActiveFolder(folder)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap shadow-sm ${
                    activeFolder?.path === folder.path
                      ? "bg-theme-primary text-white scale-105"
                      : "bg-theme-hover text-theme-text hover:bg-theme-primary/70 hover:scale-105"
                  }`}
                >
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  {folder.name}
                  <span className="ml-1 px-2 py-0.5 bg-black/20 rounded-full text-xs font-semibold">
                    {folder.season_count}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Search bar */}
      {activeFolder && images.length > 0 && (
        <div className="bg-theme-card rounded-xl p-4 border border-theme">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search seasons in ${activeFolder.name}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-theme-bg border border-theme-primary/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-theme-card rounded-xl border border-theme">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">Loading folders...</p>
        </div>
      ) : error ? (
        <div className="bg-red-950/40 rounded-xl p-8 border-2 border-red-600/50 text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-red-600/20 mb-4">
              <ImageIcon className="w-12 h-12 text-red-400" />
            </div>
            <h3 className="text-2xl font-semibold text-red-300 mb-2">
              Error Loading Season Gallery
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
              Try Again
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
              No Folders Found
            </h3>
            <p className="text-theme-muted max-w-md">
              No folders found in assets directory. Please check your
              configuration.
            </p>
          </div>
        </div>
      ) : imagesLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-theme-card rounded-xl border border-theme">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">Loading seasons...</p>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card rounded-xl p-12 border border-theme text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-theme-primary/20 mb-4">
              <ImageIcon className="w-12 h-12 text-theme-primary" />
            </div>
            <h3 className="text-2xl font-semibold text-theme-text mb-2">
              {searchTerm ? "No Matching Seasons" : "No Seasons Found"}
            </h3>
            <p className="text-theme-muted max-w-md">
              {searchTerm
                ? "Try adjusting your search terms to find what you're looking for"
                : `No seasons found in ${activeFolder.name}`}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-theme-card rounded-xl p-4 border border-theme">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-text font-medium">
                Showing {displayedImages.length} of {filteredImages.length}{" "}
                seasons in {activeFolder.name}
              </span>
              {images.length !== filteredImages.length && (
                <span className="text-theme-primary font-semibold">
                  Filtered from {images.length} total
                </span>
              )}
            </div>
          </div>

          <div className={`grid ${getGridClass(imageSize)} gap-6`}>
            {displayedImages.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-xl overflow-hidden border-2 border-theme-primary/30 hover:border-theme-primary transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105"
              >
                <button
                  onClick={(e) => deleteSeason(image.path, image.name, e)}
                  disabled={deletingImage === image.path}
                  className={`absolute top-3 right-3 z-10 p-2.5 rounded-lg transition-all shadow-lg ${
                    deletingImage === image.path
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 opacity-0 group-hover:opacity-100 hover:scale-110"
                  }`}
                  title="Delete season"
                >
                  <Trash2
                    className={`w-4 h-4 text-white ${
                      deletingImage === image.path ? "animate-spin" : ""
                    }`}
                  />
                </button>

                <div
                  className="relative cursor-pointer aspect-[2/3]"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image.url}
                    alt={image.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextSibling.style.display = "flex";
                    }}
                  />
                  <div
                    className="w-full h-full flex items-center justify-center bg-gray-800"
                    style={{ display: "none" }}
                  >
                    <ImageIcon className="w-12 h-12 text-theme-primary" />
                  </div>
                </div>

                <div className="p-4 border-t-2 border-theme bg-theme-bg">
                  <p
                    className="text-sm text-theme-text truncate font-medium"
                    title={formatDisplayPath(image.path)}
                  >
                    {formatDisplayPath(image.path)}
                  </p>
                  <p className="text-xs text-theme-muted mt-1.5 flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-theme-primary rounded-full"></span>
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
                    Items per page:
                  </label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) =>
                      handleItemsPerPageChange(parseInt(e.target.value))
                    }
                    className="px-4 py-2 bg-theme-bg text-theme-text border border-theme-border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent transition-all cursor-pointer hover:bg-theme-card"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                  </select>
                </div>
              </div>

              {/* Load buttons */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={loadMore}
                  className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-theme-primary to-theme-primary/80 hover:from-theme-primary/90 hover:to-theme-primary/70 text-white rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <ChevronDown className="w-5 h-5" />
                  Load More
                  <span className="ml-1 px-3 py-1 bg-black/20 rounded-full text-sm font-bold">
                    {filteredImages.length - displayCount} remaining
                  </span>
                </button>
                <button
                  onClick={loadAll}
                  className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-theme-secondary to-theme-secondary/80 hover:from-theme-secondary/90 hover:to-theme-secondary/70 text-white rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <ChevronDown className="w-5 h-5" />
                  Load All
                  <span className="ml-1 px-3 py-1 bg-black/20 rounded-full text-sm font-bold">
                    {filteredImages.length} total
                  </span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-card rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl border-2 border-theme-primary">
            <div className="px-6 py-4 border-b-2 border-theme flex justify-between items-center bg-theme-card">
              <h3 className="text-xl font-bold text-theme-text truncate flex-1">
                {formatDisplayPath(selectedImage.path)}
              </h3>
              <button
                onClick={(e) =>
                  deleteSeason(selectedImage.path, selectedImage.name, e)
                }
                disabled={deletingImage === selectedImage.path}
                className={`ml-4 flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
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
            <div className="p-6 bg-theme-bg flex items-center justify-center">
              <div className="max-h-[70vh] flex items-center justify-center">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
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
                    Use file explorer to view season
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t-2 border-theme flex justify-between items-center bg-theme-card">
              <span className="text-sm text-theme-muted font-medium">
                Size: {(selectedImage.size / 1024).toFixed(2)} KB
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-sm font-medium transition-all text-white shadow-lg hover:scale-105"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SeasonGallery;
