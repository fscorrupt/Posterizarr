import React, { useState, useEffect } from "react";
import { Clock, RefreshCw, Image, AlertTriangle, Film, Tv } from "lucide-react";

const API_URL = "/api";

let cachedRuntimeStats = null;

function RuntimeStats() {
  const [runtimeStats, setRuntimeStats] = useState(
    cachedRuntimeStats || {
      runtime: null,
      total_images: 0,
      posters: 0,
      seasons: 0,
      backgrounds: 0,
      titlecards: 0,
      errors: 0,
    }
  );
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
          Last Run Statistics
        </h2>
        <button
          onClick={() => fetchRuntimeStats()}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-theme-muted hover:text-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-theme-hover rounded-lg"
          title="Refresh runtime stats"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
          />
          <span className="text-sm font-medium">Refresh</span>
        </button>
      </div>

      {!hasData ? (
        <div className="text-center py-8">
          <p className="text-theme-muted italic">
            No runtime data available yet. Run the script to see statistics.
          </p>
        </div>
      ) : (
        <>
          {/* Runtime Card */}
          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm mb-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-theme-muted text-sm mb-1 font-medium">
                  Execution Time
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
                    Total Images
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
                    Posters
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
                    Seasons
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
                    Backgrounds
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
                    TitleCards
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
                    Errors
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
        </>
      )}
    </div>
  );
}

export default RuntimeStats;
