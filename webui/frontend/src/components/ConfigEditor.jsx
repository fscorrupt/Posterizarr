import React, { useState, useEffect } from "react";
import { Save, RefreshCw, AlertCircle } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

const API_URL = "http://localhost:8000/api";

function ConfigEditor() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/config`);
      const data = await response.json();

      if (data.success) {
        setConfig(data.config);
        // Expand first section by default
        const firstSection = Object.keys(data.config)[0];
        setExpandedSections({ [firstSection]: true });
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

  const renderInput = (section, key, value) => {
    const type = typeof value;
    const keyLower = key.toLowerCase();

    // Ensure value is always a string for text inputs
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
            className="w-5 h-5 rounded bg-theme-card border-theme text-purple-600 focus:ring-purple-500"
          />
          <span
            className={
              value === "true" || value === true
                ? "text-green-400"
                : "text-theme-muted"
            }
          >
            {value === "true" || value === true ? "Enabled" : "Disabled"}
          </span>
        </div>
      );
    }

    if (Array.isArray(value)) {
      return (
        <input
          type="text"
          value={value.join(", ")}
          onChange={(e) =>
            updateValue(
              section,
              key,
              e.target.value.split(",").map((v) => v.trim())
            )
          }
          className="w-full px-3 py-2 bg-theme-card border border-theme rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Comma-separated values"
        />
      );
    }

    // Determine if this should be a number input
    const isNumericField =
      type === "number" ||
      (type === "string" &&
        !isNaN(parseFloat(stringValue)) &&
        stringValue !== "" &&
        (keyLower.includes("width") ||
          keyLower.includes("height") ||
          keyLower.includes("size") ||
          keyLower.includes("point") ||
          keyLower.includes("offset") ||
          keyLower.includes("spacing") ||
          keyLower.includes("border") ||
          keyLower.includes("max") ||
          keyLower.includes("min") ||
          keyLower === "loglevel"));

    if (isNumericField) {
      // For numeric fields, allow +, -, and numbers
      // Don't clean the + sign - it's valid for offsets!

      return (
        <input
          type="text"
          inputMode="numeric"
          value={stringValue}
          onChange={(e) => {
            const newValue = e.target.value;
            // Allow +, -, numbers, and empty string
            // Only allow + or - at the beginning
            if (newValue === "" || newValue === "+" || newValue === "-") {
              updateValue(section, key, newValue);
            } else if (/^[+-]?\d+$/.test(newValue)) {
              updateValue(section, key, newValue);
            }
          }}
          onBlur={(e) => {
            // Clean up incomplete values on blur
            const val = e.target.value;
            if (val === "+" || val === "-") {
              updateValue(section, key, "0");
            }
          }}
          className="w-full px-3 py-2 bg-theme-card border border-theme rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
          placeholder="e.g., +400, -50, 100"
        />
      );
    }

    // Determine if this should be a textarea
    const isPathOrFileField =
      keyLower.includes("path") ||
      keyLower.includes("file") ||
      keyLower.includes("font") ||
      keyLower.includes("overlay") ||
      stringValue.includes("\\") ||
      stringValue.includes("/") ||
      stringValue.length > 80;

    if (isPathOrFileField) {
      return (
        <textarea
          value={stringValue}
          onChange={(e) => updateValue(section, key, e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-theme-card border border-theme rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm resize-y"
        />
      );
    }

    // Regular string
    return (
      <input
        type="text"
        value={stringValue}
        onChange={(e) => updateValue(section, key, e.target.value)}
        className="w-full px-3 py-2 bg-theme-card border border-theme rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        placeholder={
          keyLower.includes("color") ? "e.g., white, black, #FF0000" : ""
        }
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-theme-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <Toaster />
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center">
          <AlertCircle className="w-6 h-6 text-red-400 mr-3" />
          <div>
            <h3 className="font-semibold text-red-400">Error</h3>
            <p className="text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <Toaster />

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-theme-primary">Configuration</h1>
        <div className="flex space-x-3">
          <button
            onClick={fetchConfig}
            className="flex items-center px-4 py-2 bg-theme-card hover:bg-theme-hover border border-theme rounded-lg font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center px-4 py-2 bg-theme-primary hover:bg-theme-primary-hover disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Config"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {config &&
          Object.entries(config).map(([section, values]) => (
            <div
              key={section}
              className="bg-theme-card rounded-lg border border-theme overflow-hidden"
            >
              <button
                onClick={() => toggleSection(section)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-theme-hover transition-colors"
              >
                <h2 className="text-xl font-semibold text-theme-primary">
                  {section}
                </h2>
                <span className="text-theme-muted">
                  {expandedSections[section] ? "−" : "+"}
                </span>
              </button>

              {expandedSections[section] && (
                <div className="px-6 py-4 border-t border-theme space-y-4">
                  {typeof values === "object" && !Array.isArray(values) ? (
                    Object.entries(values).map(([key, value]) => (
                      <div
                        key={key}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start"
                      >
                        <label className="text-sm font-medium text-theme-text md:col-span-1 pt-2">
                          {key}
                        </label>
                        <div className="md:col-span-2">
                          {renderInput(section, key, value)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-theme-muted">
                      {JSON.stringify(values)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

export default ConfigEditor;
