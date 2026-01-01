import { View, Text, ScrollView, Pressable, Platform, Switch, Alert } from "react-native";
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  isNativeServiceAvailable,
  startBackgroundService,
  stopBackgroundService,
  getServiceStatus,
  checkPermissions,
  requestBatteryOptimization,
  openAppSettings,
  formatLastEventTime,
  getStatusMessage,
  ServiceStatus,
  PermissionStatus,
} from "@/lib/native-service";

const SETTINGS_KEY = "@settings";
const DEVICE_KEY = "@last_device";

interface AppSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  backgroundServiceEnabled: boolean;
  autoStartEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  vibrationEnabled: true,
  backgroundServiceEnabled: false,
  autoStartEnabled: false,
};

export default function SettingsScreen() {
  const colors = useColors();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    refreshStatus();
    
    // Poll status every 5 seconds when screen is visible
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(data) });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const refreshStatus = useCallback(async () => {
    if (!isNativeServiceAvailable()) return;
    
    try {
      const [status, perms] = await Promise.all([
        getServiceStatus(),
        checkPermissions(),
      ]);
      setServiceStatus(status);
      setPermissions(perms);
    } catch (error) {
      console.error("Error refreshing status:", error);
    }
  }, []);

  const toggleSound = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    saveSettings({ ...settings, soundEnabled: !settings.soundEnabled });
  };

  const toggleVibration = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    saveSettings({ ...settings, vibrationEnabled: !settings.vibrationEnabled });
  };

  const toggleBackgroundService = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    setIsLoading(true);
    
    try {
      if (settings.backgroundServiceEnabled) {
        // Stop service
        await stopBackgroundService();
        saveSettings({ ...settings, backgroundServiceEnabled: false });
      } else {
        // Get saved device
        const deviceData = await AsyncStorage.getItem(DEVICE_KEY);
        if (!deviceData) {
          Alert.alert(
            "No Device Selected",
            "Please connect to your iPhone first from the Home screen before enabling background service.",
            [{ text: "OK" }]
          );
          setIsLoading(false);
          return;
        }
        
        const device = JSON.parse(deviceData);
        
        // Start service
        await startBackgroundService(device.id, device.name);
        saveSettings({ ...settings, backgroundServiceEnabled: true });
      }
      
      // Refresh status
      await refreshStatus();
    } catch (error) {
      console.error("Error toggling background service:", error);
      Alert.alert(
        "Error",
        `Failed to ${settings.backgroundServiceEnabled ? "stop" : "start"} background service: ${error}`,
        [{ text: "OK" }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAutoStart = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    saveSettings({ ...settings, autoStartEnabled: !settings.autoStartEnabled });
  };

  const handleRequestBatteryOptimization = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    try {
      await requestBatteryOptimization();
    } catch (error) {
      console.error("Error requesting battery optimization:", error);
    }
  };

  const handleOpenAppSettings = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    try {
      await openAppSettings();
    } catch (error) {
      console.error("Error opening app settings:", error);
    }
  };

  const isAndroid = Platform.OS === "android";
  const nativeAvailable = isNativeServiceAvailable();

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Settings</Text>
        </View>

        {/* Background Service Section (Android only) */}
        {isAndroid && (
          <View className="px-4 pt-6">
            <Text className="text-sm font-semibold text-muted uppercase mb-3">Background Service</Text>

            <View className="bg-surface rounded-2xl overflow-hidden border border-border">
              {/* Run in Background Toggle */}
              <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
                <View className="flex-row items-center gap-3 flex-1">
                  <IconSymbol name="play.fill" size={22} color={settings.backgroundServiceEnabled ? colors.success : colors.muted} />
                  <View className="flex-1">
                    <Text className="text-base font-medium text-foreground">Run in Background</Text>
                    <Text className="text-sm text-muted mt-0.5">
                      {nativeAvailable 
                        ? "Keep receiving notifications when app is closed"
                        : "Native service not available"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={settings.backgroundServiceEnabled}
                  onValueChange={toggleBackgroundService}
                  trackColor={{ false: colors.border, true: colors.success }}
                  thumbColor="white"
                  disabled={!nativeAvailable || isLoading}
                />
              </View>

              {/* Service Status */}
              {serviceStatus && (
                <View className="px-4 py-3 border-b border-border bg-background">
                  <View className="flex-row items-center gap-2 mb-1">
                    <View 
                      className="w-2 h-2 rounded-full"
                      style={{ 
                        backgroundColor: serviceStatus.isConnected 
                          ? colors.success 
                          : serviceStatus.isRunning 
                            ? colors.warning 
                            : colors.muted 
                      }}
                    />
                    <Text className="text-sm font-medium text-foreground">
                      {getStatusMessage(serviceStatus)}
                    </Text>
                  </View>
                  {serviceStatus.lastEventTime > 0 && (
                    <Text className="text-xs text-muted">
                      Last activity: {formatLastEventTime(serviceStatus.lastEventTime)}
                    </Text>
                  )}
                  {serviceStatus.lastError && (
                    <Text className="text-xs text-error mt-1">
                      {serviceStatus.lastError}
                    </Text>
                  )}
                </View>
              )}

              {/* Auto-start Toggle */}
              <View className="flex-row items-center justify-between px-4 py-4">
                <View className="flex-row items-center gap-3 flex-1">
                  <IconSymbol name="bolt.fill" size={22} color={colors.primary} />
                  <View className="flex-1">
                    <Text className="text-base font-medium text-foreground">Auto-start on Boot</Text>
                    <Text className="text-sm text-muted mt-0.5">Start service when device restarts</Text>
                  </View>
                </View>
                <Switch
                  value={settings.autoStartEnabled}
                  onValueChange={toggleAutoStart}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="white"
                  disabled={!nativeAvailable}
                />
              </View>
            </View>

            {/* Battery Optimization */}
            <View className="bg-surface rounded-2xl overflow-hidden border border-border mt-4">
              <Pressable
                onPress={handleRequestBatteryOptimization}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className="flex-row items-center justify-between px-4 py-4"
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <IconSymbol name="battery.100" size={22} color={permissions?.batteryOptimizationIgnored ? colors.success : colors.warning} />
                  <View className="flex-1">
                    <Text className="text-base font-medium text-foreground">Battery Optimization</Text>
                    <Text className="text-sm text-muted mt-0.5">
                      {permissions?.batteryOptimizationIgnored 
                        ? "Disabled (recommended)" 
                        : "Tap to disable for reliable background operation"}
                    </Text>
                  </View>
                </View>
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </Pressable>
            </View>

            {/* Air3 Guidance */}
            <View className="bg-primary/10 rounded-2xl px-4 py-4 mt-4">
              <View className="flex-row items-start gap-3">
                <IconSymbol name="info.circle.fill" size={20} color={colors.primary} />
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground mb-1">INMO Air3 Users</Text>
                  <Text className="text-xs text-muted leading-relaxed">
                    For reliable background operation on Air3, also go to Settings → Apps → iPhone Notifications → Battery and select "Unrestricted". This prevents the system from stopping the service.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Notification Preferences */}
        <View className="px-4 pt-6">
          <Text className="text-sm font-semibold text-muted uppercase mb-3">Notification Preferences</Text>

          <View className="bg-surface rounded-2xl overflow-hidden border border-border">
            {/* Sound Toggle */}
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
              <View className="flex-row items-center gap-3 flex-1">
                <IconSymbol name="bell.fill" size={22} color={colors.primary} />
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground">Sound</Text>
                  <Text className="text-sm text-muted mt-0.5">Play sound for new notifications</Text>
                </View>
              </View>
              <Switch
                value={settings.soundEnabled}
                onValueChange={toggleSound}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="white"
              />
            </View>

            {/* Vibration Toggle */}
            <View className="flex-row items-center justify-between px-4 py-4">
              <View className="flex-row items-center gap-3 flex-1">
                <IconSymbol name="phone.fill" size={22} color={colors.primary} />
                <View className="flex-1">
                  <Text className="text-base font-medium text-foreground">Vibration</Text>
                  <Text className="text-sm text-muted mt-0.5">Vibrate for new notifications</Text>
                </View>
              </View>
              <Switch
                value={settings.vibrationEnabled}
                onValueChange={toggleVibration}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="white"
              />
            </View>
          </View>
        </View>

        {/* Permissions Section (Android only) */}
        {isAndroid && permissions && (
          <View className="px-4 pt-6">
            <Text className="text-sm font-semibold text-muted uppercase mb-3">Permissions</Text>

            <View className="bg-surface rounded-2xl overflow-hidden border border-border">
              <Pressable
                onPress={handleOpenAppSettings}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                className="flex-row items-center justify-between px-4 py-4"
              >
                <View className="flex-row items-center gap-3 flex-1">
                  <IconSymbol 
                    name="checkmark.circle.fill" 
                    size={22} 
                    color={permissions.allGranted ? colors.success : colors.warning} 
                  />
                  <View className="flex-1">
                    <Text className="text-base font-medium text-foreground">App Permissions</Text>
                    <Text className="text-sm text-muted mt-0.5">
                      {permissions.allGranted 
                        ? "All permissions granted" 
                        : "Some permissions missing - tap to fix"}
                    </Text>
                  </View>
                </View>
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        )}

        {/* About Section */}
        <View className="px-4 pt-6">
          <Text className="text-sm font-semibold text-muted uppercase mb-3">About</Text>

          <View className="bg-surface rounded-2xl px-4 py-4 border border-border">
            <View className="flex-row items-center gap-3 mb-3">
              <IconSymbol name="bluetooth" size={22} color={colors.primary} />
              <Text className="text-base font-medium text-foreground">iPhone Notifications</Text>
            </View>
            <Text className="text-sm text-muted leading-relaxed">
              Receives notifications from your iPhone via Bluetooth using the Apple Notification Center Service
              (ANCS) protocol.
            </Text>
            <View className="mt-4 pt-4 border-t border-border">
              <Text className="text-xs text-muted">Version {Constants.expoConfig?.version || "1.6.0"}</Text>
            </View>
          </View>
        </View>

        {/* Setup Instructions */}
        <View className="px-4 pt-6 pb-6">
          <Text className="text-sm font-semibold text-muted uppercase mb-3">Setup Instructions</Text>

          <View className="bg-surface rounded-2xl px-4 py-4 border border-border">
            <View className="gap-3">
              <View className="flex-row gap-3">
                <Text className="text-base font-semibold text-primary">1.</Text>
                <Text className="text-sm text-foreground flex-1 leading-relaxed">
                  Open Bluetooth settings on your iPhone
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Text className="text-base font-semibold text-primary">2.</Text>
                <Text className="text-sm text-foreground flex-1 leading-relaxed">
                  Pair your Android tablet with your iPhone
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Text className="text-base font-semibold text-primary">3.</Text>
                <Text className="text-sm text-foreground flex-1 leading-relaxed">
                  Tap the (i) icon next to your tablet's name
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Text className="text-base font-semibold text-primary">4.</Text>
                <Text className="text-sm text-foreground flex-1 leading-relaxed">
                  Enable "Share System Notifications"
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Text className="text-base font-semibold text-primary">5.</Text>
                <Text className="text-sm text-foreground flex-1 leading-relaxed">
                  Connect to your iPhone from the Home screen
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Text className="text-base font-semibold text-primary">6.</Text>
                <Text className="text-sm text-foreground flex-1 leading-relaxed">
                  Enable "Run in Background" above for notifications when app is closed
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
