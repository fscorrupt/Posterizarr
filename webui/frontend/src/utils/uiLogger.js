const API_URL = "/api";

class UILogger {
  constructor() {
    this.enabled = true;
    this.logQueue = [];
    this.maxQueueSize = 50;
    this.flushInterval = 5000; // Send logs every 5 seconds
    this.flushTimer = null;

    // Speichere Original-Console-Methoden
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
    // Überschreibe Console-Methoden
    this.interceptConsole();

    // Starte automatisches Flush
    this.startAutoFlush();

    // Cleanup bei Page-Unload
    window.addEventListener("beforeunload", () => {
      this.flush();
    });
  }

  interceptConsole() {
    const self = this;

    // console.log
    console.log = function (...args) {
      self.originalConsole.log.apply(console, args);
      self.captureLog("log", args);
    };

    // console.error
    console.error = function (...args) {
      self.originalConsole.error.apply(console, args);
      self.captureLog("error", args);
    };

    // console.warn
    console.warn = function (...args) {
      self.originalConsole.warn.apply(console, args);
      self.captureLog("warn", args);
    };

    // console.info
    console.info = function (...args) {
      self.originalConsole.info.apply(console, args);
      self.captureLog("info", args);
    };

    // console.debug (optional)
    console.debug = function (...args) {
      self.originalConsole.debug.apply(console, args);
      self.captureLog("debug", args);
    };
  }

  captureLog(level, args) {
    if (!this.enabled) return;

    try {
      // Formatiere Log-Nachricht
      const message = args
        .map((arg) => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(" ");

      // Erstelle Log-Entry
      const logEntry = {
        level: level,
        message: message,
        timestamp: new Date().toISOString(),
        source: "ui",
      };

      // Füge zu Queue hinzu
      this.logQueue.push(logEntry);

      // Flush wenn Queue voll ist
      if (this.logQueue.length >= this.maxQueueSize) {
        this.flush();
      }
    } catch (error) {
      // Fehler beim Logging nicht erneut loggen (Endlosschleife vermeiden)
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
      // Bei Fehler: Logs zurück in Queue (optional)
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
    // Stelle Original-Console wieder her
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
    console.debug = this.originalConsole.debug;

    // Stoppe Auto-Flush
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    // Final Flush
    this.flush();
  }
}

// Erstelle globale Instanz
const uiLogger = new UILogger();

// Export für React
export default uiLogger;
