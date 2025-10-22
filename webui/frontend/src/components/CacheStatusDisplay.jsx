import React, { useState, useEffect } from "react";
import { Database, RefreshCw, Trash2, Clock, CheckCircle } from "lucide-react";
import { useApi } from "../context/ApiContext";

/**
 * Developer Tool: Cache Status Display
 * Shows current cache status and allows manual cache management
 * Usage: Add <CacheStatusDisplay /> to any page during development
 */
function CacheStatusDisplay() {
  const api = useApi();
  const [cacheStatus, setCacheStatus] = useState({});
  const [expanded, setExpanded] = useState(false);

  const updateCacheStatus = () => {
    const keys = [
      "version",
      "status",
      "systemInfo",
      "assetsStats",
      "releases",
      "runtimeStats",
      "recentAssets",
    ];

    const status = {};
    keys.forEach((key) => {
      const cached = api.getCachedData(key);
      status[key] = {
        cached: !!cached,
        data: cached,
      };
    });

    setCacheStatus(status);
  };

  useEffect(() => {
    updateCacheStatus();
    const interval = setInterval(updateCacheStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleInvalidate = (key) => {
    api.invalidateCache(key);
    updateCacheStatus();
  };

  const handleInvalidateAll = () => {
    api.invalidateCache();
    updateCacheStatus();
  };

  if (!expanded) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 cursor-pointer"
        onClick={() => setExpanded(true)}
      >
        <div className="bg-theme-card border-2 border-theme-primary rounded-lg p-3 shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-theme-primary" />
            <span className="text-sm font-medium text-theme-text">
              Cache Status
            </span>
          </div>
        </div>
      </div>
    );
  }

  const cachedCount = Object.values(cacheStatus).filter((s) => s.cached).length;
  const totalCount = Object.keys(cacheStatus).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[80vh] overflow-auto">
      <div className="bg-theme-card border-2 border-theme-primary rounded-lg shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-theme flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-theme-primary" />
            <div>
              <h3 className="text-sm font-bold text-theme-text">
                Cache Status
              </h3>
              <p className="text-xs text-theme-muted">
                {cachedCount}/{totalCount} cached
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInvalidateAll}
              className="p-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded transition-all"
              title="Clear all cache"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
            <button
              onClick={updateCacheStatus}
              className="p-1.5 bg-theme-hover hover:bg-theme-primary/20 border border-theme rounded transition-all"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4 text-theme-primary" />
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="p-1.5 bg-theme-hover hover:bg-theme-primary/20 border border-theme rounded transition-all"
            >
              <span className="text-theme-text">✕</span>
            </button>
          </div>
        </div>

        {/* Cache Items */}
        <div className="p-2 space-y-1 max-h-96 overflow-y-auto">
          {Object.entries(cacheStatus).map(([key, status]) => (
            <div
              key={key}
              className={`p-3 rounded border transition-all ${
                status.cached
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-theme-hover border-theme"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {status.cached ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-theme-muted" />
                  )}
                  <span className="text-sm font-medium text-theme-text">
                    {key}
                  </span>
                </div>
                {status.cached && (
                  <button
                    onClick={() => handleInvalidate(key)}
                    className="p-1 hover:bg-red-500/20 rounded transition-all"
                    title="Clear cache"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                )}
              </div>
              <div className="text-xs text-theme-muted">
                {status.cached ? (
                  <span className="text-green-400">✓ Cached</span>
                ) : (
                  <span className="text-orange-400">✗ Not cached</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-theme bg-theme-hover">
          <p className="text-xs text-theme-muted text-center">
            🔧 Developer Tool - Remove in production
          </p>
        </div>
      </div>
    </div>
  );
}

export default CacheStatusDisplay;
