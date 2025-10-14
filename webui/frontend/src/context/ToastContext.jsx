import React, { createContext, useContext, useState, useCallback } from "react";
import { ToastContainer } from "../components/ToastNotification";

const ToastContext = createContext();

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message, duration = 3000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback(
    (message, duration) => addToast("success", message, duration),
    [addToast]
  );

  const showError = useCallback(
    (message, duration) => addToast("error", message, duration),
    [addToast]
  );

  const showInfo = useCallback(
    (message, duration) => addToast("info", message, duration),
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ addToast, removeToast, showSuccess, showError, showInfo }}
    >
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
