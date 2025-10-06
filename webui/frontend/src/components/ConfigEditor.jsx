import React, { useState, useEffect } from "react";
import {
  Save,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "/api";

function ConfigEditor() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [activeTab, setActiveTab] = useState(null);

  // Group sections into logical tabs
  const tabs = {
    General: ["PrerequisitePart", "PlexPart", "JellyfinPart", "EmbyPart"],
    Overlays: [
      "OverlayPart",
      "PosterOverlayPart",
      "SeasonPosterOverlayPart",
      "BackgroundOverlayPart",
      "TitleCardOverlayPart",
    ],
    Text: [
      "TitleCardTitleTextPart",
      "TitleCardEPTextPart",
      "ShowTitleOnSeasonPosterPart",
      "CollectionTitlePosterPart",
      "CollectionPosterOverlayPart",
    ],
    API: ["ApiPart", "FontPart"],
    Notifications: ["Notification"],
    // Advanced: [], // Will contain remaining sections
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (config && !activeTab) {
      setActiveTab("General");
      // Expand first section of first tab by default
      const firstSection = tabs["General"][0];
      if (firstSection) {
        setExpandedSections({ [firstSection]: true });
      }
    }
  }, [config]);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/config`);
      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
      } else {
        setError("Failed to load config");
      }
    } catch (err) {
      setError(err.message);
      toast.error("Failed to load configuration", {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Configuration saved successfully!", {
          duration: 3000,
          position: "top-right",
        });
      } else {
        setError("Failed to save config");
        toast.error("Failed to save configuration", {
          duration: 4000,
          position: "top-right",
        });
      }
    } catch (err) {
      setError(err.message);
      toast.error(`Error: ${err.message}`, {
        duration: 4000,
        position: "top-right",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const updateValue = (section, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const getSectionsByTab = (tabName) => {
    if (!config) return [];

    const tabSections = tabs[tabName];
    if (tabName === "Advanced") {
      // Advanced tab gets all sections not in other tabs
      const usedSections = Object.values(tabs)
        .flat()
        .filter((s) => s); // Remove empty strings
      return Object.keys(config).filter(
        (section) => !usedSections.includes(section)
      );
    }
    return tabSections.filter((section) => config[section]);
  };

  const formatSectionName = (section) => {
    return section
      .replace(/Part$/, "")
      .replace(/([A-Z])/g, " $1")
      .trim();
  };

  const renderInput = (section, key, value) => {
    // Handle arrays first - FIXED: Convert to array only on blur to prevent cursor jumping
    if (Array.isArray(value)) {
      return (
        <div>
          <textarea
            defaultValue={value.join(", ")}
            onBlur={(e) => {
              // Split by comma and clean up each item only when leaving the field
              const arrayValue = e.target.value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item !== "");
              updateValue(section, key, arrayValue);
            }}
            rows={Math.min(value.length + 2, 8)}
            className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all resize-y font-mono text-sm"
            placeholder="Enter comma-separated values"
          />
          <p className="text-xs text-theme-muted mt-1">
            Array with {value.length} item{value.length !== 1 ? "s" : ""}{" "}
            (comma-separated)
          </p>
        </div>
      );
    }

    const type = typeof value;
    const keyLower = key.toLowerCase();
    const stringValue =
      value === null || value === undefined ? "" : String(value);

    if (type === "boolean") {
      return (
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            checked={value === "true" || value === true}
            onChange={(e) =>
              updateValue(section, key, e.target.checked ? "true" : "false")
            }
            className="w-5 h-5 rounded border border-theme bg-theme-card text-theme-primary focus:ring-2 focus:ring-theme-primary cursor-pointer"
            id={`${section}-${key}`}
          />
          <label
            htmlFor={`${section}-${key}`}
            className="text-sm text-theme-text cursor-pointer select-none"
          >
            {value === "true" || value === true ? "Enabled" : "Disabled"}
          </label>
        </div>
      );
    }

    // Handle text_offset specially - it needs +/- prefix support
    if (keyLower === "text_offset") {
      return (
        <div>
          <input
            type="text"
            value={stringValue}
            onChange={(e) => updateValue(section, key, e.target.value)}
            className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono"
            placeholder="+200 or -150"
          />
          <p className="text-xs text-theme-muted mt-1">
            Use + or - prefix (e.g., +200, -150)
          </p>
        </div>
      );
    }

    if (
      type === "number" ||
      keyLower.includes("port") ||
      keyLower.includes("size") ||
      keyLower.includes("offset")
    ) {
      return (
        <input
          type="number"
          value={stringValue}
          onChange={(e) => updateValue(section, key, e.target.value)}
          className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
        />
      );
    }

    if (
      keyLower.includes("password") ||
      keyLower.includes("token") ||
      keyLower.includes("key") ||
      keyLower.includes("secret")
    ) {
      return (
        <input
          type="text"
          value={stringValue}
          onChange={(e) => updateValue(section, key, e.target.value)}
          className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono"
          placeholder="Enter secure value"
        />
      );
    }

    if (
      stringValue.length > 100 ||
      keyLower.includes("path") ||
      keyLower.includes("url")
    ) {
      return (
        <textarea
          value={stringValue}
          onChange={(e) => updateValue(section, key, e.target.value)}
          rows={3}
          className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all resize-y font-mono text-sm"
        />
      );
    }

    return (
      <input
        type="text"
        value={stringValue}
        onChange={(e) => updateValue(section, key, e.target.value)}
        className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-red-300 text-lg font-semibold mb-2">
          Error Loading Configuration
        </p>
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchConfig}
          className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <Toaster />

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-theme-primary mb-2">
            Configuration Editor
          </h1>
          <p className="text-theme-muted">Manage your Posterizarr settings</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchConfig}
            disabled={loading}
            className="flex items-center px-5 py-2.5 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-5 h-5 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Reload
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center px-6 py-2.5 bg-theme-primary hover:bg-theme-primary/90 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-lg"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-4">
        <div className="flex gap-2 flex-wrap">
          {Object.keys(tabs).map((tabName) => {
            const sectionsInTab = getSectionsByTab(tabName);
            if (sectionsInTab.length === 0 && tabName !== "Advanced")
              return null;

            return (
              <button
                key={tabName}
                onClick={() => setActiveTab(tabName)}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === tabName
                    ? "bg-theme-primary text-white shadow-md"
                    : "bg-theme-hover text-theme-muted hover:bg-theme-hover/70"
                }`}
              >
                {tabName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-theme-card rounded-lg border border-theme-primary p-6">
        {activeTab && (
          <div className="space-y-4">
            {getSectionsByTab(activeTab).map((section) => (
              <div
                key={section}
                className="bg-theme-bg rounded-lg border border-theme overflow-hidden"
              >
                <button
                  onClick={() => toggleSection(section)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-theme-hover transition-colors"
                >
                  <h3 className="text-lg font-semibold text-theme-primary flex items-center">
                    {expandedSections[section] ? (
                      <ChevronDown className="w-5 h-5 mr-2 text-theme-primary" />
                    ) : (
                      <ChevronRight className="w-5 h-5 mr-2 text-theme-muted" />
                    )}
                    {formatSectionName(section)}
                  </h3>
                  <span className="text-sm text-theme-muted">
                    {Object.keys(config[section] || {}).length} settings
                  </span>
                </button>

                {expandedSections[section] && (
                  <div className="px-6 pb-6 pt-2 space-y-4 border-t border-theme">
                    {Object.entries(config[section] || {}).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="bg-theme-card rounded-lg p-4 border border-theme"
                        >
                          <label className="block mb-2">
                            <span className="text-sm font-medium text-theme-primary mb-1 block">
                              {key}
                            </span>
                            <span className="text-xs text-theme-muted block mb-2">
                              Type:{" "}
                              {Array.isArray(value) ? "array" : typeof value}
                            </span>
                            {renderInput(section, key, value)}
                          </label>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfigEditor;
