import React, { useState, useEffect } from "react";
import {
  Clock,
  RefreshCw,
  Image,
  AlertTriangle,
  Film,
  Tv,
  ChevronLeft,
  ChevronRight,
  Database,
  TrendingUp,
} from "lucide-react";

const API_URL = "/api";

// Cache for history data
let cachedHistory = [];
let cachedSummary = null;
let cachedMigrationStatus = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

function RuntimeHistory() {
  const [history, setHistory] = useState(cachedHistory);
  const [summary, setSummary] = useState(cachedSummary);
  const [migrationStatus, setMigrationStatus] = useState(cachedMigrationStatus);
  const [loading, setLoading] = useState(!cachedHistory.length);
  const [refreshing, setRefreshing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [limit] = useState(20);
  const [modeFilter, setModeFilter] = useState(null);
  const [summaryDays, setSummaryDays] = useState(30);

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

  useEffect(() => {
    // Check if cache is still valid (less than 30 seconds old)
    const now = Date.now();
    const cacheIsValid =
      cachedHistory.length > 0 && now - lastFetchTime < CACHE_DURATION;

    if (cacheIsValid) {
      // Use cached data and update silently in background
      fetchHistory(true);
      fetchSummary(true);
      fetchMigrationStatus(true);
    } else {
      // Cache expired or empty, fetch normally
      fetchHistory(true);
      fetchSummary(true);
      fetchMigrationStatus(true);
    }

    // Auto-refresh every 60 seconds in background
    const interval = setInterval(() => {
      fetchHistory(true);
      fetchSummary(true);
      fetchMigrationStatus(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [currentPage, modeFilter, summaryDays]);

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
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
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
                Historical Data Migration Available
              </h3>
              <p className="text-blue-300 text-sm mb-3">
                Runtime data from your existing log files can be imported into
                the database. This will preserve historical statistics and make
                them queryable.
              </p>
              <p className="text-blue-200 text-xs">
                💡 Migration runs automatically on first database creation, or
                you can trigger it manually below.
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
                  Migrating...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Run Migration
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
              Summary (Last {summaryDays} Days)
            </h2>
            <select
              value={summaryDays}
              onChange={(e) => setSummaryDays(Number(e.target.value))}
              className="px-3 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
            >
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={365}>365 Days</option>
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Runs */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">Total Runs</p>
              <p className="text-2xl font-bold text-theme-text">
                {summary.total_runs}
              </p>
            </div>

            {/* Total Images */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">Total Images</p>
              <p className="text-2xl font-bold text-theme-primary">
                {summary.total_images.toLocaleString()}
              </p>
            </div>

            {/* Average Runtime */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">Avg Runtime</p>
              <p className="text-2xl font-bold text-theme-text">
                {summary.average_runtime_formatted}
              </p>
            </div>

            {/* Total Errors */}
            <div className="p-4 bg-theme-hover rounded-lg border border-theme">
              <p className="text-theme-muted text-xs mb-1">Total Errors</p>
              <p
                className={`text-2xl font-bold ${
                  summary.total_errors > 0 ? "text-red-400" : "text-green-400"
                }`}
              >
                {summary.total_errors}
              </p>
            </div>
          </div>

          {/* Mode Counts */}
          {summary.mode_counts &&
            Object.keys(summary.mode_counts).length > 0 && (
              <div className="mt-4 p-4 bg-theme-hover rounded-lg border border-theme">
                <p className="text-theme-muted text-xs mb-3">Runs by Mode</p>
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

      {/* History Table */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
            <div className="p-2 rounded-lg bg-theme-primary/10">
              <Database className="w-5 h-5 text-theme-primary" />
            </div>
            Runtime History
          </h2>
          <div className="flex items-center gap-3">
            {/* Mode Filter */}
            <select
              value={modeFilter || ""}
              onChange={(e) => {
                setModeFilter(e.target.value || null);
                setCurrentPage(0);
              }}
              className="px-3 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text text-sm focus:outline-none focus:border-theme-primary"
            >
              <option value="">All Modes</option>
              <option value="normal">Normal</option>
              <option value="testing">Testing</option>
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
              <option value="backup">Backup</option>
              <option value="syncjelly">Sync Jellyfin</option>
              <option value="syncemby">Sync Emby</option>
              <option value="reset">Reset</option>
            </select>

            {/* Refresh Button */}
            <button
              onClick={() => {
                fetchHistory();
                fetchSummary();
              }}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-theme-muted hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-theme-hover rounded-lg"
              title="Refresh history"
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
                  Timestamp
                </th>
                <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                  Mode
                </th>
                <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                  Runtime
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  Images
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  Posters
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  Seasons
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  Backgrounds
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  TitleCards
                </th>
                <th className="text-right py-3 px-4 text-theme-muted text-sm font-medium">
                  Errors
                </th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-8">
                    <p className="text-theme-muted italic">
                      No history entries found
                    </p>
                  </td>
                </tr>
              ) : (
                history.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-theme hover:bg-theme-hover transition-colors"
                  >
                    <td className="py-3 px-4 text-theme-text text-sm">
                      {new Date(entry.timestamp).toLocaleString()}
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
            Page {currentPage + 1} • Showing {history.length} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage === 0}
              className="flex items-center gap-2 px-4 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text hover:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleNextPage}
              disabled={history.length < limit}
              className="flex items-center gap-2 px-4 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text hover:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RuntimeHistory;
