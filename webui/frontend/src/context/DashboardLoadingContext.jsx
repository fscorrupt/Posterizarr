import React, { createContext, useContext, useState, useCallback } from "react";

const DashboardLoadingContext = createContext();

export function useDashboardLoading() {
  const context = useContext(DashboardLoadingContext);
  if (!context) {
    throw new Error(
      "useDashboardLoading must be used within DashboardLoadingProvider"
    );
  }
  return context;
}

export function DashboardLoadingProvider({ children }) {
  const [loadingComponents, setLoadingComponents] = useState(new Set());
  const [isDashboardFullyLoaded, setIsDashboardFullyLoaded] = useState(false);

  // Register a component as loading
  const startLoading = useCallback((componentName) => {
    console.log(`Dashboard Loading: START ${componentName}`);
    setLoadingComponents((prev) => {
      const next = new Set(prev);
      next.add(componentName);
      const componentList = Array.from(next).join(", ");
      console.log(`Current loading components: [${componentList}]`);
      return next;
    });
    setIsDashboardFullyLoaded(false);
  }, []);

  // Mark a component as finished loading
  const finishLoading = useCallback((componentName) => {
    console.log(`Dashboard Loading: FINISH ${componentName}`);
    setLoadingComponents((prev) => {
      const next = new Set(prev);
      next.delete(componentName);

      const componentList = Array.from(next).join(", ");
      console.log(`Remaining loading components: [${componentList}]`);

      // If this was the last component, mark dashboard as fully loaded
      if (next.size === 0) {
        console.log(`Dashboard fully loaded!`);
        setIsDashboardFullyLoaded(true);
      }

      return next;
    });
  }, []);

  // Reset all loading states (useful when navigating away from dashboard)
  const resetLoading = useCallback(() => {
    setLoadingComponents(new Set());
    setIsDashboardFullyLoaded(false);
  }, []);

  // Check if a specific component is still loading
  const isComponentLoading = useCallback(
    (componentName) => {
      return loadingComponents.has(componentName);
    },
    [loadingComponents]
  );

  const value = {
    isDashboardFullyLoaded,
    isLoading: loadingComponents.size > 0,
    loadingComponents: Array.from(loadingComponents),
    startLoading,
    finishLoading,
    resetLoading,
    isComponentLoading,
  };

  return (
    <DashboardLoadingContext.Provider value={value}>
      {children}
    </DashboardLoadingContext.Provider>
  );
}
