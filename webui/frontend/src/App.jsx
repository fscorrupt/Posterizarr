import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { SidebarProvider, useSidebar } from "./context/SidebarContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";

// Setup fetch interceptor BEFORE any other imports that might use fetch
import { setupFetchInterceptor } from "./utils/fetchInterceptor";
setupFetchInterceptor();

import ConfigEditor from "./components/ConfigEditor";
import LogViewer from "./components/LogViewer";
import Dashboard from "./components/Dashboard";
import GalleryHub from "./components/GalleryHub";
import TestGallery from "./components/TestGallery";
import About from "./components/About";
import HowItWorks from "./components/HowItWorks";
import SchedulerSettings from "./components/SchedulerSettings";
import RunModes from "./components/RunModes";
import OverlayAssets from "./components/OverlayAssets";
import AssetOverview from "./components/AssetOverview";
import RuntimeHistory from "./components/RuntimeHistory";
import Sidebar from "./components/Sidebar";
import TopNavbar from "./components/TopNavbar";
import LoginScreen from "./components/LoginScreen";
import LoadingScreen from "./components/LoadingScreen";

import uiLogger from "./utils/uiLogger";

function AppContent() {
  const { isCollapsed } = useSidebar();
  const { isAuthenticated, loading, login, isAuthEnabled } = useAuth();
  const location = useLocation();
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [hasLoggedIn, setHasLoggedIn] = useState(false);
  const hasShownStartupScreen = React.useRef(false);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    console.log("✅ Posterizarr UI started - UI-Logger active");
    console.info("📊 UI logs will be saved to FrontendUI.log");

    return () => {
      // uiLogger.destroy();
    };
  }, []);

  // Show loading screen when authenticated without login (auth disabled on startup)
  // This provides a smooth experience even when auth is not required
  useEffect(() => {
    if (
      isAuthenticated &&
      !hasLoggedIn &&
      !loading &&
      isAuthEnabled === false &&
      !hasShownStartupScreen.current
    ) {
      // Auth is disabled, show loading screen briefly for smooth startup
      hasShownStartupScreen.current = true;
      setShowLoadingScreen(true);
      setTimeout(() => {
        setShowLoadingScreen(false);
      }, 1500); // Shorter duration when no auth
    }
  }, [isAuthenticated, hasLoggedIn, loading, isAuthEnabled]);

  // Handle login success with loading screen
  const handleLoginSuccess = (credentials) => {
    setShowLoadingScreen(true);
    setHasLoggedIn(true);
    login(credentials);

    // Show loading screen for 2-3 seconds while UI loads in background
    setTimeout(() => {
      setShowLoadingScreen(false);
    }, 2500);
  };

  // Show loading spinner while checking auth status on initial load
  if (loading && !hasLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-theme-dark via-theme-darker to-theme-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-theme-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-theme-muted">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if auth is required and user is not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Show main app if authenticated (or auth is disabled)
  // When showLoadingScreen is true, render the UI but overlay the loading screen
  return (
    <>
      {/* Loading Screen Overlay - shown over the UI during login transition */}
      {showLoadingScreen && (
        <div className="fixed inset-0 z-[9999] bg-theme-bg">
          <LoadingScreen />
        </div>
      )}

      {/* Main App - rendered in background while loading screen is shown */}
      <div className="min-h-screen bg-gradient-to-br from-theme-dark via-theme-darker to-theme-dark text-theme-text">
        <TopNavbar />
        <Sidebar />

        <main
          className={`pt-16 transition-all duration-300 ${
            isCollapsed ? "md:ml-20" : "md:ml-64"
          }`}
        >
          <div className="md:pt-0 pt-14">
            <div className="py-6 px-4 sm:px-6 lg:px-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/run-modes" element={<RunModes />} />
                <Route path="/overlay-assets" element={<OverlayAssets />} />
                <Route path="/asset-overview" element={<AssetOverview />} />
                <Route path="/test-gallery" element={<TestGallery />} />
                <Route path="/runtime-history" element={<RuntimeHistory />} />

                <Route
                  path="/gallery"
                  element={<Navigate to="/gallery/posters" replace />}
                />
                <Route path="/gallery/posters" element={<GalleryHub />} />
                <Route path="/gallery/backgrounds" element={<GalleryHub />} />
                <Route path="/gallery/seasons" element={<GalleryHub />} />
                <Route path="/gallery/titlecards" element={<GalleryHub />} />

                <Route
                  path="/config"
                  element={<Navigate to="/config/general" replace />}
                />
                <Route
                  path="/config/webui"
                  element={<ConfigEditor tab="WebUI" />}
                />
                <Route
                  path="/config/general"
                  element={<ConfigEditor tab="General" />}
                />
                <Route
                  path="/config/services"
                  element={<ConfigEditor tab="Services" />}
                />
                <Route
                  path="/config/api"
                  element={<ConfigEditor tab="API" />}
                />
                <Route
                  path="/config/languages"
                  element={<ConfigEditor tab="Languages" />}
                />
                <Route
                  path="/config/visuals"
                  element={<ConfigEditor tab="Visuals" />}
                />
                <Route
                  path="/config/overlays"
                  element={<ConfigEditor tab="Overlays" />}
                />
                <Route
                  path="/config/collections"
                  element={<ConfigEditor tab="Collections" />}
                />
                <Route
                  path="/config/notifications"
                  element={<ConfigEditor tab="Notifications" />}
                />

                <Route path="/scheduler" element={<SchedulerSettings />} />
                <Route path="/logs" element={<LogViewer />} />
                <Route path="/how-it-works" element={<HowItWorks />} />
                <Route path="/about" element={<About />} />
              </Routes>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <SidebarProvider>
            <ToastProvider>
              <AppContent />
            </ToastProvider>
          </SidebarProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
