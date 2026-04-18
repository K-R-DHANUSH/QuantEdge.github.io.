/**
 * api.ts — API Service Layer v2
 *
 * Matches the enhanced server.js v2 response shape.
 * Includes 12 indicator fields + projectedSellTime + confluence + bestStock.
 */

import axios from "axios";

// ── Change this to your machine's IP when testing on a device ────────────────
// Android emulator: "http://10.0.2.2:5000"
// Real device:      "http://192.168.x.x:5000"  (your LAN IP)
// Web:              "http://localhost:5000"
const BASE_URL = "http://192.168.x.x:5000";

export type SignalType   = "BUY" | "SELL" | "HOLD";
export type ExchangeType = "NSE" | "BSE";

export interface StockSignal {
  symbol:            string;
  exchange:          ExchangeType;
  price:             number;
  signal:            SignalType;
  score:             number;           // 0–100 weighted confidence
  reasons:           string[];
  stopLoss:          number | null;
  target:            number | null;
  rsi:               number | null;
  mfi:               number | null;    // Money Flow Index
  cci:               number | null;    // Commodity Channel Index
  trendStrength:     number | null;    // ADX
  vwap:              number | null;    // Today's VWAP
  vwapDeviation:     number | null;    // % deviation from VWAP
  macdHistogram:     number | null;    // MACD histogram value
  stochK:            number | null;    // Stochastic %K
  atr:               number | null;    // Average True Range
  confluence:        boolean;          // 5+ indicators agree
  projectedSellTime: string | null;    // "11:45 AM" — estimated target hit time
  isNewSignal:       boolean;
  exitReason:        string | null;
  profitLoss:        string | null;
  entryPrice:        number | null;
  entryTime:         string | null;
  recentPrices:      number[];         // Last 30 prices for chart
}

export interface ApiResponse {
  marketOpen:    boolean;
  message?:      string;
  signals:       StockSignal[];
  bestStock:     string | null;       // Symbol of the #1 recommended stock
  timestamp?:    string;
  openPositions?: number;
}

export const fetchSignals = async (): Promise<ApiResponse> => {
  try {
    const res = await axios.get<ApiResponse>(`${BASE_URL}/signals`, { timeout: 12000 });
    return res.data;
  } catch (err: any) {
    console.error("fetchSignals:", err.message);
    return {
      marketOpen: false,
      message:    "Cannot connect to server. Is server.js running?",
      signals:    [],
      bestStock:  null,
    };
  }
};

export const fetchStatus = async () => {
  try {
    const res = await axios.get(`${BASE_URL}/status`, { timeout: 5000 });
    return res.data;
  } catch {
    return null;
  }
};