/**
 * _layout.tsx — App Root Layout v3
 * Place at: app/_layout.tsx
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Stack }          from "expo-router";
import { StatusBar }      from "expo-status-bar";
import { useColorScheme } from "react-native";
import AsyncStorage       from "@react-native-async-storage/async-storage";
import { lightTheme, darkTheme, Theme } from "../constants/theme";

// ── Theme Context ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "theme_preference";

interface ThemeContextValue {
  theme:       Theme;
  isDark:      boolean;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme:       darkTheme,
  isDark:      true,
  toggleTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDark,  setIsDark]  = useState(systemScheme === "dark");
  const [loaded,  setLoaded]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => {
        if (val === "dark")  setIsDark(true);
        if (val === "light") setIsDark(false);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? "dark" : "light").catch(() => {});
      return next;
    });
  }, []);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── App Stack ─────────────────────────────────────────────────────────────────

function AppStack() {
  const { isDark, theme } = useTheme();
  return (
    <>
      <Stack
        screenOptions={{
          headerShown:  false,
          animation:    "slide_from_right",
          contentStyle: { backgroundColor: theme.background },
        }}
      />
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}

// ── Root Layout ───────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppStack />
    </ThemeProvider>
  );
}
