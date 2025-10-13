import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { LayoutGrid, FolderTree } from "lucide-react";
import Gallery from "./Gallery";
import BackgroundsGallery from "./BackgroundsGallery";
import SeasonGallery from "./SeasonGallery";
import TitleCardGallery from "./TitleCardGallery";
import FolderView from "./FolderView";

function GalleryHub() {
  const location = useLocation();

  // View mode: 'grid' (default/current) or 'folder'
  const [viewMode, setViewMode] = useState(() => {
    const saved = localStorage.getItem("gallery-view-mode");
    return saved || "grid";
  });

  // Save view mode to localStorage and notify other components
  useEffect(() => {
    localStorage.setItem("gallery-view-mode", viewMode);
    // Dispatch custom event to notify Sidebar
    window.dispatchEvent(new Event("viewModeChanged"));
  }, [viewMode]);

  const getActiveTabFromPath = () => {
    if (location.pathname.includes("/backgrounds")) return "backgrounds";
    if (location.pathname.includes("/seasons")) return "seasons";
    if (location.pathname.includes("/titlecards")) return "titlecards";
    return "posters"; // Default
  };

  const activeTab = getActiveTabFromPath();

  const renderGallery = () => {
    switch (activeTab) {
      case "posters":
        return <Gallery />;
      case "backgrounds":
        return <BackgroundsGallery />;
      case "seasons":
        return <SeasonGallery />;
      case "titlecards":
        return <TitleCardGallery />;
      default:
        return <Gallery />;
    }
  };

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="bg-theme-card border border-theme-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-theme-text mb-1">
              View Mode
            </h3>
            <p className="text-sm text-theme-muted">
              {viewMode === "grid"
                ? "Browse all assets by type (posters, backgrounds, seasons, titlecards)"
                : "Browse assets by navigating through libraries and folders"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-theme-primary text-white"
                  : "bg-theme-hover hover:bg-theme-primary/70 border border-theme-border text-theme-text"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="text-sm font-medium">Grid View</span>
            </button>
            <button
              onClick={() => setViewMode("folder")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                viewMode === "folder"
                  ? "bg-theme-primary text-white"
                  : "bg-theme-hover hover:bg-theme-primary/70 border border-theme-border text-theme-text"
              }`}
            >
              <FolderTree className="w-4 h-4" />
              <span className="text-sm font-medium">Folder View</span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Gallery or Folder View */}
      <div>{viewMode === "folder" ? <FolderView /> : renderGallery()}</div>
    </div>
  );
}

export default GalleryHub;
