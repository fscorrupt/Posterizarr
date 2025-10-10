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
} from "lucide-react";
import VersionBadge from "./VersionBadge";
import { useSidebar } from "../context/SidebarContext";

const Sidebar = () => {
  const location = useLocation();
  const { isCollapsed, setIsCollapsed } = useSidebar();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // ✅ CHANGED: Initial state to false (collapsed)
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(false);
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);

  const navItems = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/run-modes", label: "Run Modes", icon: Play },
    // Assets mit Subtabs
    {
      path: "/gallery",
      label: "Assets",
      icon: Image,
      hasSubItems: true,
      subItems: [
        { path: "/gallery/posters", label: "Posters", icon: Image },
        { path: "/gallery/backgrounds", label: "Backgrounds", icon: Layers },
        { path: "/gallery/seasons", label: "Seasons", icon: Film },
        { path: "/gallery/titlecards", label: "Title Cards", icon: Tv },
      ],
    },
    { path: "/test-gallery", label: "Test Assets", icon: Image },
    {
      path: "/config",
      label: "Config",
      icon: Settings,
      hasSubItems: true,
      subItems: [
        { path: "/config/webui", label: "WebUI", icon: Lock },
        { path: "/config/general", label: "General", icon: Settings },
        { path: "/config/services", label: "Services", icon: Database },
        { path: "/config/api", label: "API", icon: Settings },
        { path: "/config/languages", label: "Languages", icon: Type },
        { path: "/config/visuals", label: "Visuals", icon: Palette },
        { path: "/config/overlays", label: "Overlays", icon: Palette },
        { path: "/config/collections", label: "Collections", icon: Type },
        { path: "/config/notifications", label: "Notifications", icon: Bell },
      ],
    },
    { path: "/scheduler", label: "Scheduler", icon: Clock },
    { path: "/logs", label: "Logs", icon: FileText },
    { path: "/about", label: "About", icon: Info },
  ];

  // Check if current path is in Assets section
  const isInAssetsSection = location.pathname.startsWith("/gallery");

  // Check if current path is in Config section
  const isInConfigSection = location.pathname.startsWith("/config");

  return (
    <>
      <div
        className={`hidden md:flex flex-col fixed left-0 top-0 h-screen bg-theme-card border-r border-theme transition-all duration-300 z-50 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="flex items-center p-4 h-16">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg hover:bg-theme-hover transition-colors text-theme-text"
            title={isCollapsed ? "Sidebar erweitern" : "Sidebar minimieren"}
          >
            <Menu className="w-5 h-5" />
          </button>
          {!isCollapsed && (
            <span className="ml-3 text-xl font-bold text-theme-primary">
              Posterizarr
            </span>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              // Items with Subtabs (Assets or Config)
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
                    {/* Main Button (Assets or Config) */}
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

                    {/* Subtabs */}
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

              // Regular nav items
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center ${
                    isCollapsed ? "justify-center" : "px-3"
                  } py-3 rounded-lg text-sm font-medium transition-all group ${
                    isActive
                      ? "bg-theme-primary text-white shadow-lg"
                      : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                  }`}
                  title={isCollapsed ? item.label : ""}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="ml-3">{item.label}</span>}
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

      {/* Mobile Header */}
      <div className="md:hidden fixed top-16 left-0 right-0 bg-theme-card border-b border-theme z-40 h-14">
        <div className="flex items-center h-full px-4">
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
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40 top-30"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="md:hidden fixed left-0 top-30 bottom-0 w-64 bg-theme-card border-r border-theme z-50 overflow-y-auto">
            <nav className="py-4">
              <div className="space-y-1 px-3">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;

                  // Items with Subtabs (Assets or Config) (Mobile)
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
                      className={`flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-theme-primary text-white shadow-lg"
                          : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Mobile Version Badge*/}
            <div className="p-4">
              <VersionBadge />
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Sidebar;
