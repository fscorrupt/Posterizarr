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
  Film,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "/api";

function SeasonGallery() {
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
    const startTime = Date.now();
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

      if (data.folders && data.folders.length > 0 && !activeFolder) {
        const foldersWithSeasons = data.folders.filter(
          (f) => f.season_count > 0
        );
        if (foldersWithSeasons.length > 0) {
          setActiveFolder(foldersWithSeasons[0]);
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
      const elapsedTime = Date.now() - startTime;
      const minDisplayTime = 500;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);
      setTimeout(() => setLoading(false), remainingTime);
    }
  };

  const fetchFolderImages = async (folder, showToast = false) => {
    if (!folder) return;

    setImagesLoading(true);
    setError(null);
    const startTime = Date.now();
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
      const elapsedTime = Date.now() - startTime;
      const minDisplayTime = 500;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);
      setTimeout(() => setImagesLoading(false), remainingTime);
    }
  };

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

  const deleteSeason = async (imagePath, imageName, event) => {
    if (event) {
      event.stopPropagation();
    }

    if (
      !window.confirm(`Do you really want to delete the season "${imageName}"?`)
    ) {
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
        toast.success(`Season "${imageName}" successfully deleted`, {
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
      toast.error(`Error deleting: ${error.message}`, {
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
    <div className="space-y-6">
      <Toaster />

      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-theme-text flex items-center gap-3">
            <Film className="w-8 h-8 text-theme-primary" />
            Season Gallery
          </h1>
          <p className="text-theme-muted mt-2">
            Browse and manage your season poster collection
          </p>
        </div>

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

      {/* Script & Sync Mode Buttons */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme">
        <h2 className="text-xl font-semibold text-theme-text mb-4 flex items-center gap-2">
          <Play className="w-5 h-5 text-theme-primary" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => runScript("normal", "Normal Mode")}
            disabled={scriptLoading || status.running}
            className="flex flex-col items-center justify-center p-4 bg-theme-hover hover:bg-green-600/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-green-600 transition-all group"
          >
            <Play className="w-6 h-6 text-green-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-theme-text text-sm">
              Normal Mode
            </span>
          </button>

          <button
            onClick={() => runScript("backup", "Backup Mode")}
            disabled={scriptLoading || status.running}
            className="flex flex-col items-center justify-center p-4 bg-theme-hover hover:bg-yellow-600/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-yellow-600 transition-all group"
          >
            <Save className="w-6 h-6 text-orange-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-theme-text text-sm">
              Backup Mode
            </span>
          </button>

          <button
            onClick={() => runScript("syncjelly", "Sync Jellyfin")}
            disabled={scriptLoading || status.running}
            className="flex flex-col items-center justify-center p-4 bg-theme-hover hover:bg-orange-600/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-orange-600 transition-all group"
          >
            <RefreshCw className="w-6 h-6 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-theme-text text-sm">
              Sync Jellyfin
            </span>
          </button>

          <button
            onClick={() => runScript("syncemby", "Sync Emby")}
            disabled={scriptLoading || status.running}
            className="flex flex-col items-center justify-center p-4 bg-theme-hover hover:bg-teal-600/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-teal-600 transition-all group"
          >
            <RefreshCw className="w-6 h-6 text-green-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="font-medium text-theme-text text-sm">
              Sync Emby
            </span>
          </button>
        </div>
      </div>

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

      {/* Folder Tabs */}
      {folders.length > 0 && (
        <div className="bg-theme-card rounded-xl p-6 border border-theme">
          <h2 className="text-xl font-semibold text-theme-text mb-4 flex items-center gap-2">
            <Folder className="w-5 h-5 text-theme-primary" />
            Folders
          </h2>
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

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
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

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-theme-card border-2 border-theme-primary rounded-2xl max-w-6xl w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-theme-primary px-6 py-4 flex justify-between items-center">
              <h3
                className="text-lg font-bold text-white truncate mr-4"
                title={formatDisplayPath(selectedImage.path)}
              >
                {formatDisplayPath(selectedImage.path)}
              </h3>
              <button
                onClick={(e) =>
                  deleteSeason(selectedImage.path, selectedImage.name, e)
                }
                disabled={deletingImage === selectedImage.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 shadow-lg ${
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
