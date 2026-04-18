/**
 * ActivePositionBanner.tsx — Live Position Tracker with Sell Alert
 *
 * Shown at the top of the home screen when the user has an open position.
 *  - Live P&L against current price
 *  - Target / Stop Loss progress bar
 *  - "Sell Now" alert when signal flips or target/SL is hit
 *  - "Mark as Sold" button to close the position and log P&L
 */

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert } from "react-native";
import { ActivePosition, TradeEntry, updateTradeEntry, saveActivePosition, loadTradeLog } from "../services/storage";
import { Theme } from "../constants/theme";

interface Props {
  position:     ActivePosition;
  currentPrice: number | null;   // live price from signals (null if not in current scan)
  currentSignal: "BUY" | "SELL" | "HOLD" | null;
  theme:        Theme;
  onSold:       (pl: number) => void;  // callback with ₹ P&L
}

export default function ActivePositionBanner({
  position, currentPrice, currentSignal, theme, onSold,
}: Props) {
  const priceDiff = currentPrice ? currentPrice - position.entryPrice : 0;
  const pl        = priceDiff * position.qty;
  const plPct     = (priceDiff / position.entryPrice) * 100;
  const plColor   = pl >= 0 ? theme.buy : theme.sell;

  const isNearTarget   = currentPrice && position.target   ? currentPrice >= position.target   : false;
  const isNearStopLoss = currentPrice && position.stopLoss ? currentPrice <= position.stopLoss : false;
  const isSellSignal   = currentSignal === "SELL";
  const shouldSell     = isNearTarget || isNearStopLoss || isSellSignal;

  // Pulse animation for sell alert
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (shouldSell) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.5, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [shouldSell]);

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ticker = position.symbol.replace(".NS", "").replace(".BO", "");

  // Progress toward target (0–100%)
  const targetProgress = position.target && currentPrice
    ? Math.min(100, Math.max(0, ((currentPrice - position.entryPrice) / (position.target - position.entryPrice)) * 100))
    : 0;

  const handleMarkSold = () => {
    const sellPrice = currentPrice ?? position.entryPrice;
    Alert.alert(
      "Mark as Sold",
      `Record ${ticker} sold at ₹${fmt(sellPrice)}?\nP&L: ${pl >= 0 ? "+" : ""}₹${fmt(Math.abs(pl))} (${plPct.toFixed(2)}%)`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Sold",
          onPress: async () => {
            // Update the trade log entry
            const log = await loadTradeLog();
            const entry = log.find(
              t => t.symbol === position.symbol && t.status === "OPEN"
            );
            if (entry) {
              await updateTradeEntry(entry.id, {
                exitPrice:    sellPrice,
                exitTime:     new Date().toISOString(),
                profitLoss:   parseFloat(pl.toFixed(2)),
                profitLossPct: parseFloat(plPct.toFixed(2)),
                status:       "CLOSED",
              });
            }
            await saveActivePosition(null);
            onSold(pl);
          },
        },
      ]
    );
  };

  return (
    <View style={[
      styles.banner,
      {
        backgroundColor: shouldSell ? theme.sell + "18" : theme.buy + "12",
        borderColor: shouldSell ? theme.sell + "55" : theme.buy + "33",
      },
    ]}>
      {/* Sell Alert Header */}
      {shouldSell && (
        <Animated.View
          style={[styles.sellAlert, { backgroundColor: theme.sell + "22", opacity: pulse }]}
        >
          <Text style={[styles.sellAlertText, { color: theme.sell }]}>
            {isNearTarget ? "🎯 TARGET HIT — Consider Selling!" :
             isNearStopLoss ? "🛑 STOP LOSS — Sell to Limit Loss!" :
             "📉 SIGNAL CHANGED TO SELL"}
          </Text>
        </Animated.View>
      )}

      {/* Position Info Row */}
      <View style={styles.row}>
        <View>
          <View style={styles.titleRow}>
            <View style={[styles.openDot, { backgroundColor: shouldSell ? theme.sell : theme.buy }]} />
            <Text style={[styles.label, { color: theme.textSecondary }]}>OPEN POSITION</Text>
          </View>
          <Text style={[styles.ticker, { color: theme.text }]}>{ticker}</Text>
          <Text style={[styles.details, { color: theme.textSecondary }]}>
            {position.qty} shares @ ₹{fmt(position.entryPrice)} · {position.entryTime}
          </Text>
        </View>

        <View style={styles.plBox}>
          <Text style={[styles.plAmt, { color: plColor }]}>
            {pl >= 0 ? "+" : ""}₹{fmt(Math.abs(pl))}
          </Text>
          <Text style={[styles.plPct, { color: plColor }]}>
            {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
          </Text>
          {currentPrice && (
            <Text style={[styles.cmp, { color: theme.textSecondary }]}>
              CMP ₹{fmt(currentPrice)}
            </Text>
          )}
        </View>
      </View>

      {/* Target Progress Bar */}
      {position.target && (
        <View style={styles.progressSection}>
          <View style={styles.progressLabels}>
            <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
              Entry ₹{fmt(position.entryPrice)}
            </Text>
            <Text style={[styles.progressLabel, { color: theme.buy }]}>
              Target ₹{fmt(position.target)}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
            <View style={[
              styles.progressFill,
              { width: `${targetProgress}%`, backgroundColor: targetProgress >= 100 ? theme.buy : theme.accent },
            ]} />
          </View>
          <Text style={[styles.progressPct, { color: theme.accent }]}>
            {targetProgress.toFixed(0)}% to target
          </Text>
        </View>
      )}

      {/* Projected Sell Time */}
      {position.projectedSellTime && (
        <Text style={[styles.sellTime, { color: theme.hold }]}>
          ⏱ Projected sell time: ~{position.projectedSellTime}
        </Text>
      )}

      {/* Mark Sold Button */}
      <TouchableOpacity
        onPress={handleMarkSold}
        style={[
          styles.soldBtn,
          { backgroundColor: shouldSell ? theme.sell : theme.surface, borderColor: shouldSell ? theme.sell : theme.border },
        ]}
      >
        <Text style={[styles.soldText, { color: shouldSell ? "#fff" : theme.textSecondary }]}>
          {shouldSell ? "✓ Mark as Sold" : "Mark as Sold"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  sellAlert: {
    borderRadius: 8, padding: 8, marginBottom: 10, alignItems: "center",
  },
  sellAlertText: { fontSize: 13, fontWeight: "800", textAlign: "center" },

  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  openDot: { width: 7, height: 7, borderRadius: 4 },
  label:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  ticker:  { fontSize: 22, fontWeight: "900" },
  details: { fontSize: 11, marginTop: 2 },

  plBox:  { alignItems: "flex-end" },
  plAmt:  { fontSize: 20, fontWeight: "900" },
  plPct:  { fontSize: 13, fontWeight: "700" },
  cmp:    { fontSize: 10, marginTop: 2 },

  progressSection: { marginTop: 12 },
  progressLabels: {
    flexDirection: "row", justifyContent: "space-between", marginBottom: 4,
  },
  progressLabel: { fontSize: 10 },
  progressTrack: {
    height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 3,
  },
  progressFill: { height: "100%", borderRadius: 3 },
  progressPct:  { fontSize: 10, textAlign: "right" },

  sellTime: { fontSize: 11, fontWeight: "600", marginTop: 8 },

  soldBtn: {
    marginTop: 12, borderRadius: 10, borderWidth: 1,
    paddingVertical: 10, alignItems: "center",
  },
  soldText: { fontSize: 13, fontWeight: "700" },
});
