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
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "http://localhost:8000/api";

function TitleCardGallery() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const fetchImages = async (showToast = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/titlecards-gallery`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showToast && data.images && data.images.length > 0) {
        toast.success(`Loaded ${data.images.length} title cards`, {
          duration: 2000,
          position: "top-right",
        });
      }
    } catch (error) {
      console.error("Error fetching title cards:", error);
      setError(error.message);
      setImages([]);
      toast.error("Failed to load title cards gallery", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
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

  const deleteTitleCard = async (imagePath, imageName, event) => {
    if (event) {
      event.stopPropagation();
    }

    if (
      !window.confirm(
        `Möchtest du das TitleCard "${imageName}" wirklich löschen?`
      )
    ) {
      return;
    }

    setDeletingImage(imagePath);
    try {
      const response = await fetch(`${API_URL}/titlecards/${imagePath}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete title card");
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`TitleCard "${imageName}" erfolgreich gelöscht`, {
          duration: 3000,
          position: "top-right",
        });

        setImages(images.filter((img) => img.path !== imagePath));

        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }
      } else {
        throw new Error(data.message || "Failed to delete title card");
      }
    } catch (error) {
      console.error("Error deleting title card:", error);
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
    fetchImages(false);
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setDisplayCount(50);
  }, [searchTerm]);

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
            TitleCard Gallery
          </h1>

          <button
            onClick={() => fetchImages(true)}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        <div className="bg-theme-card rounded-lg p-4 border border-theme-primary">
          <h3 className="text-sm font-semibold text-theme-muted mb-3">
            Quick Actions
          </h3>
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
      </div>

      {images.length > 0 && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search title cards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-theme-card border border-theme-primary rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary" />
        </div>
      ) : error ? (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 text-center">
          <ImageIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-red-400 mb-2">
            Error Loading TitleCard Gallery
          </h3>
          <p className="text-red-300 text-sm mb-4">{error}</p>
          <button
            onClick={() => fetchImages(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card border border-theme-primary rounded-lg p-12 text-center">
          <ImageIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-theme-muted mb-2">
            {searchTerm ? "No Matching TitleCards" : "No TitleCards Found"}
          </h3>
          <p className="text-theme-muted text-sm">
            {searchTerm
              ? "Try adjusting your search terms"
              : "Run the script to generate title cards"}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-theme-muted">
            Showing {displayedImages.length} of {filteredImages.length} title
            cards
            {images.length !== filteredImages.length && (
              <span className="ml-2 text-theme-primary">
                (filtered from {images.length} total)
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {displayedImages.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-lg overflow-hidden border border-theme-primary hover:border-theme-primary transition-all"
              >
                <button
                  onClick={(e) => deleteTitleCard(image.path, image.name, e)}
                  disabled={deletingImage === image.path}
                  className={`absolute top-2 right-2 z-10 p-2 rounded-lg transition-all ${
                    deletingImage === image.path
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 opacity-0 group-hover:opacity-100"
                  }`}
                  title="TitleCard löschen"
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
                    src={`http://localhost:8000${image.url}`}
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
                    title={image.path}
                  >
                    {image.path}
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
                title={selectedImage.path}
              >
                {selectedImage.path}
              </h3>
              <button
                onClick={(e) =>
                  deleteTitleCard(selectedImage.path, selectedImage.name, e)
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
                  src={`http://localhost:8000${selectedImage.url}`}
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
                    Use file explorer to view title card
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

export default TitleCardGallery;
