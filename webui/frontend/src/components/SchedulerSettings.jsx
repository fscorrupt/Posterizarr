import React, { useState, useEffect } from "react";
import {
  Clock,
  Plus,
  Trash2,
  Power,
  RefreshCw,
  Play,
  Calendar,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const API_URL = "/api";

const SchedulerSettings = () => {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTime, setNewTime] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [timezone, setTimezone] = useState("Europe/Berlin");
  const [isUpdating, setIsUpdating] = useState(false);

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
    // Refresh status every 30 seconds
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
      toast.error("Failed to load scheduler data");
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
        toast.success(
          config.enabled ? "Scheduler disabled" : "Scheduler enabled"
        );
        // Wait a bit for the backend to fully process
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        toast.error(data.detail || "Failed to toggle scheduler");
      }
    } catch (error) {
      console.error("Error toggling scheduler:", error);
      toast.error("Failed to toggle scheduler");
    } finally {
      setIsUpdating(false);
    }
  };

  const addSchedule = async (e) => {
    e.preventDefault();

    if (!newTime) {
      toast.error("Please enter a time");
      return;
    }

    // Validate time format (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(newTime)) {
      toast.error("Invalid time format. Use HH:MM (e.g., 14:30)");
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
        toast.success(`Schedule added: ${newTime}`);
        setNewTime("");
        setNewDescription("");
        // Wait a bit for the backend to fully process
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        toast.error(data.detail || "Failed to add schedule");
      }
    } catch (error) {
      console.error("Error adding schedule:", error);
      toast.error("Failed to add schedule");
    } finally {
      setIsUpdating(false);
    }
  };

  const removeSchedule = async (time) => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(
        `${API_URL}/scheduler/schedule/${encodeURIComponent(time)}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (data.success) {
        toast.success(`Schedule removed: ${time}`);
        // Wait a bit for the backend to fully process
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        toast.error(data.detail || "Failed to remove schedule");
      }
    } catch (error) {
      console.error("Error removing schedule:", error);
      toast.error("Failed to remove schedule");
    } finally {
      setIsUpdating(false);
    }
  };

  const clearAllSchedules = async () => {
    if (!confirm("Are you sure you want to remove all schedules?")) {
      return;
    }

    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/schedules`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("All schedules cleared");
        // Wait a bit for the backend to fully process
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        toast.error(data.detail || "Failed to clear schedules");
      }
    } catch (error) {
      console.error("Error clearing schedules:", error);
      toast.error("Failed to clear schedules");
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
        toast.success("Timezone updated");
        setTimezone(newTimezone);
        // Wait a bit for the backend to fully process
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        toast.error(data.detail || "Failed to update timezone");
      }
    } catch (error) {
      console.error("Error updating timezone:", error);
      toast.error("Failed to update timezone");
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
        toast.success(
          value ? "Will skip if already running" : "Will allow concurrent runs"
        );
        await fetchSchedulerData();
      } else {
        toast.error(data.detail || "Failed to update configuration");
      }
    } catch (error) {
      console.error("Error updating config:", error);
      toast.error("Failed to update configuration");
    } finally {
      setIsUpdating(false);
    }
  };

  const triggerNow = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      const response = await fetch(`${API_URL}/scheduler/run-now`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Manual run triggered");
        // Refresh status to show execution
        setTimeout(() => fetchSchedulerData(), 1000);
      } else {
        toast.error(data.detail || "Failed to trigger run");
      }
    } catch (error) {
      console.error("Error triggering run:", error);
      toast.error("Failed to trigger run");
    } finally {
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
        toast.success("Scheduler restarted");
        // Wait a bit for the backend to fully process
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchSchedulerData();
      } else {
        toast.error(data.detail || "Failed to restart scheduler");
      }
    } catch (error) {
      console.error("Error restarting scheduler:", error);
      toast.error("Failed to restart scheduler");
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-theme-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-theme-primary flex items-center gap-2">
            <Clock className="w-8 h-8" />
            Scheduler Settings
          </h1>
          <p className="text-theme-muted mt-1">
            Automate Posterizarr runs in normal mode
          </p>
        </div>

        {/* Master Toggle */}
        <button
          onClick={toggleScheduler}
          disabled={isUpdating}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
            config?.enabled
              ? "bg-green-500 hover:bg-green-600 text-white shadow-lg"
              : "bg-theme-card hover:bg-theme-hover text-theme-text border border-theme"
          } ${isUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Power className={`w-5 h-5 ${isUpdating ? "animate-spin" : ""}`} />
          {isUpdating
            ? "Updating..."
            : config?.enabled
            ? "Enabled"
            : "Disabled"}
        </button>
      </div>

      {/* Container Users Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-500 mb-1">
              Container Users Only
            </h3>
            <p className="text-sm text-theme-text leading-relaxed">
              Please use only one scheduling option. Either use the runtime
              environment variable{" "}
              <code className="px-1.5 py-0.5 bg-theme-hover rounded text-xs font-mono">
                RUN_TIME
              </code>{" "}
              for scheduling, or use the UI schedules. If you prefer to use the
              UI schedules, set the environment variable to{" "}
              <code className="px-1.5 py-0.5 bg-theme-hover rounded text-xs font-mono">
                disabled
              </code>
              . By default, the container uses the{" "}
              <code className="px-1.5 py-0.5 bg-theme-hover rounded text-xs font-mono">
                RUN_TIME
              </code>{" "}
              variable for scheduling.
            </p>
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-4">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-1">
            <Calendar className="w-4 h-4" />
            Last Run
          </div>
          <div className="text-lg font-semibold text-theme-text">
            {formatDateTime(status?.last_run)}
          </div>
        </div>

        <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-4">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-1">
            <Clock className="w-4 h-4" />
            Next Run
          </div>
          <div className="text-lg font-semibold text-theme-text">
            {formatDateTime(status?.next_run)}
          </div>
        </div>

        <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-4">
          <div className="flex items-center gap-2 text-sm text-theme-muted mb-1">
            <AlertCircle className="w-4 h-4" />
            Status
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                status?.is_executing
                  ? "bg-yellow-500 animate-pulse"
                  : status?.running
                  ? "bg-green-500"
                  : "bg-theme-muted"
              }`}
            />
            <span className="text-lg font-semibold text-theme-text">
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
      <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-6 space-y-4">
        <h2 className="text-xl font-semibold text-theme-primary">
          Configuration
        </h2>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-theme-text mb-2">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => updateTimezone(e.target.value)}
            disabled={isUpdating}
            className="w-full px-4 py-2 bg-theme-card border border-theme-primary rounded-lg text-theme-text focus:ring-2 focus:ring-theme-primary focus:border-transparent disabled:opacity-50"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Skip if running */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-theme-text">
              Skip scheduled runs if already running
            </label>
            <p className="text-sm text-theme-muted">
              Prevents overlapping executions
            </p>
          </div>
          <button
            onClick={() => updateSkipIfRunning(!config?.skip_if_running)}
            disabled={isUpdating}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config?.skip_if_running ? "bg-theme-primary" : "bg-theme-muted"
            } ${isUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config?.skip_if_running ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={restartScheduler}
            disabled={isUpdating || !config?.enabled}
            className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 text-white rounded-lg transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`}
            />
            Restart Scheduler
          </button>
          <button
            onClick={triggerNow}
            disabled={isUpdating || status?.is_executing || !config?.enabled}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            <Play className="w-4 h-4" />
            Run Now
          </button>
        </div>
      </div>

      {/* Schedules */}
      <div className="bg-theme-card rounded-lg shadow-sm border border-theme p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-theme-primary">
            Schedules
          </h2>
          {config?.schedules?.length > 0 && (
            <button
              onClick={clearAllSchedules}
              disabled={isUpdating}
              className="text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Add Schedule Form */}
        <form onSubmit={addSchedule} className="flex gap-2">
          <input
            type="text"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="HH:MM (e.g., 14:30)"
            disabled={isUpdating}
            className="flex-1 px-4 py-2 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:ring-2 focus:ring-theme-primary focus:border-transparent disabled:opacity-50"
            pattern="[0-2]?[0-9]:[0-5][0-9]"
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            disabled={isUpdating}
            className="flex-1 px-4 py-2 bg-theme-card border border-theme-primary rounded-lg text-theme-text placeholder-theme-muted focus:ring-2 focus:ring-theme-primary focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 text-white rounded-lg transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>

        {/* Schedule List */}
        {config?.schedules?.length > 0 ? (
          <div className="space-y-2">
            {config.schedules.map((schedule, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-theme-hover rounded-lg hover:bg-theme-hover/80 transition-colors border border-theme"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-theme-primary" />
                  <div>
                    <div className="font-medium text-theme-text">
                      {schedule.time}
                    </div>
                    {schedule.description && (
                      <div className="text-sm text-theme-muted">
                        {schedule.description}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeSchedule(schedule.time)}
                  disabled={isUpdating}
                  className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remove schedule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-theme-muted">
            <Clock className="w-12 h-12 mx-auto mb-2 text-theme-muted opacity-30" />
            <p className="font-medium">No schedules configured</p>
            <p className="text-sm">Add a schedule above to get started</p>
          </div>
        )}
      </div>

      {/* Active Jobs (Debug Info) */}
      {status?.active_jobs?.length > 0 && (
        <div className="bg-theme-primary/10 rounded-lg border border-theme-primary/30 p-4">
          <h3 className="text-sm font-medium text-theme-primary mb-2">
            Active Jobs
          </h3>
          <div className="space-y-1">
            {status.active_jobs.map((job, index) => (
              <div key={index} className="text-sm text-theme-text">
                {job.name} - Next: {formatDateTime(job.next_run)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulerSettings;
