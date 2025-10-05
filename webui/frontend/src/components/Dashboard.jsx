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
  RotateCcw,
  Zap,
  X,
  ExternalLink,
  Cloud,
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
    current_mode: null,
    already_running_detected: false,
    running_file_exists: false,
  });
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resetLibrary, setResetLibrary] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching status:", error);
    } finally {
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
      !window.confirm(
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
      const response = await fetch(`${API_URL}/running-file`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          // JSON-Parsing fehlgeschlagen
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

  const resetPosters = async () => {
    if (!resetLibrary.trim()) {
      toast.error("Please enter a library name", {
        duration: 3000,
        position: "top-right",
      });
      return;
    }

    if (
      !window.confirm(
        `⚠️ WARNING: This will reset ALL posters in library "${resetLibrary}"!\n\nThis action CANNOT be undone. Are you absolutely sure?`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/reset-posters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ library: resetLibrary }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message, {
          duration: 4000,
          position: "top-right",
        });
        setResetLibrary(""); // Clear input after success
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

  // Manual Mode Modal Component
  const ManualModeModal = () => {
    if (!showManualModal) return null;

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-theme-card border-2 border-theme-primary rounded-xl max-w-2xl w-full shadow-2xl animate-in fade-in duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 rounded-t-xl flex items-center justify-between">
            <div className="flex items-center">
              <Settings className="w-6 h-6 mr-3 text-white" />
              <h3 className="text-xl font-bold text-white">
                Manual Mode Instructions
              </h3>
            </div>
            <button
              onClick={() => setShowManualModal(false)}
              className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-purple-900/20 border-l-4 border-purple-500 p-4 rounded">
              <p className="text-purple-200 font-medium mb-2">
                📁 Manual Mode allows you to process specific posters from a
                custom directory.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-theme-primary text-lg">
                How to use Manual Mode:
              </h4>

              <ol className="space-y-3 text-theme-text">
                <li className="flex">
                  <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    1
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      Set ManualAssetPath
                    </strong>{" "}
                    in your config.json
                    <code className="block mt-1 bg-theme-bg p-2 rounded text-sm font-mono text-purple-300 border border-theme">
                      "ManualAssetPath": "/path/to/your/manual/assets"
                    </code>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    2
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      Create folder structure
                    </strong>
                    <code className="block mt-1 bg-theme-bg p-2 rounded text-sm font-mono text-purple-300 border border-theme">
                      ManualAssetPath/Movies/Movie Name (Year)/poster.ext
                    </code>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    3
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      Run the script
                    </strong>{" "}
                    using the PowerShell command below
                  </div>
                </li>
              </ol>

              <div className="bg-theme-bg border-2 border-purple-500/50 rounded-lg p-4 mt-4">
                <p className="text-sm text-theme-muted mb-2 font-semibold">
                  PowerShell Command:
                </p>
                <code className="block bg-black/40 p-3 rounded font-mono text-sm text-purple-300 border border-purple-500/30">
                  pwsh -File /path/to/Posterizarr.ps1 -Manual
                </code>
              </div>

              <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded mt-4">
                <p className="text-yellow-200 text-sm">
                  ⚠️ <strong>Note:</strong> Manual mode must be run from the
                  command line, not from this web interface.
                </p>
              </div>
            </div>

            {/* Documentation Link */}
            <div className="pt-4 border-t-2 border-theme">
              <a
                href="https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#manual-mode-interactive"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors text-white"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                View Full Documentation
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-theme-bg px-6 py-4 rounded-b-xl flex justify-end">
            <button
              onClick={() => setShowManualModal(false)}
              className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg font-medium transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-6">
      <Toaster />
      <ManualModeModal />

      <h1 className="text-3xl font-bold mb-8 text-theme-primary">Dashboard</h1>

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
                disabled={loading}
                className="flex items-center px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-sm"
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
        <div className="bg-theme-card rounded-lg p-6 border border-theme">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-theme-muted text-sm">Script Status</p>
              <p
                className={`text-2xl font-bold ${
                  status.running ? "text-green-400" : "text-theme-text"
                }`}
              >
                {status.running ? "Running" : "Stopped"}
              </p>
              {status.running && status.pid && (
                <>
                  <p className="text-sm text-theme-muted mt-1">
                    PID: {status.pid}
                  </p>
                  {status.current_mode && (
                    <p className="text-xs text-blue-400 mt-1 capitalize">
                      Mode: {status.current_mode}
                    </p>
                  )}
                </>
              )}
            </div>
            {status.running ? (
              <CheckCircle className="h-12 w-12 text-green-400" />
            ) : (
              <Clock className="h-12 w-12 text-gray-500" />
            )}
          </div>
        </div>

        <div className="bg-theme-card rounded-lg p-6 border border-theme">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-theme-muted text-sm">Script File</p>
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

        <div className="bg-theme-card rounded-lg p-6 border border-theme">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-theme-muted text-sm">Config File</p>
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

      {/* Script Execution Controls */}
      <div className="bg-theme-card rounded-lg p-6 border border-theme mb-6">
        <h2 className="text-xl font-semibold mb-4 text-theme-primary flex items-center">
          <Play className="w-5 h-5 mr-2" />
          Script Execution
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
            onClick={() => setShowManualModal(true)}
            className="flex items-center justify-center px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
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

          <button
            onClick={() => runScript("syncjelly")}
            disabled={loading || status.running}
            className="flex items-center justify-center px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <Cloud className="w-5 h-5 mr-2" />
            Sync Jellyfin
          </button>

          <button
            onClick={() => runScript("syncemby")}
            disabled={loading || status.running}
            className="flex items-center justify-center px-4 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          >
            <Cloud className="w-5 h-5 mr-2" />
            Sync Emby
          </button>
        </div>
      </div>

      {/* Log Viewer */}
      <div className="bg-theme-card rounded-lg p-6 border border-theme mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-theme-primary">
              Last Log Entries
            </h2>
            {status.current_mode && (
              <p className="text-xs text-theme-muted mt-1">
                Reading from:{" "}
                {status.current_mode === "testing"
                  ? "Testinglog.log"
                  : status.current_mode === "manual"
                  ? "Manuallog.log"
                  : "Scriptlog.log"}
              </p>
            )}
          </div>
          <button
            onClick={fetchStatus}
            disabled={isRefreshing}
            className="text-theme-muted hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {/* DANGER ZONE */}
      <div className="bg-gradient-to-br from-red-950/40 to-red-900/20 rounded-lg p-6 border-2 border-red-600/50 mb-8">
        <div className="flex items-center mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400 mr-3" />
          <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>
        </div>

        <p className="text-red-200 text-sm mb-6">
          These actions are potentially destructive and should be used with
          caution.
        </p>

        {/* Stop and Force Kill */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={stopScript}
            disabled={loading || !status.running}
            className="flex items-center justify-center px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-colors border-2 border-red-500"
          >
            <Square className="w-5 h-5 mr-2" />
            Stop Script
          </button>

          <button
            onClick={forceKillScript}
            disabled={loading || !status.running}
            className="flex items-center justify-center px-4 py-3 bg-red-800 hover:bg-red-900 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-colors border-2 border-red-600"
          >
            <Zap className="w-5 h-5 mr-2" />
            Force Kill
          </button>

          <button
            onClick={deleteRunningFile}
            disabled={loading}
            className="flex items-center justify-center px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-colors border-2 border-orange-500"
          >
            <Trash2 className="w-5 h-5 mr-2" />
            Delete Running File
          </button>
        </div>

        {/* Reset Posters Section */}
        <div className="border-t-2 border-red-600/30 pt-6">
          <div className="flex items-center mb-4">
            <RotateCcw className="w-5 h-5 text-red-400 mr-2" />
            <h3 className="text-lg font-semibold text-red-300">
              Reset Posters
            </h3>
          </div>

          <p className="text-red-200 text-sm mb-4">
            ⚠️ This will reset ALL posters in the specified Plex library. This
            action CANNOT be undone!
          </p>

          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              value={resetLibrary}
              onChange={(e) => setResetLibrary(e.target.value)}
              placeholder="Enter library name (e.g., Movies, TV Shows)"
              disabled={loading || status.running}
              className="flex-1 px-4 py-3 bg-theme-card border-2 border-red-500/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              onClick={resetPosters}
              disabled={loading || status.running || !resetLibrary.trim()}
              className="flex items-center justify-center px-6 py-3 bg-red-700 hover:bg-red-800 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-colors border-2 border-red-600 whitespace-nowrap"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Reset Posters
            </button>
          </div>

          <div className="mt-3 text-xs text-red-300/70">
            <strong>Note:</strong> The script must be stopped before resetting
            posters. Make sure you have entered the exact library name as it
            appears in Plex.
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
