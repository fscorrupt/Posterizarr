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
} from "lucide-react";
import VersionBadge from "./VersionBadge";

const Sidebar = () => {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <>
      {/* Desktop Sidebar - ÜBER TopNavbar (z-50) */}
      <div
        className={`hidden md:flex flex-col fixed left-0 top-0 h-screen bg-theme-card border-r border-theme transition-all duration-300 z-50 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Header with Hamburger */}
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
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-3 py-3 rounded-lg text-sm font-medium transition-all group ${
                    isActive
                      ? "bg-theme-primary text-white shadow-lg"
                      : "text-theme-muted hover:bg-theme-hover hover:text-theme-text"
                  }`}
                  title={isCollapsed ? item.label : ""}
                >
                  <Icon
                    className={`w-5 h-5 flex-shrink-0 ${
                      isCollapsed ? "mx-auto" : ""
                    }`}
                  />
                  {!isCollapsed && <span className="ml-3">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Version Badge at Bottom */}
        <div className="p-4 border-t border-theme">
          {!isCollapsed ? (
            <VersionBadge />
          ) : (
            <div className="flex justify-center">
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

            {/* Mobile Version Badge */}
            <div className="p-4 border-t border-theme">
              <VersionBadge />
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Sidebar;
