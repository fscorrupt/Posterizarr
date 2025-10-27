import React, { useState, useEffect, useRef } from "react";
import {
  Cpu,
  HardDrive,
  Server,
  RefreshCw,
  Monitor,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDashboardLoading } from "../context/DashboardLoadingContext";

const API_URL = "/api";

let cachedSystemInfo = null;

function SystemInfo() {
  const { t } = useTranslation();
  const { startLoading, finishLoading } = useDashboardLoading();
  const hasInitiallyLoaded = useRef(false);
  const [systemInfo, setSystemInfo] = useState(
    cachedSystemInfo || {
      platform: "Loading...",
      os_version: "Loading...",
      cpu_model: "Loading...",
      cpu_cores: 0,
      total_memory: "Loading...",
      used_memory: "Loading...",
      free_memory: "Loading...",
      memory_percent: 0,
    }
  );
  const [loading, setLoading] = useState(false); // No initial loading
  const [refreshing, setRefreshing] = useState(false);

  const fetchSystemInfo = async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(`${API_URL}/system-info`);
      if (!response.ok) {
        console.error("Failed to fetch system info:", response.status);
        return;
      }
      const data = await response.json();
      cachedSystemInfo = data; // Save to persistent cache
      setSystemInfo(data);

      // Mark as loaded after first successful fetch
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("system-info");
      }
    } catch (error) {
      console.error("Error fetching system info:", error);
    } finally {
      setLoading(false);
      if (!silent) {
        setTimeout(() => {
          setRefreshing(false);
        }, 500);
      }
    }
  };

  useEffect(() => {
    // Register as loading component and fetch data
    startLoading("system-info");
    fetchSystemInfo(true);

    // Optional: Alle 5 Minuten im Hintergrund aktualisieren (silent)
    const interval = setInterval(() => fetchSystemInfo(true), 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      // Don't finish loading on unmount - that happens when data is fetched
    };
  }, [startLoading]);

  // Format memory percentage color
  const getMemoryColor = (percent) => {
    if (percent >= 90) return "text-red-400";
    if (percent >= 75) return "text-orange-400";
    if (percent >= 50) return "text-yellow-400";
    return "text-green-400";
  };

  const getMemoryBarColor = (percent) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 75) return "bg-orange-500";
    if (percent >= 50) return "bg-yellow-500";
    return "bg-green-500";
  };

  // Check if data is valid (not "Unknown" or "Loading...")
  const isValidData = (value) => {
    return value && value !== "Unknown" && value !== "Loading...";
  };

  if (loading) {
    return (
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
          <div className="p-2 rounded-lg bg-theme-primary/10">
            <Server className="w-5 h-5 text-theme-primary" />
          </div>
          {t("dashboard.systemInfo")}
        </h2>
        <button
          onClick={() => fetchSystemInfo()}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-theme-muted hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-theme-hover rounded-lg"
          title={t("systemInfo.refreshTooltip")}
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="text-sm font-medium">{t("common.refresh")}</span>
        </button>
      </div>

      {/* System Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Platform Card */}
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-theme-muted text-sm mb-1 font-medium">
                {t("systemInfo.platform")}
              </p>
              <p className="text-2xl font-bold text-theme-text mb-2">
                {systemInfo.platform}
              </p>
              <p className="text-xs text-theme-muted break-words">
                {systemInfo.os_version}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-theme-primary/10 flex-shrink-0 ml-3">
              <Monitor className="w-12 h-12 text-blue-400" />
            </div>
          </div>
        </div>

        {/* CPU Card - Improved Layout */}
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-theme-muted text-sm mb-1 font-medium">
                {t("systemInfo.cpuModel")}
              </p>

              {/* CPU Name or Fallback */}
              {isValidData(systemInfo.cpu_model) ? (
                <p
                  className="text-base font-bold text-theme-text mb-2 break-words line-clamp-2"
                  title={systemInfo.cpu_model}
                >
                  {systemInfo.cpu_model}
                </p>
              ) : (
                <p className="text-base font-bold text-theme-muted mb-2 italic">
                  {t("systemInfo.cpuUnavailable")}
                </p>
              )}

              {/* Cores Badge */}
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-theme-primary text-white">
                {systemInfo.cpu_cores > 0
                  ? t("systemInfo.cores", { count: systemInfo.cpu_cores })
                  : t("systemInfo.unknownCores")}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-theme-primary/10 flex-shrink-0">
              <Cpu className="w-12 h-12 text-orange-400" />
            </div>
          </div>
        </div>

        {/* Memory Card - Improved Error Handling */}
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <p className="text-theme-muted text-sm mb-1 font-medium">
                {t("systemInfo.memoryUsage")}
              </p>

              {/* Memory Percentage or Fallback */}
              {isValidData(systemInfo.total_memory) &&
              systemInfo.memory_percent > 0 ? (
                <p
                  className={`text-2xl font-bold ${getMemoryColor(
                    systemInfo.memory_percent
                  )}`}
                >
                  {systemInfo.memory_percent}%
                </p>
              ) : (
                <p className="text-2xl font-bold text-theme-muted italic">
                  N/A
                </p>
              )}
            </div>
            <div className="p-3 rounded-lg bg-theme-primary/10">
              <HardDrive className="w-12 h-12 text-green-400" />
            </div>
          </div>

          {/* Memory Progress Bar */}
          {isValidData(systemInfo.total_memory) &&
          systemInfo.memory_percent > 0 ? (
            <>
              <div className="mb-3">
                <div className="w-full bg-theme rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${getMemoryBarColor(
                      systemInfo.memory_percent
                    )}`}
                    style={{ width: `${systemInfo.memory_percent}%` }}
                  ></div>
                </div>
              </div>

              {/* Memory Details */}
              <div className="flex items-center justify-between text-xs text-theme-muted">
                <span>
                  {systemInfo.used_memory} / {systemInfo.total_memory}
                </span>
                <span className="text-green-400">
                  {systemInfo.free_memory} {t("systemInfo.free")}
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs text-theme-muted italic text-center py-2">
              {t("systemInfo.memoryUnavailable")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SystemInfo;
