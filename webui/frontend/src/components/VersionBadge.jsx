import React, { useState, useEffect } from "react";
import { AlertCircle, Info, CheckCircle } from "lucide-react";

const API_URL = "/api";
const REPO_URL = "https://github.com/fscorrupt/Posterizarr/releases/latest";

let cachedVersionData = { version: null, isOutOfDate: false };

function VersionBadge() {
  const [isOutOfDate, setIsOutOfDate] = useState(cachedVersionData.isOutOfDate);
  const [version, setVersion] = useState(cachedVersionData.version);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    checkVersion();

    const interval = setInterval(checkVersion, 12 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkVersion = async () => {
    try {
      const response = await fetch(`${API_URL}/version`);
      const data = await response.json();

      if (data.local) {
        // Save to persistent cache
        cachedVersionData = {
          version: data.local,
          isOutOfDate: data.is_update_available || false,
        };
        setVersion(data.local);
        setIsOutOfDate(data.is_update_available || false);
      }
    } catch (error) {
      console.error("Error checking version:", error);
    }
  };

  if (!version) return null;

  return (
    <div className="relative">
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <div
          className={`flex flex-col gap-2 px-3 py-2 rounded-lg transition-all hover:scale-105 ${
            isOutOfDate
              ? "bg-orange-500/20 border border-orange-500/40"
              : "bg-theme-bg border border-theme"
          }`}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {/* Top Row: Posterizarr + Icon */}
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-medium ${
                isOutOfDate ? "text-orange-300" : "text-theme-muted"
              }`}
            >
              Posterizarr
            </span>
            <div className="p-1 rounded-full hover:bg-theme-hover transition-colors">
              {isOutOfDate ? (
                <AlertCircle className="w-4 h-4 text-orange-400 animate-pulse" />
              ) : (
                <Info className="w-4 h-4 text-theme-muted" />
              )}
            </div>
          </div>

          {/* Bottom Row: Version + Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${
                isOutOfDate ? "text-orange-200" : "text-theme-text"
              }`}
            >
              v{version}
            </span>
            {!isOutOfDate && (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium border border-green-500/30 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Up to Date
              </span>
            )}
          </div>
        </div>
      </a>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-48 bg-theme-card border border-theme rounded-lg shadow-lg p-3 z-50">
          <p className="text-xs text-theme-text font-medium mb-1">
            Version: {version}
          </p>
          {isOutOfDate && (
            <>
              <p className="text-xs text-orange-300 mb-2">
                ⚠️ Update available!
              </p>
              <p className="text-xs text-theme-muted">
                Click here to get to the Github Releases.
              </p>
            </>
          )}
          {!isOutOfDate && (
            <p className="text-xs text-green-400">
              ✓ Current version installed
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default VersionBadge;
