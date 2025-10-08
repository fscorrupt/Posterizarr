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
import GalleryHub from "./components/GalleryHub";
import TestGallery from "./components/TestGallery";
import About from "./components/About";
import SchedulerSettings from "./components/SchedulerSettings";
import RunModes from "./components/RunModes";
import VersionBadge from "./components/VersionBadge";
import {
  Menu,
  Settings,
  Image,
  FileText,
  Activity,
  TestTube,
  Palette,
  Info,
  Clock,
  Play,
} from "lucide-react";

function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themeArray = Object.entries(themes).map(([id, config]) => ({
    id,
    name: config.name,
    color: config.variables["--theme-primary"],
  }));

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
              {themeArray.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    theme === t.id
                      ? "bg-theme-primary text-white"
                      : "text-gray-300 hover:bg-theme-hover"
                  }`}
                >
                  <span>{t.name}</span>
                  <div
                    className="w-3 h-3 rounded-full"
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

  const navItems = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/run-modes", label: "Run Modes", icon: Play },
    { path: "/gallery", label: "Assets", icon: Image },
    { path: "/test-gallery", label: "Test Assets", icon: Image },
    { path: "/config", label: "Config", icon: Settings },
    { path: "/scheduler", label: "Scheduler", icon: Clock },
    { path: "/logs", label: "Logs", icon: FileText },
    { path: "/about", label: "About", icon: Info },
  ];

  return (
    <nav className="bg-theme-card border-b border-theme shadow-lg fixed top-0 left-0 right-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-2xl font-bold text-theme-primary">
                Posterizarr
              </span>
              <VersionBadge />
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:ml-10 md:flex md:space-x-2">
              <div className="flex space-x-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
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
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/run-modes" element={<RunModes />} />
          <Route path="/test-gallery" element={<TestGallery />} />
          <Route path="/gallery" element={<GalleryHub />} />
          <Route path="/config" element={<ConfigEditor />} />
          <Route path="/scheduler" element={<SchedulerSettings />} />
          <Route path="/logs" element={<LogViewer />} />
          <Route path="/about" element={<About />} />
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
