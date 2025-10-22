import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const API_URL = "/api";

// Cache-Konfiguration
const CACHE_CONFIG = {
  version: { ttl: 24 * 60 * 60 * 1000 }, // 24 Stunden
  status: { ttl: 5 * 1000 }, // 5 Sekunden
  systemInfo: { ttl: 30 * 1000 }, // 30 Sekunden
  assetsStats: { ttl: 60 * 1000 }, // 1 Minute
  releases: { ttl: 10 * 60 * 1000 }, // 10 Minuten
  runtimeStats: { ttl: 5 * 1000 }, // 5 Sekunden
  recentAssets: { ttl: 10 * 1000 }, // 10 Sekunden
  assetOverview: { ttl: 30 * 1000 }, // 30 Sekunden
  galleries: { ttl: 60 * 1000 }, // 1 Minute
  folders: { ttl: 60 * 1000 }, // 1 Minute
};

const ApiContext = createContext();

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error("useApi must be used within ApiProvider");
  }
  return context;
};

export const ApiProvider = ({ children }) => {
  // Zentrale Cache-Storage
  const cache = useRef({
    version: { data: null, timestamp: 0, loading: false },
    status: { data: null, timestamp: 0, loading: false },
    systemInfo: { data: null, timestamp: 0, loading: false },
    assetsStats: { data: null, timestamp: 0, loading: false },
    releases: { data: null, timestamp: 0, loading: false },
    runtimeStats: { data: null, timestamp: 0, loading: false },
    recentAssets: { data: null, timestamp: 0, loading: false },
    assetOverview: { data: null, timestamp: 0, loading: false },
    galleries: { data: null, timestamp: 0, loading: false },
    folders: { data: null, timestamp: 0, loading: false },
  });

  // Subscribers für Live-Updates
  const subscribers = useRef({});
  const [, forceUpdate] = useState({});

  // Subscribe zu Daten-Updates
  const subscribe = useCallback((key, callback) => {
    if (!subscribers.current[key]) {
      subscribers.current[key] = new Set();
    }
    subscribers.current[key].add(callback);

    // Cleanup-Funktion
    return () => {
      subscribers.current[key]?.delete(callback);
    };
  }, []);

  // Notify alle Subscribers
  const notifySubscribers = useCallback((key, data) => {
    subscribers.current[key]?.forEach((callback) => {
      callback(data);
    });
  }, []);

  // Check ob Cache gültig ist
  const isCacheValid = useCallback((key) => {
    const cached = cache.current[key];
    if (!cached.data || !cached.timestamp) return false;

    const age = Date.now() - cached.timestamp;
    const ttl = CACHE_CONFIG[key]?.ttl || 60000;

    return age < ttl;
  }, []);

  // Generische Fetch-Funktion mit Cache
  const fetchData = useCallback(
    async (key, endpoint, options = {}) => {
      const { forceRefresh = false, silent = false } = options;

      // Return cached data wenn gültig und kein force refresh
      if (!forceRefresh && isCacheValid(key)) {
        return cache.current[key].data;
      }

      // Verhindere gleichzeitige Requests
      if (cache.current[key].loading) {
        // Warte auf laufenden Request
        return new Promise((resolve) => {
          const interval = setInterval(() => {
            if (!cache.current[key].loading) {
              clearInterval(interval);
              resolve(cache.current[key].data);
            }
          }, 50);
        });
      }

      cache.current[key].loading = true;

      try {
        const response = await fetch(`${API_URL}${endpoint}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Update Cache
        cache.current[key] = {
          data,
          timestamp: Date.now(),
          loading: false,
        };

        // Notify alle Subscribers
        notifySubscribers(key, data);

        if (!silent) {
          console.log(`[ApiContext] ${key} data fetched and cached`);
        }

        return data;
      } catch (error) {
        console.error(`[ApiContext] Error fetching ${key}:`, error);
        cache.current[key].loading = false;
        throw error;
      }
    },
    [isCacheValid, notifySubscribers]
  );

  // POST Request mit optimistic updates
  const postData = useCallback(async (endpoint, body, options = {}) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`[ApiContext] Error posting to ${endpoint}:`, error);
      throw error;
      }
  }, []);

  // Batch-Fetch für Dashboard (lädt mehrere Daten gleichzeitig)
  const fetchDashboardData = useCallback(
    async (forceRefresh = false) => {
      const promises = [
        fetchData("status", "/status", { forceRefresh, silent: true }),
        fetchData("systemInfo", "/system-info", { forceRefresh, silent: true }),
        fetchData("runtimeStats", "/runtime-stats", { forceRefresh, silent: true }),
        fetchData("recentAssets", "/recent-assets", { forceRefresh, silent: true }),
      ];

      try {
        const results = await Promise.allSettled(promises);
        const data = {
          status: results[0].status === "fulfilled" ? results[0].value : null,
          systemInfo: results[1].status === "fulfilled" ? results[1].value : null,
          runtimeStats: results[2].status === "fulfilled" ? results[2].value : null,
          recentAssets: results[3].status === "fulfilled" ? results[3].value : null,
        };

        console.log("[ApiContext] Dashboard batch fetch completed", data);
        return data;
      } catch (error) {
        console.error("[ApiContext] Dashboard batch fetch error:", error);
        throw error;
      }
    },
    [fetchData]
  );

  // Batch-Fetch für About-Page
  const fetchAboutData = useCallback(
    async (forceRefresh = false) => {
      const promises = [
        fetchData("version", "/version", { forceRefresh, silent: true }),
        fetchData("assetsStats", "/assets/stats", { forceRefresh, silent: true }),
        fetchData("releases", "/releases", { forceRefresh, silent: true }),
      ];

      try {
        const results = await Promise.allSettled(promises);
        const data = {
          version: results[0].status === "fulfilled" ? results[0].value : null,
          assetsStats: results[1].status === "fulfilled" ? results[1].value : null,
          releases: results[2].status === "fulfilled" ? results[2].value : null,
        };

        console.log("[ApiContext] About batch fetch completed", data);
        return data;
      } catch (error) {
        console.error("[ApiContext] About batch fetch error:", error);
        throw error;
      }
    },
    [fetchData]
  );

  // Invalidate Cache für einen bestimmten Key
  const invalidateCache = useCallback((key) => {
    if (key) {
      cache.current[key] = { data: null, timestamp: 0, loading: false };
      console.log(`[ApiContext] Cache invalidated for: ${key}`);
    } else {
      // Invalidate alle Caches
      Object.keys(cache.current).forEach((k) => {
        cache.current[k] = { data: null, timestamp: 0, loading: false };
      });
      console.log("[ApiContext] All caches invalidated");
    }
  }, []);

  // Get cached data (ohne fetch)
  const getCachedData = useCallback((key) => {
    return cache.current[key]?.data || null;
  }, []);

  // Einzelne API-Methoden (Wrapper für fetchData)
  const api = {
    // Version
    getVersion: useCallback(
      (forceRefresh = false) => fetchData("version", "/version", { forceRefresh }),
      [fetchData]
    ),

    // Status
    getStatus: useCallback(
      (forceRefresh = false) => fetchData("status", "/status", { forceRefresh }),
      [fetchData]
    ),

    // System Info
    getSystemInfo: useCallback(
      (forceRefresh = false) => fetchData("systemInfo", "/system-info", { forceRefresh }),
      [fetchData]
    ),

    // Assets Stats
    getAssetsStats: useCallback(
      (forceRefresh = false) => fetchData("assetsStats", "/assets/stats", { forceRefresh }),
      [fetchData]
    ),

    // Releases
    getReleases: useCallback(
      (forceRefresh = false) => fetchData("releases", "/releases", { forceRefresh }),
      [fetchData]
    ),

    // Runtime Stats
    getRuntimeStats: useCallback(
      (forceRefresh = false) => fetchData("runtimeStats", "/runtime-stats", { forceRefresh }),
      [fetchData]
    ),

    // Recent Assets
    getRecentAssets: useCallback(
      (forceRefresh = false) => fetchData("recentAssets", "/recent-assets", { forceRefresh }),
      [fetchData]
    ),

    // Refresh Cache (POST)
    refreshCache: useCallback(() => postData("/refresh-cache"), [postData]),

    // Run Script (POST)
    runScript: useCallback(
      (mode, options = {}) => postData(`/run/${mode}`, options),
      [postData]
    ),

    // Stop Script (POST)
    stopScript: useCallback(() => postData("/stop"), [postData]),

    // Asset Management
    uploadAsset: useCallback(
      async (endpoint, formData) => {
        try {
          const response = await fetch(`${API_URL}${endpoint}`, {
            method: "POST",
            body: formData, // Don't set Content-Type for FormData
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          // Invalidate relevant caches after upload
          invalidateCache("assetsStats");
          invalidateCache("recentAssets");
          invalidateCache("assetOverview");
          invalidateCache("galleries");

          // Notify all subscribers about the change
          notifySubscribers("assetsStats", null);
          notifySubscribers("recentAssets", null);
          notifySubscribers("assetOverview", null);
          notifySubscribers("galleries", null);

          console.log("[ApiContext] Asset uploaded - caches invalidated");

          return data;
        } catch (error) {
          console.error("[ApiContext] Error uploading asset:", error);
          throw error;
        }
      },
      [invalidateCache, notifySubscribers]
    ),

    deleteAsset: useCallback(
      async (endpoint) => {
        try {
          const response = await fetch(`${API_URL}${endpoint}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          // Invalidate relevant caches after delete
          invalidateCache("assetsStats");
          invalidateCache("recentAssets");
          invalidateCache("assetOverview");
          invalidateCache("galleries");

          // Notify all subscribers
          notifySubscribers("assetsStats", null);
          notifySubscribers("recentAssets", null);
          notifySubscribers("assetOverview", null);
          notifySubscribers("galleries", null);

          console.log("[ApiContext] Asset deleted - caches invalidated");

          return data;
        } catch (error) {
          console.error("[ApiContext] Error deleting asset:", error);
          throw error;
        }
      },
      [invalidateCache, notifySubscribers]
    ),

    replaceAsset: useCallback(
      async (endpoint, data) => {
        try {
          const response = await fetch(`${API_URL}${endpoint}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();

          // Invalidate relevant caches after replace
          invalidateCache("assetsStats");
          invalidateCache("recentAssets");
          invalidateCache("assetOverview");
          invalidateCache("galleries");

          // Notify all subscribers
          notifySubscribers("assetsStats", null);
          notifySubscribers("recentAssets", null);
          notifySubscribers("assetOverview", null);
          notifySubscribers("galleries", null);

          console.log("[ApiContext] Asset replaced - caches invalidated");

          return result;
        } catch (error) {
          console.error("[ApiContext] Error replacing asset:", error);
          throw error;
        }
      },
      [invalidateCache, notifySubscribers]
    ),

    // Asset Overview
    getAssetOverview: useCallback(
      (forceRefresh = false) => fetchData("assetOverview", "/assets/overview", { forceRefresh }),
      [fetchData]
    ),

    // Trigger global refresh (invalidate all asset-related caches)
    refreshAssets: useCallback(() => {
      invalidateCache("assetsStats");
      invalidateCache("recentAssets");
      invalidateCache("assetOverview");
      invalidateCache("galleries");

      // Trigger refetch in all subscribed components
      notifySubscribers("assetsStats", null);
      notifySubscribers("recentAssets", null);
      notifySubscribers("assetOverview", null);
      notifySubscribers("galleries", null);

      console.log("[ApiContext] Global asset refresh triggered");
    }, [invalidateCache, notifySubscribers]),

    // Batch Fetches
    fetchDashboardData,
    fetchAboutData,

    // Cache Management
    invalidateCache,
    getCachedData,
    subscribe,
  };

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
};
