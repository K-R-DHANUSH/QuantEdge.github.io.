/**
 * MiniChart.tsx — Lightweight SVG Sparkline (no external chart lib needed)
 *
 * Draws a clean price sparkline using react-native-svg.
 * Falls back gracefully if data is unavailable.
 *
 * Setup: npx expo install react-native-svg
 */

import React from "react";
import { View } from "react-native";
import Svg, { Polyline, Defs, LinearGradient, Stop, Rect } from "react-native-svg";

interface Props {
  prices:    number[];
  color:     string;    // Line color (buy=green, sell=red)
  width?:    number;
  height?:   number;
}

export default function MiniChart({ prices, color, width = 120, height = 36 }: Props) {
  if (!prices || prices.length < 5) return null;

  const data = prices.slice(-20).filter(Boolean);
  if (data.length < 5) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pad = 3;
  const points = data.map((p, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + ((max - p) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <View style={{ marginTop: 8 }}>
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      </Svg>
    </View>
  );
}