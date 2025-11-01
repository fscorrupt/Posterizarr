import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Database,
  RefreshCw,
  Loader2,
  Film,
  Tv,
  ChevronLeft,
  ChevronRight,
  Download,
  TrendingUp,
  Calendar,
  Package,
  Info,
  X,
  Search,
  Filter,
  Server,
} from "lucide-react";
import {
  formatDateToLocale,
  getBrowserTimezone,
  isTimezoneDifferent,
} from "../utils/timeUtils";

const API_URL = "/api";

function MediaServerHistory() {
  const { t } = useTranslation();
  const [mediaServer, setMediaServer] = useState("plex"); // 'plex' or 'other'
  const [statistics, setStatistics] = useState(null);
  const [runs, setRuns] = useState([]);
  const [libraryData, setLibraryData] = useState([]);
  const [episodeData, setEpisodeData] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [activeTab, setActiveTab] = useState("library"); // 'library' or 'episodes'
  const [libraryTypeFilter, setLibraryTypeFilter] = useState("all"); // 'all', 'movie', 'show'
  const [libraryNameFilter, setLibraryNameFilter] = useState("all"); // 'all' or specific library name
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage] = useState(20);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Get API endpoint prefix based on selected media server
  const getApiPrefix = () => {
    return mediaServer === "plex" ? "plex-export" : "other-media-export";
  };

  // Fetch statistics
  const fetchStatistics = async (silent = false) => {
    if (!silent) setRefreshing(true);

    try {
      const response = await fetch(`${API_URL}/${getApiPrefix()}/statistics`);
      if (!response.ok) {
        console.error("Failed to fetch statistics:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setStatistics(data.statistics);
      }
    } catch (error) {
      console.error("Error fetching statistics:", error);
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  // Fetch all runs
  const fetchRuns = async (autoSelectLatest = false) => {
    try {
      const response = await fetch(`${API_URL}/${getApiPrefix()}/runs`);
      if (!response.ok) {
        console.error("Failed to fetch runs:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        const newRuns = data.runs;
        setRuns(newRuns);

        // Auto-select latest run if:
        // 1. No run selected yet, OR
        // 2. autoSelectLatest is true (from auto-refresh), OR
        // 3. A new run appeared (different latest timestamp)
        if (newRuns.length > 0) {
          const latestRun = newRuns[0];
          if (!selectedRun || autoSelectLatest || selectedRun !== latestRun) {
            setSelectedRun(latestRun);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching runs:", error);
    }
  };

  // Fetch library data
  const fetchLibraryData = async (runTimestamp = null) => {
    try {
      const url = runTimestamp
        ? `${API_URL}/${getApiPrefix()}/library?run_timestamp=${encodeURIComponent(
            runTimestamp
          )}`
        : `${API_URL}/${getApiPrefix()}/library`;

      const response = await fetch(url);
      if (!response.ok) {
        console.error("Failed to fetch library data:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setLibraryData(data.data);
      }
    } catch (error) {
      console.error("Error fetching library data:", error);
    }
  };

  // Fetch episode data
  const fetchEpisodeData = async (runTimestamp = null) => {
    try {
      const url = runTimestamp
        ? `${API_URL}/${getApiPrefix()}/episodes?run_timestamp=${encodeURIComponent(
            runTimestamp
          )}`
        : `${API_URL}/${getApiPrefix()}/episodes`;

      const response = await fetch(url);
      if (!response.ok) {
        console.error("Failed to fetch episode data:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setEpisodeData(data.data);
      }
    } catch (error) {
      console.error("Error fetching episode data:", error);
    }
  };

  // Import latest CSVs (for both Plex and Jellyfin/Emby)
  const importCSVs = async () => {
    if (importing) return;

    setImporting(true);
    try {
      const response = await fetch(`${API_URL}/${getApiPrefix()}/import`, {
        method: "POST",
      });

      if (!response.ok) {
        console.error("Failed to import CSVs:", response.status);
        return;
      }

      const data = await response.json();
      if (data.success) {
        // Refresh statistics first
        await fetchStatistics(true);

        // Fetch runs to get the new latest run
        await fetchRuns();

        // fetchRuns will update selectedRun state, which will trigger
        // the useEffect that fetches library and episode data
      }
    } catch (error) {
      console.error("Error importing CSVs:", error);
    } finally {
      setTimeout(() => setImporting(false), 500);
    }
  };

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([fetchStatistics(true), fetchRuns()]);
      setLoading(false);
    };

    loadInitialData();
  }, []);

  // Reload data when media server changes
  useEffect(() => {
    const reloadForServer = async () => {
      setLoading(true);
      setLibraryData([]);
      setEpisodeData([]);
      setStatistics(null);
      setRuns([]);
      setSelectedRun(null);
      setCurrentPage(0);
      setSearchTerm("");
      setLibraryTypeFilter("all");
      setLibraryNameFilter("all");

      await Promise.all([fetchStatistics(true), fetchRuns()]);
      setLoading(false);
    };

    reloadForServer();
  }, [mediaServer]);

  // Load data when selected run changes
  useEffect(() => {
    if (selectedRun) {
      // Load both library and episode data
      fetchLibraryData(selectedRun);
      fetchEpisodeData(selectedRun);
    }
  }, [selectedRun]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      // Silently refresh statistics and runs
      await fetchStatistics(true);
      await fetchRuns(true); // Pass true to auto-select latest run
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [mediaServer]);

  // Filter data based on search term
  const getFilteredData = () => {
    let data = activeTab === "library" ? libraryData : episodeData;

    // Apply library type filter (only for library tab)
    if (activeTab === "library" && libraryTypeFilter !== "all") {
      data = data.filter((item) => item.library_type === libraryTypeFilter);
    }

    // Apply library name filter
    if (libraryNameFilter !== "all") {
      data = data.filter((item) => item.library_name === libraryNameFilter);
    }

    if (!searchTerm) return data;

    return data.filter((item) => {
      const searchLower = searchTerm.toLowerCase();
      if (activeTab === "library") {
        return (
          item.title?.toLowerCase().includes(searchLower) ||
          item.original_title?.toLowerCase().includes(searchLower) ||
          item.library_name?.toLowerCase().includes(searchLower) ||
          item.year?.includes(searchLower) ||
          item.tmdbid?.includes(searchLower) ||
          item.imdbid?.includes(searchLower)
        );
      } else {
        return (
          item.show_name?.toLowerCase().includes(searchLower) ||
          item.library_name?.toLowerCase().includes(searchLower) ||
          item.season_number?.includes(searchLower) ||
          item.tmdbid?.includes(searchLower) ||
          item.tvdbid?.includes(searchLower)
        );
      }
    });
  };

  // Pagination
  const filteredData = getFilteredData();
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  // Calculate total episode count
  const getTotalEpisodeCount = () => {
    return episodeData.reduce((total, item) => {
      const episodeCount = item.episodes?.split(",").length || 0;
      return total + episodeCount;
    }, 0);
  };

  // Get unique library names from current data
  const getUniqueLibraryNames = () => {
    const data = activeTab === "library" ? libraryData : episodeData;
    let filteredForLibraryNames = data;

    // Apply library type filter if active
    if (activeTab === "library" && libraryTypeFilter !== "all") {
      filteredForLibraryNames = data.filter(
        (item) => item.library_type === libraryTypeFilter
      );
    }

    const names = [
      ...new Set(filteredForLibraryNames.map((item) => item.library_name)),
    ].filter(Boolean);
    return names.sort();
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 0 && newPage < totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    // Refresh statistics and runs
    await fetchStatistics(true);
    await fetchRuns();

    // fetchRuns will update selectedRun state, which will trigger
    // the useEffect that fetches library and episode data

    setTimeout(() => setRefreshing(false), 500);
  };

  const openDetailModal = (item) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedItem(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">
            {t("mediaServerExport.loading", "Loading export history...")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}

      {/* Media Server Tabs */}
      <div className="bg-theme-card rounded-xl border border-theme shadow-sm">
        <div className="flex gap-2 p-2">
          <button
            onClick={() => setMediaServer("plex")}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all ${
              mediaServer === "plex"
                ? "bg-theme-primary/20 text-theme-primary border border-theme-primary/30"
                : "bg-theme-hover text-theme-muted hover:text-theme-text border border-transparent"
            }`}
          >
            <Database className="w-4 h-4" />
            {t("mediaServerExport.plex", "Plex")}
          </button>
          <button
            onClick={() => setMediaServer("other")}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all ${
              mediaServer === "other"
                ? "bg-theme-primary/20 text-theme-primary border border-theme-primary/30"
                : "bg-theme-hover text-theme-muted hover:text-theme-text border border-transparent"
            }`}
          >
            <Server className="w-4 h-4" />
            {t("mediaServerExport.jellyfinEmby", "Jellyfin / Emby")}
          </button>
        </div>
      </div>

      <div className="flex justify-end items-start">
        <div></div>

        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("plexExport.refresh", "Refresh Data")}
          >
            <RefreshCw
              className={`w-4 h-4 text-theme-primary ${
                refreshing ? "animate-spin" : ""
              }`}
            />
            <span className="text-theme-text">
              {t("plexExport.refresh", "Refresh")}
            </span>
          </button>

          <button
            onClick={importCSVs}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("plexExport.import", "Import Latest CSVs")}
          >
            <Download
              className={`w-4 h-4 text-theme-primary ${
                importing ? "animate-bounce" : ""
              }`}
            />
            <span className="text-theme-text">
              {importing
                ? t("plexExport.importing", "Importing...")
                : t("plexExport.import", "Import")}
            </span>
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-theme-muted">
                  {t("plexExport.libraryRecords", "Library Records")}
                </p>
                <p className="text-2xl font-bold text-theme-text mt-1">
                  {statistics.latest_run_library_count || 0}
                </p>
              </div>
              <Film className="w-8 h-8 text-theme-primary" />
            </div>
          </div>

          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-theme-muted">
                  {t("plexExport.episodeRecords", "Episode Records")}
                </p>
                <p className="text-2xl font-bold text-theme-text mt-1">
                  {statistics.latest_run_total_episodes || 0}
                </p>
              </div>
              <Tv className="w-8 h-8 text-theme-primary" />
            </div>
          </div>

          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-theme-muted">
                  {t("plexExport.latestRun", "Latest Run")}
                </p>
                <p className="text-sm font-medium text-theme-text mt-1">
                  {statistics.latest_run
                    ? formatDateToLocale(statistics.latest_run)
                    : t("plexExport.noData", "No data")}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-theme-primary" />
            </div>
          </div>
        </div>
      )}

      {/* Search and Tabs Card */}
      <div className="bg-theme-card rounded-lg shadow-md">
        {/* Search */}
        <div className="p-4 border-b border-theme">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-theme-muted w-4 h-4" />
            <input
              type="text"
              placeholder={t(
                "plexExport.searchPlaceholder",
                "Search by title..."
              )}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(0);
              }}
              className="w-full pl-10 pr-4 py-2 bg-theme-hover border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:border-theme-primary"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4">
          <button
            onClick={() => {
              setActiveTab("library");
              setCurrentPage(0);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${
              activeTab === "library"
                ? "bg-theme-primary text-white scale-105"
                : "bg-theme-hover hover:bg-theme-primary/70 border border-theme-border text-theme-text"
            }`}
          >
            <Film className="w-4 h-4" />
            {t("plexExport.library", "Library")} ({libraryData.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("episodes");
              setCurrentPage(0);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${
              activeTab === "episodes"
                ? "bg-theme-primary text-white scale-105"
                : "bg-theme-hover hover:bg-theme-primary/70 border border-theme-border text-theme-text"
            }`}
          >
            <Tv className="w-4 h-4" />
            {t("plexExport.episodes", "Episodes")} ({getTotalEpisodeCount()})
          </button>
        </div>

        {/* Library Type Filter (only show when Library tab is active) */}
        {activeTab === "library" && (
          <div className="flex gap-2 p-4">
            <button
              onClick={() => {
                setLibraryTypeFilter("all");
                setCurrentPage(0);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                libraryTypeFilter === "all"
                  ? "bg-theme-primary text-white"
                  : "bg-theme-hover hover:bg-theme-primary/70 text-theme-text"
              }`}
            >
              All ({libraryData.length})
            </button>
            <button
              onClick={() => {
                setLibraryTypeFilter("movie");
                setCurrentPage(0);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                libraryTypeFilter === "movie"
                  ? "bg-theme-primary text-white"
                  : "bg-theme-hover hover:bg-theme-primary/70 text-theme-text"
              }`}
            >
              Movies (
              {
                libraryData.filter((item) => item.library_type === "movie")
                  .length
              }
              )
            </button>
            <button
              onClick={() => {
                setLibraryTypeFilter("show");
                setCurrentPage(0);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                libraryTypeFilter === "show"
                  ? "bg-theme-primary text-white"
                  : "bg-theme-hover hover:bg-theme-primary/70 text-theme-text"
              }`}
            >
              Shows (
              {
                libraryData.filter((item) => item.library_type === "show")
                  .length
              }
              )
            </button>
          </div>
        )}

        {/* Library Name Filter */}
        {getUniqueLibraryNames().length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-4">
            <button
              onClick={() => {
                setLibraryNameFilter("all");
                setCurrentPage(0);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                libraryNameFilter === "all"
                  ? "bg-theme-primary text-white"
                  : "bg-theme-hover hover:bg-theme-primary/70 text-theme-text"
              }`}
            >
              All Libraries
            </button>
            {getUniqueLibraryNames().map((libraryName) => {
              const count = (
                activeTab === "library" ? libraryData : episodeData
              ).filter((item) => {
                let match = item.library_name === libraryName;
                // Also apply library type filter if active
                if (activeTab === "library" && libraryTypeFilter !== "all") {
                  match = match && item.library_type === libraryTypeFilter;
                }
                return match;
              }).length;

              return (
                <button
                  key={libraryName}
                  onClick={() => {
                    setLibraryNameFilter(libraryName);
                    setCurrentPage(0);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    libraryNameFilter === libraryName
                      ? "bg-theme-primary text-white"
                      : "bg-theme-hover hover:bg-theme-primary/70 text-theme-text"
                  }`}
                >
                  {libraryName} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Items List Card */}
      <div className="bg-theme-card rounded-lg shadow-md overflow-hidden">
        {/* Data Table */}
        <div className="overflow-x-auto">
          {activeTab === "library" ? (
            <table className="w-full">
              <thead>
                <tr className="border-b border-theme">
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.title", "Title")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.year", "Year")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.library", "Library")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.resolution", "Resolution")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    IDs
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.actions", "Actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {paginatedData.length > 0 ? (
                  paginatedData.map((item, index) => (
                    <tr
                      key={item.id || index}
                      className="border-b border-theme hover:bg-theme-hover transition-colors cursor-pointer"
                      onClick={() => openDetailModal(item)}
                    >
                      <td className="py-3 px-4">
                        <div className="text-sm font-medium text-theme-text">
                          {item.title}
                        </div>
                        {item.original_title &&
                          item.original_title !== item.title && (
                            <div className="text-xs text-theme-muted">
                              {item.original_title}
                            </div>
                          )}
                      </td>
                      <td className="py-3 px-4 text-sm text-theme-text">
                        {item.year || "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-theme-text">
                        {item.library_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          {item.resolution || "N/A"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-theme-muted">
                        <div className="space-y-1">
                          {item.tmdbid && <div>TMDB: {item.tmdbid}</div>}
                          {item.imdbid && <div>IMDB: {item.imdbid}</div>}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetailModal(item);
                          }}
                          className="text-theme-primary hover:text-theme-primary-hover transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-8 text-center text-theme-muted"
                    >
                      {searchTerm
                        ? t("plexExport.noResults", "No matching results")
                        : t("plexExport.noData", "No data available")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-theme">
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.show", "Show")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.season", "Season")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.episodes", "Episodes")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.library", "Library")}
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    IDs
                  </th>
                  <th className="text-left py-3 px-4 text-theme-muted text-sm font-medium">
                    {t("plexExport.actions", "Actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme">
                {paginatedData.length > 0 ? (
                  paginatedData.map((item, index) => (
                    <tr
                      key={item.id || index}
                      className="border-b border-theme hover:bg-theme-hover transition-colors cursor-pointer"
                      onClick={() => openDetailModal(item)}
                    >
                      <td className="py-3 px-4 text-sm font-medium text-theme-text">
                        {item.show_name}
                      </td>
                      <td className="py-3 px-4 text-sm text-theme-text">
                        Season {item.season_number}
                      </td>
                      <td className="py-3 px-4 text-sm text-theme-text">
                        {item.episodes?.split(",").length || 0} episodes
                      </td>
                      <td className="py-3 px-4 text-sm text-theme-text">
                        {item.library_name}
                      </td>
                      <td className="py-3 px-4 text-xs text-theme-muted">
                        <div className="space-y-1">
                          {item.tmdbid && <div>TMDB: {item.tmdbid}</div>}
                          {item.tvdbid && <div>TVDB: {item.tvdbid}</div>}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetailModal(item);
                          }}
                          className="text-theme-primary hover:text-theme-primary-hover transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-8 text-center text-theme-muted"
                    >
                      {searchTerm
                        ? t("plexExport.noResults", "No matching results")
                        : t("plexExport.noData", "No data available")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-theme flex items-center justify-between">
            <div className="text-sm text-theme-text">
              {t("plexExport.showing", "Showing")}{" "}
              {currentPage * itemsPerPage + 1} {t("plexExport.to", "to")}{" "}
              {Math.min((currentPage + 1) * itemsPerPage, filteredData.length)}{" "}
              {t("plexExport.of", "of")} {filteredData.length}{" "}
              {t("plexExport.results", "results")}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className="px-3 py-1 rounded bg-theme-card border border-theme text-theme-text disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-hover hover:border-theme-primary transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 text-sm text-theme-text">
                {t("plexExport.page", "Page")} {currentPage + 1}{" "}
                {t("plexExport.of", "of")} {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
                className="px-3 py-1 rounded bg-theme-card border border-theme text-theme-text disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-hover hover:border-theme-primary transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-theme-card rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-theme shadow-xl">
            <div className="sticky top-0 bg-theme-card border-b border-theme px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-theme-text">
                {activeTab === "library"
                  ? selectedItem.title
                  : `${selectedItem.show_name} - Season ${selectedItem.season_number}`}
              </h3>
              <button
                onClick={closeDetailModal}
                className="text-theme-muted hover:text-theme-primary transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {activeTab === "library" ? (
                <>
                  <div className="flex items-start gap-3 pb-4 border-b border-theme">
                    <Film className="w-5 h-5 text-theme-primary mt-1" />
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-theme-text">
                        {selectedItem.title}
                      </h4>
                      {selectedItem.original_title &&
                        selectedItem.original_title !== selectedItem.title && (
                          <p className="text-sm text-theme-muted mt-1">
                            {selectedItem.original_title}
                          </p>
                        )}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {selectedItem.year && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-theme-primary/20 text-theme-primary border border-theme-primary/30">
                            {selectedItem.year}
                          </span>
                        )}
                        {selectedItem.resolution && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            {selectedItem.resolution}
                          </span>
                        )}
                        {selectedItem.library_type && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30 capitalize">
                            {selectedItem.library_type}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <DetailRow
                    label={t("plexExport.library", "Library")}
                    value={selectedItem.library_name}
                    badge
                  />

                  {(selectedItem.tmdbid ||
                    selectedItem.imdbid ||
                    selectedItem.tvdbid) && (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-theme-muted">
                        External IDs:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.tmdbid && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            TMDB: {selectedItem.tmdbid}
                          </span>
                        )}
                        {selectedItem.imdbid && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            IMDB: {selectedItem.imdbid}
                          </span>
                        )}
                        {selectedItem.tvdbid && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                            TVDB: {selectedItem.tvdbid}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <DetailRow
                    label={t("plexExport.ratingKey", "Rating Key")}
                    value={selectedItem.rating_key}
                  />
                  <DetailRow
                    label={t("plexExport.path", "Path")}
                    value={selectedItem.path}
                    monospace
                  />
                  <DetailRow
                    label={t("plexExport.folder", "Root Folder")}
                    value={selectedItem.root_foldername}
                    monospace
                  />
                  {selectedItem.labels && (
                    <DetailRow
                      label={t("plexExport.labels", "Labels")}
                      value={selectedItem.labels}
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 pb-4 border-b border-theme">
                    <Tv className="w-5 h-5 text-theme-primary mt-1" />
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-theme-text">
                        {selectedItem.show_name}
                      </h4>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-theme-primary/20 text-theme-primary border border-theme-primary/30">
                          Season {selectedItem.season_number}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                          {selectedItem.episodes?.split(",").length || 0}{" "}
                          Episodes
                        </span>
                      </div>
                    </div>
                  </div>

                  <DetailRow
                    label={t("plexExport.library", "Library")}
                    value={selectedItem.library_name}
                    badge
                  />

                  {(selectedItem.tmdbid || selectedItem.tvdbid) && (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-theme-muted">
                        External IDs:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedItem.tmdbid && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            TMDB: {selectedItem.tmdbid}
                          </span>
                        )}
                        {selectedItem.tvdbid && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                            TVDB: {selectedItem.tvdbid}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Episodes List with Numbers, Titles, and Resolutions */}
                  {selectedItem.episodes && (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-theme-muted">
                        {t("plexExport.episodes", "Episodes")}:
                      </span>
                      <div className="flex flex-col gap-2">
                        {selectedItem.episodes
                          .split(",")
                          .map((episodeNum, index) => {
                            const titles = selectedItem.title?.split(";") || [];
                            const resolutions =
                              selectedItem.resolutions?.split(",") || [];
                            const title = titles[index]?.trim() || "Unknown";
                            const resolution = resolutions[index]?.trim();

                            return (
                              <div
                                key={index}
                                className="flex items-center gap-2 p-2 bg-theme-hover rounded-md"
                              >
                                <span className="text-sm font-mono text-theme-text">
                                  {episodeNum.trim()}.
                                </span>
                                <span className="flex-1 text-sm text-theme-text">
                                  {title}
                                </span>
                                {resolution && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                    {resolution}p
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="pt-4 border-t border-theme">
                <DetailRow
                  label={t("plexExport.importedAt", "Imported At")}
                  value={formatDateToLocale(selectedItem.created_at)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for detail rows
function DetailRow({
  label,
  value,
  multiline = false,
  badge = false,
  monospace = false,
}) {
  if (!value) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
      <span className="text-sm font-medium text-theme-muted min-w-[140px]">
        {label}:
      </span>
      {badge ? (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-theme-card border border-theme text-theme-text">
          {value}
        </span>
      ) : (
        <span
          className={`text-sm text-theme-text flex-1 ${
            multiline ? "whitespace-pre-wrap" : ""
          } ${
            monospace
              ? "font-mono text-xs bg-theme-card px-2 py-1 rounded border border-theme"
              : ""
          }`}
        >
          {multiline ? value.replace(/;/g, "\n") : value}
        </span>
      )}
    </div>
  );
}

export default MediaServerHistory;
