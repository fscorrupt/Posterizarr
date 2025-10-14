import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
        console.log(
          `✅ Log file ${logFileName} exists after ${i + 1} attempts`
        );
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
    `⚠️ Log file ${logFileName} not found after ${maxAttempts} attempts`
  );
  return false;
};

const SchedulerSettings = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTime, setNewTime] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [isUpdating, setIsUpdating] = useState(false);

  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  // Common timezones
  const timezones = [
    "Europe/Berlin",
    "Europe/London",
    "Europe/Paris",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
    "UTC",
  ];

  useEffect(() => {
    fetchSchedulerData();
    const interval = setInterval(fetchSchedulerData, 30000);
    return () => clearInterval(interval);
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
      showError("Failed to load scheduler data");
    } finally {
      setLoading(false);
    }
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
        showSuccess(`Scheduler ${config.enabled ? "disabled" : "enabled"}`);
        await fetchSchedulerData();
      } else {
        showError(data.detail || "Failed to update scheduler");
      }
    } catch (error) {
      console.error("Error toggling scheduler:", error);
      showError("Failed to update scheduler");
    } finally {
      setIsUpdating(false);
    }
  };

  const addSchedule = async (e) => {
    e.preventDefault();

    if (!newTime) {
      showError("Please enter a time");
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
        showSuccess("Schedule added");
        setNewTime("");
        setNewDescription("");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(data.detail || "Failed to add schedule");
      }
    } catch (error) {
      console.error("Error adding schedule:", error);
      showError("Failed to add schedule");
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
        showSuccess("Schedule removed");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(data.detail || "Failed to remove schedule");
      }
    } catch (error) {
      console.error("Error removing schedule:", error);
      showError("Failed to remove schedule");
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
        showSuccess("All schedules cleared");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(data.detail || "Failed to clear schedules");
      }
    } catch (error) {
      console.error("Error clearing schedules:", error);
      showError("Failed to clear schedules");
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
        showSuccess("Timezone updated");
        setTimezone(newTimezone);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(data.detail || "Failed to update timezone");
      }
    } catch (error) {
      console.error("Error updating timezone:", error);
      showError("Failed to update timezone");
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
          value ? "Will skip if already running" : "Will allow concurrent runs"
        );
        await fetchSchedulerData();
      } else {
        showError(data.detail || "Failed to update configuration");
      }
    } catch (error) {
      console.error("Error updating config:", error);
      showError("Failed to update configuration");
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

      console.log("📥 Response received, status:", response.status);
      const data = await response.json();
      console.log("📦 Response data:", data);

      if (data.success) {
        console.log("✅ Success! Showing toast and navigating...");
        showSuccess("Manual run triggered");

        // Update status
        fetchSchedulerData();

        const logFile = "Scriptlog.log"; // Scheduler runs use the normal script log
        console.log(`🎯 Waiting for log file: ${logFile}`);

        // Wait for log file to be created before navigating
        const logExists = await waitForLogFile(logFile);

        if (logExists) {
          console.log(`🎯 Redirecting to LogViewer with log: ${logFile}`);
          navigate("/logs", { state: { logFile: logFile } });
        } else {
          console.warn(`⚠️ Log file ${logFile} not found, redirecting anyway`);
          navigate("/logs", { state: { logFile: logFile } });
        }
      } else {
        console.log("❌ Request failed:", data.detail);
        showError(data.detail || "Failed to trigger run");
      }
    } catch (error) {
      console.error("💥 Error in triggerNow:", error);
      showError("Failed to trigger run");
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
        showSuccess("Scheduler restarted");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        showError(data.detail || "Failed to restart scheduler");
      }
    } catch (error) {
      console.error("Error restarting scheduler:", error);
      showError("Failed to restart scheduler");
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return "Never";
    const date = new Date(isoString);
    return date.toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-theme-primary mx-auto mb-4" />
          <p className="text-theme-muted">Loading scheduler settings...</p>
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
        title="Clear All Schedules"
        message="Are you sure you want to clear all schedules? This cannot be undone."
        type="danger"
      />

      {/* Header */}
      <div className="flex items-center justify-end">
        {/* Master Toggle */}
        <button
          onClick={toggleScheduler}
          disabled={isUpdating}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all shadow-lg hover:scale-105 ${
            config?.enabled
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-theme-card hover:bg-theme-hover text-theme-text border border-theme"
          } ${isUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isUpdating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Power className="w-5 h-5" />
          )}
          {isUpdating
            ? "Updating..."
            : config?.enabled
            ? "Enabled"
            : "Disabled"}
        </button>
      </div>

      {/* Container Users Info */}
      <div className="bg-blue-900/20 border-l-4 border-blue-500 rounded-lg p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">
              Container Users Only
            </h3>
            <p className="text-sm text-blue-200 leading-relaxed">
              Please use only one scheduling option. Either use the runtime
              environment variable{" "}
              <code className="px-1.5 py-0.5 bg-theme-card rounded text-xs font-mono border border-theme">
                RUN_TIME
              </code>{" "}
              for scheduling, or use the UI schedules. If you prefer to use the
              UI schedules, set the environment variable to{" "}
              <code className="px-1.5 py-0.5 bg-theme-card rounded text-xs font-mono border border-theme">
                disabled
              </code>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Last Run Card */}
        <div className="bg-theme-card rounded-xl shadow-sm border border-theme p-5 hover:border-theme-primary/50 transition-all">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-2">
            <Calendar className="w-4 h-4" />
            Last Run
          </div>
          <div className="text-xl font-semibold text-theme-text">
            {formatDateTime(status?.last_run)}
          </div>
        </div>

        {/* Next Run Card */}
        <div className="bg-theme-card rounded-xl shadow-sm border border-theme p-5 hover:border-theme-primary/50 transition-all">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-2">
            <Clock className="w-4 h-4" />
            Next Run
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
                ? "Running"
                : status?.running
                ? "Active"
                : "Inactive"}
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
            Configuration
          </h2>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-theme-text mb-2">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => updateTimezone(e.target.value)}
            disabled={isUpdating}
            className="w-full px-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Skip if running */}
        <div className="flex items-center justify-between p-4 bg-theme-bg rounded-lg border border-theme">
          <div>
            <label className="block text-sm font-medium text-theme-text">
              Skip scheduled runs if already running
            </label>
            <p className="text-sm text-theme-muted mt-1">
              Prevents overlapping executions
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
            Restart Scheduler
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
            Run Now
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
              Schedules
            </h2>
          </div>
          {config?.schedules?.length > 0 && (
            <button
              onClick={clearAllSchedules}
              disabled={isUpdating}
              className="text-sm text-red-400 hover:text-red-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Add Schedule Form */}
        <form
          onSubmit={addSchedule}
          className="flex flex-col md:flex-row gap-3"
        >
          <input
            type="text"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="HH:MM (e.g., 14:30)"
            disabled={isUpdating}
            className="flex-1 px-4 py-3 bg-theme-bg border border-theme rounded-lg text-theme-text placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            pattern="[0-2]?[0-9]:[0-5][0-9]"
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
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
            Add
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
                  title="Remove schedule"
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
              No schedules configured
            </p>
            <p className="text-sm text-theme-muted">
              Add a schedule above to get started
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
              Active Jobs
            </h3>
          </div>
          <div className="space-y-2">
            {status.active_jobs.map((job, index) => (
              <div
                key={index}
                className="text-sm text-theme-text bg-theme-card px-3 py-2 rounded-lg border border-theme"
              >
                <span className="font-medium">{job.name}</span>
                <span className="text-theme-muted"> - Next: </span>
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
