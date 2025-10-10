import React from "react";
import { useLocation } from "react-router-dom";
import Gallery from "./Gallery";
import BackgroundsGallery from "./BackgroundsGallery";
import SeasonGallery from "./SeasonGallery";
import TitleCardGallery from "./TitleCardGallery";

function GalleryHub() {
  const location = useLocation();

  // Bestimme den aktiven Tab basierend auf der URL
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
      {/* Active Gallery - Tabs sind jetzt in der Sidebar */}
      <div>{renderGallery()}</div>
    </div>
  );
}

export default GalleryHub;
