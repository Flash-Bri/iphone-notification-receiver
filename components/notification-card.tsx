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

// App-specific colors for visual distinction
const APP_COLORS: Record<string, string> = {
  "Messages": "#34C759",
  "Mail": "#007AFF",
  "Phone": "#34C759",
  "FaceTime": "#34C759",
  "Messenger": "#0084FF",
  "Facebook": "#1877F2",
  "Twitter": "#1DA1F2",
  "Instagram": "#E4405F",
  "WhatsApp": "#25D366",
  "Gmail": "#EA4335",
  "Calendar": "#FF3B30",
  "Reminders": "#FF9500",
  "Spotify": "#1DB954",
  "Music": "#FC3C44",
};

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

  const getCategoryIcon = (categoryId: number, appName?: string): string => {
    // First check for app-specific icons
    if (appName) {
      switch (appName) {
        case "Messages":
          return "message.fill";
        case "Mail":
        case "Gmail":
          return "envelope.fill";
        case "Phone":
          return "phone.fill";
        case "FaceTime":
          return "video.fill";
        case "Messenger":
        case "WhatsApp":
          return "message.fill";
        case "Facebook":
        case "Twitter":
        case "Instagram":
          return "person.2.fill";
        case "Calendar":
          return "calendar";
        case "Reminders":
          return "checklist";
        case "Spotify":
        case "Music":
          return "music.note";
      }
    }

    // Fall back to category-based icons
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

  const getAppColor = (): string => {
    if (notification.categoryName && APP_COLORS[notification.categoryName]) {
      return APP_COLORS[notification.categoryName];
    }
    return notification.isImportant ? colors.error : colors.primary;
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

  // Determine what to display
  const hasFullDetails = notification.title || notification.message;
  const displayTitle = notification.title || notification.categoryName;
  const displaySubtitle = notification.subtitle;
  const displayMessage = notification.message || (
    notification.categoryCount > 1
      ? `${notification.categoryCount} notifications`
      : "New notification"
  );

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
            <View
              style={{ backgroundColor: getAppColor() }}
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <IconSymbol
                name={getCategoryIcon(notification.categoryId, notification.categoryName) as any}
                size={20}
                color="white"
              />
            </View>

            {/* Content */}
            <View className="flex-1">
              {/* Header row with app name and time */}
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-medium text-primary uppercase tracking-wide">
                  {notification.categoryName}
                </Text>
                <Text className="text-xs text-muted">{formatTime(notification.timestamp)}</Text>
              </View>

              {/* Title */}
              {displayTitle && (
                <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {displayTitle}
                </Text>
              )}

              {/* Subtitle */}
              {displaySubtitle && (
                <Text className="text-sm text-foreground mt-0.5" numberOfLines={1}>
                  {displaySubtitle}
                </Text>
              )}

              {/* Message */}
              <Text
                className="text-sm text-muted mt-1"
                numberOfLines={hasFullDetails ? 3 : 1}
              >
                {displayMessage}
              </Text>

              {/* Important badge */}
              {notification.isImportant && (
                <View className="flex-row items-center gap-1 mt-2">
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
