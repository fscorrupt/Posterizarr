import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  RefreshCw,
  Loader2,
  Image,
  AlertTriangle,
  Film,
  Tv,
  ChevronLeft,
  ChevronRight,
  Database,
  TrendingUp,
  ChevronDown,
  X,
  Info,
  ImageOff,
  Type,
  Scissors,
  FileText,
  Globe,
} from "lucide-react";
import {
  formatDateToLocale,
  getBrowserTimezone,
  isTimezoneDifferent,
} from "../utils/timeUtils";

const API_URL = "/api";

// Cache for history data
let cachedHistory = [];
let cachedSummary = null;
let cachedMigrationStatus = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

// date parsing/formatting handled by ../utils/timeUtils (browser-localized display)

function RuntimeHistory() {
  const { t } = useTranslation();
  const [history, setHistory] = useState(cachedHistory);
  const [summary, setSummary] = useState(cachedSummary);
  const [migrationStatus, setMigrationStatus] = useState(cachedMigrationStatus);
  const [loading, setLoading] = useState(!cachedHistory.length);
  const [refreshing, setRefreshing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [limit] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [modeFilter, setModeFilter] = useState(null);
  const [summaryDays, setSummaryDays] = useState(30);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Dropdown states
  const [summaryDaysDropdownOpen, setSummaryDaysDropdownOpen] = useState(false);
  const [modeFilterDropdownOpen, setModeFilterDropdownOpen] = useState(false);
  const [summaryDaysDropdownUp, setSummaryDaysDropdownUp] = useState(false);
  const [modeFilterDropdownUp, setModeFilterDropdownUp] = useState(false);
  const summaryDaysDropdownRef = useRef(null);
  const modeFilterDropdownRef = useRef(null);

  const fetchHistory = async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const offset = currentPage * limit;
      const modeParam = modeFilter ? `&mode=${modeFilter}` : "";
      const response = await fetch(
        `${API_URL}/runtime-history?limit=${limit}&offset=${offset}${modeParam}`
      );

      if (!response.ok) {
        console.error("Failed to fetch runtime history:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        cachedHistory = data.history;
        setHistory(data.history);
        setTotalCount(data.total || 0);
        lastFetchTime = Date.now();
      }
    } catch (error) {
      console.error("Error fetching runtime history:", error);
    } finally {
      setLoading(false);
      if (!silent) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  };

  const fetchSummary = async (silent = false) => {
    try {
      const response = await fetch(
        `${API_URL}/runtime-summary?days=${summaryDays}`
      );

      if (!response.ok) {
        console.error("Failed to fetch runtime summary:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        cachedSummary = data.summary;
        setSummary(data.summary);
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching runtime summary:", error);
      }
    }
  };

  const fetchMigrationStatus = async (silent = false) => {
    try {
      const response = await fetch(
        `${API_URL}/runtime-history/migration-status`
      );

      if (!response.ok) {
        console.error("Failed to fetch migration status:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        cachedMigrationStatus = data;
        setMigrationStatus(data);
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching migration status:", error);
      }
    }
  };

  const triggerMigration = async () => {
    if (migrating) return;

    setMigrating(true);
    try {
      const response = await fetch(`${API_URL}/runtime-history/migrate`, {
        method: "POST",
      });

      if (!response.ok) {
        console.error("Failed to trigger migration:", response.status);
        alert("Failed to trigger migration. Check console for details.");
        return;
      }

      const data = await response.json();
      if (data.success) {
        if (data.already_migrated) {
          alert("Migration was already completed!");
          // Update migration status immediately
          setMigrationStatus({
            ...migrationStatus,
            is_migrated: true,
          });
        } else {
          alert(
            `Migration completed!\n\nImported: ${data.imported}\nSkipped: ${data.skipped}\nErrors: ${data.errors}`
          );
          // Update migration status to hide banner
          setMigrationStatus({
            ...migrationStatus,
            is_migrated: true,
            migration_info: {
              migrated_entries: {
                value: data.imported.toString(),
                updated_at: new Date().toISOString(),
              },
            },
          });
        }
        // Refresh all data
        fetchHistory();
        fetchSummary();
        fetchMigrationStatus();
      }
    } catch (error) {
      console.error("Error triggering migration:", error);
      alert("Error triggering migration. Check console for details.");
    } finally {
      setMigrating(false);
    }
  };

  const triggerJsonImport = async () => {
    if (importing) return;

    setImporting(true);
    try {
      const response = await fetch(`${API_URL}/runtime-history/import-json`, {
        method: "POST",
      });

      if (!response.ok) {
        console.error("Failed to import JSON files:", response.status);
        alert("Failed to import JSON files. Check console for details.");
        return;
      }

      const data = await response.json();
      if (data.success) {
        alert("JSON files imported successfully!");
        // Refresh all data
        fetchHistory();
        fetchSummary();
      }
    } catch (error) {
      console.error("Error importing JSON files:", error);
      alert("Error importing JSON files. Check console for details.");
    } finally {
      setImporting(false);
    }
  };

  const triggerFormatMigration = async () => {
    if (
      !confirm(
        "This will update all runtime entries to the new format (0h:2m:12s). Continue?"
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/runtime-history/migrate-format`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        console.error("Failed to migrate format:", response.status);
        alert("Failed to migrate runtime format. Check console for details.");
        return;
      }

      const data = await response.json();
      if (data.success) {
        alert(
          `Format migration completed!\n\nUpdated ${data.updated_count} entries to new format (Xh:Ym:Zs)`
        );
        // Refresh all data
        fetchHistory();
        fetchSummary();
      }
    } catch (error) {
      console.error("Error migrating format:", error);
      alert("Error migrating runtime format. Check console for details.");
    }
  };

  useEffect(() => {
    fetchHistory(true);
    fetchSummary();
    fetchMigrationStatus();
  }, [currentPage, modeFilter, summaryDays]);

  // Function to calculate dropdown position
  const calculateDropdownPosition = (ref) => {
    if (!ref.current) return false;

    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If more space above than below, open upward
    return spaceAbove > spaceBelow;
  };

  // Click outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        summaryDaysDropdownRef.current &&
        !summaryDaysDropdownRef.current.contains(event.target)
      ) {
        setSummaryDaysDropdownOpen(false);
      }
      if (
        modeFilterDropdownRef.current &&
        !modeFilterDropdownRef.current.contains(event.target)
      ) {
        setModeFilterDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (history.length === limit) {
      setCurrentPage(currentPage + 1);
    }
  };

  const getModeColor = (mode) => {
    const colors = {
      normal: "bg-blue-500/10 text-blue-400 border-blue-500/30",
      testing: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
      manual: "bg-purple-500/10 text-purple-400 border-purple-500/30",
      scheduled: "bg-green-500/10 text-green-400 border-green-500/30",
      backup: "bg-orange-500/10 text-orange-400 border-orange-500/30",
      syncjelly: "bg-pink-500/10 text-pink-400 border-pink-500/30",
      syncemby: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
      reset: "bg-red-500/10 text-red-400 border-red-500/30",
    };
    return colors[mode] || "bg-gray-500/10 text-gray-400 border-gray-500/30";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">{t("runtimeHistory.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Migration Status Banner */}
      {migrationStatus && !migrationStatus.is_migrated && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
                <Database className="w-5 h-5" />
                {t("runtimeHistory.migrationAvailable")}
              </h3>
              <p className="text-blue-300 text-sm mb-3">
                {t("runtimeHistory.migrationDescription")}
              </p>
              <p className="text-blue-200 text-xs">
                {t("runtimeHistory.migrationInfo")}
              </p>
            </div>
            <button
              onClick={triggerMigration}
              disabled={migrating}
              className="ml-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {migrating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t("runtimeHistory.migrating")}
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  {t("runtimeHistory.runMigration")}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Summary Statistics */}
      {summary && (
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
              <div className="p-2 rounded-lg bg-theme-primary/10">
                <TrendingUp className="w-5 h-5 text-theme-primary" />
              </div>
              {t("runtimeHistory.summary", { days: summaryDays })}
            </h2>
            <div className="relative" ref={summaryDaysDropdownRef}>
              <button
                onClick={() => {
                  const shouldOpenUp = calculateDropdownPosition(
                    summaryDaysDropdownRef
                  );
                  setSummaryDaysDropdownUp(shouldOpenUp);
                  setSummaryDaysDropdownOpen(!summaryDaysDropdownOpen);
                }}
                className="px-3 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text text-sm hover:bg-theme-bg hover:border-theme-primary/50 focus:outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary transition-all shadow-sm flex items-center gap-2"
              >
                <span>{t("runtimeHistory.days", { count: summaryDays })}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    summaryDaysDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {summaryDaysDropdownOpen && (
                <div
                  className={`absolute z-50 right-0 ${
                    summaryDaysDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                  } bg-theme-card border border-theme-primary rounded-lg shadow-xl overflow-hidden min-w-[120px] max-h-60 overflow-y-auto`}
                >
                  {[7, 30, 90].map((value) => (
                    <button
                      key={value}
                      onClick={() => {
                        setSummaryDays(value);
                        setSummaryDaysDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-sm transition-all text-left ${
                        summaryDays === value
                          ? "bg-theme-primary text-white"
                          : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                      }`}
                    >
                      {t("runtimeHistory.days", { count: value })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Runs */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">
                {t("runtimeHistory.totalRuns")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {summary.total_runs}
              </p>
            </div>

            {/* Total Images */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">
                {t("runtimeHistory.totalImages")}
              </p>
              <p className="text-2xl font-bold text-theme-primary">
                {summary.total_images.toLocaleString()}
              </p>
            </div>

            {/* Average Runtime */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">
                {t("runtimeHistory.avgRuntime")}
              </p>
              <p className="text-2xl font-bold text-theme-text">
                {summary.average_runtime_formatted}
              </p>
            </div>

            {/* Total Errors */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">
                {t("runtimeHistory.totalErrors")}
              </p>
              <p
                className={`text-2xl font-bold ${
                  summary.total_errors > 0 ? "text-red-400" : "text-green-400"
                }`}
              >
                {summary.total_errors}
              </p>
            </div>

            {/* Total Collections (if available) */}
            {summary.total_collections > 0 && (
              <div className="p-4 bg-theme-hover rounded-lg border border-theme">
                <p className="text-theme-muted text-xs mb-1">
                  {t("runtimeHistory.totalCollections")}
                </p>
                <p className="text-2xl font-bold text-theme-text">
                  {summary.total_collections}
                </p>
              </div>
            )}

            {/* Space Saved (if available) */}
            {summary.total_space_saved && (
              <div className="p-4 bg-theme-hover rounded-lg border border-theme">
                <p className="text-theme-muted text-xs mb-1">
                  {t("runtimeHistory.totalSpaceSaved")}
                </p>
                <p className="text-2xl font-bold text-green-400">
                  {summary.total_space_saved}
                </p>
              </div>
            )}
          </div>

          {/* Mode Counts */}
          {summary.mode_counts &&
            Object.keys(summary.mode_counts).length > 0 && (
              <div className="mt-4 p-4 bg-theme-hover rounded-lg border border-theme">
                <p className="text-theme-muted text-xs mb-3">
                  {t("runtimeHistory.runsByMode")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(summary.mode_counts).map(([mode, count]) => (
                    <span
                      key={mode}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm border ${getModeColor(
                        mode
                      )}`}
                    >
                      <span className="capitalize">{mode}</span>
                      <span className="ml-2 font-bold">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Runtime Stats Section */}
      {summary && summary.latest_run && (
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          {/* Header with Mode and Last Run */}
          <div className="bg-theme-hover rounded-lg p-4 mb-6 border border-theme">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-theme-primary/10">
                  <Clock className="w-5 h-5 text-theme-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-theme-text">
                    {t("dashboard.runtimeStats")}
                  </h2>
                </div>
              </div>
            </div>

            {/* Mode and Timestamp Row */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-theme">
              {summary.latest_run.mode && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-theme-muted font-medium">
                    {t("dashboard.mode")}:
                  </span>
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs border capitalize font-semibold ${getModeColor(
                      summary.latest_run.mode
                    )}`}
                  >
                    {summary.latest_run.mode}
                  </span>
                </div>
              )}
              {summary.latest_run.start_time && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-theme-muted font-medium">
                    {t("runtimeStats.lastRun")}:
                  </span>
                  <span className="text-sm text-theme-text font-mono">
                    {formatDateToLocale(summary.latest_run.start_time)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Runtime Card */}
          {summary.latest_run.runtime_formatted && (
            <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm mb-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-theme-muted text-sm mb-1 font-medium">
                    {t("runtimeStats.executionTime")}
                  </p>
                  <p className="text-3xl font-bold text-theme-primary">
                    {summary.latest_run.runtime_formatted}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-theme-primary/10">
                  <Clock className="w-12 h-12 text-purple-400" />
                </div>
              </div>
            </div>
          )}

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
                    {summary.latest_run.total_images || 0}
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
                    {summary.latest_run.posters || 0}
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
                    {summary.latest_run.seasons || 0}
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
                    {summary.latest_run.backgrounds || 0}
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
                    {summary.latest_run.titlecards || 0}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-cyan-500/10">
                  <Tv className="w-8 h-8 text-cyan-400" />
                </div>
              </div>
            </div>

            {/* Collections */}
            {summary.latest_run.collections > 0 && (
              <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-theme-muted text-xs mb-1 font-medium">
                      {t("assets.collections")}
                    </p>
                    <p className="text-2xl font-bold text-theme-text">
                      {summary.latest_run.collections}
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
                    {summary.latest_run.fallbacks || 0}
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
                    {summary.latest_run.textless || 0}
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
                    {summary.latest_run.truncated || 0}
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
                    {summary.latest_run.text || 0}
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
                    {summary.latest_run.tba_skipped || 0}
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
                    {summary.latest_run.jap_chines_skipped || 0}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-gray-500/10">
                  <Globe className="w-8 h-8 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Script Errors */}
            <div className="bg-theme-card rounded-xl p-4 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-theme-muted text-xs mb-1 font-medium">
                    Script Errors
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      summary.latest_run.errors > 0
                        ? "text-red-400"
                        : "text-green-400"
                    }`}
                  >
                    {summary.latest_run.errors || 0}
                  </p>
                </div>
                <div
                  className={`p-2 rounded-lg ${
                    summary.latest_run.errors > 0
                      ? "bg-red-500/10"
                      : "bg-green-500/10"
                  }`}
                >
                  <AlertTriangle
                    className={`w-8 h-8 ${
                      summary.latest_run.errors > 0
                        ? "text-red-400"
                        : "text-green-400"
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
                    summary.latest_run.notification_sent
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {summary.latest_run.notification_sent
                    ? t("common.yes").toUpperCase()
                    : t("common.no").toUpperCase()}
                </p>
              </div>
              <div className="p-3 bg-theme-hover rounded-lg">
                <p className="text-theme-muted text-xs mb-1">Uptime Kuma</p>
                <p
                  className={`text-xl font-bold ${
                    summary.latest_run.uptime_kuma
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {summary.latest_run.uptime_kuma
                    ? t("common.yes").toUpperCase()
                    : t("common.no").toUpperCase()}
                </p>
              </div>
              <div className="p-3 bg-theme-hover rounded-lg">
                <p className="text-theme-muted text-xs mb-1">
                  {t("runtimeStats.imagesCleared")}
                </p>
                <p className="text-xl font-bold text-theme-text">
                  {summary.latest_run.images_cleared || 0}
                </p>
              </div>
              <div className="p-3 bg-theme-hover rounded-lg">
                <p className="text-theme-muted text-xs mb-1">
                  {t("runtimeStats.foldersCleared")}
                </p>
                <p className="text-xl font-bold text-theme-text">
                  {summary.latest_run.folders_cleared || 0}
                </p>
              </div>
              <div className="p-3 bg-theme-hover rounded-lg">
                <p className="text-theme-muted text-xs mb-1">
                  {t("runtimeStats.spaceSaved")}
                </p>
                <p className="text-xl font-bold text-green-400">
                  {summary.latest_run.space_saved || "0"}
                </p>
              </div>
            </div>
          </div>

          {/* Version Information */}
          {(summary.latest_run.script_version ||
            summary.latest_run.im_version) && (
            <div className="mt-6 bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
              <h3 className="text-lg font-semibold text-theme-text mb-4">
                {t("runtimeStats.versionInfo")}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {summary.latest_run.script_version && (
                  <div className="p-3 bg-theme-hover rounded-lg">
                    <p className="text-theme-muted text-xs mb-1">
                      {t("runtimeStats.scriptVersion")}
                    </p>
                    <p className="text-lg font-bold text-theme-primary">
                      {summary.latest_run.script_version}
                    </p>
                  </div>
                )}
                {summary.latest_run.im_version && (
                  <div className="p-3 bg-theme-hover rounded-lg">
                    <p className="text-theme-muted text-xs mb-1">
                      {t("runtimeStats.imVersion")}
                    </p>
                    <p className="text-lg font-bold text-theme-primary">
                      {summary.latest_run.im_version}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Table */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
            <div className="p-2 rounded-lg bg-theme-primary/10">
              <Database className="w-5 h-5 text-theme-primary" />
            </div>
            {t("runtimeHistory.title")}
          </h2>
          <div className="flex items-center gap-3">
            {/* Mode Filter */}
            <div className="relative" ref={modeFilterDropdownRef}>
              <button
                onClick={() => {
                  const shouldOpenUp = calculateDropdownPosition(
                    modeFilterDropdownRef
                  );
                  setModeFilterDropdownUp(shouldOpenUp);
                  setModeFilterDropdownOpen(!modeFilterDropdownOpen);
                }}
                className="px-3 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text text-sm hover:bg-theme-bg hover:border-theme-primary/50 focus:outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary transition-all shadow-sm flex items-center gap-2"
              >
                <span>
                  {modeFilter
                    ? t(`runtimeHistory.modes.${modeFilter}`)
                    : t("runtimeHistory.allModes")}
                </span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    modeFilterDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {modeFilterDropdownOpen && (
                <div
                  className={`absolute z-50 right-0 ${
                    modeFilterDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                  } bg-theme-card border border-theme-primary rounded-lg shadow-xl overflow-hidden min-w-[180px] max-h-60 overflow-y-auto`}
                >
                  <button
                    onClick={() => {
                      setModeFilter(null);
                      setCurrentPage(0);
                      setModeFilterDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      !modeFilter
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {t("runtimeHistory.allModes")}
                  </button>
                  {[
                    "normal",
                    "testing",
                    "manual",
                    "scheduled",
                    "backup",
                    "syncjelly",
                    "syncemby",
                    "reset",
                  ].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setModeFilter(mode);
                        setCurrentPage(0);
                        setModeFilterDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2 text-sm transition-all text-left ${
                        modeFilter === mode
                          ? "bg-theme-primary text-white"
                          : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                      }`}
                    >
                      {t(`runtimeHistory.modes.${mode}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => {
                fetchHistory();
                fetchSummary();
              }}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-theme-muted hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-theme-hover rounded-lg"
              title={t("runtimeHistory.refreshHistory")}
            >
              <RefreshCw
                className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-theme">
                <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                  Start Time
                </th>
                <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.mode")}
                </th>
                <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.runtime")}
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.images")}
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.posters")}
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.seasons")}
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.backgrounds")}
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.titlecards")}
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  {t("runtimeHistory.table.collections")}
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  Script Errors
                </th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-8">
                    <p className="text-theme-muted italic">
                      {t("runtimeHistory.noEntries")}
                    </p>
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => {
                      setSelectedEntry(entry);
                      setShowDetailModal(true);
                    }}
                    className="border-b border-theme hover:bg-theme-hover transition-colors cursor-pointer"
                    title={t("runtimeHistory.clickForDetails")}
                  >
                    <td className="py-3 px-4 text-theme-text text-sm">
                      {formatDateToLocale(entry.start_time)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs border capitalize ${getModeColor(
                          entry.mode
                        )}`}
                      >
                        {entry.mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-theme-text text-sm font-mono">
                      {entry.runtime_formatted}
                    </td>
                    <td className="py-3 px-4 text-right text-theme-text text-sm font-medium">
                      {entry.total_images}
                    </td>
                    <td className="py-3 px-4 text-right text-theme-muted text-sm">
                      {entry.posters}
                    </td>
                    <td className="py-3 px-4 text-right text-theme-muted text-sm">
                      {entry.seasons}
                    </td>
                    <td className="py-3 px-4 text-right text-theme-muted text-sm">
                      {entry.backgrounds}
                    </td>
                    <td className="py-3 px-4 text-right text-theme-muted text-sm">
                      {entry.titlecards}
                    </td>
                    <td className="py-3 px-4 text-right text-theme-muted text-sm">
                      {entry.collections || 0}
                    </td>
                    <td
                      className={`py-3 px-4 text-right text-sm font-medium ${
                        entry.errors > 0 ? "text-red-400" : "text-green-400"
                      }`}
                    >
                      {entry.errors}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-theme">
          <p className="text-theme-muted text-sm">
            Page {currentPage + 1} • Showing {history.length} of {totalCount}{" "}
            entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 0}
              className="flex items-center gap-2 px-4 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text hover:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              {t("runtimeHistory.pagination.previous")}
            </button>
            <button
              onClick={handleNextPage}
              disabled={history.length < limit}
              className="flex items-center gap-2 px-4 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text hover:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {t("runtimeHistory.pagination.next")}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedEntry && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="bg-theme-card rounded-xl border border-theme-primary max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-theme-card border-b border-theme p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-theme-primary/10">
                  <Info className="w-6 h-6 text-theme-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-theme-text">
                    {t("runtimeHistory.detailTitle")}
                  </h2>
                  <p className="text-sm text-theme-muted">
                    {formatDateToLocale(selectedEntry.start_time)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 rounded-lg hover:bg-theme-hover transition-colors"
              >
                <X className="w-6 h-6 text-theme-muted" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Run Info */}
              <div className="bg-theme-hover rounded-lg p-4 border border-theme">
                <h3 className="text-lg font-semibold text-theme-text mb-3">
                  {t("runtimeStats.runInfo")}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-theme-muted text-sm mb-1">
                      {t("dashboard.mode")}
                    </p>
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-sm border capitalize ${getModeColor(
                        selectedEntry.mode
                      )}`}
                    >
                      {selectedEntry.mode}
                    </span>
                  </div>
                  <div>
                    <p className="text-theme-muted text-sm mb-1">
                      {t("runtimeStats.executionTime")}
                    </p>
                    <p className="text-lg font-bold text-theme-primary">
                      {selectedEntry.runtime_formatted}
                    </p>
                  </div>
                  {selectedEntry.start_time && (
                    <div>
                      <p className="text-theme-muted text-sm mb-1">
                        {t("runtimeStats.startTime")}
                      </p>
                      <p className="text-sm font-medium text-theme-text">
                        {formatDateToLocale(selectedEntry.start_time)}
                      </p>
                    </div>
                  )}
                  {selectedEntry.end_time && (
                    <div>
                      <p className="text-theme-muted text-sm mb-1">
                        {t("runtimeStats.endTime")}
                      </p>
                      <p className="text-sm font-medium text-theme-text">
                        {formatDateToLocale(selectedEntry.end_time)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Image Statistics */}
              <div className="bg-theme-hover rounded-lg p-4 border border-theme">
                <h3 className="text-lg font-semibold text-theme-text mb-3">
                  {t("runtimeStats.imageStats")}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Image className="w-4 h-4 text-blue-400" />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.totalImages")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.total_images}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Film className="w-4 h-4 text-green-400" />
                      <p className="text-theme-muted text-xs">
                        {t("assets.posters")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.posters}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Tv className="w-4 h-4 text-orange-400" />
                      <p className="text-theme-muted text-xs">
                        {t("assets.seasons")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.seasons}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Image className="w-4 h-4 text-purple-400" />
                      <p className="text-theme-muted text-xs">
                        {t("assets.backgrounds")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.backgrounds}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Tv className="w-4 h-4 text-cyan-400" />
                      <p className="text-theme-muted text-xs">
                        {t("assets.titleCards")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.titlecards}
                    </p>
                  </div>
                  {selectedEntry.collections > 0 && (
                    <div className="p-3 bg-theme-card rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Film className="w-4 h-4 text-yellow-400" />
                        <p className="text-theme-muted text-xs">
                          {t("assets.collections")}
                        </p>
                      </div>
                      <p className="text-2xl font-bold text-theme-text">
                        {selectedEntry.collections}
                      </p>
                    </div>
                  )}
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageOff className="w-4 h-4 text-amber-400" />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.fallbacks")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.fallbacks || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Image className="w-4 h-4 text-indigo-400" />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.textless")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.textless || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Scissors className="w-4 h-4 text-pink-400" />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.truncated")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.truncated || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Type className="w-4 h-4 text-teal-400" />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.text")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.text || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Film className="w-4 h-4 text-slate-400" />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.tbaSkipped")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.tba_skipped || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.japChinesSkipped")}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-theme-text">
                      {selectedEntry.jap_chines_skipped || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          selectedEntry.errors > 0
                            ? "text-red-400"
                            : "text-green-400"
                        }`}
                      />
                      <p className="text-theme-muted text-xs">
                        {t("runtimeStats.errors")}
                      </p>
                    </div>
                    <p
                      className={`text-2xl font-bold ${
                        selectedEntry.errors > 0
                          ? "text-red-400"
                          : "text-green-400"
                      }`}
                    >
                      {selectedEntry.errors}
                    </p>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="bg-theme-hover rounded-lg p-4 border border-theme">
                <h3 className="text-lg font-semibold text-theme-text mb-3">
                  {t("runtimeStats.additionalInfo")}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-theme-card rounded-lg">
                    <p className="text-theme-muted text-xs mb-1">
                      {t("runtimeStats.notificationSent")}
                    </p>
                    <p
                      className={`text-xl font-bold ${
                        selectedEntry.notification_sent
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {selectedEntry.notification_sent
                        ? t("common.yes").toUpperCase()
                        : t("common.no").toUpperCase()}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <p className="text-theme-muted text-xs mb-1">Uptime Kuma</p>
                    <p
                      className={`text-xl font-bold ${
                        selectedEntry.uptime_kuma
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {selectedEntry.uptime_kuma
                        ? t("common.yes").toUpperCase()
                        : t("common.no").toUpperCase()}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <p className="text-theme-muted text-xs mb-1">
                      {t("runtimeStats.imagesCleared")}
                    </p>
                    <p className="text-xl font-bold text-theme-text">
                      {selectedEntry.images_cleared || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <p className="text-theme-muted text-xs mb-1">
                      {t("runtimeStats.foldersCleared")}
                    </p>
                    <p className="text-xl font-bold text-theme-text">
                      {selectedEntry.folders_cleared || 0}
                    </p>
                  </div>
                  <div className="p-3 bg-theme-card rounded-lg">
                    <p className="text-theme-muted text-xs mb-1">
                      {t("runtimeStats.spaceSaved")}
                    </p>
                    <p className="text-xl font-bold text-green-400">
                      {selectedEntry.space_saved || "0"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Version Information */}
              {(selectedEntry.script_version || selectedEntry.im_version) && (
                <div className="bg-theme-hover rounded-lg p-4 border border-theme">
                  <h3 className="text-lg font-semibold text-theme-text mb-3">
                    {t("runtimeStats.versionInfo")}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedEntry.script_version && (
                      <div className="p-3 bg-theme-card rounded-lg">
                        <p className="text-theme-muted text-xs mb-1">
                          {t("runtimeStats.scriptVersion")}
                        </p>
                        <p className="text-lg font-bold text-theme-primary">
                          {selectedEntry.script_version}
                        </p>
                      </div>
                    )}
                    {selectedEntry.im_version && (
                      <div className="p-3 bg-theme-card rounded-lg">
                        <p className="text-theme-muted text-xs mb-1">
                          {t("runtimeStats.imVersion")}
                        </p>
                        <p className="text-lg font-bold text-theme-primary">
                          {selectedEntry.im_version}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedEntry.notes && (
                <div className="bg-theme-hover rounded-lg p-4 border border-theme">
                  <h3 className="text-lg font-semibold text-theme-text mb-3">
                    {t("runtimeStats.notes")}
                  </h3>
                  <p className="text-theme-text text-sm whitespace-pre-wrap">
                    {selectedEntry.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-theme-card border-t border-theme p-4 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/80 text-white rounded-lg font-medium transition-all"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RuntimeHistory;
