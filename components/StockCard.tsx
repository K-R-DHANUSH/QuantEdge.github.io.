/**
 * StockCard.tsx — Individual Stock Signal Card v2
 *
 * Enhancements:
 *  - Confluence glow border
 *  - MFI / CCI / VWAP mini indicators
 *  - Projected sell time
 *  - Animated left-border on new signals
 *  - MACD histogram color indicator
 */

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { StockSignal } from "../services/api";
import { Theme } from "../constants/theme";

interface Props {
  item:  StockSignal;
  theme: Theme;
  rank?: number;   // 1 = top pick
}

export default function StockCard({ item, theme, rank }: Props) {
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Flash animation for new signals
  useEffect(() => {
    if (item.isNewSignal) {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.timing(flashAnim, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]).start();
    }
  }, [item.isNewSignal]);

  const signalColor =
    item.signal === "BUY"  ? theme.buy  :
    item.signal === "SELL" ? theme.sell : theme.hold;

  const signalEmoji =
    item.signal === "BUY"  ? "🚀" :
    item.signal === "SELL" ? "📉" : "⏸️";

  const pl      = item.profitLoss ? Number(item.profitLoss) : null;
  const plColor = pl !== null
    ? (pl >= 0 ? theme.positive : theme.negative)
    : theme.textSecondary;

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const flashBg = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.card, signalColor + "22"],
  });

  return (
    <Animated.View style={[
      styles.card,
      {
        backgroundColor: flashBg as any,
        borderColor: item.confluence ? signalColor + "55" : theme.border,
        borderLeftColor: signalColor,
        borderLeftWidth: 4,
        // Confluence glow
        shadowColor:   item.confluence ? signalColor : theme.shadow,
        shadowOpacity: item.confluence ? 0.25 : 0.06,
        shadowRadius:  item.confluence ? 12   : 6,
        shadowOffset:  { width: 0, height: 2 },
        elevation:     item.confluence ? 6 : 3,
      },
    ]}>

      {/* ── Row 1: Symbol + Signal ──────────────────────────────────────── */}
      <View style={styles.row}>
        <View style={styles.symbolRow}>
          {rank && rank <= 3 && (
            <Text style={styles.rank}>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</Text>
          )}
          <Text style={[styles.symbol, { color: theme.text }]}>
            {item.symbol.replace(".NS", "").replace(".BO", "")}
          </Text>
          <View style={[styles.exchBadge, { backgroundColor: theme.pill }]}>
            <Text style={[styles.exchText, { color: theme.textSecondary }]}>
              {item.exchange}
            </Text>
          </View>
          {item.confluence && (
            <View style={[styles.confBadge, { borderColor: signalColor + "55" }]}>
              <Text style={[styles.confText, { color: signalColor }]}>⚡</Text>
            </View>
          )}
        </View>

        <View style={[styles.sigBadge, { backgroundColor: signalColor + "20" }]}>
          <Text style={[styles.sigText, { color: signalColor }]}>
            {signalEmoji} {item.signal}
          </Text>
          <Text style={[styles.sigScore, { color: signalColor }]}>
            {item.score}%
          </Text>
        </View>
      </View>

      {/* ── Row 2: Price ───────────────────────────────────────────────── */}
      <Text style={[styles.price, { color: theme.text }]}>
        ₹ {fmt(item.price)}
      </Text>

      {/* ── Row 3: Target + Stop ───────────────────────────────────────── */}
      {(item.target || item.stopLoss) && (
        <View style={styles.row}>
          {item.target && (
            <View style={styles.priceTag}>
              <Text style={[styles.ptLabel, { color: theme.textSecondary }]}>Target</Text>
              <Text style={[styles.ptValue, { color: theme.positive }]}>
                ₹{fmt(item.target)}
              </Text>
            </View>
          )}
          {item.stopLoss && (
            <View style={styles.priceTag}>
              <Text style={[styles.ptLabel, { color: theme.textSecondary }]}>Stop Loss</Text>
              <Text style={[styles.ptValue, { color: theme.negative }]}>
                ₹{fmt(item.stopLoss)}
              </Text>
            </View>
          )}
          {item.projectedSellTime && (
            <View style={styles.priceTag}>
              <Text style={[styles.ptLabel, { color: theme.textSecondary }]}>Sell ~</Text>
              <Text style={[styles.ptValue, { color: theme.hold }]}>
                {item.projectedSellTime}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Row 4: Entry + P&L ─────────────────────────────────────────── */}
      {item.entryPrice && (
        <View style={[styles.entryBox, {
          backgroundColor: theme.surface + "88",
          borderColor: theme.border,
        }]}>
          <Text style={[styles.entryText, { color: theme.textSecondary }]}>
            Entry ₹{fmt(item.entryPrice)} @ {item.entryTime}
          </Text>
          {pl !== null && (
            <Text style={[styles.plText, { color: plColor }]}>
              {pl >= 0 ? "+" : ""}{pl}%
            </Text>
          )}
        </View>
      )}

      {item.exitReason && (
        <Text style={[styles.exitReason, { color: signalColor }]}>
          {item.exitReason}
        </Text>
      )}

      {/* ── Row 5: Indicator Pills ──────────────────────────────────────── */}
      <View style={styles.indRow}>
        {item.rsi !== null && (
          <View style={[styles.indPill, { backgroundColor: theme.pill }]}>
            <Text style={[styles.indLbl, { color: theme.textSecondary }]}>RSI</Text>
            <Text style={[styles.indVal, {
              color: item.rsi < 30 ? theme.buy : item.rsi > 70 ? theme.sell : theme.text
            }]}>{item.rsi}</Text>
          </View>
        )}
        {item.mfi !== null && (
          <View style={[styles.indPill, { backgroundColor: theme.pill }]}>
            <Text style={[styles.indLbl, { color: theme.textSecondary }]}>MFI</Text>
            <Text style={[styles.indVal, {
              color: item.mfi < 20 ? theme.mfi : item.mfi > 80 ? theme.sell : theme.text
            }]}>{item.mfi}</Text>
          </View>
        )}
        {item.trendStrength !== null && (
          <View style={[styles.indPill, { backgroundColor: theme.pill }]}>
            <Text style={[styles.indLbl, { color: theme.textSecondary }]}>ADX</Text>
            <Text style={[styles.indVal, {
              color: item.trendStrength >= 25 ? theme.accent : theme.textSecondary
            }]}>{item.trendStrength}</Text>
          </View>
        )}
        {item.vwapDeviation !== null && (
          <View style={[styles.indPill, { backgroundColor: theme.pill }]}>
            <Text style={[styles.indLbl, { color: theme.textSecondary }]}>VWAP</Text>
            <Text style={[styles.indVal, {
              color: item.vwapDeviation < 0 ? theme.buy : item.vwapDeviation > 1 ? theme.sell : theme.text
            }]}>{item.vwapDeviation > 0 ? "+" : ""}{item.vwapDeviation}%</Text>
          </View>
        )}
        {item.macdHistogram !== null && (
          <View style={[styles.indPill, { backgroundColor: theme.pill }]}>
            <Text style={[styles.indLbl, { color: theme.textSecondary }]}>MACD</Text>
            <Text style={[styles.indVal, {
              color: item.macdHistogram > 0 ? theme.buy : theme.sell
            }]}>{item.macdHistogram > 0 ? "▲" : "▼"}</Text>
          </View>
        )}
      </View>

      {/* ── Row 6: Reasons ─────────────────────────────────────────────── */}
      {item.reasons.length > 0 && (
        <Text style={[styles.reasons, { color: theme.textSecondary }]}>
          {item.reasons.slice(0, 4).join(" · ")}
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius:  14,
    borderWidth:   1,
    marginBottom:  10,
    padding:       14,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 6,
  },
  symbolRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  rank: {
    fontSize: 14,
  },
  symbol: {
    fontSize: 18, fontWeight: "700", letterSpacing: 0.3,
  },
  exchBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  exchText: {
    fontSize: 10, fontWeight: "600",
  },
  confBadge: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, borderWidth: 1,
  },
  confText: {
    fontSize: 10,
  },
  sigBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  sigText: {
    fontSize: 13, fontWeight: "700",
  },
  sigScore: {
    fontSize: 11,
  },
  price: {
    fontSize: 22, fontWeight: "700", marginBottom: 8,
  },
  priceTag: {
    marginRight: 16,
  },
  ptLabel: {
    fontSize: 11, marginBottom: 1,
  },
  ptValue: {
    fontSize: 13, fontWeight: "700",
  },
  entryBox: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderRadius: 8, borderWidth: 1, padding: 8, marginVertical: 6,
  },
  entryText: {
    fontSize: 11,
  },
  plText: {
    fontSize: 13, fontWeight: "700",
  },
  exitReason: {
    fontSize: 12, fontWeight: "600", marginBottom: 4,
  },
  indRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, marginBottom: 4,
  },
  indPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5,
  },
  indLbl: {
    fontSize: 10,
  },
  indVal: {
    fontSize: 11, fontWeight: "700",
  },
  reasons: {
    fontSize: 11, marginTop: 4, lineHeight: 16,
  },
});