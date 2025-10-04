import React, { useState, useEffect } from "react";
import {
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Settings,
  Save,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "http://localhost:8000/api";

function Dashboard() {
  const [status, setStatus] = useState({
    running: false,
    last_logs: [],
    script_exists: false,
    config_exists: false,
    pid: null,
    already_running_detected: false,
    running_file_exists: false,
  });
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching status:", error);
    } finally {
      // ✅ Kurze Verzögerung damit die Animation sichtbar ist
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const runScript = async (mode) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/run/${mode}`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        toast.success(`Script started in ${mode} mode!`, {
          duration: 4000,
          position: "top-right",
        });
        fetchStatus();
      } else {
        toast.error(`Error: ${data.message}`, {
          duration: 5000,
          position: "top-right",
        });
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
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
        toast.success(data.message, {
          duration: 3000,
          position: "top-right",
        });
      } else {
        toast.error(data.message, {
          duration: 4000,
          position: "top-right",
        });
      }
      fetchStatus();
    } catch (error) {
      toast.error(`Error: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  const forceKillScript = async () => {
    if (
      !confirm(
        "Force kill the script? This will terminate it immediately without cleanup."
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/force-kill`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        toast.success(data.message, {
          duration: 3000,
          position: "top-right",
        });
      } else {
        toast.error(data.message, {
          duration: 4000,
          position: "top-right",
        });
      }
      fetchStatus();
    } catch (error) {
      toast.error(`Error: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteRunningFile = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/delete-running`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        toast.success(data.message, {
          duration: 3000,
          position: "top-right",
        });
      } else {
        toast.error(data.message, {
          duration: 4000,
          position: "top-right",
        });
      }
      fetchStatus();
    } catch (error) {
      toast.error(`Error: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

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

  // ✅ Farbige Log-Level mit passender Message-Farbe
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

  // ✅ Farbe für die ganze Log-Zeile basierend auf Level
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
    <div className="px-4 py-6">
      <Toaster />

      <h1 className="text-3xl font-bold mb-8 text-purple-400">Dashboard</h1>

      {status.already_running_detected && (
        <div className="mb-6 bg-yellow-900/30 border-2 border-yellow-600/50 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="h-6 w-6 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-400 mb-2">
                Another Posterizarr Instance Already Running
              </h3>
              <p className="text-yellow-200 text-sm mb-3">
                The script detected another instance. If this is a false
                positive, delete the running file.
              </p>
              <button
                onClick={deleteRunningFile}
                className="flex items-center px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-medium transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Running File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Script Status</p>
              <p
                className={`text-2xl font-bold ${
                  status.running ? "text-green-400" : "text-gray-300"
                }`}
              >
                {status.running ? "Running" : "Stopped"}
              </p>
              {status.running && status.pid && (
                <p className="text-sm text-gray-500 mt-1">PID: {status.pid}</p>
              )}
            </div>
            {status.running ? (
              <CheckCircle className="h-12 w-12 text-green-400" />
            ) : (
              <Clock className="h-12 w-12 text-gray-500" />
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Script File</p>
              <p
                className={`text-2xl font-bold ${
                  status.script_exists ? "text-green-400" : "text-red-400"
                }`}
              >
                {status.script_exists ? "Found" : "Missing"}
              </p>
            </div>
            {status.script_exists ? (
              <CheckCircle className="h-12 w-12 text-green-400" />
            ) : (
              <AlertCircle className="h-12 w-12 text-red-400" />
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Config File</p>
              <p
                className={`text-2xl font-bold ${
                  status.config_exists ? "text-green-400" : "text-red-400"
                }`}
              >
                {status.config_exists ? "Found" : "Missing"}
              </p>
            </div>
            {status.config_exists ? (
              <CheckCircle className="h-12 w-12 text-green-400" />
            ) : (
              <AlertCircle className="h-12 w-12 text-red-400" />
            )}
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-purple-400">
          Script Controls
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <button
            onClick={() => runScript("normal")}
            disabled={loading || status.running}
            className="flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <Play className="w-5 h-5 mr-2" />
            Run Normal
          </button>

          <button
            onClick={() => runScript("testing")}
            disabled={loading || status.running}
            className="flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Testing Mode
          </button>

          <button
            onClick={() => runScript("manual")}
            disabled={loading || status.running}
            className="flex items-center justify-center px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <Settings className="w-5 h-5 mr-2" />
            Manual Mode
          </button>

          <button
            onClick={() => runScript("backup")}
            disabled={loading || status.running}
            className="flex items-center justify-center px-4 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <Save className="w-5 h-5 mr-2" />
            Backup
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={stopScript}
            disabled={loading || !status.running}
            className="flex items-center justify-center px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors shadow-lg shadow-red-900/50 border-2 border-red-500"
          >
            <Square className="w-5 h-5 mr-2" />
            Stop Script
          </button>

          <button
            onClick={forceKillScript}
            disabled={loading || !status.running}
            className="flex items-center justify-center px-4 py-3 bg-red-800 hover:bg-red-900 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors border border-red-600"
          >
            <AlertTriangle className="w-5 h-5 mr-2" />
            Force Kill
          </button>

          <button
            onClick={deleteRunningFile}
            disabled={loading}
            className="flex items-center justify-center px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <Trash2 className="w-5 h-5 mr-2" />
            Delete Running File
          </button>
        </div>
      </div>

      {/* Log Viewer */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-purple-400">
            Last Log Entries
          </h2>
          <button
            onClick={fetchStatus}
            disabled={isRefreshing}
            className="text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw
              className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="bg-black rounded overflow-hidden border border-gray-900">
          {status.last_logs && status.last_logs.length > 0 ? (
            <div className="font-mono text-[11px] leading-relaxed">
              {status.last_logs.map((line, index) => {
                const parsed = parseLogLine(line);

                // Ignoriere leere Zeilen
                if (parsed.raw === null) {
                  return null;
                }

                if (parsed.raw) {
                  return (
                    <div
                      key={index}
                      className="px-2 py-1 hover:bg-gray-900/50"
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
                    className="px-2 py-1 hover:bg-gray-900/50 flex items-center gap-2"
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
          ) : (
            <div className="px-3 py-8 text-center text-gray-600 text-xs">
              No logs - start a script to see output
            </div>
          )}
        </div>

        <div className="mt-2 text-[10px] text-gray-600 flex justify-between">
          <span>Auto-refresh: 3s</span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
