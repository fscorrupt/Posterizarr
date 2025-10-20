import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { LayoutGrid, FolderTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import Gallery from "./Gallery";
import BackgroundsGallery from "./BackgroundsGallery";
import SeasonGallery from "./SeasonGallery";
import TitleCardGallery from "./TitleCardGallery";
import FolderView from "./FolderView";

function GalleryHub() {
  const { t } = useTranslation();
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
      {/* View Mode Toggle - Responsive */}
      <div className="bg-theme-card border border-theme-border rounded-lg p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-theme-text mb-1">
              {t("galleryHub.viewMode")}
            </h3>
            <p className="text-xs sm:text-sm text-theme-muted line-clamp-2 sm:line-clamp-none">
              {viewMode === "grid"
                ? t("galleryHub.gridDescription")
                : t("galleryHub.folderDescription")}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-all shadow-sm ${
                viewMode === "grid"
                  ? "bg-theme-primary text-white border-2 border-theme-primary"
                  : "bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text"
              }`}
            >
              <LayoutGrid className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                {t("galleryHub.gridView")}
              </span>
            </button>
            <button
              onClick={() => setViewMode("folder")}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-all shadow-sm ${
                viewMode === "folder"
                  ? "bg-theme-primary text-white border-2 border-theme-primary"
                  : "bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text"
              }`}
            >
              <FolderTree className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                {t("galleryHub.folderView")}
              </span>
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
