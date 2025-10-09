import React, { useState, useEffect } from "react";
import { Calendar, Download, ExternalLink, Tag, Clock } from "lucide-react";

const API_URL = "/api";

function ReleasesSection() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/releases`);
      const data = await response.json();

      if (data.success) {
        setReleases(data.releases);
        setError(null);
      } else {
        setError(data.error || "Failed to fetch releases");
      }
    } catch (err) {
      console.error("Error fetching releases:", err);
      setError("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  };

  const formatDaysAgo = (daysAgo) => {
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    return `${daysAgo} days ago`;
  };

  if (loading) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Tag className="w-6 h-6 text-theme-primary" />
          Releases
        </h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Tag className="w-6 h-6 text-theme-primary" />
          Releases
        </h2>
        <div className="text-red-400 text-sm">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
      <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
        <Tag className="w-6 h-6 text-theme-primary" />
        Releases
      </h2>

      <div className="space-y-2">
        {releases.map((release, index) => (
          <div
            key={release.version}
            className="flex items-center justify-between p-4 bg-theme-hover border border-theme rounded-lg hover:bg-theme-primary/10 transition-all group"
          >
            <div className="flex items-center gap-4">
              {/* Release Date */}
              <div className="text-theme-muted text-sm min-w-[100px]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {formatDaysAgo(release.days_ago)}
                </div>
              </div>

              {/* Version Number */}
              <div className="flex items-center gap-2">
                <span className="text-theme-text font-bold text-lg">
                  {release.version}
                </span>
                {index === 0 && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium border border-green-500/30">
                    Latest
                  </span>
                )}
                {release.is_prerelease && (
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium border border-yellow-500/30">
                    Pre-release
                  </span>
                )}
              </div>
            </div>

            {/* View Changelog Button */}
            <a
              href={release.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-theme-primary/20 hover:bg-theme-primary/30 border border-theme-primary rounded-lg transition-all"
            >
              <span className="text-theme-text text-sm font-medium">
                View Changelog
              </span>
              <ExternalLink className="w-4 h-4 text-theme-primary" />
            </a>
          </div>
        ))}
      </div>

      {releases.length === 0 && (
        <div className="text-center text-theme-muted py-8">
          No releases found
        </div>
      )}
    </div>
  );
}

export default ReleasesSection;
