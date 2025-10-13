import React, { useEffect } from "react";
import { AlertCircle, CheckCircle, X, Info } from "lucide-react";

/**
 * Notification Component
 * A reusable notification component that can display success, error, or info messages
 * with auto-dismiss functionality
 */
const Notification = ({ type = "info", message, onClose, duration = 2000 }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        if (onClose) onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!message) return null;

  const styles = {
    success: {
      bg: "bg-green-500/10",
      border: "border-green-500",
      icon: (
        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
      ),
      titleColor: "text-green-500",
      textColor: "text-green-400",
      closeColor: "text-green-400 hover:text-green-300",
      title: "Success",
    },
    error: {
      bg: "bg-red-500/10",
      border: "border-red-500",
      icon: (
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      ),
      titleColor: "text-red-500",
      textColor: "text-red-400",
      closeColor: "text-red-400 hover:text-red-300",
      title: "Error",
    },
    info: {
      bg: "bg-blue-500/10",
      border: "border-blue-500",
      icon: <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />,
      titleColor: "text-blue-500",
      textColor: "text-blue-400",
      closeColor: "text-blue-400 hover:text-blue-300",
      title: "Info",
    },
  };

  const style = styles[type] || styles.info;

  return (
    <div
      className={`mb-6 ${style.bg} border ${style.border} rounded-lg p-4 flex items-start gap-3 animate-slideIn`}
    >
      {style.icon}
      <div className="flex-1">
        <p className={`${style.titleColor} font-medium`}>{style.title}</p>
        <p className={`${style.textColor} text-sm mt-1`}>{message}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className={style.closeColor}>
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default Notification;
