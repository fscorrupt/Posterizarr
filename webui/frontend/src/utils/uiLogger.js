const API_URL = "/api";

class UILogger {
  constructor() {
    this.enabled = true;
    this.logQueue = [];
    this.maxQueueSize = 50;
    this.flushInterval = 3000; // Send logs every 3 seconds
    this.flushTimer = null;

    // Store original console methods
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
    };

    this.initialize();
  }

  initialize() {
    // Override Console methods
    this.interceptConsole();

    // Start automatic flush
    this.startAutoFlush();

    // Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      this.flush();
    });
  }

  interceptConsole() {
    const self = this;

    // console.log
    console.log = function (...args) {
      self.originalConsole.log.apply(console, args);
      self.captureLog("INFO", args);
    };

    // console.error
    console.error = function (...args) {
      self.originalConsole.error.apply(console, args);
      self.captureLog("ERROR", args);
    };

    // console.warn
    console.warn = function (...args) {
      self.originalConsole.warn.apply(console, args);
      self.captureLog("WARNING", args);
    };

    // console.info
    console.info = function (...args) {
      self.originalConsole.info.apply(console, args);
      self.captureLog("INFO", args);
    };

    // console.debug
    console.debug = function (...args) {
      self.originalConsole.debug.apply(console, args);
      self.captureLog("DEBUG", args);
    };
  }

  captureLog(level, args) {
    if (!this.enabled) return;

    try {
      // Extract component/context from first arg if it starts with [
      let component = "UI";
      let messageArgs = args;

      if (args.length > 0 && typeof args[0] === "string") {
        const firstArg = args[0];
        const componentMatch = firstArg.match(/^\[([^\]]+)\]/);
        if (componentMatch) {
          component = componentMatch[1];
          // Remove the component prefix from the message
          messageArgs = [
            firstArg.replace(/^\[[^\]]+\]\s*/, ""),
            ...args.slice(1),
          ];
        }
      }

      // Format log message
      const message = messageArgs
        .map((arg) => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg, null, 2);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" ");

      // Create log entry with server-compatible timestamp format
      // Backend uses: %Y-%m-%d %H:%M:%S
      const now = new Date();
      const timestamp =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0") +
        " " +
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0") +
        ":" +
        String(now.getSeconds()).padStart(2, "0");

      const logEntry = {
        level: level.toUpperCase(),
        message: message,
        timestamp: timestamp,
        component: component,
      };

      // Add to queue
      this.logQueue.push(logEntry);

      // Flush if queue is full
      if (this.logQueue.length >= this.maxQueueSize) {
        this.flush();
      }
    } catch (error) {
      // Avoid logging errors during logging (infinite loop)
      this.originalConsole.error("UILogger capture error:", error);
    }
  }

  startAutoFlush() {
    this.flushTimer = setInterval(() => {
      if (this.logQueue.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  async flush() {
    if (this.logQueue.length === 0) return;

    const logsToSend = [...this.logQueue];
    this.logQueue = [];

    try {
      const response = await fetch(`${API_URL}/logs/ui/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ logs: logsToSend }),
      });

      if (!response.ok) {
        this.originalConsole.warn("Failed to send UI logs to backend");
      }
    } catch (error) {
      this.originalConsole.warn("Error sending UI logs:", error);
      // On error: Put logs back in queue (optional)
      // this.logQueue.unshift(...logsToSend);
    }
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  destroy() {
    // Restore original console
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;

    // Stop auto-flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Final flush
    this.flush();
  }
}

// Create global instance
const uiLogger = new UILogger();

// Export for React
export default uiLogger;
