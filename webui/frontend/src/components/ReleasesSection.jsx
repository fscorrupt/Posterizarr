import React, { useState, useEffect } from "react";
import {
  Calendar,
  Download,
  ExternalLink,
  Tag,
  Clock,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApi } from "../context/ApiContext";

function ReleasesSection({ cachedData }) {
  const { t } = useTranslation();
  const api = useApi();
  const [releases, setReleases] = useState(cachedData?.releases || []);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState(null);

  // Update releases when cached data changes
  useEffect(() => {
    if (cachedData?.releases) {
      setReleases(cachedData.releases);
      setLoading(false);
      setError(null);
    } else if (releases.length === 0) {
      // Fetch nur wenn keine cached data und keine releases vorhanden
      fetchReleases();
    }
  }, [cachedData]);

  const fetchReleases = async () => {
    setLoading(true);
    try {
      const data = await api.getReleases(true);

      if (data.success) {
        setReleases(data.releases);
        setError(null);
      } else {
        setError(data.error || t("releasesSection.fetchFailed"));
      }
    } catch (err) {
      console.error("Error fetching releases:", err);
      setError(t("releasesSection.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  const formatDaysAgo = (daysAgo) => {
    if (daysAgo === 0) return t("releasesSection.today");
    if (daysAgo === 1) return t("releasesSection.yesterday");
    return t("releasesSection.daysAgo", { days: daysAgo });
  };

  if (loading && releases.length === 0) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Tag className="w-6 h-6 text-theme-primary" />
          {t("releasesSection.title")}
        </h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-theme-primary" />
        </div>
      </div>
    );
  }

  if (error && releases.length === 0) {
    return (
      <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
        <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
          <Tag className="w-6 h-6 text-theme-primary" />
          {t("releasesSection.title")}
        </h2>
        <div className="text-red-400 text-sm">
          {t("releasesSection.error")}: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-card border border-theme rounded-lg p-6 space-y-4">
      <h2 className="text-2xl font-bold text-theme-text flex items-center gap-2">
        <Tag className="w-6 h-6 text-theme-primary" />
        {t("releasesSection.title")}
      </h2>

      <div className="space-y-2">
        {releases.map((release, index) => (
          <div
            key={release.version}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-4 bg-theme-hover border border-theme rounded-lg hover:bg-theme-primary/10 transition-all group"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
              {/* Release Date */}
              <div className="text-theme-muted text-sm sm:min-w-[100px]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {formatDaysAgo(release.days_ago)}
                </div>
              </div>

              {/* Version Number */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-theme-text font-bold text-lg">
                  {release.version}
                </span>
                {index === 0 && (
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium border border-green-500/30">
                    {t("releasesSection.latest")}
                  </span>
                )}
                {release.is_prerelease && (
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium border border-yellow-500/30">
                    {t("releasesSection.preRelease")}
                  </span>
                )}
              </div>
            </div>

            {/* View Changelog Button */}
            <a
              href={release.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-theme-primary/20 hover:bg-theme-primary/30 border border-theme-primary rounded-lg transition-all whitespace-nowrap flex-shrink-0"
            >
              <span className="text-theme-text text-sm font-medium">
                {t("releasesSection.viewChangelog")}
              </span>
              <ExternalLink className="w-4 h-4 text-theme-primary" />
            </a>
          </div>
        ))}
      </div>

      {releases.length === 0 && (
        <div className="text-center text-theme-muted py-8">
          {t("releasesSection.noReleases")}
        </div>
      )}
    </div>
  );
}

export default ReleasesSection;
