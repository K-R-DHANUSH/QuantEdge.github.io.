/**
 * CandleChart.tsx — Mini Price History Chart
 *
 * WHAT THIS FILE DOES:
 *  Shows a small line chart of the last 30 price points.
 *  Colors the line green if the price is going up, red if going down.
 *  Used inside StockCard to give visual context.
 *
 * SETUP:
 *  npm install react-native-chart-kit react-native-svg
 *
 * NOTE:
 *  For full candlestick charts (with open/high/low/close bars),
 *  look into 'victory-native' or 'react-native-wagmi-charts'.
 *  We use LineChart here because it's simpler to set up.
 */

import React from "react";
import { View, Dimensions } from "react-native";
import { LineChart } from "react-native-chart-kit";

interface Props {
  prices:    number[];    // Array of closing prices
  cardColor: string;      // Background color of the parent card (for chart bg)
  lineColor: string;      // Color of the price line (buy=green, sell=red)
}

export default function CandleChart({ prices, cardColor, lineColor }: Props) {
  // Need at least 10 data points to draw a meaningful chart
  if (!prices || prices.length < 10) return null;

  // Take only the last 30 prices (more than this gets crowded)
  const chartData = prices.slice(-30);

  // Remove any null/undefined values (Yahoo Finance can return gaps)
  const cleanData = chartData.filter(p => p !== null && p !== undefined && !isNaN(p));
  if (cleanData.length < 5) return null;

  const screenWidth = Dimensions.get("window").width;

  return (
    <View style={{ marginTop: 10, marginHorizontal: -4 }}>
      <LineChart
        data={{
          // Empty labels = no x-axis text (keeps it clean)
          labels:   cleanData.map(() => ""),
          datasets: [{ data: cleanData }],
        }}
        width={screenWidth - 52}    // Full card width minus padding
        height={80}                  // Short sparkline style
        withDots={false}             // No circles on data points
        withInnerLines={false}       // No horizontal grid lines
        withOuterLines={false}       // No border
        withVerticalLines={false}
        withHorizontalLines={false}
        withHorizontalLabels={false} // No y-axis labels
        withVerticalLabels={false}   // No x-axis labels
        chartConfig={{
          // Chart background matches the card background
          backgroundGradientFrom:         cardColor,
          backgroundGradientFromOpacity:  0,
          backgroundGradientTo:           cardColor,
          backgroundGradientToOpacity:    0,
          // Line color — returns a string with optional opacity
          color: (opacity = 1) => lineColor + Math.round(opacity * 255).toString(16).padStart(2, "0"),
          strokeWidth: 2,
        }}
        bezier     // Smooth curved line instead of sharp angles
        style={{
          marginLeft: -16,  // Align with card edges
          paddingRight: 0,
        }}
        transparent  // Don't fill under the line (cleaner look)
      />
    </View>
  );
}