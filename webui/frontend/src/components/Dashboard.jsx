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
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import SystemInfo from "./SystemInfo";
import DangerZone from "./DangerZone";

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
    }
  );
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [version, setVersion] = useState(
    cachedVersion || { local: null, remote: null }
  );
  const [wsConnected, setWsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const logContainerRef = useRef(null);
  const userHasScrolled = useRef(false);
  const lastScrollTop = useRef(0);

  const fetchStatus = async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();
      cachedStatus = data;
      setStatus(data);
    } catch (error) {
      console.error("Error fetching status:", error);
    } finally {
      if (!silent) {
        setTimeout(() => setIsRefreshing(false), 500);
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
          // Cache ist 24 Stunden gültig
          if (age < 24 * 60 * 60 * 1000) {
            const cachedData = JSON.parse(cached);
            cachedVersion = cachedData;
            setVersion(cachedData);
            if (!silent) {
              console.log(
                "✅ Using cached version data (age: " +
                  Math.round(age / 1000 / 60) +
                  " minutes)"
              );
            }
            return;
          } else if (!silent) {
            console.log("🔄 Version cache expired, fetching new data...");
          }
        }
      } else if (!silent) {
        console.log("🔄 Force refresh version data...");
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
        console.log("📦 Version data received from API:", data);
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
          console.log("💾 Version data cached in localStorage");
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

  const connectDashboardWebSocket = () => {
    if (wsRef.current) {
      return;
    }

    try {
      const logFile = status.current_mode
        ? getLogFileForMode(status.current_mode)
        : "Scriptlog.log";

      const wsURL = getWebSocketURL(logFile);
      console.log(`🔡 Dashboard connecting to: ${wsURL}`);

      const ws = new WebSocket(wsURL);

      ws.onopen = () => {
        console.log(`✅ Dashboard WebSocket connected to ${logFile}`);
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "log") {
            setStatus((prev) => ({
              ...prev,
              last_logs: [...prev.last_logs.slice(-24), data.content],
            }));
          } else if (data.type === "log_file_changed") {
            console.log(`🔄 Backend switched to: ${data.log_file}`);
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

        reconnectTimeoutRef.current = setTimeout(() => {
          if (status.running) {
            connectDashboardWebSocket();
          }
        }, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setWsConnected(false);
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
    fetchStatus(true);
    fetchVersion(true); // Nutzt Cache wenn < 24h alt, fetched neu wenn älter

    // Intervall für force refresh alle 24 Stunden (falls Seite lange offen bleibt)
    const versionInterval = setInterval(
      () => fetchVersion(true, true), // forceRefresh = true nach 24h
      24 * 60 * 60 * 1000
    );

    return () => {
      clearInterval(versionInterval);
      disconnectDashboardWebSocket();
    };
  }, []);

  useEffect(() => {
    if (status.running && !wsRef.current) {
      connectDashboardWebSocket();
    } else if (!status.running && wsRef.current) {
      disconnectDashboardWebSocket();
    }
  }, [status.running]);

  useEffect(() => {
    if (status.running && status.current_mode && wsRef.current) {
      const expectedLogFile = getLogFileForMode(status.current_mode);
      console.log(
        `🔄 Mode changed to ${status.current_mode}, expected log: ${expectedLogFile}`
      );

      disconnectDashboardWebSocket();
      setTimeout(() => connectDashboardWebSocket(), 300);
    }
  }, [status.current_mode]);

  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) return;

    if (!userHasScrolled.current) {
      const container = logContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
  }, [status.last_logs, autoScroll]);

  useEffect(() => {
    const logContainer = logContainerRef.current;
    if (!logContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = logContainer;
      const currentScrollTop = scrollTop;

      if (currentScrollTop < lastScrollTop.current - 5) {
        userHasScrolled.current = true;
      }

      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
      if (isAtBottom) {
        userHasScrolled.current = false;
      }

      lastScrollTop.current = currentScrollTop;
    };

    logContainer.addEventListener("scroll", handleScroll);
    return () => logContainer.removeEventListener("scroll", handleScroll);
  }, []);

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

        toast.error(errorMessage, {
          duration: 5000,
          position: "top-right",
        });
        return;
      }

      const data = await response.json();

      if (data.success) {
        toast.success(data.message || "Running file deleted successfully", {
          duration: 3000,
          position: "top-right",
        });
      } else {
        toast.error(data.message || "Failed to delete running file", {
          duration: 4000,
          position: "top-right",
        });
      }
      fetchStatus();
    } catch (error) {
      console.error("Delete running file error:", error);
      toast.error(`Error deleting running file: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-theme-text flex items-center gap-3">
            <Activity className="w-8 h-8 text-theme-primary" />
            Monitor your Posterizarr instance
          </h1>
        </div>

        {/* Quick Action: Go to Run Modes */}
        {!status.running && (
          <a
            href="/run-modes"
            className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg font-medium transition-all shadow-lg hover:scale-[1.02]"
          >
            <Play className="w-5 h-5" />
            Run Script
          </a>
        )}
      </div>

      {/* Already Running Warning */}
      {status.already_running_detected && (
        <div className="bg-yellow-900/30 border-l-4 border-yellow-500 rounded-lg p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-400 mb-2">
                Another Posterizarr Instance Already Running
              </h3>
              <p className="text-yellow-200 text-sm mb-4">
                The script detected another instance. If this is a false
                positive, delete the running file below.
              </p>
              <button
                onClick={deleteRunningFile}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all text-sm shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete Running File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Script Status Card */}
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-sm mb-1 font-medium">
                Script Status
              </p>
              <p
                className={`text-2xl font-bold mb-2 ${
                  status.running ? "text-green-400" : "text-theme-text"
                }`}
              >
                {status.running ? "Running" : "Stopped"}
              </p>
              {status.running && (
                <div className="space-y-1">
                  {status.pid && (
                    <p className="text-sm text-theme-muted">
                      PID: <span className="font-mono">{status.pid}</span>
                    </p>
                  )}
                  {status.current_mode && (
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Mode: {status.current_mode}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-theme-primary/10">
              {status.running ? (
                <CheckCircle className="w-12 h-12 text-green-400" />
              ) : (
                <Clock className="w-12 h-12 text-gray-500" />
              )}
            </div>
          </div>
        </div>

        {/* Script File Card */}
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-sm mb-1 font-medium">
                Script File
              </p>
              <p
                className={`text-2xl font-bold mb-2 ${
                  status.script_exists ? "text-green-400" : "text-red-400"
                }`}
              >
                {status.script_exists ? "Found" : "Missing"}
              </p>
              {status.script_exists && (version.local || version.remote) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-theme-primary text-white">
                    v{version.local || version.remote}
                  </span>
                  {version.is_update_available && (
                    <a
                      href="https://github.com/fscorrupt/Posterizarr/releases/latest"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center"
                    >
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500 text-white animate-pulse hover:scale-105 transition-transform">
                        v{version.remote} available
                      </span>
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-theme-primary/10">
              {status.script_exists ? (
                <CheckCircle className="w-12 h-12 text-green-400" />
              ) : (
                <AlertCircle className="w-12 h-12 text-red-400" />
              )}
            </div>
          </div>
        </div>

        {/* Config File Card */}
        <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-theme-muted text-sm mb-1 font-medium">
                Config File
              </p>
              <p
                className={`text-2xl font-bold mb-2 ${
                  status.config_exists ? "text-green-400" : "text-red-400"
                }`}
              >
                {status.config_exists ? "Found" : "Missing"}
              </p>
              {status.config_exists && (
                <Link
                  to="/config"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-theme-primary/20 hover:bg-theme-primary text-theme-primary hover:text-white border border-theme-primary/30 rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-sm"
                >
                  <Settings className="w-4 h-4" />
                  EDIT
                </Link>
              )}
            </div>
            <div className="p-3 rounded-lg bg-theme-primary/10">
              {status.config_exists ? (
                <CheckCircle className="w-12 h-12 text-green-400" />
              ) : (
                <AlertCircle className="w-12 h-12 text-red-400" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* System Information */}
      <SystemInfo />

      {/* Running Script Controls */}
      {status.running && (
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
      )}

      {/* Log Viewer */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme hover:border-theme-primary/50 transition-all shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-theme-text flex items-center gap-3">
                <div className="p-2 rounded-lg bg-theme-primary/10">
                  <FileText className="w-5 h-5 text-theme-primary" />
                </div>
                Live Log Feed
              </h2>

              {wsConnected && (
                <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-xs text-green-400">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <Wifi className="w-3 h-3" />
                  Live
                </span>
              )}
            </div>

            {status.active_log && (
              <p
                className="text-xs text-theme-muted mt-2"
                style={{ marginLeft: "calc(2.25rem + 0.75rem)" }}
              >
                Reading from:{" "}
                <span className="font-mono text-theme-primary">
                  {status.current_mode
                    ? getLogFileForMode(status.current_mode)
                    : status.active_log}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
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
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                autoScroll
                  ? "bg-theme-primary/20 text-theme-primary border border-theme-primary/30"
                  : "bg-theme-hover text-theme-muted border border-theme"
              }`}
              title={
                autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"
              }
            >
              <span>Auto-scroll</span>
            </button>
          </div>
        </div>

        <div className="bg-black rounded-lg overflow-hidden border-2 border-theme shadow-sm">
          {status.last_logs && status.last_logs.length > 0 ? (
            <div
              ref={logContainerRef}
              className="font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto"
            >
              {status.last_logs.map((line, index) => {
                const parsed = parseLogLine(line);

                if (parsed.raw === null) {
                  return null;
                }

                if (parsed.raw) {
                  return (
                    <div
                      key={index}
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
                    key={index}
                    className="px-3 py-1.5 hover:bg-gray-900/50 transition-colors flex items-center gap-2 border-l-2 border-transparent hover:border-theme-primary/50"
                  >
                    <span style={{ color: "#6b7280" }} className="text-[10px]">
                      [{parsed.timestamp}]
                    </span>
                    <LogLevel level={parsed.level} />
                    <span style={{ color: "#4b5563" }} className="text-[10px]">
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
                No logs available
              </p>
              <p className="text-gray-600 text-xs mt-1">
                Start a script to see output here
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span className="flex items-center gap-2">
            <Clock className="w-3 h-3" />
            Auto-refresh: {wsConnected ? "Live" : "1.5s"}
          </span>
          <span className="text-gray-500">
            Last 25 entries •{" "}
            {status.current_mode
              ? getLogFileForMode(status.current_mode)
              : status.active_log || "No active log"}
          </span>
        </div>
      </div>

      {/* Danger Zone - Using DangerZone Component */}
      <DangerZone
        status={status}
        loading={loading}
        onStatusUpdate={fetchStatus}
      />
    </div>
  );
}

export default Dashboard;
