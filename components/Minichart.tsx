/**
 * MiniChart.tsx — Lightweight SVG Sparkline
 *
 * Draws a clean price sparkline using react-native-svg only.
 * No react-native-chart-kit needed (CandleChart.tsx is replaced by this).
 *
 * Install: npx expo install react-native-svg
 */

import React from "react";
import { View } from "react-native";
import Svg, { Polyline, LinearGradient, Defs, Stop, Path } from "react-native-svg";

interface Props {
  prices: number[];
  color:  string;   // line color (green for BUY, red for SELL)
  width?: number;
  height?: number;
}

export default function MiniChart({ prices, color, width = 120, height = 36 }: Props) {
  if (!prices || prices.length < 5) return null;

  const data = prices.slice(-20).filter(v => v != null && !isNaN(v));
  if (data.length < 5) return null;

  const min   = Math.min(...data);
  const max   = Math.max(...data);
  const range = max - min || 1;
  const pad   = 3;

  const points = data.map((p, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + ((max - p) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(" ");

  // Build filled area path (line + close to bottom)
  const areaPath =
    `M ${points[0]} ` +
    points.slice(1).map(p => `L ${p}`).join(" ") +
    ` L ${(pad + (width - pad * 2)).toFixed(1)},${(height - pad).toFixed(1)}` +
    ` L ${pad},${(height - pad).toFixed(1)} Z`;

  return (
    <View style={{ marginTop: 8 }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"   stopColor={color} stopOpacity={0.25} />
            <Stop offset="1"   stopColor={color} stopOpacity={0}    />
          </LinearGradient>
        </Defs>
        {/* Filled gradient area under line */}
        <Path d={areaPath} fill="url(#grad)" />
        {/* Price line */}
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
      </Svg>
    </View>
  );
}
