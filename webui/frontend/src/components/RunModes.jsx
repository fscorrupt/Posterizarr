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
import { useTranslation } from "react-i18next";
import ConfirmDialog from "./ConfirmDialog";
import DangerZone from "./DangerZone";
import { useToast } from "../context/ToastContext";

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

// ============================================================================
// WAIT FOR LOG FILE - Polls backend until log file exists
// ============================================================================
const waitForLogFile = async (logFileName, maxAttempts = 30, delayMs = 200) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${API_URL}/logs/${logFileName}/exists`);
      const data = await response.json();

      if (data.exists) {
        console.log(`Log file ${logFileName} exists after ${i + 1} attempts`);
        return true;
      }

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`Error checking log file existence: ${error}`);
      // Continue trying even if there's an error
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.warn(
    `Log file ${logFileName} not found after ${maxAttempts} attempts`
  );
  return false;
};

// ============================================================================
// TMDB POSTER SEARCH MODAL - Multi-Provider Support (TMDB, TVDB, Fanart.tv)
// ============================================================================
const TMDBPosterSearchModal = React.memo(
  ({ tmdbSearch, setTmdbSearch, manualForm, setManualForm, showSuccess }) => {
    const { t } = useTranslation();
    const scrollRef = React.useRef(null);
    const [localDisplayedCount, setLocalDisplayedCount] = React.useState(10);
    const [sourceFilter, setSourceFilter] = React.useState(null); // null, "provided_id", or "title_search"

    // Reset displayed count and filter only when modal opens (not on every render)
    React.useEffect(() => {
      if (tmdbSearch.showModal) {
        setLocalDisplayedCount(10);
        setSourceFilter(null);
      }
    }, [tmdbSearch.showModal]);

    const handleLoadMore = () => {
      setLocalDisplayedCount((prev) => prev + 10);
    };

    const handleClose = () => {
      setTmdbSearch({
        ...tmdbSearch,
        showModal: false,
        query: "",
        seasonNumber: "",
        episodeNumber: "",
        displayedCount: 10,
      });
    };

    const handleSelectPoster = (posterUrl) => {
      setManualForm({ ...manualForm, picturePath: posterUrl });
      setTmdbSearch({
        ...tmdbSearch,
        showModal: false,
        query: "",
        seasonNumber: "",
        episodeNumber: "",
        displayedCount: 10,
      });
      showSuccess(t("runModes.tmdb.posterSelected"));
    };

    if (!tmdbSearch.showModal) return null;

    // Get active provider results
    const activeResults = tmdbSearch.results[tmdbSearch.activeProvider] || [];

    // Apply source filter if active
    const filteredResults = sourceFilter
      ? activeResults.filter((p) => p.source_type === sourceFilter)
      : activeResults;

    // Count total results across all providers
    const totalResults =
      (tmdbSearch.results.tmdb?.length || 0) +
      (tmdbSearch.results.tvdb?.length || 0) +
      (tmdbSearch.results.fanart?.length || 0);

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-theme-card border border-theme-primary rounded-xl max-w-6xl w-full max-h-[90vh] shadow-2xl animate-in fade-in duration-200 flex flex-col">
          {/* Header */}
          <div className="bg-theme-primary px-6 py-4 rounded-t-xl flex items-center justify-between flex-shrink-0">
            <div className="flex items-center">
              <ImageIcon className="w-6 h-6 mr-3 text-white" />
              <h3 className="text-xl font-bold text-white">
                {manualForm.posterType === "season"
                  ? t("runModes.tmdb.seasonResults", {
                      season: tmdbSearch.seasonNumber,
                    }) + ` (${totalResults})`
                  : manualForm.posterType === "titlecard"
                  ? t("runModes.tmdb.episodeResults", {
                      season: tmdbSearch.seasonNumber,
                      episode: tmdbSearch.episodeNumber,
                    }) + ` (${totalResults})`
                  : t("runModes.tmdb.results") + ` (${totalResults})`}
              </h3>
            </div>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Provider Tabs */}
          <div className="flex gap-2 px-6 pt-4 border-b border-theme">
            {/* TMDB Tab - only show if in visibleProviders */}
            {tmdbSearch.visibleProviders.includes("tmdb") && (
              <button
                onClick={() =>
                  setTmdbSearch({ ...tmdbSearch, activeProvider: "tmdb" })
                }
                className={`px-4 py-2 rounded-t-lg font-medium transition-all ${
                  tmdbSearch.activeProvider === "tmdb"
                    ? "bg-theme-primary text-white"
                    : "bg-theme-hover text-theme-muted hover:bg-theme-bg"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>TMDB</span>
                  {tmdbSearch.results.tmdb?.length > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        tmdbSearch.activeProvider === "tmdb"
                          ? "bg-white/20 text-white"
                          : "bg-theme-primary text-white"
                      }`}
                    >
                      {tmdbSearch.results.tmdb.length}
                    </span>
                  )}
                </div>
              </button>
            )}

            {/* TVDB Tab - only show if in visibleProviders */}
            {tmdbSearch.visibleProviders.includes("tvdb") && (
              <button
                onClick={() =>
                  setTmdbSearch({ ...tmdbSearch, activeProvider: "tvdb" })
                }
                className={`px-4 py-2 rounded-t-lg font-medium transition-all ${
                  tmdbSearch.activeProvider === "tvdb"
                    ? "bg-theme-primary text-white"
                    : "bg-theme-hover text-theme-muted hover:bg-theme-bg"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>TVDB</span>
                  {tmdbSearch.results.tvdb?.length > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        tmdbSearch.activeProvider === "tvdb"
                          ? "bg-white/20 text-white"
                          : "bg-theme-primary text-white"
                      }`}
                    >
                      {tmdbSearch.results.tvdb.length}
                    </span>
                  )}
                </div>
              </button>
            )}

            {/* Fanart.tv Tab - only show if in visibleProviders */}
            {tmdbSearch.visibleProviders.includes("fanart") && (
              <button
                onClick={() =>
                  setTmdbSearch({ ...tmdbSearch, activeProvider: "fanart" })
                }
                className={`px-4 py-2 rounded-t-lg font-medium transition-all ${
                  tmdbSearch.activeProvider === "fanart"
                    ? "bg-theme-primary text-white"
                    : "bg-theme-hover text-theme-muted hover:bg-theme-bg"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>Fanart.tv</span>
                  {tmdbSearch.results.fanart?.length > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        tmdbSearch.activeProvider === "fanart"
                          ? "bg-white/20 text-white"
                          : "bg-theme-primary text-white"
                      }`}
                    >
                      {tmdbSearch.results.fanart.length}
                    </span>
                  )}
                </div>
              </button>
            )}
          </div>

          {/* Content - Scrollable */}
          <div ref={scrollRef} className="p-6 overflow-y-auto flex-1">
            {activeResults.length === 0 ? (
              <div className="text-center py-12 text-theme-muted">
                <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{t("runModes.tmdb.noResults")}</p>
              </div>
            ) : (
              <>
                {/* Source Type Filter Badges */}
                {(() => {
                  const idResultsCount = activeResults.filter(
                    (p) => p.source_type === "provided_id"
                  ).length;
                  const textResultsCount = activeResults.filter(
                    (p) => p.source_type === "title_search"
                  ).length;

                  return (
                    (idResultsCount > 0 || textResultsCount > 0) && (
                      <div className="flex gap-2 mb-4">
                        {textResultsCount > 0 && (
                          <button
                            onClick={() =>
                              setSourceFilter(
                                sourceFilter === "title_search"
                                  ? null
                                  : "title_search"
                              )
                            }
                            className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 border-2 transition-all ${
                              sourceFilter === "title_search"
                                ? "bg-theme-primary text-white border-theme-primary shadow-lg"
                                : "bg-theme-hover text-theme-text border-theme hover:border-theme-primary"
                            }`}
                          >
                            <span>Text Result</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                sourceFilter === "title_search"
                                  ? "bg-white/20 text-white"
                                  : "bg-theme-primary text-white"
                              }`}
                            >
                              {textResultsCount}
                            </span>
                          </button>
                        )}
                        {idResultsCount > 0 && (
                          <button
                            onClick={() =>
                              setSourceFilter(
                                sourceFilter === "provided_id"
                                  ? null
                                  : "provided_id"
                              )
                            }
                            className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 border-2 transition-all ${
                              sourceFilter === "provided_id"
                                ? "bg-theme-primary text-white border-theme-primary shadow-lg"
                                : "bg-theme-hover text-theme-text border-theme hover:border-theme-primary"
                            }`}
                          >
                            <span>ID Result</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs ${
                                sourceFilter === "provided_id"
                                  ? "bg-white/20 text-white"
                                  : "bg-theme-primary text-white"
                              }`}
                            >
                              {idResultsCount}
                            </span>
                          </button>
                        )}
                      </div>
                    )
                  );
                })()}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filteredResults
                    .slice(0, localDisplayedCount)
                    .map((poster, index) => (
                      <div
                        key={
                          poster.poster_path ||
                          poster.original_url ||
                          poster.url ||
                          index
                        }
                        className="group relative bg-theme-hover rounded-lg overflow-hidden border border-theme hover:border-theme-primary transition-all cursor-pointer"
                        onClick={() => handleSelectPoster(poster.original_url)}
                      >
                        {/* Poster Image */}
                        <img
                          src={poster.url || poster.poster_url}
                          alt={poster.title || poster.source}
                          className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-300"
                        />

                        {/* Overlay on Hover */}
                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 text-center">
                          <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
                          <p className="text-white text-sm font-semibold mb-1">
                            {poster.title || poster.source}
                          </p>
                          {(poster.width || poster.height) && (
                            <p className="text-white/80 text-xs mb-2">
                              {poster.width} × {poster.height}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 justify-center">
                            {poster.source && (
                              <span className="bg-blue-600 px-2 py-1 rounded text-xs text-white">
                                {poster.source}
                              </span>
                            )}
                            {poster.language && (
                              <span className="bg-theme-primary px-2 py-1 rounded text-xs text-white">
                                {poster.language.toUpperCase()}
                              </span>
                            )}
                            {poster.type === "episode_still" && (
                              <span className="bg-purple-600 px-2 py-1 rounded text-xs text-white">
                                {t("runModes.tmdb.episodeStill")}
                              </span>
                            )}
                            {poster.type === "season_poster" && (
                              <span className="bg-green-600 px-2 py-1 rounded text-xs text-white">
                                {t("runModes.tmdb.seasonPoster")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Load More Button */}
                {localDisplayedCount < filteredResults.length && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={handleLoadMore}
                      className="px-6 py-3 bg-theme-primary hover:bg-theme-primary/90 text-white rounded-lg font-medium transition-all shadow-lg flex items-center gap-2 mx-auto"
                    >
                      <RefreshCw className="w-5 h-5" />
                      {t("runModes.tmdb.loadMore", {
                        remaining: filteredResults.length - localDisplayedCount,
                      })}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="bg-theme-bg px-6 py-4 rounded-b-xl border-t border-theme flex-shrink-0">
            <p className="text-sm text-theme-muted text-center">
              {t("runModes.tmdb.clickToSelect")}
            </p>
          </div>
        </div>
      </div>
    );
  }
);

function RunModes() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showSuccess, showError, showInfo } = useToast();
  const [loading, setLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
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
    posterType: "standard", // standard, season, collection, titlecard, background
    mediaTypeSelection: "movie", // "movie" or "tv" - for standard posters only
    seasonPosterName: "",
    epTitleName: "",
    episodeNumber: "",
  });

  // File upload state
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);

  // Folder selector state
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [folderItems, setFolderItems] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState("");

  // Library selector state
  const [showLibrarySelector, setShowLibrarySelector] = useState(false);
  const [libraryItems, setLibraryItems] = useState([]);
  const [loadingLibraries, setLoadingLibraries] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");

  // Reset Posters Form State
  const [resetLibrary, setResetLibrary] = useState("");

  // Sync Modal States
  const [showJellyfinSyncModal, setShowJellyfinSyncModal] = useState(false);
  const [showEmbySyncModal, setShowEmbySyncModal] = useState(false);

  // TMDB Poster Search State (now multi-provider)
  const [tmdbSearch, setTmdbSearch] = useState({
    query: "",
    year: "", // Year for search (required for numeric titles)
    mediaType: "standard",
    searching: false,
    results: { tmdb: [], tvdb: [], fanart: [] }, // Changed to object with providers
    showModal: false,
    // NEU: Season und Episode Felder
    seasonNumber: "",
    episodeNumber: "",
    // Pagination
    displayedCount: 10, // Start with 10 items
    // Search by ID toggle
    searchByID: false, // When true, treat query as TMDB ID
    // Active provider tab
    activeProvider: "tmdb", // Track which provider tab is active
    // Visible providers based on search type
    visibleProviders: ["tmdb", "tvdb", "fanart"], // Default: show all tabs
  });

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/status`);
      const data = await response.json();

      // Only update state if something actually changed (prevents unnecessary re-renders)
      setStatus((prevStatus) => {
        if (JSON.stringify(prevStatus) === JSON.stringify(data)) {
          return prevStatus; // No re-render
        }
        return data;
      });
    } catch (error) {
      console.error("Error fetching status:", error);
    }
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        showError("Please upload an image file!");
        return;
      }

      setUploadedFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadPreview(reader.result);
      };
      reader.readAsDataURL(file);

      // Clear picturePath when file is uploaded
      setManualForm({ ...manualForm, picturePath: "" });
      showSuccess(`File "${file.name}" uploaded successfully! `);
    }
  };

  // Clear uploaded file
  const clearUploadedFile = () => {
    setUploadedFile(null);
    setUploadPreview(null);
  };

  // Load folder items from assets directory
  const loadFolderItems = async () => {
    if (!manualForm.libraryName.trim()) {
      showError("Please enter Library Name first");
      return;
    }

    setLoadingFolders(true);
    setShowFolderSelector(true);

    try {
      // Fetch folders from assets directory
      const response = await fetch(
        `${API_URL}/assets/folders?library_name=${encodeURIComponent(
          manualForm.libraryName.trim()
        )}`
      );

      const data = await response.json();

      if (data.success) {
        setFolderItems(data.folders || []);
        console.log(
          `Loaded ${data.folders?.length || 0} folders from assets/${
            manualForm.libraryName
          }`
        );

        if (data.folders?.length === 0) {
          showError(
            `No folders found in library "${manualForm.libraryName}". Please check the library name.`
          );
        }
      } else {
        showError(`Failed to load folders: ${data.error}`);
        setShowFolderSelector(false);
      }
    } catch (error) {
      console.error("Error loading folder items:", error);
      showError(`Error: ${error.message}`);
      setShowFolderSelector(false);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Handle folder selection
  const handleFolderSelect = (folderName, title) => {
    setManualForm({ ...manualForm, folderName, titletext: title });
    setShowFolderSelector(false);
    setFolderSearchQuery("");
    showSuccess(`Folder "${folderName}" selected`);
  };

  // Load library items from assets directory
  const loadLibraryItems = async () => {
    setLoadingLibraries(true);
    setShowLibrarySelector(true);

    try {
      // Fetch libraries from assets directory
      const response = await fetch(`${API_URL}/assets/folders`);
      const data = await response.json();

      if (data.success) {
        setLibraryItems(data.libraries || []);
        console.log(
          `Loaded ${data.libraries?.length || 0} libraries from assets/`
        );

        if (data.libraries?.length === 0) {
          showError("No library folders found in assets directory");
        }
      } else {
        showError(`Failed to load libraries: ${data.error}`);
        setShowLibrarySelector(false);
      }
    } catch (error) {
      console.error("Error loading library items:", error);
      showError(`Error: ${error.message}`);
      setShowLibrarySelector(false);
    } finally {
      setLoadingLibraries(false);
    }
  };

  // Handle library selection
  const handleLibrarySelect = (libraryName) => {
    setManualForm({ ...manualForm, libraryName, folderName: "" });
    setShowLibrarySelector(false);
    setLibrarySearchQuery("");
    showSuccess(`Library "${libraryName}" selected`);
  };

  const runScript = async (mode) => {
    if (status.running) {
      showError(t("runModes.scriptRunning"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/run/${mode}`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(t("runModes.startedMode", { mode }));
        fetchStatus();

        const logFile = getLogFileForMode(mode);
        console.log(`Waiting for log file: ${logFile}`);

        // Wait for log file to be created before navigating
        const logExists = await waitForLogFile(logFile);

        if (logExists) {
          console.log(`Redirecting to LogViewer with log: ${logFile}`);
          navigate("/logs", { state: { logFile: logFile } });
        } else {
          console.warn(`Log file ${logFile} not found, redirecting anyway`);
          // Still navigate even if log doesn't exist yet
          navigate("/logs", { state: { logFile: logFile } });
        }
      } else {
        showError(`Error: ${data.message}`);
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runManualMode = async () => {
    if (status.running) {
      showError(t("runModes.scriptRunning"));
      return;
    }

    // Validation - Check if file was uploaded or URL/path provided
    if (!uploadedFile && !manualForm.picturePath.trim()) {
      showError(t("runModes.validation.imageRequired"));
      return;
    }

    // Title text is only required for non-titlecard types
    if (manualForm.posterType !== "titlecard" && !manualForm.titletext.trim()) {
      showError(t("runModes.validation.titleRequired"));
      return;
    }

    // Folder name is NOT required for collection posters
    if (
      manualForm.posterType !== "collection" &&
      !manualForm.folderName.trim()
    ) {
      showError(t("runModes.validation.folderRequired"));
      return;
    }

    if (!manualForm.libraryName.trim()) {
      showError(t("runModes.validation.libraryRequired"));
      return;
    }

    if (
      manualForm.posterType === "season" &&
      !manualForm.seasonPosterName.trim()
    ) {
      showError(t("runModes.validation.seasonRequired"));
      return;
    }

    // Title card validation
    if (manualForm.posterType === "titlecard") {
      if (!manualForm.epTitleName.trim()) {
        showError(t("runModes.validation.episodeTitleRequired"));
        return;
      }
      if (!manualForm.seasonPosterName.trim()) {
        showError(t("runModes.validation.seasonNameRequired"));
        return;
      }
      if (!manualForm.episodeNumber.trim()) {
        showError(t("runModes.validation.episodeNumberRequired"));
        return;
      }
    }

    setLoading(true);
    try {
      let requestPayload = { ...manualForm };
      delete requestPayload.mediaTypeSelection;

      // If a file was uploaded, use FormData for multipart upload
      if (uploadedFile) {
        console.log("Preparing manual upload with file:", {
          fileName: uploadedFile.name,
          fileSize: uploadedFile.size,
          fileType: uploadedFile.type,
          payload: requestPayload,
        });

        const formData = new FormData();
        formData.append("file", uploadedFile);

        // Append all other form fields
        Object.keys(requestPayload).forEach((key) => {
          formData.append(key, requestPayload[key]);
          console.log(`FormData field: ${key} = ${requestPayload[key]}`);
        });

        const response = await fetch(`${API_URL}/run-manual-upload`, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          // Log detailed error information
          console.error("Manual upload failed:", {
            status: response.status,
            statusText: response.statusText,
            error: data,
          });
          showError(
            `Upload failed: ${data.detail || data.message || "Unknown error"}`
          );
          setLoading(false);
          return;
        }

        if (data.success) {
          showSuccess("Manual mode started successfully!");
          // Reset form
          setManualForm({
            picturePath: "",
            titletext: "",
            folderName: "",
            libraryName: "",
            posterType: "standard",
            mediaTypeSelection: "movie",
            seasonPosterName: "",
            epTitleName: "",
            episodeNumber: "",
          });
          setUploadedFile(null);
          setUploadPreview(null);
          fetchStatus();

          console.log("Waiting for log file: Manuallog.log (upload)");

          // Wait for log file to be created before navigating
          const logExists = await waitForLogFile("Manuallog.log");

          if (logExists) {
            console.log("Redirecting to LogViewer with log: Manuallog.log");
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          } else {
            console.warn(
              "Log file Manuallog.log not found, redirecting anyway"
            );
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          }
        } else {
          showError(`Error: ${data.message}`);
        }
      } else {
        // Use URL/path - existing behavior
        const response = await fetch(`${API_URL}/run-manual`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        const data = await response.json();

        if (!response.ok) {
          // Log detailed error information
          console.error("Manual mode (URL) failed:", {
            status: response.status,
            statusText: response.statusText,
            error: data,
          });
          showError(`Error: ${data.detail || data.message || "Unknown error"}`);
          setLoading(false);
          return;
        }

        if (data.success) {
          showSuccess(t("runModes.manualModeSuccess"));
          // Reset form
          setManualForm({
            picturePath: "",
            titletext: "",
            folderName: "",
            libraryName: "",
            posterType: "standard",
            mediaTypeSelection: "movie",
            seasonPosterName: "",
            epTitleName: "",
            episodeNumber: "",
          });
          setUploadedFile(null);
          setUploadPreview(null);
          fetchStatus();

          console.log("Waiting for log file: Manuallog.log (URL)");

          // Wait for log file to be created before navigating
          const logExists = await waitForLogFile("Manuallog.log");

          if (logExists) {
            console.log("Redirecting to LogViewer with log: Manuallog.log");
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          } else {
            console.warn(
              "Log file Manuallog.log not found, redirecting anyway"
            );
            navigate("/logs", { state: { logFile: "Manuallog.log" } });
          }
        } else {
          showError(`Error: ${data.message}`);
        }
      }
    } catch (error) {
      console.error("Manual mode execution error:", error);
      showError(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetPosters = async () => {
    if (status.running) {
      showError(t("runModes.reset.stopFirst"));
      return;
    }

    if (!resetLibrary.trim()) {
      showError(t("runModes.validation.libraryNameRequired"));
      return;
    }

    setResetConfirm(true);
  };

  const handleResetConfirm = async () => {
    setResetConfirm(false);

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
        showSuccess(data.message);
        setResetLibrary("");
      } else {
        showError(`Error: ${data.message}`);
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
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
        showSuccess(t("runModes.stop.stopped"));
        fetchStatus();
      } else {
        showError(`Error: ${data.message}`);
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // MULTI-PROVIDER POSTER SEARCH (TMDB, TVDB, Fanart.tv)
  // ============================================================================
  const searchTMDBPosters = async () => {
    if (!tmdbSearch.query.trim()) {
      showError(t("runModes.validation.tmdbQueryRequired"));
      return;
    }

    // Validation for Season Poster
    if (manualForm.posterType === "season" && !tmdbSearch.seasonNumber) {
      showError(t("runModes.validation.seasonNumberRequired"));
      return;
    }

    // Validation for Title Cards
    if (manualForm.posterType === "titlecard") {
      if (!tmdbSearch.seasonNumber) {
        showError(t("runModes.validation.seasonNumberRequired"));
        return;
      }
      if (!tmdbSearch.episodeNumber) {
        showError(t("runModes.validation.episodeInfoRequired"));
        return;
      }
    }

    setTmdbSearch({ ...tmdbSearch, searching: true });

    try {
      // Determine media type based on posterType and mediaTypeSelection
      let mediaType;

      if (
        manualForm.posterType === "standard" ||
        manualForm.posterType === "background"
      ) {
        // For standard and background posters, use the user's selection
        mediaType = manualForm.mediaTypeSelection; // "movie" or "tv"
      } else if (
        manualForm.posterType === "season" ||
        manualForm.posterType === "titlecard"
      ) {
        // Season and titlecard are always TV
        mediaType = "tv";
      } else {
        // Collection defaults to movie
        mediaType = "movie";
      }

      const requestBody = {
        asset_path: `manual_${manualForm.posterType}_${Date.now()}`, // Dummy path for manual mode
        media_type: mediaType,
        asset_type: manualForm.posterType,
      };

      // Check if query contains provider prefix (tmdb-, tvdb-, imdb-, tt)
      // If prefix exists, backend will extract the ID automatically
      // If no prefix, treat as title search (even for numeric titles like "1917")
      const queryLower = tmdbSearch.query.trim().toLowerCase();
      const hasPrefix =
        queryLower.startsWith("tmdb-") ||
        queryLower.startsWith("tmdb:") ||
        queryLower.startsWith("tvdb-") ||
        queryLower.startsWith("tvdb:") ||
        queryLower.startsWith("imdb-") ||
        queryLower.startsWith("imdb:") ||
        queryLower.startsWith("tt");

      // Always send as title - backend will detect prefixes and extract IDs
      requestBody.title = tmdbSearch.query.trim();

      if (hasPrefix) {
        console.log(`Searching with ID prefix: ${tmdbSearch.query}`);
      } else {
        console.log(`Searching by title: ${tmdbSearch.query}`);
      }

      // Add year if provided
      if (tmdbSearch.year) {
        requestBody.year = parseInt(tmdbSearch.year);
      }

      // Add Season/Episode if available
      if (tmdbSearch.seasonNumber) {
        requestBody.season_number = parseInt(tmdbSearch.seasonNumber);
      }
      if (tmdbSearch.episodeNumber) {
        requestBody.episode_number = parseInt(tmdbSearch.episodeNumber);
      }

      // Use the multi-provider endpoint
      const response = await fetch(`${API_URL}/assets/fetch-replacements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        console.log("Received results from API:");
        console.log("  TMDB:", data.results.tmdb?.length || 0, "items");
        console.log("  TVDB:", data.results.tvdb?.length || 0, "items");
        console.log("  Fanart:", data.results.fanart?.length || 0, "items");
        console.log("  Detected Provider:", data.detected_provider || "none");

        const results = {
          tmdb: data.results.tmdb || [],
          tvdb: data.results.tvdb || [],
          fanart: data.results.fanart || [],
        };

        // Determine which providers should be visible
        let visibleProviders = [];

        if (data.detected_provider) {
          // User used a prefix (tmdb-, tvdb-, imdb-, tt) - only show that provider
          console.log(
            `Prefix detected: showing only ${data.detected_provider} tab`
          );

          if (data.detected_provider === "tmdb") {
            visibleProviders = ["tmdb"];
          } else if (data.detected_provider === "tvdb") {
            visibleProviders = ["tvdb"];
          } else if (data.detected_provider === "imdb") {
            // IMDB uses Fanart.tv for display
            visibleProviders = ["fanart"];
          }
        } else {
          // No prefix - show all providers that have results
          console.log("No prefix detected: showing all providers with results");

          if (results.tmdb.length > 0) visibleProviders.push("tmdb");
          if (results.tvdb.length > 0) visibleProviders.push("tvdb");
          if (results.fanart.length > 0) visibleProviders.push("fanart");
        }

        // Auto-switch to first visible provider
        let activeProvider = visibleProviders[0] || "tmdb";

        setTmdbSearch({
          ...tmdbSearch,
          searching: false,
          results: results,
          showModal: true,
          displayedCount: 10, // Reset to show first 10
          activeProvider: activeProvider,
          visibleProviders: visibleProviders, // Track which tabs to show
        });

        // Check if there are any results in visible providers only
        const visibleResultsCount = visibleProviders.reduce(
          (count, provider) => {
            return count + (results[provider]?.length || 0);
          },
          0
        );

        if (visibleResultsCount === 0) {
          let message = "No images found for this search";
          if (manualForm.posterType === "season") {
            message = `No season ${tmdbSearch.seasonNumber} posters found`;
          } else if (manualForm.posterType === "titlecard") {
            message = `No images found for S${tmdbSearch.seasonNumber}E${tmdbSearch.episodeNumber}`;
          }

          // Add provider-specific message if prefix was used
          if (data.detected_provider) {
            const providerName =
              data.detected_provider === "imdb"
                ? "Fanart.tv (via IMDB)"
                : data.detected_provider.toUpperCase();
            message += ` from ${providerName}`;
          }

          showError(message);
        }
      } else {
        showError(`Error: ${data.message || "Failed to search providers"}`);
        setTmdbSearch({ ...tmdbSearch, searching: false });
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
      setTmdbSearch({ ...tmdbSearch, searching: false });
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
                {t("runModes.jellyfin.title")}
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
                {t("runModes.jellyfin.syncInfo")}
              </p>
              <p className="text-orange-100 text-sm">
                {t("runModes.jellyfin.description")}
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-theme-primary text-lg">
                {t("runModes.jellyfin.howItWorks")}
              </h4>

              <ul className="space-y-3 text-theme-text">
                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    1
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      {t("runModes.jellyfin.step1Title")}
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      {t("runModes.jellyfin.step1Text")}
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    2
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      {t("runModes.jellyfin.step2Title")}
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      {t("runModes.jellyfin.step2Text")}
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    3
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      {t("runModes.jellyfin.step3Title")}
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      {t("runModes.jellyfin.step3Text")}
                    </p>
                  </div>
                </li>
              </ul>

              <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded mt-4">
                <p className="text-blue-200 text-sm">
                  {t("runModes.jellyfin.tip")}
                </p>
              </div>

              <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded mt-4">
                <p className="text-yellow-200 text-sm">
                  {t("runModes.jellyfin.important")}
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
                {t("runModes.viewDocumentation")}
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-theme-bg px-6 py-4 rounded-b-xl flex justify-between border-t-2 border-theme">
            <button
              onClick={() => setShowJellyfinSyncModal(false)}
              className="px-6 py-2 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all"
            >
              {t("runModes.jellyfin.cancel")}
            </button>
            <button
              onClick={startJellyfinSync}
              disabled={loading || status.running}
              className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all text-white flex items-center shadow-lg"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              {t("runModes.jellyfin.start")}
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
              <h3 className="text-xl font-bold text-white">
                {t("runModes.emby.title")}
              </h3>
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
                {t("runModes.emby.syncInfo")}
              </p>
              <p className="text-orange-100 text-sm">
                {t("runModes.emby.description")}
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-theme-primary text-lg">
                {t("runModes.emby.howItWorks")}
              </h4>

              <ul className="space-y-3 text-theme-text">
                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    1
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      {t("runModes.emby.step1Title")}
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      {t("runModes.emby.step1Text")}
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    2
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      {t("runModes.emby.step2Title")}
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      {t("runModes.emby.step2Text")}
                    </p>
                  </div>
                </li>

                <li className="flex">
                  <span className="bg-theme-primary text-white rounded-full w-6 h-6 flex items-center justify-center mr-3 flex-shrink-0 text-sm font-bold">
                    3
                  </span>
                  <div>
                    <strong className="text-theme-primary">
                      {t("runModes.emby.step3Title")}
                    </strong>
                    <p className="text-sm text-theme-muted mt-1">
                      {t("runModes.emby.step3Text")}
                    </p>
                  </div>
                </li>
              </ul>

              <div className="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded mt-4">
                <p className="text-blue-200 text-sm">
                  {t("runModes.emby.tip")}
                </p>
              </div>

              <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded mt-4">
                <p className="text-yellow-200 text-sm">
                  {t("runModes.emby.important")}
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
                {t("runModes.viewDocumentation")}
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-theme-bg px-6 py-4 rounded-b-xl flex justify-between border-t-2 border-theme">
            <button
              onClick={() => setShowEmbySyncModal(false)}
              className="px-6 py-2 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all"
            >
              {t("runModes.emby.cancel")}
            </button>
            <button
              onClick={startEmbySync}
              disabled={loading || status.running}
              className="px-6 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-all text-white flex items-center shadow-lg"
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              {t("runModes.emby.start")}
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
            label: t("runModes.hints.folderNameLabel"),
            placeholder: t("runModes.hints.tvShowPlaceholder"),
            description: t("runModes.hints.tvShowDescription"),
          },
          libraryName: {
            placeholder: t("runModes.hints.tvLibraryPlaceholder"),
            description: t("runModes.hints.tvLibraryDescription"),
          },
        };
      case "collection":
        return {
          folderName: {
            label: t("runModes.hints.collectionLabel"),
            placeholder: t("runModes.hints.collectionPlaceholder"),
            description: t("runModes.hints.collectionDescription"),
          },
          libraryName: {
            placeholder: t("runModes.hints.movieLibraryPlaceholder"),
            description: t("runModes.hints.collectionLibraryDescription"),
          },
        };
      case "background":
        // Background uses same hints as standard
        if (manualForm.mediaTypeSelection === "tv") {
          return {
            folderName: {
              label: t("runModes.hints.folderNameLabel"),
              placeholder: t("runModes.hints.tvShowPlaceholder"),
              description: t("runModes.hints.tvShowDescription"),
            },
            libraryName: {
              placeholder: t("runModes.hints.tvLibraryPlaceholder"),
              description: t("runModes.hints.tvLibraryDescription"),
            },
          };
        } else {
          return {
            folderName: {
              label: t("runModes.hints.folderNameLabel"),
              placeholder: t("runModes.hints.moviePlaceholder"),
              description: t("runModes.hints.movieDescription"),
            },
            libraryName: {
              placeholder: t("runModes.hints.movieLibraryPlaceholder"),
              description: t("runModes.hints.movieLibraryDescription"),
            },
          };
        }
      case "standard":
        // Different hints for movies vs TV shows
        if (manualForm.mediaTypeSelection === "tv") {
          return {
            folderName: {
              label: t("runModes.hints.folderNameLabel"),
              placeholder: t("runModes.hints.tvShowPlaceholder"),
              description: t("runModes.hints.tvShowDescription"),
            },
            libraryName: {
              placeholder: t("runModes.hints.tvLibraryPlaceholder"),
              description: t("runModes.hints.tvLibraryDescription"),
            },
          };
        } else {
          return {
            folderName: {
              label: t("runModes.hints.folderNameLabel"),
              placeholder: t("runModes.hints.moviePlaceholder"),
              description: t("runModes.hints.movieDescription"),
            },
            libraryName: {
              placeholder: t("runModes.hints.movieLibraryPlaceholder"),
              description: t("runModes.hints.movieLibraryDescription"),
            },
          };
        }
      default:
        return {
          folderName: {
            label: t("runModes.hints.folderNameLabel"),
            placeholder: t("runModes.hints.moviePlaceholder"),
            description: t("runModes.hints.defaultDescription"),
          },
          libraryName: {
            placeholder: t("runModes.hints.movieLibraryPlaceholder"),
            description: t("runModes.hints.movieLibraryDescription"),
          },
        };
    }
  };

  const hints = getHints(manualForm.posterType);

  return (
    <div className="space-y-6">
      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={resetConfirm}
        onClose={() => setResetConfirm(false)}
        onConfirm={handleResetConfirm}
        title={t("runModes.reset.confirmTitle")}
        message={t("runModes.reset.confirmMessage", { library: resetLibrary })}
        type="danger"
      />

      <JellyfinSyncModal />
      <EmbySyncModal />

      {/* TMDB Modal - Now with stable props */}
      <TMDBPosterSearchModal
        tmdbSearch={tmdbSearch}
        setTmdbSearch={setTmdbSearch}
        manualForm={manualForm}
        setManualForm={setManualForm}
        showSuccess={showSuccess}
      />

      {/* Header */}
      <div className="flex items-center justify-end">
        {/* Status Badge */}
        {status.running && (
          <div className="flex items-center gap-3 bg-theme-card px-4 py-2 rounded-lg border border-theme-primary/50">
            <Loader2 className="w-5 h-5 text-theme-primary animate-spin" />
            <div>
              <div className="text-sm font-medium text-theme-text">
                {t("runModes.status.scriptRunning")}
              </div>
              {status.current_mode && (
                <div className="text-xs text-theme-muted">
                  {t("runModes.status.mode")} {status.current_mode}
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
                <p className="font-medium text-orange-200">
                  {t("runModes.status.running")}
                </p>
                <p className="text-sm text-orange-300/80">
                  {t("runModes.status.stopFirst")}
                </p>
              </div>
            </div>
            <button
              onClick={stopScript}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-all"
            >
              <Square className="w-4 h-4" />
              {t("runModes.status.stopButton")}
            </button>
          </div>
        </div>
      )}

      {/* Quick Run Modes */}
      <div className="bg-theme-card rounded-xl p-6 border border-theme">
        <h2 className="text-xl font-semibold text-theme-text mb-4 flex items-center gap-2">
          <Play className="w-5 h-5 text-theme-primary" />
          {t("runModes.quickRun.title")}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Normal Mode */}
          <button
            onClick={() => runScript("normal")}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <Play className="w-8 h-8 text-theme-primary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">
              {t("runModes.quickRun.normal.title")}
            </h3>
            <p className="text-sm text-theme-muted text-center">
              {t("runModes.quickRun.normal.description")}
            </p>
          </button>

          {/* Testing Mode */}
          <button
            onClick={() => runScript("testing")}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <TestTube className="w-8 h-8 text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">
              {t("runModes.quickRun.testing.title")}
            </h3>
            <p className="text-sm text-theme-muted text-center">
              {t("runModes.quickRun.testing.description")}
            </p>
          </button>

          {/* Backup Mode */}
          <button
            onClick={() => runScript("backup")}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <Save className="w-8 h-8 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">
              {t("runModes.quickRun.backup.title")}
            </h3>
            <p className="text-sm text-theme-muted text-center">
              {t("runModes.quickRun.backup.description")}
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
              {t("runModes.quickRun.syncJellyfin.title")}
            </h3>
            <p className="text-sm text-theme-muted text-center">
              {t("runModes.quickRun.syncJellyfin.description")}
            </p>
          </button>

          {/* Sync Emby */}
          <button
            onClick={() => setShowEmbySyncModal(true)}
            disabled={loading || status.running}
            className="flex flex-col items-center justify-center p-6 bg-theme-hover hover:bg-theme-primary/20 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-theme-primary/30 hover:border-theme-primary transition-all group"
          >
            <RefreshCw className="w-8 h-8 text-green-400 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-theme-text mb-1">
              {t("runModes.quickRun.syncEmby.title")}
            </h3>
            <p className="text-sm text-theme-muted text-center">
              {t("runModes.quickRun.syncEmby.description")}
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
              {t("runModes.manual.title")}
            </h2>
            <p className="text-sm text-theme-muted">
              {t("runModes.manual.description")}
            </p>
          </div>
        </div>

        {/* --- Form Fields --- */}
        <div className="space-y-4 mt-6">
          {/*CORRECT PLACEMENT: Buttons are the first item in the form*/}
          <div>
            <label className="block text-sm font-medium text-theme-text mb-2">
              {t("runModes.manual.posterType")}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                {t("runModes.manual.types.poster")}
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
                {t("runModes.manual.types.season")}
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
                {t("runModes.manual.types.titleCard")}
              </button>
              <button
                onClick={() =>
                  setManualForm({ ...manualForm, posterType: "background" })
                }
                disabled={loading || status.running}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                  manualForm.posterType === "background"
                    ? "bg-theme-primary border-theme-primary text-white"
                    : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <ImageIcon className="w-5 h-5" />
                {t("runModes.manual.types.background")}
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
                {t("runModes.manual.types.collection")}
              </button>
            </div>
          </div>

          {/* Movie/TV Show Toggle - For Standard and Background Poster Types */}
          {(manualForm.posterType === "standard" ||
            manualForm.posterType === "background") && (
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                {t("runModes.manual.mediaType")}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() =>
                    setManualForm({
                      ...manualForm,
                      mediaTypeSelection: "movie",
                    })
                  }
                  disabled={loading || status.running}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    manualForm.mediaTypeSelection === "movie"
                      ? "bg-theme-primary border-theme-primary text-white"
                      : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Film className="w-5 h-5" />
                  {t("runModes.manual.mediaTypes.movie")}
                </button>
                <button
                  onClick={() =>
                    setManualForm({ ...manualForm, mediaTypeSelection: "tv" })
                  }
                  disabled={loading || status.running}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                    manualForm.mediaTypeSelection === "tv"
                      ? "bg-theme-primary border-theme-primary text-white"
                      : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Tv className="w-5 h-5" />
                  {t("runModes.manual.mediaTypes.tv")}
                </button>
              </div>
              <p className="text-xs text-theme-muted mt-1">
                {t("runModes.manual.mediaTypeHint")}
              </p>
            </div>
          )}

          {/* TMDB Poster Search*/}
          <div className="bg-theme-hover border border-theme rounded-lg p-4">
            <div className="flex items-center mb-3">
              <Cloud className="w-5 h-5 text-theme-primary mr-2" />
              <h3 className="font-semibold text-theme-text">
                {t("runModes.manual.tmdbSearchTitle", {
                  type:
                    manualForm.posterType === "season"
                      ? t("runModes.manual.tmdbTypeSeasonPosters")
                      : manualForm.posterType === "titlecard"
                      ? t("runModes.manual.tmdbTypeEpisodeImages")
                      : manualForm.posterType === "standard"
                      ? `${
                          manualForm.mediaTypeSelection === "tv"
                            ? t("runModes.manual.tmdbTypeTvPosters")
                            : t("runModes.manual.tmdbTypeMoviePosters")
                        }`
                      : t("runModes.manual.tmdbTypePosters"),
                })}
              </h3>
            </div>
            <p className="text-xs text-theme-muted mb-3">
              {manualForm.posterType === "season"
                ? t("runModes.manual.tmdbHintSeason")
                : manualForm.posterType === "titlecard"
                ? t("runModes.manual.tmdbHintTitleCard")
                : t("runModes.manual.tmdbHintStandard")}
            </p>

            {/* Hauptsuche */}
            <div className="space-y-3 mb-3">
              {/* Title/ID Search Input with Toggle */}
              <div>
                {/* Hidden TMDB ID Search Toggle */}
                <div className="hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <button
                        type="button"
                        onClick={() =>
                          setTmdbSearch({
                            ...tmdbSearch,
                            searchByID: !tmdbSearch.searchByID,
                          })
                        }
                        disabled={
                          loading || status.running || tmdbSearch.searching
                        }
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-offset-2 focus:ring-offset-theme-bg disabled:opacity-50 disabled:cursor-not-allowed ${
                          tmdbSearch.searchByID
                            ? "bg-theme-primary"
                            : "bg-gray-600"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            tmdbSearch.searchByID
                              ? "translate-x-6"
                              : "translate-x-1"
                          }`}
                        />
                      </button>
                      <span className="text-sm text-theme-text">
                        {t("runModes.manual.searchByIdLabel")}
                      </span>
                    </label>
                    {tmdbSearch.searchByID && (
                      <span className="text-xs text-theme-muted">
                        ({t("runModes.manual.searchByIdHint")})
                      </span>
                    )}
                  </div>
                  {tmdbSearch.searchByID && (
                    <div className="text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded px-3 py-2">
                      {t("runModes.manual.searchByIdWarning")}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={tmdbSearch.query}
                  onChange={(e) =>
                    setTmdbSearch({ ...tmdbSearch, query: e.target.value })
                  }
                  onKeyPress={(e) => {
                    if (e.key === "Enter") searchTMDBPosters();
                  }}
                  placeholder={
                    tmdbSearch.searchByID
                      ? t("runModes.manual.tmdbIdPlaceholder")
                      : t("runModes.manual.tmdbSearchPlaceholder")
                  }
                  disabled={loading || status.running || tmdbSearch.searching}
                  className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {/* Search Hint Box */}
                <div className="mt-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="font-semibold text-blue-800 dark:text-blue-300 mb-1">
                    {t("runModes.tmdb.searchTips.title")}
                  </div>
                  <ul className="space-y-1 text-blue-700 dark:text-blue-400">
                    <li>
                      <strong>{t("runModes.tmdb.searchTips.byTitle")}</strong>{" "}
                      {t("runModes.tmdb.searchTips.byTitleExample")}
                    </li>
                    <li>
                      <strong>{t("runModes.tmdb.searchTips.byTmdbId")}</strong>{" "}
                      {t("runModes.tmdb.searchTips.byTmdbIdExample")}
                    </li>
                    <li>
                      <strong>{t("runModes.tmdb.searchTips.byTvdbId")}</strong>{" "}
                      {t("runModes.tmdb.searchTips.byTvdbIdExample")}
                    </li>
                    <li>
                      <strong>{t("runModes.tmdb.searchTips.byImdbId")}</strong>{" "}
                      {t("runModes.tmdb.searchTips.byImdbIdExample")}
                    </li>
                  </ul>
                  <div className="mt-2 text-blue-600 dark:text-blue-500 italic">
                    {t("runModes.tmdb.searchTips.noPrefixNote")}
                  </div>
                </div>
              </div>

              {/* Year Input */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-theme-text mb-1">
                    {t("runModes.manual.yearLabel")}
                  </label>
                  <input
                    type="number"
                    value={tmdbSearch.year}
                    onChange={(e) =>
                      setTmdbSearch({ ...tmdbSearch, year: e.target.value })
                    }
                    onKeyPress={(e) => {
                      if (e.key === "Enter") searchTMDBPosters();
                    }}
                    placeholder="2024"
                    min="1900"
                    max="2100"
                    disabled={
                      loading ||
                      status.running ||
                      tmdbSearch.searching ||
                      tmdbSearch.searchByID
                    }
                    className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Search Button */}
                <div className="self-end">
                  <button
                    onClick={searchTMDBPosters}
                    disabled={loading || status.running || tmdbSearch.searching}
                    className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {tmdbSearch.searching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("runModes.manual.tmdbSearching")}
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        {t("runModes.manual.tmdbSearchButton")}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Season/Episode Eingaben (nur wenn relevant) */}
            {(manualForm.posterType === "season" ||
              manualForm.posterType === "titlecard") && (
              <div className="grid grid-cols-2 gap-2">
                {/* Season Number */}
                <div>
                  <label className="block text-xs font-medium text-theme-text mb-1">
                    {t("runModes.manual.seasonName")}{" "}
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={tmdbSearch.seasonNumber}
                    onChange={(e) =>
                      setTmdbSearch({
                        ...tmdbSearch,
                        seasonNumber: e.target.value,
                      })
                    }
                    placeholder="1"
                    disabled={loading || status.running || tmdbSearch.searching}
                    className="w-full px-3 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Episode Number (only for Title Cards) */}
                {manualForm.posterType === "titlecard" && (
                  <div>
                    <label className="block text-xs font-medium text-theme-text mb-1">
                      {t("runModes.manual.episodeNumber")}{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={tmdbSearch.episodeNumber}
                      onChange={(e) =>
                        setTmdbSearch({
                          ...tmdbSearch,
                          episodeNumber: e.target.value,
                        })
                      }
                      placeholder="1"
                      disabled={
                        loading || status.running || tmdbSearch.searching
                      }
                      className="w-full px-3 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Hilfetext */}
            {(manualForm.posterType === "season" ||
              manualForm.posterType === "titlecard") && (
              <div className="mt-2 text-xs text-theme-muted">
                {manualForm.posterType === "season" && (
                  <p>{t("runModes.tmdb.seasonNumberHint")}</p>
                )}
                {manualForm.posterType === "titlecard" && (
                  <p>{t("runModes.tmdb.episodeNumberHint")}</p>
                )}
              </div>
            )}
          </div>

          {/* Picture Path */}
          <div>
            <label className="block text-sm font-medium text-theme-text mb-2">
              {t("runModes.manual.pictureSource")}{" "}
              <span className="text-red-400">*</span>
            </label>

            {/* Recommended Size Info */}
            <div className="mb-3 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-xs text-blue-400 flex items-center gap-2">
                <span className="font-semibold">ℹ️ Recommended sizes:</span>
                {manualForm.posterType === "background" ||
                manualForm.posterType === "titlecard" ? (
                  <span>
                    Backgrounds/Title Cards: 3840×2160px or higher (16:9 ratio)
                  </span>
                ) : (
                  <span>Posters: 2000×3000px or higher (2:3 ratio)</span>
                )}
              </p>
            </div>

            {/* Upload Section */}
            <div className="space-y-3">
              {/* File Upload Button */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="file-upload"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all cursor-pointer ${
                    uploadedFile
                      ? "bg-green-600 border-green-500 text-white"
                      : "bg-theme-hover border-theme hover:border-theme-primary text-theme-text"
                  } ${
                    loading || status.running
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  <FolderOpen className="w-5 h-5" />
                  {uploadedFile
                    ? t("runModes.manual.fileSelected")
                    : t("runModes.manual.uploadImage")}
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={loading || status.running}
                  className="hidden"
                />

                {uploadedFile && (
                  <button
                    onClick={clearUploadedFile}
                    disabled={loading || status.running}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Preview if file uploaded */}
              {uploadPreview && (
                <div className="bg-theme-bg border border-theme rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={uploadPreview}
                      alt="Preview"
                      className="w-16 h-24 object-cover rounded border border-theme-primary"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-theme-text">
                        {uploadedFile.name}
                      </p>
                      <p className="text-xs text-theme-muted">
                        {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-theme"></div>
                <span className="text-xs text-theme-muted uppercase">
                  {t("runModes.manual.or")}
                </span>
                <div className="flex-1 border-t border-theme"></div>
              </div>

              {/* URL/Path Input */}
              <input
                type="text"
                value={manualForm.picturePath}
                onChange={(e) => {
                  setManualForm({ ...manualForm, picturePath: e.target.value });
                  if (e.target.value.trim()) {
                    clearUploadedFile();
                  }
                }}
                placeholder={t("runModes.manual.urlPlaceholder")}
                disabled={loading || status.running || uploadedFile}
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <p className="text-xs text-theme-muted mt-2">
              {t("runModes.manual.uploadHint")}
            </p>
          </div>

          {/* Title Text - Hidden for title cards */}
          {manualForm.posterType !== "titlecard" && (
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                {t("runModes.manual.titleText")}{" "}
                <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={manualForm.titletext}
                onChange={(e) =>
                  setManualForm({ ...manualForm, titletext: e.target.value })
                }
                placeholder={t("runModes.manual.titlePlaceholder")}
                disabled={loading || status.running}
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-theme-muted mt-1">
                {t("runModes.manual.titleHint")}
              </p>
            </div>
          )}

          {/* Library Name Field - Required for all poster types - MOVED UP */}
          <div>
            <label className="block text-sm font-medium text-theme-text mb-2">
              {t("runModes.manual.libraryName")}{" "}
              <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualForm.libraryName}
                onChange={(e) =>
                  setManualForm({ ...manualForm, libraryName: e.target.value })
                }
                placeholder={hints.libraryName.placeholder}
                disabled={loading || status.running}
                className="flex-1 px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={loadLibraryItems}
                disabled={loading || status.running}
                className="px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                title="Select from existing libraries"
              >
                <FolderHeart className="w-4 h-4" />
                Select Library
              </button>
            </div>
            <p className="text-xs text-theme-muted mt-1">
              {hints.libraryName.description}
            </p>
          </div>

          {/* Folder Name Field - Hidden for collections (uses titletext as folder name) - AFTER LIBRARY */}
          {manualForm.posterType !== "collection" && (
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                {hints.folderName.label} <span className="text-red-400">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualForm.folderName}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, folderName: e.target.value })
                  }
                  placeholder={hints.folderName.placeholder}
                  disabled={loading || status.running}
                  className="flex-1 px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={loadFolderItems}
                  disabled={
                    loading || status.running || !manualForm.libraryName.trim()
                  }
                  className="px-4 py-2 bg-theme-primary hover:bg-theme-primary/80 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  title={
                    !manualForm.libraryName.trim()
                      ? "Please select Library first"
                      : "Select from existing folders"
                  }
                >
                  <FolderOpen className="w-4 h-4" />
                  Select Folder
                </button>
              </div>
              <p className="text-xs text-theme-muted mt-1">
                {hints.folderName.description}
              </p>
            </div>
          )}

          {/* CONDITIONAL FIELDS MOVED HERE FOR BETTER UX */}
          {/* Season Poster Name (only shown for season type) */}
          {manualForm.posterType === "season" && (
            <div>
              <label className="block text-sm font-medium text-theme-text mb-2">
                {t("runModes.manual.seasonPosterName")}{" "}
                <span className="text-red-400">*</span>
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
                placeholder={t("runModes.manual.seasonPlaceholder")}
                disabled={loading || status.running}
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-theme-muted mt-1">
                {t("runModes.manual.seasonHint")}
              </p>
            </div>
          )}

          {/* Episode Title Card Fields (only shown for titlecard type) */}
          {manualForm.posterType === "titlecard" && (
            <>
              <div>
                <label className="block text-sm font-medium text-theme-text mb-2">
                  {t("runModes.manual.episodeTitle")}{" "}
                  <span className="text-red-400">*</span>
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
                  placeholder={t("runModes.manual.episodeTitlePlaceholder")}
                  disabled={loading || status.running}
                  className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-theme-muted mt-1">
                  {t("runModes.manual.episodeTitleHint")}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-text mb-2">
                  {t("runModes.manual.seasonName")}{" "}
                  <span className="text-red-400">*</span>
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
                  placeholder={t("runModes.manual.seasonNamePlaceholder")}
                  disabled={loading || status.running}
                  className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-theme-muted mt-1">
                  {t("runModes.manual.seasonNameHint")}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-text mb-2">
                  {t("runModes.manual.episodeNumber")}{" "}
                  <span className="text-red-400">*</span>
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
                  placeholder={t("runModes.manual.episodeNumberPlaceholder")}
                  disabled={loading || status.running}
                  className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-theme-muted mt-1">
                  {t("runModes.manual.episodeNumberHint")}
                </p>
              </div>
            </>
          )}

          {/* --- Run Button & Info Box --- */}
          <button
            onClick={runManualMode}
            disabled={loading || status.running}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-theme-primary hover:bg-theme-primary/90 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all shadow-lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5" />
                {t("runModes.manual.processing")}
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                {t("runModes.manual.runButton")}
              </>
            )}
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-400 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-200 w-full">
              <p className="font-semibold mb-1">
                {t("runModes.manual.howItWorks")}
              </p>
              <ul className="list-disc list-inside space-y-1 text-blue-300/90">
                <li>{t("runModes.manual.step1")}</li>
                <li>{t("runModes.manual.step2")}</li>
                <li>{t("runModes.manual.step3")}</li>
                <li>{t("runModes.manual.step4")}</li>
              </ul>

              {/* Documentation Link */}
              <div className="mt-4 pt-4 border-t border-blue-500/30">
                <a
                  href="https://github.com/fscorrupt/Posterizarr#manual-mode-semi-automated"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/50 rounded-lg font-medium transition-all text-blue-100 hover:text-white"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("runModes.viewDocumentation")}
                </a>
              </div>
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
              {t("runModes.reset.title")}
            </h2>
            <p className="text-sm text-red-200">
              {t("runModes.reset.description")}
            </p>
          </div>
        </div>

        <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded mb-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-200">
              <p className="font-semibold mb-1">
                {t("runModes.reset.warning")}
              </p>
              <p>{t("runModes.reset.warningText")}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            value={resetLibrary}
            onChange={(e) => setResetLibrary(e.target.value)}
            placeholder={t("runModes.reset.placeholder")}
            disabled={loading || status.running}
            className="flex-1 px-4 py-3 bg-theme-card border border-red-500/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 disabled:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
          />
          <button
            onClick={resetPosters}
            disabled={loading || status.running || !resetLibrary.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-red-700 hover:bg-red-800 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-red-600 whitespace-nowrap shadow-sm"
          >
            <RotateCcw className="w-5 h-5" />
            {t("runModes.reset.button")}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <DangerZone
        status={status}
        loading={loading}
        onStatusUpdate={fetchStatus}
      />

      {/* Folder Selector Modal */}
      {showFolderSelector && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-card border border-theme-primary rounded-xl max-w-4xl w-full max-h-[80vh] shadow-2xl animate-in fade-in duration-200 flex flex-col">
            {/* Header */}
            <div className="bg-theme-primary px-6 py-4 rounded-t-xl flex items-center justify-between flex-shrink-0">
              <div className="flex items-center">
                <FolderOpen className="w-6 h-6 mr-3 text-white" />
                <h3 className="text-xl font-bold text-white">
                  Select Folder from assets/{manualForm.libraryName}
                  {folderItems.length > 0 && ` (${folderItems.length} folders)`}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowFolderSelector(false);
                  setFolderSearchQuery("");
                }}
                className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4 border-b border-theme-primary/30">
              <input
                type="text"
                value={folderSearchQuery}
                onChange={(e) => setFolderSearchQuery(e.target.value)}
                placeholder="Search folders..."
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary"
              />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingFolders ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-12 h-12 text-theme-primary animate-spin mb-4" />
                  <p className="text-theme-muted">Loading folders...</p>
                </div>
              ) : folderItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <FolderOpen className="w-16 h-16 text-theme-muted mb-4" />
                  <p className="text-theme-muted text-center">
                    No folders found in assets/{manualForm.libraryName}
                  </p>
                  <p className="text-theme-muted text-sm mt-2">
                    Please check the library name matches a folder in your
                    assets directory
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {folderItems
                    .filter((item) =>
                      folderSearchQuery
                        ? item.folderName
                            .toLowerCase()
                            .includes(folderSearchQuery.toLowerCase()) ||
                          item.title
                            .toLowerCase()
                            .includes(folderSearchQuery.toLowerCase())
                        : true
                    )
                    .map((item, index) => (
                      <button
                        key={index}
                        onClick={() =>
                          handleFolderSelect(item.folderName, item.title)
                        }
                        className="w-full text-left px-4 py-3 bg-theme-bg hover:bg-theme-primary/20 border border-theme rounded-lg transition-all duration-200 group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-theme-text font-medium truncate">
                              {item.title}
                              {item.year && (
                                <span className="text-theme-muted ml-2">
                                  ({item.year})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-theme-muted mt-1 truncate">
                              Folder: {item.folderName}
                            </p>
                          </div>
                          <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-theme-primary/30 flex justify-end">
              <button
                onClick={() => {
                  setShowFolderSelector(false);
                  setFolderSearchQuery("");
                }}
                className="px-4 py-2 bg-theme-bg hover:bg-theme-bg/80 text-theme-text rounded-lg transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Library Selector Modal */}
      {showLibrarySelector && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-theme-card border border-theme-primary rounded-xl max-w-3xl w-full max-h-[70vh] shadow-2xl animate-in fade-in duration-200 flex flex-col">
            {/* Header */}
            <div className="bg-theme-primary px-6 py-4 rounded-t-xl flex items-center justify-between flex-shrink-0">
              <div className="flex items-center">
                <FolderHeart className="w-6 h-6 mr-3 text-white" />
                <h3 className="text-xl font-bold text-white">
                  Select Library from assets/
                  {libraryItems.length > 0 &&
                    ` (${libraryItems.length} libraries)`}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowLibrarySelector(false);
                  setLibrarySearchQuery("");
                }}
                className="text-white/80 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4 border-b border-theme-primary/30">
              <input
                type="text"
                value={librarySearchQuery}
                onChange={(e) => setLibrarySearchQuery(e.target.value)}
                placeholder="Search libraries..."
                className="w-full px-4 py-2 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-theme-primary"
              />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingLibraries ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-12 h-12 text-theme-primary animate-spin mb-4" />
                  <p className="text-theme-muted">Loading libraries...</p>
                </div>
              ) : libraryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <FolderHeart className="w-16 h-16 text-theme-muted mb-4" />
                  <p className="text-theme-muted text-center">
                    No library folders found in assets/
                  </p>
                  <p className="text-theme-muted text-sm mt-2">
                    Please add library folders to your assets directory
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {libraryItems
                    .filter((lib) =>
                      librarySearchQuery
                        ? lib.name
                            .toLowerCase()
                            .includes(librarySearchQuery.toLowerCase())
                        : true
                    )
                    .map((lib, index) => (
                      <button
                        key={index}
                        onClick={() => handleLibrarySelect(lib.name)}
                        className="w-full text-left px-4 py-3 bg-theme-bg hover:bg-theme-primary/20 border border-theme rounded-lg transition-all duration-200 group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-theme-text font-medium truncate">
                              {lib.name}
                            </p>
                            <p className="text-xs text-theme-muted mt-1">
                              {lib.itemCount}{" "}
                              {lib.itemCount === 1 ? "item" : "items"}
                            </p>
                          </div>
                          <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-theme-primary/30 flex justify-end">
              <button
                onClick={() => {
                  setShowLibrarySelector(false);
                  setLibrarySearchQuery("");
                }}
                className="px-4 py-2 bg-theme-bg hover:bg-theme-bg/80 text-theme-text rounded-lg transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RunModes;
