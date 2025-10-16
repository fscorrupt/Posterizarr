import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Image as ImageIcon,
  Search,
  Play,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  TestTube,
  Expand,
  Minimize,
} from "lucide-react";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";

const API_URL = "/api";

function TestGallery() {
  const { showSuccess, showError, showInfo } = useToast();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Local error state for loading display
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);

  const [scriptLoading, setScriptLoading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({
    posters: false,
    backgrounds: false,
    seasonPosters: false,
    titleCards: false,
  });
  const [status, setStatus] = useState({
    running: false,
    current_mode: null,
  });

  // Categorization function
  const categorizeImages = (images) => {
    const categories = {
      posters: [],
      backgrounds: [],
      seasonPosters: [],
      titleCards: [],
    };

    images.forEach((img) => {
      const name = img.name.toLowerCase();

      if (name.includes("poster") && !name.includes("season")) {
        categories.posters.push(img);
      } else if (name.includes("background")) {
        categories.backgrounds.push(img);
      } else if (name.includes("seasonposter")) {
        categories.seasonPosters.push(img);
      } else if (name.includes("titlecard")) {
        categories.titleCards.push(img);
      }
    });

    return categories;
  };

  const toggleCategory = (category, event) => {
    // Prevent scrolling to top
    if (event) {
      event.preventDefault();
    }
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const fetchImages = async (showToast = false) => {
    setLoading(true);
    showError(null);
    try {
      const response = await fetch(`${API_URL}/test-gallery`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setImages(data.images || []);

      if (showToast && data.images && data.images.length > 0) {
        showSuccess(`Loaded ${data.images.length} test files`);
      }
    } catch (error) {
      console.error("Error fetching test images:", error);
      const errorMsg = error.message || "Failed to load test gallery";
      setError(errorMsg);
      showError(errorMsg);
      setImages([]);
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

  const runTestMode = async () => {
    if (status.running) {
      showError("Script is already running! Please stop it first.");
      return;
    }

    setScriptLoading(true);
    try {
      const response = await fetch(`${API_URL}/run/testing`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        showSuccess("Test Mode started successfully!");
        fetchStatus();
      } else {
        showError(`Error: ${data.message}`);
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    } finally {
      setScriptLoading(false);
    }
  };

  useEffect(() => {
    fetchImages(false);
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Filter images based on search term
  const filteredImages = images.filter(
    (img) =>
      img.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      img.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Categorize filtered images
  const categorizedImages = categorizeImages(filteredImages);

  // Category Component
  const CategorySection = ({ title, images, categoryKey, description }) => {
    if (images.length === 0) return null;

    const isExpanded = expandedCategories[categoryKey];

    // Aspect ratio based on category
    const isPortrait =
      categoryKey === "posters" || categoryKey === "seasonPosters";
    const aspectRatio = isPortrait ? "aspect-[2/3]" : "aspect-[16/9]";
    const gridCols = isPortrait
      ? "grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
      : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";

    return (
      <div className="mb-6">
        <button
          onClick={(e) => toggleCategory(categoryKey, e)}
          className="w-full flex items-center justify-between p-5 bg-theme-card border border-theme rounded-xl hover:bg-theme-hover hover:border-theme-primary/50 transition-all group shadow-sm"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 bg-theme-primary/10 group-hover:bg-theme-primary/20 rounded-lg text-sm font-bold text-theme-primary transition-all group-hover:scale-110">
              {images.length}
            </div>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-theme-primary">
                {title}
              </h3>
              {description && (
                <p className="text-xs text-theme-muted mt-1">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${
                isExpanded
                  ? "bg-theme-primary/20 text-theme-primary border border-theme-primary/30"
                  : "bg-theme-bg text-theme-muted border border-theme"
              }`}
            >
              {isExpanded ? "Open" : "Closed"}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-6 h-6 text-theme-primary transition-transform" />
            ) : (
              <ChevronDown className="w-6 h-6 text-theme-muted transition-transform" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className={`mt-4 grid ${gridCols} gap-4`}>
            {images.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-xl overflow-hidden border border-theme hover:border-theme-primary hover:shadow-lg transition-all cursor-pointer"
                onClick={() => setSelectedImage(image)}
              >
                <div
                  className={`${aspectRatio} bg-theme-bg flex items-center justify-center overflow-hidden`}
                >
                  <img
                    src={image.url}
                    alt={image.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextSibling.style.display = "flex";
                    }}
                  />
                  <div
                    className="hidden flex-col items-center justify-center text-theme-muted p-4"
                    style={{ display: "none" }}
                  >
                    <ImageIcon className="w-12 h-12 mb-2" />
                    <span className="text-xs text-center">
                      Preview unavailable
                    </span>
                  </div>
                </div>

                <div className="p-3 border-t border-theme">
                  <p
                    className="text-xs text-theme-text truncate font-medium"
                    title={image.name}
                  >
                    {image.name}
                  </p>
                  <p className="text-[10px] text-theme-muted mt-1">
                    {(image.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header - Modernized to match RunModes & ConfigEditor */}
      <div className="flex items-center justify-end">
        <div className="flex gap-3">
          <button
            onClick={() => fetchImages(true)}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-theme-card hover:bg-theme-hover border border-theme disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all hover:scale-105 shadow-sm"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={runTestMode}
            disabled={scriptLoading || status.running}
            className="flex items-center gap-2 px-6 py-2.5 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all shadow-lg hover:scale-105"
          >
            {scriptLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Start Test Mode
          </button>
        </div>
      </div>

      {/* Running Status */}
      {status.running && (
        <div className="bg-orange-950/40 rounded-xl p-4 border border-orange-600/50 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
            <div>
              <p className="font-medium text-orange-200">Script is running</p>
              <p className="text-sm text-orange-300/80">
                Mode: {status.current_mode || "Unknown"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      {images.length > 0 && (
        <div className="bg-theme-card rounded-xl p-4 border border-theme shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-theme-muted" />
            <input
              type="text"
              placeholder="Search test files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
            <p className="text-theme-muted">Loading test gallery...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-950/40 rounded-xl p-6 border-2 border-red-600/50 text-center shadow-sm">
          <ImageIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-red-300 mb-2">
            Error Loading Test Gallery
          </h3>
          <p className="text-red-200">{error}</p>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card border border-theme rounded-xl p-12 text-center shadow-sm">
          <ImageIcon className="w-16 h-16 text-theme-muted mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-theme-text mb-2">
            No Test Files Found
          </h3>
          <p className="text-theme-muted text-sm">
            {searchTerm
              ? "No test files match your search"
              : "Run the script in Testing mode to generate sample files"}
          </p>
        </div>
      ) : (
        <>
          {/* Gesamtanzahl & Controls */}
          <div className="bg-theme-card border border-theme rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-theme-text">
                  Total:{" "}
                  <span className="font-bold text-theme-primary text-lg">
                    {filteredImages.length}
                  </span>{" "}
                  Test files
                </span>
                {images.length !== filteredImages.length && (
                  <span className="ml-2 text-theme-muted text-sm bg-theme-bg px-2 py-1 rounded">
                    (filtered from {images.length} total)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setExpandedCategories({
                      posters: true,
                      backgrounds: true,
                      seasonPosters: true,
                      titleCards: true,
                    })
                  }
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-theme-hover hover:bg-theme-primary/20 border border-theme hover:border-theme-primary rounded-lg transition-all font-medium"
                >
                  <Expand className="w-4 h-4" />
                  Expand All
                </button>
                <button
                  onClick={() =>
                    setExpandedCategories({
                      posters: false,
                      backgrounds: false,
                      seasonPosters: false,
                      titleCards: false,
                    })
                  }
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-theme-hover hover:bg-theme-primary/20 border border-theme hover:border-theme-primary rounded-lg transition-all font-medium"
                >
                  <Minimize className="w-4 h-4" />
                  Collapse All
                </button>
              </div>
            </div>
          </div>

          {/* Kategorien */}
          <CategorySection
            title="Posters"
            images={categorizedImages.posters}
            categoryKey="posters"
            description="Test posters (PosterTextless.jpg)"
          />

          <CategorySection
            title="Backgrounds"
            images={categorizedImages.backgrounds}
            categoryKey="backgrounds"
            description="Test backgrounds (BackgroundTextless.jpg)"
          />

          <CategorySection
            title="Season Posters"
            images={categorizedImages.seasonPosters}
            categoryKey="seasonPosters"
            description="Test season posters (SeasonPosterTextless.jpg)"
          />

          <CategorySection
            title="Title Cards"
            images={categorizedImages.titleCards}
            categoryKey="titleCards"
            description="Test title cards (Short/Medium/Long Text, CAPS variants)"
          />
        </>
      )}

      {/* Image Modal - Enhanced */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-theme-card border border-theme-primary rounded-xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-theme-primary px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <ImageIcon className="w-6 h-6 text-white flex-shrink-0" />
                <h3 className="text-lg font-semibold text-white truncate">
                  {selectedImage.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-white/80 hover:text-white transition-all p-1 hover:bg-white/10 rounded flex-shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-theme-bg/30">
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "flex";
                }}
              />
              <div
                className="text-center flex-col items-center justify-center"
                style={{ display: "none" }}
              >
                <ImageIcon className="w-24 h-24 text-theme-muted mx-auto mb-4" />
                <p className="text-theme-muted text-sm">
                  Image preview not available
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-theme-bg px-6 py-4 rounded-b-xl flex justify-between items-center border-t-2 border-theme">
              <span className="text-sm text-theme-muted font-medium">
                Size: {(selectedImage.size / 1024).toFixed(2)} KB
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-sm font-medium transition-all text-white shadow-lg"
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
