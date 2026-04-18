/**
<<<<<<< HEAD
 * index.tsx — Main Home Screen v2.1
 *
 * Fixes from v2.0:
 *  - Notification spam fixed: BUY/SELL only fires once per new signal
 *  - Confluence alert deduplication fixed (was firing every poll)
 *  - Rank calculation moved out of renderItem (was O(n²) on every render)
 *  - Polling cleared properly on unmount
 *  - marketMessage shown even when no error
 *  - Filter tab count shows live filtered count correctly
 *  - Added missing Android StatusBar color fallback
=======
 * index.tsx — Main Home Screen v3.0
 *
 * New in v3.0:
 *  - Settings, Trade Log, Active Position tabs in bottom nav
 *  - TradeActionModal: smart qty/price recommendation on BUY signal
 *  - "I Bought It" / "Leave It" buttons on BestStockCard
 *  - ActivePositionBanner: live P&L, sell alert, mark as sold
 *  - Skipped symbols filtered from "best pick" so next best is shown
 *  - Background parallel tracking: active position monitored while next best runs
>>>>>>> 1c0a5ee (Initial commit)
 */

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, ActivityIndicator,
  RefreshControl, StyleSheet, TouchableOpacity,
  StatusBar, Platform, Animated,
} from "react-native";
import { useColorScheme } from "react-native";
import { fetchSignals, StockSignal } from "../services/api";
import { lightTheme, darkTheme } from "../constants/theme";
<<<<<<< HEAD
import StockCard        from "../components/StockCard";
import BestStockCard    from "../components/BestStockCard";
import MarketSummaryBar from "../components/Marketsummarybar";
=======
import StockCard             from "../components/StockCard";
import BestStockCard         from "../components/BestStockCard";
import MarketSummaryBar      from "../components/Marketsummarybar";
import ActivePositionBanner  from "../components/ActivePositionBanner";
import TradeActionModal      from "../components/TradeActionModal";
import SettingsScreen        from "./settings";
import TradeLogScreen        from "./tradelog";
>>>>>>> 1c0a5ee (Initial commit)
import {
  registerForPushNotifications,
  sendBuyNotification,
  sendSellNotification,
  sendMarketOpenNotification,
  sendMarketCloseNotification,
  sendConfluenceAlert,
} from "../services/notifications";
import {
  loadGoals, loadActivePosition, getTodaySummary, loadTradeLog,
  UserGoals, ActivePosition,
} from "../services/storage";

type FilterType = "ALL" | "BUY" | "SELL" | "HOLD";
type TabType    = "HOME" | "LOG" | "SETTINGS";

<<<<<<< HEAD
const POLL_INTERVAL = 60_000; // 60 seconds — server caches for 30s anyway, no need for 5s

export default function Home() {
  // ── State ─────────────────────────────────────────────────────────────────
  const [signals,       setSignals]     = useState<StockSignal[]>([]);
  const [loading,       setLoading]     = useState(true);
  const [refreshing,    setRefreshing]  = useState(false);
  const [marketOpen,    setMarketOpen]  = useState(false);
  const [marketMessage, setMarketMsg]   = useState<string>("");
  const [lastUpdated,   setLastUpdated] = useState<string>("");
  const [error,         setError]       = useState<string | null>(null);
  const [filter,        setFilter]      = useState<FilterType>("ALL");
  const [openPos,       setOpenPos]     = useState(0);
  const [bestSymbol,    setBestSymbol]  = useState<string | null>(null);
  const [countdown,     setCountdown]   = useState(POLL_INTERVAL / 1000);
=======
const POLL_INTERVAL = 60_000;

export default function Home() {
  // ── App state ─────────────────────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<TabType>("HOME");
  const [signals,      setSignals]      = useState<StockSignal[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [marketOpen,   setMarketOpen]   = useState(false);
  const [marketMessage,setMarketMsg]    = useState<string>("");
  const [lastUpdated,  setLastUpdated]  = useState<string>("");
  const [error,        setError]        = useState<string | null>(null);
  const [filter,       setFilter]       = useState<FilterType>("ALL");
  const [openPos,      setOpenPos]      = useState(0);
  const [bestSymbol,   setBestSymbol]   = useState<string | null>(null);
  const [countdown,    setCountdown]    = useState(POLL_INTERVAL / 1000);

  // ── Goals & Position state ────────────────────────────────────────────────
  const [goals,          setGoals]         = useState<UserGoals | null>(null);
  const [activePosition, setActivePosition]= useState<ActivePosition | null>(null);
  const [skippedSymbols, setSkippedSymbols]= useState<Set<string>>(new Set());
  const [showTradeModal, setShowTradeModal]= useState(false);
  const [modalStock,     setModalStock]    = useState<StockSignal | null>(null);
  const [todayPL,        setTodayPL]       = useState(0);
>>>>>>> 1c0a5ee (Initial commit)

  // ── Theme ─────────────────────────────────────────────────────────────────
  const scheme = useColorScheme();
  const theme  = scheme === "dark" ? darkTheme : lightTheme;

<<<<<<< HEAD
  // ── Refs — track previous state for notification dedup ───────────────────
  // Key: symbol, Value: last signal type that triggered a notification
  const notifiedSignals    = useRef<Record<string, string>>({});
  // Key: symbol, Value: whether we already sent a confluence alert
  const notifiedConfluence = useRef<Record<string, boolean>>({});
  const wasMarketOpen      = useRef(false);

  // Animated pulse for LIVE dot
=======
  // ── Refs ──────────────────────────────────────────────────────────────────
  const notifiedSignals    = useRef<Record<string, string>>({});
  const notifiedConfluence = useRef<Record<string, boolean>>({});
  const wasMarketOpen      = useRef(false);
>>>>>>> 1c0a5ee (Initial commit)
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // ── Load Goals & Active Position on startup ────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [g, pos, log] = await Promise.all([
        loadGoals(), loadActivePosition(), loadTradeLog(),
      ]);
      setGoals(g);
      setActivePosition(pos);
      const summary = getTodaySummary(log, g);
      setTodayPL(summary.totalPL);
    };
    init();
  }, []);

  // Refresh goals when settings tab is closed
  useEffect(() => {
    if (activeTab !== "SETTINGS") {
      loadGoals().then(setGoals);
    }
  }, [activeTab]);

  // Refresh today PL when log tab is closed
  useEffect(() => {
    if (activeTab !== "LOG") {
      loadTradeLog().then(log => {
        if (goals) setTodayPL(getTodaySummary(log, goals).totalPL);
      });
    }
  }, [activeTab]);

  // ── Load Data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (force = false) => {
    try {
      setError(null);
      const response = await fetchSignals(force);

      setMarketOpen(response.marketOpen);
      setOpenPos(response.openPositions ?? 0);
      setBestSymbol(response.bestStock);

      if (!response.marketOpen) {
        setMarketMsg(response.message || "Market is closed");
        // Market just closed — notify once
        if (wasMarketOpen.current) {
          sendMarketCloseNotification();
          wasMarketOpen.current = false;
<<<<<<< HEAD
          // Clear notification tracking — fresh slate next open
=======
>>>>>>> 1c0a5ee (Initial commit)
          notifiedSignals.current    = {};
          notifiedConfluence.current = {};
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Market just opened — notify once
      if (!wasMarketOpen.current) {
        sendMarketOpenNotification();
        wasMarketOpen.current = true;
      }

<<<<<<< HEAD
      // ── Notifications (deduplicated — only fire on genuine changes) ───────
      for (const stock of response.signals) {
        const lastNotified = notifiedSignals.current[stock.symbol];

        // Only notify if signal changed since last notification
        if (stock.signal !== lastNotified) {
          if (stock.signal === "BUY") {
            await sendBuyNotification(
              stock.symbol, stock.price,
              stock.target, stock.stopLoss,
              stock.score, stock.confluence,
              stock.projectedSellTime, stock.mfi,
            );
            notifiedSignals.current[stock.symbol] = "BUY";
          } else if (stock.signal === "SELL" && lastNotified === "BUY") {
            // Only notify SELL if we previously had a BUY (exit notification)
            await sendSellNotification(
              stock.symbol, stock.price,
              stock.exitReason, stock.profitLoss,
              stock.entryPrice,
=======
      for (const stock of response.signals) {
        const lastNotified = notifiedSignals.current[stock.symbol];
        if (stock.signal !== lastNotified) {
          if (stock.signal === "BUY") {
            await sendBuyNotification(
              stock.symbol, stock.price, stock.target, stock.stopLoss,
              stock.score, stock.confluence, stock.projectedSellTime, stock.mfi,
            );
            notifiedSignals.current[stock.symbol] = "BUY";
          } else if (stock.signal === "SELL" && lastNotified === "BUY") {
            await sendSellNotification(
              stock.symbol, stock.price,
              stock.exitReason, stock.profitLoss, stock.entryPrice,
>>>>>>> 1c0a5ee (Initial commit)
            );
            notifiedSignals.current[stock.symbol] = "SELL";
          }
        }
<<<<<<< HEAD

        // Confluence alert — only once per symbol per session
        if (
          stock.confluence &&
          stock.signal === "BUY" &&
          !notifiedConfluence.current[stock.symbol]
        ) {
=======
        if (stock.confluence && stock.signal === "BUY" && !notifiedConfluence.current[stock.symbol]) {
>>>>>>> 1c0a5ee (Initial commit)
          await sendConfluenceAlert(stock.symbol, stock.score);
          notifiedConfluence.current[stock.symbol] = true;
        }
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

  useEffect(() => {
    registerForPushNotifications();
    loadData();
    const poll = setInterval(() => loadData(), POLL_INTERVAL);
    return () => clearInterval(poll);
  }, [loadData]);

<<<<<<< HEAD
  // Countdown tick — resets when lastUpdated changes
=======
>>>>>>> 1c0a5ee (Initial commit)
  useEffect(() => {
    setCountdown(POLL_INTERVAL / 1000);
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

<<<<<<< HEAD
  // ── Derived state (memoized to avoid recalc on every render) ──────────────
=======
  // ── Derived / memoized ────────────────────────────────────────────────────
>>>>>>> 1c0a5ee (Initial commit)
  const filtered = useMemo(() =>
    filter === "ALL" ? signals : signals.filter(s => s.signal === filter),
    [signals, filter]
  );

  const buyCount  = useMemo(() => signals.filter(s => s.signal === "BUY").length,  [signals]);
  const sellCount = useMemo(() => signals.filter(s => s.signal === "SELL").length, [signals]);
  const holdCount = useMemo(() => signals.filter(s => s.signal === "HOLD").length, [signals]);

<<<<<<< HEAD
  const bestBuy = useMemo(() =>
    signals.find(s => s.symbol === bestSymbol && s.signal === "BUY") ||
    signals.find(s => s.signal === "BUY") ||
    null,
    [signals, bestSymbol]
  );

  // Pre-compute BUY ranks once — avoids O(n²) indexOf inside renderItem
  const buyRankMap = useMemo(() => {
    const map: Record<string, number> = {};
    signals.filter(s => s.signal === "BUY").forEach((s, i) => {
      map[s.symbol] = i + 1;
    });
    return map;
  }, [signals]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true); // force=true bypasses server cache
  }, [loadData]);
=======
  // Best stock to recommend — skip active position symbol AND user-skipped symbols
  const bestBuy = useMemo(() => {
    const activeSymbol = activePosition?.symbol;
    return (
      signals.find(s =>
        s.signal === "BUY" &&
        s.symbol === bestSymbol &&
        s.symbol !== activeSymbol &&
        !skippedSymbols.has(s.symbol)
      ) ||
      signals.find(s =>
        s.signal === "BUY" &&
        s.symbol !== activeSymbol &&
        !skippedSymbols.has(s.symbol)
      ) ||
      null
    );
  }, [signals, bestSymbol, activePosition, skippedSymbols]);

  // Current price & signal for the active position symbol
  const activeSignalData = useMemo(() => {
    if (!activePosition) return null;
    return signals.find(s => s.symbol === activePosition.symbol) ?? null;
  }, [signals, activePosition]);

  const buyRankMap = useMemo(() => {
    const map: Record<string, number> = {};
    signals.filter(s => s.signal === "BUY").forEach((s, i) => { map[s.symbol] = i + 1; });
    return map;
  }, [signals]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(true); }, [loadData]);

  // ── Trade action handlers ─────────────────────────────────────────────────
  const handleBuyPress = useCallback((stock: StockSignal) => {
    setModalStock(stock);
    setShowTradeModal(true);
  }, []);

  const handleBought = useCallback((position: ActivePosition) => {
    setActivePosition(position);
    setShowTradeModal(false);
  }, []);

  const handleSkip = useCallback((symbol: string) => {
    setSkippedSymbols(prev => new Set([...prev, symbol]));
    setShowTradeModal(false);
  }, []);

  const handleSold = useCallback((pl: number) => {
    setActivePosition(null);
    setTodayPL(prev => prev + pl);
    // Reload log
    loadTradeLog().then(log => {
      if (goals) setTodayPL(getTodaySummary(log, goals).totalPL);
    });
  }, [goals]);
>>>>>>> 1c0a5ee (Initial commit)

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

  // ── Tab: Settings ─────────────────────────────────────────────────────────
  if (activeTab === "SETTINGS") {
    return (
      <View style={{ flex: 1 }}>
        <SettingsScreen />
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} />
      </View>
    );
  }

  // ── Tab: Trade Log ────────────────────────────────────────────────────────
  if (activeTab === "LOG") {
    return (
      <View style={{ flex: 1 }}>
        <TradeLogScreen />
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} />
      </View>
    );
  }

  // ── Tab: Home ─────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={scheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={theme.surface}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>📈 StockPulse</Text>
          <View style={styles.headerSubRow}>
            <Animated.View style={[styles.liveDot, { backgroundColor: theme.buy, opacity: pulse }]} />
            <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
              NSE · BSE · {marketOpen ? `Next scan in ${countdown}s` : "Closed"}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Today P&L badge */}
          {goals && (
            <View style={[styles.pill, {
              backgroundColor: todayPL >= 0 ? theme.buy + "22" : theme.sell + "22",
            }]}>
              <Text style={[styles.pillText, { color: todayPL >= 0 ? theme.buy : theme.sell }]}>
                {todayPL >= 0 ? "+" : ""}₹{Math.abs(todayPL).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </Text>
            </View>
          )}
          {marketOpen ? (
            <View style={[styles.pill, { backgroundColor: theme.buy + "22" }]}>
              <Text style={[styles.pillText, { color: theme.buy }]}>🟢 {buyCount} BUY</Text>
            </View>
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
<<<<<<< HEAD
          <TouchableOpacity
            onPress={() => loadData()}
            style={[styles.retryBtn, { borderColor: theme.sell }]}
          >
=======
          <TouchableOpacity onPress={() => loadData()} style={[styles.retryBtn, { borderColor: theme.sell }]}>
>>>>>>> 1c0a5ee (Initial commit)
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
          {(["ALL", "BUY", "SELL", "HOLD"] as FilterType[]).map(f => {
            const count = f === "BUY" ? buyCount : f === "SELL" ? sellCount : f === "HOLD" ? holdCount : signals.length;
            return (
              <TouchableOpacity
<<<<<<< HEAD
                key={f}
                onPress={() => setFilter(f)}
                style={[
                  styles.tab,
                  filter === f && { borderBottomColor: theme.accent, borderBottomWidth: 2 },
                ]}
=======
                key={f} onPress={() => setFilter(f)}
                style={[styles.tab, filter === f && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
>>>>>>> 1c0a5ee (Initial commit)
              >
                <Text style={[styles.tabText, { color: filter === f ? theme.accent : theme.textSecondary }]}>
                  {f} {count > 0 ? `(${count})` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── Main List ───────────────────────────────────────────────────── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.symbol}
<<<<<<< HEAD
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
=======
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
>>>>>>> 1c0a5ee (Initial commit)
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.buy} colors={[theme.buy]} />
        }
        ListHeaderComponent={
          <>
            {/* Active Position Banner — runs parallel to best buy pick */}
            {activePosition && (
              <ActivePositionBanner
                position={activePosition}
                currentPrice={activeSignalData?.price ?? null}
                currentSignal={activeSignalData?.signal ?? null}
                theme={theme}
                onSold={handleSold}
              />
            )}

            {/* Best Buy Pick (skips active position symbol + user-skipped) */}
            {bestBuy && marketOpen && filter === "ALL" && (
              <View>
                <BestStockCard item={bestBuy} theme={theme} />
                {/* Buy / Skip action buttons */}
                <View style={styles.actionBtnRow}>
                  <TouchableOpacity
                    onPress={() => handleSkip(bestBuy.symbol)}
                    style={[styles.leaveBtn, { borderColor: theme.border }]}
                  >
                    <Text style={[styles.leaveBtnText, { color: theme.textSecondary }]}>
                      ✗  Leave It
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleBuyPress(bestBuy)}
                    style={[styles.considerBtn, { backgroundColor: theme.buy }]}
                  >
                    <Text style={styles.considerBtnText}>💰  I Want to Buy</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>📊</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {marketOpen ? "Waiting for signals…" : "Market is closed"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <StockCard
            item={item}
            theme={theme}
            rank={filter === "ALL" && item.signal === "BUY" ? buyRankMap[item.symbol] : undefined}
          />
        )}
        ListFooterComponent={
          lastUpdated ? (
            <Text style={[styles.footer, { color: theme.textSecondary }]}>
              Last scan: {lastUpdated} · {signals.length} stocks · 12 indicators
            </Text>
          ) : null
        }
      />

      {/* ── Bottom Navigation ─────────────────────────────────────────────── */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} />

      {/* ── Trade Action Modal ────────────────────────────────────────────── */}
      {goals && (
        <TradeActionModal
          visible={showTradeModal}
          stock={modalStock}
          goals={goals}
          todayPL={todayPL}
          openPositions={activePosition ? 1 : 0}
          theme={theme}
          onBought={handleBought}
          onSkip={handleSkip}
          onClose={() => setShowTradeModal(false)}
        />
      )}
    </View>
  );
}

// ── Bottom Nav Component ───────────────────────────────────────────────────

function BottomNav({ activeTab, setActiveTab, theme }: {
  activeTab: TabType;
  setActiveTab: (t: TabType) => void;
  theme: any;
}) {
  return (
    <View style={[styles.bottomNav, {
      backgroundColor: theme.surface,
      borderTopColor: theme.border,
    }]}>
      {([
        { key: "HOME",     icon: "📈", label: "Signals"  },
        { key: "LOG",      icon: "📋", label: "Trade Log" },
        { key: "SETTINGS", icon: "⚙️", label: "Settings"  },
      ] as { key: TabType; icon: string; label: string }[]).map(tab => (
        <TouchableOpacity
          key={tab.key}
          onPress={() => setActiveTab(tab.key)}
          style={styles.navItem}
        >
          <Text style={styles.navIcon}>{tab.icon}</Text>
          <Text style={[
            styles.navLabel,
            { color: activeTab === tab.key ? theme.accent : theme.textSecondary },
          ]}>
            {tab.label}
          </Text>
          {activeTab === tab.key && (
            <View style={[styles.navActiveDot, { backgroundColor: theme.accent }]} />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1 },
  centered:    { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },

  header: {
<<<<<<< HEAD
    flexDirection:     "row",
    justifyContent:    "space-between",
    alignItems:        "center",
    paddingHorizontal: 16,
    paddingTop:        Platform.OS === "ios" ? 54 : 16,
    paddingBottom:     12,
    borderBottomWidth: 1,
=======
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16,
    paddingTop:    Platform.OS === "ios" ? 54 : 16,
    paddingBottom: 12, borderBottomWidth: 1,
>>>>>>> 1c0a5ee (Initial commit)
  },
  headerTitle:  { fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  headerSubRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  liveDot:      { width: 6, height: 6, borderRadius: 3 },
  headerSub:    { fontSize: 11 },
  headerRight:  { flexDirection: "row", gap: 6 },
  pill:         { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  pillText:     { fontSize: 11, fontWeight: "600" },

  closedBanner: {
    margin: 12, padding: 16, borderRadius: 12,
    borderWidth: 1, alignItems: "center",
  },
  closedTitle: { fontSize: 17, fontWeight: "600", marginBottom: 4 },
  closedSub:   { fontSize: 13, textAlign: "center" },

  errorBanner: {
    marginHorizontal: 12, marginBottom: 4, padding: 10, borderRadius: 8,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  retryBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },

  tabRow:  { flexDirection: "row", borderBottomWidth: 1, marginBottom: 4 },
  tab:     { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabText: { fontSize: 12, fontWeight: "600" },
<<<<<<< HEAD
=======

  actionBtnRow: {
    flexDirection: "row", gap: 10,
    marginTop: -6, marginBottom: 14,
    paddingHorizontal: 2,
  },
  leaveBtn: {
    flex: 0.4, alignItems: "center", paddingVertical: 13,
    borderRadius: 12, borderWidth: 1,
  },
  leaveBtnText: { fontSize: 14, fontWeight: "700" },
  considerBtn: {
    flex: 1, alignItems: "center", paddingVertical: 13, borderRadius: 12,
  },
  considerBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
>>>>>>> 1c0a5ee (Initial commit)

  empty:     { alignItems: "center", paddingTop: 60 },
  emptyText: { marginTop: 12, fontSize: 15 },
  footer:    { textAlign: "center", fontSize: 11, paddingVertical: 16 },

<<<<<<< HEAD
  footer: { textAlign: "center", fontSize: 11, paddingVertical: 16 },
});
=======
  bottomNav: {
    flexDirection: "row", borderTopWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 28 : 8,
    paddingTop: 8, position: "absolute", bottom: 0, left: 0, right: 0,
  },
  navItem: {
    flex: 1, alignItems: "center", paddingVertical: 4, position: "relative",
  },
  navIcon:  { fontSize: 22 },
  navLabel: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  navActiveDot: {
    width: 4, height: 4, borderRadius: 2, marginTop: 3,
  },
});
>>>>>>> 1c0a5ee (Initial commit)
