import { useState, useEffect, useCallback, useRef } from "react";
import { FlatList, Text, View, Pressable, Platform, Alert, RefreshControl, AppState, AppStateStatus } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { NotificationCard } from "@/components/notification-card";
import { DeviceSelectionModal } from "@/components/device-selection-modal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getBluetoothService, ANCSNotification, DebugLogEntry } from "@/lib/bluetooth-service";
import { getNotificationStorage } from "@/lib/notification-storage";
import { NotificationService } from "@/lib/notification-service";
import { PermissionsAndroid } from "react-native";
import { Device } from "react-native-ble-plx";

export default function HomeScreen() {
  const colors = useColors();
  const [notifications, setNotifications] = useState<ANCSNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const bluetoothService = getBluetoothService();
  const notificationStorage = getNotificationStorage();
  const appState = useRef(AppState.currentState);
  const foregroundNotificationId = useRef<string | null>(null);

  useEffect(() => {
    initializeApp();

    // Listen for app state changes
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === "active") {
      console.log("[HomeScreen] App came to foreground");
      // Refresh connection status
      setIsConnected(bluetoothService.isConnected());
      setIsConnecting(bluetoothService.getIsConnecting());
      const name = bluetoothService.getConnectedDeviceName();
      if (name) setDeviceName(name);
    }
    appState.current = nextAppState;
  };

  const initializeApp = async () => {
    try {
      console.log("[HomeScreen] Initializing app...");

      // Initialize notification service FIRST (for background notifications)
      console.log("[HomeScreen] Initializing notification service...");
      const notifReady = await NotificationService.initialize();
      console.log("[HomeScreen] Notification service ready:", notifReady);

      // Request Android permissions
      if (Platform.OS === "android") {
        console.log("[HomeScreen] Requesting Android permissions...");
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        ]);

        console.log("[HomeScreen] Permission results:", granted);

        const bleGranted =
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === "granted" &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === "granted";

        if (!bleGranted) {
          Alert.alert(
            "Permissions Required",
            "Bluetooth permissions are required to receive notifications from iPhone."
          );
          return;
        }
      }

      // Initialize Bluetooth service
      console.log("[HomeScreen] Initializing Bluetooth service...");
      await bluetoothService.initialize();

      // Load stored notifications
      const stored = await notificationStorage.getAllNotifications();
      setNotifications(stored);
      console.log("[HomeScreen] Loaded", stored.length, "stored notifications");

      // Set up notification listener - THIS IS CRITICAL
      bluetoothService.onNotification(handleNewNotification);

      // Set up connection listener
      bluetoothService.onConnectionChange((connected, name) => {
        console.log("[HomeScreen] Connection changed:", connected, name);
        setIsConnected(connected);
        setIsConnecting(false);
        if (name) setDeviceName(name);

        // Show alert if disconnected unexpectedly
        if (!connected && deviceName) {
          Alert.alert(
            "Connection Lost",
            `Disconnected from ${deviceName}. The app will try to reconnect automatically.`,
            [{ text: "OK" }]
          );
        }
      });

      // Set up debug log listener
      bluetoothService.onDebugLog((entry) => {
        setDebugLogs((prev) => [entry, ...prev].slice(0, 100)); // Keep last 100 entries
      });

      // Check if we have a last connected device and try to auto-connect
      const lastDeviceId = bluetoothService.getLastConnectedDeviceId();
      if (lastDeviceId) {
        console.log("[HomeScreen] Found last device ID, attempting auto-connect...");
        setIsConnecting(true);
        // Auto-connect will happen via the service's internal logic
      }

      console.log("[HomeScreen] Initialization complete");
    } catch (error) {
      console.error("[HomeScreen] Initialization error:", error);
      Alert.alert("Error", "Failed to initialize. Please restart the app.");
    }
  };

  const handleNewNotification = async (notification: ANCSNotification) => {
    console.log("[HomeScreen] New notification received:", notification);

    // Save to storage
    await notificationStorage.saveNotification(notification);

    // Update UI
    setNotifications((prev) => [notification, ...prev]);

    // CRITICAL: Send system notification immediately
    // This ensures notification shows on lockscreen/notification shade
    const sent = await NotificationService.sendNotification(notification);
    console.log("[HomeScreen] System notification sent:", sent);

    // Haptic feedback for new notification (only if app is in foreground)
    if (Platform.OS !== "web" && appState.current === "active") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const loadAvailableDevices = async () => {
    setLoadingDevices(true);
    try {
      const devices = await bluetoothService.discoverDevices();
      setAvailableDevices(devices);
      console.log("[HomeScreen] Discovered devices:", devices.map((d: Device) => d.name));
    } catch (error) {
      console.error("[HomeScreen] Error loading devices:", error);
      Alert.alert("Error", "Failed to load Bluetooth devices.");
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleSelectDevice = async (device: Device) => {
    try {
      setSelectedDeviceId(device.id);
      setIsConnecting(true);
      setShowDeviceModal(false);
      await bluetoothService.connectToDevice(device);
    } catch (error: any) {
      console.error("[HomeScreen] Connection error:", error);
      Alert.alert("Connection Failed", `Could not connect to ${device.name}. ${error.message || "Please try again."}`);
      setSelectedDeviceId("");
      setIsConnecting(false);
    }
  };

  const handleOpenDeviceModal = async () => {
    setShowDeviceModal(true);
    await loadAvailableDevices();
  };

  const handleDeleteNotification = async (id: string) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await notificationStorage.deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearAll = () => {
    Alert.alert("Clear All Notifications", "Are you sure you want to clear all notifications?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          await notificationStorage.clearAll();
          await NotificationService.clearAllNotifications();
          setNotifications([]);
        },
      },
    ]);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const stored = await notificationStorage.getAllNotifications();
    setNotifications(stored);
    setRefreshing(false);
  }, []);

  const handleNotificationPress = (notification: ANCSNotification) => {
    // Build detail message
    let details = "";
    if (notification.appIdentifier) {
      details += `App: ${notification.appDisplayName || notification.appIdentifier}\n`;
    }
    if (notification.title) {
      details += `Title: ${notification.title}\n`;
    }
    if (notification.subtitle) {
      details += `Subtitle: ${notification.subtitle}\n`;
    }
    if (notification.message) {
      details += `Message: ${notification.message}\n`;
    }
    if (notification.date) {
      details += `Date: ${notification.date}\n`;
    }
    details += `\nCategory: ${notification.categoryName}`;
    details += `\nUID: ${notification.notificationUid}`;
    details += `\nImportant: ${notification.isImportant ? "Yes" : "No"}`;

    Alert.alert(
      notification.title || notification.categoryName,
      details,
      [{ text: "OK" }]
    );
  };

  const toggleDebug = () => {
    const newState = !showDebug;
    setShowDebug(newState);
    bluetoothService.setDebugEnabled(newState);
    if (newState) {
      Alert.alert("Debug Mode", "Debug logging is now enabled. Raw BLE data will be captured.");
    }
  };

  const getConnectionStatusText = () => {
    if (isConnecting) return "Connecting...";
    if (isConnected) return `Connected to ${deviceName}`;
    return "Tap to select iPhone";
  };

  const getConnectionStatusColor = () => {
    if (isConnecting) return colors.warning;
    if (isConnected) return colors.success;
    return colors.muted;
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-bold text-foreground">Notifications</Text>
          <View className="flex-row items-center gap-2">
            {/* Debug Toggle */}
            <Pressable
              onPress={toggleDebug}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <View className={`px-2 py-1 rounded-full ${showDebug ? "bg-warning/20" : "bg-surface"}`}>
                <IconSymbol name="bug" size={18} color={showDebug ? colors.warning : colors.muted} />
              </View>
            </Pressable>
            {/* Clear All */}
            {notifications.length > 0 && (
              <Pressable
                onPress={handleClearAll}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              >
                <View className="flex-row items-center gap-1 px-3 py-1.5 bg-error/10 rounded-full">
                  <IconSymbol name="trash" size={16} color={colors.error} />
                  <Text className="text-sm font-medium text-error">Clear</Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {/* Connection Status */}
        <Pressable
          onPress={handleOpenDeviceModal}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          disabled={isConnecting}
        >
          <View className="flex-row items-center justify-between bg-surface rounded-lg px-3 py-2 border border-border">
            <View className="flex-row items-center gap-2 flex-1">
              <View
                style={{ backgroundColor: getConnectionStatusColor() }}
                className="w-2 h-2 rounded-full"
              />
              <IconSymbol name="bluetooth" size={18} color={getConnectionStatusColor()} />
              <Text className="text-sm text-muted flex-1" numberOfLines={1}>
                {getConnectionStatusText()}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={18} color={colors.muted} />
          </View>
        </Pressable>
      </View>

      {/* Debug Panel */}
      {showDebug && debugLogs.length > 0 && (
        <View className="bg-surface border-b border-border px-4 py-2 max-h-40">
          <Text className="text-xs font-bold text-warning mb-1">Debug Log (last {debugLogs.length} entries)</Text>
          <FlatList
            data={debugLogs.slice(0, 10)}
            keyExtractor={(_, index) => index.toString()}
            renderItem={({ item }) => (
              <Text className="text-xs text-muted font-mono" numberOfLines={2}>
                [{item.type}] UID:{item.uid} {item.rawBytes ? `bytes:${item.rawBytes.substring(0, 30)}...` : ""} {item.error || ""}
              </Text>
            )}
          />
        </View>
      )}

      {/* Notification List */}
      {notifications.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <IconSymbol name="bell.fill" size={64} color={colors.muted} />
          <Text className="text-lg font-semibold text-foreground mt-4 text-center">
            No Notifications Yet
          </Text>
          <Text className="text-sm text-muted mt-2 text-center leading-relaxed">
            {isConnected
              ? "Notifications from your iPhone will appear here"
              : isConnecting
              ? "Connecting to your iPhone..."
              : "Select your iPhone from the connection area above to start receiving notifications"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationCard
              notification={item}
              onPress={() => handleNotificationPress(item)}
              onDelete={() => handleDeleteNotification(item.id)}
            />
          )}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        />
      )}

      {/* Device Selection Modal */}
      <DeviceSelectionModal
        visible={showDeviceModal}
        devices={availableDevices}
        loading={loadingDevices}
        selectedDeviceId={selectedDeviceId}
        onSelectDevice={handleSelectDevice}
        onClose={() => setShowDeviceModal(false)}
        onRefresh={loadAvailableDevices}
      />
    </ScreenContainer>
  );
}
