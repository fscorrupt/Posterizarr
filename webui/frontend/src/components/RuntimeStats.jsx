import React, { useState, useEffect, useRef } from "react";
import {
  Clock,
  RefreshCw,
  Loader2,
  Image,
  AlertTriangle,
  Film,
  Tv,
  Calendar,
  Globe,
  ImageOff,
  Type,
  Scissors,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDashboardLoading } from "../context/DashboardLoadingContext";
import {
  formatDateToLocale,
  formatTimestampWithTzInfo,
  getBrowserTimezone,
  isTimezoneDifferent,
} from "../utils/timeUtils";

const API_URL = "/api";

let cachedRuntimeStats = null;

function RuntimeStats() {
  const { t } = useTranslation();
  const { startLoading, finishLoading } = useDashboardLoading();
  const hasInitiallyLoaded = useRef(false);
  const [runtimeStats, setRuntimeStats] = useState(
    cachedRuntimeStats || {
      runtime: null,
      total_images: 0,
      posters: 0,
      seasons: 0,
      backgrounds: 0,
      titlecards: 0,
      collections: 0,
      errors: 0,
      tba_skipped: 0,
      jap_chines_skipped: 0,
      notification_sent: false,
      uptime_kuma: null,
      images_cleared: 0,
      folders_cleared: 0,
      space_saved: null,
      script_version: null,
      im_version: null,
      start_time: null,
      end_time: null,
      mode: null,
      timestamp: null,
      source: null,
      fallbacks: 0,
      textless: 0,
      truncated: 0,
      text: 0,
      scheduler: {
        enabled: false,
        schedules: [],
        next_run: null,
        timezone: null,
      },
    }
  );
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState(null);

  const fetchMigrationStatus = async () => {
    try {
      const response = await fetch(
        `${API_URL}/runtime-history/migration-status`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMigrationStatus(data);
        }
      }
    } catch (error) {
      console.debug("Could not fetch migration status:", error);
    }
  };

  const fetchRuntimeStats = async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const response = await fetch(`${API_URL}/runtime-stats`);
      if (!response.ok) {
        console.error("Failed to fetch runtime stats:", response.status);
        // Mark as loaded even on error to prevent infinite loading
        if (!hasInitiallyLoaded.current) {
          hasInitiallyLoaded.current = true;
          finishLoading("runtime-stats");
        }
        return;
      }
      const data = await response.json();

      // Always mark as loaded after receiving data, regardless of success status
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("runtime-stats");
      }

      if (data.success) {
        cachedRuntimeStats = data;
        setRuntimeStats(data);
      } else {
        // Even if no data available, store the empty response
        cachedRuntimeStats = data;
        setRuntimeStats(data);
      }
    } catch (error) {
      console.error("Error fetching runtime stats:", error);
      // Mark as loaded even on error to prevent infinite loading
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("runtime-stats");
      }
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
    // Register as loading and fetch on mount (silent mode)
    startLoading("runtime-stats");

    // Check cache first
    if (cachedRuntimeStats) {
      setRuntimeStats(cachedRuntimeStats);
      setLoading(false);
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("runtime-stats");
      }
    } else {
      fetchRuntimeStats(true);
    }

    fetchMigrationStatus();

    // Refresh every 30 seconds (silent)
    const interval = setInterval(() => {
      console.log("Auto-refreshing runtime stats...");
      fetchRuntimeStats(true);
    }, 30 * 1000);

    return () => {
      clearInterval(interval);
      // Don't finish loading on unmount - that happens when data is fetched
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
        </div>
      </div>
    );
  }

  // Check if we have any runtime data
  const hasData = runtimeStats.runtime !== null;

  // Don't render the card if there's no data
  if (!hasData) {
    return null;
  }

  return (
    <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
          <div className="p-2 rounded-lg bg-theme-primary/10">
            <Clock className="w-5 h-5 text-theme-primary" />
          </div>
          {t("dashboard.runtimeStats")}
        </h2>
        <button
          onClick={() => fetchRuntimeStats()}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-theme-muted hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-theme-hover rounded-lg"
          title={t("runtimeStats.refreshTooltip")}
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="text-sm font-medium">{t("common.refresh")}</span>
        </button>
      </div>

      {/* Run Info - Mode and Start Time */}
      {(runtimeStats.mode || runtimeStats.start_time) && (
        <div className="mb-4 p-3 bg-theme-hover rounded-lg border border-theme">
          <div className="flex items-center justify-between text-sm">
            {runtimeStats.mode && (
              <div className="flex items-center gap-2">
                <span className="text-theme-muted">{t("dashboard.mode")}:</span>
                <span className="font-medium text-theme-primary capitalize">
                  {runtimeStats.mode}
                </span>
              </div>
            )}
            {runtimeStats.start_time && (
              <div className="flex items-center gap-2">
                <span className="text-theme-muted">
                  {t("dashboard.lastRun")}:
                </span>
                <span className="font-medium text-theme-text">
                  {formatDateToLocale(runtimeStats.start_time)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Runtime Card */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-theme-muted text-sm mb-1 font-medium">
              {t("runtimeStats.executionTime")}
            </p>
            <p className="text-3xl font-bold text-theme-primary">
              {runtimeStats.runtime}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-theme-primary/10">
            <Clock className="w-12 h-12 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* Total Images */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("runtimeStats.totalImages")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.total_images}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Image className="w-8 h-8 text-blue-400" />
            </div>
          </div>
        </div>

        {/* Posters */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("assets.posters")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.posters}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-green-500/10">
              <Film className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>

        {/* Seasons */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("assets.seasons")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.seasons}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Tv className="w-8 h-8 text-orange-400" />
            </div>
          </div>
        </div>

        {/* Backgrounds */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("assets.backgrounds")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.backgrounds}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Image className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>

        {/* TitleCards */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("assets.titleCards")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.titlecards}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Tv className="w-8 h-8 text-cyan-400" />
            </div>
          </div>
        </div>

        {/* Collections */}
        {runtimeStats.collections > 0 && (
          <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-theme-muted text-xs mb-1 font-medium">
                  {t("assets.collections")}
                </p>
                <p className="text-2xl font-bold text-theme-text">
                  {runtimeStats.collections}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Film className="w-8 h-8 text-yellow-400" />
              </div>
            </div>
          </div>
        )}

        {/* Fallbacks */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("runtimeStats.fallbacks")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.fallbacks}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-amber-500/10">
              <ImageOff className="w-8 h-8 text-amber-400" />
            </div>
          </div>
        </div>

        {/* Textless */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("runtimeStats.textless")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.textless}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Image className="w-8 h-8 text-indigo-400" />
            </div>
          </div>
        </div>

        {/* Truncated */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("runtimeStats.truncated")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.truncated}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-pink-500/10">
              <Scissors className="w-8 h-8 text-pink-400" />
            </div>
          </div>
        </div>

        {/* Text */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("runtimeStats.text")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.text}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-teal-500/10">
              <Type className="w-8 h-8 text-teal-400" />
            </div>
          </div>
        </div>

        {/* TBA Skipped */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("runtimeStats.tbaSkipped")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.tba_skipped}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-500/10">
              <Film className="w-8 h-8 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Jap/Chines Skipped */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                {t("runtimeStats.japChinesSkipped")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {runtimeStats.jap_chines_skipped}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-gray-500/10">
              <Globe className="w-8 h-8 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Errors */}
        <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-xs mb-1 font-medium">
                Script Errors
              </p>
              <p
                className={`text-2xl font-bold ${
                  runtimeStats.errors > 0 ? "text-red-400" : "text-green-400"
                }`}
              >
                {runtimeStats.errors}
              </p>
            </div>
            <div
              className={`p-2 rounded-lg ${
                runtimeStats.errors > 0 ? "bg-red-500/10" : "bg-green-500/10"
              }`}
            >
              <AlertTriangle
                className={`w-8 h-8 ${
                  runtimeStats.errors > 0 ? "text-red-400" : "text-green-400"
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info Section */}
      <div className="mt-6 bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <h3 className="text-lg font-semibold text-theme-text mb-4">
          {t("runtimeStats.additionalInfo")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-theme-hover rounded-lg">
            <p className="text-theme-muted text-xs mb-1">
              {t("runtimeStats.notificationSent")}
            </p>
            <p
              className={`text-xl font-bold ${
                runtimeStats.notification_sent
                  ? "text-green-400"
                  : "text-red-400"
              }`}
            >
              {runtimeStats.notification_sent
                ? t("common.yes").toUpperCase()
                : t("common.no").toUpperCase()}
            </p>
          </div>
          <div className="p-3 bg-theme-hover rounded-lg">
            <p className="text-theme-muted text-xs mb-1">Uptime Kuma</p>
            <p
              className={`text-xl font-bold ${
                runtimeStats.uptime_kuma ? "text-green-400" : "text-red-400"
              }`}
            >
              {runtimeStats.uptime_kuma
                ? t("common.yes").toUpperCase()
                : t("common.no").toUpperCase()}
            </p>
          </div>
          <div className="p-3 bg-theme-hover rounded-lg">
            <p className="text-theme-muted text-xs mb-1">
              {t("runtimeStats.imagesCleared")}
            </p>
            <p className="text-xl font-bold text-theme-text">
              {runtimeStats.images_cleared}
            </p>
          </div>
          <div className="p-3 bg-theme-hover rounded-lg">
            <p className="text-theme-muted text-xs mb-1">
              {t("runtimeStats.foldersCleared")}
            </p>
            <p className="text-xl font-bold text-theme-text">
              {runtimeStats.folders_cleared}
            </p>
          </div>
          <div className="p-3 bg-theme-hover rounded-lg">
            <p className="text-theme-muted text-xs mb-1">
              {t("runtimeStats.spaceSaved")}
            </p>
            <p className="text-xl font-bold text-green-400">
              {runtimeStats.space_saved || "0"}
            </p>
          </div>
        </div>
      </div>

      {/* Version Information */}
      {(runtimeStats.script_version || runtimeStats.im_version) && (
        <div className="mt-6 bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <h3 className="text-lg font-semibold text-theme-text mb-4">
            {t("runtimeStats.versionInfo")}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {runtimeStats.script_version && (
              <div className="p-3 bg-theme-hover rounded-lg">
                <p className="text-theme-muted text-xs mb-1">
                  {t("runtimeStats.scriptVersion")}
                </p>
                <p className="text-lg font-bold text-theme-primary">
                  {runtimeStats.script_version}
                </p>
              </div>
            )}
            {runtimeStats.im_version && (
              <div className="p-3 bg-theme-hover rounded-lg">
                <p className="text-theme-muted text-xs mb-1">
                  {t("runtimeStats.imVersion")}
                </p>
                <p className="text-lg font-bold text-theme-primary">
                  {runtimeStats.im_version}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scheduler Information */}
      {runtimeStats.scheduler && runtimeStats.scheduler.enabled && (
        <div className="mt-6 bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-theme-primary/10">
              <Calendar className="w-5 h-5 text-theme-primary" />
            </div>
            <h3 className="text-lg font-semibold text-theme-text">
              {t("runtimeStats.scheduledRuns")}
            </h3>
          </div>

          <div className="space-y-3">
            {/* Next Run */}
            {runtimeStats.scheduler.next_run && (
              <div className="p-3 bg-theme-hover rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-theme-primary" />
                    <span className="text-sm font-medium text-theme-text">
                      {t("runtimeStats.nextRun")}:
                    </span>
                  </div>
                  <span className="text-sm font-bold text-theme-primary">
                    {formatDateToLocale(runtimeStats.scheduler.next_run)}
                  </span>
                </div>
                {/* Timezone info if different */}
                {(() => {
                  const schedulerTz = runtimeStats.scheduler.timezone;
                  if (schedulerTz && isTimezoneDifferent(schedulerTz)) {
                    const browserTz = getBrowserTimezone();
                    return (
                      <div className="flex items-center gap-1 text-xs text-theme-muted border-t border-theme-primary/20 pt-2">
                        <Globe className="w-3 h-3" />
                        <span>
                          {t("runtimeStats.displayedInYourTimezone")}:{" "}
                          <span className="font-mono">{browserTz}</span>
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* All Schedules */}
            {runtimeStats.scheduler.schedules &&
              runtimeStats.scheduler.schedules.length > 0 && (
                <div className="p-3 bg-theme-hover rounded-lg">
                  <p className="text-xs text-theme-muted mb-2 font-medium">
                    {t("runtimeStats.configuredSchedules")}:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {runtimeStats.scheduler.schedules.map((schedule, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-theme-card border border-theme-primary/30 rounded-full text-sm text-theme-primary font-medium"
                      >
                        <Clock className="w-3 h-3" />
                        {schedule.time}
                      </span>
                    ))}
                  </div>
                  {runtimeStats.scheduler.timezone && (
                    <div className="flex items-center gap-1 text-xs text-theme-muted mt-2">
                      <Globe className="w-3 h-3" />
                      <span>
                        {t("runtimeStats.schedulerTimezone")}:{" "}
                        <span className="font-mono text-theme-text">
                          {runtimeStats.scheduler.timezone}
                        </span>
                      </span>
                      {isTimezoneDifferent(runtimeStats.scheduler.timezone) && (
                        <span className="text-yellow-500 ml-1">
                          ({t("runtimeStats.differentFromBrowser")})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RuntimeStats;
