import React, { useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import ConfigEditor from "./components/ConfigEditor";
import LogViewer from "./components/LogViewer";
import Dashboard from "./components/Dashboard";
import Gallery from "./components/Gallery";
import TestGallery from "./components/TestGallery";
import BackgroundsGallery from "./components/BackgroundsGallery";
import SeasonGallery from "./components/SeasonGallery";
import EpisodeGallery from "./components/EpisodeGallery";
import {
  Menu,
  Settings,
  Image,
  FileText,
  Activity,
  TestTube,
  Palette,
  Film,
  Tv,
} from "lucide-react";

function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-theme-hover hover:text-white transition-colors"
        title="Change Theme"
      >
        <Palette className="w-4 h-4" />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-48 rounded-lg bg-theme-card border border-theme shadow-lg z-50">
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-semibold text-theme-muted uppercase tracking-wider">
                Select Theme
              </div>
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    theme === t.id
                      ? "bg-theme-primary text-white"
                      : "text-theme-text hover:bg-theme-hover"
                  }`}
                >
                  <span>{t.name}</span>
                  <span
                    className="w-4 h-4 rounded-full border-2 border-white/30"
                    style={{ backgroundColor: t.color }}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Navigation() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [uiVersion, setUiVersion] = useState(null);

  // Fetch UI version on mount
  React.useEffect(() => {
    const fetchUIVersion = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/version-ui");
        if (response.ok) {
          const data = await response.json();
          if (data.version) {
            setUiVersion(data.version);
          }
        }
      } catch (error) {
        console.error("Error fetching UI version:", error);
      }
    };
    fetchUIVersion();
  }, []);

  const navItems = [
    { path: "/", icon: Activity, label: "Dashboard" },
    { path: "/test-gallery", icon: Image, label: "Test Gallery" },
    { path: "/gallery", icon: Image, label: "Posters" },
    { path: "/backgrounds", icon: Image, label: "Backgrounds" },
    { path: "/seasons", icon: Film, label: "Seasons" },
    { path: "/episodes", icon: Tv, label: "TitleCards" },
    { path: "/config", icon: Settings, label: "Config" },
    { path: "/logs", icon: FileText, label: "Logs" },
  ];

  return (
    <nav className="bg-theme-card border-b border-theme">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-2xl font-bold text-theme-primary">
                Posterizarr
              </h1>
              {uiVersion && (
                <span
                  style={{ marginTop: 0.5 + "em" }}
                  className="ml-2 px-2 py-0.5 text-[10px] font-medium bg-theme-accent text-white rounded-full"
                >
                  v{uiVersion}
                </span>
              )}
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-theme-primary text-white"
                          : "text-gray-300 hover:bg-theme-hover hover:text-white"
                      }`}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Desktop Theme Switcher */}
          <div className="hidden md:flex items-center">
            <ThemeSwitcher />
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-400 hover:text-white p-2"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-theme-card border-t border-theme">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-3 py-2 rounded-md text-base font-medium ${
                    isActive
                      ? "bg-theme-primary text-white"
                      : "text-gray-300 hover:bg-theme-hover hover:text-white"
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile Theme Switcher */}
          <div className="px-2 pb-3 border-t border-theme">
            <div className="pt-3">
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function AppContent() {
  return (
    <div className="min-h-screen bg-theme-dark text-theme-text">
      <Navigation />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/test-gallery" element={<TestGallery />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/backgrounds" element={<BackgroundsGallery />} />
          <Route path="/seasons" element={<SeasonGallery />} />
          <Route path="/episodes" element={<EpisodeGallery />} />
          <Route path="/config" element={<ConfigEditor />} />
          <Route path="/logs" element={<LogViewer />} />
        </Routes>
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
