/**
 * storage.ts — AsyncStorage wrapper for Goals, Budget & Trade Log
 *
 * Keys:
 *  - "user_goals"      → UserGoals object
 *  - "trade_log"       → TradeEntry[]
 *  - "active_position" → ActivePosition | null
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ──────────────────────────────────────────────────────────────────

export interface UserGoals {
  dailyProfitTarget:   number;   // ₹ target profit per day
  dailyLossLimit:      number;   // ₹ max loss allowed per day (positive number)
  totalBudget:         number;   // total capital available
  riskPerTrade:        number;   // % of budget to risk per trade (e.g. 2 = 2%)
  preferredExchange:   "NSE" | "BSE" | "BOTH";
  maxOpenTrades:       number;   // max concurrent positions
}

export interface TradeEntry {
  id:            string;
  symbol:        string;
  exchange:      string;
  entryPrice:    number;
  qty:           number;
  investedAmt:   number;
  entryTime:     string;        // ISO string
  exitPrice?:    number;
  exitTime?:     string;
  profitLoss?:   number;        // ₹ amount
  profitLossPct?: number;       // %
  status:        "OPEN" | "CLOSED" | "SKIPPED";
  signal:        "BUY" | "SELL";
  target?:       number;
  stopLoss?:     number;
  projectedSellTime?: string;
  score:         number;
  skipReason?:   string;        // if SKIPPED
}

export interface ActivePosition {
  symbol:          string;
  exchange:        string;
  entryPrice:      number;
  qty:             number;
  investedAmt:     number;
  entryTime:       string;
  target:          number | null;
  stopLoss:        number | null;
  projectedSellTime: string | null;
  score:           number;
}

// ── Default Goals ──────────────────────────────────────────────────────────

export const DEFAULT_GOALS: UserGoals = {
  dailyProfitTarget: 1000,
  dailyLossLimit:    500,
  totalBudget:       50000,
  riskPerTrade:      2,
  preferredExchange: "BOTH",
  maxOpenTrades:     3,
};

// ── Storage Helpers ────────────────────────────────────────────────────────

export async function loadGoals(): Promise<UserGoals> {
  try {
    const raw = await AsyncStorage.getItem("user_goals");
    return raw ? { ...DEFAULT_GOALS, ...JSON.parse(raw) } : DEFAULT_GOALS;
  } catch {
    return DEFAULT_GOALS;
  }
}

export async function saveGoals(goals: UserGoals): Promise<void> {
  await AsyncStorage.setItem("user_goals", JSON.stringify(goals));
}

export async function loadTradeLog(): Promise<TradeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem("trade_log");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTradeLog(log: TradeEntry[]): Promise<void> {
  await AsyncStorage.setItem("trade_log", JSON.stringify(log));
}

export async function addTradeEntry(entry: TradeEntry): Promise<void> {
  const log = await loadTradeLog();
  log.unshift(entry); // newest first
  await saveTradeLog(log);
}

export async function updateTradeEntry(id: string, update: Partial<TradeEntry>): Promise<void> {
  const log = await loadTradeLog();
  const idx = log.findIndex(t => t.id === id);
  if (idx !== -1) {
    log[idx] = { ...log[idx], ...update };
    await saveTradeLog(log);
  }
}

export async function loadActivePosition(): Promise<ActivePosition | null> {
  try {
    const raw = await AsyncStorage.getItem("active_position");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveActivePosition(pos: ActivePosition | null): Promise<void> {
  if (pos) {
    await AsyncStorage.setItem("active_position", JSON.stringify(pos));
  } else {
    await AsyncStorage.removeItem("active_position");
  }
}

// ── Trade Analytics ────────────────────────────────────────────────────────

export interface DaySummary {
  totalPL:      number;
  totalTrades:  number;
  wins:         number;
  losses:       number;
  winRate:      number;
  goalProgress: number;   // 0–100%
}

export function getTodaySummary(log: TradeEntry[], goals: UserGoals): DaySummary {
  const today = new Date().toDateString();
  const todayTrades = log.filter(t =>
    t.status === "CLOSED" &&
    new Date(t.entryTime).toDateString() === today
  );

  const totalPL    = todayTrades.reduce((sum, t) => sum + (t.profitLoss ?? 0), 0);
  const wins       = todayTrades.filter(t => (t.profitLoss ?? 0) > 0).length;
  const losses     = todayTrades.filter(t => (t.profitLoss ?? 0) < 0).length;
  const winRate    = todayTrades.length > 0 ? (wins / todayTrades.length) * 100 : 0;
  const goalProgress = Math.min(100, (totalPL / goals.dailyProfitTarget) * 100);

  return {
    totalPL,
    totalTrades: todayTrades.length,
    wins,
    losses,
    winRate,
    goalProgress: Math.max(0, goalProgress),
  };
}

// ── Qty & Price Recommendation ─────────────────────────────────────────────

export interface TradeRecommendation {
  recommendedQty:    number;
  investmentAmount:  number;
  maxRiskAmount:     number;
  potentialProfit:   number;
  riskRewardRatio:   string;
  budgetUsedPct:     number;
  canAfford:         boolean;
  warnings:          string[];
}

export function computeTradeRecommendation(
  price:    number,
  target:   number | null,
  stopLoss: number | null,
  goals:    UserGoals,
  todayPL:  number,
  openPositions: number
): TradeRecommendation {
  const warnings: string[] = [];

  // Budget left after today's P&L
  const availableBudget = goals.totalBudget + todayPL;

  // Max risk per trade in ₹
  const maxRiskAmount = (goals.totalBudget * goals.riskPerTrade) / 100;

  // Per-share risk (price - stop loss)
  const riskPerShare = stopLoss ? price - stopLoss : price * 0.02; // 2% fallback

  // Qty based on risk
  let recommendedQty = Math.floor(maxRiskAmount / Math.max(riskPerShare, 0.01));

  // Cap by available budget
  const maxQtyByBudget = Math.floor(availableBudget / price);
  recommendedQty = Math.min(recommendedQty, maxQtyByBudget);
  recommendedQty = Math.max(1, recommendedQty);

  const investmentAmount = recommendedQty * price;
  const potentialProfit  = target ? recommendedQty * (target - price) : 0;
  const actualRisk       = recommendedQty * riskPerShare;

  const riskReward = potentialProfit > 0 && actualRisk > 0
    ? `1 : ${(potentialProfit / actualRisk).toFixed(1)}`
    : "N/A";

  const budgetUsedPct = (investmentAmount / goals.totalBudget) * 100;

  // Warnings
  if (todayPL <= -goals.dailyLossLimit) warnings.push("⚠️ Daily loss limit reached");
  if (openPositions >= goals.maxOpenTrades) warnings.push(`⚠️ Max open trades (${goals.maxOpenTrades}) reached`);
  if (budgetUsedPct > 80) warnings.push("⚠️ Using >80% of capital in one trade");
  if (!stopLoss) warnings.push("⚠️ No stop loss — using 2% default risk");
  if (!target) warnings.push("⚠️ No target set — monitor manually");

  const canAfford = investmentAmount <= availableBudget && todayPL > -goals.dailyLossLimit;

  return {
    recommendedQty,
    investmentAmount,
    maxRiskAmount: actualRisk,
    potentialProfit,
    riskRewardRatio: riskReward,
    budgetUsedPct,
    canAfford,
    warnings,
  };
}