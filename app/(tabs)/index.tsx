import { useState, useEffect, useCallback, useRef } from "react";
import { FlatList, Text, View, Pressable, Platform, Alert, RefreshControl, AppState } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { NotificationCard } from "@/components/notification-card";
import { DeviceSelectionModal } from "@/components/device-selection-modal";
import { NotificationDetailModal } from "@/components/notification-detail-modal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getBluetoothService, ANCSNotification } from "@/lib/bluetooth-service";
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

  const bluetoothService = getBluetoothService();
  const notificationStorage = getNotificationStorage();
  const appState = useRef(AppState.currentState);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  useEffect(() => {
    initializeBluetooth();

    // Monitor app state for background/foreground transitions
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      bluetoothService.destroy();
    };
  }, []);

  const handleAppStateChange = async (nextAppState: string) => {
    if (appState.current.match(/inactive|background/) && nextAppState === "active") {
      console.log("App came to foreground, checking connection...");
      if (!bluetoothService.isConnected()) {
        await attemptAutoReconnect();
      }
    }
    appState.current = nextAppState as any;
  };

  const attemptAutoReconnect = async () => {
    const lastDeviceId = await AsyncStorage.getItem(LAST_DEVICE_KEY);
    const lastDeviceName = await AsyncStorage.getItem(LAST_DEVICE_NAME_KEY);

    if (!lastDeviceId) {
      setShowConnectionPopup(true);
      return;
    }

    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.log("Max reconnect attempts reached");
      setShowConnectionPopup(true);
      reconnectAttempts.current = 0;
      return;
    }

    setIsReconnecting(true);
    reconnectAttempts.current++;

    try {
      console.log("Attempting auto-reconnect to:", lastDeviceName || lastDeviceId);
      const devices = await bluetoothService.discoverDevices();
      const lastDevice = devices.find((d) => d.id === lastDeviceId);

      if (lastDevice) {
        await bluetoothService.connectToDevice(lastDevice);
        setSelectedDeviceId(lastDeviceId);
        if (lastDeviceName) setDeviceName(lastDeviceName);
        reconnectAttempts.current = 0;
      } else {
        console.log("Last device not found in scan");
        setShowConnectionPopup(true);
      }
    } catch (error) {
      console.error("Auto-reconnect failed:", error);
      if (reconnectAttempts.current < maxReconnectAttempts) {
        setTimeout(() => attemptAutoReconnect(), 5000);
      } else {
        setShowConnectionPopup(true);
      }
    } finally {
      setIsReconnecting(false);
    }
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

        const allGranted = Object.values(granted).every((status) => status === "granted");
        if (!allGranted) {
          Alert.alert(
            "Permissions Required",
            "Bluetooth and location permissions are required to receive notifications from iPhone."
          );
          return;
        }
      }

      // Initialize Bluetooth service
      await bluetoothService.initialize();

      // Load stored notifications
      const stored = await notificationStorage.getAllNotifications();
      setNotifications(stored);

      // Initialize notification service
      await NotificationService.initialize();

      // Set up notification listener
      bluetoothService.onNotification(async (notification) => {
        console.log("New notification received:", notification);
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

        // Haptic feedback for new notification
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      });

      // Set up connection listener with reconnection logic
      bluetoothService.onConnectionChange(async (connected, name) => {
        setIsConnected(connected);
        if (name) setDeviceName(name);

        if (!connected && selectedDeviceId) {
          // Connection lost, attempt reconnection
          console.log("Connection lost, attempting reconnect...");
          setTimeout(() => attemptAutoReconnect(), 2000);
        }
      });

      // Try to auto-reconnect to last device
      await attemptAutoReconnect();
    } catch (error) {
      console.error("Bluetooth initialization error:", error);
      Alert.alert("Error", "Failed to initialize Bluetooth. Please check your settings.");
    }
  };

  const loadAvailableDevices = async () => {
    setLoadingDevices(true);
    try {
      const devices = await bluetoothService.getPairedDevices();
      setAvailableDevices(devices);
      console.log("Available devices:", devices.map((d) => d.name));
    } catch (error) {
      console.error("Error loading devices:", error);
      Alert.alert("Error", "Failed to load Bluetooth devices.");
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleSelectDevice = async (device: Device) => {
    try {
      setSelectedDeviceId(device.id);
      await bluetoothService.connectToDevice(device);
      setShowDeviceModal(false);
      setShowConnectionPopup(false);

      // Save device for auto-reconnection
      await AsyncStorage.setItem(LAST_DEVICE_KEY, device.id);
      if (device.name) {
        await AsyncStorage.setItem(LAST_DEVICE_NAME_KEY, device.name);
      }
      bluetoothService.setLastConnectedDeviceId(device.id);
      reconnectAttempts.current = 0;
    } catch (error) {
      console.error("Connection error:", error);
      Alert.alert("Connection Failed", `Could not connect to ${device.name}. Please try again.`);
      setSelectedDeviceId("");
    }
  };

  const handleOpenDeviceModal = async () => {
    setShowDeviceModal(true);
    setShowConnectionPopup(false);
    setLoadingDevices(true);
    try {
      const scannedDevices = await bluetoothService.discoverDevices();
      setAvailableDevices(scannedDevices);
      console.log("Discovered devices:", scannedDevices.map((d) => d.name));
    } catch (error) {
      console.error("Error discovering devices:", error);
      Alert.alert("Error", "Failed to discover Bluetooth devices.");
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

  return (
    <ScreenContainer>
      {/* Connection Popup */}
      {showConnectionPopup && !isConnected && (
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
      <View className={`px-4 pt-4 pb-3 border-b border-border ${showConnectionPopup && !isConnected ? "mt-12" : ""}`}>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-bold text-foreground">Notifications</Text>
          {notifications.length > 0 && (
            <Pressable
              onPress={handleClearAll}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <View className="flex-row items-center gap-2 px-3 py-1.5 bg-error/10 rounded-full">
                <IconSymbol name="trash" size={16} color={colors.error} />
                <Text className="text-sm font-medium text-error">Clear All</Text>
              </View>
            </Pressable>
          )}
        </View>

        {/* Connection Status */}
        <Pressable
          onPress={handleOpenDeviceModal}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <View className="flex-row items-center justify-between bg-surface rounded-lg px-3 py-2 border border-border">
            <View className="flex-row items-center gap-2 flex-1">
              <View
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : isReconnecting ? "bg-warning" : "bg-muted"}`}
              />
              <IconSymbol
                name="bluetooth"
                size={18}
                color={isConnected ? colors.success : isReconnecting ? colors.warning : colors.muted}
              />
              <Text className="text-sm text-muted flex-1">
                {isConnected
                  ? `Connected to ${deviceName}`
                  : isReconnecting
                  ? "Reconnecting..."
                  : "Tap to select iPhone"}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={18} color={colors.muted} />
          </View>
        </Pressable>
      </View>

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
