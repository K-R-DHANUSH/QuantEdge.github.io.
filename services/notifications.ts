/**
 * notifications.ts — Push Notification Service v2
 *
 * Enhanced with:
 *  - Projected sell time in BUY notifications
 *  - Confluence badge (🔥 CONFLUENCE — high conviction)
 *  - MFI/CCI context in notification body
 *  - Formatted P&L with ₹ amount
 */

import * as Notifications from "expo-notifications";
import * as Device         from "expo-device";
import { Platform }        from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export async function registerForPushNotifications(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log("⚠️ Notifications only work on real devices");
    return false;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("stock-signals", {
      name:        "Stock Signals",
      description: "BUY / SELL signals with projected exit times",
      importance:  Notifications.AndroidImportance.MAX,
      sound:       "default",
      vibrationPattern: [0, 250, 250, 250],
    });
    // Separate channel for market open/close
    await Notifications.setNotificationChannelAsync("market-status", {
      name:      "Market Status",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound:     "default",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === "granted";
}

export async function sendBuyNotification(
  symbol:            string,
  price:             number,
  target:            number | null,
  stopLoss:          number | null,
  score:             number,
  confluence:        boolean,
  projectedSellTime: string | null,
  mfi:               number | null
): Promise<void> {
  const ticker = symbol.replace(".NS", "").replace(".BO", "");
  const parts  = [];
  if (target)   parts.push(`Target ₹${target}`);
  if (stopLoss) parts.push(`SL ₹${stopLoss}`);
  if (projectedSellTime) parts.push(`Sell by ~${projectedSellTime}`);

  const emoji = confluence ? "🔥" : "🚀";
  const badge = confluence ? " [HIGH CONVICTION]" : "";

  await Notifications.scheduleNotificationAsync({
    content: {
      title:  `${emoji} BUY ${ticker}${badge}`,
      body:   `₹${price} · ${parts.join(" · ")} · ${score}% confidence${mfi ? ` · MFI ${mfi}` : ""}`,
      data:   { symbol, action: "BUY", price },
      sound:  "default",
    },
    trigger: null,
  });
}

export async function sendSellNotification(
  symbol:     string,
  price:      number,
  reason:     string | null,
  profitLoss: string | null,
  entryPrice: number | null
): Promise<void> {
  const ticker  = symbol.replace(".NS", "").replace(".BO", "");
  const pl      = profitLoss ? Number(profitLoss) : 0;
  const plText  = profitLoss ? ` · P&L: ${pl >= 0 ? "+" : ""}${profitLoss}%` : "";
  const plRs    = entryPrice && profitLoss
    ? ` (₹${Math.abs((pl / 100) * entryPrice).toFixed(0)} ${pl >= 0 ? "profit" : "loss"})`
    : "";

  const emoji = reason?.includes("Target") ? "💰"
              : reason?.includes("Stop")   ? "🛑" : "📉";

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${emoji} EXIT ${ticker}`,
      body:  `₹${price} · ${reason || "Signal Exit"}${plText}${plRs}`,
      data:  { symbol, action: "SELL", price },
      sound: "default",
    },
    trigger: null,
  });
}

export async function sendMarketOpenNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title:  "📈 NSE/BSE Market Open",
      body:   "Market is now open. Signal scanning started — 9:15 AM IST",
      sound:  "default",
    },
    trigger: null,
  });
}

export async function sendMarketCloseNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "📉 NSE/BSE Market Closed",
      body:  "Market closed at 3:30 PM IST. All positions cleared.",
      sound: "default",
    },
    trigger: null,
  });
}

export async function sendConfluenceAlert(
  symbol: string,
  score:  number
): Promise<void> {
  const ticker = symbol.replace(".NS", "").replace(".BO", "");
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🔥 Confluence Signal: ${ticker}`,
      body:  `Multiple indicators aligned — ${score}% confidence. This is a high-conviction trade.`,
      data:  { symbol, action: "CONFLUENCE" },
      sound: "default",
    },
    trigger: null,
  });
}