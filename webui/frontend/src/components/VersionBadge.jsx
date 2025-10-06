import React, { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";

const API_URL = "/api";

function VersionBadge() {
  const [isOutOfDate, setIsOutOfDate] = useState(false);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    checkVersion();
    // Check version every 5 minutes
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkVersion = async () => {
    try {
      const response = await fetch(`${API_URL}/version`);
      const data = await response.json();

      if (data.local && data.remote) {
        setVersion(data.local);
        setIsOutOfDate(data.local !== data.remote);
      }
    } catch (error) {
      console.error("Error checking version:", error);
    }
  };

  if (!version) return null;

  if (isOutOfDate) {
    return (
      <span className="ml-2 px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-xs font-medium border border-orange-500/30 flex items-center gap-1 animate-pulse">
        <AlertCircle className="w-3 h-3" />
        Update available
      </span>
    );
  }

  return (
    <span className="ml-2 px-2 py-0.5 bg-theme-hover text-theme-muted rounded-full text-xs font-medium">
      v{version}
    </span>
  );
}

export default VersionBadge;
