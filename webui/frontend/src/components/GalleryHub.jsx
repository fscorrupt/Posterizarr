import React from "react";
import { useLocation } from "react-router-dom";
import Gallery from "./Gallery";
import BackgroundsGallery from "./BackgroundsGallery";
import SeasonGallery from "./SeasonGallery";
import TitleCardGallery from "./TitleCardGallery";

function GalleryHub() {
  const location = useLocation();

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
      {/* Active Gallery*/}
      <div>{renderGallery()}</div>
    </div>
  );
}

export default GalleryHub;
