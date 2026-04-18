/**
 * theme.ts — Color System
 *
 * WHAT THIS FILE DOES:
 *  - Defines two complete color themes: light and dark
 *  - Every component uses these instead of hardcoded colors
 *  - This way changing the theme changes the WHOLE app at once
 *
 * HOW TO USE:
 *  import { lightTheme, darkTheme } from "../constants/theme";
 *  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
 *  <View style={{ backgroundColor: theme.background }}>
 */

// ── Type Definition ───────────────────────────────────────────────────────────
// This ensures both themes have exactly the same keys (no typos)
export interface Theme {
  background:   string;   // Main screen background
  card:         string;   // Stock card background
  surface:      string;   // Secondary surfaces (modals, headers)
  text:         string;   // Primary text
  textSecondary:string;   // Muted/secondary text
  border:       string;   // Subtle borders
  buy:          string;   // Green — BUY signal
  sell:         string;   // Red — SELL signal
  hold:         string;   // Amber — HOLD signal
  bestCard:     string;   // Background for the "Best Opportunity" card
  accent:       string;   // Brand accent color (used in charts, headers)
  shadow:       string;   // Shadow color (iOS) / elevation (Android)
  positive:     string;   // Profit indicator
  negative:     string;   // Loss indicator
}

// ── Light Theme ───────────────────────────────────────────────────────────────
export const lightTheme: Theme = {
  background:    "#F5F7FA",   // Very light grey — easier on eyes than pure white
  card:          "#FFFFFF",   // White cards on grey background
  surface:       "#EEF1F7",   // Slightly darker surface for headers
  text:          "#0D1117",   // Near-black for readability
  textSecondary: "#6B7280",   // Grey for secondary info
  border:        "#E2E8F0",   // Light border
  buy:           "#00C853",   // Bright green (NSE green vibes)
  sell:          "#FF3D3D",   // Clear red
  hold:          "#FF9800",   // Amber
  bestCard:      "#003D1F",   // Deep green for best card header
  accent:        "#1A56DB",   // Indigo accent
  shadow:        "#000000",   // Black shadow
  positive:      "#00C853",
  negative:      "#FF3D3D",
};

// ── Dark Theme ────────────────────────────────────────────────────────────────
export const darkTheme: Theme = {
  background:    "#0D1117",   // Deep dark — like a trading terminal
  card:          "#161B22",   // Slightly lighter than background
  surface:       "#21262D",   // Header / modal surface
  text:          "#E6EDF3",   // Off-white (pure white can cause eye strain)
  textSecondary: "#8B949E",   // Muted grey
  border:        "#30363D",   // Subtle dark border
  buy:           "#3FB950",   // Softer green (works better on dark)
  sell:          "#F85149",   // Softer red
  hold:          "#D29922",   // Softer amber
  bestCard:      "#003D1F",   // Same deep green (looks great on dark)
  accent:        "#388BFD",   // Lighter blue for dark bg
  shadow:        "#000000",
  positive:      "#3FB950",
  negative:      "#F85149",
};