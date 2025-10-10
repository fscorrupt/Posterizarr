import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import ConfigEditor from "./components/ConfigEditor";
import LogViewer from "./components/LogViewer";
import Dashboard from "./components/Dashboard";
import GalleryHub from "./components/GalleryHub";
import TestGallery from "./components/TestGallery";
import About from "./components/About";
import SchedulerSettings from "./components/SchedulerSettings";
import RunModes from "./components/RunModes";
import Sidebar from "./components/Sidebar";
import TopNavbar from "./components/TopNavbar";

// ============================================================================
// UI-LOGGER IMPORT - Erfasst alle Console-Logs und speichert sie in UIlog.log
// ============================================================================
import uiLogger from "./utils/uiLogger";

function AppContent() {
  // ============================================================================
  // UI-LOGGER INITIALISIERUNG
  // Alle console.log/error/warn werden automatisch in UIlog.log gespeichert
  // ============================================================================
  useEffect(() => {
    console.log("✅ Posterizarr UI started - UI-Logger active");
    console.info("📊 UI logs will be saved to UIlog.log");

    // Cleanup (optional, nur bei App-Unmount)
    return () => {
      // uiLogger.destroy(); // Nur aktivieren wenn wirklich nötig
    };
  }, []);

  return (
    <div className="min-h-screen bg-theme-dark text-theme-text">
      <TopNavbar />
      <Sidebar />

      <main className="pt-16 md:ml-64 transition-all duration-300">
        {/* Mobile: pt-30 (top-navbar + sidebar-header), Desktop: pt-16 (nur top-navbar) + ml-64 (sidebar) */}
        <div className="md:pt-0 pt-14">
          {/* Content ohne max-width, damit es linksbündig ist */}
          <div className="py-6 px-4 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/run-modes" element={<RunModes />} />
              <Route path="/test-gallery" element={<TestGallery />} />

              {/* Gallery Routes mit Subtabs */}
              <Route
                path="/gallery"
                element={<Navigate to="/gallery/posters" replace />}
              />
              <Route path="/gallery/posters" element={<GalleryHub />} />
              <Route path="/gallery/backgrounds" element={<GalleryHub />} />
              <Route path="/gallery/seasons" element={<GalleryHub />} />
              <Route path="/gallery/titlecards" element={<GalleryHub />} />

              {/* Config Routes mit Subtabs */}
              <Route
                path="/config"
                element={<Navigate to="/config/webui" replace />}
              />
              <Route path="/config/webui" element={<ConfigEditor />} />
              <Route path="/config/general" element={<ConfigEditor />} />
              <Route path="/config/services" element={<ConfigEditor />} />
              <Route path="/config/api" element={<ConfigEditor />} />
              <Route path="/config/languages" element={<ConfigEditor />} />
              <Route path="/config/visuals" element={<ConfigEditor />} />
              <Route path="/config/overlays" element={<ConfigEditor />} />
              <Route path="/config/collections" element={<ConfigEditor />} />
              <Route path="/config/notifications" element={<ConfigEditor />} />

              <Route path="/scheduler" element={<SchedulerSettings />} />
              <Route path="/logs" element={<LogViewer />} />
              <Route path="/about" element={<About />} />
            </Routes>
          </div>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}

export default App;
