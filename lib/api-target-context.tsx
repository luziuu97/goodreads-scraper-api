"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface TargetApiContextType {
  targetApiUrl: string;
  setTargetApiUrl: (url: string) => void;
  getApiUrl: (path: string) => string;
  isLocal: boolean;
}

const TargetApiContext = createContext<TargetApiContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = "books_api_target_url";

export function TargetApiProvider({ children }: { children: ReactNode }) {
  const [targetApiUrl, setTargetApiUrlState] = useState<string>("");

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      setTargetApiUrlState(saved);
    }
  }, []);

  const setTargetApiUrl = (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    setTargetApiUrlState(trimmed);
    if (trimmed) {
      localStorage.setItem(LOCAL_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  const getApiUrl = (path: string): string => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!targetApiUrl) {
      return cleanPath;
    }
    // If targetApiUrl already includes /api and path starts with /api, strip duplicate /api
    if (targetApiUrl.endsWith("/api") && cleanPath.startsWith("/api/")) {
      return `${targetApiUrl}${cleanPath.substring(4)}`;
    }
    return `${targetApiUrl}${cleanPath}`;
  };

  const isLocal = !targetApiUrl || targetApiUrl.includes("localhost") || targetApiUrl.includes("127.0.0.1");

  return (
    <TargetApiContext.Provider
      value={{
        targetApiUrl,
        setTargetApiUrl,
        getApiUrl,
        isLocal,
      }}
    >
      {children}
    </TargetApiContext.Provider>
  );
}

export function useTargetApi() {
  const context = useContext(TargetApiContext);
  if (!context) {
    throw new Error("useTargetApi must be used within a TargetApiProvider");
  }
  return context;
}
