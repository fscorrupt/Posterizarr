import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Image as ImageIcon,
  Search,
  Trash2,
  Play,
  Save,
  Cloud,
  ChevronDown,
  Folder,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "/api";

function BackgroundsGallery() {
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [displayCount, setDisplayCount] = useState(50);
  const [status, setStatus] = useState({
    running: false,
    current_mode: null,
  });

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

      // Only auto-select folders that have backgrounds
      if (data.folders && data.folders.length > 0 && !activeFolder) {
        const foldersWithBackgrounds = data.folders.filter(
          (f) => f.background_count > 0
        );
        if (foldersWithBackgrounds.length > 0) {
          setActiveFolder(foldersWithBackgrounds[0]);
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
        `${API_URL}/assets-folder-images/backgrounds/${folder.path}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showToast && data.images && data.images.length > 0) {
        toast.success(
          `Loaded ${data.images.length} backgrounds from ${folder.name}`,
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

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  const runScript = async (mode, modeName) => {
    setScriptLoading(true);
    try {
      const response = await fetch(`${API_URL}/run/${mode}`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        toast.success(`${modeName} gestartet!`, {
          duration: 4000,
          position: "top-right",
        });
        fetchStatus();
      } else {
        toast.error(`Error: ${data.message}`, {
          duration: 5000,
          position: "top-right",
        });
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setScriptLoading(false);
    }
  };

  const deleteBackground = async (imagePath, imageName, event) => {
    if (event) {
      event.stopPropagation();
    }

    if (
      !window.confirm(
        `Möchtest du das Background "${imageName}" wirklich löschen?`
      )
    ) {
      return;
    }

    setDeletingImage(imagePath);
    try {
      const response = await fetch(`${API_URL}/backgrounds/${imagePath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete background");
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`Background "${imageName}" erfolgreich gelöscht`, {
          duration: 3000,
          position: "top-right",
        });

        setImages(images.filter((img) => img.path !== imagePath));

        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }

        fetchFolders(false);
      } else {
        throw new Error(data.message || "Failed to delete background");
      }
    } catch (error) {
      console.error("Error deleting background:", error);
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
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
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
    <div className="px-4 py-6">
      <Toaster />

      <div className="flex flex-col space-y-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          <h1 className="text-3xl font-bold text-theme-primary">
            Backgrounds Gallery
          </h1>

          <button
            onClick={() => {
              fetchFolders(true);
              if (activeFolder) {
                fetchFolderImages(activeFolder, true);
              }
            }}
            disabled={loading || imagesLoading}
            className="flex items-center px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${
                loading || imagesLoading ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>
        </div>

        <div className="">
          <h3 className="text-sm font-semibold text-theme-muted mb-3"></h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => runScript("normal", "Normal Mode")}
              disabled={scriptLoading || status.running}
              className="flex items-center justify-center px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm"
            >
              <Play className="w-4 h-4 mr-1.5" />
              Normal Mode
            </button>

            <button
              onClick={() => runScript("backup", "Backup Mode")}
              disabled={scriptLoading || status.running}
              className="flex items-center justify-center px-3 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm"
            >
              <Save className="w-4 h-4 mr-1.5" />
              Backup Mode
            </button>

            <button
              onClick={() => runScript("syncjelly", "Sync Jellyfin")}
              disabled={scriptLoading || status.running}
              className="flex items-center justify-center px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm"
            >
              <Cloud className="w-4 h-4 mr-1.5" />
              Sync Jellyfin
            </button>

            <button
              onClick={() => runScript("syncemby", "Sync Emby")}
              disabled={scriptLoading || status.running}
              className="flex items-center justify-center px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm"
            >
              <Cloud className="w-4 h-4 mr-1.5" />
              Sync Emby
            </button>
          </div>
        </div>

        {activeFolder && images.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search backgrounds in ${activeFolder.name}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-theme-card border border-theme-primary rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            />
          </div>
        )}

        {folders.length > 0 && (
          <div className="">
            <h3 className="text-m font-semibold text-theme-muted mb-3"></h3>
            <div className="flex gap-2 min-w-max">
              {folders
                .filter((folder) => folder.background_count > 0)
                .map((folder) => (
                  <button
                    key={folder.path}
                    onClick={() => setActiveFolder(folder)}
                    className={`flex items-center px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                      activeFolder?.path === folder.path
                        ? "bg-theme-primary text-white"
                        : "bg-theme-hover text-theme-text hover:bg-theme-primary/70"
                    }`}
                  >
                    <Folder className="w-4 h-4 mr-2 flex-shrink-0" />
                    {folder.name}
                    <span className="ml-2 px-2 py-0.5 bg-black/20 rounded-full text-xs">
                      {folder.background_count}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary" />
        </div>
      ) : error ? (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
          <ImageIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-red-400 mb-2">
            Error Loading Backgrounds Gallery
          </h3>
          <p className="text-red-300 text-sm mb-4">{error}</p>
          <button
            onClick={() => {
              fetchFolders(true);
              if (activeFolder) {
                fetchFolderImages(activeFolder, true);
              }
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : !activeFolder ? (
        <div className="bg-theme-card border border-theme-primary rounded-lg p-12 text-center">
          <Folder className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-theme-muted mb-2">
            No Folders Found
          </h3>
          <p className="text-theme-muted text-sm">
            No folders found in assets directory
          </p>
        </div>
      ) : imagesLoading ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary" />
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card border border-theme-primary rounded-lg p-12 text-center">
          <ImageIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-theme-muted mb-2">
            {searchTerm ? "No Matching Backgrounds" : "No Backgrounds Found"}
          </h3>
          <p className="text-theme-muted text-sm">
            {searchTerm
              ? "Try adjusting your search terms"
              : `No backgrounds found in ${activeFolder.name}`}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-theme-muted">
            Showing {displayedImages.length} of {filteredImages.length}{" "}
            backgrounds in {activeFolder.name}
            {images.length !== filteredImages.length && (
              <span className="ml-2 text-theme-primary">
                (filtered from {images.length} total)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedImages.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-lg overflow-hidden border border-theme-primary hover:border-theme-primary transition-all"
              >
                <button
                  onClick={(e) => deleteBackground(image.path, image.name, e)}
                  disabled={deletingImage === image.path}
                  className={`absolute top-2 right-2 z-10 p-2 rounded-lg transition-all ${
                    deletingImage === image.path
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 opacity-0 group-hover:opacity-100"
                  }`}
                  title="Background löschen"
                >
                  <Trash2
                    className={`w-4 h-4 text-white ${
                      deletingImage === image.path ? "animate-spin" : ""
                    }`}
                  />
                </button>

                <div
                  className="aspect-[16/9] bg-theme-dark flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image.url}  // if image.url is already relative
                    alt={image.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                    <ImageIcon className="w-12 h-12 mb-2" />
                    <span className="text-xs text-center">
                      Preview not available
                    </span>
                  </div>
                </div>
                <div className="p-3 border-t-2 border-theme">
                  <p
                    className="text-sm text-theme-text truncate"
                    title={formatDisplayPath(image.path)}
                  >
                    {formatDisplayPath(image.path)}
                  </p>
                  <p className="text-xs text-theme-muted mt-1">
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
                className="flex items-center gap-2 px-6 py-3 bg-theme-primary hover:bg-theme-primary/90 rounded-lg font-medium transition-all transform hover:scale-105"
              >
                <ChevronDown className="w-5 h-5" />
                Load More ({filteredImages.length - displayCount} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-theme-card border border-theme-primary rounded-lg max-w-6xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b-2 border-theme flex justify-between items-center">
              <h3
                className="text-lg font-semibold text-white truncate mr-4"
                title={formatDisplayPath(selectedImage.path)}
              >
                {formatDisplayPath(selectedImage.path)}
              </h3>
              <button
                onClick={(e) =>
                  deleteBackground(selectedImage.path, selectedImage.name, e)
                }
                disabled={deletingImage === selectedImage.path}
                className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                  deletingImage === selectedImage.path
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                <Trash2
                  className={`w-4 h-4 mr-1 ${
                    deletingImage === selectedImage.path ? "animate-spin" : ""
                  }`}
                />
                Löschen
              </button>
            </div>
            <div className="p-4 flex items-center justify-center">
              <div className="max-h-[70vh] flex items-center justify-center">
                <img
                  src={selectedImage.url}  // if image.url is already relative
                  alt={selectedImage.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "block";
                  }}
                />
                <div className="text-center" style={{ display: "none" }}>
                  <ImageIcon className="w-24 h-24 text-gray-700 mx-auto mb-4" />
                  <p className="text-gray-500 text-sm">
                    Image preview not available
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    Use file explorer to view background
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t-2 border-theme flex justify-between items-center">
              <span className="text-sm text-theme-muted">
                Größe: {(selectedImage.size / 1024).toFixed(2)} KB
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-sm font-medium transition-colors text-white"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BackgroundsGallery;
