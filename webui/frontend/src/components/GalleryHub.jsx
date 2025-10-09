import React, { useState } from "react";
import { Image, Film, Tv, Layers } from "lucide-react";
import Gallery from "./Gallery";
import BackgroundsGallery from "./BackgroundsGallery";
import SeasonGallery from "./SeasonGallery";
import TitleCardGallery from "./TitleCardGallery";

function GalleryHub() {
  const [activeTab, setActiveTab] = useState("posters");

  const tabs = [
    { id: "posters", label: "Posters", icon: Image },
    { id: "backgrounds", label: "Backgrounds", icon: Layers },
    { id: "seasons", label: "Seasons", icon: Film },
    { id: "titlecards", label: "Title Cards", icon: Tv },
  ];

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
      {/* Sub-Navigation */}
      <div className="bg-theme-card border border-theme rounded-lg p-2">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-theme-primary text-white shadow-lg"
                    : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Gallery */}
      <div>{renderGallery()}</div>
    </div>
  );
}

export default GalleryHub;
