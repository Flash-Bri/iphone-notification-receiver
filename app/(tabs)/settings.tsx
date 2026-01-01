import { View, Text, ScrollView, Pressable, Platform, Switch } from "react-native";
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

const SETTINGS_KEY = "@settings";

interface AppSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  vibrationEnabled: true,
};

export default function SettingsScreen() {
  const colors = useColors();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await AsyncStorage.getItem(SETTINGS_KEY);
      if (data) {
        setSettings(JSON.parse(data));
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

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Settings</Text>
        </View>

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

        {/* About Section */}
        <View className="px-4 pt-8">
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
              <Text className="text-xs text-muted">Version {Constants.expoConfig?.version || "1.5.0"}</Text>
            </View>
          </View>
        </View>

        {/* Setup Instructions */}
        <View className="px-4 pt-8 pb-6">
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
                  Notifications will appear in this app automatically
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
