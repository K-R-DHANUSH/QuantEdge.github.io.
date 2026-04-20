/**
 * server.js — Elite Indian Stock Market Signal Engine v3.2
 *
 * Changes from v3.1:
 *  - Added Groww brokerage & all statutory charge deductions
 *  - Net P&L (after all charges) computed for every BUY/WEAK BUY signal
 *  - Only stocks where NET profit > 0 after charges are flagged as "PROFITABLE"
 *  - New `/signals?profitable=true` filter to surface only net-profitable trades
 *  - Brokerage breakdown (brokerage, STT, SEBI, stamp, exchange, GST) exposed per stock
 *  - `minQty` and `tradeValue` computed from ATR-based target/stop
 *  - All v3.1 logic preserved
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

// ── Configuration ─────────────────────────────────────────────────────────────
const BATCH_SIZE  = 20;
const BATCH_DELAY = 350;
const CACHE_TTL   = 120_000;

// ─────────────────────────────────────────────────────────────────────────────
// GROWW BROKERAGE MODEL (Intraday / Delivery)
// ─────────────────────────────────────────────────────────────────────────────
//
// Groww charges:
//   Intraday:  ₹20 per executed order OR 0.05% of trade value, whichever is LOWER
//   Delivery:  ZERO brokerage
//
// Statutory charges (same for both):
//   STT:        0.025% of trade value on SELL side only (intraday)
//               0.1%   of trade value on BOTH sides (delivery)
//   SEBI fees:  ₹10 per crore (= 0.000010 per ₹ = 0.001% of trade value) — both sides
//   Exchange (NSE/BSE turnover fee):
//               NSE intraday: 0.00297% per side
//               BSE intraday: 0.00375% per side  (we default to NSE)
//   Stamp duty: 0.003% on BUY side only (intraday); 0.015% on BUY side (delivery)
//   GST:        18% on (brokerage + exchange fee + SEBI fee)
//   IPFT:       ₹10 per crore = 0.0000001 per ₹ (negligible, included)
//
// This engine uses INTRADAY model (signals are intraday 1-min chart based).
// ─────────────────────────────────────────────────────────────────────────────

const GROWW = {
  // Intraday brokerage: min(₹20, 0.05% of trade value) per order
  brokerageRate:    0.0005,   // 0.05%
  brokerageCap:     20,       // ₹20 per order

  // STT — 0.025% on SELL side only (intraday)
  sttRate:          0.00025,

  // SEBI charges — ₹10 per crore of turnover (both sides)
  sebiRate:         0.000001, // = 0.0001%

  // NSE exchange fee (intraday) — 0.00297% both sides
  exchangeRate:     0.0000297,

  // Stamp duty — 0.003% on BUY side only (intraday)
  stampRate:        0.00003,

  // GST — 18% on (brokerage + exchange + sebi)
  gstRate:          0.18,

  // IPFT — ₹10 per crore on each side
  ipftRate:         0.0000001,
};

/**
 * calculateGrowwCharges(buyPrice, sellPrice, qty)
 * Returns a full breakdown of all charges and net P&L for an intraday trade.
 *
 * @param {number} buyPrice  - Entry price per share
 * @param {number} sellPrice - Exit price (target) per share
 * @param {number} qty       - Number of shares
 * @returns {object} Full charge breakdown and netPnL
 */
function calculateGrowwCharges(buyPrice, sellPrice, qty) {
  const buyValue  = buyPrice  * qty;
  const sellValue = sellPrice * qty;
  const grossPnL  = sellValue - buyValue;

  // ── Brokerage (buy leg + sell leg) ──────────────────────────────────
  const brokerageBuy  = Math.min(GROWW.brokerageCap, buyValue  * GROWW.brokerageRate);
  const brokerageSell = Math.min(GROWW.brokerageCap, sellValue * GROWW.brokerageRate);
  const totalBrokerage = brokerageBuy + brokerageSell;

  // ── STT (sell side only for intraday) ───────────────────────────────
  const stt = sellValue * GROWW.sttRate;

  // ── Exchange transaction charge (both sides) ─────────────────────────
  const exchangeBuy  = buyValue  * GROWW.exchangeRate;
  const exchangeSell = sellValue * GROWW.exchangeRate;
  const totalExchange = exchangeBuy + exchangeSell;

  // ── SEBI charges (both sides) ────────────────────────────────────────
  const sebiBuy  = buyValue  * GROWW.sebiRate;
  const sebiSell = sellValue * GROWW.sebiRate;
  const totalSebi = sebiBuy + sebiSell;

  // ── Stamp duty (buy side only) ───────────────────────────────────────
  const stamp = buyValue * GROWW.stampRate;

  // ── IPFT (both sides) ────────────────────────────────────────────────
  const ipft = (buyValue + sellValue) * GROWW.ipftRate;

  // ── GST on (brokerage + exchange + sebi) ─────────────────────────────
  const gstBase = totalBrokerage + totalExchange + totalSebi;
  const gst     = gstBase * GROWW.gstRate;

  // ── Total charges ────────────────────────────────────────────────────
  const totalCharges = totalBrokerage + stt + totalExchange + totalSebi + stamp + ipft + gst;

  // ── Net P&L ──────────────────────────────────────────────────────────
  const netPnL        = grossPnL - totalCharges;
  const netPnLPercent = buyValue > 0 ? (netPnL / buyValue) * 100 : 0;
  const breakEvenMove = buyValue > 0 ? (totalCharges / buyValue) * 100 : 0;

  return {
    buyValue:      +buyValue.toFixed(2),
    sellValue:     +sellValue.toFixed(2),
    grossPnL:      +grossPnL.toFixed(2),
    brokerage:     +totalBrokerage.toFixed(2),
    stt:           +stt.toFixed(2),
    exchangeFee:   +totalExchange.toFixed(2),
    sebiFee:       +totalSebi.toFixed(2),
    stampDuty:     +stamp.toFixed(2),
    ipft:          +ipft.toFixed(2),
    gst:           +gst.toFixed(2),
    totalCharges:  +totalCharges.toFixed(2),
    netPnL:        +netPnL.toFixed(2),
    netPnLPercent: +netPnLPercent.toFixed(3),
    breakEvenMove: +breakEvenMove.toFixed(4),
    isProfitable:  netPnL > 0,
  };
}

/**
 * getOptimalQty(buyPrice, target, stopLoss, capital?)
 * Computes the optimal quantity such that:
 *  - Risk per trade is capped at 1% of available capital (default ₹50,000)
 *  - Minimum 1 share
 *
 * @param {number} buyPrice
 * @param {number} target
 * @param {number} stopLoss
 * @param {number} [capital=50000]  Available capital in ₹
 * @returns {number} qty
 */
function getOptimalQty(buyPrice, target, stopLoss, capital = 50000) {
  if (!target || !stopLoss || buyPrice <= 0) return 1;
  const riskPerShare = Math.abs(buyPrice - stopLoss);
  if (riskPerShare === 0) return 1;
  const maxRisk = capital * 0.01; // 1% risk
  const qty = Math.max(1, Math.floor(maxRisk / riskPerShare));
  // Also cap to available capital
  const maxByCapital = Math.floor(capital / buyPrice);
  return Math.min(qty, maxByCapital);
}

// ── Full NSE Stock Universe ───────────────────────────────────────────────────
const NSE_STOCKS = [
  // ── Nifty 50 ──────────────────────────────────────────────────────────────
  "RELIANCE.NS","TCS.NS","HDFCBANK.NS","BHARTIARTL.NS","ICICIBANK.NS",
  "INFOSYS.NS","SBIN.NS","LICI.NS","HINDUNILVR.NS","ITC.NS",
  "BAJFINANCE.NS","LT.NS","HCLTECH.NS","KOTAKBANK.NS","MARUTI.NS",
  "AXISBANK.NS","ASIANPAINT.NS","SUNPHARMA.NS","TITAN.NS","WIPRO.NS",
  "NESTLEIND.NS","ADANIENT.NS","POWERGRID.NS","NTPC.NS","ULTRACEMCO.NS",
  "TECHM.NS","TATAMOTORS.NS","BAJAJFINSV.NS","ONGC.NS","INDUSINDBK.NS",
  "TATASTEEL.NS","COALINDIA.NS","HINDALCO.NS","ADANIPORTS.NS","JSWSTEEL.NS",
  "DRREDDY.NS","M%26M.NS","CIPLA.NS","BRITANNIA.NS","APOLLOHOSP.NS",
  "TATACONSUM.NS","GRASIM.NS","EICHERMOT.NS","BPCL.NS","DIVISLAB.NS",
  "SBILIFE.NS","HEROMOTOCO.NS","HDFCLIFE.NS","SHRIRAMFIN.NS","BAJAJ-AUTO.NS",

  // ── Nifty Next 50 ─────────────────────────────────────────────────────────
  "ADANIGREEN.NS","ADANIPOWER.NS","ADANITRANS.NS","AMBUJACEM.NS","AUROPHARMA.NS",
  "BANDHANBNK.NS","BERGEPAINT.NS","BOSCHLTD.NS","CANBK.NS","CHOLAFIN.NS",
  "COLPAL.NS","CONCOR.NS","DABUR.NS","DLF.NS","FEDERALBNK.NS",
  "GAIL.NS","GODREJCP.NS","GODREJPROP.NS","HAVELLS.NS","HDFCAMC.NS",
  "ICICIPRULI.NS","IDFCFIRSTB.NS","IOC.NS","IGL.NS","INDHOTEL.NS",
  "INDUSTOWER.NS","IRCTC.NS","JINDALSTEL.NS","LICHSGFIN.NS","LUPIN.NS",
  "MARICO.NS","MUTHOOTFIN.NS","NAUKRI.NS","NMDC.NS","OBEROIREAL.NS",
  "OFSS.NS","PAGEIND.NS","PAYTM.NS","PEL.NS","PIDILITIND.NS",
  "PNB.NS","RECLTD.NS","SAIL.NS","SIEMENS.NS","SRF.NS",
  "TATACOMM.NS","TRENT.NS","VEDL.NS","VOLTAS.NS","ZYDUSLIFE.NS",

  // ── Nifty Midcap 150 (sample) ─────────────────────────────────────────────
  "AARTIIND.NS","ABB.NS","ABCAPITAL.NS","ABFRL.NS","ACC.NS",
  "AIAENG.NS","ALKEM.NS","APLLTD.NS","ASTRAL.NS","ATUL.NS",
  "AUBANK.NS","BALRAMCHIN.NS","BANKBARODA.NS","BATAINDIA.NS","BEL.NS",
  "BHEL.NS","COFORGE.NS","CROMPTON.NS","CUMMINSIND.NS","CYIENT.NS",
  "DEEPAKNTR.NS","ELGIEQUIP.NS","EMAMILTD.NS","ENGINERSIN.NS","ESCORTS.NS",
  "FORTIS.NS","GLENMARK.NS","GRANULES.NS","HAPPSTMNDS.NS","IPCALAB.NS",
  "JBCHEPHARM.NS","JKCEMENT.NS","JUBLFOOD.NS","KALYANKJIL.NS","KEI.NS",
  "KPIL.NS","LAURUSLABS.NS","LTIM.NS","LTTS.NS","MANAPPURAM.NS",
  "MCX.NS","MPHASIS.NS","NBCC.NS","NHPC.NS","NLCINDIA.NS",
  "OLECTRA.NS","POLYCAB.NS","PRESTIGE.NS","RADICO.NS","RAILTEL.NS",
  "RBLBANK.NS","RITES.NS","SJVN.NS","SOBHA.NS","STARHEALTH.NS",
  "SUNDARMFIN.NS","SUPREMEIND.NS","SYNGENE.NS","TANLA.NS","TATAELXSI.NS",
  "THERMAX.NS","TITAGARH.NS","UJJIVANSFB.NS","UNIONBANK.NS","UTIAMC.NS",
  "VGUARD.NS","ZOMATO.NS","NYKAA.NS",

  // ── Infrastructure & Energy ───────────────────────────────────────────────
  "ADANIENSOL.NS","ADANIGAS.NS","AEGISLOG.NS","BPCL.NS","CESC.NS",
  "CGPOWER.NS","GMRINFRA.NS","GPPL.NS","GUJGAS.NS","HINDPETRO.NS",
  "IOC.NS","IGL.NS","IRB.NS","IRCON.NS","IREDA.NS","IRFC.NS",
  "JSWENERGY.NS","KEC.NS","NTPC.NS","ONGC.NS","PETRONET.NS","PFC.NS",
  "POWERGRID.NS","PTC.NS","RECLTD.NS","RINFRA.NS","RPOWER.NS",
  "SAIL.NS","SWSOLAR.NS","TATAPOWER.NS","TORNTPOWER.NS","UPL.NS","VEDL.NS",

  // ── IT & Tech ─────────────────────────────────────────────────────────────
  "CIGNITITEC.NS","DATAMATICS.NS","ECLERX.NS","FIRSTSOURC.NS","HEXAWARE.NS",
  "INTELLECT.NS","KPITTECH.NS","MASTEK.NS","MINDTREE.NS","NUCLEUS.NS",
  "OFSS.NS","PERSISTENT.NS","RATEGAIN.NS","ROUTE.NS","SONATA.NS",
  "TATAELXSI.NS","WIPRO.NS","ZENSARTECH.NS",

  // ── Pharma ────────────────────────────────────────────────────────────────
  "ABBOTINDIA.NS","AJANTPHARM.NS","ALKEM.NS","APLLTD.NS","ASTRAZEN.NS",
  "AUROPHARMA.NS","CIPLA.NS","DRREDDY.NS","GLAND.NS","GLENMARK.NS",
  "GRANULES.NS","IPCALAB.NS","LAURUSLABS.NS","LUPIN.NS","NATCOPHARM.NS",
  "PFIZER.NS","SANOFI.NS","SUNPHARMA.NS","TORNTPHARM.NS","ZYDUSLIFE.NS",
];

// ── BSE Stocks ────────────────────────────────────────────────────────────────
const BSE_STOCKS = [
  "RELIANCE.BO","TCS.BO","HDFCBANK.BO","ICICIBANK.BO","INFOSYS.BO",
  "SBIN.BO","BHARTIARTL.BO","ITC.BO","HINDUNILVR.BO","BAJFINANCE.BO",
  "LT.BO","HCLTECH.BO","KOTAKBANK.BO","MARUTI.BO","AXISBANK.BO",
  "ASIANPAINT.BO","SUNPHARMA.BO","TITAN.BO","WIPRO.BO","NESTLEIND.BO",
  "POWERGRID.BO","NTPC.BO","TATAMOTORS.BO","BAJAJFINSV.BO","ONGC.BO",
  "TATASTEEL.BO","COALINDIA.BO","HINDALCO.BO","ADANIPORTS.BO","JSWSTEEL.BO",
  "DRREDDY.BO","CIPLA.BO","BRITANNIA.BO","APOLLOHOSP.BO","TATACONSUM.BO",
  "GRASIM.BO","EICHERMOT.BO","BPCL.BO","SBILIFE.BO","HEROMOTOCO.BO",
  "HDFCLIFE.BO","BAJAJ-AUTO.BO","ADANIGREEN.BO","TECHM.BO","INDUSINDBK.BO",
  "DIVISLAB.BO","M%26M.BO","SHRIRAMFIN.BO","AMBUJACEM.BO","DLF.BO",
  "GODREJCP.BO","HAVELLS.BO","PIDILITIND.BO","SIEMENS.BO","TRENT.BO",
  "MARICO.BO","DABUR.BO","COLPAL.BO","NAUKRI.BO","GAIL.BO","IRCTC.BO",
  "RECLTD.BO","IDFCFIRSTB.BO","BANDHANBNK.BO","MUTHOOTFIN.BO","SAIL.BO",
  "FEDERALBNK.BO","CANBK.BO","PNB.BO","BANKBARODA.BO","UNIONBANK.BO",
  "IOC.BO","VEDL.BO","TATAPOWER.BO","CHOLAFIN.BO","BERGEPAINT.BO",
  "ZOMATO.BO","NYKAA.BO","PAYTM.BO","JUBLFOOD.BO","IREDA.BO","IRFC.BO",
];

const STOCKS = [...new Set([...NSE_STOCKS, ...BSE_STOCKS])];
console.log(`📊 Total stock universe: ${STOCKS.length} symbols`);

// ── Open Positions ────────────────────────────────────────────────────────────
const openPositions = {};

// ── Signal Cache ──────────────────────────────────────────────────────────────
let signalCache  = null;
let partialCache = null;
let cacheTime    = 0;
let isScanning   = false;
let scanProgress = { done: 0, total: STOCKS.length, started: null };

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fetch OHLCV from Yahoo Finance ────────────────────────────────────────────
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
  } catch {
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
function projectSellTime(currentPrice, target, atr, periodMinutes = 14) {
  if (!target || !atr || atr === 0) return null;
  const gap            = Math.abs(target - currentPrice);
  const pricePerMinute = atr / periodMinutes;
  if (pricePerMinute === 0) return null;
  const minutesNeeded  = Math.ceil(gap / pricePerMinute);
  if (minutesNeeded > 240) return null;
  const sell = new Date(Date.now() + minutesNeeded * 60000);
  return sell.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour:     "2-digit",
    minute:   "2-digit",
  });
}

// ── Core Signal Engine — 12 Indicators ───────────────────────────────────────
function generateSignal(closes, highs, lows, volumes, opens) {
  const prices = closes;
  const hs = highs, ls = lows, vs = volumes;
  if (prices.length < 30) return null;
  const last = prices.at(-1);

  const rsiArr = RSI.calculate({ values: prices, period: 14 });
  const rsi    = rsiArr.at(-1);
  const sma10  = SMA.calculate({ values: prices, period: 10 }).at(-1);
  const sma20  = SMA.calculate({ values: prices, period: 20 }).at(-1);
  const sma50  = prices.length >= 50 ? SMA.calculate({ values: prices, period: 50 }).at(-1) : null;
  const ema9   = EMA.calculate({ values: prices, period: 9 }).at(-1);
  const ema21  = EMA.calculate({ values: prices, period: 21 }).at(-1);

  const macdArr = MACD.calculate({
    values: prices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const macd     = macdArr.at(-1);
  const macdPrev = macdArr.at(-2);

  const bbArr = BollingerBands.calculate({ values: prices, period: 20, stdDev: 2 });
  const bb    = bbArr.at(-1);

  let stoch = null;
  if (hs.length >= 14) {
    const stochArr = Stochastic.calculate({ high: hs, low: ls, close: prices, period: 14, signalPeriod: 3 });
    stoch = stochArr.at(-1);
  }

  let adx = null;
  if (hs.length >= 14) {
    const adxArr = ADX.calculate({ high: hs, low: ls, close: prices, period: 14 });
    adx = adxArr.at(-1);
  }

  let atr = null;
  if (hs.length >= 14) {
    const atrArr = ATR.calculate({ high: hs, low: ls, close: prices, period: 14 });
    atr = atrArr.at(-1);
  }

  const obvArr  = OBV.calculate({ close: prices, volume: vs });
  const obvNow  = obvArr.at(-1);
  const obvPrev = obvArr.at(-2);
  const priceUp = prices.at(-1) > prices.at(-2);

  const wrArr = WilliamsR.calculate({ high: hs, low: ls, close: prices, period: 14 });
  const wr    = wrArr.at(-1);

  let cci = null;
  if (hs.length >= 20) {
    const cciArr = CCI.calculate({ high: hs, low: ls, close: prices, period: 20 });
    cci = cciArr.at(-1);
  }

  let mfi = null;
  if (hs.length >= 14 && vs.length >= 14) {
    const mfiArr = MFI.calculate({ high: hs, low: ls, close: prices, volume: vs, period: 14 });
    mfi = mfiArr.at(-1);
  }

  const vwapArr = calculateVWAP(closes, highs, lows, volumes);
  const vwapNow = vwapArr.filter(Boolean).at(-1);
  const vwapDev = vwapNow ? ((last - vwapNow) / vwapNow) * 100 : null;

  let bullScore = 0, bearScore = 0, maxScore = 0;
  const reasons = [];

  // RSI (2)
  maxScore += 2;
  if (rsi < 30)      { bullScore += 2; reasons.push(`RSI Oversold (${Math.round(rsi)})`); }
  else if (rsi < 45) { bullScore += 1; reasons.push("RSI Recovering"); }
  else if (rsi > 70) { bearScore += 2; reasons.push(`RSI Overbought (${Math.round(rsi)})`); }
  else if (rsi > 60) { bearScore += 1; }

  // SMA (3)
  maxScore += 3;
  if (last > sma10) bullScore += 1;
  if (last > sma20) { bullScore += 1; reasons.push("Above SMA20"); }
  if (sma50 && last > sma50) { bullScore += 1; reasons.push("Above SMA50"); }
  if (last < sma10) bearScore += 1;
  if (last < sma20) bearScore += 1;
  if (sma50 && last < sma50) bearScore += 1;

  // EMA (1.5)
  maxScore += 1.5;
  if (ema9 > ema21 && last > ema21)      { bullScore += 1.5; reasons.push("EMA Bullish Cross"); }
  else if (ema9 < ema21 && last < ema21) { bearScore += 1.5; reasons.push("EMA Bearish Cross"); }

  // MACD (2)
  maxScore += 2;
  if (macd && macdPrev) {
    if (macd.MACD > macd.signal)   bullScore += 1;
    if (macd.histogram > 0 && macdPrev.histogram <= 0) { bullScore += 1; reasons.push("MACD Bullish Crossover"); }
    if (macd.MACD < macd.signal)   bearScore += 1;
    if (macd.histogram < 0 && macdPrev.histogram >= 0) { bearScore += 1; reasons.push("MACD Bearish Crossover"); }
  }

  // Bollinger (1.5)
  maxScore += 1.5;
  if (bb) {
    if (last < bb.lower)                          { bullScore += 1.5; reasons.push("BB Oversold Squeeze"); }
    else if (last < bb.middle && last > bb.lower) { bullScore += 0.5; }
    else if (last > bb.upper)                     { bearScore += 1.5; reasons.push("BB Overbought"); }
    else if (last > bb.middle && last < bb.upper) { bearScore += 0.5; }
  }

  // Stochastic (1.5)
  maxScore += 1.5;
  if (stoch) {
    if (stoch.k < 20)      { bullScore += 1.5; reasons.push("Stochastic Oversold"); }
    else if (stoch.k > 80) { bearScore += 1.5; reasons.push("Stochastic Overbought"); }
  }

  // Williams %R (1)
  maxScore += 1;
  if (wr < -80)      bullScore += 1;
  else if (wr > -20) bearScore += 1;

  // OBV (1.5)
  maxScore += 1.5;
  if (obvNow > obvPrev && priceUp)       { bullScore += 1.5; reasons.push("Volume Confirms Upside"); }
  else if (obvNow < obvPrev && !priceUp) { bearScore += 1.5; reasons.push("Volume Confirms Downside"); }

  // CCI (1.5)
  maxScore += 1.5;
  if (cci !== null) {
    if (cci < -100)     { bullScore += 1.5; reasons.push("CCI Oversold"); }
    else if (cci > 100) { bearScore += 1.5; }
  }

  // MFI (2)
  maxScore += 2;
  if (mfi !== null) {
    if (mfi < 20)      { bullScore += 2; reasons.push("MFI Oversold (Volume Weighted)"); }
    else if (mfi < 40) { bullScore += 1; }
    else if (mfi > 80) { bearScore += 2; reasons.push("MFI Overbought"); }
    else if (mfi > 60) { bearScore += 1; }
  }

  // VWAP (2)
  maxScore += 2;
  if (vwapDev !== null) {
    if (vwapDev < -1.5)      { bullScore += 2; reasons.push("Below VWAP (Institutional Buy Zone)"); }
    else if (vwapDev < -0.5) { bullScore += 1; reasons.push("Below VWAP"); }
    else if (vwapDev > 1.5)  { bearScore += 2; reasons.push("Extended Above VWAP"); }
    else if (vwapDev > 0.5)  { bearScore += 1; }
  }

  const adxVal     = adx ? adx.adx : 0;
  const trendBonus = adxVal >= 40 ? 1.3 : adxVal >= 25 ? 1.15 : adxVal >= 15 ? 1.0 : 0.85;
  const rawScore   = maxScore > 0 ? (bullScore / maxScore) * 100 : 50;
  const score      = Math.min(100, Math.round(rawScore * trendBonus));

  const confluence = Math.max(bullScore, bearScore) >= 4;

  let signal = "HOLD";
  if (score >= 58)      signal = "BUY";
  else if (score <= 32) signal = "SELL";

  if (signal === "BUY"  && !confluence && score < 65) signal = "HOLD";
  if (signal === "SELL" && !confluence && score > 20) signal = "HOLD";

  if (signal === "HOLD" && score >= 50 && bullScore > bearScore) {
    signal = "WEAK BUY";
  }

  const stopLoss = atr ? +(last - 1.5 * atr).toFixed(2) : null;
  const target   = atr ? +(last + 2.5 * atr).toFixed(2) : null;
  const projectedSellTime = (signal === "BUY" || signal === "WEAK BUY")
    ? projectSellTime(last, target, atr)
    : null;

  // ── v3.2: Groww Brokerage Calculation ─────────────────────────────────────
  let brokerageInfo = null;
  if ((signal === "BUY" || signal === "WEAK BUY") && target && stopLoss) {
    const qty = getOptimalQty(last, target, stopLoss);
    brokerageInfo = calculateGrowwCharges(last, target, qty);
    brokerageInfo.qty = qty;
    brokerageInfo.chargePercent = last > 0
      ? +((brokerageInfo.totalCharges / (last * qty)) * 100).toFixed(4)
      : 0;
  }

  return {
    signal, score, bullScore, bearScore,
    reasons: reasons.slice(0, 6),
    stopLoss, target,
    rsi:           rsi  ? Math.round(rsi)    : null,
    mfi:           mfi  ? Math.round(mfi)    : null,
    cci:           cci  ? Math.round(cci)    : null,
    atr:           atr  ? +atr.toFixed(2)    : null,
    trendStrength: adx  ? Math.round(adxVal) : null,
    vwapDeviation: vwapDev ? +vwapDev.toFixed(2) : null,
    vwap:          vwapNow ? +vwapNow.toFixed(2)  : null,
    projectedSellTime,
    confluence,
    macdHistogram: macd  ? +macd.histogram.toFixed(2) : null,
    stochK:        stoch ? Math.round(stoch.k)        : null,
    brokerageInfo,                   // ← NEW in v3.2
    isProfitable:  brokerageInfo ? brokerageInfo.isProfitable : null,
  };
}

// ── Position Tracker ──────────────────────────────────────────────────────────
function checkExitCondition(symbol, currentPrice, analysis) {
  const pos = openPositions[symbol];

  if (!pos) {
    if (analysis.signal === "BUY" || analysis.signal === "WEAK BUY") {
      openPositions[symbol] = {
        entryPrice:        currentPrice,
        entryTime:         getISTTime(),
        target:            analysis.target,
        stopLoss:          analysis.stopLoss,
        projectedSellTime: analysis.projectedSellTime,
        signalType:        analysis.signal,
        brokerageInfo:     analysis.brokerageInfo,
      };
      return { action: analysis.signal, isNew: true };
    }
    return { action: analysis.signal, isNew: false };
  }

  const hitTarget   = analysis.target   && currentPrice >= analysis.target;
  const hitStopLoss = analysis.stopLoss && currentPrice <= analysis.stopLoss;
  const signalSell  = analysis.signal === "SELL";

  if (hitTarget || hitStopLoss || signalSell) {
    // Recalculate actual net P&L on exit
    const qty      = pos.brokerageInfo?.qty || 1;
    const exitCalc = calculateGrowwCharges(pos.entryPrice, currentPrice, qty);
    const pl       = exitCalc.netPnLPercent.toFixed(2);

    delete openPositions[symbol];
    return {
      action:      "SELL", isNew: true,
      reason:      hitTarget ? "🎯 Target Hit" : hitStopLoss ? "🛑 Stop-Loss Hit" : "📉 Signal Reversed",
      profitLoss:  pl,
      netPnL:      exitCalc.netPnL,
      totalCharges: exitCalc.totalCharges,
      entryPrice:  pos.entryPrice,
      entryTime:   pos.entryTime,
    };
  }

  return { action: pos.signalType || "BUY", isNew: false, position: pos };
}

// ── Core Scanner — Batched Parallel ──────────────────────────────────────────
async function runFullScan() {
  if (isScanning) return;
  isScanning   = true;
  scanProgress = { done: 0, total: STOCKS.length, started: getISTTime() };

  const results = [];
  const batches = [];
  for (let i = 0; i < STOCKS.length; i += BATCH_SIZE) {
    batches.push(STOCKS.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔍 Scanning ${STOCKS.length} stocks in ${batches.length} batches of ${BATCH_SIZE}...`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const data = await fetchStockData(symbol);
          if (!data || data.closes.length < 30) return null;

          const analysis = generateSignal(data.closes, data.highs, data.lows, data.volumes, data.opens);
          if (!analysis) return null;

          const currentPrice = data.closes.at(-1);
          const exitInfo     = checkExitCondition(symbol, currentPrice, analysis);
          const pos          = openPositions[symbol];

          return {
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

            // ── v3.2 brokerage fields ────────────────────────────────────
            brokerageInfo:  analysis.brokerageInfo || null,
            isProfitable:   analysis.isProfitable,  // net of charges

            entryPrice:    exitInfo.entryPrice || pos?.entryPrice || null,
            entryTime:     exitInfo.entryTime  || pos?.entryTime  || null,
            recentPrices:  data.closes.slice(-30),
          };
        } catch {
          return null;
        }
      })
    );

    const valid = batchResults.filter(Boolean);
    results.push(...valid);
    scanProgress.done += batch.length;
    partialCache = buildPayload(results, false);

    if (bi < batches.length - 1) {
      await sleep(BATCH_DELAY);
    }
  }

  const final = buildPayload(results, true);
  signalCache  = final;
  cacheTime    = Date.now();
  isScanning   = false;
  partialCache = null;
  console.log(`✅ Scan complete: ${results.length} valid stocks | ${getISTTime()}`);
}

function buildPayload(results, isFinal) {
  const sorted = [...results].sort((a, b) => {
    const rank = s => s === "BUY" ? 4 : s === "WEAK BUY" ? 3 : s === "HOLD" ? 2 : 1;
    const rankDiff = rank(b.signal) - rank(a.signal);
    if (rankDiff !== 0) return rankDiff;
    // Among same signal type, sort profitable ones first
    if (a.isProfitable && !b.isProfitable) return -1;
    if (b.isProfitable && !a.isProfitable) return  1;
    if (a.confluence && !b.confluence) return -1;
    if (b.confluence && !a.confluence) return  1;
    return b.score - a.score;
  });

  const best =
    sorted.find(s => s.signal === "BUY"      && s.isProfitable && s.confluence) ||
    sorted.find(s => s.signal === "BUY"      && s.isProfitable) ||
    sorted.find(s => s.signal === "BUY"      && s.confluence) ||
    sorted.find(s => s.signal === "BUY") ||
    sorted.find(s => s.signal === "WEAK BUY" && s.isProfitable && s.confluence) ||
    sorted.find(s => s.signal === "WEAK BUY" && s.isProfitable) ||
    sorted.find(s => s.signal === "WEAK BUY") ||
    sorted[0] ||
    null;

  const buyCount          = sorted.filter(s => s.signal === "BUY").length;
  const weakBuyCount      = sorted.filter(s => s.signal === "WEAK BUY").length;
  const sellCount         = sorted.filter(s => s.signal === "SELL").length;
  const holdCount         = sorted.filter(s => s.signal === "HOLD").length;
  const confluenceCount   = sorted.filter(s => s.confluence).length;
  const profitableCount   = sorted.filter(s => s.isProfitable === true).length;

  return {
    marketOpen:     true,
    signals:        sorted,
    bestStock:      best ? best.symbol : null,
    bestSignal:     best ? best.signal : null,
    timestamp:      getISTTime(),
    openPositions:  Object.keys(openPositions).length,
    scanComplete:   isFinal,
    totalScanned:   results.length,
    brokerageModel: "Groww Intraday (₹20 cap / 0.05% + STT + Exchange + SEBI + Stamp + GST)",
    summary: {
      buy:        buyCount,
      weakBuy:    weakBuyCount,
      sell:       sellCount,
      hold:       holdCount,
      confluence: confluenceCount,
      profitable: profitableCount,  // ← NEW: net profitable after all charges
    },
  };
}

// ── /health ───────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: getISTTime() });
});

// ── /status ───────────────────────────────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({
    marketOpen:    isMarketOpen(),
    openPositions: Object.keys(openPositions).length,
    totalStocks:   STOCKS.length,
    isScanning,
    scanProgress,
    timestamp:     getISTTime(),
  });
});

// ── /scan-status ──────────────────────────────────────────────────────────────
app.get("/scan-status", (req, res) => {
  res.json({
    isScanning,
    done:    scanProgress.done,
    total:   scanProgress.total,
    pct:     scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0,
    started: scanProgress.started,
  });
});

// ── /brokerage-calc ───────────────────────────────────────────────────────────
// Utility endpoint: calculate Groww charges for any trade
// GET /brokerage-calc?buy=500&sell=520&qty=10
app.get("/brokerage-calc", (req, res) => {
  const buyPrice  = parseFloat(req.query.buy);
  const sellPrice = parseFloat(req.query.sell);
  const qty       = parseInt(req.query.qty || "1");

  if (isNaN(buyPrice) || isNaN(sellPrice) || qty < 1) {
    return res.status(400).json({ error: "Params required: buy, sell, qty" });
  }

  const result = calculateGrowwCharges(buyPrice, sellPrice, qty);
  res.json({ ...result, platform: "Groww", tradeType: "Intraday" });
});

// ── /signals ──────────────────────────────────────────────────────────────────
app.get("/signals", async (req, res) => {
  if (!isMarketOpen() && req.query.force !== "true") {
    return res.json({
      marketOpen: false,
      message:    "Market closed. NSE/BSE opens at 9:15 AM IST, Mon–Fri.",
      signals:    [],
      bestStock:  null,
    });
  }

  const limit      = Math.min(500, parseInt(req.query.limit || "200"));
  const exchange   = (req.query.exchange || "ALL").toUpperCase();
  const typeFilter = (req.query.type || "ALL").toUpperCase();
  // ?profitable=true → only show net-profitable signals after Groww charges
  const onlyProfitable = req.query.profitable === "true";

  if (signalCache && Date.now() - cacheTime < CACHE_TTL && req.query.force !== "true") {
    const payload = filterPayload(signalCache, limit, exchange, typeFilter, onlyProfitable);
    return res.json(payload);
  }

  if (isScanning && partialCache) {
    const payload = filterPayload(partialCache, limit, exchange, typeFilter, onlyProfitable);
    return res.json({ ...payload, scanComplete: false });
  }

  runFullScan().catch(console.error);

  if (signalCache) {
    const payload = filterPayload(signalCache, limit, exchange, typeFilter, onlyProfitable);
    return res.json({ ...payload, scanComplete: false, stale: true });
  }

  await sleep(3000);
  if (partialCache) {
    const payload = filterPayload(partialCache, limit, exchange, typeFilter, onlyProfitable);
    return res.json({ ...payload, scanComplete: false });
  }

  res.json({
    marketOpen:   true,
    signals:      [],
    bestStock:    null,
    scanComplete: false,
    message:      "Scan starting, please refresh in 30 seconds",
  });
});

function filterPayload(payload, limit, exchange, typeFilter = "ALL", onlyProfitable = false) {
  let signals = payload.signals;

  if (exchange !== "ALL") {
    signals = signals.filter(s => s.exchange === exchange);
  }

  if (typeFilter !== "ALL") {
    if (typeFilter === "BUY") {
      signals = signals.filter(s => s.signal === "BUY");
    } else if (typeFilter === "WEAKBUY" || typeFilter === "WEAK BUY") {
      signals = signals.filter(s => s.signal === "WEAK BUY");
    } else if (typeFilter === "BUYS") {
      signals = signals.filter(s => s.signal === "BUY" || s.signal === "WEAK BUY");
    } else {
      signals = signals.filter(s => s.signal === typeFilter);
    }
  }

  // ── v3.2: Filter to profitable-only (net of Groww charges) ────────────────
  if (onlyProfitable) {
    signals = signals.filter(s => s.isProfitable === true);
  }

  return {
    ...payload,
    signals: signals.slice(0, limit),
  };
}

// ── Cron Jobs ─────────────────────────────────────────────────────────────────
cron.schedule("15 9 * * 1-5", () => {
  console.log("🟢 Market OPEN — Launching first scan");
  signalCache = null;
  runFullScan().catch(console.error);
}, { timezone: "Asia/Kolkata" });

cron.schedule("30 15 * * 1-5", () => {
  console.log("🔴 Market CLOSED — Clearing positions");
  Object.keys(openPositions).forEach(k => delete openPositions[k]);
  signalCache = null;
}, { timezone: "Asia/Kolkata" });

cron.schedule("*/2 * * * 1-5", () => {
  if (isMarketOpen() && !isScanning) {
    console.log(`🔄 Scheduled rescan (${getISTTime()})`);
    signalCache = null;
    runFullScan().catch(console.error);
  }
}, { timezone: "Asia/Kolkata" });

// ── Keep-Alive Ping ───────────────────────────────────────────────────────────
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  cron.schedule("*/10 * * * 1-5", async () => {
    try {
      await axios.get(`${SELF_URL}/health`, { timeout: 5000 });
      console.log(`💓 Keep-alive OK (${getISTTime()})`);
    } catch (e) {
      console.warn("⚠️ Keep-alive failed:", e.message);
    }
  }, { timezone: "Asia/Kolkata" });
  console.log(`💓 Keep-alive enabled → ${SELF_URL}/health`);
}

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  const nets    = Object.values(os.networkInterfaces()).flat();
  const localIP = nets.find(n => n.family === "IPv4" && !n.internal)?.address ?? "localhost";

  console.log("🚀 Stock Signal Engine v3.2 — Groww Brokerage Edition");
  console.log(`➡  Local:   http://localhost:${PORT}`);
  console.log(`➡  Network: http://${localIP}:${PORT}`);
  if (SELF_URL) console.log(`➡  Public:  ${SELF_URL}`);
  console.log(`📊 Universe: ${STOCKS.length} stocks`);
  console.log(`💸 Brokerage: Groww Intraday (₹20 cap/0.05% + STT + Exchange + SEBI + Stamp + GST)`);
  console.log(`📅 Market: ${isMarketOpen() ? "🟢 OPEN — launching scan" : "🔴 CLOSED"}`);

  if (isMarketOpen()) {
    runFullScan().catch(console.error);
  }
});
