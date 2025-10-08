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
        "--theme-bg":
          "radial-gradient(circle farthest-side at 0% 100%, rgb(47, 47, 47) 0%, rgba(47, 47, 47, 0) 100%), radial-gradient(circle farthest-side at 100% 100%, rgb(63, 63, 63) 0%, rgba(63, 63, 63, 0) 100%), radial-gradient(circle farthest-side at 100% 0%, rgb(76, 76, 76) 0%, rgba(76, 76, 76, 0) 100%), radial-gradient(circle farthest-side at 0% 0%, rgb(58, 58, 58) 0%, rgba(58, 58, 58, 0) 100%), black",
        "--theme-bg-dark": "#000000",
        "--theme-bg-card": "#1a1a1a",
        "--theme-bg-hover": "#2a2a2a",
        "--theme-border": "#3a3a3a",
        "--theme-text": "#dddddd",
        "--theme-text-muted": "#999999",
        "--theme-text-hover": "#ffffff",
        "--button-color": "#cc7b19",
        "--button-color-hover": "#e59029",
        "--button-text": "#eeeeee",
        "--button-text-hover": "#ffffff",
        "--link-color": "#e5a00d",
        "--link-color-hover": "#ffffff",
        "--label-text-color": "#333333",
        "--modal-bg-color": "#282828",
        "--modal-header-color": "#323232",
        "--modal-footer-color": "#323232",
        "--drop-down-menu-bg": "#191a1c",
        "--accent-color": "229, 160, 13",
        "--accent-color-hover": "#ffc107",
        "--arr-queue-color": "#27c24c",
        "--plex-poster-unwatched": "#e5a00d",
      },
    },
    jellyfin: {
      name: "Jellyfin",
      variables: {
        "--theme-primary": "#aa5cc3",
        "--theme-primary-hover": "#9a4cb3",
        "--theme-accent": "#00a4dc",
        "--theme-bg": "#0b0b0f",
        "--theme-bg-dark": "#0b0b0f",
        "--theme-bg-card": "#1a1a24",
        "--theme-bg-hover": "#252535",
        "--theme-border": "#2a2a3a",
        "--theme-text": "#e5f6fb",
        "--theme-text-muted": "#8ca7b3",
        "--theme-text-hover": "#ffffff",
        "--button-color": "#aa5cc3",
        "--button-color-hover": "#c77ddb",
        "--button-text": "#e5f6fb",
        "--button-text-hover": "#ffffff",
        "--link-color": "#aa5cc3",
        "--link-color-hover": "#c77ddb",
        "--label-text-color": "#ffffff",
        "--modal-bg-color": "#1a1a24",
        "--modal-header-color": "#0f0f18",
        "--modal-footer-color": "#0f0f18",
        "--drop-down-menu-bg": "#0b0b0f",
        "--accent-color": "170, 92, 195",
        "--accent-color-hover": "rgba(170, 92, 195, 0.8)",
        "--arr-queue-color": "#aa5cc3",
        "--plex-poster-unwatched": "#aa5cc3",
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
        "--theme-text-hover": "#ffffff",
        "--button-color": "#52b54b",
        "--button-color-hover": "#469d40",
        "--button-text": "#ecf0f1",
        "--button-text-hover": "#ffffff",
        "--link-color": "#52b54b",
        "--link-color-hover": "#6ac963",
        "--label-text-color": "#ffffff",
        "--modal-bg-color": "#252525",
        "--modal-header-color": "#1c1c1c",
        "--modal-footer-color": "#1c1c1c",
        "--drop-down-menu-bg": "#1c1c1c",
        "--accent-color": "82, 181, 75",
        "--accent-color-hover": "rgba(82, 181, 75, 0.8)",
        "--arr-queue-color": "#52b54b",
        "--plex-poster-unwatched": "#52b54b",
      },
    },

    overseerr: {
      name: "Overseerr",
      variables: {
        "--theme-primary": "#6366f1",
        "--theme-primary-hover": "#4f46e5",
        "--theme-accent": "#a78bfa",
        "--theme-bg": "hsl(221, 39%, 11%)",
        "--theme-bg-dark": "hsl(215, 28%, 17%)",
        "--theme-bg-card": "#1f2937",
        "--theme-bg-hover": "#374151",
        "--theme-border": "#374151",
        "--theme-text": "#d1d5db",
        "--theme-text-muted": "#9ca3af",
        "--theme-text-hover": "#ffffff",
        "--button-color": "#4f46e5",
        "--button-color-hover": "#6366f1",
        "--button-text": "#e5e7eb",
        "--button-text-hover": "#ffffff",
        "--link-color": "#6366f1",
        "--link-color-hover": "#a78bfa",
        "--label-text-color": "#000000",
        "--modal-bg-color": "#1f2937",
        "--modal-header-color": "#1f2937",
        "--modal-footer-color": "#1f2937",
        "--drop-down-menu-bg": "#374151",
        "--accent-color": "167, 139, 250",
        "--accent-color-hover": "rgba(167, 139, 250, 0.8)",
        "--arr-queue-color": "#6366f1",
        "--plex-poster-unwatched": "#6366f1",
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
