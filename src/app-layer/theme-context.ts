"use client";

import { createContext, useContext } from "react";

export type TThemeMode = "dark" | "light";

export interface IThemeContext {
  mode: TThemeMode;
  setMode: (mode: TThemeMode) => void;
}

export const ThemeContext = createContext<IThemeContext>({
  mode: "dark",
  setMode: () => {},
});

export function useTheme(): IThemeContext {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "ai-master-theme";

export function getInitialTheme(): TThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function saveTheme(mode: TThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}
