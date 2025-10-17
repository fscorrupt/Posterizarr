import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  RefreshCw,
  Download,
  Trash2,
  FileText,
  CheckCircle,
  Wifi,
  WifiOff,
  ChevronDown,
  Activity,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";

const API_URL = "/api";
const isDev = import.meta.env.DEV;

const getWebSocketURL = (logFile) => {
  const baseURL = isDev
    ? `ws://localhost:3000/ws/logs`
    : `ws://${window.location.host}/ws/logs`;

  // Add log_file as query parameter
  return `${baseURL}?log_file=${encodeURIComponent(logFile)}`;
};

function LogViewer() {
  const { t } = useTranslation();
  const { showSuccess, showError, showInfo } = useToast();
  const location = useLocation();
  const [logs, setLogs] = useState([]);
  const [availableLogs, setAvailableLogs] = useState([]);

  const initialLogFile = location.state?.logFile || "Scriptlog.log";
  const [selectedLog, setSelectedLog] = useState(initialLogFile);

  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false); // ✨ NEW: Loading state for stop button

  const [status, setStatus] = useState({
    running: false,
    current_mode: null,
  });

  const logContainerRef = useRef(null);
  const wsRef = useRef(null);
  const dropdownRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const currentLogFileRef = useRef(initialLogFile); // ✨ Initialize with passed log file

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

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();
      setStatus({
        running: data.running || false,
        current_mode: data.current_mode || null,
      });
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  const stopScript = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/stop`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        showSuccess(t("logViewer.scriptStopped"));
        fetchStatus(); // Refresh status
      } else {
        showError(t("logViewer.error", { message: data.message }));
      }
    } catch (error) {
      showError(t("logViewer.error", { message: error.message }));
    } finally {
      setLoading(false);
    }
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

  const fetchAvailableLogs = async (showToast = false) => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/logs`);
      const data = await response.json();
      setAvailableLogs(data.logs);

      if (showToast) {
        showSuccess(t("logViewer.logsRefreshed"));
      }
    } catch (error) {
      console.error("Error fetching log files:", error);
      if (showToast) {
        showError(t("logViewer.refreshFailed"));
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const fetchLogFile = async (logName) => {
    try {
      const response = await fetch(`${API_URL}/logs/${logName}?tail=1000`);
      const data = await response.json();
      const strippedContent = data.content.map((line) => line.trim());
      setLogs(strippedContent);
    } catch (error) {
      console.error("Error fetching log:", error);
      showError(t("logViewer.loadFailed", { name: logName }));
    }
  };

  const disconnectWebSocket = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;

      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setConnected(false);
    setIsReconnecting(false);
  };

  const connectWebSocket = (logFile = selectedLog) => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      // If already connected to the correct log file, don't reconnect
      if (currentLogFileRef.current === logFile) {
        console.log(`Already connected to ${logFile}`);
        return;
      }
    }

    disconnectWebSocket();

    try {
      const wsURL = getWebSocketURL(logFile);
      console.log(`Connecting to WebSocket: ${wsURL}`);

      const ws = new WebSocket(wsURL);
      currentLogFileRef.current = logFile; // Track which log we're watching

      ws.onopen = () => {
        console.log(`✅ WebSocket connected to ${logFile}`);
        setConnected(true);
        setIsReconnecting(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "log") {
            setLogs((prev) => [...prev, data.content]);
          } else if (data.type === "log_file_changed") {
            // Only accept this if we're NOT manually viewing a specific log
            console.log(`📄 Backend wants to switch to: ${data.log_file}`);

            // Update selectedLog only if user hasn't manually selected a different one
            // This prevents the backend from overriding user's manual selection
            if (selectedLog === currentLogFileRef.current) {
              console.log(`Accepting backend log switch to: ${data.log_file}`);
              setSelectedLog(data.log_file);
              currentLogFileRef.current = data.log_file;
              showInfo(t("logViewer.switchedTo", { file: data.log_file }));
            } else {
              console.log(
                `Ignoring backend log switch - user manually selected ${selectedLog}`
              );
            }
          } else if (data.type === "error") {
            console.error("WebSocket error message:", data.message);
            showError(data.message);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.warn("⚠️ WebSocket error:", error);
        setConnected(false);
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code);
        setConnected(false);

        if (!event.wasClean) {
          setIsReconnecting(true);

          showError(t("logViewer.disconnected"));

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`🔄 Reconnecting to ${currentLogFileRef.current}...`);
            connectWebSocket(currentLogFileRef.current); // Reconnect to the same log file
          }, 2000);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setConnected(false);
      setIsReconnecting(true);

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket(logFile);
      }, 3000);
    }
  };

  useEffect(() => {
    fetchAvailableLogs();
    fetchLogFile(selectedLog);
    connectWebSocket(selectedLog);

    return () => {
      disconnectWebSocket();
    };
  }, []);

  useEffect(() => {
    fetchStatus(); // Initial fetch
    const interval = setInterval(fetchStatus, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (location.state?.logFile && location.state.logFile !== selectedLog) {
      console.log(
        ` LogViewer received log file from navigation: ${location.state.logFile}`
      );
      setSelectedLog(location.state.logFile);

      showSuccess(t("logViewer.switchedTo", { file: location.state.logFile }));
    }
  }, [location.state?.logFile]);

  useEffect(() => {
    console.log(`Selected log changed to: ${selectedLog}`);
    fetchLogFile(selectedLog);

    // Always reconnect when user manually changes log file
    if (wsRef.current) {
      disconnectWebSocket();
      setTimeout(() => {
        connectWebSocket(selectedLog);
      }, 300);
    }
  }, [selectedLog]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
    showSuccess(t("logViewer.logsCleared"));
  };

  const downloadLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/logs/${selectedLog}?tail=0`);
      const data = await response.json();

      const logText = data.content.join("\n");
      const blob = new Blob([logText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const logNameWithoutExt = selectedLog.replace(/\.[^/.]+$/, "");
      a.download = `${logNameWithoutExt}_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.log`;

      a.click();
      URL.revokeObjectURL(url);

      showSuccess(t("logViewer.downloaded"));
    } catch (error) {
      console.error("Error downloading complete log file:", error);
      showError(t("logViewer.downloadFailed"));
    }
  };

  const getDisplayStatus = () => {
    if (connected) {
      return {
        color: "bg-green-400",
        icon: Wifi,
        text: t("logViewer.status.live"),
        ringColor: "ring-green-400/30",
      };
    } else if (isReconnecting) {
      return {
        color: "bg-yellow-400",
        icon: Wifi,
        text: t("logViewer.status.reconnecting"),
        ringColor: "ring-yellow-400/30",
      };
    } else {
      return {
        color: "bg-red-400",
        icon: WifiOff,
        text: t("logViewer.status.disconnected"),
        ringColor: "ring-red-400/30",
      };
    }
  };

  const displayStatus = getDisplayStatus();
  const StatusIcon = displayStatus.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        {/* Connection Status Badge */}
        <div
          className={`flex items-center gap-3 px-4 py-2 rounded-lg bg-theme-card border ${
            connected
              ? "border-green-500/50"
              : isReconnecting
              ? "border-yellow-500/50"
              : "border-red-500/50"
          } shadow-sm`}
        >
          <div className="relative">
            <div
              className={`w-3 h-3 rounded-full ${displayStatus.color} ${
                connected || isReconnecting ? "animate-pulse" : ""
              }`}
            ></div>
            {(connected || isReconnecting) && (
              <div
                className={`absolute inset-0 w-3 h-3 rounded-full ${
                  displayStatus.color
                } ${connected || isReconnecting ? "animate-ping" : ""}`}
              ></div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon className="w-4 h-4 text-theme-muted" />
            <span className="text-sm font-medium text-theme-text">
              {displayStatus.text}
            </span>
          </div>
        </div>
      </div>

      {status.running && (
        <div className="bg-orange-950/40 rounded-xl p-4 border border-orange-600/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-600/20">
                <Activity className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="font-medium text-orange-200">
                  {t("logViewer.scriptRunning")}
                </p>
                <p className="text-sm text-orange-300/80">
                  {status.current_mode && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/20 text-orange-200 mr-2">
                      {t("logViewer.mode")}: {status.current_mode}
                    </span>
                  )}
                  {t("logViewer.stopBeforeRunning")}
                </p>
              </div>
            </div>
            <button
              onClick={stopScript}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all shadow-sm"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {t("logViewer.stopScript")}
            </button>
          </div>
        </div>
      )}

      {/* Controls Section */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Log Selector */}
          <div className="flex-1 w-full lg:max-w-md">
            <label className="block text-sm font-medium text-theme-text mb-2">
              {t("logViewer.selectLogFile")}
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full px-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text text-sm flex items-center justify-between hover:bg-theme-hover hover:border-theme-primary/50 transition-all shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-theme-primary" />
                  <span className="font-medium">{selectedLog}</span>
                  <span className="text-theme-muted text-xs">
                    (
                    {availableLogs.find((l) => l.name === selectedLog)
                      ? (
                          availableLogs.find((l) => l.name === selectedLog)
                            .size / 1024
                        ).toFixed(2)
                      : "0.00"}{" "}
                    KB)
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    dropdownOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute z-10 w-full mt-2 bg-theme-card border border-theme-primary rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {availableLogs.map((log) => (
                    <button
                      key={log.name}
                      onClick={() => {
                        console.log(`User selected log: ${log.name}`);
                        setSelectedLog(log.name);
                        setDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left text-sm transition-all ${
                        selectedLog === log.name
                          ? "bg-theme-primary text-white"
                          : "text-theme-text hover:bg-theme-primary/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{log.name}</span>
                        <span className="text-xs opacity-80">
                          {(log.size / 1024).toFixed(2)} KB
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Auto-scroll Toggle */}
            <label className="flex items-center gap-2 px-4 py-2 bg-theme-bg border border-theme rounded-lg cursor-pointer hover:bg-theme-hover transition-all">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-4 h-4 rounded bg-theme-card border border-theme accent-theme-primary"
              />
              <span className="text-sm text-theme-text font-medium">
                {t("logViewer.autoScroll")}
              </span>
            </label>

            {/* Refresh Button */}
            <button
              onClick={() => fetchAvailableLogs(true)}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-theme-bg hover:bg-theme-hover border border-theme disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all hover:scale-[1.02] shadow-sm"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              {t("logViewer.refresh")}
            </button>

            {/* Download Button */}
            <button
              onClick={downloadLogs}
              className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] shadow-sm"
            >
              <Download className="w-4 h-4" />
              {t("logViewer.download")}
            </button>

            {/* Clear Button */}
            <button
              onClick={clearLogs}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              {t("logViewer.clear")}
            </button>
          </div>
        </div>
      </div>

      {/* Log Display Section */}
      <div className="bg-theme-card rounded-xl border border-theme shadow-sm overflow-hidden">
        {/* Log Container Header */}
        <div className="bg-theme-bg px-6 py-3 border-b border-theme flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-theme-primary/10">
              <FileText className="w-4 h-4 text-theme-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-theme-text">
                {selectedLog}
              </h3>
              <p className="text-xs text-theme-muted">
                {t("logViewer.showingLast")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-theme-muted">
            <span className="font-mono">
              {t("logViewer.entries", { count: logs.length })}
            </span>
            {connected && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-400">
                <CheckCircle className="w-3 h-3" />
                <span>{t("logViewer.status.live")}</span>
              </div>
            )}
            {isReconnecting && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-400 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{t("logViewer.status.reconnecting")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Terminal-Style Log Container */}
        <div
          ref={logContainerRef}
          className="h-[700px] overflow-y-auto bg-black p-4"
          style={{ scrollbarWidth: "thin" }}
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileText className="w-16 h-16 text-gray-700 mb-4" />
              <p className="text-gray-500 font-medium mb-2">
                {t("logViewer.noLogs")}
              </p>
              <p className="text-gray-600 text-sm">
                {t("logViewer.startScript")}
              </p>
            </div>
          ) : (
            <div className="font-mono text-[11px] leading-relaxed">
              {logs.map((line, index) => {
                const parsed = parseLogLine(line);

                if (parsed.raw === null) {
                  return null;
                }

                if (parsed.raw) {
                  return (
                    <div
                      key={index}
                      className="px-2 py-1 hover:bg-gray-900/50 transition-colors rounded border-l-2 border-transparent hover:border-theme-primary/50"
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
                    className="px-2 py-1 hover:bg-gray-900/50 transition-colors flex items-center gap-2 rounded border-l-2 border-transparent hover:border-theme-primary/50"
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
          )}
        </div>

        {/* Footer */}
        <div className="bg-theme-bg px-6 py-3 border-t border-theme flex items-center justify-between text-xs text-theme-muted">
          <div className="flex items-center gap-4">
            <span className="font-mono">
              {t("logViewer.logEntries", { count: logs.length })}
            </span>
            <span>•</span>
            <span>
              {t("logViewer.autoScrollStatus", {
                status: autoScroll ? t("logViewer.on") : t("logViewer.off"),
              })}
            </span>
          </div>
          {connected && (
            <div className="flex items-center gap-2 text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span>{t("logViewer.receivingUpdates")}</span>
            </div>
          )}
          {isReconnecting && (
            <div className="flex items-center gap-2 text-yellow-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>{t("logViewer.status.reconnecting")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LogViewer;
