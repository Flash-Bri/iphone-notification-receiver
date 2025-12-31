import { useState, useEffect, useCallback, useRef } from "react";
import { FlatList, Text, View, Pressable, Platform, Alert, RefreshControl, AppState, AppStateStatus } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { NotificationCard } from "@/components/notification-card";
import { DeviceSelectionModal } from "@/components/device-selection-modal";
import { NotificationDetailModal } from "@/components/notification-detail-modal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getBluetoothService, ANCSNotification, resetBluetoothService } from "@/lib/bluetooth-service";
import { getNotificationStorage } from "@/lib/notification-storage";
import { NotificationService } from "@/lib/notification-service";
import { PermissionsAndroid } from "react-native";
import { Device } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LAST_DEVICE_KEY = "@lastConnectedDeviceId";
const LAST_DEVICE_NAME_KEY = "@lastConnectedDeviceName";

export default function HomeScreen() {
  const colors = useColors();
  const [notifications, setNotifications] = useState<ANCSNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showConnectionPopup, setShowConnectionPopup] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<ANCSNotification | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const notificationStorage = getNotificationStorage();
  const appState = useRef(AppState.currentState);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReconnectingRef = useRef(false);

  useEffect(() => {
    initializeBluetooth();

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    const previousState = appState.current;
    appState.current = nextAppState;

    console.log(`[App] State change: ${previousState} -> ${nextAppState}`);

    if (previousState.match(/inactive|background/) && nextAppState === "active") {
      console.log("[App] App came to foreground");
      
      // Small delay to let the system stabilize
      setTimeout(async () => {
        const bluetoothService = getBluetoothService();
        
        if (!bluetoothService.isConnected() && !bluetoothService.isConnecting() && !isReconnectingRef.current) {
          console.log("[App] Not connected, attempting reconnect...");
          await attemptAutoReconnect();
        } else {
          console.log("[App] Already connected or connecting, skipping reconnect");
        }
      }, 500);
    }
  }, []);

  const attemptAutoReconnect = async () => {
    // Prevent concurrent reconnection attempts
    if (isReconnectingRef.current) {
      console.log("[Reconnect] Already reconnecting, skipping");
      return;
    }

    const bluetoothService = getBluetoothService();
    
    // Check if already connected or connecting
    if (bluetoothService.isConnected() || bluetoothService.isConnecting()) {
      console.log("[Reconnect] Already connected or connecting");
      return;
    }

    const lastDeviceId = await AsyncStorage.getItem(LAST_DEVICE_KEY);
    const lastDeviceName = await AsyncStorage.getItem(LAST_DEVICE_NAME_KEY);

    if (!lastDeviceId) {
      console.log("[Reconnect] No saved device");
      setShowConnectionPopup(true);
      return;
    }

    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.log("[Reconnect] Max attempts reached");
      setShowConnectionPopup(true);
      reconnectAttempts.current = 0;
      return;
    }

    isReconnectingRef.current = true;
    setIsReconnecting(true);
    reconnectAttempts.current++;

    console.log(`[Reconnect] Attempt ${reconnectAttempts.current}/${maxReconnectAttempts} to ${lastDeviceName || lastDeviceId}`);

    try {
      // Reinitialize Bluetooth if needed
      await bluetoothService.initialize();
      
      // Discover devices
      const devices = await bluetoothService.discoverDevices();
      const lastDevice = devices.find((d) => d.id === lastDeviceId);

      if (lastDevice) {
        console.log("[Reconnect] Found device, connecting...");
        await bluetoothService.connectToDevice(lastDevice);
        setSelectedDeviceId(lastDeviceId);
        if (lastDeviceName) setDeviceName(lastDeviceName);
        reconnectAttempts.current = 0;
        setShowConnectionPopup(false);
      } else {
        console.log("[Reconnect] Device not found in scan");
        if (reconnectAttempts.current < maxReconnectAttempts) {
          scheduleReconnect(5000);
        } else {
          setShowConnectionPopup(true);
        }
      }
    } catch (error: any) {
      console.error("[Reconnect] Failed:", error?.message || error);
      
      if (reconnectAttempts.current < maxReconnectAttempts) {
        // Exponential backoff
        const delay = Math.min(5000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
        scheduleReconnect(delay);
      } else {
        setShowConnectionPopup(true);
      }
    } finally {
      isReconnectingRef.current = false;
      setIsReconnecting(false);
    }
  };

  const scheduleReconnect = (delay: number) => {
    console.log(`[Reconnect] Scheduling retry in ${delay}ms`);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      attemptAutoReconnect();
    }, delay);
  };

  const initializeBluetooth = async () => {
    try {
      // Request Android permissions
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const allGranted = Object.values(granted).every(
          (status) => status === "granted" || status === "never_ask_again"
        );
        if (!allGranted) {
          Alert.alert(
            "Permissions Required",
            "Bluetooth and location permissions are required to receive notifications from iPhone."
          );
        }
      }

      const bluetoothService = getBluetoothService();

      // Initialize Bluetooth service
      if (Platform.OS !== "web") {
        await bluetoothService.initialize();
      }

      // Load stored notifications
      const stored = await notificationStorage.getAllNotifications();
      setNotifications(stored);

      // Initialize notification service
      await NotificationService.initialize();

      // Set up notification listener
      bluetoothService.onNotification(async (notification) => {
        console.log("[Notification] Received:", notification.categoryName, notification.title);
        await notificationStorage.saveNotification(notification);
        setNotifications((prev) => [notification, ...prev]);

        // Send system notification with full details
        await NotificationService.sendNotification({
          title: notification.title || notification.categoryName || "Notification",
          body: notification.message || `New ${notification.categoryName} notification`,
          subtitle: notification.subtitle,
          categoryName: notification.categoryName,
          isImportant: notification.isImportant,
          appIdentifier: notification.appIdentifier,
        });

        // Haptic feedback
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      });

      // Set up connection listener
      bluetoothService.onConnectionChange(async (connected, name) => {
        console.log(`[Connection] Changed: connected=${connected}, name=${name}`);
        setIsConnected(connected);
        if (name) setDeviceName(name);

        if (!connected && !isReconnectingRef.current) {
          console.log("[Connection] Lost, will attempt reconnect...");
          // Delay before reconnect to allow system to stabilize
          scheduleReconnect(3000);
        }
      });

      setIsInitialized(true);

      // Try to auto-reconnect to last device
      if (Platform.OS !== "web") {
        await attemptAutoReconnect();
      }
    } catch (error: any) {
      console.error("[Init] Bluetooth error:", error?.message || error);
      setIsInitialized(true);
      
      if (Platform.OS !== "web") {
        Alert.alert("Bluetooth", "Could not initialize Bluetooth. Please check your settings.");
      }
    }
  };

  const handleSelectDevice = async (device: Device) => {
    const bluetoothService = getBluetoothService();
    
    // Prevent selection while connecting
    if (bluetoothService.isConnecting()) {
      console.log("[Select] Already connecting, ignoring");
      return;
    }

    try {
      setSelectedDeviceId(device.id);
      setShowDeviceModal(false);
      setShowConnectionPopup(false);

      await bluetoothService.connectToDevice(device);

      // Save device for auto-reconnection
      await AsyncStorage.setItem(LAST_DEVICE_KEY, device.id);
      if (device.name) {
        await AsyncStorage.setItem(LAST_DEVICE_NAME_KEY, device.name);
        setDeviceName(device.name);
      }
      bluetoothService.setLastConnectedDeviceId(device.id);
      reconnectAttempts.current = 0;
    } catch (error: any) {
      console.error("[Select] Connection error:", error?.message || error);
      Alert.alert("Connection Failed", `Could not connect to ${device.name || "device"}. Please try again.`);
      setSelectedDeviceId("");
    }
  };

  const handleOpenDeviceModal = async () => {
    const bluetoothService = getBluetoothService();
    
    setShowDeviceModal(true);
    setShowConnectionPopup(false);
    setLoadingDevices(true);
    
    try {
      // Reinitialize if needed
      if (Platform.OS !== "web") {
        await bluetoothService.initialize();
      }
      
      const scannedDevices = await bluetoothService.discoverDevices();
      setAvailableDevices(scannedDevices);
      console.log("[Modal] Discovered devices:", scannedDevices.length);
    } catch (error: any) {
      console.error("[Modal] Error discovering devices:", error?.message || error);
      Alert.alert("Error", "Failed to discover Bluetooth devices. Please try again.");
    } finally {
      setLoadingDevices(false);
    }
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
    setSelectedNotification(notification);
    setShowDetailModal(true);
  };

  const handleDeleteFromModal = () => {
    if (selectedNotification) {
      handleDeleteNotification(selectedNotification.id);
    }
  };

  const getConnectionStatusText = () => {
    if (isConnected) {
      return deviceName || "Connected";
    }
    if (isReconnecting) {
      return "Reconnecting...";
    }
    return "Tap to select iPhone";
  };

  return (
    <ScreenContainer>
      {/* Connection Popup */}
      {showConnectionPopup && !isConnected && !isReconnecting && (
        <View className="absolute top-0 left-0 right-0 z-50 bg-warning/95 px-4 py-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2 flex-1">
              <IconSymbol name="bluetooth" size={20} color="#000" />
              <Text className="text-sm font-medium text-black flex-1">
                Not connected to iPhone
              </Text>
            </View>
            <Pressable
              onPress={handleOpenDeviceModal}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <View className="bg-black/20 px-3 py-1.5 rounded-full">
                <Text className="text-sm font-semibold text-black">Connect</Text>
              </View>
            </Pressable>
          </View>
        </View>
      )}

      {/* Header */}
      <View className="px-4 pt-2 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-3xl font-bold text-foreground">Notifications</Text>
          {notifications.length > 0 && (
            <Pressable
              onPress={handleClearAll}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <Text className="text-base text-primary font-medium">Clear All</Text>
            </Pressable>
          )}
        </View>

        {/* Connection Status */}
        <Pressable
          onPress={handleOpenDeviceModal}
          disabled={isReconnecting}
          style={({ pressed }) => [{ opacity: pressed && !isReconnecting ? 0.7 : 1 }]}
        >
          <View
            className={`flex-row items-center gap-3 p-3 rounded-xl border ${
              isConnected ? "bg-success/10 border-success/30" : "bg-surface border-border"
            }`}
          >
            <View
              className={`w-3 h-3 rounded-full ${
                isConnected ? "bg-success" : isReconnecting ? "bg-warning" : "bg-muted"
              }`}
            />
            {isReconnecting && (
              <IconSymbol name="bluetooth" size={18} color={colors.warning} />
            )}
            <Text
              className={`flex-1 text-sm ${isConnected ? "text-success font-medium" : "text-muted"}`}
            >
              {getConnectionStatusText()}
            </Text>
            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </View>
        </Pressable>
      </View>

      {/* Notification List */}
      {notifications.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <IconSymbol name="bell.fill" size={64} color={colors.muted} />
          <Text className="text-xl font-semibold text-foreground mt-4 text-center">
            No Notifications Yet
          </Text>
          <Text className="text-sm text-muted mt-2 text-center">
            Select your iPhone from the connection area above to start receiving notifications
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
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
      />

      {/* Notification Detail Modal */}
      <NotificationDetailModal
        notification={selectedNotification}
        visible={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        onDelete={handleDeleteFromModal}
      />
    </ScreenContainer>
  );
}
