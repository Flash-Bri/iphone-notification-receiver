import { useState, useEffect, useCallback } from "react";
import { FlatList, Text, View, Pressable, Platform, Alert, RefreshControl } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { NotificationCard } from "@/components/notification-card";
import { DeviceSelectionModal } from "@/components/device-selection-modal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getBluetoothService, ANCSNotification } from "@/lib/bluetooth-service";
import { getNotificationStorage } from "@/lib/notification-storage";
import { PermissionsAndroid } from "react-native";
import { Device } from "react-native-ble-plx";

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

  const bluetoothService = getBluetoothService();
  const notificationStorage = getNotificationStorage();

  useEffect(() => {
    initializeBluetooth();

    return () => {
      bluetoothService.destroy();
    };
  }, []);

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

      // Set up notification listener
      bluetoothService.onNotification(async (notification) => {
        console.log("New notification received:", notification);
        await notificationStorage.saveNotification(notification);
        setNotifications((prev) => [notification, ...prev]);

        // Haptic feedback for new notification
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      });

      // Set up connection listener
      bluetoothService.onConnectionChange((connected, name) => {
        setIsConnected(connected);
        if (name) setDeviceName(name);
      });

      // Load available devices
      await loadAvailableDevices();
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
    } catch (error) {
      console.error("Connection error:", error);
      Alert.alert("Connection Failed", `Could not connect to ${device.name}. Please try again.`);
      setSelectedDeviceId("");
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
    Alert.alert(
      notification.categoryName,
      `Notification UID: ${notification.notificationUid}\nCategory Count: ${notification.categoryCount}\nImportant: ${notification.isImportant ? "Yes" : "No"}`,
      [{ text: "OK" }]
    );
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
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
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-muted"}`}
              />
              <IconSymbol name="bluetooth" size={18} color={isConnected ? colors.success : colors.muted} />
              <Text className="text-sm text-muted flex-1">
                {isConnected ? `Connected to ${deviceName}` : "Tap to select iPhone"}
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
    </ScreenContainer>
  );
}
