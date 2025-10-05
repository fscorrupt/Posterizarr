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
    // Lade gespeichertes Theme oder nutze 'plex' als Standard
    return localStorage.getItem("posterizarr-theme") || "plex";
  });

  useEffect(() => {
    // Speichere Theme-Wahl
    localStorage.setItem("posterizarr-theme", theme);

    // Setze data-theme Attribut auf dem HTML-Element
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const themes = [
    { id: "plex", name: "Plex", color: "#e5a00d" },
    { id: "jellyfin", name: "Jellyfin", color: "#00a4dc" },
    { id: "emby", name: "Emby", color: "#52b54b" },
  ];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
};
