import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Image as ImageIcon,
  Search,
  Trash2,
  ChevronDown,
  Folder,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import ImageSizeSlider from "./ImageSizeSlider";
import { getGridColumns, loadImageSize } from "../utils/imageGridUtils";

const API_URL = "/api";

function Gallery() {
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);
  const [displayCount, setDisplayCount] = useState(50);

  // Image size slider state
  const [imageSize, setImageSize] = useState(() =>
    loadImageSize("gallery-poster-size", 3)
  );

  // Calculate grid columns based on image size (true = Portrait for Posters)
  const gridColumns = getGridColumns(imageSize, true);

  const fetchFolders = async (showToast = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/assets-folders`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setFolders(data.folders || []);

      if (showToast && data.folders && data.folders.length > 0) {
        toast.success(`Loaded ${data.folders.length} folders`, {
          duration: 2000,
          position: "top-right",
        });
      }

      // Only auto-select folders that have posters
      if (data.folders && data.folders.length > 0 && !activeFolder) {
        const foldersWithPosters = data.folders.filter(
          (f) => f.poster_count > 0
        );
        if (foldersWithPosters.length > 0) {
          setActiveFolder(foldersWithPosters[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      setError(error.message);
      setFolders([]);
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
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/assets-folder-images/posters/${folder.path}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showToast && data.images && data.images.length > 0) {
        toast.success(
          `Loaded ${data.images.length} posters from ${folder.name}`,
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

  // Format path to remove folder prefix
  const formatDisplayPath = (path) => {
    const parts = path.split(/[\\/]/);
    if (parts.length > 1) {
      return parts.slice(1).join("/");
    }
    return path;
  };

  const deletePoster = async (imagePath, imageName, event) => {
    if (event) {
      event.stopPropagation();
    }

    if (
      !window.confirm(`Möchtest du das Poster "${imageName}" wirklich löschen?`)
    ) {
      return;
    }

    setDeletingImage(imagePath);
    try {
      const response = await fetch(`${API_URL}/gallery/${imagePath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete poster");
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`Poster "${imageName}" erfolgreich gelöscht`, {
          duration: 3000,
          position: "top-right",
        });

        setImages(images.filter((img) => img.path !== imagePath));

        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }

        // Refresh folders to update counts
        fetchFolders(false);
      } else {
        throw new Error(data.message || "Failed to delete poster");
      }
    } catch (error) {
      console.error("Error deleting poster:", error);
      toast.error(`Fehler beim Löschen: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setDeletingImage(null);
    }
  };

  const loadMore = () => {
    setDisplayCount((prev) => prev + 50);
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
    setDisplayCount(50);
  }, [searchTerm, activeFolder]);

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
          <ImageIcon className="w-8 h-8 text-theme-primary" />
          Browse and manage your poster´s
        </h1>
      </div>

      {/* Image Size Slider */}
      <ImageSizeSlider
        value={imageSize}
        onChange={setImageSize}
        storageKey="gallery-poster-size"
      />

      {/* Folder Tabs */}
      {folders.length > 0 && (
        <div className="">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-theme-text flex items-center gap-2">
              <Folder className="w-5 h-5 text-theme-primary" />
              Folders
            </h2>
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
          <div className="flex flex-wrap gap-2">
            {folders
              .filter((folder) => folder.poster_count > 0)
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
                    {folder.poster_count}
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
              placeholder={`Search posters in ${activeFolder.name}...`}
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
              Error Loading Gallery
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
              Select a Folder
            </h3>
            <p className="text-theme-muted max-w-md">
              Choose a folder from above to view its posters
            </p>
          </div>
        </div>
      ) : imagesLoading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-theme-card rounded-xl border border-theme">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">Loading posters...</p>
        </div>
      ) : displayedImages.length === 0 ? (
        <div className="bg-theme-card rounded-xl p-12 border border-theme text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-theme-primary/20 mb-4">
              <ImageIcon className="w-12 h-12 text-theme-primary" />
            </div>
            <h3 className="text-2xl font-semibold text-theme-text mb-2">
              {searchTerm ? "No Matching Posters" : "No Posters Found"}
            </h3>
            <p className="text-theme-muted max-w-md">
              {searchTerm
                ? "Try adjusting your search terms to find what you're looking for"
                : `No posters found in ${activeFolder.name}`}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-theme-card rounded-xl p-4 border border-theme">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-text font-medium">
                Showing {displayedImages.length} of {filteredImages.length}{" "}
                posters in {activeFolder.name}
              </span>
              {images.length !== filteredImages.length && (
                <span className="text-theme-primary font-semibold">
                  Filtered from {images.length} total
                </span>
              )}
            </div>
          </div>

          {/* Dynamic Grid with Image Size Slider */}
          <div className={`grid ${gridColumns} gap-6`}>
            {displayedImages.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-xl overflow-hidden border-2 border-theme-primary/30 hover:border-theme-primary transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105"
              >
                <button
                  onClick={(e) => deletePoster(image.path, image.name, e)}
                  disabled={deletingImage === image.path}
                  className={`absolute top-3 right-3 z-10 p-2.5 rounded-lg transition-all shadow-lg ${
                    deletingImage === image.path
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 opacity-0 group-hover:opacity-100 hover:scale-110"
                  }`}
                  title="Delete poster"
                >
                  <Trash2
                    className={`w-4 h-4 text-white ${
                      deletingImage === image.path ? "animate-spin" : ""
                    }`}
                  />
                </button>

                <div
                  className="aspect-[2/3] bg-theme-dark flex items-center justify-center overflow-hidden cursor-pointer"
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
                    className="hidden flex-col items-center justify-center text-gray-600 p-4"
                    style={{ display: "none" }}
                  >
                    <ImageIcon className="w-12 h-12 mb-2 text-theme-primary" />
                    <span className="text-xs text-center text-theme-muted">
                      Preview not available
                    </span>
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
            <div className="mt-8 flex justify-center">
              <button
                onClick={loadMore}
                className="flex items-center gap-3 px-8 py-4 bg-theme-primary hover:bg-theme-primary/90 rounded-xl font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <ChevronDown className="w-5 h-5" />
                Load More
                <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-sm">
                  {filteredImages.length - displayCount} remaining
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-theme-card rounded-2xl max-w-6xl w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-theme-card px-6 py-4 border-b-2 border-theme flex items-center justify-between">
              <h3 className="text-xl font-semibold text-theme-primary truncate flex-1 mr-4">
                {formatDisplayPath(selectedImage.path)}
              </h3>
              <button
                onClick={(e) =>
                  deletePoster(selectedImage.path, selectedImage.name, e)
                }
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
                    Use file explorer to view poster
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

export default Gallery;
