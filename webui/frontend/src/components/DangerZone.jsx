import React, { useState } from "react";
import { AlertTriangle, Square, Zap, Trash2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";

const API_URL = "/api";

const DangerZone = ({
  status,
  loading,
  onStatusUpdate,
  onSuccess,
  onError,
}) => {
  const [forceKillConfirm, setForceKillConfirm] = useState(false);
  const [deleteFileConfirm, setDeleteFileConfirm] = useState(false);

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

        if (onSuccess) onSuccess(message);
        if (onStatusUpdate) onStatusUpdate();
      } else {
        if (onError) onError(data.message || "Failed to stop script");
      }
    } catch (error) {
      console.error("Error stopping script:", error);
      if (onError) onError(`Error stopping script: ${error.message}`);
    }
  };

  const forceKillScript = async () => {
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

        if (onSuccess) onSuccess(message);
        if (onStatusUpdate) onStatusUpdate();
      } else {
        if (onError) onError(data.message || "Failed to force kill script");
      }
    } catch (error) {
      console.error("Error force killing script:", error);
      if (onError) onError(`Error force killing script: ${error.message}`);
    }
  };

  const deleteRunningFile = async () => {
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

        if (onError) onError(errorMessage);
        return;
      }

      const data = await response.json();

      if (data.success) {
        if (onSuccess)
          onSuccess(data.message || "Running file deleted successfully");
        if (onStatusUpdate) onStatusUpdate();
      } else {
        if (onError) onError(data.message || "Failed to delete running file");
      }
    } catch (error) {
      console.error("Error deleting running file:", error);
      if (onError) onError(`Error deleting running file: ${error.message}`);
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
          onClick={() => setForceKillConfirm(true)}
          disabled={loading || !status?.running}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-red-800 hover:bg-red-900 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-red-600 shadow-sm hover:scale-[1.02]"
        >
          <Zap className="w-5 h-5" />
          Force Kill
        </button>

        <button
          onClick={() => setDeleteFileConfirm(true)}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-orange-500 shadow-sm hover:scale-[1.02]"
        >
          <Trash2 className="w-5 h-5" />
          Delete Running File
        </button>
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={forceKillConfirm}
        onClose={() => setForceKillConfirm(false)}
        onConfirm={forceKillScript}
        title="Force Kill Script"
        message="Force kill will immediately terminate the script. This should only be used when normal stop doesn't work."
        confirmText="Force Kill"
        type="danger"
      />

      <ConfirmDialog
        isOpen={deleteFileConfirm}
        onClose={() => setDeleteFileConfirm(false)}
        onConfirm={deleteRunningFile}
        title="Delete Running File"
        message="This will delete the running.txt file. Only do this if no script is actually running."
        confirmText="Delete"
        type="warning"
      />
    </div>
  );
};

export default DangerZone;
