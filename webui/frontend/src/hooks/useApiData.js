import { useState, useEffect, useCallback } from "react";
import { useApi } from "../context/ApiContext";

/**
 * Hook für einfache API-Daten-Abfrage mit automatischem Caching und Live-Updates
 * 
 * @param {string} apiMethod - Name der API-Methode (z.B. 'getVersion', 'getStatus')
 * @param {object} options - Optionen
 * @param {boolean} options.autoFetch - Automatisch beim Mount fetchen (default: true)
 * @param {number} options.refreshInterval - Auto-Refresh-Intervall in ms (0 = deaktiviert)
 * @param {boolean} options.subscribeToUpdates - Subscribe zu Updates von anderen Komponenten
 * 
 * @returns {object} { data, loading, error, refresh, isStale }
 */
export const useApiData = (apiMethod, options = {}) => {
  const {
    autoFetch = true,
    refreshInterval = 0,
    subscribeToUpdates = true,
  } = options;

  const api = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);
  const [isStale, setIsStale] = useState(false);

  // Extrahiere Cache-Key aus API-Method-Name
  const getCacheKey = useCallback((method) => {
    // getVersion -> version, getStatus -> status, etc.
    return method.replace(/^get/, "").replace(/^./, (str) => str.toLowerCase());
  }, []);

  const cacheKey = getCacheKey(apiMethod);

  // Fetch-Funktion
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      try {
        setLoading(true);
        setError(null);

        const result = await api[apiMethod](forceRefresh);
        setData(result);
        setIsStale(false);

        return result;
      } catch (err) {
        console.error(`[useApiData] Error fetching ${apiMethod}:`, err);
        setError(err.message || "Unknown error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api, apiMethod]
  );

  // Initial Fetch
  useEffect(() => {
    if (autoFetch) {
      // Versuche zuerst cached data zu laden
      const cached = api.getCachedData(cacheKey);
      if (cached) {
        setData(cached);
        setLoading(false);
      }

      // Dann fetch neue Daten
      fetchData(false);
    }
  }, [autoFetch, fetchData, api, cacheKey]);

  // Auto-Refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchData(false);
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchData]);

  // Subscribe zu Updates
  useEffect(() => {
    if (subscribeToUpdates) {
      const unsubscribe = api.subscribe(cacheKey, (newData) => {
        setData(newData);
        setIsStale(false);
      });

      return unsubscribe;
    }
  }, [subscribeToUpdates, api, cacheKey]);

  // Refresh-Funktion (mit force)
  const refresh = useCallback(
    (force = true) => {
      return fetchData(force);
    },
    [fetchData]
  );

  return {
    data,
    loading,
    error,
    refresh,
    isStale,
  };
};

/**
 * Hook für Batch-Fetching mehrerer API-Endpunkte gleichzeitig
 * 
 * @param {string} batchMethod - Name der Batch-Methode (z.B. 'fetchDashboardData')
 * @param {object} options - Optionen
 * 
 * @returns {object} { data, loading, error, refresh }
 */
export const useApiBatch = (batchMethod, options = {}) => {
  const { autoFetch = true, refreshInterval = 0 } = options;

  const api = useApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState(null);

  // Fetch-Funktion
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      try {
        setLoading(true);
        setError(null);

        const result = await api[batchMethod](forceRefresh);
        setData(result);

        return result;
      } catch (err) {
        console.error(`[useApiBatch] Error fetching ${batchMethod}:`, err);
        setError(err.message || "Unknown error");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api, batchMethod]
  );

  // Initial Fetch
  useEffect(() => {
    if (autoFetch) {
      fetchData(false);
    }
  }, [autoFetch, fetchData]);

  // Auto-Refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        fetchData(false);
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchData]);

  // Refresh-Funktion
  const refresh = useCallback(
    (force = true) => {
      return fetchData(force);
    },
    [fetchData]
  );

  return {
    data,
    loading,
    error,
    refresh,
  };
};
