import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play,
  Square,
  TestTube,
  FolderOpen,
  Save,
  RefreshCw,
  Wrench,
  RotateCcw,
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Film,
  Tv,
  FolderHeart,
  Clapperboard,
  Image as ImageIcon,
  Cloud,
  X,
  ExternalLink,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "/api";

// ============================================================================
// LOG FILE MAPPING - Maps run modes to their respective log files
// ============================================================================
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

function RunModes() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({
    running: false,
    current_mode: null,
  });

  // Manual Mode Form State
  const [manualForm, setManualForm] = useState({
    picturePath: "",
    titletext: "",
    folderName: "",
    libraryName: "",
    posterType: "standard", // standard, season, collection, titlecard
    seasonPosterName: "",
    // Episode Title Card fields
    epTitleName: "",
    episodeNumber: "",
  });

  // Reset Posters Form State
  const [resetLibrary, setResetLibrary] = useState("");

  // Sync Modal States
  const [showJellyfinSyncModal, setShowJellyfinSyncModal] = useState(false);
  const [showEmbySyncModal, setShowEmbySyncModal] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  const runScript = async (mode) => {
    if (status.running) {
      toast.error("Script is already running! Please stop it first.", {
        duration: 4000,
        position: "top-right",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/run/${mode}`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Started in ${mode} mode`, {
          duration: 3000,
          position: "top-right",
        });
        fetchStatus();

        // ✨ Weiterleitung zum LogViewer mit der richtigen Log-Datei
        const logFile = getLogFileForMode(mode);
        console.log(`🎯 Redirecting to LogViewer with log: ${logFile}`);

        setTimeout(() => {
          navigate("/logs", { state: { logFile: logFile } });
        }, 500);
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

  const runManualMode = async () => {
    if (status.running) {
      toast.error("Script is already running! Please stop it first.", {
        duration: 4000,
        position: "top-right",
      });
      return;
    }

    // Validation
    if (!manualForm.picturePath.trim()) {
      toast.error("Picture Path is required!", {
        duration: 3000,
        position: "top-right",
      });
      return;
    }

    // Title text is only required for non-titlecard types
    if (manualForm.posterType !== "titlecard" && !manualForm.titletext.trim()) {
      toast.error("Title Text is required!", {
        duration: 3000,
        position: "top-right",
      });
      return;
    }

    if (!manualForm.folderName.trim()) {
      toast.error("Folder Name is required!", {
        duration: 3000,
        position: "top-right",
      });
      return;
    }

    if (
      manualForm.posterType !== "collection" &&
      !manualForm.libraryName.trim()
    ) {
      toast.error("Library Name is required!", {
        duration: 3000,
        position: "top-right",
      });
      return;
    }

    if (
      manualForm.posterType === "season" &&
      !manualForm.seasonPosterName.trim()
    ) {
      toast.error("Season Poster Name is required for season posters!", {
        duration: 3000,
        position: "top-right",
      });
      return;
    }

    // Title card validation
    if (manualForm.posterType === "titlecard") {
      if (!manualForm.epTitleName.trim()) {
        toast.error("Episode Title is required for title cards!", {
          duration: 3000,
          position: "top-right",
        });
        return;
      }
      if (!manualForm.seasonPosterName.trim()) {
        toast.error("Season Name is required for title cards!", {
          duration: 3000,
          position: "top-right",
        });
        return;
      }
      if (!manualForm.episodeNumber.trim()) {
        toast.error("Episode Number is required for title cards!", {
          duration: 3000,
          position: "top-right",
        });
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/run-manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(manualForm),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Manual mode started successfully!", {
          duration: 3000,
          position: "top-right",
        });
        // Reset form
        setManualForm({
          picturePath: "",
          titletext: "",
          folderName: "",
          libraryName: "",
          posterType: "standard",
          seasonPosterName: "",
          epTitleName: "",
          episodeNumber: "",
        });
        fetchStatus();

        // ✨ Weiterleitung zum LogViewer mit Manuallog.log
        console.log("🎯 Redirecting to LogViewer with log: Manuallog.log");
        setTimeout(() => {
          navigate("/logs", { state: { logFile: "Manuallog.log" } });
        }, 500);
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

  const resetPosters = async () => {
    if (status.running) {
      toast.error(
        "Cannot reset posters while script is running. Please stop it first.",
        {
          duration: 4000,
          position: "top-right",
        }
      );
      return;
    }

    if (!resetLibrary.trim()) {
      toast.error("Library name is required!", {
        duration: 3000,
        position: "top-right",
      });
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to reset ALL posters in "${resetLibrary}"? This action CANNOT be undone!\n\nAre you absolutely sure?`
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
        setResetLibrary("");
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
      const response = await fetch(`${API_URL}/stop`, { method: "POST" });
      const data = await response.json();

      if (data.success) {
        toast.success("Script stopped", {
          duration: 3000,
          position: "top-right",
        });
        fetchStatus();
      } else {
        toast.error(`Error: ${data.message}`, {
          duration: 3000,
          position: "top-right",
        });
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`, {
        duration: 3000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  // Jellyfin Sync Modal Component
  const JellyfinSyncModal = () => {
    if (!showJellyfinSyncModal) return null;

    const startJellyfinSync = () => {
      setShowJellyfinSyncModal(false);
      runScript("syncjelly");
    };

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-theme-card border border-theme-primary rounded-xl max-w-2xl w-full shadow-2xl animate-in fade-in duration-200">
          {/* Header */}
          <div className="bg-theme-primary px-6 py-4 rounded-t-xl flex items-center justify-between">
            <div className="flex items-center">
              <Cloud className="w-6 h-6 mr-3 text-white" />
              <h3 className="text-xl font-bold text-white">
                Jellyfin Sync Mode
              </h3>
            </div>
            <button
              onClick={() => setShowJellyfinSyncModal(false)}
              className="text-white/80 hover:text-white transition-all p-1 hover:bg-white/10 rounded"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded">
              <p className="text-orange-200 font-medium mb-2">
                🔄 Sync all artwork from Plex to Jellyfin
              </p>
              <p className="text-orange-100 text-sm">
                This mode will synchronize every artwork you have in Plex to
                your Jellyfin server.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-theme-primary text-lg">
                How Jellyfin Sync works:
              </h4>

              <ul className="space-y-3 text-theme-text">
                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    1
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      Library Names Must Match
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      The script requires that library names in Plex and
                      Jellyfin match exactly for the sync to work.
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    2
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      Hash Calculation
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      The script calculates the hash of artwork from both
                      servers to determine if there are differences.
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    3
                  </span>
                  <div>
                    <strong className="text-theme-primary">Smart Sync</strong>
                    <p className="text-sm text-theme-muted mt-1">
                      Only syncs artwork if the hashes don't match, saving time
                      and bandwidth.
                    </p>
                  </div>
                </li>
              </ul>

              <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded mt-4">
                <p className="text-blue-200 text-sm">
                  💡 <strong>Tip:</strong> This is handy if you want to run the
                  sync after a Kometa run, so you have Kometa overlayed images
                  in Jellyfin.
                </p>
              </div>

              <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded mt-4">
                <p className="text-yellow-200 text-sm">
                  ⚠️ <strong>Important:</strong> Make sure both UseJellyfin and
                  UsePlex are set to true in your config.json, and that library
                  names match exactly.
                </p>
              </div>
            </div>

            {/* Documentation Link */}
            <div className="pt-4 border-t-2 border-theme">
              <a
                href="https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#sync-modes"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center px-6 py-3 bg-theme-bg hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all text-theme-text shadow-lg"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                View Full Documentation
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-theme-bg px-6 py-4 rounded-b-xl flex justify-between border-t-2 border-theme">
            <button
              onClick={() => setShowJellyfinSyncModal(false)}
              className="px-6 py-2 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={startJellyfinSync}
              disabled={loading || status.running}
              className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all text-white flex items-center shadow-lg"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Start Jellyfin Sync
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Emby Sync Modal Component
  const EmbySyncModal = () => {
    if (!showEmbySyncModal) return null;

    const startEmbySync = () => {
      setShowEmbySyncModal(false);
      runScript("syncemby");
    };

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-theme-card border border-theme-primary rounded-xl max-w-2xl w-full shadow-2xl animate-in fade-in duration-200">
          {/* Header */}
          <div className="bg-theme-primary px-6 py-4 rounded-t-xl flex items-center justify-between">
            <div className="flex items-center">
              <Cloud className="w-6 h-6 mr-3 text-white" />
              <h3 className="text-xl font-bold text-white">Emby Sync Mode</h3>
            </div>
            <button
              onClick={() => setShowEmbySyncModal(false)}
              className="text-white/80 hover:text-white transition-all p-1 hover:bg-white/10 rounded"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded">
              <p className="text-orange-200 font-medium mb-2">
                🔄 Sync all artwork from Plex to Emby
              </p>
              <p className="text-orange-100 text-sm">
                This mode will synchronize every artwork you have in Plex to
                your Emby server.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-theme-primary text-lg">
                How Emby Sync works:
              </h4>

              <ul className="space-y-3 text-theme-text">
                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    1
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      Library Names Must Match
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      The script requires that library names in Plex and Emby
                      match exactly for the sync to work.
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    2
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      Hash Calculation
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      The script calculates the hash of artwork from both
                      servers to determine if there are differences.
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    3
                  </span>
                  <div>
                    <strong className="text-theme-primary">Smart Sync</strong>
                    <p className="text-sm text-theme-muted mt-1">
                      Only syncs artwork if the hashes don't match, saving time
                      and bandwidth.
                    </p>
                  </div>
                </li>
              </ul>

              <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded mt-4">
                <p className="text-blue-200 text-sm">
                  💡 <strong>Tip:</strong> This is handy if you want to run the
                  sync after a Kometa run, so you have Kometa overlayed images
                  in Emby.
                </p>
              </div>

              <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded mt-4">
                <p className="text-yellow-200 text-sm">
                  ⚠️ <strong>Important:</strong> Make sure both UseEmby and
                  UsePlex are set to true in your config.json, and that library
                  names match exactly.
                </p>
              </div>
            </div>

            {/* Documentation Link */}
            <div className="pt-4 border-t-2 border-theme">
              <a
                href="https://github.com/fscorrupt/Posterizarr?tab=readme-ov-file#sync-modes"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center px-6 py-3 bg-theme-bg hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all text-theme-text shadow-lg"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                View Full Documentation
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-theme-bg px-6 py-4 rounded-b-xl flex justify-between border-t-2 border-theme">
            <button
              onClick={() => setShowEmbySyncModal(false)}
              className="px-6 py-2 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={startEmbySync}
              disabled={loading || status.running}
              className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all text-white flex items-center shadow-lg"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Start Emby Sync
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Dynamic hints based on poster type
  const getHints = (type) => {
    switch (type) {
      case "season":
      case "titlecard": // Title Card uses the same hints as Season
        return {
          folderName: {
            label: "Folder Name",
            placeholder: "Breaking Bad (2008)",
            description:
              'Show folder name as seen by Plex (e.g., "Breaking Bad (2008)")',
          },
          libraryName: {
            placeholder: "TV Shows",
            description: 'Plex library for shows (e.g., "TV Shows")',
          },
        };
      case "collection":
        return {
          folderName: {
            label: "Collection Name",
            placeholder: "James Bond Collection",
            description: "The name of the collection in Plex",
          },
          // No libraryName needed for collections
          libraryName: {},
        };
      default: // for "standard"
        return {
          folderName: {
            label: "Folder Name",
            placeholder: "The Martian (2015)",
            description:
              'Media folder name as seen by Plex (e.g., "The Martian (2015)")',
          },
          libraryName: {
            placeholder: "Movies",
            description: 'Plex library for movies (e.g., "Movies")',
          },
        };
    }
  };

  const hints = getHints(manualForm.posterType);

  return (
    <div className="space-y-6">
      <Toaster />
      <JellyfinSyncModal />
      <EmbySyncModal />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-theme-text flex items-center gap-3">
            <Play className="w-8 h-8 text-theme-primary" />
            Run Modes
          </h1>
          <p className="text-theme-muted mt-2">
            Execute Posterizarr in different modes
          </p>
        </div>

        {/* Status Badge */}
        {status.running && (
          <div className="flex items-center gap-3 bg-theme-card px-4 py-2 rounded-lg border border-theme-primary/50">
            <Loader2 className="w-5 h-5 text-theme-primary animate-spin" />
            <div>
              <div className="text-sm font-medium text-theme-text">Running</div>
              {status.current_mode && (
                <div className="text-xs text-theme-muted">
                  Mode: {status.current_mode}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stop Button (shown when running) */}
      {status.running && (
        <div className="bg-orange-950/40 rounded-xl p-4 border border-orange-600/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-400" />
              <div>
                <p className="font-medium text-orange-200">Script is running</p>
                <p className="text-sm text-orange-300/80">
                  Stop the script before running another mode
                </p>
              </div>
            </div>
            <button
              onClick={stopScript}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-all"
            >
              <Square className="w-4 h-4" />
              Stop Script
            </button>
          </div>
        </div>
      )}

      {/* Quick Run Modes */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme">
        <h2 className="text-xl font-semibold text-theme-text mb-4 flex items-center gap-2">
          <Play className="w-5 h-5 text-theme-primary" />
          Quick Run Modes
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Normal Mode */}
          <button
            onClick={() => runScript("normal")}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <Play className="w-8 h-8 text-theme-primary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">Normal Mode</h3>
            <p className="text-sm text-theme-muted text-center">
              Run Posterizarr normally
            </p>
          </button>

          {/* Testing Mode */}
          <button
            onClick={() => runScript("testing")}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <TestTube className="w-8 h-8 text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">Testing Mode</h3>
            <p className="text-sm text-theme-muted text-center">
              Generate sample posters
            </p>
          </button>

          {/* Backup Mode */}
          <button
            onClick={() => runScript("backup")}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <Save className="w-8 h-8 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">Backup Mode</h3>
            <p className="text-sm text-theme-muted text-center">
              Backup existing posters
            </p>
          </button>

          {/* Sync Jellyfin */}
          <button
            onClick={() => setShowJellyfinSyncModal(true)}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <RefreshCw className="w-8 h-8 text-purple-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">
              Sync Jellyfin
            </h3>
            <p className="text-sm text-theme-muted text-center">
              Sync posters to Jellyfin
            </p>
          </button>

          {/* Sync Emby */}
          <button
            onClick={() => setShowEmbySyncModal(true)}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <RefreshCw className="w-8 h-8 text-green-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">Sync Emby</h3>
            <p className="text-sm text-theme-muted text-center">
              Sync posters to Emby
            </p>
          </button>
        </div>
      </div>

      {/* Manual Mode */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme">
        {/* --- Header --- */}
        <div className="flex items-center mb-4">
          <div className="p-2 rounded-lg bg-theme-primary/20 mr-3">
            <Wrench className="w-6 h-6 text-theme-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-theme-text">
              Manual Mode (Semi-Automated)
            </h2>
            <p className="text-sm text-theme-muted">
              Create posters manually with custom parameters
            </p>
          </div>
        </div>

        {/* --- Form Fields --- */}
        <div className="space-y-4 mt-6">
          {/*CORRECT PLACEMENT: Buttons are the first item in the form*/}
          <div>
            <label className="block text-sm font-medium text-theme-text mb-2">
              Poster Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() =>
                  setManualForm({ ...manualForm, posterType: "standard" })
                }
                disabled={loading || status.running}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  manualForm.posterType === "standard"
                    ? "bg-theme-primary border-theme-primary text-white"
                    : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Film className="w-5 h-5" />
                Standard
              </button>
              <button
                onClick={() =>
                  setManualForm({ ...manualForm, posterType: "season" })
                }
                disabled={loading || status.running}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  manualForm.posterType === "season"
                    ? "bg-theme-primary border-theme-primary text-white"
                    : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Tv className="w-5 h-5" />
                Season
              </button>
              <button
                onClick={() =>
                  setManualForm({ ...manualForm, posterType: "titlecard" })
                }
                disabled={loading || status.running}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  manualForm.posterType === "titlecard"
                    ? "bg-theme-primary border-theme-primary text-white"
                    : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Clapperboard className="w-5 h-5" />
                Title Card
              </button>
              <button
                onClick={() =>
                  setManualForm({ ...manualForm, posterType: "collection" })
                }
                disabled={loading || status.running}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  manualForm.posterType === "collection"
                    ? "bg-theme-primary border-theme-primary text-white"
                    : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <FolderHeart className="w-5 h-5" />
                Collection
              </button>
            </div>
          </div>

          {/* Picture Path */}
          <div>
            <label className="block text-sm font-medium text-theme-text mb-2">
              Picture Path <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={manualForm.picturePath}
              onChange={(e) =>
                setManualForm({ ...manualForm, picturePath: e.target.value })
              }
              placeholder="C:\path\to\image.jpg or https://url.to/image.jpg"
              disabled={loading || status.running}
              className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-theme-muted mt-1">
              Local file path or direct URL to the source image
            </p>
          </div>

          {/* Title Text - Hidden for title cards */}
          {manualForm.posterType !== "titlecard" && (
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                Title Text <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={manualForm.titletext}
                onChange={(e) =>
                  setManualForm({ ...manualForm, titletext: e.target.value })
                }
                placeholder="The Martian"
                disabled={loading || status.running}
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-theme-muted mt-1">
                Title to display on the poster
              </p>
            </div>
          )}

          {/* DYNAMIC Folder/Collection Name Field */}
          <div>
            <label className="block text-sm font-medium text-theme-text mb-2">
              {hints.folderName.label} <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={manualForm.folderName}
              onChange={(e) =>
                setManualForm({ ...manualForm, folderName: e.target.value })
              }
              placeholder={hints.folderName.placeholder}
              disabled={loading || status.running}
              className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-theme-muted mt-1">
              {hints.folderName.description}
            </p>
          </div>

          {/* DYNAMIC & CONDITIONAL Library Name Field */}
          {manualForm.posterType !== "collection" && (
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                Library Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={manualForm.libraryName}
                onChange={(e) =>
                  setManualForm({ ...manualForm, libraryName: e.target.value })
                }
                placeholder={hints.libraryName.placeholder}
                disabled={loading || status.running}
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-theme-muted mt-1">
                {hints.libraryName.description}
              </p>
            </div>
          )}

          {/* CONDITIONAL FIELDS MOVED HERE FOR BETTER UX */}
          {/* Season Poster Name (only shown for season type) */}
          {manualForm.posterType === "season" && (
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                Season Poster Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={manualForm.seasonPosterName}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    seasonPosterName: e.target.value,
                  })
                }
                placeholder="Season 1"
                disabled={loading || status.running}
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-theme-muted mt-1">
                Season name (e.g., "Season 1", "Staffel 2", "Specials")
              </p>
            </div>
          )}

          {/* Episode Title Card Fields (only shown for titlecard type) */}
          {manualForm.posterType === "titlecard" && (
            <>
              <div>
                <label className="block text-sm font-medium text-theme-text mb-2">
                  Episode Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.epTitleName}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      epTitleName: e.target.value,
                    })
                  }
                  placeholder="Ozymandias"
                  disabled={loading || status.running}
                  className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-theme-muted mt-1">
                  Episode title name (e.g., "Ozymandias", "Pilot")
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-text mb-2">
                  Season Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.seasonPosterName}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      seasonPosterName: e.target.value,
                    })
                  }
                  placeholder="Season 5"
                  disabled={loading || status.running}
                  className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-theme-muted mt-1">
                  Season name (e.g., "Season 5", "Staffel 1")
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-text mb-2">
                  Episode Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.episodeNumber}
                  onChange={(e) =>
                    setManualForm({
                      ...manualForm,
                      episodeNumber: e.target.value,
                    })
                  }
                  placeholder="14"
                  disabled={loading || status.running}
                  className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-theme-muted mt-1">
                  Episode number (e.g., "14", "1")
                </p>
              </div>
            </>
          )}

          {/* --- Run Button & Info Box --- */}
          <button
            onClick={runManualMode}
            disabled={loading || status.running}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all shadow-lg hover:scale-[1.02]"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Run Manual Mode
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-1">How Manual Mode works:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-300/90">
                <li>
                  The source picture is moved (if local) or downloaded (if URL)
                </li>
                <li>Image is edited with your configured overlays and text</li>
                <li>Final poster is placed in the asset location</li>
                <li>Poster is synced to your media server</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Posters */}
      <div className="bg-red-950/40 rounded-xl p-6 border-2 border-red-600/50">
        <div className="flex items-center mb-4">
          <div className="p-2 rounded-lg bg-red-600/20 mr-3">
            <RotateCcw className="w-6 h-6 text-red-300" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-red-300">
              Reset Posters
            </h2>
            <p className="text-sm text-red-200">
              Reset all posters in a Plex library to default
            </p>
          </div>
        </div>

        <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded mb-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-200">
              <p className="font-semibold mb-1">⚠️ Warning:</p>
              <p>
                This will reset ALL posters in the specified library. This
                action CANNOT be undone! The script must be stopped before
                resetting posters.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            value={resetLibrary}
            onChange={(e) => setResetLibrary(e.target.value)}
            placeholder="Enter library name (e.g., Movies, TV Shows)"
            disabled={loading || status.running}
            className="flex-1 px-4 py-3 bg-theme-card border border-red-500/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
          />
          <button
            onClick={resetPosters}
            disabled={loading || status.running || !resetLibrary.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-red-700 hover:bg-red-800 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-red-600 whitespace-nowrap shadow-sm"
          >
            <RotateCcw className="w-5 h-5" />
            Reset Posters
          </button>
        </div>
      </div>
    </div>
  );
}

export default RunModes;
