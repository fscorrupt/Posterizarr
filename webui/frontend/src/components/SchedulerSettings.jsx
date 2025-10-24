import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Plus,
  Trash2,
  Power,
  RefreshCw,
  Play,
  Calendar,
  AlertCircle,
  Loader2,
  Settings,
  Zap,
  ChevronDown,
} from "lucide-react";
import Notification from "./Notification";
import { useToast } from "../context/ToastContext";
import ConfirmDialog from "./ConfirmDialog";

const API_URL = "/api";

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

const SchedulerSettings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTime, setNewTime] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [isUpdating, setIsUpdating] = useState(false);

  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  // Time picker state
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerUp, setTimePickerUp] = useState(false);
  const [selectedHour, setSelectedHour] = useState("00");
  const [selectedMinute, setSelectedMinute] = useState("00");
  const timePickerRef = useRef(null);

  // Dropdown state and ref
  const [timezoneDropdownOpen, setTimezoneDropdownOpen] = useState(false);
  const [timezoneDropdownUp, setTimezoneDropdownUp] = useState(false);
  const timezoneDropdownRef = useRef(null);

  // Common timezones - comprehensive list
  const timezones = [
    // UTC
    "UTC",
    // North America - US
    "America/New_York", // Eastern Time
    "America/Chicago", // Central Time
    "America/Denver", // Mountain Time
    "America/Phoenix", // Arizona (no DST)
    "America/Los_Angeles", // Pacific Time
    "America/Anchorage", // Alaska Time
    "America/Honolulu", // Hawaii Time
    "America/Boise", // Mountain Time (Idaho)
    // North America - Canada
    "America/Toronto", // Eastern Time (Canada)
    "America/Vancouver", // Pacific Time (Canada)
    "America/Edmonton", // Mountain Time (Canada)
    "America/Winnipeg", // Central Time (Canada)
    "America/Halifax", // Atlantic Time (Canada)
    "America/St_Johns", // Newfoundland Time
    // Central & South America
    "America/Mexico_City", // Mexico
    "America/Sao_Paulo", // Brazil
    "America/Buenos_Aires", // Argentina
    "America/Bogota", // Colombia
    "America/Lima", // Peru
    "America/Santiago", // Chile
    // Europe
    "Europe/London", // UK
    "Europe/Dublin", // Ireland
    "Europe/Paris", // France
    "Europe/Berlin", // Germany
    "Europe/Amsterdam", // Netherlands
    "Europe/Brussels", // Belgium
    "Europe/Madrid", // Spain
    "Europe/Rome", // Italy
    "Europe/Vienna", // Austria
    "Europe/Zurich", // Switzerland
    "Europe/Stockholm", // Sweden
    "Europe/Oslo", // Norway
    "Europe/Copenhagen", // Denmark
    "Europe/Helsinki", // Finland
    "Europe/Warsaw", // Poland
    "Europe/Prague", // Czech Republic
    "Europe/Budapest", // Hungary
    "Europe/Athens", // Greece
    "Europe/Istanbul", // Turkey
    "Europe/Moscow", // Russia (Moscow)
    // Asia
    "Asia/Dubai", // UAE
    "Asia/Kolkata", // India
    "Asia/Bangkok", // Thailand
    "Asia/Singapore", // Singapore
    "Asia/Hong_Kong", // Hong Kong
    "Asia/Shanghai", // China
    "Asia/Tokyo", // Japan
    "Asia/Seoul", // South Korea
    "Asia/Jakarta", // Indonesia
    "Asia/Manila", // Philippines
    "Asia/Taipei", // Taiwan
    // Australia & Pacific
    "Australia/Sydney", // Australia (NSW)
    "Australia/Melbourne", // Australia (VIC)
    "Australia/Brisbane", // Australia (QLD)
    "Australia/Perth", // Australia (WA)
    "Australia/Adelaide", // Australia (SA)
    "Pacific/Auckland", // New Zealand
    // Africa
    "Africa/Cairo", // Egypt
    "Africa/Johannesburg", // South Africa
    "Africa/Lagos", // Nigeria
    "Africa/Nairobi", // Kenya
  ];

  useEffect(() => {
    fetchSchedulerData();
    const interval = setInterval(fetchSchedulerData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Function to calculate dropdown position
  const calculateDropdownPosition = (ref) => {
    if (!ref.current) return false;

    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // If more space above than below, open upward
    return spaceAbove > spaceBelow;
  };

  // Click-outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        timezoneDropdownRef.current &&
        !timezoneDropdownRef.current.contains(event.target)
      ) {
        setTimezoneDropdownOpen(false);
      }
      if (
        timePickerRef.current &&
        !timePickerRef.current.contains(event.target)
      ) {
        setTimePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSchedulerData = async () => {
    try {
      const [configRes, statusRes] = await Promise.all([
        fetch(`${API_URL}/scheduler/config`),
        fetch(`${API_URL}/scheduler/status`),
      ]);

      const configData = await configRes.json();
      const statusData = await statusRes.json();

      if (configData.success) {
        setConfig(configData.config);
        setTimezone(configData.config.timezone || "Europe/Berlin");
      }

      if (statusData.success) {
        setStatus(statusData);
      }
    } catch (error) {
      console.error("Error fetching scheduler data:", error);
      showError(t("schedulerSettings.errors.loadData"));
    } finally {
      setLoading(false);
    }
  };

  // Generate hours array (00-23)
  const hours = Array.from({ length: 24 }, (_, i) =>
    i.toString().padStart(2, "0")
  );

  // Generate minutes array (00-59)
  const minutes = Array.from({ length: 60 }, (_, i) =>
    i.toString().padStart(2, "0")
  );

  // Handle time selection
  const handleTimeSelect = (hour, minute) => {
    const time = `${hour}:${minute}`;
    setNewTime(time);
    setSelectedHour(hour);
    setSelectedMinute(minute);
    setTimePickerOpen(false);
  };

  // Open time picker and set position
  const openTimePicker = () => {
    if (isUpdating) return;
    const shouldOpenUp = calculateDropdownPosition(timePickerRef);
    setTimePickerUp(shouldOpenUp);
    setTimePickerOpen(!timePickerOpen);
  };

  const toggleScheduler = async () => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      const endpoint = config.enabled ? "disable" : "enable";
      const response = await fetch(`${API_URL}/scheduler/${endpoint}`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(
          t(
            `schedulerSettings.success.scheduler${
              config.enabled ? "Disabled" : "Enabled"
            }`
          )
        );
        await fetchSchedulerData();
      } else {
        showError(data.detail || t("schedulerSettings.errors.updateScheduler"));
      }
    } catch (error) {
      console.error("Error toggling scheduler:", error);
      showError(t("schedulerSettings.errors.updateScheduler"));
    } finally {
      setIsUpdating(false);
    }
  };

  const addSchedule = async (e) => {
    e.preventDefault();

    if (!newTime) {
      showError(t("schedulerSettings.errors.enterTime"));
      return;
    }

    // Validate time format (HH:MM, 00:00-23:59)
    const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timePattern.test(newTime)) {
      showError("Invalid time format. Please use HH:MM (00:00-23:59)");
      return;
    }

    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          time: newTime,
          description: newDescription,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(t("schedulerSettings.success.scheduleAdded"));
        setNewTime("");
        setNewDescription("");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(data.detail || t("schedulerSettings.errors.addSchedule"));
      }
    } catch (error) {
      console.error("Error adding schedule:", error);
      showError(t("schedulerSettings.errors.addSchedule"));
    } finally {
      setIsUpdating(false);
    }
  };

  const removeSchedule = async (time) => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/schedule/${time}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(t("schedulerSettings.success.scheduleRemoved"));
        // Wait a moment for scheduler to update, then refresh all data
        await new Promise((resolve) => setTimeout(resolve, 200));
        await fetchSchedulerData();
      } else {
        showError(data.detail || t("schedulerSettings.errors.removeSchedule"));
      }
    } catch (error) {
      console.error("Error removing schedule:", error);
      showError(t("schedulerSettings.errors.removeSchedule"));
    } finally {
      setIsUpdating(false);
    }
  };

  const clearAllSchedules = async () => {
    setClearAllConfirm(true);
  };

  const handleClearAllConfirm = async () => {
    setClearAllConfirm(false);

    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/schedules`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        // Update status directly from response to avoid stale data
        setStatus(data);
        // Also refresh config
        const configRes = await fetch(`${API_URL}/scheduler/config`);
        const configData = await configRes.json();
        if (configData.success) {
          setConfig(configData.config);
        }
        showSuccess(t("schedulerSettings.success.allCleared"));
      } else {
        showError(data.detail || t("schedulerSettings.errors.clearSchedules"));
      }
    } catch (error) {
      console.error("Error clearing schedules:", error);
      showError(t("schedulerSettings.errors.clearSchedules"));
    } finally {
      setIsUpdating(false);
    }
  };

  const updateTimezone = async (newTimezone) => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: newTimezone }),
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(t("schedulerSettings.success.timezoneUpdated"));
        setTimezone(newTimezone);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(data.detail || t("schedulerSettings.errors.updateTimezone"));
      }
    } catch (error) {
      console.error("Error updating timezone:", error);
      showError(t("schedulerSettings.errors.updateTimezone"));
    } finally {
      setIsUpdating(false);
    }
  };

  const updateSkipIfRunning = async (value) => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip_if_running: value }),
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(
          value
            ? t("schedulerSettings.success.willSkip")
            : t("schedulerSettings.success.willAllow")
        );
        await fetchSchedulerData();
      } else {
        showError(data.detail || t("schedulerSettings.errors.updateConfig"));
      }
    } catch (error) {
      console.error("Error updating config:", error);
      showError(t("schedulerSettings.errors.updateConfig"));
    } finally {
      setIsUpdating(false);
    }
  };

  const triggerNow = async () => {
    console.log(
      "🔥 triggerNow called - isUpdating:",
      isUpdating,
      "status?.is_executing:",
      status?.is_executing,
      "config?.enabled:",
      config?.enabled
    );

    if (isUpdating) return;
    setIsUpdating(true);

    try {
      console.log("📡 Sending API request to:", `${API_URL}/scheduler/run-now`);
      const response = await fetch(`${API_URL}/scheduler/run-now`, {
        method: "POST",
      });

      console.log("Response received, status:", response.status);
      const data = await response.json();
      console.log("📦 Response data:", data);

      if (data.success) {
        console.log("Success! Showing toast and navigating...");
        showSuccess(t("schedulerSettings.success.manualRunTriggered"));

        // Update status
        fetchSchedulerData();

        const logFile = "Scriptlog.log"; // Scheduler runs use the normal script log
        console.log(`Waiting for log file: ${logFile}`);

        // Wait for log file to be created before navigating
        const logExists = await waitForLogFile(logFile);

        if (logExists) {
          console.log(`Redirecting to LogViewer with log: ${logFile}`);
          navigate("/logs", { state: { logFile: logFile } });
        } else {
          console.warn(`Log file ${logFile} not found, redirecting anyway`);
          navigate("/logs", { state: { logFile: logFile } });
        }
      } else {
        console.log("Request failed:", data.detail);
        showError(data.detail || t("schedulerSettings.errors.triggerRun"));
      }
    } catch (error) {
      console.error("💥 Error in triggerNow:", error);
      showError(t("schedulerSettings.errors.triggerRun"));
    } finally {
      console.log("🏁 Finally block - setting isUpdating to false");
      setIsUpdating(false);
    }
  };

  const restartScheduler = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/restart`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        showSuccess(t("schedulerSettings.success.schedulerRestarted"));
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(
          data.detail || t("schedulerSettings.errors.restartScheduler")
        );
      }
    } catch (error) {
      console.error("Error restarting scheduler:", error);
      showError(t("schedulerSettings.errors.restartScheduler"));
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return t("schedulerSettings.never");
    const date = new Date(isoString);
    return date.toISOString().slice(0, 19).replace("T", " ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">{t("schedulerSettings.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={clearAllConfirm}
        onClose={() => setClearAllConfirm(false)}
        onConfirm={handleClearAllConfirm}
        title={t("schedulerSettings.confirmClearAllTitle")}
        message={t("schedulerSettings.confirmClearAllMessage")}
        type="danger"
      />

      {/* Header */}
      <div className="flex items-center justify-end">
        {/* Master Toggle */}
        <button
          onClick={toggleScheduler}
          disabled={isUpdating}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all shadow-sm hover:scale-105 ${
            config?.enabled
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-theme-card hover:bg-theme-hover border border-theme hover:border-theme-primary/50 text-theme-text"
          } ${isUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isUpdating ? (
            <Loader2 className="w-5 h-5 text-theme-primary animate-spin" />
          ) : (
            <Power className="w-5 h-5" />
          )}
          {isUpdating
            ? t("schedulerSettings.updating")
            : config?.enabled
            ? t("schedulerSettings.enabled")
            : t("schedulerSettings.disabled")}
        </button>
      </div>

      {/* Container Users Info */}
      <div className="bg-blue-900/20 border-l-4 border-blue-500 rounded-lg p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">
              {t("schedulerSettings.containerUsersOnly")}
            </h3>
            <p
              className="text-sm text-blue-200 leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: t("schedulerSettings.containerUsersInfo"),
              }}
            />
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Last Run Card */}
        <div className="bg-theme-card rounded-xl shadow-sm border border-theme p-5 hover:border-theme-primary/50 transition-all">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-2">
            <Calendar className="w-4 h-4" />
            {t("schedulerSettings.lastRun")}
          </div>
          <div className="text-xl font-semibold text-theme-text">
            {formatDateTime(status?.last_run)}
          </div>
        </div>

        {/* Next Run Card */}
        <div className="bg-theme-card rounded-xl shadow-sm border border-theme p-5 hover:border-theme-primary/50 transition-all">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-2">
            <Clock className="w-4 h-4" />
            {t("schedulerSettings.nextRun")}
          </div>
          <div className="text-xl font-semibold text-theme-text">
            {formatDateTime(status?.next_run)}
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-theme-card rounded-xl shadow-sm border border-theme p-5 hover:border-theme-primary/50 transition-all">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-2">
            <Zap className="w-4 h-4" />
            Status
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                status?.is_executing
                  ? "bg-yellow-500 animate-pulse"
                  : status?.running
                  ? "bg-green-500"
                  : "bg-theme-muted"
              }`}
            />
            <span className="text-xl font-semibold text-theme-text">
              {status?.is_executing
                ? t("schedulerSettings.status.running")
                : status?.running
                ? t("schedulerSettings.status.active")
                : t("schedulerSettings.status.inactive")}
            </span>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-theme-card rounded-xl shadow-sm border border-theme p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-theme-primary/10">
            <Settings className="w-6 h-6 text-theme-primary" />
          </div>
          <h2 className="text-xl font-semibold text-theme-primary">
            {t("schedulerSettings.configuration")}
          </h2>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-theme-text mb-2">
            {t("schedulerSettings.timezone")}
          </label>
          <p className="text-xs text-theme-muted mb-2">
            {t("schedulerSettings.timezoneDescription")}
          </p>
          <div className="relative" ref={timezoneDropdownRef}>
            <button
              onClick={() => {
                if (!isUpdating) {
                  const shouldOpenUp =
                    calculateDropdownPosition(timezoneDropdownRef);
                  setTimezoneDropdownUp(shouldOpenUp);
                  setTimezoneDropdownOpen(!timezoneDropdownOpen);
                }
              }}
              disabled={isUpdating}
              className="w-full px-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-between"
            >
              <span>{timezone}</span>
              <ChevronDown
                className={`w-5 h-5 text-theme-muted transition-transform ${
                  timezoneDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {timezoneDropdownOpen && !isUpdating && (
              <div
                className={`absolute z-50 left-0 right-0 ${
                  timezoneDropdownUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl max-h-80 overflow-y-auto`}
              >
                {timezones.map((tz) => (
                  <button
                    key={tz}
                    onClick={() => {
                      updateTimezone(tz);
                      setTimezoneDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-sm transition-all text-left ${
                      timezone === tz
                        ? "bg-theme-primary text-white"
                        : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                    }`}
                  >
                    {tz}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Skip if running */}
        <div className="flex items-center justify-between p-4 bg-theme-bg rounded-lg border border-theme">
          <div>
            <label className="block text-sm font-medium text-theme-text">
              {t("schedulerSettings.skipIfRunning")}
            </label>
            <p className="text-sm text-theme-muted mt-1">
              {t("schedulerSettings.skipIfRunningDesc")}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config?.skip_if_running || false}
              onChange={(e) => updateSkipIfRunning(e.target.checked)}
              disabled={isUpdating}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-theme-primary peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-theme-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={restartScheduler}
            disabled={isUpdating || !config?.enabled}
            className="flex items-center gap-2 px-5 py-2.5 bg-theme-primary hover:bg-theme-primary/90 text-white rounded-lg transition-all shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isUpdating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            {t("schedulerSettings.restartScheduler")}
          </button>
          <button
            onClick={triggerNow}
            disabled={isUpdating || status?.is_executing || !config?.enabled}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isUpdating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            {t("schedulerSettings.runNow")}
          </button>
        </div>
      </div>

      {/* Schedules */}
      <div className="bg-theme-card rounded-xl shadow-sm border border-theme p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-theme-primary/10">
              <Clock className="w-6 h-6 text-theme-primary" />
            </div>
            <h2 className="text-xl font-semibold text-theme-primary">
              {t("schedulerSettings.schedules")}
            </h2>
          </div>
          {config?.schedules?.length > 0 && (
            <button
              onClick={clearAllSchedules}
              disabled={isUpdating}
              className="text-sm text-red-400 hover:text-red-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t("schedulerSettings.clearAll")}
            </button>
          )}
        </div>

        {/* Add Schedule Form */}
        <form
          onSubmit={addSchedule}
          className="flex flex-col md:flex-row gap-3"
        >
          {/* Custom Time Picker */}
          <div className="flex-1 relative" ref={timePickerRef}>
            <button
              type="button"
              onClick={openTimePicker}
              disabled={isUpdating}
              className="w-full px-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text hover:bg-theme-hover hover:border-theme-primary/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-between"
            >
              <span className={newTime ? "" : "text-theme-muted"}>
                {newTime || t("schedulerSettings.timePlaceholder")}
              </span>
              <Clock className="w-5 h-5 text-theme-muted" />
            </button>

            {timePickerOpen && !isUpdating && (
              <div
                className={`absolute z-50 left-0 right-0 ${
                  timePickerUp ? "bottom-full mb-2" : "top-full mt-2"
                } bg-theme-card border border-theme-primary rounded-lg shadow-xl`}
              >
                <div className="flex divide-x divide-theme">
                  {/* Hours Column */}
                  <div className="flex-1 max-h-64 overflow-y-auto">
                    <div className="sticky top-0 bg-theme-card border-b border-theme px-3 py-2 text-xs font-semibold text-theme-primary">
                      {t("schedulerSettings.hour") || "Hour"}
                    </div>
                    {hours.map((hour) => (
                      <button
                        key={hour}
                        type="button"
                        onClick={() => handleTimeSelect(hour, selectedMinute)}
                        className={`w-full px-4 py-2 text-sm transition-all text-center ${
                          selectedHour === hour
                            ? "bg-theme-primary text-white"
                            : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                        }`}
                      >
                        {hour}
                      </button>
                    ))}
                  </div>

                  {/* Minutes Column */}
                  <div className="flex-1 max-h-64 overflow-y-auto">
                    <div className="sticky top-0 bg-theme-card border-b border-theme px-3 py-2 text-xs font-semibold text-theme-primary">
                      {t("schedulerSettings.minute") || "Minute"}
                    </div>
                    {minutes.map((minute) => (
                      <button
                        key={minute}
                        type="button"
                        onClick={() => handleTimeSelect(selectedHour, minute)}
                        className={`w-full px-4 py-2 text-sm transition-all text-center ${
                          selectedMinute === minute
                            ? "bg-theme-primary text-white"
                            : "text-theme-text hover:bg-theme-hover hover:text-theme-primary"
                        }`}
                      >
                        {minute}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder={t("schedulerSettings.descriptionPlaceholder")}
            disabled={isUpdating}
            className="flex-1 px-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <button
            type="submit"
            disabled={isUpdating}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-theme-primary hover:bg-theme-primary/90 text-white rounded-lg transition-all shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isUpdating ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            {t("schedulerSettings.add")}
          </button>
        </form>

        {/* Schedule List */}
        {config?.schedules?.length > 0 ? (
          <div className="space-y-3">
            {config.schedules.map((schedule, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-theme-bg rounded-lg hover:bg-theme-hover transition-all border border-theme hover:border-theme-primary/50 group"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-theme-primary/10 group-hover:bg-theme-primary/20 transition-all">
                    <Clock className="w-5 h-5 text-theme-primary" />
                  </div>
                  <div>
                    <div className="font-semibold text-theme-text text-lg">
                      {schedule.time}
                    </div>
                    {schedule.description && (
                      <div className="text-sm text-theme-muted mt-0.5">
                        {schedule.description}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeSchedule(schedule.time)}
                  disabled={isUpdating}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t("schedulerSettings.removeSchedule")}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-theme-bg rounded-lg border border-theme">
            <Clock className="w-16 h-16 mx-auto mb-3 text-theme-muted opacity-30" />
            <p className="font-semibold text-theme-text mb-1">
              {t("schedulerSettings.noSchedulesConfigured")}
            </p>
            <p className="text-sm text-theme-muted">
              {t("schedulerSettings.addScheduleHint")}
            </p>
          </div>
        )}
      </div>

      {/* Active Jobs (Debug Info) */}
      {status?.active_jobs?.length > 0 && (
        <div className="bg-theme-primary/10 rounded-xl border border-theme-primary/30 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-theme-primary" />
            <h3 className="text-sm font-semibold text-theme-primary">
              {t("schedulerSettings.activeJobs")}
            </h3>
          </div>
          <div className="space-y-2">
            {status.active_jobs.map((job, index) => (
              <div
                key={index}
                className="text-sm text-theme-text bg-theme-card px-3 py-2 rounded-lg border border-theme"
              >
                <span className="font-medium">{job.name}</span>
                <span className="text-theme-muted">
                  {" "}
                  - {t("schedulerSettings.next")}:{" "}
                </span>
                <span className="text-theme-primary font-medium">
                  {formatDateTime(job.next_run)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulerSettings;
