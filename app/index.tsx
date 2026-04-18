/**
 * index.tsx — Main Home Screen v2
 *
 * WHAT'S NEW vs v1:
 *  - MarketSummaryBar (buy/sell/hold/confluence/open positions count)
 *  - Confluence alerts (separate notification for high-conviction trades)
 *  - Filter tabs: ALL / BUY / SELL / HOLD
 *  - Last scan countdown timer
 *  - Open positions indicator in header
 *  - Rank medals on top 3 BUY signals
 *  - Pull-to-refresh with haptic feedback (iOS)
 *  - Error retry button
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, FlatList, ActivityIndicator,
  RefreshControl, StyleSheet, TouchableOpacity,
  StatusBar, Platform, Animated,
} from "react-native";
import { useColorScheme } from "react-native";
import { fetchSignals, StockSignal } from "../services/api";
import { lightTheme, darkTheme } from "../constants/theme";
import StockCard from "../components/StockCard";
import BestStockCard from "../components/BestStockCard";
import MarketSummaryBar from "../components/Marketsummarybar";
import {
  registerForPushNotifications,
  sendBuyNotification,
  sendSellNotification,
  sendMarketOpenNotification,
  sendMarketCloseNotification,
  sendConfluenceAlert,
} from "../services/notifications";

type FilterType = "ALL" | "BUY" | "SELL" | "HOLD";

const POLL_INTERVAL = 5000; // 5 seconds

export default function Home() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [signals,       setSignals]      = useState<StockSignal[]>([]);
  const [loading,       setLoading]      = useState(true);
  const [refreshing,    setRefreshing]   = useState(false);
  const [marketOpen,    setMarketOpen]   = useState(false);
  const [marketMessage, setMarketMsg]    = useState<string>("");
  const [lastUpdated,   setLastUpdated]  = useState<string>("");
  const [error,         setError]        = useState<string | null>(null);
  const [filter,        setFilter]       = useState<FilterType>("ALL");
  const [openPos,       setOpenPos]      = useState(0);
  const [bestSymbol,    setBestSymbol]   = useState<string | null>(null);
  const [countdown,     setCountdown]    = useState(POLL_INTERVAL / 1000);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const scheme = useColorScheme();
  const theme  = scheme === "dark" ? darkTheme : lightTheme;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const prevSignals    = useRef<Record<string, string>>({});
  const prevConfluence = useRef<Record<string, boolean>>({});
  const wasMarketOpen  = useRef(false);

  // Animated pulse for LIVE indicator
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Load Data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetchSignals();

      setMarketOpen(response.marketOpen);
      setOpenPos(response.openPositions || 0);
      setBestSymbol(response.bestStock);

      if (!response.marketOpen) {
        setMarketMsg(response.message || "Market is closed");
        if (wasMarketOpen.current) {
          sendMarketCloseNotification();
          wasMarketOpen.current = false;
        }
        setLoading(false);
        return;
      }

      if (!wasMarketOpen.current) {
        sendMarketOpenNotification();
        wasMarketOpen.current = true;
      }

      // ── Notifications ─────────────────────────────────────────────────
      for (const stock of response.signals) {
        const prev = prevSignals.current[stock.symbol];

        if (stock.isNewSignal) {
          if (stock.signal === "BUY") {
            await sendBuyNotification(
              stock.symbol, stock.price,
              stock.target, stock.stopLoss,
              stock.score, stock.confluence,
              stock.projectedSellTime, stock.mfi
            );
          } else if (stock.signal === "SELL") {
            await sendSellNotification(
              stock.symbol, stock.price,
              stock.exitReason, stock.profitLoss,
              stock.entryPrice
            );
          }
        } else if (prev && prev !== stock.signal) {
          if (stock.signal === "BUY") {
            await sendBuyNotification(
              stock.symbol, stock.price,
              stock.target, stock.stopLoss,
              stock.score, stock.confluence,
              stock.projectedSellTime, stock.mfi
            );
          } else if (stock.signal === "SELL") {
            await sendSellNotification(
              stock.symbol, stock.price,
              null, null, null
            );
          }
        }

        // Confluence alert (once, on detection)
        if (stock.confluence && !prevConfluence.current[stock.symbol] && stock.signal === "BUY") {
          await sendConfluenceAlert(stock.symbol, stock.score);
        }

        prevSignals.current[stock.symbol]    = stock.signal;
        prevConfluence.current[stock.symbol] = stock.confluence;
      }

      setSignals(response.signals);
      setLastUpdated(
        new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })
      );
      setCountdown(POLL_INTERVAL / 1000);
    } catch {
      setError("Connection failed. Retrying…");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────
  useEffect(() => {
    registerForPushNotifications();
    loadData();
    const poll = setInterval(loadData, POLL_INTERVAL);
    return () => clearInterval(poll);
  }, [loadData]);

  // Countdown tick
  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  // ── Filtered signals ──────────────────────────────────────────────────────
  const filtered = filter === "ALL"
    ? signals
    : signals.filter(s => s.signal === filter);

  const buyCount  = signals.filter(s => s.signal === "BUY").length;
  const sellCount = signals.filter(s => s.signal === "SELL").length;
  const bestBuy   = signals.find(s => s.symbol === bestSymbol && s.signal === "BUY")
                 || signals.find(s => s.signal === "BUY")
                 || null;

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.buy} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Scanning 20 stocks · 12 indicators…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={scheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={theme.surface}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            📈 StockPulse
          </Text>
          <View style={styles.headerSubRow}>
            <Animated.View style={[styles.liveDot, { backgroundColor: theme.buy, opacity: pulse }]} />
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              NSE · BSE · {marketOpen ? `Next scan in ${countdown}s` : "Closed"}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {marketOpen ? (
            <>
              <View style={[styles.pill, { backgroundColor: theme.buy + "22" }]}>
                <Text style={[styles.pillText, { color: theme.buy }]}>🟢 {buyCount} BUY</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: theme.sell + "22" }]}>
                <Text style={[styles.pillText, { color: theme.sell }]}>{sellCount} SELL</Text>
              </View>
            </>
          ) : (
            <View style={[styles.pill, { backgroundColor: theme.border }]}>
              <Text style={[styles.pillText, { color: theme.textSecondary }]}>🔴 Closed</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Market Closed Banner ────────────────────────────────────────── */}
      {!marketOpen && (
        <View style={[styles.closedBanner, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.closedTitle, { color: theme.text }]}>🕐 Market is Closed</Text>
          <Text style={[styles.closedSub, { color: theme.textSecondary }]}>{marketMessage}</Text>
          <Text style={[styles.closedSub, { color: theme.textSecondary, marginTop: 4 }]}>
            NSE & BSE: Mon–Fri · 9:15 AM – 3:30 PM IST
          </Text>
        </View>
      )}

      {/* ── Error Banner ────────────────────────────────────────────────── */}
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: theme.sell + "18" }]}>
          <Text style={{ color: theme.sell, fontSize: 13 }}>⚠️ {error}</Text>
          <TouchableOpacity onPress={loadData} style={[styles.retryBtn, { borderColor: theme.sell }]}>
            <Text style={{ color: theme.sell, fontSize: 12, fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Market Summary Bar ───────────────────────────────────────────── */}
      {marketOpen && signals.length > 0 && (
        <MarketSummaryBar signals={signals} theme={theme} openPos={openPos} />
      )}

      {/* ── Filter Tabs ─────────────────────────────────────────────────── */}
      {marketOpen && signals.length > 0 && (
        <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
          {(["ALL", "BUY", "SELL", "HOLD"] as FilterType[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.tab,
                filter === f && { borderBottomColor: theme.accent, borderBottomWidth: 2 }
              ]}
            >
              <Text style={[
                styles.tabText,
                { color: filter === f ? theme.accent : theme.textSecondary },
              ]}>
                {f === "BUY" ? `🟢 ${buyCount}` : f === "SELL" ? `🔴 ${sellCount}` : f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Main List ───────────────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.symbol}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.buy}
            colors={[theme.buy]}
          />
        }
        ListHeaderComponent={
          bestBuy && marketOpen && filter === "ALL" ? (
            <BestStockCard item={bestBuy} theme={theme} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>📊</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {marketOpen ? "Waiting for signals…" : "Market is closed"}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          // Rank only applies to BUY signals when viewing ALL
          const buyRank = filter === "ALL" && item.signal === "BUY"
            ? signals.filter(s => s.signal === "BUY").indexOf(item) + 1
            : undefined;
          return <StockCard item={item} theme={theme} rank={buyRank} />;
        }}
        ListFooterComponent={
          lastUpdated ? (
            <Text style={[styles.footer, { color: theme.textSecondary }]}>
              Last scan: {lastUpdated} · {signals.length} stocks · 12 indicators
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1 },
  centered:    { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },

  header: {
    flexDirection:    "row",
    justifyContent:   "space-between",
    alignItems:       "center",
    paddingHorizontal: 16,
    paddingTop:       Platform.OS === "ios" ? 54 : 16,
    paddingBottom:    12,
    borderBottomWidth: 1,
  },
  headerTitle:  { fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  liveDot:      { width: 6, height: 6, borderRadius: 3 },
  headerSub:    { fontSize: 11 },
  headerRight:  { flexDirection: "row", gap: 6 },
  pill:         { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  pillText:     { fontSize: 11, fontWeight: "600" },

  closedBanner: {
    margin: 12, padding: 16, borderRadius: 12, borderWidth: 1, alignItems: "center",
  },
  closedTitle: { fontSize: 17, fontWeight: "600", marginBottom: 4 },
  closedSub:   { fontSize: 13, textAlign: "center" },

  errorBanner: {
    marginHorizontal: 12, marginBottom: 4, padding: 10, borderRadius: 8,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  retryBtn: {
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },

  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    marginBottom: 4,
  },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10,
  },
  tabText: {
    fontSize: 12, fontWeight: "600",
  },

  empty:     { alignItems: "center", paddingTop: 60 },
  emptyText: { marginTop: 12, fontSize: 15 },

  footer: {
    textAlign: "center", fontSize: 11, paddingVertical: 16,
  },
});