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
  const logContainerRef = useRef(null);
  const wsRef = useRef(null);

  // ✅ PERFEKT: Entfernt nur NULL-Bytes, behält alle Leerzeichen
  const parseLogLine = (line) => {
    // Entferne nur NULL-Bytes (\x00) und trim die Zeile
    const cleanedLine = line.replace(/\x00/g, "").trim();

    // Prüfe ob die Zeile leer ist
    if (!cleanedLine) {
      return { raw: null }; // Ignoriere leere Zeilen
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

  // ✅ Farbige Log-Level
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

  // ✅ Farbe für die ganze Log-Zeile
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
      // ✅ Kurze Verzögerung damit die Animation sichtbar ist
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const fetchLogFile = async (logName) => {
    try {
      const response = await fetch(`${API_URL}/logs/${logName}?tail=500`);
      const data = await response.json();
      // ✅ Strippe die Zeilen wie der WebSocket es auch macht
      const strippedContent = data.content.map((line) => line.trim());
      setLogs(strippedContent);

      // ✅ WebSocket nur für Scriptlog.log aktiv, sonst trennen
      if (logName === "Scriptlog.log") {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connectWebSocket();
        }
      } else {
        // Trenne WebSocket wenn andere Log-Datei ausgewählt
        if (wsRef.current) {
          wsRef.current.close();
        }
      }
    } catch (error) {
      console.error("Error fetching log:", error);
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "log") {
        setLogs((prev) => [...prev, data.content]);
      }
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => setConnected(false);

    wsRef.current = ws;
  };

  useEffect(() => {
    fetchAvailableLogs();

    // ✅ WebSocket nur für Scriptlog.log starten
    if (selectedLog === "Scriptlog.log") {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = () => setLogs([]);

  // ✅ NEUE Download-Funktion: Lädt die KOMPLETTE Log-Datei direkt vom Server als .log herunter
  const downloadLogs = async () => {
    try {
      // Hole die KOMPLETTE Log-Datei vom Server (ohne tail Parameter = ALLE Zeilen)
      // WICHTIG: Kein tail Parameter, damit wir die komplette Datei bekommen!
      const response = await fetch(`${API_URL}/logs/${selectedLog}?tail=0`);
      const data = await response.json();

      // Erstelle die komplette Log-Datei als Text
      const logText = data.content.join("\n");
      const blob = new Blob([logText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // ✅ Speichere als .log Datei (nicht .txt)
      // Entferne die Dateiendung vom selectedLog und füge ein Timestamp hinzu
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

  return (
    <div className="px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-3xl font-bold text-theme-primary">Logs</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <span
              className={`w-3 h-3 rounded-full ${
                connected ? "bg-green-400 animate-pulse" : "bg-red-400"
              }`}
            ></span>
            <span className="text-sm text-theme-muted">
              {connected ? "Live" : "Disconnected"}
            </span>
          </div>

          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4 rounded bg-theme-card border-theme"
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
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-2"
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

      {/* Log selector */}
      <div className="mb-4">
        <select
          value={selectedLog}
          onChange={(e) => {
            setSelectedLog(e.target.value);
            fetchLogFile(e.target.value);
          }}
          className="px-4 py-2 bg-theme-card border border-theme rounded text-white text-sm"
        >
          {availableLogs.map((log) => (
            <option key={log.name} value={log.name}>
              {log.name} ({(log.size / 1024).toFixed(2)} KB)
            </option>
          ))}
        </select>
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

                // Ignoriere leere Zeilen
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
      </div>
    </div>
  );
}

export default LogViewer;
