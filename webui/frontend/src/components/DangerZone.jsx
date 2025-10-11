import React from "react";
import { AlertTriangle, Square, Zap, Trash2 } from "lucide-react";

const API_URL = "/api";

const DangerZone = ({ status, loading, onStatusUpdate }) => {
  const stopScript = async () => {
    try {
      const response = await fetch(`${API_URL}/stop`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        if (onStatusUpdate) onStatusUpdate();
      }
    } catch (error) {
      console.error("Error stopping script:", error);
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
        if (onStatusUpdate) onStatusUpdate();
      }
    } catch (error) {
      console.error("Error force killing script:", error);
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
      const response = await fetch(`${API_URL}/delete-running-file`, {
        method: "POST",
      });

      const data = await response.json();

      if (data.success) {
        if (onStatusUpdate) onStatusUpdate();
      }
    } catch (error) {
      console.error("Error deleting running file:", error);
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
