import { useState, useEffect, useCallback, useRef } from "react";
import { FlatList, Text, View, Pressable, Platform, Alert, RefreshControl, AppState, AppStateStatus } from "react-native";
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
  const [isInitialized, setIsInitialized] = useState(false);

  const notificationStorage = getNotificationStorage();
  const appState = useRef(AppState.currentState);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReconnectingRef = useRef(false);
  const savedDeviceNameRef = useRef<string>("");

  useEffect(() => {
    initializeApp();

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Update connection status display
  useEffect(() => {
    const checkConnection = setInterval(() => {
      const bluetoothService = getBluetoothService();
      const connected = bluetoothService.isConnected();
      const name = bluetoothService.getConnectedDeviceName();
      
      if (connected !== isConnected) {
        setIsConnected(connected);
      }
      if (name && name !== deviceName) {
        setDeviceName(name);
      }
    }, 2000);

    return () => clearInterval(checkConnection);
  }, [isConnected, deviceName]);

  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    const previousState = appState.current;
    appState.current = nextAppState;

    console.log(`[App] State: ${previousState} -> ${nextAppState}`);

    if (previousState.match(/inactive|background/) && nextAppState === "active") {
      console.log("[App] Foreground - checking connection");
      
      setTimeout(async () => {
        const bluetoothService = getBluetoothService();
        
        // Update UI state
        setIsConnected(bluetoothService.isConnected());
        const name = bluetoothService.getConnectedDeviceName();
        if (name) setDeviceName(name);
        
        if (!bluetoothService.isConnected() && !bluetoothService.isConnecting() && !isReconnectingRef.current) {
          console.log("[App] Not connected, reconnecting...");
          await attemptAutoReconnect();
        }
      }, 300);
    }
  }, []);

  const attemptAutoReconnect = async () => {
    if (isReconnectingRef.current) {
      console.log("[Reconnect] Already in progress");
      return;
    }

    const bluetoothService = getBluetoothService();
    
    if (bluetoothService.isConnected() || bluetoothService.isConnecting()) {
      console.log("[Reconnect] Already connected/connecting");
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

    if (lastDeviceName) {
      savedDeviceNameRef.current = lastDeviceName;
      setDeviceName(lastDeviceName);
    }

    console.log(`[Reconnect] Attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`);

    try {
      await bluetoothService.initialize();
      
      const devices = await bluetoothService.discoverDevices();
      const lastDevice = devices.find((d) => d.id === lastDeviceId);

      if (lastDevice) {
        console.log("[Reconnect] Found device, connecting...");
        await bluetoothService.connectToDevice(lastDevice);
        setSelectedDeviceId(lastDeviceId);
        setIsConnected(true);
        if (lastDeviceName) setDeviceName(lastDeviceName);
        reconnectAttempts.current = 0;
        setShowConnectionPopup(false);
      } else {
        console.log("[Reconnect] Device not found");
        if (reconnectAttempts.current < maxReconnectAttempts) {
          scheduleReconnect(5000);
        } else {
          setShowConnectionPopup(true);
        }
      }
    } catch (error: any) {
      console.error("[Reconnect] Failed:", error?.message);
      
      if (reconnectAttempts.current < maxReconnectAttempts) {
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
    console.log(`[Reconnect] Retry in ${delay}ms`);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      attemptAutoReconnect();
    }, delay);
  };

  const initializeApp = async () => {
    try {
      // Initialize notification service FIRST (before Bluetooth)
      console.log("[Init] Initializing notification service...");
      const notifPermission = await NotificationService.initialize();
      console.log("[Init] Notification permission:", notifPermission);

      // Request Android Bluetooth permissions
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
            "Bluetooth and location permissions are required."
          );
        }
      }

      // Load saved device name for display
      const savedName = await AsyncStorage.getItem(LAST_DEVICE_NAME_KEY);
      if (savedName) {
        savedDeviceNameRef.current = savedName;
      }

      const bluetoothService = getBluetoothService();

      // Initialize Bluetooth
      if (Platform.OS !== "web") {
        await bluetoothService.initialize();
      }

      // Load stored notifications
      const stored = await notificationStorage.getAllNotifications();
      setNotifications(stored);

      // Set up notification listener - THIS IS CRITICAL
      bluetoothService.onNotification(async (notification) => {
        console.log(`[Notification] Received: ${notification.categoryName} - ${notification.title}`);
        
        // Save to storage
        await notificationStorage.saveNotification(notification);
        
        // Update UI
        setNotifications((prev) => [notification, ...prev]);

        // IMMEDIATELY send system notification
        const sent = await NotificationService.sendNotification({
          title: notification.title || notification.categoryName || "iPhone Notification",
          body: notification.message || notification.subtitle || `New ${notification.categoryName} notification`,
          subtitle: notification.subtitle,
          categoryName: notification.categoryName,
          isImportant: notification.isImportant,
          appIdentifier: notification.appIdentifier,
        });
        
        console.log(`[Notification] System notification sent: ${sent}`);

        // Haptic feedback
        if (Platform.OS !== "web") {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {}
        }
      });

      // Set up connection listener
      bluetoothService.onConnectionChange(async (connected, name) => {
        console.log(`[Connection] Changed: ${connected}, name: ${name}`);
        setIsConnected(connected);
        if (name) {
          setDeviceName(name);
        } else if (!connected && savedDeviceNameRef.current) {
          // Keep showing saved device name even when disconnected
          setDeviceName(savedDeviceNameRef.current);
        }

        if (!connected && !isReconnectingRef.current) {
          console.log("[Connection] Lost, scheduling reconnect...");
          scheduleReconnect(3000);
        }
      });

      setIsInitialized(true);

      // Auto-reconnect
      if (Platform.OS !== "web") {
        await attemptAutoReconnect();
      }
    } catch (error: any) {
      console.error("[Init] Error:", error?.message);
      setIsInitialized(true);
      
      if (Platform.OS !== "web") {
        Alert.alert("Error", "Could not initialize. Please check Bluetooth settings.");
      }
    }
  };

  const handleSelectDevice = async (device: Device) => {
    const bluetoothService = getBluetoothService();
    
    if (bluetoothService.isConnecting()) {
      console.log("[Select] Already connecting");
      return;
    }

    try {
      setSelectedDeviceId(device.id);
      setShowDeviceModal(false);
      setShowConnectionPopup(false);

      await bluetoothService.connectToDevice(device);

      // Save for auto-reconnection
      await AsyncStorage.setItem(LAST_DEVICE_KEY, device.id);
      if (device.name) {
        await AsyncStorage.setItem(LAST_DEVICE_NAME_KEY, device.name);
        savedDeviceNameRef.current = device.name;
        setDeviceName(device.name);
      }
      bluetoothService.setLastConnectedDeviceId(device.id);
      reconnectAttempts.current = 0;
      setIsConnected(true);
    } catch (error: any) {
      console.error("[Select] Error:", error?.message);
      Alert.alert("Connection Failed", `Could not connect to ${device.name || "device"}.`);
      setSelectedDeviceId("");
      setIsConnected(false);
    }
  };

  const handleOpenDeviceModal = async () => {
    const bluetoothService = getBluetoothService();
    
    setShowDeviceModal(true);
    setShowConnectionPopup(false);
    setLoadingDevices(true);
    
    try {
      if (Platform.OS !== "web") {
        await bluetoothService.initialize();
      }
      
      const scannedDevices = await bluetoothService.discoverDevices();
      setAvailableDevices(scannedDevices);
    } catch (error: any) {
      console.error("[Modal] Error:", error?.message);
      Alert.alert("Error", "Failed to discover devices.");
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
    Alert.alert("Clear All", "Clear all notifications?", [
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
    if (isConnected && deviceName) {
      return deviceName;
    }
    if (isConnected) {
      return "Connected";
    }
    if (isReconnecting) {
      return `Reconnecting${deviceName ? ` to ${deviceName}` : ""}...`;
    }
    if (deviceName || savedDeviceNameRef.current) {
      return `Tap to connect to ${deviceName || savedDeviceNameRef.current}`;
    }
    return "Tap to select iPhone";
  };

  const getConnectionStatusColor = () => {
    if (isConnected) return "bg-success";
    if (isReconnecting) return "bg-warning";
    return "bg-muted";
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
            <View className={`w-3 h-3 rounded-full ${getConnectionStatusColor()}`} />
            <Text
              className={`flex-1 text-sm ${isConnected ? "text-success font-medium" : "text-muted"}`}
              numberOfLines={1}
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
            {isConnected 
              ? "Notifications from your iPhone will appear here"
              : "Connect to your iPhone to start receiving notifications"}
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
