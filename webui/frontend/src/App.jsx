import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ThemeProvider } from "./context/ThemeContext";
import { SidebarProvider, useSidebar } from "./context/SidebarContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import {
  DashboardLoadingProvider,
  useDashboardLoading,
} from "./context/DashboardLoadingContext";
import { ApiProvider } from "./context/ApiContext";

// Setup fetch interceptor BEFORE any other imports that might use fetch
import { setupFetchInterceptor } from "./utils/fetchInterceptor";
setupFetchInterceptor();

import ConfigEditor from "./components/ConfigEditor";
import LogViewer from "./components/LogViewer";
import Dashboard from "./components/Dashboard";
import GalleryHub from "./components/GalleryHub";
import AssetsManager from "./components/AssetsManager";
import About from "./components/About";
import HowItWorks from "./components/HowItWorks";
import AutoTriggers from "./components/AutoTriggers";
import SchedulerSettings from "./components/SchedulerSettings";
import RunModes from "./components/RunModes";
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
  const { isDashboardFullyLoaded, resetLoading } = useDashboardLoading();
  const location = useLocation();
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [hasLoggedIn, setHasLoggedIn] = useState(false);
  const hasShownStartupScreen = React.useRef(false);
  const isDashboardRoute =
    location.pathname === "/" || location.pathname === "/dashboard";

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);

    // Reset dashboard loading state when navigating away from dashboard
    if (!isDashboardRoute) {
      resetLoading();
    }
  }, [location.pathname, isDashboardRoute, resetLoading]);

  // Global scrollbar visibility management
  useEffect(() => {
    const updateScrollbarVisibility = () => {
      const hideScrollbars = localStorage.getItem("hide_scrollbars");
      const shouldHide = hideScrollbars ? JSON.parse(hideScrollbars) : false;

      console.log(
        "App.jsx: Updating scrollbar visibility, shouldHide:",
        shouldHide
      );
      console.log("App.jsx: Current body classes:", document.body.className);
      console.log(
        "App.jsx: Current html classes:",
        document.documentElement.className
      );

      if (shouldHide) {
        document.body.classList.add("hide-scrollbars");
        document.documentElement.classList.add("hide-scrollbars");
        console.log("App.jsx: Added hide-scrollbars class to body and html");
      } else {
        document.body.classList.remove("hide-scrollbars");
        document.documentElement.classList.remove("hide-scrollbars");
        console.log(
          "App.jsx: Removed hide-scrollbars class from body and html"
        );
      }

      console.log("App.jsx: New body classes:", document.body.className);
      console.log(
        "App.jsx: New html classes:",
        document.documentElement.className
      );
    };

    // Initial check
    console.log("App.jsx: Setting up scrollbar visibility management");
    updateScrollbarVisibility();

    // Listen for storage changes (including from Dashboard component)
    window.addEventListener("storage", updateScrollbarVisibility);

    // Custom event for same-window updates
    const handleScrollbarToggle = () => {
      console.log("App.jsx: Received scrollbarToggle event");
      updateScrollbarVisibility();
    };
    window.addEventListener("scrollbarToggle", handleScrollbarToggle);

    return () => {
      window.removeEventListener("storage", updateScrollbarVisibility);
      window.removeEventListener("scrollbarToggle", handleScrollbarToggle);
      // Clean up classes on unmount
      document.body.classList.remove("hide-scrollbars");
      document.documentElement.classList.remove("hide-scrollbars");
    };
  }, []);

  useEffect(() => {
    console.log("Posterizarr UI started - UI-Logger active");
    console.info(" UI logs will be saved to FrontendUI.log");

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
      // Auth is disabled, show loading screen until dashboard is fully loaded
      hasShownStartupScreen.current = true;
      setShowLoadingScreen(true);
    }
  }, [isAuthenticated, hasLoggedIn, loading, isAuthEnabled]);

  // Hide loading screen when dashboard is fully loaded (only on dashboard route)
  // OR immediately hide if we're on a non-dashboard route
  useEffect(() => {
    if (showLoadingScreen) {
      if (isDashboardRoute && isDashboardFullyLoaded) {
        // Dashboard is ready - hide loading screen
        setTimeout(() => {
          setShowLoadingScreen(false);
        }, 300);
      } else if (!isDashboardRoute) {
        // We're not on dashboard - hide loading screen immediately
        // This fixes the bug where reload on other pages causes loading screen to hang
        setShowLoadingScreen(false);
      }
    }
  }, [isDashboardRoute, isDashboardFullyLoaded, showLoadingScreen]);

  // Handle login success with loading screen
  const handleLoginSuccess = (credentials) => {
    setShowLoadingScreen(true);
    setHasLoggedIn(true);
    login(credentials);

    // Loading screen will be hidden when dashboard fully loads
    // No timeout needed - controlled by dashboard loading state
  };

  // Show loading spinner while checking auth status on initial load
  if (loading && !hasLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-theme-dark via-theme-darker to-theme-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 animate-spin text-theme-primary mx-auto mb-4" />
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
          {/* Extra padding on mobile for sidebar menu */}
          <div className="md:pt-0">
            <div className="py-4 sm:py-6 px-3 sm:px-4 lg:px-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/run-modes" element={<RunModes />} />
                <Route path="/assets-manager" element={<AssetsManager />} />
                <Route path="/asset-overview" element={<AssetOverview />} />
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
                <Route path="/auto-triggers" element={<AutoTriggers />} />
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
          <ApiProvider>
            <SidebarProvider>
              <ToastProvider>
                <DashboardLoadingProvider>
                  <AppContent />
                </DashboardLoadingProvider>
              </ToastProvider>
            </SidebarProvider>
          </ApiProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
