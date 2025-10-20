import React, { useState } from "react";
import { AlertTriangle, Square, Zap, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import ConfirmDialog from "./ConfirmDialog";

const API_URL = "/api";

const DangerZone = ({
  status,
  loading,
  onStatusUpdate,
  onSuccess,
  onError,
}) => {
  const { t } = useTranslation();
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
          ? t("dangerZone.stopSuccess")
          : data.message;

        if (onSuccess) onSuccess(message);
        if (onStatusUpdate) onStatusUpdate();
      } else {
        if (onError) onError(data.message || t("dangerZone.stopError"));
      }
    } catch (error) {
      console.error("Error stopping script:", error);
      if (onError) onError(t("dangerZone.stopError") + `: ${error.message}`);
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
          ? t("dangerZone.forceKillSuccess")
          : data.message;

        if (onSuccess) onSuccess(message);
        if (onStatusUpdate) onStatusUpdate();
      } else {
        if (onError) onError(data.message || t("dangerZone.forceKillError"));
      }
    } catch (error) {
      console.error("Error force killing script:", error);
      if (onError)
        onError(t("dangerZone.forceKillError") + `: ${error.message}`);
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
        if (onSuccess) onSuccess(data.message || t("dashboard.deleteSuccess"));
        if (onStatusUpdate) onStatusUpdate();
      } else {
        if (onError) onError(data.message || t("dashboard.deleteError"));
      }
    } catch (error) {
      console.error("Error deleting running file:", error);
      if (onError) onError(t("dashboard.deleteError") + `: ${error.message}`);
    }
  };

  return (
    <div className="bg-red-950/40 rounded-xl p-6 border-2 border-red-600/50 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-red-600/20">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-red-400">
            {t("dashboard.dangerZone")}
          </h2>
          <p className="text-red-200 text-sm mt-1">{t("dangerZone.warning")}</p>
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
          {t("dashboard.stop")}
        </button>

        <button
          onClick={() => setForceKillConfirm(true)}
          disabled={loading || !status?.running}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-red-800 hover:bg-red-900 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-red-600 shadow-sm hover:scale-[1.02]"
        >
          <Zap className="w-5 h-5" />
          {t("dangerZone.forceKill")}
        </button>

        <button
          onClick={() => setDeleteFileConfirm(true)}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg font-medium transition-all border border-orange-500 shadow-sm hover:scale-[1.02]"
        >
          <Trash2 className="w-5 h-5" />
          {t("dashboard.deleteRunningFile")}
        </button>
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={forceKillConfirm}
        onClose={() => setForceKillConfirm(false)}
        onConfirm={forceKillScript}
        title={t("dangerZone.forceKillTitle")}
        message={t("dangerZone.forceKillMessage")}
        confirmText={t("dangerZone.forceKill")}
        type="danger"
      />

      <ConfirmDialog
        isOpen={deleteFileConfirm}
        onClose={() => setDeleteFileConfirm(false)}
        onConfirm={deleteRunningFile}
        title={t("dashboard.deleteConfirmTitle")}
        message={t("dashboard.deleteConfirmMessage")}
        confirmText={t("common.delete")}
        type="warning"
      />
    </div>
  );
};

export default DangerZone;
