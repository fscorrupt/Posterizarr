import React, { useState, useEffect } from "react";
import {
  Save,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Settings,
  Database,
  Palette,
  Type,
  Bell,
  Check,
  X,
  List,
  Lock,
  Hash,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "/api";

function ConfigEditor() {
  const [config, setConfig] = useState(null); // Flat config structure
  const [uiGroups, setUiGroups] = useState(null); // UI grouping info from backend
  const [displayNames, setDisplayNames] = useState({}); // Display names from backend
  const [usingFlatStructure, setUsingFlatStructure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [activeTab, setActiveTab] = useState(null);

  // Tab organization - groups fields by logical sections
  // This works with BOTH flat and grouped structure
  const tabs = {
    General: {
      groups: [
        "General Settings",
        "PrerequisitePart", // Fallback for grouped structure
      ],
      icon: Settings,
    },
    Services: {
      groups: [
        "Plex Settings",
        "Jellyfin Settings",
        "Emby Settings",
        "PlexPart", // Fallback
        "JellyfinPart", // Fallback
        "EmbyPart", // Fallback
      ],
      icon: Database,
    },
    API: {
      groups: [
        "API Keys & Tokens",
        "ApiPart", // Fallback
      ],
      icon: Settings,
    },
    Languages: {
      groups: ["Language & Preferences"],
      icon: Type,
    },
    Visuals: {
      groups: [
        "Image Filters",
        "Text Formatting",
        "Fonts",
        "Overlay Files",
        "Resolution Overlays",
        "Image Processing",
        "OverlayPart", // Fallback
      ],
      icon: Palette,
    },
    Overlays: {
      groups: [
        "Poster Settings",
        "Season Poster Settings",
        "Background Settings",
        "Title Card Overlay",
        "Title Card Title Text",
        "Title Card Episode Text",
        "Show Title on Season",
        "PosterOverlayPart", // Fallback
        "SeasonPosterOverlayPart", // Fallback
        "BackgroundOverlayPart", // Fallback
        "TitleCardOverlayPart", // Fallback
        "TitleCardTitleTextPart", // Fallback
        "TitleCardEPTextPart", // Fallback
        "ShowTitleOnSeasonPosterPart", // Fallback
      ],
      icon: Palette,
    },
    Collections: {
      groups: [
        "Collection Title",
        "Collection Poster",
        "CollectionTitlePosterPart", // Fallback
        "CollectionPosterOverlayPart", // Fallback
      ],
      icon: Type,
    },
    Notifications: {
      groups: [
        "Notifications",
        "Notification", // Fallback
      ],
      icon: Bell,
    },
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (config && !activeTab) {
      setActiveTab("General");
      // Expand first group of first tab by default
      const firstGroup = tabs["General"].groups[0];
      if (firstGroup) {
        setExpandedGroups({ [firstGroup]: true });
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
        setUiGroups(data.ui_groups || null);
        setDisplayNames(data.display_names || {});
        setUsingFlatStructure(data.using_flat_structure || false);

        // Log structure info for debugging
        console.log(
          "Config structure:",
          data.using_flat_structure ? "FLAT" : "GROUPED"
        );
        console.log(
          "Display names loaded:",
          Object.keys(data.display_names || {}).length
        );
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
        body: JSON.stringify({ config }), // Send flat config directly
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

  const toggleGroup = (groupName) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const updateValue = (key, value) => {
    // For flat structure
    if (usingFlatStructure) {
      setConfig((prev) => ({
        ...prev,
        [key]: value,
      }));
    } else {
      // For grouped structure - key is "section.field"
      const [section, field] = key.includes(".") ? key.split(".") : [null, key];
      if (section) {
        setConfig((prev) => ({
          ...prev,
          [section]: {
            ...prev[section],
            [field]: value,
          },
        }));
      }
    }
  };

  const getDisplayName = (key) => {
    // Use display name from backend if available, otherwise format the key
    if (displayNames[key]) {
      return displayNames[key];
    }
    // Fallback: format key nicely
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .trim();
  };

  const getGroupsByTab = (tabName) => {
    if (!config) return [];

    const tabGroups = tabs[tabName]?.groups || [];

    if (usingFlatStructure && uiGroups) {
      // Using flat structure with UI_GROUPS
      return tabGroups.filter((groupName) => {
        const groupKeys = uiGroups[groupName] || [];
        return groupKeys.some((key) => key in config);
      });
    } else {
      // Using grouped structure - return sections that exist in config
      return tabGroups.filter((groupName) => config[groupName]);
    }
  };

  const getFieldsForGroup = (groupName) => {
    if (!config) return [];

    if (usingFlatStructure && uiGroups) {
      // Flat structure: get keys from UI_GROUPS
      const groupKeys = uiGroups[groupName] || [];
      return groupKeys.filter((key) => key in config);
    } else {
      // Grouped structure: get fields from section
      return Object.keys(config[groupName] || {});
    }
  };

  const formatGroupName = (groupName) => {
    // If it's a UI group name, use it as-is
    if (groupName.includes(" ")) {
      return groupName;
    }
    // Otherwise format section name
    return groupName
      .replace(/Part$/, "")
      .replace(/([A-Z])/g, " $1")
      .trim();
  };

  const getGroupIcon = (groupName) => {
    if (
      groupName.includes("Plex") ||
      groupName.includes("Jellyfin") ||
      groupName.includes("Emby") ||
      groupName.includes("Server") ||
      groupName.includes("Settings")
    )
      return Database;
    if (groupName.includes("Overlay") || groupName.includes("Visual"))
      return Palette;
    if (
      groupName.includes("Text") ||
      groupName.includes("Font") ||
      groupName.includes("Collection")
    )
      return Type;
    if (groupName.includes("Notification")) return Bell;
    return Settings;
  };

  const getInputIcon = (key, value) => {
    const keyLower = key.toLowerCase();

    if (typeof value === "boolean" || value === "true" || value === "false")
      return Check;
    if (Array.isArray(value)) return List;
    if (
      keyLower.includes("password") ||
      keyLower.includes("token") ||
      keyLower.includes("key") ||
      keyLower.includes("secret")
    )
      return Lock;
    if (typeof value === "number") return Hash;
    return Type;
  };

  const renderInput = (groupName, key, value) => {
    const Icon = getInputIcon(key, value);
    const fieldKey = usingFlatStructure ? key : `${groupName}.${key}`;
    const displayName = getDisplayName(key);

    // Handle arrays with pill-style tags
    if (Array.isArray(value)) {
      return (
        <div className="space-y-3">
          <textarea
            defaultValue={value.join(", ")}
            onBlur={(e) => {
              const arrayValue = e.target.value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item !== "");
              updateValue(fieldKey, arrayValue);
            }}
            rows={Math.min(value.length + 2, 8)}
            className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all resize-y font-mono text-sm"
            placeholder="Enter comma-separated values"
          />
          {value.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-theme-bg rounded-lg border border-theme">
              {value.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-theme-primary/20 text-theme-primary rounded-full text-sm border border-theme-primary/30"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    const type = typeof value;
    const keyLower = key.toLowerCase();
    const stringValue =
      value === null || value === undefined ? "" : String(value);

    // Enhanced boolean toggle switch - handles both boolean type and "true"/"false" strings
    if (type === "boolean" || value === "true" || value === "false") {
      const isEnabled = value === "true" || value === true;
      return (
        <div className="flex items-center justify-between p-4 bg-theme-bg rounded-lg border border-theme hover:border-theme-primary/50 transition-all group">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-theme-primary/10 rounded-lg group-hover:bg-theme-primary/20 transition-colors">
              {isEnabled ? (
                <Check className="w-5 h-5 text-theme-primary" />
              ) : (
                <X className="w-5 h-5 text-theme-muted" />
              )}
            </div>
            <div className="text-sm font-medium text-theme-text">
              {displayName}
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) =>
                updateValue(fieldKey, e.target.checked ? "true" : "false")
              }
              className="sr-only peer"
              id={`${groupName}-${key}`}
            />
            <div className="w-14 h-7 bg-theme-card border-2 border-theme peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-theme-primary rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-theme-primary"></div>
          </label>
        </div>
      );
    }

    // Handle text_offset specially
    if (keyLower.includes("offset") || keyLower === "text_offset") {
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={stringValue}
            onChange={(e) => updateValue(fieldKey, e.target.value)}
            className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono"
            placeholder="+200 or -150"
          />
          <p className="text-xs text-theme-muted">
            Use + or - prefix (e.g., +200, -150)
          </p>
        </div>
      );
    }

    if (
      type === "number" ||
      keyLower.includes("port") ||
      keyLower.includes("size") ||
      keyLower.includes("width") ||
      keyLower.includes("height")
    ) {
      return (
        <div className="space-y-2">
          <input
            type="number"
            value={stringValue}
            onChange={(e) => updateValue(fieldKey, e.target.value)}
            className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
          />
        </div>
      );
    }

    if (
      keyLower.includes("password") ||
      keyLower.includes("token") ||
      keyLower.includes("key") ||
      keyLower.includes("secret")
    ) {
      return (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={stringValue}
              onChange={(e) => updateValue(fieldKey, e.target.value)}
              className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all font-mono pr-10"
              placeholder="Enter secure value"
            />
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted" />
          </div>
        </div>
      );
    }

    if (
      stringValue.length > 100 ||
      keyLower.includes("path") ||
      keyLower.includes("url")
    ) {
      return (
        <div className="space-y-2">
          <textarea
            value={stringValue}
            onChange={(e) => updateValue(fieldKey, e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all resize-y font-mono text-sm"
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <input
          type="text"
          value={stringValue}
          onChange={(e) => updateValue(fieldKey, e.target.value)}
          className="w-full px-4 py-2.5 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary transition-all"
        />
      </div>
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
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
            className="flex items-center px-5 py-2.5 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all disabled:opacity-50 hover:scale-105"
          >
            <RefreshCw
              className={`w-5 h-5 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Reload
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center px-6 py-2.5 bg-theme-primary hover:bg-theme-primary/90 rounded-lg font-medium transition-all disabled:opacity-50 shadow-lg hover:scale-105"
          >
            <Save className="w-5 h-5 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Tab Navigation - Enhanced with icons and badges */}
      <div className="mb-6">
        <div className="flex gap-2 flex-wrap overflow-x-auto pb-2">
          {Object.keys(tabs).map((tabName) => {
            const sectionsInTab = getGroupsByTab(tabName);
            if (sectionsInTab.length === 0 && tabName !== "Advanced")
              return null;

            const { icon: TabIcon } = tabs[tabName];
            const isActive = activeTab === tabName;

            return (
              <button
                key={tabName}
                onClick={() => setActiveTab(tabName)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-theme-primary text-white shadow-lg scale-105"
                    : "bg-theme-card text-theme-muted hover:bg-theme-hover hover:text-theme-text border border-theme"
                }`}
              >
                <TabIcon className="w-5 h-5" />
                {tabName}
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                    isActive
                      ? "bg-white/20"
                      : "bg-theme-primary/20 text-theme-primary"
                  }`}
                >
                  {sectionsInTab.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab && (
          <>
            {getGroupsByTab(activeTab).map((groupName) => {
              const GroupIcon = getGroupIcon(groupName);
              const isExpanded = expandedGroups[groupName];
              const fields = getFieldsForGroup(groupName);
              const settingsCount = fields.length;

              return (
                <div
                  key={groupName}
                  className="bg-theme-card rounded-xl border border-theme overflow-hidden hover:border-theme-primary/50 transition-all shadow-sm"
                >
                  {/* Group Header - Enhanced */}
                  <button
                    onClick={() => toggleGroup(groupName)}
                    className="w-full px-6 py-5 flex items-center justify-between hover:bg-theme-hover transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-theme-primary/10 group-hover:bg-theme-primary/20 group-hover:scale-110 transition-all">
                        <GroupIcon className="w-6 h-6 text-theme-primary" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-xl font-semibold text-theme-primary">
                          {formatGroupName(groupName)}
                        </h3>
                        <p className="text-sm text-theme-muted mt-1">
                          {settingsCount} setting
                          {settingsCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isExpanded
                            ? "bg-theme-primary/20 text-theme-primary border border-theme-primary/30"
                            : "bg-theme-bg text-theme-muted border border-theme"
                        }`}
                      >
                        {isExpanded ? "Open" : "Closed"}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-6 h-6 text-theme-primary transition-transform" />
                      ) : (
                        <ChevronRight className="w-6 h-6 text-theme-muted transition-transform" />
                      )}
                    </div>
                  </button>

                  {/* Group Content - Grid Layout */}
                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-theme">
                      <div className="pt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {fields.map((key) => {
                          // Get value from config - works for both flat and grouped
                          const value = usingFlatStructure
                            ? config[key]
                            : config[groupName]?.[key];

                          const displayName = getDisplayName(key);

                          return (
                            <div key={key} className="space-y-3">
                              <label className="block">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-semibold text-theme-primary">
                                    {displayName}
                                  </span>
                                  {key !== displayName && (
                                    <span className="text-xs text-theme-muted font-mono">
                                      {key}
                                    </span>
                                  )}
                                </div>
                                {renderInput(groupName, key, value)}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

export default ConfigEditor;
