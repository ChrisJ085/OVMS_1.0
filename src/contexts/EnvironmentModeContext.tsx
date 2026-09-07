import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type AppEnvironmentMode = 'DEVELOPMENT' | 'PRODUCTION';

export interface EnvironmentModeContextType {
  mode: AppEnvironmentMode;
  isDevelopmentMode: boolean;
  isProductionMode: boolean;
  setMode: (mode: AppEnvironmentMode) => void;
  toggleMode: () => void;
}

const EnvironmentModeContext = createContext<EnvironmentModeContextType | undefined>(undefined);

const STORAGE_KEY = 'ovms_app_environment_mode';

export const EnvironmentModeProvider: React.FC<{ children: ReactNode; defaultMode?: AppEnvironmentMode }> = ({ 
  children,
  defaultMode
}) => {
  const [mode, setModeState] = useState<AppEnvironmentMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'DEVELOPMENT' || saved === 'PRODUCTION') {
        return saved;
      }
    } catch {
      // Ignore localStorage access errors (e.g. sandboxed iframes)
    }
    if (defaultMode) {
      return defaultMode;
    }
    const isDev = import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true';
    return isDev ? 'DEVELOPMENT' : 'PRODUCTION';
  });

  const setMode = (newMode: AppEnvironmentMode) => {
    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // Ignore localStorage write errors
    }
  };

  const toggleMode = () => {
    setMode(mode === 'DEVELOPMENT' ? 'PRODUCTION' : 'DEVELOPMENT');
  };

  return (
    <EnvironmentModeContext.Provider
      value={{
        mode,
        isDevelopmentMode: mode === 'DEVELOPMENT',
        isProductionMode: mode === 'PRODUCTION',
        setMode,
        toggleMode,
      }}
    >
      {children}
    </EnvironmentModeContext.Provider>
  );
};

export const useEnvironmentMode = (): EnvironmentModeContextType => {
  const context = useContext(EnvironmentModeContext);
  if (!context) {
    const isDev = import.meta.env.DEV || import.meta.env.VITE_DEV_MODE === 'true';
    return {
      mode: isDev ? 'DEVELOPMENT' : 'PRODUCTION',
      isDevelopmentMode: isDev,
      isProductionMode: !isDev,
      setMode: () => {},
      toggleMode: () => {},
    };
  }
  return context;
};
