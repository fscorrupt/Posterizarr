import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const BackgroundPollingContext = createContext();

export const useBackgroundPolling = () => {
  const context = useContext(BackgroundPollingContext);
  if (!context) {
    throw new Error('useBackgroundPolling must be used within BackgroundPollingProvider');
  }
  return context;
};

export const BackgroundPollingProvider = ({ children }) => {
  const [recentAssetsData, setRecentAssetsData] = useState(null);
  const [runtimeStatsData, setRuntimeStatsData] = useState(null);
  const [missingAssetsCount, setMissingAssetsCount] = useState(0);
  const [systemInfo, setSystemInfo] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdate, setLastUpdate] = useState({
    recentAssets: null,
    runtimeStats: null,
    missingAssets: null,
    systemInfo: null,
  });

  const pollIntervalRef = useRef(null);
  const systemInfoIntervalRef = useRef(null);

  // Fetch recent assets in background
  const fetchRecentAssets = async () => {
    try {
      const response = await fetch('/api/recent-assets');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRecentAssetsData(data.assets);
          setLastUpdate(prev => ({ ...prev, recentAssets: Date.now() }));
        }
      }
    } catch (error) {
      console.error('Background polling: Failed to fetch recent assets', error);
    }
  };

  // Fetch runtime stats in background
  const fetchRuntimeStats = async () => {
    try {
      const response = await fetch('/api/runtime-stats');
      if (response.ok) {
        const data = await response.json();
        setRuntimeStatsData(data);
        setLastUpdate(prev => ({ ...prev, runtimeStats: Date.now() }));
      }
    } catch (error) {
      console.error('Background polling: Failed to fetch runtime stats', error);
    }
  };

  // Fetch missing assets count in background
  const fetchMissingAssetsCount = async () => {
    try {
      const response = await fetch('/api/assets/overview');
      if (response.ok) {
        const data = await response.json();
        setMissingAssetsCount(data.categories.assets_with_issues.count);
        setLastUpdate(prev => ({ ...prev, missingAssets: Date.now() }));
      }
    } catch (error) {
      console.error('Background polling: Failed to fetch missing assets', error);
    }
  };

  // Fetch system info in background (less frequently)
  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/api/system-info');
      if (response.ok) {
        const data = await response.json();
        setSystemInfo(data);
        setLastUpdate(prev => ({ ...prev, systemInfo: Date.now() }));
      }
    } catch (error) {
      console.error('Background polling: Failed to fetch system info', error);
    }
  };

  // Manual refresh trigger
  const refreshRecentAssets = () => {
    fetchRecentAssets();
  };

  const refreshRuntimeStats = () => {
    fetchRuntimeStats();
  };

  const refreshMissingAssets = () => {
    fetchMissingAssetsCount();
  };

  const refreshSystemInfo = () => {
    fetchSystemInfo();
  };

  const refreshAll = () => {
    fetchRecentAssets();
    fetchRuntimeStats();
    fetchMissingAssetsCount();
    fetchSystemInfo();
  };

  // Start background polling after initial load
  const startPolling = () => {
    if (isPolling) {
      console.log('Background polling: Already running');
      return;
    }

    console.log('Background polling: Starting...');
    setIsPolling(true);

    // Initial fetch
    fetchRecentAssets();
    fetchRuntimeStats();
    fetchMissingAssetsCount();
    fetchSystemInfo();

    // Poll recent assets, runtime stats, and missing assets every 10 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchRecentAssets();
      fetchRuntimeStats();
      fetchMissingAssetsCount();
    }, 10000); // 10 seconds

    // Poll system info every 30 seconds (less critical, less frequent)
    systemInfoIntervalRef.current = setInterval(() => {
      fetchSystemInfo();
    }, 30000); // 30 seconds
  };

  const stopPolling = () => {
    if (!isPolling) return;

    console.log('Background polling: Stopping...');
    setIsPolling(false);

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (systemInfoIntervalRef.current) {
      clearInterval(systemInfoIntervalRef.current);
      systemInfoIntervalRef.current = null;
    }
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, []);

  const value = {
    recentAssetsData,
    runtimeStatsData,
    missingAssetsCount,
    systemInfo,
    lastUpdate,
    isPolling,
    startPolling,
    stopPolling,
    refreshRecentAssets,
    refreshRuntimeStats,
    refreshMissingAssets,
    refreshSystemInfo,
    refreshAll,
  };

  return (
    <BackgroundPollingContext.Provider value={value}>
      {children}
    </BackgroundPollingContext.Provider>
  );
};
