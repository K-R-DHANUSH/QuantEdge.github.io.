/**
 * MarketSummaryBar.tsx — Live Market Summary Strip
 *
 * Shows:
 *  - BUY count  (green)
 *  - SELL count (red)
 *  - HOLD count (amber)
 *  - Confluence count (lightning)
 *  - Open positions count
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { StockSignal } from "../services/api";
import { Theme } from "../constants/theme";

interface Props {
  signals:  StockSignal[];
  theme:    Theme;
  openPos:  number;
}

export default function MarketSummaryBar({ signals, theme, openPos }: Props) {
  const buy  = signals.filter(s => s.signal === "BUY").length;
  const sell = signals.filter(s => s.signal === "SELL").length;
  const hold = signals.filter(s => s.signal === "HOLD").length;
  const conf = signals.filter(s => s.confluence).length;

  return (
    <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Stat label="BUY"  value={buy}    color={theme.buy}           emoji="🟢" />
      <Div theme={theme} />
      <Stat label="SELL" value={sell}   color={theme.sell}          emoji="🔴" />
      <Div theme={theme} />
      <Stat label="HOLD" value={hold}   color={theme.hold}          emoji="🟡" />
      <Div theme={theme} />
      <Stat label="⚡ CONF" value={conf} color={theme.confluenceGlow} emoji="" />
      <Div theme={theme} />
      <Stat label="OPEN POS" value={openPos} color={theme.accent}   emoji="📊" />
    </View>
  );
}

function Stat({ label, value, color, emoji }: { label: string; value: number; color: string; emoji: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, { color }]}>{value}</Text>
      <Text style={[styles.statLbl, { color: color + "99" }]}>{label}</Text>
    </View>
  );
}

function Div({ theme }: { theme: Theme }) {
  return <View style={[styles.div, { backgroundColor: theme.border }]} />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  statVal: {
    fontSize: 18, fontWeight: "800",
  },
  statLbl: {
    fontSize: 9, fontWeight: "600", marginTop: 1, letterSpacing: 0.3,
  },
  div: {
    width: 1, height: 28,
  },
});