import { View, Text, Pressable, Platform } from "react-native";
import { IconSymbol } from "./ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { ANCSNotification } from "@/lib/bluetooth-service";
import * as Haptics from "expo-haptics";

interface NotificationCardProps {
  notification: ANCSNotification;
  onPress: () => void;
  onDelete: () => void;
}

export function NotificationCard({ notification, onPress, onDelete }: NotificationCardProps) {
  const colors = useColors();

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getCategoryIcon = (categoryId: number): string => {
    // Map category IDs to icon names
    switch (categoryId) {
      case 1: // Incoming Call
      case 2: // Missed Call
        return "phone.fill";
      case 3: // Voicemail
        return "voicemail";
      case 4: // Social
        return "person.2.fill";
      case 5: // Schedule
        return "calendar";
      case 6: // Email
        return "envelope.fill";
      case 7: // News
        return "newspaper.fill";
      case 8: // Health and Fitness
        return "heart.fill";
      case 9: // Business and Finance
        return "briefcase.fill";
      case 10: // Location
        return "location.fill";
      case 11: // Entertainment
        return "play.circle.fill";
      default:
        return "bell.fill";
    }
  };

  const handlePress = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const handleDelete = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDelete();
  };

  return (
    <View className="mb-3 mx-4">
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          {
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View className="bg-surface rounded-2xl p-4 border border-border">
          <View className="flex-row items-start gap-3">
            {/* Icon */}
            <View className={`w-10 h-10 rounded-full items-center justify-center ${notification.isImportant ? "bg-error" : "bg-primary"}`}>
              <IconSymbol name={getCategoryIcon(notification.categoryId) as any} size={20} color="white" />
            </View>

            {/* Content */}
            <View className="flex-1">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-base font-semibold text-foreground">{notification.categoryName}</Text>
                <Text className="text-xs text-muted">{formatTime(notification.timestamp)}</Text>
              </View>

              <Text className="text-sm text-muted mb-2">
                {notification.categoryCount > 1
                  ? `${notification.categoryCount} notifications`
                  : "New notification"}
              </Text>

              {notification.isImportant && (
                <View className="flex-row items-center gap-1 mt-1">
                  <IconSymbol name="exclamationmark.circle.fill" size={14} color={colors.error} />
                  <Text className="text-xs text-error font-medium">Important</Text>
                </View>
              )}
            </View>

            {/* Delete button */}
            <Pressable
              onPress={handleDelete}
              style={({ pressed }) => [
                {
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <View className="w-8 h-8 items-center justify-center">
                <IconSymbol name="xmark.circle.fill" size={22} color={colors.muted} />
              </View>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
