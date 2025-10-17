import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  Play,
  Image,
  Settings,
  Clock,
  FileText,
  Info,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Film,
  Layers,
  Tv,
  Database,
  Palette,
  Type,
  Bell,
  Lock,
  User,
  FileImage,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import VersionBadge from "./VersionBadge";
import { useSidebar } from "../context/SidebarContext";
import { useTheme } from "../context/ThemeContext";

const Sidebar = () => {
  const location = useLocation();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { theme, setTheme, themes } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [missingAssetsCount, setMissingAssetsCount] = useState(0);

  // Check if Folder View is active
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem("gallery-view-mode") || "grid";
  });

  // Fetch missing assets count
  React.useEffect(() => {
    const fetchMissingAssetsCount = async () => {
      try {
        const response = await fetch("/api/assets/overview");
        if (response.ok) {
          const data = await response.json();
          // Show total assets with issues (not just missing assets)
          setMissingAssetsCount(data.categories.assets_with_issues.count);
        }
      } catch (error) {
        console.error("Failed to fetch missing assets count:", error);
      }
    };

    fetchMissingAssetsCount();

    // Listen for assetReplaced event to refresh immediately
    const handleAssetReplaced = () => {
      fetchMissingAssetsCount();
    };
    window.addEventListener("assetReplaced", handleAssetReplaced);

    // Refresh every 60 seconds
    const interval = setInterval(fetchMissingAssetsCount, 60000);

    return () => {
      clearInterval(interval);
      window.removeEventListener("assetReplaced", handleAssetReplaced);
    };
  }, []);

  // Update viewMode when localStorage changes (listen to storage events)
  React.useEffect(() => {
    const handleStorageChange = () => {
      setViewMode(localStorage.getItem("gallery-view-mode") || "grid");
    };

    // Listen for custom event from GalleryHub
    window.addEventListener("viewModeChanged", handleStorageChange);
    // Also check periodically (fallback)
    const interval = setInterval(handleStorageChange, 500);

    return () => {
      window.removeEventListener("viewModeChanged", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const themeArray = Object.entries(themes).map(([id, config]) => ({
    id,
    name: config.name,
    color: config.variables["--theme-primary"],
  }));

  const navItems = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/run-modes", label: "Run Modes", icon: Play },
    { path: "/runtime-history", label: "Runtime History", icon: TrendingUp },
    {
      path: "/gallery",
      label: "Assets",
      icon: Image,
      hasSubItems: true,
      subItems:
        // In Folder View: Only show "Posters" tab, in Grid View: show all tabs
        viewMode === "folder"
          ? [{ path: "/gallery/posters", label: "Posters", icon: Image }]
          : [
              { path: "/gallery/posters", label: "Posters", icon: Image },
              {
                path: "/gallery/backgrounds",
                label: "Backgrounds",
                icon: Layers,
              },
              { path: "/gallery/seasons", label: "Seasons", icon: Film },
              { path: "/gallery/titlecards", label: "Title Cards", icon: Tv },
            ],
    },
    {
      path: "/asset-overview",
      label: "Missing Assets",
      icon: AlertTriangle,
      badge: missingAssetsCount,
    },
    { path: "/overlay-assets", label: "Overlay Assets", icon: FileImage },
    { path: "/test-gallery", label: "Test Assets", icon: Image },
    {
      path: "/config",
      label: "Config",
      icon: Settings,
      hasSubItems: true,
      subItems: [
        { path: "/config/webui", label: "WebUI", icon: Lock },
        { path: "/config/general", label: "General", icon: Settings },
        { path: "/config/services", label: "Media Servers", icon: Database },
        { path: "/config/api", label: "Service APIs", icon: Settings },
        { path: "/config/languages", label: "Languages", icon: Type },
        { path: "/config/visuals", label: "Visuals", icon: Palette },
        { path: "/config/overlays", label: "Overlays", icon: Palette },
        { path: "/config/collections", label: "Collections", icon: Type },
        { path: "/config/notifications", label: "Notifications", icon: Bell },
      ],
    },
    { path: "/scheduler", label: "Scheduler", icon: Clock },
    { path: "/logs", label: "Logs", icon: FileText },
    { path: "/how-it-works", label: "How It Works", icon: Lightbulb },
    { path: "/about", label: "About", icon: Info },
  ];

  const isInAssetsSection = location.pathname.startsWith("/gallery");
  const isInConfigSection = location.pathname.startsWith("/config");

  return (
    <>
      {/* Desktop Sidebar */}
      <div
        className={`hidden md:flex flex-col fixed left-0 top-0 h-screen bg-theme-card border-r border-theme transition-all duration-300 z-50 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="flex items-center p-4 h-20">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg hover:bg-theme-hover transition-colors text-theme-text"
            title={isCollapsed ? "Sidebar erweitern" : "Sidebar minimieren"}
          >
            <Menu className="w-5 h-5" />
          </button>
          {!isCollapsed && (
            <div className="ml-3 flex items-center">
              <img
                src="/logo.png"
                alt="Posterizarr Logo"
                className="h-12 w-auto object-contain"
              />
            </div>
          )}
        </div>

        {/* Navigation Items - Desktop */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              if (item.hasSubItems) {
                const isAssetsItem = item.path === "/gallery";
                const isConfigItem = item.path === "/config";
                const isExpanded = isAssetsItem
                  ? isAssetsExpanded
                  : isConfigExpanded;
                const isInSection = isAssetsItem
                  ? isInAssetsSection
                  : isInConfigSection;
                const toggleExpanded = isAssetsItem
                  ? () => setIsAssetsExpanded(!isAssetsExpanded)
                  : () => setIsConfigExpanded(!isConfigExpanded);

                return (
                  <div key={item.path}>
                    <button
                      onClick={toggleExpanded}
                      className={`w-full flex items-center ${
                        isCollapsed ? "justify-center" : "justify-between px-3"
                      } py-3 rounded-lg text-sm font-medium transition-all group ${
                        isInSection
                          ? "bg-theme-primary/20 text-theme-primary"
                          : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                      }`}
                      title={isCollapsed ? item.label : ""}
                    >
                      <div className="flex items-center">
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        {!isCollapsed && (
                          <span className="ml-3">{item.label}</span>
                        )}
                      </div>
                      {!isCollapsed && (
                        <div>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </div>
                      )}
                    </button>

                    {isExpanded && !isCollapsed && (
                      <div className="ml-4 mt-1 space-y-1">
                        {item.subItems.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const isSubActive =
                            location.pathname === subItem.path;

                          return (
                            <Link
                              key={subItem.path}
                              to={subItem.path}
                              className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                isSubActive
                                  ? "bg-theme-primary text-white shadow-lg"
                                  : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                              }`}
                            >
                              <SubIcon className="w-4 h-4 flex-shrink-0" />
                              <span className="ml-3">{subItem.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center ${
                    isCollapsed ? "justify-center" : "justify-between px-3"
                  } py-3 rounded-lg text-sm font-medium transition-all group ${
                    isActive
                      ? "bg-theme-primary text-white shadow-lg"
                      : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                  }`}
                  title={isCollapsed ? item.label : ""}
                >
                  <div className="flex items-center">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span className="ml-3">{item.label}</span>}
                  </div>
                  {!isCollapsed &&
                    item.badge !== undefined &&
                    item.badge > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center">
                        {item.badge}
                      </span>
                    )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="p-4">
          {!isCollapsed ? (
            <VersionBadge />
          ) : (
            <div className="flex justify-center items-center">
              <div className="text-xs text-theme-muted font-semibold">v2.0</div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Header - FIXED: jetzt bei top-0 mit integrierten Icons */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-theme-card border-b border-theme z-50 h-16">
        <div className="flex items-center justify-between h-full px-4">
          {/* Left side - Menu button and Logo */}
          <div className="flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-theme-hover transition-colors text-theme-text"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
            <span className="ml-3 text-xl font-bold text-theme-primary">
              Posterizarr
            </span>
          </div>

          {/* Right side - Theme and User Icons */}
          <div className="flex items-center gap-2">
            {/* Theme Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-theme-hover transition-colors text-theme-text"
                title="Theme wechseln"
              >
                <Palette className="w-5 h-5" />
              </button>

              {/* Theme Dropdown */}
              {isThemeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsThemeDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-lg bg-theme-card border border-theme shadow-lg z-50">
                    <div className="p-2">
                      <div className="px-3 py-2 text-xs font-semibold text-theme-muted uppercase tracking-wider">
                        Select Theme
                      </div>
                      {themeArray.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTheme(t.id);
                            setIsThemeDropdownOpen(false);
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

            {/* User Icon */}
            <button
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-theme-hover transition-colors text-theme-text"
              title="User Profile"
            >
              <User className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40 top-16"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Mobile Sidebar */}
          <div className="md:hidden fixed left-0 top-16 bottom-0 w-64 bg-theme-card border-r border-theme z-40 flex flex-col">
            {/* Scrollable Navigation Area */}
            <nav className="flex-1 overflow-y-auto py-4">
              <div className="space-y-1 px-3">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;

                  if (item.hasSubItems) {
                    const isAssetsItem = item.path === "/gallery";
                    const isConfigItem = item.path === "/config";
                    const isExpanded = isAssetsItem
                      ? isAssetsExpanded
                      : isConfigExpanded;
                    const isInSection = isAssetsItem
                      ? isInAssetsSection
                      : isInConfigSection;
                    const toggleExpanded = isAssetsItem
                      ? () => setIsAssetsExpanded(!isAssetsExpanded)
                      : () => setIsConfigExpanded(!isConfigExpanded);

                    return (
                      <div key={item.path}>
                        <button
                          onClick={toggleExpanded}
                          className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-all ${
                            isInSection
                              ? "bg-theme-primary/20 text-theme-primary"
                              : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                          }`}
                        >
                          <div className="flex items-center">
                            <Icon className="w-5 h-5 mr-3" />
                            <span>{item.label}</span>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="ml-4 mt-1 space-y-1">
                            {item.subItems.map((subItem) => {
                              const SubIcon = subItem.icon;
                              const isSubActive =
                                location.pathname === subItem.path;

                              return (
                                <Link
                                  key={subItem.path}
                                  to={subItem.path}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                    isSubActive
                                      ? "bg-theme-primary text-white shadow-lg"
                                      : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                                  }`}
                                >
                                  <SubIcon className="w-4 h-4" />
                                  <span className="ml-3">{subItem.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-theme-primary text-white shadow-lg"
                          : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                      }`}
                    >
                      <div className="flex items-center">
                        <Icon className="w-5 h-5 mr-3" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Mobile Version Badge - Fixed at Bottom */}
            <div className="p-4 border-t border-theme bg-theme-card">
              <VersionBadge />
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Sidebar;
