import { View, Text, Pressable, Modal, FlatList, ActivityIndicator } from "react-native";
import { Device } from "react-native-ble-plx";
import { IconSymbol } from "./ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

interface DeviceSelectionModalProps {
  visible: boolean;
  devices: Device[];
  loading: boolean;
  selectedDeviceId?: string;
  onSelectDevice: (device: Device) => void;
  onClose: () => void;
}

export function DeviceSelectionModal({
  visible,
  devices,
  loading,
  selectedDeviceId,
  onSelectDevice,
  onClose,
}: DeviceSelectionModalProps) {
  const colors = useColors();

  const handleSelectDevice = (device: Device) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onSelectDevice(device);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View className="flex-1 bg-black/50">
        <View className="flex-1 bg-background rounded-t-3xl mt-auto">
          {/* Header */}
          <View className="px-4 pt-4 pb-3 border-b border-border flex-row items-center justify-between">
            <Text className="text-xl font-bold text-foreground">Select iPhone</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
            >
              <IconSymbol name="xmark.circle.fill" size={28} color={colors.muted} />
            </Pressable>
          </View>

          {/* Device List */}
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={colors.primary} />
              <Text className="text-muted mt-4">Searching for devices...</Text>
            </View>
          ) : devices.length === 0 ? (
            <View className="flex-1 items-center justify-center px-4">
              <IconSymbol name="bluetooth" size={48} color={colors.muted} />
              <Text className="text-lg font-semibold text-foreground mt-4 text-center">
                No Devices Found
              </Text>
              <Text className="text-sm text-muted mt-2 text-center leading-relaxed">
                Make sure your iPhone is paired with your tablet via Bluetooth and is nearby.
              </Text>
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
                        <Text className="text-sm text-muted mt-1">{item.id}</Text>
                      </View>

                      {selectedDeviceId === item.id && (
                        <IconSymbol name="checkmark.circle.fill" size={24} color={colors.primary} />
                      )}
                    </View>
                  </View>
                </Pressable>
              )}
              contentContainerStyle={{ paddingVertical: 12 }}
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
