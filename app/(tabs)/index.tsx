import { useState, useEffect, useCallback } from "react";
import { FlatList, Text, View, Pressable, Platform, Alert, RefreshControl } from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { NotificationCard } from "@/components/notification-card";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getBluetoothService, ANCSNotification } from "@/lib/bluetooth-service";
import { getNotificationStorage } from "@/lib/notification-storage";
import { PermissionsAndroid } from "react-native";

export default function HomeScreen() {
  const colors = useColors();
  const [notifications, setNotifications] = useState<ANCSNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);

  const bluetoothService = getBluetoothService();
  const notificationStorage = getNotificationStorage();

  useEffect(() => {
    initializeBluetooth();

    return () => {
      // Cleanup on unmount
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

      // Start scanning for ANCS devices
      await bluetoothService.scanForDevices();
    } catch (error) {
      console.error("Bluetooth initialization error:", error);
      Alert.alert("Error", "Failed to initialize Bluetooth. Please check your settings.");
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
        <View className="flex-row items-center gap-2">
          <View
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-muted"}`}
          />
          <IconSymbol name="bluetooth" size={18} color={isConnected ? colors.success : colors.muted} />
          <Text className="text-sm text-muted">
            {isConnected ? `Connected to ${deviceName}` : "Searching for iPhone..."}
          </Text>
        </View>
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
              : "Make sure your iPhone is paired and 'Share System Notifications' is enabled"}
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
    </ScreenContainer>
  );
}
