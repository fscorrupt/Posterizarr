import React, { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("posterizarr-theme") || "plex";
  });

  // Define your themes and the CSS variables they control
  const themes = {
    plex: {
      name: "Plex",
      variables: {
        "--theme-primary": "#e5a00d",
        "--theme-primary-hover": "#cc8f0c",
        "--theme-accent": "#282a2d",
        "--theme-bg": "#000000",
        "--theme-bg-dark": "#000000",
        "--theme-bg-card": "#1a1a1a",
        "--theme-bg-hover": "#2a2a2a",
        "--theme-border": "#3a3a3a",
        "--theme-text": "#f5f5f5",
        "--theme-text-muted": "#a0a0a0",
      },
    },
    jellyfin: {
      name: "Jellyfin",
      variables: {
        "--theme-primary": "#00a4dc",
        "--theme-primary-hover": "#0091c2",
        "--theme-accent": "#aa5cc3",
        "--theme-bg": "#0b0b0f",
        "--theme-bg-dark": "#0b0b0f",
        "--theme-bg-card": "#1a1a24",
        "--theme-bg-hover": "#252535",
        "--theme-border": "#2a2a3a",
        "--theme-text": "#e5f6fb",
        "--theme-text-muted": "#8ca7b3",
      },
    },
    emby: {
      name: "Emby",
      variables: {
        "--theme-primary": "#52b54b",
        "--theme-primary-hover": "#469d40",
        "--theme-accent": "#2c3e50",
        "--theme-bg": "#1c1c1c",
        "--theme-bg-dark": "#1c1c1c",
        "--theme-bg-card": "#252525",
        "--theme-bg-hover": "#2f2f2f",
        "--theme-border": "#3a3a3a",
        "--theme-text": "#ecf0f1",
        "--theme-text-muted": "#95a5a6",
      },
    },
  };

  useEffect(() => {
    localStorage.setItem("posterizarr-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);

    // Apply CSS variables for the selected theme
    const themeVars = themes[theme]?.variables;
    if (themeVars) {
      Object.entries(themeVars).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value);
      });
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
};
