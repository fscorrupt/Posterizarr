import React from "react";
import { AlertTriangle, Square, Zap, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

const API_URL = "/api";

const DangerZone = ({ status, loading, onStatusUpdate }) => {
  const stopScript = async () => {
    try {
      const response = await fetch(`${API_URL}/stop`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        // More user-friendly message instead of "Stopped: manual"
        const message = data.message.includes("Stopped:")
          ? "Script stopped successfully"
          : data.message;

        toast.success(message, {
          duration: 3000,
          position: "top-right",
        });
        if (onStatusUpdate) onStatusUpdate();
      } else {
        toast.error(data.message || "Failed to stop script", {
          duration: 4000,
          position: "top-right",
        });
      }
    } catch (error) {
      console.error("Error stopping script:", error);
      toast.error(`Error stopping script: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    }
  };

  const forceKillScript = async () => {
    if (
      !window.confirm(
        "⚠️ Force kill will immediately terminate the script. Continue?"
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/force-kill`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        // More user-friendly message instead of "Force killed: manual"
        const message = data.message.includes("Force killed:")
          ? "Script force killed successfully"
          : data.message;

        toast.success(message, {
          duration: 3000,
          position: "top-right",
        });
        if (onStatusUpdate) onStatusUpdate();
      } else {
        toast.error(data.message || "Failed to force kill script", {
          duration: 4000,
          position: "top-right",
        });
      }
    } catch (error) {
      console.error("Error force killing script:", error);
      toast.error(`Error force killing script: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    }
  };

  const deleteRunningFile = async () => {
    if (
      !window.confirm(
        "⚠️ This will delete the running.txt file. Only do this if no script is actually running. Continue?"
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/running-file`, {
        method: "DELETE",
      });

      if (!response.ok) {
        let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          // JSON parsing failed
        }

        toast.error(errorMessage, {
          duration: 5000,
          position: "top-right",
        });
        return;
      }

      const data = await response.json();

      if (data.success) {
        toast.success(data.message || "Running file deleted successfully", {
          duration: 3000,
          position: "top-right",
        });
        if (onStatusUpdate) onStatusUpdate();
      } else {
        toast.error(data.message || "Failed to delete running file", {
          duration: 4000,
          position: "top-right",
        });
      }
    } catch (error) {
      console.error("Error deleting running file:", error);
      toast.error(`Error deleting running file: ${error.message}`, {
        duration: 5000,
        position: "top-right",
      });
    }
  };

  return (
    <div className="bg-red-950/40 rounded-xl p-6 border-2 border-red-600/50 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-red-600/20">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>
          <p className="text-red-200 text-sm mt-1">
            These actions are potentially destructive
          </p>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={stopScript}
          disabled={loading || !status?.running}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-red-500 shadow-sm hover:scale-[1.02]"
        >
          <Square className="w-5 h-5" />
          Stop Script
        </button>

        <button
          onClick={forceKillScript}
          disabled={loading || !status?.running}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-red-800 hover:bg-red-900 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-red-600 shadow-sm hover:scale-[1.02]"
        >
          <Zap className="w-5 h-5" />
          Force Kill
        </button>

        <button
          onClick={deleteRunningFile}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-orange-500 shadow-sm hover:scale-[1.02]"
        >
          <Trash2 className="w-5 h-5" />
          Delete Running File
        </button>
      </div>
    </div>
  );
};

export default DangerZone;
