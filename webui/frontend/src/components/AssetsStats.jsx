import React, { useState, useEffect } from "react";
import { Image, FolderOpen, HardDrive, Layers, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

const API_URL = "/api";

function AssetsStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/assets/stats`);
      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
        setError(null);
      } else {
        setError(data.error || "Failed to fetch assets stats");
      }
    } catch (err) {
      console.error("Error fetching assets stats:", err);
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEU: Funktion zum Refresh des Asset-Cache
  const refreshCache = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/refresh-cache`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Asset cache refreshed successfully!", {
          duration: 3000,
          position: "top-right",
        });
        // Lade Stats neu nach dem Refresh
        await fetchStats();
      } else {
        toast.error(`Failed to refresh cache: ${data.error}`, {
          duration: 4000,
          position: "top-right",
        });
      }
    } catch (err) {
      console.error("Error refreshing cache:", err);
      toast.error("Failed to refresh cache", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Image className="w-6 h-6 text-theme-primary" />
          Assets Overview
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Image className="w-6 h-6 text-theme-primary" />
          Assets Overview
        </h2>
        <div className="text-red-400 text-sm">Error: {error}</div>
      </div>
    );
  }

  const totalAssets =
    stats.posters + stats.backgrounds + stats.seasons + stats.titlecards;

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
      {/* ✅ NEU: Header mit Refresh-Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Image className="w-6 h-6 text-theme-primary" />
          Assets Overview
        </h2>
        <button
          onClick={refreshCache}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-theme-hover hover:bg-theme-primary/20 border border-theme rounded-lg transition-all disabled:opacity-50 text-sm"
          title="Refresh asset cache"
        >
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="text-theme-text">Refresh</span>
        </button>
      </div>

      {/* Asset Type Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">Posters</span>
            <Image className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.posters.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">Backgrounds</span>
            <Layers className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.backgrounds.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">Seasons</span>
            <FolderOpen className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.seasons.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">Title Cards</span>
            <Image className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.titlecards.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Total Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">Total Assets</span>
            <Image className="w-4 h-4 text-theme-primary" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {totalAssets.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">Total Size</span>
            <HardDrive className="w-4 h-4 text-theme-primary" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {formatSize(stats.total_size)}
          </div>
        </div>
      </div>

      {/* Top Folders */}
      {stats.folders && stats.folders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-theme-text flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-theme-primary" />
            Top Folders by File Count
          </h3>
          <div className="space-y-2">
            {stats.folders.slice(0, 5).map((folder, index) => (
              <div
                key={folder.name}
                className="flex items-center justify-between p-3 bg-theme-hover border border-theme rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-theme-muted text-sm font-mono">
                    #{index + 1}
                  </span>
                  <FolderOpen className="w-4 h-4 text-theme-primary" />
                  <span className="text-theme-text font-medium">
                    {folder.name}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-theme-muted text-sm">
                    {folder.files} files
                  </span>
                  <span className="text-theme-muted text-sm">
                    {formatSize(folder.size)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetsStats;
