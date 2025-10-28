import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Custom React hook for managing WebSocket connection to dashboard updates
 *
 * Automatically:
 * - Connects to /ws/dashboard on mount
 * - Handles reconnection on connection loss
 * - Provides callbacks for different update types
 * - Cleans up on unmount
 *
 * @param {Object} callbacks - Object with callback functions
 * @param {Function} callbacks.onAssetStats - Called when asset stats update
 * @param {Function} callbacks.onRuntimeStats - Called when runtime stats update
 * @param {Function} callbacks.onSystemInfo - Called when system info updates (every 10s)
 * @param {Function} callbacks.onConnected - Called when WebSocket connects
 * @param {Function} callbacks.onDisconnected - Called when WebSocket disconnects
 * @returns {Object} - { isConnected, reconnect }
 */
export function useDashboardWebSocket(callbacks = {}) {
  const {
    onAssetStats,
    onRuntimeStats,
    onSystemInfo,
    onConnected,
    onDisconnected,
  } = callbacks;

  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectDelay = 30000; // Max 30 seconds between reconnects
  const baseReconnectDelay = 1000; // Start with 1 second

  const connect = useCallback(() => {
    // Prevent multiple connections
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    try {
      // Determine WebSocket URL (ws:// or wss://)
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;

      console.log("[DashboardWS] Connecting to:", wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[DashboardWS] ✓ Connected");
        setIsConnected(true);
        reconnectAttempts.current = 0; // Reset reconnect counter

        if (onConnected) {
          onConnected();
        }

        // Start keepalive ping every 30 seconds
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 30000);

        // Store interval for cleanup
        ws.pingInterval = pingInterval;
      };

      ws.onmessage = (event) => {
        try {
          // Handle text responses (like "pong")
          if (typeof event.data === "string" && event.data === "pong") {
            return;
          }

          const message = JSON.parse(event.data);
          console.log("[DashboardWS] Received:", message.type);

          // Route message to appropriate callback
          switch (message.type) {
            case "asset_stats":
              if (onAssetStats) {
                onAssetStats(message.data);
              }
              break;

            case "runtime_stats":
              if (onRuntimeStats) {
                onRuntimeStats(message.data);
              }
              break;

            case "system_info":
              if (onSystemInfo) {
                onSystemInfo(message.data);
              }
              break;

            default:
              console.warn("[DashboardWS] Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("[DashboardWS] Error parsing message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("[DashboardWS] Error:", error);
      };

      ws.onclose = (event) => {
        console.log(
          `[DashboardWS] Disconnected (code: ${event.code}, reason: ${event.reason})`
        );
        setIsConnected(false);

        // Clear ping interval if exists
        if (ws.pingInterval) {
          clearInterval(ws.pingInterval);
        }

        if (onDisconnected) {
          onDisconnected();
        }

        // Attempt to reconnect with exponential backoff
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttempts.current),
          maxReconnectDelay
        );

        console.log(
          `[DashboardWS] Reconnecting in ${delay}ms (attempt ${
            reconnectAttempts.current + 1
          })...`
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current += 1;
          connect();
        }, delay);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("[DashboardWS] Connection error:", error);
      setIsConnected(false);
    }
  }, [onAssetStats, onRuntimeStats, onSystemInfo, onConnected, onDisconnected]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    console.log("[DashboardWS] Manual reconnect triggered");

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Reset and connect
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      console.log("[DashboardWS] Cleaning up...");

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        // Clear ping interval
        if (wsRef.current.pingInterval) {
          clearInterval(wsRef.current.pingInterval);
        }

        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected, reconnect };
}
