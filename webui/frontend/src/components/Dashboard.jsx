import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Trash2,
  AlertTriangle,
  Zap,
  Activity,
  ExternalLink,
  FileText,
  Settings,
  Wifi,
  Eye,
  EyeOff,
  Edit3,
  X,
  GripVertical,
  Cpu,
  HardDrive,
  Server,
  Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDashboardLoading } from "../context/DashboardLoadingContext";
import RuntimeStats from "./RuntimeStats";
import DangerZone from "./DangerZone";
import RecentAssets from "./RecentAssets";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";
import { formatDateTimeInTimezone } from "../utils/timeUtils";

const API_URL = "/api";
const isDev = import.meta.env.DEV;

const getLogFileForMode = (mode) => {
  const logMapping = {
    testing: "Testinglog.log",
    manual: "Manuallog.log",
    normal: "Scriptlog.log",
    backup: "Scriptlog.log",
    syncjelly: "Scriptlog.log",
    syncemby: "Scriptlog.log",
    reset: "Scriptlog.log",
    scheduled: "Scriptlog.log",
  };
  return logMapping[mode] || "Scriptlog.log";
};

const getWebSocketURL = (logFile) => {
  const baseURL = isDev
    ? `ws://localhost:3000/ws/logs`
    : `ws://${window.location.host}/ws/logs`;
  return `${baseURL}?log_file=${encodeURIComponent(logFile)}`;
};

let cachedStatus = null;
let cachedVersion = null;

function Dashboard() {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();
  const { startLoading, finishLoading } = useDashboardLoading();
  const [status, setStatus] = useState(
    cachedStatus || {
      running: false,
      last_logs: [],
      script_exists: false,
      config_exists: false,
      pid: null,
      current_mode: null,
      active_log: null,
      already_running_detected: false,
      running_file_exists: false,
      start_time: null,
    }
  );
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [version, setVersion] = useState(
    cachedVersion || { local: null, remote: null }
  );
  const [schedulerStatus, setSchedulerStatus] = useState({
    enabled: false,
    running: false,
    is_executing: false,
    schedules: [],
    next_run: null,
    timezone: null,
  });
  const [systemInfo, setSystemInfo] = useState({
    platform: "...",
    os_version: "...",
    cpu_model: "...",
    cpu_cores: 0,
    memory_percent: 0,
    total_memory: "...",
    used_memory: "...",
    free_memory: "...",
    is_docker: false,
  });

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [allLogs, setAllLogs] = useState([]); // Store all logs
  const [runtimeStatsRefreshTrigger, setRuntimeStatsRefreshTrigger] =
    useState(0);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const logContainerRef = useRef(null);
  const userHasScrolled = useRef(false);
  const lastScrollTop = useRef(0);
  const previousRunningState = useRef(null);

  // Card visibility settings
  const [showCardsModal, setShowCardsModal] = useState(false);
  const [visibleCards, setVisibleCards] = useState(() => {
    const saved = localStorage.getItem("dashboard_visible_cards");
    return saved
      ? JSON.parse(saved)
      : {
          statusCards: true,
          runtimeStats: true,
          recentAssets: true,
          logViewer: true,
        };
  });

  // Scrollbar visibility settings
  const [hideScrollbars, setHideScrollbars] = useState(() => {
    const saved = localStorage.getItem("hide_scrollbars");
    return saved ? JSON.parse(saved) : false;
  });

  // Card order settings
  const [cardOrder, setCardOrder] = useState(() => {
    const saved = localStorage.getItem("dashboard_card_order");
    return saved
      ? JSON.parse(saved)
      : ["statusCards", "recentAssets", "runtimeStats", "logViewer"];
  });

  const [draggedItem, setDraggedItem] = useState(null);
  const hasInitiallyLoaded = useRef(false);

  // Combined fetch for initial dashboard load - reduces HTTP requests from 4 to 1
  const fetchDashboardData = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch(`${API_URL}/dashboard/all`);
      const data = await response.json();

      if (data.success) {
        // Update status
        if (data.status) {
          cachedStatus = data.status;
          setStatus(data.status);

          // Initialize allLogs with the initial logs from status
          if (data.status.last_logs && data.status.last_logs.length > 0) {
            setAllLogs(data.status.last_logs);
          }
        }

        // Update version
        if (data.version) {
          cachedVersion = data.version;
          setVersion(data.version);
        }

        // Update scheduler status
        if (data.scheduler_status && data.scheduler_status.success) {
          setSchedulerStatus({
            enabled: data.scheduler_status.enabled || false,
            running: data.scheduler_status.running || false,
            is_executing: data.scheduler_status.is_executing || false,
            schedules: data.scheduler_status.schedules || [],
            next_run: data.scheduler_status.next_run || null,
            timezone: data.scheduler_status.timezone || null,
          });
        }

        // Update system info
        if (data.system_info) {
          setSystemInfo({
            platform: data.system_info.platform || "Unknown",
            os_version: data.system_info.os_version || "Unknown",
            cpu_model: data.system_info.cpu_model || "Unknown",
            cpu_cores: data.system_info.cpu_cores || 0,
            memory_percent: data.system_info.memory_percent || 0,
            total_memory: data.system_info.total_memory || "Unknown",
            used_memory: data.system_info.used_memory || "Unknown",
            free_memory: data.system_info.free_memory || "Unknown",
            is_docker: data.system_info.is_docker || false,
          });
        }
      }

      // Mark dashboard as loaded after first successful fetch
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("dashboard");
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      // Even on error, mark as loaded to show the page
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("dashboard");
      }
    } finally {
      if (!silent) {
        setTimeout(() => {
          setIsRefreshing(false);
        }, 500);
      }
    }
  };

  const fetchStatus = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();
      cachedStatus = data;
      setStatus(data);

      // Initialize allLogs with the initial logs from status
      if (data.last_logs && data.last_logs.length > 0) {
        setAllLogs(data.last_logs);
      }

      // Mark dashboard as loaded after first successful fetch
      if (!hasInitiallyLoaded.current) {
        hasInitiallyLoaded.current = true;
        finishLoading("dashboard");
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    } finally {
      if (!silent) {
        setTimeout(() => {
          setIsRefreshing(false);
        }, 500);
      }
    }
  };

  const fetchVersion = async (silent = false, forceRefresh = false) => {
    try {
      // Check localStorage cache first (nur wenn nicht force refresh)
      if (!forceRefresh) {
        const cached = localStorage.getItem("posterizarr_version");
        const cacheTime = localStorage.getItem("posterizarr_version_time");

        if (cached && cacheTime) {
          const age = Date.now() - parseInt(cacheTime);
          // Cache is valid for 24 hours
          if (age < 24 * 60 * 60 * 1000) {
            const cachedData = JSON.parse(cached);
            cachedVersion = cachedData;
            setVersion(cachedData);
            if (!silent) {
              console.log(
                "Using cached version data (age: " +
                  Math.round(age / 1000 / 60) +
                  " minutes)"
              );
            }
            return;
          } else if (!silent) {
            console.log("Version cache expired, fetching new data...");
          }
        }
      } else if (!silent) {
        console.log("Force refresh version data...");
      }

      // Fetch from API
      const response = await fetch(`${API_URL}/version`);
      if (!response.ok) {
        if (!silent) {
          console.warn("Version endpoint not available:", response.status);
        }
        return;
      }

      const data = await response.json();
      if (!silent) {
        console.log("Version data received from API:", data);
      }

      if (data.local || data.remote) {
        const versionData = {
          local: data.local || null,
          remote: data.remote || null,
          is_update_available: data.is_update_available || false,
        };

        // Cache im Memory
        cachedVersion = versionData;
        setVersion(versionData);

        // Cache in localStorage speichern
        localStorage.setItem(
          "posterizarr_version",
          JSON.stringify(versionData)
        );
        localStorage.setItem("posterizarr_version_time", Date.now().toString());

        if (!silent) {
          console.log("Version data cached in localStorage");
        }
      } else {
        if (!silent) {
          console.warn("No version data in response:", data);
        }
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching version:", error);
      }
    }
  };

  const fetchSchedulerStatus = async (silent = false) => {
    try {
      const response = await fetch(`${API_URL}/scheduler/status`);
      if (!response.ok) {
        if (!silent) {
          console.warn(
            "Scheduler status endpoint not available:",
            response.status
          );
        }
        return;
      }

      const data = await response.json();
      if (data.success) {
        setSchedulerStatus({
          enabled: data.enabled || false,
          running: data.running || false,
          is_executing: data.is_executing || false,
          schedules: data.schedules || [],
          next_run: data.next_run || null,
          timezone: data.timezone || null,
        });
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching scheduler status:", error);
      }
    }
  };

  const fetchSystemInfo = async (silent = false) => {
    try {
      const response = await fetch(`${API_URL}/system-info`);
      if (!response.ok) {
        if (!silent) {
          console.warn("System info endpoint not available:", response.status);
        }
        return;
      }

      const data = await response.json();
      setSystemInfo({
        platform: data.platform || "Unknown",
        os_version: data.os_version || "Unknown",
        cpu_model: data.cpu_model || "Unknown",
        cpu_cores: data.cpu_cores || 0,
        memory_percent: data.memory_percent || 0,
        total_memory: data.total_memory || "Unknown",
        used_memory: data.used_memory || "Unknown",
        free_memory: data.free_memory || "Unknown",
        is_docker: data.is_docker || false,
      });
    } catch (error) {
      if (!silent) {
        console.error("Error fetching system info:", error);
      }
    }
  };

  const connectDashboardWebSocket = () => {
    // Prevent multiple simultaneous connections
    if (wsRef.current) {
      console.log("Dashboard WebSocket already exists, skipping connection");
      return;
    }

    try {
      const logFile = status.current_mode
        ? getLogFileForMode(status.current_mode)
        : "Scriptlog.log";

      const wsURL = getWebSocketURL(logFile);
      console.log(` Dashboard connecting to: ${wsURL}`);

      const ws = new WebSocket(wsURL);

      // Store reference immediately to prevent race conditions
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`Dashboard WebSocket connected to ${logFile}`);
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "log") {
            // Add new log line to allLogs
            setAllLogs((prev) => [...prev, data.content]);

            // Update status with last 25 logs for backward compatibility
            setStatus((prev) => ({
              ...prev,
              last_logs: [...prev.last_logs.slice(-24), data.content],
            }));
          } else if (data.type === "log_file_changed") {
            console.log(`Backend switched to: ${data.log_file}`);
            // Clear logs when switching log files
            setAllLogs([]);
            disconnectDashboardWebSocket();
            setTimeout(() => connectDashboardWebSocket(), 300);
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
        }
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;

        // Only reconnect if still running and not manually disconnected
        reconnectTimeoutRef.current = setTimeout(() => {
          if (status.running && !document.hidden) {
            console.log("WebSocket closed, attempting reconnect...");
            connectDashboardWebSocket();
          }
        }, 3000);
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setWsConnected(false);
      wsRef.current = null;
    }
  };

  const disconnectDashboardWebSocket = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
    }
  };

  useEffect(() => {
    // Register dashboard as loading and fetch all initial data in one call
    startLoading("dashboard");
    fetchDashboardData(false);

    // Poll individual endpoints every 3 seconds for updates (lighter requests)
    const statusInterval = setInterval(() => {
      fetchStatus(true);
      fetchSchedulerStatus(true);
      fetchSystemInfo(true);
    }, 3000);

    // Interval for force refresh every 24 hours (if page stays open)
    const versionInterval = setInterval(
      () => fetchVersion(true, true), // forceRefresh = true after 24h
      24 * 60 * 60 * 1000
    );

    // Page Visibility API: Refresh data when tab becomes visible again
    // This ensures data is fresh when switching back to the dashboard tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("[Dashboard] Tab became visible, refreshing all data...");

        // Always trigger refresh of runtime stats and recent assets when returning to dashboard
        // This ensures fresh data regardless of whether script is running or not
        console.log(
          "[Dashboard] Triggering refresh of runtime stats and recent assets..."
        );
        setRuntimeStatsRefreshTrigger((prev) => prev + 1);

        // Fetch latest status
        fetchStatus(true);
        fetchSchedulerStatus(true);
        fetchSystemInfo(true);

        // WebSocket reconnection will be handled by the status.running useEffect below
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(statusInterval);
      clearInterval(versionInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      disconnectDashboardWebSocket();
    };
  }, [startLoading]);

  useEffect(() => {
    // Skip WebSocket management when tab is hidden to prevent unnecessary connections
    if (document.hidden) {
      return;
    }

    if (status.running && !wsRef.current) {
      console.log("Script is running, connecting WebSocket...");
      connectDashboardWebSocket();
    } else if (!status.running && wsRef.current) {
      console.log("Script stopped, disconnecting WebSocket...");
      disconnectDashboardWebSocket();
    }

    // Trigger runtime stats refresh when run finishes
    if (previousRunningState.current === true && status.running === false) {
      console.log("Run finished, triggering runtime stats refresh...");
      setRuntimeStatsRefreshTrigger((prev) => prev + 1);
    }

    // Update previous state
    previousRunningState.current = status.running;
  }, [status.running]);

  useEffect(() => {
    // Skip if tab is hidden or not running
    if (document.hidden || !status.running || !status.current_mode) {
      return;
    }

    // Only reconnect if we have an active connection
    if (wsRef.current) {
      const expectedLogFile = getLogFileForMode(status.current_mode);
      console.log(
        `Mode changed to ${status.current_mode}, expected log: ${expectedLogFile}`
      );

      // Disconnect and reconnect with new log file
      disconnectDashboardWebSocket();
      setTimeout(() => {
        if (!document.hidden && status.running) {
          connectDashboardWebSocket();
        }
      }, 300);
    }
  }, [status.current_mode]);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive and autoScroll is enabled
    if (!autoScroll || !logContainerRef.current) return;

    const container = logContainerRef.current;
    // Use requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [allLogs, autoScroll]);

  useEffect(() => {
    const logContainer = logContainerRef.current;
    if (!logContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = logContainer;
      const currentScrollTop = scrollTop;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;

      // Detect upward scroll (user scrolling up manually)
      if (currentScrollTop < lastScrollTop.current - 5) {
        userHasScrolled.current = true;
        // If user scrolls up while autoScroll is on, disable autoScroll
        if (autoScroll) {
          setAutoScroll(false);
        }
      }

      // If user scrolls to bottom manually, enable autoScroll again
      if (isAtBottom && !autoScroll) {
        setAutoScroll(true);
        userHasScrolled.current = false;
      }

      lastScrollTop.current = currentScrollTop;
    };

    logContainer.addEventListener("scroll", handleScroll);
    return () => logContainer.removeEventListener("scroll", handleScroll);
  }, [autoScroll]);

  const deleteRunningFile = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/running-file`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          // JSON parsing failed
        }

        showError(errorMessage);
        return;
      }

      const data = await response.json();

      if (data.success) {
        showSuccess(data.message || "Running file deleted successfully");
      } else {
        showError(data.message || "Failed to delete running file");
      }
      fetchStatus();
    } catch (error) {
      console.error("Delete running file error:", error);
      showError(`Error deleting running file: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save visibility settings to localStorage
  const saveVisibilitySettings = (settings) => {
    setVisibleCards(settings);
    localStorage.setItem("dashboard_visible_cards", JSON.stringify(settings));
  };

  const toggleCardVisibility = (cardKey) => {
    const newSettings = {
      ...visibleCards,
      [cardKey]: !visibleCards[cardKey],
    };
    saveVisibilitySettings(newSettings);
  };

  // Toggle scrollbar visibility
  const toggleScrollbarVisibility = () => {
    const newValue = !hideScrollbars;
    console.log("Toggling scrollbars:", newValue);
    setHideScrollbars(newValue);
    localStorage.setItem("hide_scrollbars", JSON.stringify(newValue));

    // Dispatch custom event to notify App.jsx
    window.dispatchEvent(new Event("scrollbarToggle"));
  };

  // Save card order to localStorage
  const saveCardOrder = (order) => {
    setCardOrder(order);
    localStorage.setItem("dashboard_card_order", JSON.stringify(order));
  };

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newOrder = [...cardOrder];
    const draggedCard = newOrder[draggedItem];
    newOrder.splice(draggedItem, 1);
    newOrder.splice(index, 0, draggedCard);

    setDraggedItem(index);
    setCardOrder(newOrder);
  };

  const handleDragEnd = () => {
    if (draggedItem !== null) {
      saveCardOrder(cardOrder);
    }
    setDraggedItem(null);
  };

  // Card labels for display
  const cardLabels = {
    statusCards: t("dashboard.statusCards"),
    runtimeStats: t("dashboard.runtimeStats"),
    recentAssets: t("dashboard.recentAssets"),
    logViewer: t("dashboard.liveLogFeed"),
  };

  const parseLogLine = (line) => {
    const cleanedLine = line.replace(/\x00/g, "").trim();

    if (!cleanedLine) {
      return { raw: null };
    }

    const logPattern = /^\[([^\]]+)\]\s*\[([^\]]+)\]\s*\|L\.(\d+)\s*\|\s*(.*)$/;
    const match = cleanedLine.match(logPattern);

    if (match) {
      return {
        timestamp: match[1],
        level: match[2].trim(),
        lineNum: match[3],
        message: match[4],
      };
    }
    return { raw: cleanedLine };
  };

  const LogLevel = ({ level }) => {
    const levelLower = (level || "").toLowerCase().trim();

    const colors = {
      error: "#f87171",
      warning: "#fbbf24",
      warn: "#fbbf24",
      info: "#22d3ee",
      success: "#4ade80",
      debug: "#c084fc",
      default: "#9ca3af",
    };

    const color = colors[levelLower] || colors.default;

    return <span style={{ color: color, fontWeight: "bold" }}>[{level}]</span>;
  };

  const getLogColor = (level) => {
    const levelLower = (level || "").toLowerCase().trim();

    const colors = {
      error: "#f87171",
      warning: "#fbbf24",
      warn: "#fbbf24",
      info: "#22d3ee",
      success: "#4ade80",
      debug: "#c084fc",
      default: "#d1d5db",
    };

    return colors[levelLower] || colors.default;
  };

  // Render cards in correct order
  const renderDashboardCards = () => {
    const cardComponents = {
      statusCards: visibleCards.statusCards && (
        <div
          key="statusCards"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {/* Script Status Card */}
          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-theme-muted text-sm mb-1 font-medium">
                  {t("dashboard.scriptStatus")}
                </p>
                <p
                  className={`text-2xl font-bold mb-2 ${
                    status.running ? "text-green-400" : "text-theme-text"
                  }`}
                >
                  {status.running
                    ? t("dashboard.running")
                    : t("dashboard.stopped")}
                </p>
                {status.running && (
                  <div className="space-y-1">
                    {status.current_mode && (
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 mb-1">
                        {t("dashboard.mode")}: {status.current_mode}
                      </div>
                    )}
                    {status.pid && (
                      <p className="text-sm text-theme-muted">
                        {t("dashboard.pid")}:{" "}
                        <span className="font-mono">{status.pid}</span>
                      </p>
                    )}
                    {status.start_time && (
                      <p className="text-xs text-theme-muted">
                        Started:{" "}
                        <span className="font-mono">
                          {formatDateTimeInTimezone(
                            status.start_time,
                            schedulerStatus?.timezone || "Europe/Berlin",
                            "N/A"
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="p-3 rounded-lg bg-theme-primary/10">
                {status.running ? (
                  <Activity className="w-12 h-12 text-green-400" />
                ) : (
                  <Activity className="w-12 h-12 text-gray-500" />
                )}
              </div>
            </div>
          </div>

          {/* Scheduler Jobs Card */}
          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-theme-muted text-sm mb-1 font-medium">
                  {t("dashboard.schedulerJobs")}
                </p>
                <p
                  className={`text-2xl font-bold mb-2 ${
                    schedulerStatus.enabled && schedulerStatus.running
                      ? "text-green-400"
                      : schedulerStatus.enabled
                      ? "text-yellow-400"
                      : "text-gray-400"
                  }`}
                >
                  {schedulerStatus.enabled
                    ? schedulerStatus.running
                      ? t("dashboard.active")
                      : t("dashboard.configured")
                    : t("dashboard.disabled")}
                </p>
                {schedulerStatus.enabled && (
                  <div className="space-y-1">
                    {schedulerStatus.schedules &&
                    schedulerStatus.schedules.length > 0 ? (
                      <>
                        <p className="text-xs text-theme-muted">
                          ⏰{" "}
                          {schedulerStatus.schedules
                            .map((s) => s.time)
                            .join(", ")}
                        </p>
                        {schedulerStatus.timezone && (
                          <p className="text-xs text-theme-muted flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {schedulerStatus.timezone}
                          </p>
                        )}
                        {schedulerStatus.next_run && (
                          <p className="text-xs text-blue-400">
                            {t("dashboard.nextRun")}:{" "}
                            {formatDateTimeInTimezone(
                              schedulerStatus.next_run,
                              schedulerStatus.timezone || "Europe/Berlin",
                              "N/A"
                            )}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-yellow-400">
                        {t("dashboard.noSchedulesRegistered")}
                      </p>
                    )}
                    {schedulerStatus.is_executing && (
                      <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {t("dashboard.executing")}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="p-3 rounded-lg bg-theme-primary/10">
                {schedulerStatus.enabled && schedulerStatus.running ? (
                  <Clock className="w-12 h-12 text-green-400" />
                ) : schedulerStatus.enabled ? (
                  <Clock className="w-12 h-12 text-yellow-400" />
                ) : (
                  <Clock className="w-12 h-12 text-gray-500" />
                )}
              </div>
            </div>
          </div>

          {/* Script & Config Files Card */}
          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-theme-muted text-sm mb-1 font-medium">
                  {t("dashboard.scriptFile")} & {t("dashboard.configFile")}
                </p>
                <div className="space-y-3">
                  {/* Script Status */}
                  <div className="flex items-center gap-2">
                    {status.script_exists ? (
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    )}
                    <span
                      className={`text-lg font-bold ${
                        status.script_exists ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {t("dashboard.scriptFile")}:{" "}
                      {status.script_exists
                        ? t("dashboard.found")
                        : t("dashboard.missing")}
                    </span>
                  </div>
                  {status.script_exists &&
                    (version.local || version.remote) && (
                      <div className="flex items-center gap-2 flex-wrap ml-7">
                        <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-theme-card border border-theme-primary text-theme-primary shadow-sm">
                          v{version.local || version.remote}
                        </span>
                        {version.is_update_available && (
                          <a
                            href="https://github.com/fscorrupt/Posterizarr/releases/latest"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center"
                          >
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/20 border border-green-500/50 text-green-400 shadow-sm animate-pulse hover:scale-105 transition-transform">
                              v{version.remote} available
                            </span>
                          </a>
                        )}
                      </div>
                    )}

                  {/* Config Status */}
                  <div className="flex items-center gap-2">
                    {status.config_exists ? (
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    )}
                    <span
                      className={`text-lg font-bold ${
                        status.config_exists ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {t("dashboard.configFile")}:{" "}
                      {status.config_exists
                        ? t("dashboard.found")
                        : t("dashboard.missing")}
                    </span>
                  </div>
                  {status.config_exists && (
                    <div className="ml-7">
                      <Link
                        to="/config"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
                      >
                        <Settings className="w-4 h-4 text-theme-primary" />
                        <span className="text-theme-text">
                          {t("dashboard.configureNow")}
                        </span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-theme-primary/10">
                {status.script_exists && status.config_exists ? (
                  <CheckCircle className="w-12 h-12 text-green-400" />
                ) : (
                  <AlertCircle className="w-12 h-12 text-red-400" />
                )}
              </div>
            </div>
          </div>

          {/* System Info Card */}
          <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-theme-muted text-sm mb-1 font-medium">
                  {t("dashboard.systemInfo")}
                </p>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-xl font-bold text-theme-text">
                    {systemInfo.platform}
                  </p>
                  {systemInfo.is_docker && (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-400 rounded border border-blue-500/30">
                      Docker
                    </span>
                  )}
                </div>
                {systemInfo.os_version &&
                  systemInfo.os_version !== "Unknown" && (
                    <p
                      className="text-xs text-theme-muted mb-2 truncate"
                      title={systemInfo.os_version}
                    >
                      {systemInfo.os_version}
                    </p>
                  )}
                <div className="space-y-1.5">
                  {systemInfo.cpu_model &&
                    systemInfo.cpu_model !== "Unknown" && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Cpu className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        <span
                          className="text-xs text-theme-muted truncate"
                          title={systemInfo.cpu_model}
                        >
                          {systemInfo.cpu_model}
                        </span>
                      </div>
                    )}
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                    <span className="text-xs text-theme-muted">
                      {systemInfo.cpu_cores} {t("dashboard.cores")}
                    </span>
                  </div>
                  {systemInfo.memory_percent > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <HardDrive className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        <span className="text-xs text-theme-muted truncate">
                          {systemInfo.used_memory} / {systemInfo.total_memory}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-theme-muted truncate">
                          {systemInfo.free_memory} {t("dashboard.free")}
                        </span>
                        <span
                          className={`text-xs font-medium flex-shrink-0 ${
                            systemInfo.memory_percent >= 90
                              ? "text-red-400"
                              : systemInfo.memory_percent >= 75
                              ? "text-orange-400"
                              : systemInfo.memory_percent >= 50
                              ? "text-yellow-400"
                              : "text-green-400"
                          }`}
                        >
                          {systemInfo.memory_percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-theme-hover rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            systemInfo.memory_percent >= 90
                              ? "bg-red-500"
                              : systemInfo.memory_percent >= 75
                              ? "bg-orange-500"
                              : systemInfo.memory_percent >= 50
                              ? "bg-yellow-500"
                              : "bg-green-500"
                          }`}
                          style={{ width: `${systemInfo.memory_percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-theme-primary/10 flex-shrink-0">
                <Server className="w-10 h-10 text-purple-400" />
              </div>
            </div>
          </div>
        </div>
      ),
      runtimeStats: visibleCards.runtimeStats && (
        <RuntimeStats
          key="runtimeStats"
          refreshTrigger={runtimeStatsRefreshTrigger}
        />
      ),
      recentAssets: visibleCards.recentAssets && (
        <RecentAssets
          key="recentAssets"
          refreshTrigger={runtimeStatsRefreshTrigger}
        />
      ),
      logViewer: visibleCards.logViewer && (
        <div
          key="logViewer"
          className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-theme-primary/10">
                    <FileText className="w-5 h-5 text-theme-primary" />
                  </div>
                  {t("dashboard.liveLogFeed")}
                </h2>

                {wsConnected && (
                  <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <Wifi className="w-3 h-3" />
                    Live
                  </span>
                )}
              </div>

              {status.running && status.active_log && allLogs.length > 0 && (
                <p
                  className="text-xs text-theme-muted mt-2"
                  style={{ marginLeft: "calc(2.25rem + 0.75rem)" }}
                >
                  {t("dashboard.readingFrom")}:{" "}
                  <span className="font-mono text-theme-primary">
                    {status.current_mode
                      ? getLogFileForMode(status.current_mode)
                      : status.active_log}
                  </span>
                  <span className="ml-3 text-xs text-theme-muted/70">
                    ({allLogs.length} {t("dashboard.linesLoaded")})
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm font-medium text-theme-text">
                  {t("dashboard.autoScroll")}
                </span>
                <button
                  onClick={() => {
                    const newAutoScrollState = !autoScroll;
                    setAutoScroll(newAutoScrollState);
                    userHasScrolled.current = false;

                    if (newAutoScrollState && logContainerRef.current) {
                      setTimeout(() => {
                        if (logContainerRef.current) {
                          logContainerRef.current.scrollTop =
                            logContainerRef.current.scrollHeight;
                        }
                      }, 100);
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoScroll ? "bg-theme-primary" : "bg-theme-hover"
                  }`}
                  title={
                    autoScroll
                      ? t("dashboard.autoScrollEnabled")
                      : t("dashboard.autoScrollDisabled")
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoScroll ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          <div className="bg-black rounded-lg overflow-hidden border-2 border-theme shadow-sm">
            {status.running && allLogs && allLogs.length > 0 ? (
              <div
                ref={logContainerRef}
                className="font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto"
              >
                {allLogs.map((line, index) => {
                  const parsed = parseLogLine(line);

                  if (parsed.raw === null) {
                    return null;
                  }

                  if (parsed.raw) {
                    return (
                      <div
                        key={`log-${index}`}
                        className="px-3 py-1.5 hover:bg-gray-900/50 transition-colors border-l-2 border-transparent hover:border-theme-primary/50"
                        style={{ color: "#9ca3af" }}
                      >
                        {parsed.raw}
                      </div>
                    );
                  }

                  const logColor = getLogColor(parsed.level);

                  return (
                    <div
                      key={`log-${index}`}
                      className="px-3 py-1.5 hover:bg-gray-900/50 transition-colors flex items-center gap-2 border-l-2 border-transparent hover:border-theme-primary/50"
                    >
                      <span
                        style={{ color: "#6b7280" }}
                        className="text-[10px]"
                      >
                        [{parsed.timestamp}]
                      </span>
                      <LogLevel level={parsed.level} />
                      <span
                        style={{ color: "#4b5563" }}
                        className="text-[10px]"
                      >
                        |L.{parsed.lineNum}|
                      </span>
                      <span style={{ color: logColor }}>{parsed.message}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-12 text-center">
                <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium">
                  {t("dashboard.noLogs")}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  {status.running
                    ? t("dashboard.waitingForLogs")
                    : t("dashboard.startRunToSeeLogs")}
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
            <span className="flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {t("dashboard.autoRefresh")}:{" "}
              {wsConnected ? t("dashboard.live") : "1.5s"}
            </span>
            <span className="text-gray-500">
              {t("dashboard.lastEntries", { count: 25 })} •{" "}
              {status.current_mode
                ? getLogFileForMode(status.current_mode)
                : status.active_log || t("dashboard.noActiveLog")}
            </span>
          </div>
        </div>
      ),
    };

    return cardOrder
      .map((cardKey, index) => {
        const card = cardComponents[cardKey];

        // Insert running banner after statusCards
        if (cardKey === "statusCards" && status.running) {
          return (
            <React.Fragment key={cardKey}>
              {card}
              <div className="bg-orange-950/40 rounded-xl p-6 border border-orange-600/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-600/20">
                      <AlertCircle className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                      <p className="font-medium text-orange-200 text-lg">
                        Script is running
                      </p>
                      <p className="text-sm text-orange-300/80">
                        Monitor progress in logs below or stop the script
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        }

        return card;
      })
      .filter(Boolean);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-theme-text flex items-center gap-3">
            <Activity className="w-7 h-7 sm:w-8 sm:h-8 text-theme-primary" />
            Dashboard
          </h1>
          <button
            onClick={() => setShowCardsModal(true)}
            className="w-10 h-10 flex items-center justify-center bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-full transition-all shadow-sm hover:scale-105"
            title={t("dashboard.customize")}
          >
            <Edit3 className="w-4 h-4 text-theme-primary" />
          </button>
        </div>

        {/* Quick Action: Go to Run Modes */}
        {!status.running && (
          <Link
            to="/run-modes"
            className="flex items-center justify-center gap-2 px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-sm font-medium transition-all shadow-sm"
          >
            <Play className="w-4 h-4 text-theme-primary" />
            <span className="text-theme-text">{t("dashboard.runScript")}</span>
          </Link>
        )}
      </div>

      {/* Already Running Warning */}
      {status.already_running_detected && (
        <div className="bg-yellow-900/30 border-l-4 border-yellow-500 rounded-lg p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-400 mb-2">
                {t("dashboard.alreadyRunning")}
              </h3>
              <p className="text-yellow-200 text-sm mb-4">
                {t("dashboard.alreadyRunningDesc")}
              </p>
              <button
                onClick={() => setDeleteConfirm(true)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all text-sm shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                {t("dashboard.deleteRunningFile")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Cards in Custom Order */}
      {renderDashboardCards()}

      {/* Danger Zone - Using DangerZone Component */}
      <DangerZone
        status={status}
        loading={loading}
        onStatusUpdate={fetchStatus}
        onSuccess={showSuccess}
        onError={showError}
      />

      {/* Delete Running File Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={deleteRunningFile}
        title="Delete Running File"
        message="Are you sure you want to delete the running file? This should only be done if you're certain no other instance is running."
        confirmText="Delete"
        type="warning"
      />

      {/* Card Visibility Settings Modal */}
      {showCardsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-theme-card rounded-xl border border-theme shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-theme">
              <h3 className="text-xl font-semibold text-theme-text flex items-center gap-2">
                <Eye className="w-5 h-5 text-theme-primary" />
                {t("dashboard.customize")}
              </h3>
              <button
                onClick={() => setShowCardsModal(false)}
                className="p-2 hover:bg-theme-hover rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-theme-muted" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <p className="text-sm text-theme-muted mb-4">
                {t("dashboard.customizeDescription")}
              </p>

              {cardOrder.map((cardKey, index) => (
                <label
                  key={cardKey}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-3 bg-theme-hover rounded-lg cursor-move hover:bg-theme-hover/70 hover:border-theme-primary/50 hover:shadow-md hover:scale-[1.02] transition-all border border-transparent ${
                    draggedItem === index ? "opacity-50 scale-95" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-5 h-5 text-theme-muted flex-shrink-0" />
                    {visibleCards[cardKey] ? (
                      <Eye className="w-5 h-5 text-green-400 flex-shrink-0" />
                    ) : (
                      <EyeOff className="w-5 h-5 text-gray-500 flex-shrink-0" />
                    )}
                    <span className="font-medium text-theme-text">
                      {cardLabels[cardKey]}
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleCards[cardKey]}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleCardVisibility(cardKey);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-theme-primary peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary"></div>
                  </label>
                </label>
              ))}

              {/* Scrollbar Visibility Toggle */}
              <div className="pt-4 border-t border-theme">
                <div className="flex items-center justify-between p-3 bg-theme-hover rounded-lg">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-theme-primary flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium text-theme-text">
                        {t("dashboard.hideScrollbars") || "Hide Scrollbars"}
                      </span>
                      <span className="text-xs text-theme-muted">
                        {t("dashboard.hideScrollbarsDesc") ||
                          "Hide scrollbars throughout the UI"}
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideScrollbars}
                      onChange={toggleScrollbarVisibility}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-theme-primary peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-theme">
              <button
                onClick={() => setShowCardsModal(false)}
                className="flex items-center gap-2 px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 rounded-lg text-theme-primary font-medium transition-all shadow-sm"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
