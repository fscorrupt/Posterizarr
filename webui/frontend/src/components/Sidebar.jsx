import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  Server,
  Palette,
  Type,
  Bell,
  Lock,
  User,
  FileImage,
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Zap,
  FolderKanban,
  GripVertical,
  MoreVertical,
} from "lucide-react";
import VersionBadge from "./VersionBadge";
import { useSidebar } from "../context/SidebarContext";
import { useTheme } from "../context/ThemeContext";

const Sidebar = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const { theme, setTheme, themes } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [missingAssetsCount, setMissingAssetsCount] = useState(0);
  const [manualAssetsCount, setManualAssetsCount] = useState(0);
  const [draggedItem, setDraggedItem] = useState(null);
  const [hoveredItem, setHoveredItem] = useState(null);

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

  // Fetch manual assets count
  React.useEffect(() => {
    const fetchManualAssetsCount = async () => {
      try {
        const response = await fetch("/api/manual-assets-gallery");
        if (response.ok) {
          const data = await response.json();
          setManualAssetsCount(data.total_assets || 0);
        }
      } catch (error) {
        console.error("Failed to fetch manual assets count:", error);
      }
    };

    fetchManualAssetsCount();

    // Listen for assetReplaced event to refresh immediately
    const handleAssetReplaced = () => {
      fetchManualAssetsCount();
    };
    window.addEventListener("assetReplaced", handleAssetReplaced);

    // Refresh every 3 seconds for instant updates
    const interval = setInterval(fetchManualAssetsCount, 3000);

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

  // Define all nav items with unique IDs
  const defaultNavItems = [
    { id: "dashboard", path: "/", label: t("nav.dashboard"), icon: Activity },
    {
      id: "runModes",
      path: "/run-modes",
      label: t("nav.runModes"),
      icon: Play,
    },
    {
      id: "scheduler",
      path: "/scheduler",
      label: t("nav.scheduler"),
      icon: Clock,
    },
    {
      id: "mediaServerExport",
      path: "/media-server-export",
      label: t("nav.mediaServerExport", "Media Server Export"),
      icon: Server,
    },
    {
      id: "gallery",
      path: "/gallery",
      label: t("nav.assets"),
      icon: Image,
      hasSubItems: true,
      subItems:
        // In Folder View: Only show "Assets Folders" tab, in Grid View: show all tabs
        viewMode === "folder"
          ? [
              {
                path: "/gallery/posters",
                label: t("assets.assetsFolders"),
                icon: FolderKanban,
              },
            ]
          : [
              {
                path: "/gallery/posters",
                label: t("assets.posters"),
                icon: Image,
              },
              {
                path: "/gallery/backgrounds",
                label: t("assets.backgrounds"),
                icon: Layers,
              },
              {
                path: "/gallery/seasons",
                label: t("assets.seasons"),
                icon: Film,
              },
              {
                path: "/gallery/titlecards",
                label: t("assets.titleCards"),
                icon: Tv,
              },
            ],
    },
    {
      id: "manualAssets",
      path: "/manual-assets",
      label: "Manual Assets",
      icon: FileImage,
      badge: manualAssetsCount,
      badgeColor: "green",
    },
    {
      id: "assetOverview",
      path: "/asset-overview",
      label: t("nav.assetOverview"),
      icon: AlertTriangle,
      badge: missingAssetsCount,
      badgeColor: "red",
    },
    {
      id: "assetsManager",
      path: "/assets-manager",
      label: t("nav.assetsManager"),
      icon: FolderKanban,
    },
    {
      id: "autoTriggers",
      path: "/auto-triggers",
      label: t("nav.autoTriggers"),
      icon: Zap,
    },
    {
      id: "config",
      path: "/config",
      label: t("nav.config"),
      icon: Settings,
      hasSubItems: true,
      subItems: [
        { path: "/config/webui", label: "WebUI", icon: Lock },
        {
          path: "/config/general",
          label: t("nav.generalSettings"),
          icon: Settings,
        },
        { path: "/config/services", label: "Media Servers", icon: Database },
        { path: "/config/api", label: "Service APIs", icon: Settings },
        { path: "/config/languages", label: t("nav.library"), icon: Type },
        { path: "/config/visuals", label: "Visuals", icon: Palette },
        { path: "/config/overlays", label: "Overlays", icon: Palette },
        { path: "/config/collections", label: "Collections", icon: Type },
        {
          path: "/config/notifications",
          label: t("nav.notifications"),
          icon: Bell,
        },
      ],
    },
    {
      id: "runtimeHistory",
      path: "/runtime-history",
      label: t("nav.runtimeHistory"),
      icon: TrendingUp,
    },
    { id: "logs", path: "/logs", label: t("nav.logs"), icon: FileText },
    {
      id: "howItWorks",
      path: "/how-it-works",
      label: t("nav.howItWorks"),
      icon: Lightbulb,
    },
    { id: "about", path: "/about", label: t("nav.about"), icon: Info },
  ];

  // Load nav order from localStorage or use default
  const [navOrder, setNavOrder] = React.useState(() => {
    const saved = localStorage.getItem("sidebar_nav_order");
    if (saved) {
      try {
        const savedOrder = JSON.parse(saved);
        // Ensure all items exist and add new ones
        const savedIds = new Set(savedOrder);
        const defaultIds = defaultNavItems.map((item) => item.id);
        const missingIds = defaultIds.filter((id) => !savedIds.has(id));
        return [...savedOrder, ...missingIds];
      } catch (e) {
        return defaultNavItems.map((item) => item.id);
      }
    }
    return defaultNavItems.map((item) => item.id);
  });

  // Create ordered nav items based on saved order
  const navItems = React.useMemo(() => {
    return navOrder
      .map((id) => defaultNavItems.find((item) => item.id === id))
      .filter(Boolean);
  }, [navOrder, viewMode, missingAssetsCount, manualAssetsCount]);

  // Save nav order to localStorage
  const saveNavOrder = (order) => {
    setNavOrder(order);
    localStorage.setItem("sidebar_nav_order", JSON.stringify(order));
  };

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;

    const newOrder = [...navOrder];
    const draggedId = newOrder[draggedItem];
    newOrder.splice(draggedItem, 1);
    newOrder.splice(index, 0, draggedId);

    setDraggedItem(index);
    setNavOrder(newOrder);
  };

  const handleDragEnd = () => {
    if (draggedItem !== null) {
      saveNavOrder(navOrder);
    }
    setDraggedItem(null);
  };

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
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const isDragging = draggedItem === index;

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
                  <div
                    key={item.id}
                    draggable={!isCollapsed}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onMouseEnter={() => setHoveredItem(index)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`relative ${isDragging ? "opacity-50" : ""}`}
                  >
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
                      <div className="flex items-center gap-1">
                        {!isCollapsed && (
                          <>
                            {hoveredItem === index && (
                              <GripVertical className="w-4 h-4 text-theme-muted opacity-60 cursor-grab active:cursor-grabbing" />
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </>
                        )}
                      </div>
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
                <div
                  key={item.id}
                  draggable={!isCollapsed}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onMouseEnter={() => setHoveredItem(index)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`relative ${isDragging ? "opacity-50" : ""}`}
                >
                  <Link
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
                      {!isCollapsed && (
                        <span className="ml-3">{item.label}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isCollapsed && hoveredItem === index && (
                        <GripVertical className="w-4 h-4 text-theme-muted opacity-60 cursor-grab active:cursor-grabbing" />
                      )}
                      {!isCollapsed &&
                        item.badge !== undefined &&
                        item.badge > 0 && (
                          <span
                            className={`${
                              item.badgeColor === "green"
                                ? "bg-green-500"
                                : "bg-red-500"
                            } text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center`}
                          >
                            {item.badge}
                          </span>
                        )}
                    </div>
                  </Link>
                </div>
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
                {navItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  const isDragging = draggedItem === index;

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
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        onMouseEnter={() => setHoveredItem(index)}
                        onMouseLeave={() => setHoveredItem(null)}
                        className={`relative ${isDragging ? "opacity-50" : ""}`}
                      >
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
                          <div className="flex items-center gap-1">
                            {hoveredItem === index && (
                              <GripVertical className="w-4 h-4 text-theme-muted opacity-60 cursor-grab active:cursor-grabbing" />
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </div>
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
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={() => setHoveredItem(index)}
                      onMouseLeave={() => setHoveredItem(null)}
                      className={`relative ${isDragging ? "opacity-50" : ""}`}
                    >
                      <Link
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
                        <div className="flex items-center gap-2">
                          {hoveredItem === index && (
                            <GripVertical className="w-4 h-4 text-theme-muted opacity-60 cursor-grab active:cursor-grabbing" />
                          )}
                          {item.badge !== undefined && item.badge > 0 && (
                            <span
                              className={`${
                                item.badgeColor === "green"
                                  ? "bg-green-500"
                                  : "bg-red-500"
                              } text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[1.5rem] text-center`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    </div>
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
