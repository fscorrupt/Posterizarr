import React, { useState } from "react";
import { Palette, User } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const TopNavbar = () => {
  const { theme, setTheme, themes } = useTheme();
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);

  const themeArray = Object.entries(themes).map(([id, config]) => ({
    id,
    name: config.name,
    color: config.variables["--theme-primary"],
  }));

  return (
    <div className="fixed top-0 left-0 right-0 bg-theme-card border-b border-theme z-40 h-16 md:pl-64 shadow-lg">
      {/* md:pl-64 = Platz für Sidebar auf Desktop */}
      {/* bg-[#0f1117] ist ein fester, undurchsichtiger dunkler Hintergrund */}
      <div className="flex items-center justify-between h-full px-6">
        {/* Left side - can be used for breadcrumbs or page title */}
        <div className="flex items-center">
          {/* Empty for now, can be used for dynamic content */}
        </div>

        {/* Right side - Theme Switcher & User Icon */}
        <div className="flex items-center gap-3">
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
  );
};

export default TopNavbar;
