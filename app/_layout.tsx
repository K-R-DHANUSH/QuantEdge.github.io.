/**
 * _layout.tsx — App Root Layout v2
 */

import { Stack }             from "expo-router";
import { StatusBar }         from "expo-status-bar";
import { useColorScheme }    from "react-native";

export default function RootLayout() {
  const scheme = useColorScheme();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown:  false,
          animation:    "slide_from_right",
          contentStyle: { backgroundColor: scheme === "dark" ? "#080D12" : "#F0F4F8" },
        }}
      />
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </>
  );
}