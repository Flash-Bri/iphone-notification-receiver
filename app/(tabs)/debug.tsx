import { useState, useEffect } from "react";
import { View, Text, FlatList, Pressable, Platform, Share, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getBluetoothService, DebugLogEntry } from "@/lib/bluetooth-service";

export default function DebugScreen() {
  const colors = useColors();
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const bluetoothService = getBluetoothService();

  useEffect(() => {
    // Set up debug log listener
    bluetoothService.onDebugLog((entry) => {
      setLogs((prev) => [entry, ...prev].slice(0, 500)); // Keep last 500 entries
    });

    return () => {
      // Disable debug mode when leaving screen
      bluetoothService.setDebugEnabled(false);
    };
  }, []);

  const toggleDebug = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const newState = !isEnabled;
    setIsEnabled(newState);
    bluetoothService.setDebugEnabled(newState);
  };

  const clearLogs = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setLogs([]);
  };

  const exportLogs = async () => {
    if (logs.length === 0) {
      Alert.alert("No Logs", "There are no debug logs to export.");
      return;
    }

    const logText = logs
      .map((log) => {
        const time = new Date(log.timestamp).toISOString();
        let content = `[${time}] [${log.type}] UID: ${log.uid}`;
        if (log.rawBytes) content += `\n  Raw: ${log.rawBytes}`;
        if (log.parsedData) content += `\n  Parsed: ${JSON.stringify(log.parsedData)}`;
        if (log.error) content += `\n  Error: ${log.error}`;
        return content;
      })
      .join("\n\n");

    try {
      await Share.share({
        message: logText,
        title: "ANCS Debug Logs",
      });
    } catch (error) {
      console.error("Error sharing logs:", error);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  const getTypeColor = (type: DebugLogEntry["type"]) => {
    switch (type) {
      case "notification_source":
        return colors.success;
      case "control_point_request":
        return colors.primary;
      case "data_source_response":
        return colors.warning;
      case "parsed_attributes":
        return "#34C759";
      case "error":
        return colors.error;
      default:
        return colors.muted;
    }
  };

  const getTypeLabel = (type: DebugLogEntry["type"]) => {
    switch (type) {
      case "notification_source":
        return "NS";
      case "control_point_request":
        return "CP";
      case "data_source_response":
        return "DS";
      case "parsed_attributes":
        return "PA";
      case "error":
        return "ERR";
      default:
        return "?";
    }
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-bold text-foreground">Debug</Text>
          <View className="flex-row items-center gap-2">
            {logs.length > 0 && (
              <>
                <Pressable
                  onPress={exportLogs}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <View className="px-3 py-1.5 bg-primary/10 rounded-full">
                    <Text className="text-sm font-medium text-primary">Export</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={clearLogs}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <View className="px-3 py-1.5 bg-error/10 rounded-full">
                    <Text className="text-sm font-medium text-error">Clear</Text>
                  </View>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Enable Toggle */}
        <Pressable
          onPress={toggleDebug}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <View
            className={`flex-row items-center justify-between rounded-lg px-4 py-3 border ${
              isEnabled ? "bg-warning/10 border-warning" : "bg-surface border-border"
            }`}
          >
            <View className="flex-row items-center gap-3">
              <IconSymbol name="bug" size={22} color={isEnabled ? colors.warning : colors.muted} />
              <View>
                <Text className="text-base font-medium text-foreground">
                  Debug Logging {isEnabled ? "Enabled" : "Disabled"}
                </Text>
                <Text className="text-xs text-muted mt-0.5">
                  {isEnabled ? "Capturing raw BLE data" : "Tap to enable"}
                </Text>
              </View>
            </View>
            <View
              className={`w-12 h-7 rounded-full items-center justify-center ${
                isEnabled ? "bg-warning" : "bg-muted/30"
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white ${
                  isEnabled ? "ml-5" : "mr-5"
                }`}
              />
            </View>
          </View>
        </Pressable>
      </View>

      {/* Legend */}
      <View className="px-4 py-2 flex-row flex-wrap gap-3 border-b border-border">
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded" style={{ backgroundColor: colors.success }} />
          <Text className="text-xs text-muted">NS: Notification Source</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded" style={{ backgroundColor: colors.primary }} />
          <Text className="text-xs text-muted">CP: Control Point</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded" style={{ backgroundColor: colors.warning }} />
          <Text className="text-xs text-muted">DS: Data Source</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded" style={{ backgroundColor: "#34C759" }} />
          <Text className="text-xs text-muted">PA: Parsed</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="w-3 h-3 rounded" style={{ backgroundColor: colors.error }} />
          <Text className="text-xs text-muted">ERR: Error</Text>
        </View>
      </View>

      {/* Log List */}
      {logs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <IconSymbol name="bug" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground mt-4 text-center">
            No Debug Logs
          </Text>
          <Text className="text-sm text-muted mt-2 text-center leading-relaxed">
            {isEnabled
              ? "Waiting for BLE events... Connect to your iPhone to see data."
              : "Enable debug logging above to capture raw BLE data."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(_, index) => index.toString()}
          renderItem={({ item }) => (
            <View className="px-4 py-2 border-b border-border/50">
              <View className="flex-row items-center gap-2 mb-1">
                <View
                  className="px-2 py-0.5 rounded"
                  style={{ backgroundColor: getTypeColor(item.type) }}
                >
                  <Text className="text-xs font-bold text-white">{getTypeLabel(item.type)}</Text>
                </View>
                <Text className="text-xs text-muted font-mono">{formatTimestamp(item.timestamp)}</Text>
                <Text className="text-xs text-foreground font-medium">UID: {item.uid}</Text>
              </View>

              {item.rawBytes && (
                <View className="mt-1">
                  <Text className="text-xs text-muted mb-0.5">Raw bytes:</Text>
                  <Text className="text-xs text-foreground font-mono bg-surface p-2 rounded" selectable>
                    {item.rawBytes}
                  </Text>
                </View>
              )}

              {item.parsedData && (
                <View className="mt-1">
                  <Text className="text-xs text-muted mb-0.5">Parsed:</Text>
                  <Text className="text-xs text-success font-mono bg-surface p-2 rounded" selectable>
                    {JSON.stringify(item.parsedData, null, 2)}
                  </Text>
                </View>
              )}

              {item.error && (
                <View className="mt-1">
                  <Text className="text-xs text-error font-mono bg-error/10 p-2 rounded" selectable>
                    {item.error}
                  </Text>
                </View>
              )}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
    </ScreenContainer>
  );
}
