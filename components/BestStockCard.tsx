/**
 * BestStockCard.tsx — Elite "Best Opportunity" Hero Card v2
 *
 * Shows:
 *  - Stock name, price, signal + confluence badge
 *  - Animated confidence bar
 *  - Target / Stop Loss / Projected Sell Time grid
 *  - All 12 indicator pills: RSI, MFI, CCI, MACD, Stoch, VWAP Dev, ADX
 *  - Entry info + live P&L if position is open
 *  - Reasons/signals list
 */

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Platform } from "react-native";
import { StockSignal } from "../services/api";
import { Theme } from "../constants/theme";

interface Props {
  item:  StockSignal;
  theme: Theme;
}

export default function BestStockCard({ item, theme }: Props) {
  // Animate the confidence bar on mount / update
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue:         item.score,
      duration:        800,
      useNativeDriver: false,
    }).start();
  }, [item.score]);

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const adxLabel =
    !item.trendStrength       ? "—"       :
    item.trendStrength >= 40  ? "Strong"  :
    item.trendStrength >= 25  ? "Moderate": "Weak";

  const pl = item.profitLoss ? Number(item.profitLoss) : null;

  return (
    <View style={styles.card}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerLabel}>🔥 Best Opportunity</Text>
          {item.confluence && (
            <View style={styles.confluenceBadge}>
              <Text style={styles.confluenceText}>⚡ CONFLUENCE</Text>
            </View>
          )}
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* ── Symbol + Signal ─────────────────────────────────────────────── */}
      <View style={styles.row}>
        <View>
          <Text style={styles.symbol}>
            {item.symbol.replace(".NS", "").replace(".BO", "")}
          </Text>
          <Text style={styles.exchange}>{item.exchange} Exchange</Text>
        </View>
        <View style={styles.signalPill}>
          <Text style={styles.signalText}>🚀 {item.signal}</Text>
        </View>
      </View>

      {/* ── Price ──────────────────────────────────────────────────────── */}
      <Text style={styles.price}>₹ {fmt(item.price)}</Text>

      {/* ── Confidence Bar ─────────────────────────────────────────────── */}
      <View style={styles.confRow}>
        <Text style={styles.confLabel}>Signal Confidence</Text>
        <Text style={styles.confPct}>{item.score}%</Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            { width: barWidth.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
            item.score >= 80 ? styles.barHigh : item.score >= 65 ? styles.barMed : styles.barLow,
          ]}
        />
      </View>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ── Target / Stop Loss / Sell Time ─────────────────────────────── */}
      <View style={styles.grid}>
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Target</Text>
          <Text style={[styles.gridValue, { color: "#5DFFAA" }]}>
            {item.target ? `₹${fmt(item.target)}` : "—"}
          </Text>
        </View>
        <View style={styles.gridDiv} />
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Stop Loss</Text>
          <Text style={[styles.gridValue, { color: "#FF8080" }]}>
            {item.stopLoss ? `₹${fmt(item.stopLoss)}` : "—"}
          </Text>
        </View>
        <View style={styles.gridDiv} />
        <View style={styles.gridItem}>
          <Text style={styles.gridLabel}>Sell By ~</Text>
          <Text style={[styles.gridValue, { color: "#FFD580" }]}>
            {item.projectedSellTime || item.entryPrice ? (item.projectedSellTime || "Open") : "—"}
          </Text>
          {item.entryTime && !item.projectedSellTime && (
            <Text style={styles.gridSub}>Entry {item.entryTime}</Text>
          )}
        </View>
      </View>

      {/* ── Open Position P&L ──────────────────────────────────────────── */}
      {item.entryPrice && (
        <View style={styles.plRow}>
          <Text style={styles.plLabel}>
            Entry ₹{fmt(item.entryPrice)} @ {item.entryTime}
          </Text>
          {pl !== null && (
            <Text style={[styles.plValue, { color: pl >= 0 ? "#5DFFAA" : "#FF8080" }]}>
              {pl >= 0 ? "+" : ""}{pl}%
            </Text>
          )}
        </View>
      )}

      <View style={styles.divider} />

      {/* ── 12-Indicator Pills ──────────────────────────────────────────── */}
      <View style={styles.indRow}>
        {item.rsi !== null && (
          <View style={[styles.indPill, item.rsi < 30 && styles.indPillGreen]}>
            <Text style={styles.indLbl}>RSI</Text>
            <Text style={styles.indVal}>{item.rsi}</Text>
          </View>
        )}
        {item.mfi !== null && (
          <View style={[styles.indPill, item.mfi < 20 && styles.indPillPurple]}>
            <Text style={styles.indLbl}>MFI</Text>
            <Text style={styles.indVal}>{item.mfi}</Text>
          </View>
        )}
        {item.cci !== null && (
          <View style={[styles.indPill, item.cci < -100 && styles.indPillGreen]}>
            <Text style={styles.indLbl}>CCI</Text>
            <Text style={styles.indVal}>{item.cci}</Text>
          </View>
        )}
        {item.stochK !== null && (
          <View style={[styles.indPill, item.stochK < 20 && styles.indPillGreen]}>
            <Text style={styles.indLbl}>STOCH</Text>
            <Text style={styles.indVal}>{item.stochK}</Text>
          </View>
        )}
        {item.trendStrength !== null && (
          <View style={[styles.indPill, item.trendStrength >= 25 && styles.indPillBlue]}>
            <Text style={styles.indLbl}>ADX</Text>
            <Text style={styles.indVal}>{item.trendStrength} · {adxLabel}</Text>
          </View>
        )}
        {item.vwapDeviation !== null && (
          <View style={[styles.indPill, item.vwapDeviation < -1 && styles.indPillGreen]}>
            <Text style={styles.indLbl}>VWAP</Text>
            <Text style={styles.indVal}>{item.vwapDeviation > 0 ? "+" : ""}{item.vwapDeviation}%</Text>
          </View>
        )}
        {item.macdHistogram !== null && (
          <View style={[styles.indPill, item.macdHistogram > 0 && styles.indPillGreen]}>
            <Text style={styles.indLbl}>MACD</Text>
            <Text style={styles.indVal}>{item.macdHistogram > 0 ? "+" : ""}{item.macdHistogram}</Text>
          </View>
        )}
      </View>

      {/* ── Reasons ────────────────────────────────────────────────────── */}
      {item.reasons.length > 0 && (
        <Text style={styles.reasons}>
          {item.reasons.join("  ·  ")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#001A0D",
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     "#00D06055",
    padding:         18,
    marginBottom:    14,
    shadowColor:     "#00D060",
    shadowOpacity:   0.3,
    shadowRadius:    16,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       10,
  },
  headerRow: {
    flexDirection:  "row",
    justifyContent: "space-between",
    alignItems:     "center",
    marginBottom:   14,
  },
  headerLeft: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  headerLabel: {
    color: "#ffffff", fontSize: 13, fontWeight: "600", opacity: 0.85,
  },
  confluenceBadge: {
    backgroundColor: "#00D06030",
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, borderColor: "#00D06066",
  },
  confluenceText: {
    color: "#00D060", fontSize: 10, fontWeight: "800", letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#00D06020",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: "#00D060",
  },
  liveText: {
    color: "#00D060", fontSize: 10, fontWeight: "700", letterSpacing: 0.8,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 4,
  },
  symbol: {
    color: "#FFFFFF", fontSize: 30, fontWeight: "800", letterSpacing: 0.3,
  },
  exchange: {
    color: "#ffffff55", fontSize: 12, marginTop: 2,
  },
  signalPill: {
    backgroundColor: "#ffffff15", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  signalText: {
    color: "#FFFFFF", fontSize: 15, fontWeight: "700",
  },
  price: {
    color: "#FFFFFF", fontSize: 26, fontWeight: "700", marginBottom: 12,
  },
  confRow: {
    flexDirection: "row", justifyContent: "space-between", marginBottom: 5,
  },
  confLabel: {
    color: "#ffffff66", fontSize: 11,
  },
  confPct: {
    color: "#00D060", fontSize: 11, fontWeight: "700",
  },
  barTrack: {
    height: 5, backgroundColor: "#ffffff15", borderRadius: 5,
    overflow: "hidden", marginBottom: 14,
  },
  barFill: {
    height: "100%", borderRadius: 5,
  },
  barHigh: { backgroundColor: "#00D060" },
  barMed:  { backgroundColor: "#FFD060" },
  barLow:  { backgroundColor: "#FF8040" },
  divider: {
    height: 1, backgroundColor: "#ffffff15", marginVertical: 12,
  },
  grid: {
    flexDirection: "row", justifyContent: "space-between",
  },
  gridItem: {
    flex: 1, alignItems: "center",
  },
  gridDiv: {
    width: 1, backgroundColor: "#ffffff15", marginVertical: 2,
  },
  gridLabel: {
    color: "#ffffff55", fontSize: 11, marginBottom: 5,
  },
  gridValue: {
    fontSize: 14, fontWeight: "700", color: "#FFFFFF",
  },
  gridSub: {
    color: "#ffffff55", fontSize: 10, marginTop: 2,
  },
  plRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#ffffff08", borderRadius: 8, borderWidth: 1,
    borderColor: "#ffffff15", padding: 8, marginTop: 10,
  },
  plLabel: {
    color: "#ffffff66", fontSize: 11,
  },
  plValue: {
    fontSize: 14, fontWeight: "800",
  },
  indRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
  },
  indPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#ffffff10",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
    borderWidth: 1, borderColor: "#ffffff15",
  },
  indPillGreen:  { borderColor: "#00D06050", backgroundColor: "#00D06015" },
  indPillPurple: { borderColor: "#9B5DE560", backgroundColor: "#9B5DE515" },
  indPillBlue:   { borderColor: "#3D7AFF50", backgroundColor: "#3D7AFF15" },
  indLbl: {
    color: "#ffffff55", fontSize: 10, fontWeight: "500",
  },
  indVal: {
    color: "#FFFFFF", fontSize: 10, fontWeight: "700",
  },
  reasons: {
    color: "#ffffff55", fontSize: 11, marginTop: 10, lineHeight: 17,
  },
});