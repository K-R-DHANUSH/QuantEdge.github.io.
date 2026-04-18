/**
 * ThemeToggleButton.tsx — Animated Day/Night Toggle
 * Place at: components/ThemeToggleButton.tsx
 *
 * Props:
 *   size?: "sm" | "md" | "lg"  (default "md")
 *
 * Usage:
 *   import ThemeToggleButton from "../components/ThemeToggleButton";
 *   <ThemeToggleButton size="md" />
 */

import React, { useRef, useEffect } from "react";
import { TouchableOpacity, Animated, View, StyleSheet } from "react-native";
import { useTheme } from "../app/_layout";

interface Props {
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: { width: 52, height: 28, knob: 22, offset: 24, iconSize: 12 },
  md: { width: 64, height: 34, knob: 27, offset: 30, iconSize: 15 },
  lg: { width: 76, height: 40, knob: 32, offset: 36, iconSize: 18 },
};

export default function ThemeToggleButton({ size = "md" }: Props) {
  const { isDark, toggleTheme, theme } = useTheme();
  const s = SIZES[size];

  const slideAnim  = useRef(new Animated.Value(isDark ? s.offset : 3)).current;
  const sunOpacity = useRef(new Animated.Value(isDark ? 0 : 1)).current;
  const moonOpacity= useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue:         isDark ? s.offset : 3,
        useNativeDriver: true,
        friction:        7,
        tension:         120,
      }),
      Animated.timing(sunOpacity,  { toValue: isDark ? 0 : 1, duration: 180, useNativeDriver: true }),
      Animated.timing(moonOpacity, { toValue: isDark ? 1 : 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [isDark]);

  return (
    <TouchableOpacity
      onPress={toggleTheme}
      activeOpacity={0.85}
      accessibilityRole="switch"
      accessibilityLabel={isDark ? "Switch to light mode" : "Switch to dark mode"}
      accessibilityState={{ checked: isDark }}
    >
      <View style={[
        styles.pill,
        {
          width:           s.width,
          height:          s.height,
          backgroundColor: isDark ? "#1E2D3D" : "#E8F4FF",
          borderColor:     isDark ? theme.accent + "44" : theme.accent + "33",
        },
      ]}>
        {/* Sun — left side, visible in light mode */}
        <Animated.Text style={[styles.icon, { fontSize: s.iconSize, opacity: sunOpacity, left: 6 }]}>
          ☀️
        </Animated.Text>

        {/* Moon — right side, visible in dark mode */}
        <Animated.Text style={[styles.icon, { fontSize: s.iconSize, opacity: moonOpacity, right: 6 }]}>
          🌙
        </Animated.Text>

        {/* Sliding knob */}
        <Animated.View style={[
          styles.knob,
          {
            width:           s.knob,
            height:          s.knob,
            backgroundColor: isDark ? "#0F1923" : "#FFFFFF",
            transform:       [{ translateX: slideAnim }],
          },
        ]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius:   99,
    borderWidth:    1,
    justifyContent: "center",
    overflow:       "hidden",
  },
  knob: {
    position:     "absolute",
    borderRadius: 99,
    shadowColor:  "#000",
    shadowOpacity: 0.2,
    shadowRadius:  4,
    shadowOffset:  { width: 0, height: 2 },
    elevation:     3,
  },
  icon: {
    position:   "absolute",
    lineHeight: 20,
  },
});