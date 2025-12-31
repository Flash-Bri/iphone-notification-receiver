import { View, Text, Modal, Pressable, ScrollView, Platform } from "react-native";
import { IconSymbol } from "./ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { ANCSNotification } from "@/lib/bluetooth-service";
import * as Haptics from "expo-haptics";

interface NotificationDetailModalProps {
  notification: ANCSNotification | null;
  visible: boolean;
  onClose: () => void;
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

export function NotificationDetailModal({
  notification,
  visible,
  onClose,
  onDelete,
}: NotificationDetailModalProps) {
  const colors = useColors();

  if (!notification) return null;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getCategoryIcon = (categoryId: number, appName?: string): string => {
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

    switch (categoryId) {
      case 1:
      case 2:
        return "phone.fill";
      case 3:
        return "voicemail";
      case 4:
        return "person.2.fill";
      case 5:
        return "calendar";
      case 6:
        return "envelope.fill";
      case 7:
        return "newspaper.fill";
      case 8:
        return "heart.fill";
      case 9:
        return "briefcase.fill";
      case 10:
        return "location.fill";
      case 11:
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

  const handleClose = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
  };

  const handleDelete = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDelete();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-base text-primary font-medium">Close</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-foreground">Notification</Text>
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-base text-error font-medium">Delete</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* App Header */}
          <View className="items-center mb-6">
            <View
              style={{ backgroundColor: getAppColor() }}
              className="w-16 h-16 rounded-2xl items-center justify-center mb-3"
            >
              <IconSymbol
                name={getCategoryIcon(notification.categoryId, notification.categoryName) as any}
                size={32}
                color="white"
              />
            </View>
            <Text className="text-lg font-semibold text-foreground">
              {notification.categoryName}
            </Text>
            <Text className="text-sm text-muted mt-1">
              {formatTime(notification.timestamp)}
            </Text>
          </View>

          {/* Notification Content */}
          <View className="bg-surface rounded-2xl p-4 border border-border mb-4">
            {/* Title */}
            {notification.title && (
              <View className="mb-3">
                <Text className="text-xs text-muted uppercase tracking-wide mb-1">Title</Text>
                <Text className="text-base font-semibold text-foreground">
                  {notification.title}
                </Text>
              </View>
            )}

            {/* Subtitle */}
            {notification.subtitle && (
              <View className="mb-3">
                <Text className="text-xs text-muted uppercase tracking-wide mb-1">Subtitle</Text>
                <Text className="text-base text-foreground">{notification.subtitle}</Text>
              </View>
            )}

            {/* Message */}
            {notification.message && (
              <View className="mb-3">
                <Text className="text-xs text-muted uppercase tracking-wide mb-1">Message</Text>
                <Text className="text-base text-foreground leading-relaxed">
                  {notification.message}
                </Text>
              </View>
            )}

            {/* No details available */}
            {!notification.title && !notification.subtitle && !notification.message && (
              <View className="py-4 items-center">
                <IconSymbol name="info.circle" size={24} color={colors.muted} />
                <Text className="text-sm text-muted mt-2 text-center">
                  Full notification details not available
                </Text>
              </View>
            )}
          </View>

          {/* Metadata */}
          <View className="bg-surface rounded-2xl p-4 border border-border">
            <Text className="text-xs text-muted uppercase tracking-wide mb-3">Details</Text>

            <View className="flex-row justify-between py-2 border-b border-border">
              <Text className="text-sm text-muted">Category</Text>
              <Text className="text-sm text-foreground">{notification.categoryName}</Text>
            </View>

            {notification.appIdentifier && (
              <View className="flex-row justify-between py-2 border-b border-border">
                <Text className="text-sm text-muted">App ID</Text>
                <Text className="text-sm text-foreground" numberOfLines={1}>
                  {notification.appIdentifier}
                </Text>
              </View>
            )}

            <View className="flex-row justify-between py-2 border-b border-border">
              <Text className="text-sm text-muted">Important</Text>
              <Text className="text-sm text-foreground">
                {notification.isImportant ? "Yes" : "No"}
              </Text>
            </View>

            <View className="flex-row justify-between py-2">
              <Text className="text-sm text-muted">Notification ID</Text>
              <Text className="text-sm text-foreground">{notification.notificationUid}</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
