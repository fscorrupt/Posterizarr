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
  LayoutGrid,
  FolderTree,
  Trash2,
  Download,
  ChevronRight,
} from "lucide-react";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";

const API_URL = "/api";

function TestGallery() {
  const { showSuccess, showError, showInfo } = useToast();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Local error state for loading display
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem("test-gallery-view-mode");
    return saved || "grid";
  }); // "grid" or "folder"
  const [expandedFolders, setExpandedFolders] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

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

  // Organize images by folder structure
  const organizeByFolder = (images) => {
    const folderStructure = {};

    images.forEach((img) => {
      // Extract folder path from the image path
      const pathParts = img.path.split(/[\\/]/);
      const fileName = pathParts[pathParts.length - 1];
      const folderPath = pathParts.slice(0, -1).join("/");

      if (!folderStructure[folderPath]) {
        folderStructure[folderPath] = {
          path: folderPath,
          name: pathParts[pathParts.length - 2] || "root",
          images: [],
        };
      }

      folderStructure[folderPath].images.push(img);
    });

    return folderStructure;
  };

  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem("test-gallery-view-mode", mode);
  };

  const deleteImage = async (imagePath, imageName) => {
    try {
      const response = await fetch(`${API_URL}/test-gallery/delete`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: imagePath }),
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(`Deleted ${imageName}`);
        fetchImages(false);
        if (selectedImage && selectedImage.path === imagePath) {
          setSelectedImage(null);
        }
      } else {
        showError(`Failed to delete: ${data.message}`);
      }
    } catch (error) {
      showError(`Error deleting image: ${error.message}`);
    }
  };

  const previewImage = (image) => {
    setSelectedImage(image);
  };

  const downloadImage = (image) => {
    const link = document.createElement("a");
    link.href = image.url;
    link.download = image.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess(`Downloading ${image.name}`);
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
          className="w-full flex items-center justify-between p-4 bg-theme-card border border-theme-border rounded-lg hover:bg-theme-hover transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="text-left">
              <h3 className="text-lg font-semibold text-theme-text">{title}</h3>
              {description && (
                <p className="text-xs text-theme-muted mt-1">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 bg-black/20 rounded-full text-xs font-semibold text-theme-text">
              {images.length}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-theme-primary" />
            ) : (
              <ChevronDown className="w-5 h-5 text-theme-muted" />
            )}
          </div>
        </button>

        {isExpanded && (
          <div className={`mt-4 grid ${gridCols} gap-4`}>
            {images.map((image, index) => (
              <div
                key={index}
                className="group relative bg-theme-card rounded-lg border border-theme-border hover:border-theme-primary transition-all duration-200 overflow-hidden"
              >
                {/* Action Buttons Overlay */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm({
                      path: image.path,
                      name: image.name,
                    });
                  }}
                  className="absolute top-2 right-2 z-10 p-2 rounded-lg bg-red-600/90 hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadImage(image);
                  }}
                  className="absolute top-2 left-2 z-10 p-2 rounded-lg bg-blue-600/90 hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-all"
                  title="Download"
                >
                  <Download className="w-4 h-4 text-white" />
                </button>

                <div
                  className={`relative cursor-pointer ${aspectRatio} p-2`}
                  onClick={() => previewImage(image)}
                >
                  <img
                    src={image.url}
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

                <div className="p-3 border-t border-theme-border bg-theme-card">
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
        )}
      </div>
    );
  };

  // Folder View Component
  const FolderView = ({ folderStructure }) => {
    const folders = Object.values(folderStructure).sort((a, b) =>
      a.path.localeCompare(b.path)
    );

    return (
      <div className="space-y-4">
        {folders.map((folder) => {
          const isExpanded = expandedFolders[folder.path];
          return (
            <div
              key={folder.path}
              className="bg-theme-card border border-theme-border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggleFolder(folder.path)}
                className="w-full flex items-center justify-between p-4 hover:bg-theme-hover transition-all"
              >
                <div className="flex items-center gap-3">
                  <FolderTree className="w-5 h-5 text-theme-primary flex-shrink-0" />
                  <div className="text-left">
                    <h3 className="font-semibold text-theme-text">
                      {folder.name}
                    </h3>
                    <p className="text-xs text-theme-muted mt-0.5">
                      {folder.path}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 bg-black/20 rounded-full text-xs font-semibold text-theme-text">
                    {folder.images.length}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-theme-primary" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-theme-muted" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-theme-border bg-theme-bg/30">
                  <div className="p-4 space-y-2">
                    {folder.images.map((image, index) => (
                      <div
                        key={index}
                        className="group flex items-center gap-4 p-3 bg-theme-card rounded-lg border border-theme-border hover:border-theme-primary transition-all"
                      >
                        <div
                          className="w-24 h-16 flex-shrink-0 bg-gray-800 rounded overflow-hidden cursor-pointer"
                          onClick={() => previewImage(image)}
                        >
                          <img
                            src={image.url}
                            alt={image.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium text-theme-text truncate"
                            title={image.name}
                          >
                            {image.name}
                          </p>
                          <p className="text-xs text-theme-muted mt-1">
                            {(image.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => downloadImage(image)}
                            className="p-2 bg-blue-600/90 hover:bg-blue-700 text-white rounded-lg transition-all"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setDeleteConfirm({
                                path: image.path,
                                name: image.name,
                              })
                            }
                            className="p-2 bg-red-600/90 hover:bg-red-700 text-white rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-theme-card rounded-lg border border-theme-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-theme-text flex items-center gap-2">
            <TestTube className="w-5 h-5 text-theme-primary" />
            Test Gallery
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => fetchImages(true)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg"
            >
              <RefreshCw
                className={`w-5 h-5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <button
              onClick={runTestMode}
              disabled={scriptLoading || status.running}
              className="flex items-center gap-2 px-4 py-2 bg-theme-bg hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg"
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

      {/* Search bar and View Mode Toggle */}
      {images.length > 0 && (
        <div className="bg-theme-card rounded-lg border border-theme-border p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search test files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-theme-bg border border-theme-primary/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => changeViewMode("grid")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap shadow-sm ${
                  viewMode === "grid"
                    ? "bg-theme-primary text-white scale-105"
                    : "bg-theme-hover text-theme-text hover:bg-theme-primary/70 hover:scale-105"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                Grid
              </button>
              <button
                onClick={() => changeViewMode("folder")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap shadow-sm ${
                  viewMode === "folder"
                    ? "bg-theme-primary text-white scale-105"
                    : "bg-theme-hover text-theme-text hover:bg-theme-primary/70 hover:scale-105"
                }`}
              >
                <FolderTree className="w-4 h-4" />
                Folders
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 bg-theme-card rounded-xl border border-theme">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mb-4" />
          <p className="text-theme-muted">Loading test gallery...</p>
        </div>
      ) : error ? (
        <div className="bg-red-950/40 rounded-xl p-8 border-2 border-red-600/50 text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-red-600/20 mb-4">
              <ImageIcon className="w-12 h-12 text-red-400" />
            </div>
            <h3 className="text-2xl font-semibold text-red-300 mb-2">
              Error Loading Test Gallery
            </h3>
            <p className="text-red-200 text-sm mb-6 max-w-md">{error}</p>
            <button
              onClick={() => fetchImages(true)}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all shadow-lg hover:scale-105"
            >
              <RefreshCw className="w-5 h-5" />
              Try Again
            </button>
          </div>
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="bg-theme-card rounded-xl p-12 border border-theme text-center">
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-theme-primary/20 mb-4">
              <ImageIcon className="w-12 h-12 text-theme-primary" />
            </div>
            <h3 className="text-2xl font-semibold text-theme-text mb-2">
              {searchTerm ? "No Matching Test Files" : "No Test Files Found"}
            </h3>
            <p className="text-theme-muted max-w-md">
              {searchTerm
                ? "Try adjusting your search terms to find what you're looking for"
                : "Run the script in Testing mode to generate sample files"}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Gesamtanzahl & Controls */}
          <div className="bg-theme-card rounded-xl p-4 border border-theme">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-text font-medium">
                Showing {filteredImages.length} test file
                {filteredImages.length !== 1 ? "s" : ""}
              </span>
              {images.length !== filteredImages.length && (
                <span className="text-theme-primary font-semibold">
                  Filtered from {images.length} total
                </span>
              )}
            </div>
            {(viewMode === "grid" || viewMode === "folder") && (
              <div className="flex gap-2 mt-3 justify-end">
                {viewMode === "grid" && (
                  <>
                    <button
                      onClick={() =>
                        setExpandedCategories({
                          posters: true,
                          backgrounds: true,
                          seasonPosters: true,
                          titleCards: true,
                        })
                      }
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium"
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
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium"
                    >
                      <Minimize className="w-4 h-4" />
                      Collapse All
                    </button>
                  </>
                )}
                {viewMode === "folder" && (
                  <>
                    <button
                      onClick={() => {
                        const folderStructure =
                          organizeByFolder(filteredImages);
                        const allFolders = Object.keys(folderStructure).reduce(
                          (acc, key) => {
                            acc[key] = true;
                            return acc;
                          },
                          {}
                        );
                        setExpandedFolders(allFolders);
                      }}
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium"
                    >
                      <Expand className="w-4 h-4" />
                      Expand All
                    </button>
                    <button
                      onClick={() => setExpandedFolders({})}
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-theme-hover hover:bg-theme-primary/70 border border-theme-border rounded-lg transition-all font-medium"
                    >
                      <Minimize className="w-4 h-4" />
                      Collapse All
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Grid View */}
          {viewMode === "grid" && (
            <>
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

          {/* Folder View */}
          {viewMode === "folder" && (
            <FolderView folderStructure={organizeByFolder(filteredImages)} />
          )}
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
              <div className="flex gap-2">
                <button
                  onClick={() => downloadImage(selectedImage)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-all text-white shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => {
                    setDeleteConfirm({
                      path: selectedImage.path,
                      name: selectedImage.name,
                    });
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-all text-white shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-sm font-medium transition-all text-white shadow-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteImage(deleteConfirm.path, deleteConfirm.name);
          }
        }}
        title="Delete Test File"
        message="Are you sure you want to delete this test file? This action cannot be undone."
        itemName={deleteConfirm?.name}
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
}

export default TestGallery;
