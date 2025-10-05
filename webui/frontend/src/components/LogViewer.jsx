import React, { useState, useEffect, useRef } from "react";
import { RefreshCw, Download, Trash2 } from "lucide-react";

const API_URL = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/ws/logs";

function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [availableLogs, setAvailableLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState("Scriptlog.log");
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const logContainerRef = useRef(null);
  const wsRef = useRef(null);
  const dropdownRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

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

  const fetchAvailableLogs = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/logs`);
      const data = await response.json();
      setAvailableLogs(data.logs);
    } catch (error) {
      console.error("Error fetching log files:", error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const fetchLogFile = async (logName) => {
    try {
      const response = await fetch(`${API_URL}/logs/${logName}?tail=500`);
      const data = await response.json();
      const strippedContent = data.content.map((line) => line.trim());
      setLogs(strippedContent);
    } catch (error) {
      console.error("Error fetching log:", error);
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
  };

  const connectWebSocket = () => {
    // Verhindere mehrfache Verbindungen
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    disconnectWebSocket();

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "log") {
            setLogs((prev) => [...prev, data.content]);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.warn("⚠️ WebSocket error (attempting reconnect):", error);
        setConnected(false);
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);
        setConnected(false);

        // Versuche Reconnect nach 3 Sekunden
        if (!event.wasClean) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 Attempting to reconnect WebSocket...");
            connectWebSocket();
          }, 3000);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setConnected(false);
    }
  };

  useEffect(() => {
    fetchAvailableLogs();
    fetchLogFile(selectedLog);

    // Versuche WebSocket-Verbindung für alle Logs
    connectWebSocket();

    return () => {
      disconnectWebSocket();
    };
  }, []);

  // Bei Log-Wechsel neu laden
  useEffect(() => {
    fetchLogFile(selectedLog);
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

  const clearLogs = () => setLogs([]);

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
    } catch (error) {
      console.error("Error downloading complete log file:", error);
      alert(
        "Fehler beim Herunterladen der Log-Datei. Bitte versuche es erneut."
      );
    }
  };

  // Status-Anzeige
  const getDisplayStatus = () => {
    if (connected) {
      return {
        color: "bg-green-400 animate-pulse",
        text: "Live",
      };
    } else {
      return {
        color: "bg-yellow-400",
        text: "File View",
      };
    }
  };

  const displayStatus = getDisplayStatus();

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold text-theme-primary">Logs</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <span
              className={`w-3 h-3 rounded-full ${displayStatus.color}`}
            ></span>
            <span className="text-sm text-theme-muted">
              {displayStatus.text}
            </span>
          </div>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4 rounded bg-theme-card border border-theme"
            />
            <span className="text-sm text-theme-text">Auto-scroll</span>
          </label>

          <button
            onClick={fetchAvailableLogs}
            disabled={isRefreshing}
            className="px-3 py-2 bg-theme-card hover:bg-theme-hover border border-theme disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm flex items-center gap-2 transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>

          <button
            onClick={downloadLogs}
            className="px-3 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded text-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download
          </button>

          <button
            onClick={clearLogs}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded text-sm flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      {/* Log selector - Custom Dropdown */}
      <div className="mb-4 relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full px-4 py-2 bg-theme-card border border-theme-primary rounded text-white text-sm flex items-center justify-between hover:bg-theme-hover transition-colors"
        >
          <span>
            {selectedLog} (
            {availableLogs.find((l) => l.name === selectedLog)
              ? (
                  availableLogs.find((l) => l.name === selectedLog).size / 1024
                ).toFixed(2)
              : "0.00"}{" "}
            KB)
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${
              dropdownOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute z-10 w-full mt-1 bg-theme-card border border-theme-primary rounded shadow-lg max-h-60 overflow-y-auto">
            {availableLogs.map((log) => (
              <button
                key={log.name}
                onClick={() => {
                  setSelectedLog(log.name);
                  setDropdownOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  selectedLog === log.name
                    ? "bg-theme-primary text-white"
                    : "text-theme-text hover:bg-theme-primary hover:text-white"
                }`}
              >
                {log.name} ({(log.size / 1024).toFixed(2)} KB)
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compact Terminal-Style Log Container */}
      <div className="bg-theme-card rounded-lg border border-theme overflow-hidden">
        <div
          ref={logContainerRef}
          className="h-[700px] overflow-y-auto bg-black p-2"
          style={{ scrollbarWidth: "thin" }}
        >
          {logs.length === 0 ? (
            <div className="text-center py-12 text-gray-600 text-xs">
              No logs to display
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
                      className="px-1 py-1 hover:bg-gray-900/50"
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
                    className="px-1 py-1 hover:bg-gray-900/50 flex items-center gap-2"
                  >
                    <span style={{ color: "#6b7280" }}>
                      [{parsed.timestamp}]
                    </span>
                    <LogLevel level={parsed.level} />
                    <span style={{ color: "#4b5563" }}>
                      |L.{parsed.lineNum}|
                    </span>
                    <span style={{ color: logColor }}>{parsed.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 text-[10px] text-gray-600 flex justify-between">
        <span>{logs.length} log entries</span>
        {connected && (
          <span className="text-green-400">● Receiving live updates</span>
        )}
      </div>
    </div>
  );
}

export default LogViewer;
