import React, { useState, useEffect } from "react";
import { RefreshCw, Image as ImageIcon, Search, Trash2 } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "http://localhost:8000/api";

function Gallery() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState(null);
  const [deletingImage, setDeletingImage] = useState(null);

  const fetchImages = async (showToast = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/gallery`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showToast && data.images && data.images.length > 0) {
        toast.success(`Loaded ${data.images.length} posters`, {
          duration: 2000,
          position: "top-right",
        });
      }
    } catch (error) {
      console.error("Error fetching images:", error);
      setError(error.message);
      setImages([]);
      toast.error("Failed to load gallery", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  const deletePoster = async (imagePath, imageName, event) => {
    // Stop event propagation to prevent opening the modal
    if (event) {
      event.stopPropagation();
    }

    // Confirm deletion
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

        // Remove from state
        setImages(images.filter((img) => img.path !== imagePath));

        // Close modal if deleted image is selected
        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }
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

  useEffect(() => {
    fetchImages(false); // No toast on initial load
  }, []);

  const filteredImages = images.filter(
    (img) =>
      img.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      img.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="px-4 py-6">
      <Toaster />

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 space-y-4 md:space-y-0">
        <h1 className="text-3xl font-bold text-theme-primary">
          Poster Gallery
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

      {/* Search bar */}
      {images.length > 0 && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search posters..."
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
            Error Loading Gallery
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
            {searchTerm ? "No Matching Posters" : "No Posters Found"}
          </h3>
          <p className="text-theme-muted text-sm">
            {searchTerm
              ? "Try adjusting your search terms"
              : "Posters will appear here after running Posterizarr"}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-theme-muted">
            Showing {filteredImages.length} of {images.length} posters
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredImages.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-lg overflow-hidden border border-theme-primary hover:border-theme-primary transition-all cursor-pointer"
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => deletePoster(image.path, image.name, e)}
                  disabled={deletingImage === image.path}
                  className={`absolute top-2 right-2 z-10 p-2 rounded-lg transition-all
                    ${
                      deletingImage === image.path
                        ? "bg-gray-600 cursor-not-allowed"
                        : "bg-red-600 hover:bg-red-700 opacity-0 group-hover:opacity-100"
                    }`}
                  title="Poster löschen"
                >
                  <Trash2
                    className={`w-4 h-4 text-white ${
                      deletingImage === image.path ? "animate-spin" : ""
                    }`}
                  />
                </button>

                <div
                  className="aspect-[2/3] bg-theme-dark flex items-center justify-center overflow-hidden"
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
                    title={image.name}
                  >
                    {image.name}
                  </p>
                  <p className="text-xs text-theme-muted mt-1">
                    {(image.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Image Modal */}
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
              <h3 className="text-lg font-semibold text-white">
                {selectedImage.name}
              </h3>
              <button
                onClick={(e) =>
                  deletePoster(selectedImage.path, selectedImage.name, e)
                }
                disabled={deletingImage === selectedImage.path}
                className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${
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
                    Use file explorer to view poster
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

export default Gallery;
