/**
 * server.js — Elite Indian Stock Market Signal Engine v2.1
 *
 * Changes from v2.0:
 *  - Dynamic PORT via process.env.PORT (required for Render)
 *  - /health endpoint (Render health check)
 *  - Self keep-alive ping every 10 min on weekdays (prevents Render free tier spin-down)
 *  - Auto-detects and logs real LAN IP on startup
 *  - Null cleaning moved to fetchStockData (prevents corrupt indicator inputs)
 *  - All original v2.0 logic preserved (12 indicators, scoring, confluence, etc.)
 *
 * HOW TO RUN LOCALLY:
 *  npm install express axios cors technicalindicators node-cron
 *  node server.js
 *
 * DEPLOY TO RENDER:
 *  - Set Start Command: node server.js
 *  - No env vars needed — Render sets PORT and RENDER_EXTERNAL_URL automatically
 */

const express = require("express");
const axios   = require("axios");
const cors    = require("cors");
const cron    = require("node-cron");
const os      = require("os");

const {
  RSI, SMA, EMA, MACD,
  BollingerBands, Stochastic, ADX, ATR,
  OBV, WilliamsR, CCI, MFI,
} = require("technicalindicators");

const app = express();
app.use(cors());
app.use(express.json());

// ── Stock Universe ────────────────────────────────────────────────────────────
const STOCKS = [
  "RELIANCE.NS", "TCS.NS",      "INFY.NS",    "HDFCBANK.NS",
  "ICICIBANK.NS","WIPRO.NS",    "SBIN.NS",    "ADANIENT.NS",
  "BAJFINANCE.NS","MARUTI.NS",  "TATAMOTORS.NS","AXISBANK.NS",
  "KOTAKBANK.NS", "HINDALCO.NS","ONGC.NS",    "POWERGRID.NS",
  "RELIANCE.BO",  "TCS.BO",     "INFY.BO",    "HDFCBANK.BO",
];

// ── Open Positions ────────────────────────────────────────────────────────────
const openPositions = {};

// ── Signal Cache ──────────────────────────────────────────────────────────────
let signalCache = null;
let cacheTime   = 0;
const CACHE_TTL = 30_000; // 30 seconds

// ── Market Hours (IST) ────────────────────────────────────────────────────────
function isMarketOpen() {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist   = new Date(utcMs + 5.5 * 3600000);
  const h = ist.getHours(), m = ist.getMinutes(), d = ist.getDay();
  if (d === 0 || d === 6) return false;
  return (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
}

function getISTTime() {
  return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
}

// ── Fetch OHLCV from Yahoo Finance ────────────────────────────────────────────
// Nulls are cleaned here so indicator functions always get clean arrays
async function fetchStockData(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
    const res = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 8000,
    });

    const result     = res.data.chart.result[0];
    const q          = result.indicators.quote[0];
    const timestamps = result.timestamp || [];

    // Zip all OHLCV rows and drop any where close/high/low is null
    // This prevents corrupt inputs to indicator libraries
    const rows = timestamps
      .map((t, i) => ({
        t,
        c: q.close[i],
        h: q.high[i],
        l: q.low[i],
        v: q.volume[i] ?? 0,
        o: q.open[i],
      }))
      .filter(r => r.c != null && r.h != null && r.l != null);

    return {
      closes:     rows.map(r => r.c),
      highs:      rows.map(r => r.h),
      lows:       rows.map(r => r.l),
      volumes:    rows.map(r => r.v),
      opens:      rows.map(r => r.o),
      timestamps: rows.map(r => r.t),
    };
  } catch (err) {
    console.error(`❌ ${symbol}:`, err.message);
    return null;
  }
}

// ── VWAP Calculation ──────────────────────────────────────────────────────────
function calculateVWAP(closes, highs, lows, volumes) {
  let cumVolume = 0, cumTPV = 0;
  const vwap = [];
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVolume += volumes[i] || 0;
    cumTPV    += tp * (volumes[i] || 0);
    vwap.push(cumVolume > 0 ? cumTPV / cumVolume : null);
  }
  return vwap;
}

// ── Projected Sell Time ───────────────────────────────────────────────────────
// Estimates when price will hit target based on ATR velocity (price movement per minute)
function projectSellTime(currentPrice, target, atr, periodMinutes = 14) {
  if (!target || !atr || atr === 0) return null;
  const gap            = Math.abs(target - currentPrice);
  const pricePerMinute = atr / periodMinutes;
  if (pricePerMinute === 0) return null;
  const minutesNeeded  = Math.ceil(gap / pricePerMinute);
  if (minutesNeeded > 240) return null; // >4 hours = unreliable, skip
  const nowUtcMs = Date.now();
  const sell     = new Date(nowUtcMs + minutesNeeded * 60000);
  return sell.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour:     "2-digit",
    minute:   "2-digit",
  });
}

// ── Core Signal Engine — 12 Indicators, Weighted Scoring ─────────────────────
function generateSignal(closes, highs, lows, volumes, opens) {
  // All arrays are already clean (no nulls) — guaranteed by fetchStockData
  const prices = closes;
  const hs     = highs;
  const ls     = lows;
  const vs     = volumes;

  if (prices.length < 30) return null;

  const last = prices.at(-1);

  // ── 1. RSI (weight: 2) ────────────────────────────────────────────────────
  const rsiArr = RSI.calculate({ values: prices, period: 14 });
  const rsi    = rsiArr.at(-1);

  // ── 2. SMA 10/20/50 (weight: 1 each) ─────────────────────────────────────
  const sma10 = SMA.calculate({ values: prices, period: 10 }).at(-1);
  const sma20 = SMA.calculate({ values: prices, period: 20 }).at(-1);
  const sma50 = prices.length >= 50
    ? SMA.calculate({ values: prices, period: 50 }).at(-1) : null;

  // ── 3. EMA 9/21 (weight: 1.5) ────────────────────────────────────────────
  const ema9  = EMA.calculate({ values: prices, period: 9 }).at(-1);
  const ema21 = EMA.calculate({ values: prices, period: 21 }).at(-1);

  // ── 4. MACD (weight: 2) ───────────────────────────────────────────────────
  const macdArr = MACD.calculate({
    values: prices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const macd     = macdArr.at(-1);
  const macdPrev = macdArr.at(-2);

  // ── 5. Bollinger Bands (weight: 1.5) ─────────────────────────────────────
  const bbArr = BollingerBands.calculate({ values: prices, period: 20, stdDev: 2 });
  const bb    = bbArr.at(-1);

  // ── 6. Stochastic (weight: 1.5) ───────────────────────────────────────────
  let stoch = null;
  if (hs.length >= 14) {
    const stochArr = Stochastic.calculate({
      high: hs, low: ls, close: prices, period: 14, signalPeriod: 3,
    });
    stoch = stochArr.at(-1);
  }

  // ── 7. ADX — Trend Strength Multiplier ───────────────────────────────────
  let adx = null;
  if (hs.length >= 14) {
    const adxArr = ADX.calculate({ high: hs, low: ls, close: prices, period: 14 });
    adx = adxArr.at(-1);
  }

  // ── 8. ATR — Volatility, used for SL/Target/projected sell time ──────────
  let atr = null;
  if (hs.length >= 14) {
    const atrArr = ATR.calculate({ high: hs, low: ls, close: prices, period: 14 });
    atr = atrArr.at(-1);
  }

  // ── 9. OBV — Volume confirmation (weight: 1.5) ───────────────────────────
  const obvArr  = OBV.calculate({ close: prices, volume: vs });
  const obvNow  = obvArr.at(-1);
  const obvPrev = obvArr.at(-2);
  const priceUp = prices.at(-1) > prices.at(-2);

  // ── 10. Williams %R (weight: 1) ───────────────────────────────────────────
  const wrArr = WilliamsR.calculate({ high: hs, low: ls, close: prices, period: 14 });
  const wr    = wrArr.at(-1);

  // ── 11. CCI — Commodity Channel Index (weight: 1.5) ──────────────────────
  // <-100 = oversold, >+100 = overbought
  let cci = null;
  if (hs.length >= 20) {
    const cciArr = CCI.calculate({ high: hs, low: ls, close: prices, period: 20 });
    cci = cciArr.at(-1);
  }

  // ── 12. MFI — Money Flow Index (weight: 2, best intraday indicator) ───────
  // Like RSI but volume-weighted — MFI <20 with volume = very bullish
  let mfi = null;
  if (hs.length >= 14 && vs.length >= 14) {
    const mfiArr = MFI.calculate({ high: hs, low: ls, close: prices, volume: vs, period: 14 });
    mfi = mfiArr.at(-1);
  }

  // ── VWAP Deviation (weight: 2, institutional signal) ─────────────────────
  const vwapArr = calculateVWAP(closes, highs, lows, volumes);
  const vwapNow = vwapArr.filter(Boolean).at(-1);
  const vwapDev = vwapNow ? ((last - vwapNow) / vwapNow) * 100 : null;

  // ── SCORING ENGINE (Weighted) ─────────────────────────────────────────────
  let bullScore = 0, bearScore = 0;
  let maxScore  = 0;
  const reasons = [];

  // RSI (weight 2)
  maxScore += 2;
  if (rsi < 30)      { bullScore += 2; reasons.push(`RSI Oversold (${Math.round(rsi)})`); }
  else if (rsi < 45) { bullScore += 1; reasons.push("RSI Recovering"); }
  else if (rsi > 70) { bearScore += 2; reasons.push(`RSI Overbought (${Math.round(rsi)})`); }
  else if (rsi > 60) { bearScore += 1; }

  // SMA alignment (weight 3)
  maxScore += 3;
  if (last > sma10) { bullScore += 1; }
  if (last > sma20) { bullScore += 1; reasons.push("Above SMA20"); }
  if (sma50 && last > sma50) { bullScore += 1; reasons.push("Above SMA50"); }
  if (last < sma10) { bearScore += 1; }
  if (last < sma20) { bearScore += 1; }
  if (sma50 && last < sma50) { bearScore += 1; }

  // EMA (weight 1.5)
  maxScore += 1.5;
  if (ema9 > ema21 && last > ema21)      { bullScore += 1.5; reasons.push("EMA Bullish Cross"); }
  else if (ema9 < ema21 && last < ema21) { bearScore += 1.5; reasons.push("EMA Bearish Cross"); }

  // MACD (weight 2)
  maxScore += 2;
  if (macd && macdPrev) {
    if (macd.MACD > macd.signal) { bullScore += 1; }
    if (macd.histogram > 0 && macdPrev.histogram <= 0) {
      bullScore += 1; reasons.push("MACD Bullish Crossover");
    }
    if (macd.MACD < macd.signal) { bearScore += 1; }
    if (macd.histogram < 0 && macdPrev.histogram >= 0) {
      bearScore += 1; reasons.push("MACD Bearish Crossover");
    }
  }

  // Bollinger Bands (weight 1.5)
  maxScore += 1.5;
  if (bb) {
    if (last < bb.lower)                        { bullScore += 1.5; reasons.push("BB Oversold Squeeze"); }
    else if (last < bb.middle && last > bb.lower) { bullScore += 0.5; }
    else if (last > bb.upper)                    { bearScore += 1.5; reasons.push("BB Overbought"); }
    else if (last > bb.middle && last < bb.upper) { bearScore += 0.5; }
  }

  // Stochastic (weight 1.5)
  maxScore += 1.5;
  if (stoch) {
    if (stoch.k < 20)  { bullScore += 1.5; reasons.push("Stochastic Oversold"); }
    else if (stoch.k > 80) { bearScore += 1.5; reasons.push("Stochastic Overbought"); }
  }

  // Williams %R (weight 1)
  maxScore += 1;
  if (wr < -80)      { bullScore += 1; }
  else if (wr > -20) { bearScore += 1; }

  // OBV Volume Confirmation (weight 1.5)
  maxScore += 1.5;
  if (obvNow > obvPrev && priceUp)       { bullScore += 1.5; reasons.push("Volume Confirms Upside"); }
  else if (obvNow < obvPrev && !priceUp) { bearScore += 1.5; reasons.push("Volume Confirms Downside"); }

  // CCI (weight 1.5)
  maxScore += 1.5;
  if (cci !== null) {
    if (cci < -100)     { bullScore += 1.5; reasons.push("CCI Oversold"); }
    else if (cci > 100) { bearScore += 1.5; }
  }

  // MFI (weight 2 — best intraday indicator)
  maxScore += 2;
  if (mfi !== null) {
    if (mfi < 20)       { bullScore += 2; reasons.push("MFI Oversold (Volume Weighted)"); }
    else if (mfi < 40)  { bullScore += 1; }
    else if (mfi > 80)  { bearScore += 2; reasons.push("MFI Overbought"); }
    else if (mfi > 60)  { bearScore += 1; }
  }

  // VWAP Deviation (weight 2)
  maxScore += 2;
  if (vwapDev !== null) {
    if (vwapDev < -1.5)      { bullScore += 2; reasons.push("Below VWAP (Institutional Buy Zone)"); }
    else if (vwapDev < -0.5) { bullScore += 1; reasons.push("Below VWAP"); }
    else if (vwapDev > 1.5)  { bearScore += 2; reasons.push("Extended Above VWAP"); }
    else if (vwapDev > 0.5)  { bearScore += 1; }
  }

  // ── ADX Trend Strength Multiplier ─────────────────────────────────────────
  const adxVal    = adx ? adx.adx : 0;
  const trendBonus = adxVal >= 40 ? 1.3 : adxVal >= 25 ? 1.15 : adxVal >= 15 ? 1.0 : 0.85;

  const rawScore = maxScore > 0 ? (bullScore / maxScore) * 100 : 50;
  const score    = Math.min(100, Math.round(rawScore * trendBonus));

  // ── Confluence Detection ───────────────────────────────────────────────────
  // True when dominant side has >= 5 weighted points — means multiple indicators align
  const confluence = Math.max(bullScore, bearScore) >= 5;

  // ── Signal Decision ───────────────────────────────────────────────────────
  let signal = "HOLD";
  if (score >= 68)      signal = "BUY";
  else if (score <= 32) signal = "SELL";
  // Require confluence for moderate-confidence signals
  if (signal === "BUY"  && !confluence && score < 80) signal = "HOLD";
  if (signal === "SELL" && !confluence && score > 20) signal = "HOLD";

  // ── ATR-Based Stop Loss & Target ──────────────────────────────────────────
  // SL: 1.5× ATR below price (gives trade room)
  // Target: 2.5× ATR above price (2.5:1.5 = ~1.67 R:R)
  const stopLoss = atr ? +(last - 1.5 * atr).toFixed(2) : null;
  const target   = atr ? +(last + 2.5 * atr).toFixed(2) : null;

  const projectedSellTime = signal === "BUY"
    ? projectSellTime(last, target, atr) : null;

  return {
    signal, score, bullScore, bearScore,
    reasons: reasons.slice(0, 6),
    stopLoss, target,
    rsi:           rsi  ? Math.round(rsi)   : null,
    mfi:           mfi  ? Math.round(mfi)   : null,
    cci:           cci  ? Math.round(cci)   : null,
    atr:           atr  ? +atr.toFixed(2)   : null,
    trendStrength: adx  ? Math.round(adxVal): null,
    vwapDeviation: vwapDev ? +vwapDev.toFixed(2) : null,
    vwap:          vwapNow ? +vwapNow.toFixed(2)  : null,
    projectedSellTime,
    confluence,
    macdHistogram: macd  ? +macd.histogram.toFixed(2) : null,
    stochK:        stoch ? Math.round(stoch.k)        : null,
  };
}

// ── Position Tracker ──────────────────────────────────────────────────────────
function checkExitCondition(symbol, currentPrice, analysis) {
  const pos = openPositions[symbol];

  if (!pos) {
    if (analysis.signal === "BUY") {
      openPositions[symbol] = {
        entryPrice:        currentPrice,
        entryTime:         getISTTime(),
        target:            analysis.target,
        stopLoss:          analysis.stopLoss,
        projectedSellTime: analysis.projectedSellTime,
      };
      return { action: "BUY", isNew: true };
    }
    return { action: analysis.signal, isNew: false };
  }

  const hitTarget   = analysis.target   && currentPrice >= analysis.target;
  const hitStopLoss = analysis.stopLoss && currentPrice <= analysis.stopLoss;
  const signalSell  = analysis.signal === "SELL";

  if (hitTarget || hitStopLoss || signalSell) {
    const pl = ((currentPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2);
    delete openPositions[symbol];
    return {
      action:     "SELL",
      isNew:      true,
      reason:     hitTarget   ? "🎯 Target Hit"
                : hitStopLoss ? "🛑 Stop-Loss Hit"
                              : "📉 Signal Reversed",
      profitLoss: pl,
      entryPrice: pos.entryPrice,
      entryTime:  pos.entryTime,
    };
  }

  return { action: "BUY", isNew: false, position: pos };
}

// ── /health — Render health check ────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: getISTTime() });
});

// ── /status ───────────────────────────────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({
    marketOpen:    isMarketOpen(),
    openPositions: Object.keys(openPositions).length,
    totalStocks:   STOCKS.length,
    timestamp:     getISTTime(),
  });
});

// ── /signals — Main endpoint ──────────────────────────────────────────────────
app.get("/signals", async (req, res) => {
  if (!isMarketOpen() && req.query.force !== "true") {
    return res.json({
      marketOpen: false,
      message:    "Market closed. NSE/BSE opens at 9:15 AM IST, Mon–Fri.",
      signals:    [],
      bestStock:  null,
    });
  }

  // Serve cache if still fresh
  if (signalCache && Date.now() - cacheTime < CACHE_TTL && req.query.force !== "true") {
    return res.json(signalCache);
  }

  const results = [];

  for (const symbol of STOCKS) {
    try {
      const data = await fetchStockData(symbol);
      if (!data || data.closes.length < 30) continue;

      const analysis = generateSignal(data.closes, data.highs, data.lows, data.volumes, data.opens);
      if (!analysis) continue;

      const currentPrice = data.closes.at(-1);
      const exitInfo     = checkExitCondition(symbol, currentPrice, analysis);
      const pos          = openPositions[symbol];

      results.push({
        symbol,
        exchange:      symbol.endsWith(".NS") ? "NSE" : "BSE",
        price:         +currentPrice.toFixed(2),
        signal:        exitInfo.action,
        score:         analysis.score,
        reasons:       analysis.reasons,
        stopLoss:      analysis.stopLoss,
        target:        analysis.target,
        rsi:           analysis.rsi,
        mfi:           analysis.mfi,
        cci:           analysis.cci,
        trendStrength: analysis.trendStrength,
        vwap:          analysis.vwap,
        vwapDeviation: analysis.vwapDeviation,
        macdHistogram: analysis.macdHistogram,
        stochK:        analysis.stochK,
        atr:           analysis.atr,
        confluence:    analysis.confluence,
        projectedSellTime: analysis.projectedSellTime || pos?.projectedSellTime || null,
        isNewSignal:   exitInfo.isNew,
        exitReason:    exitInfo.reason     || null,
        profitLoss:    exitInfo.profitLoss || null,
        entryPrice:    exitInfo.entryPrice || pos?.entryPrice || null,
        entryTime:     exitInfo.entryTime  || pos?.entryTime  || null,
        recentPrices:  data.closes.slice(-30),
      });
    } catch (err) {
      console.error(`Error processing ${symbol}:`, err.message);
    }
  }

  // Sort: BUY + confluence first, then by score
  results.sort((a, b) => {
    if (a.signal === "BUY" && b.signal !== "BUY") return -1;
    if (b.signal === "BUY" && a.signal !== "BUY") return 1;
    if (a.confluence && !b.confluence) return -1;
    if (b.confluence && !a.confluence) return 1;
    return b.score - a.score;
  });

  // Best stock = highest confidence BUY with confluence, else any BUY
  const best = results.find(s => s.signal === "BUY" && s.confluence)
            || results.find(s => s.signal === "BUY")
            || results[0]
            || null;

  const payload = {
    marketOpen:    true,
    signals:       results,
    bestStock:     best ? best.symbol : null,
    timestamp:     getISTTime(),
    openPositions: Object.keys(openPositions).length,
  };

  signalCache = payload;
  cacheTime   = Date.now();

  res.json(payload);
});

// ── Cron: Market Open/Close ───────────────────────────────────────────────────
cron.schedule("15 9 * * 1-5", () => {
  console.log("🟢 Market OPEN — Scanning started (9:15 AM IST)");
  signalCache = null;
}, { timezone: "Asia/Kolkata" });

cron.schedule("30 15 * * 1-5", () => {
  console.log("🔴 Market CLOSED — Clearing positions (3:30 PM IST)");
  Object.keys(openPositions).forEach(k => delete openPositions[k]);
  signalCache = null;
}, { timezone: "Asia/Kolkata" });

// ── Keep-Alive Ping (prevents Render free tier from spinning down) ─────────────
// Render sets RENDER_EXTERNAL_URL automatically — only runs in production
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  cron.schedule("*/10 * * * 1-5", async () => {
    try {
      await axios.get(`${SELF_URL}/health`, { timeout: 5000 });
      console.log(`💓 Keep-alive ping OK (${getISTTime()})`);
    } catch (e) {
      console.warn("⚠️ Keep-alive ping failed:", e.message);
    }
  }, { timezone: "Asia/Kolkata" });
  console.log(`💓 Keep-alive enabled → ${SELF_URL}/health`);
}

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  // Auto-detect real LAN IP for local dev convenience
  const nets    = Object.values(os.networkInterfaces()).flat();
  const localIP = nets.find(n => n.family === "IPv4" && !n.internal)?.address ?? "localhost";

  console.log("🚀 Stock Signal Engine v2.1");
  console.log(`➡  Local:   http://localhost:${PORT}`);
  console.log(`➡  Network: http://${localIP}:${PORT}`);
  if (SELF_URL) console.log(`➡  Public:  ${SELF_URL}`);
  console.log(`📊 Tracking ${STOCKS.length} stocks | 12 indicators`);
  console.log(`📅 Market: ${isMarketOpen() ? "🟢 OPEN" : "🔴 CLOSED"}`);
});