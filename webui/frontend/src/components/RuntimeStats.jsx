import React, { useState, useEffect } from "react";
import {
  Clock,
  RefreshCw,
  Image,
  AlertTriangle,
  Film,
  Tv,
  Calendar,
} from "lucide-react";
import { useTranslation } from "react-i18next";

const API_URL = "/api";

let cachedRuntimeStats = null;

function RuntimeStats() {
  const { t } = useTranslation();
  const [runtimeStats, setRuntimeStats] = useState(
    cachedRuntimeStats || {
      runtime: null,
      total_images: 0,
      posters: 0,
      seasons: 0,
      backgrounds: 0,
      titlecards: 0,
      errors: 0,
      mode: null,
      timestamp: null,
      source: null,
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
        return;
      }
      const data = await response.json();
      if (data.success) {
        cachedRuntimeStats = data;
        setRuntimeStats(data);
      }
    } catch (error) {
      console.error("Error fetching runtime stats:", error);
    } finally {
      setLoading(false);
      if (!silent) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  };

  useEffect(() => {
    // Fetch on mount (silent mode)
    fetchRuntimeStats(true);
    fetchMigrationStatus();

    // Refresh every 30 seconds (silent)
    const interval = setInterval(() => fetchRuntimeStats(true), 30 * 1000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
        </div>
      </div>
    );
  }

  // Check if we have any runtime data
  const hasData = runtimeStats.runtime !== null;

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

      {!hasData ? (
        <div className="text-center py-8">
          <p className="text-theme-muted italic">{t("runtimeStats.noData")}</p>

          {/* Migration Info for empty state */}
          {migrationStatus && !migrationStatus.is_migrated && (
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-blue-400 text-sm">
                💡 <strong>{t("runtimeStats.migrationTip")}</strong>{" "}
                {t("runtimeStats.migrationDesc")}
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Run Info - Mode and Timestamp */}
          {(runtimeStats.mode || runtimeStats.timestamp) && (
            <div className="mb-4 p-3 bg-theme-hover rounded-lg border border-theme">
              <div className="flex items-center justify-between text-sm">
                {runtimeStats.mode && (
                  <div className="flex items-center gap-2">
                    <span className="text-theme-muted">
                      {t("dashboard.mode")}:
                    </span>
                    <span className="font-medium text-theme-primary capitalize">
                      {runtimeStats.mode}
                    </span>
                  </div>
                )}
                {runtimeStats.timestamp && (
                  <div className="flex items-center gap-2">
                    <span className="text-theme-muted">
                      {t("dashboard.lastRun")}:
                    </span>
                    <span className="font-medium text-theme-text">
                      {new Date(runtimeStats.timestamp).toLocaleString()}
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

            {/* Errors */}
            <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-theme-muted text-xs mb-1 font-medium">
                    {t("runtimeStats.errors")}
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      runtimeStats.errors > 0
                        ? "text-red-400"
                        : "text-green-400"
                    }`}
                  >
                    {runtimeStats.errors}
                  </p>
                </div>
                <div
                  className={`p-2 rounded-lg ${
                    runtimeStats.errors > 0
                      ? "bg-red-500/10"
                      : "bg-green-500/10"
                  }`}
                >
                  <AlertTriangle
                    className={`w-8 h-8 ${
                      runtimeStats.errors > 0
                        ? "text-red-400"
                        : "text-green-400"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

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
                  <div className="flex items-center justify-between p-3 bg-theme-hover rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-theme-primary" />
                      <span className="text-sm font-medium text-theme-text">
                        {t("runtimeStats.nextRun")}:
                      </span>
                    </div>
                    <span className="text-sm font-bold text-theme-primary">
                      {new Date(
                        runtimeStats.scheduler.next_run
                      ).toLocaleString()}
                    </span>
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
                        {runtimeStats.scheduler.schedules.map(
                          (schedule, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-theme-card border border-theme-primary/30 rounded-full text-sm text-theme-primary font-medium"
                            >
                              <Clock className="w-3 h-3" />
                              {schedule.time}
                            </span>
                          )
                        )}
                      </div>
                      {runtimeStats.scheduler.timezone && (
                        <p className="text-xs text-theme-muted mt-2">
                          {t("runtimeStats.timezone")}:{" "}
                          <span className="font-mono text-theme-text">
                            {runtimeStats.scheduler.timezone}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default RuntimeStats;
