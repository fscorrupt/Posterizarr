import React, { useState, useEffect } from "react";
import { RefreshCw, Image as ImageIcon, Search } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "http://localhost:8000/api";

function TestGallery() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState(null);

  const fetchImages = async (showToast = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/test-gallery`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showToast && data.images && data.images.length > 0) {
        toast.success(`Loaded ${data.images.length} test posters`, {
          duration: 2000,
          position: "top-right",
        });
      }
    } catch (error) {
      console.error("Error fetching test images:", error);
      setError(error.message);
      setImages([]);
      toast.error("Failed to load test gallery", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
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
        <h1 className="text-3xl font-bold text-theme-primary">Test Gallery</h1>

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
              placeholder="Search test posters..."
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
            Error Loading Test Gallery
          </h3>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card border border-theme-primary rounded-lg p-12 text-center">
          <ImageIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-theme-muted mb-2">
            No Test Posters Found
          </h3>
          <p className="text-theme-muted text-sm">
            {searchTerm
              ? "No test posters match your search"
              : "Run the script in Testing mode to generate sample posters"}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-theme-muted">
            Showing {filteredImages.length} of {images.length} test posters
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredImages.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-lg overflow-hidden border border-theme-primary hover:border-theme-primary transition-all cursor-pointer"
                onClick={() => setSelectedImage(image)}
              >
                <div className="aspect-[2/3] bg-theme-dark flex items-center justify-center overflow-hidden">
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
                      Preview unavailable
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs font-medium truncate">
                    {image.name}
                  </p>
                  <p className="text-gray-400 text-[10px]">
                    {(image.size / 1024).toFixed(1)} KB
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-theme-card border border-theme-primary rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b-2 border-theme flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white truncate">
                {selectedImage.name}
              </h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-theme-muted hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center">
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
                Size: {(selectedImage.size / 1024).toFixed(2)} KB
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-sm font-medium transition-colors text-white"
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

export default TestGallery;
