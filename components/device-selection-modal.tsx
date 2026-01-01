import { View, Text, Pressable, Modal, FlatList, ActivityIndicator } from "react-native";
import { Device } from "react-native-ble-plx";
import { IconSymbol } from "./ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export interface DeviceSelectionModalProps {
  visible: boolean;
  devices: Device[];
  loading: boolean;
  selectedDeviceId?: string;
  onSelectDevice: (device: Device) => void;
  onClose: () => void;
  onRefresh?: () => void;
}

export function DeviceSelectionModal({
  visible,
  devices,
  loading,
  selectedDeviceId,
  onSelectDevice,
  onClose,
  onRefresh,
}: DeviceSelectionModalProps) {
  const colors = useColors();

  const handleSelectDevice = (device: Device) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onSelectDevice(device);
  };

  const handleRefresh = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onRefresh?.();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View className="flex-1 bg-black/50">
        <View className="flex-1 bg-background rounded-t-3xl mt-auto" style={{ maxHeight: "80%" }}>
          {/* Header */}
          <View className="px-4 pt-4 pb-3 border-b border-border flex-row items-center justify-between">
            <Text className="text-xl font-bold text-foreground">Select iPhone</Text>
            <View className="flex-row items-center gap-3">
              {/* Refresh Button */}
              {onRefresh && !loading && (
                <Pressable
                  onPress={handleRefresh}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                >
                  <IconSymbol name="arrow.clockwise" size={24} color={colors.primary} />
                </Pressable>
              )}
              {/* Close Button */}
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              >
                <IconSymbol name="xmark.circle.fill" size={28} color={colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Device List */}
          {loading ? (
            <View className="flex-1 items-center justify-center py-12">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="text-muted mt-4">Scanning for devices...</Text>
              <Text className="text-xs text-muted mt-1">This may take up to 5 seconds</Text>
            </View>
          ) : devices.length === 0 ? (
            <View className="flex-1 items-center justify-center px-4 py-12">
              <IconSymbol name="bluetooth" size={48} color={colors.muted} />
              <Text className="text-lg font-semibold text-foreground mt-4 text-center">
                No Devices Found
              </Text>
              <Text className="text-sm text-muted mt-2 text-center leading-relaxed">
                Make sure your iPhone is paired with your tablet via Bluetooth and is nearby.
              </Text>
              {onRefresh && (
                <Pressable
                  onPress={handleRefresh}
                  style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
                  className="mt-4"
                >
                  <View className="flex-row items-center gap-2 bg-primary/10 px-4 py-2 rounded-full">
                    <IconSymbol name="arrow.clockwise" size={18} color={colors.primary} />
                    <Text className="text-primary font-medium">Scan Again</Text>
                  </View>
                </Pressable>
              )}
            </View>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectDevice(item)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                >
                  <View
                    className={`mx-4 my-2 p-4 rounded-2xl border ${
                      selectedDeviceId === item.id
                        ? "bg-primary/10 border-primary"
                        : "bg-surface border-border"
                    }`}
                  >
                    <View className="flex-row items-center gap-3">
                      <View
                        className={`w-12 h-12 rounded-full items-center justify-center ${
                          selectedDeviceId === item.id ? "bg-primary" : "bg-muted/20"
                        }`}
                      >
                        <IconSymbol
                          name="bluetooth"
                          size={24}
                          color={selectedDeviceId === item.id ? "white" : colors.muted}
                        />
                      </View>

                      <View className="flex-1">
                        <Text className="text-base font-semibold text-foreground">
                          {item.name || "Unknown Device"}
                        </Text>
                        <Text className="text-xs text-muted mt-1" numberOfLines={1}>
                          {item.id}
                        </Text>
                      </View>

                      {selectedDeviceId === item.id && (
                        <IconSymbol name="checkmark.circle.fill" size={24} color={colors.primary} />
                      )}
                    </View>
                  </View>
                </Pressable>
              )}
              contentContainerStyle={{ paddingVertical: 12 }}
              ListHeaderComponent={
                <Text className="text-xs text-muted px-4 mb-2">
                  Found {devices.length} device{devices.length !== 1 ? "s" : ""}. Tap to connect.
                </Text>
              }
            />
          )}

          {/* Footer */}
          <View className="px-4 py-4 border-t border-border gap-3">
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <View className="bg-primary px-6 py-3 rounded-full items-center">
                <Text className="text-background font-semibold">Done</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
