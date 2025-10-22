import React, { useState, useEffect } from "react";
import {
  Image,
  FolderOpen,
  HardDrive,
  Layers,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApi } from "../context/ApiContext";

function AssetsStats({ cachedData, onSuccess, onError }) {
  const { t } = useTranslation();
  const api = useApi();
  const [stats, setStats] = useState(cachedData?.stats || null);
  const [loading, setLoading] = useState(!cachedData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Update stats when cached data changes
  useEffect(() => {
    if (cachedData?.stats) {
      setStats(cachedData.stats);
      setLoading(false);
      setError(null);
    } else if (!stats) {
      // Fetch nur wenn keine cached data und keine stats vorhanden
      fetchStats();
    }
  }, [cachedData]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await api.getAssetsStats(true);

      if (data.success) {
        setStats(data.stats);
        setError(null);
      } else {
        setError(data.error || t("assetsStats.fetchError"));
      }
    } catch (err) {
      console.error("Error fetching assets stats:", err);
      setError(t("assetsStats.apiError"));
    } finally {
      setLoading(false);
    }
  };

  const refreshCache = async () => {
    setRefreshing(true);
    try {
      const data = await api.refreshCache();

      if (data.success) {
        if (onSuccess) onSuccess(t("assetsStats.refreshSuccess"));
        // Lade Stats neu nach dem Refresh
        await fetchStats();
      } else {
        if (onError)
          onError(t("assetsStats.refreshError", { error: data.error }));
      }
    } catch (err) {
      console.error("Error refreshing cache:", err);
      if (onError) onError(t("assetsStats.refreshFailed"));
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

  if (loading && !stats) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Image className="w-6 h-6 text-theme-primary" />
          {t("assetsStats.title")}
        </h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Image className="w-6 h-6 text-theme-primary" />
          {t("assetsStats.title")}
        </h2>
        <div className="text-red-400 text-sm">
          {t("assetsStats.error")}: {error}
        </div>
      </div>
    );
  }

  const totalAssets =
    stats.posters + stats.backgrounds + stats.seasons + stats.titlecards;

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Image className="w-6 h-6 text-theme-primary" />
          {t("assetsStats.title")}
        </h2>
        <button
          onClick={refreshCache}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-theme-hover hover:bg-theme-primary/20 border border-theme rounded-lg transition-all disabled:opacity-50 text-sm"
          title={t("assetsStats.refreshTooltip")}
        >
          <RefreshCw
            className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="text-theme-text">{t("common.refresh")}</span>
        </button>
      </div>

      {/* Asset Type Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">
              {t("assetsStats.posters")}
            </span>
            <Image className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.posters.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">
              {t("assetsStats.backgrounds")}
            </span>
            <Layers className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.backgrounds.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">
              {t("assetsStats.seasons")}
            </span>
            <FolderOpen className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.seasons.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">
              {t("assetsStats.titleCards")}
            </span>
            <Layers className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {stats.titlecards.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Total and Size */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">
              {t("assetsStats.totalAssets")}
            </span>
            <Image className="w-4 h-4 text-theme-primary" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {totalAssets.toLocaleString()}
          </div>
        </div>

        <div className="bg-theme-hover border border-theme rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-theme-muted text-sm">
              {t("assetsStats.totalSize")}
            </span>
            <HardDrive className="w-4 h-4 text-theme-primary" />
          </div>
          <div className="text-2xl font-bold text-theme-text">
            {formatSize(stats.total_size)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AssetsStats;
