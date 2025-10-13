import React, { useState, useEffect } from "react";
import { X, RefreshCw, Loader2, AlertCircle, Check } from "lucide-react";

const LibraryExclusionSelector = ({
  value = [],
  onChange,
  label,
  helpText,
  mediaServerType, // 'plex', 'jellyfin', or 'emby'
  config, // Full config object to get connection details
}) => {
  const [excludedLibraries, setExcludedLibraries] = useState([]);
  const [availableLibraries, setAvailableLibraries] = useState([]);
  const [loadingLibraries, setLoadingLibraries] = useState(false);
  const [error, setError] = useState(null);
  const [librariesFetched, setLibrariesFetched] = useState(false);

  // Initialize from value prop
  useEffect(() => {
    if (Array.isArray(value) && value.length > 0) {
      setExcludedLibraries(value);
    }
  }, [value]);

  const getMediaServerConfig = () => {
    if (!config) return null;

    if (mediaServerType === "plex") {
      return {
        url: config.PlexPart?.PlexUrl || config.PlexUrl,
        token: config.ApiPart?.PlexToken || config.PlexToken,
      };
    } else if (mediaServerType === "jellyfin") {
      return {
        url: config.JellyfinPart?.JellyfinUrl || config.JellyfinUrl,
        api_key: config.ApiPart?.JellyfinAPIKey || config.JellyfinAPIKey,
      };
    } else if (mediaServerType === "emby") {
      return {
        url: config.EmbyPart?.EmbyUrl || config.EmbyUrl,
        api_key: config.ApiPart?.EmbyAPIKey || config.EmbyAPIKey,
      };
    }
    return null;
  };

  const fetchLibraries = async () => {
    setLoadingLibraries(true);
    setError(null);

    const serverConfig = getMediaServerConfig();
    if (!serverConfig) {
      setError("Media server configuration not found");
      setLoadingLibraries(false);
      return;
    }

    try {
      const endpoint = `/api/libraries/${mediaServerType}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(serverConfig),
      });

      const data = await response.json();

      if (data.success && data.libraries) {
        setAvailableLibraries(data.libraries);
        setLibrariesFetched(true);
        setError(null);
      } else {
        setError(data.error || "Failed to fetch libraries");
        setAvailableLibraries([]);
      }
    } catch (err) {
      setError(`Error fetching libraries: ${err.message}`);
      setAvailableLibraries([]);
    } finally {
      setLoadingLibraries(false);
    }
  };

  const toggleLibrary = (libraryName) => {
    let newExcluded;
    if (excludedLibraries.includes(libraryName)) {
      // Remove from excluded (include it)
      newExcluded = excludedLibraries.filter((name) => name !== libraryName);
    } else {
      // Add to excluded
      newExcluded = [...excludedLibraries, libraryName];
    }
    setExcludedLibraries(newExcluded);
    onChange(newExcluded);
  };

  const clearAll = () => {
    setExcludedLibraries([]);
    onChange([]);
  };

  const excludeAll = () => {
    const allLibraryNames = availableLibraries.map((lib) => lib.name);
    setExcludedLibraries(allLibraryNames);
    onChange(allLibraryNames);
  };

  const getLibraryTypeIcon = (type) => {
    if (type === "movie" || type === "movies") {
      return "🎬";
    } else if (type === "show" || type === "tvshows") {
      return "📺";
    }
    return "📁";
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-theme-text">
          {label}
        </label>
      )}

      {/* Fetch Libraries Button */}
      <div className="flex gap-2">
        <button
          onClick={fetchLibraries}
          disabled={loadingLibraries}
          className={`flex items-center gap-2 px-4 py-2.5 bg-theme-primary/20 hover:bg-theme-primary/30 border border-theme-primary/30 rounded-lg font-medium transition-all ${
            loadingLibraries ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          {loadingLibraries ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="text-sm">
            {librariesFetched ? "Refresh Libraries" : "Fetch Libraries"}
          </span>
        </button>

        {librariesFetched && availableLibraries.length > 0 && (
          <>
            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2 bg-theme-bg hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all text-sm"
            >
              <Check className="w-4 h-4" />
              Include All
            </button>
            <button
              onClick={excludeAll}
              className="flex items-center gap-2 px-4 py-2 bg-theme-bg hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all text-sm"
            >
              <X className="w-4 h-4" />
              Exclude All
            </button>
          </>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-400 font-medium">
              Failed to fetch libraries
            </p>
            <p className="text-xs text-red-400/80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loadingLibraries && (
        <div className="flex items-center justify-center py-8 bg-theme-bg/50 border border-theme rounded-lg">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-theme-primary mx-auto mb-2" />
            <p className="text-sm text-theme-muted">
              Fetching libraries from {mediaServerType}...
            </p>
          </div>
        </div>
      )}

      {/* Libraries List */}
      {!loadingLibraries &&
        librariesFetched &&
        availableLibraries.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-theme-muted">
              Select libraries to <strong>exclude</strong> from processing:
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {availableLibraries.map((library) => {
                const isExcluded = excludedLibraries.includes(library.name);
                return (
                  <div
                    key={library.name}
                    onClick={() => toggleLibrary(library.name)}
                    className={`flex items-center gap-3 px-4 py-3 border rounded-lg cursor-pointer transition-all ${
                      isExcluded
                        ? "bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                        : "bg-green-500/10 border-green-500/30 hover:bg-green-500/20"
                    }`}
                  >
                    {/* Icon */}
                    <span className="text-2xl flex-shrink-0">
                      {getLibraryTypeIcon(library.type)}
                    </span>

                    {/* Library Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-theme-text">
                          {library.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-theme-bg rounded-full text-theme-muted">
                          {library.type}
                        </span>
                      </div>
                    </div>

                    {/* Status Indicator */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isExcluded ? (
                        <div className="flex items-center gap-1.5 text-red-400 text-sm font-medium">
                          <X className="w-4 h-4" />
                          <span>Excluded</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
                          <Check className="w-4 h-4" />
                          <span>Included</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Empty State - No Libraries Fetched */}
      {!loadingLibraries && !librariesFetched && (
        <div className="px-4 py-8 bg-theme-bg/50 border-2 border-dashed border-theme rounded-lg text-center">
          <p className="text-theme-muted text-sm">
            Click "Fetch Libraries" to load libraries from your{" "}
            {mediaServerType.charAt(0).toUpperCase() + mediaServerType.slice(1)}{" "}
            server.
          </p>
        </div>
      )}

      {/* Empty State - No Libraries Found */}
      {!loadingLibraries &&
        librariesFetched &&
        availableLibraries.length === 0 &&
        !error && (
          <div className="px-4 py-8 bg-theme-bg/50 border border-theme rounded-lg text-center">
            <p className="text-theme-muted text-sm">
              No movie or TV show libraries found on this server.
            </p>
          </div>
        )}

      {/* Current Exclusions Summary */}
      {excludedLibraries.length > 0 && (
        <div className="px-4 py-3 bg-theme-bg/50 border border-theme rounded-lg">
          <p className="text-xs text-theme-muted mb-2">
            Excluded Libraries ({excludedLibraries.length}):
          </p>
          <div className="flex flex-wrap gap-2">
            {excludedLibraries.map((libName) => (
              <span
                key={libName}
                className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm border border-red-500/30 flex items-center gap-1.5"
              >
                <X className="w-3 h-3" />
                {libName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      {helpText && <p className="text-xs text-theme-muted">{helpText}</p>}
    </div>
  );
};

export default LibraryExclusionSelector;
