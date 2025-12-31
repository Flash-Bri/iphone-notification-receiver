import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface LocalNotification {
  title: string;
  body: string;
  subtitle?: string;
  categoryName?: string;
  isImportant?: boolean;
  appIdentifier?: string;
}

export class NotificationService {
  static async initialize(): Promise<void> {
    if (Platform.OS === "web") {
      return;
    }

    // Request notification permissions
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      console.warn("Notification permissions not granted");
    }

    // Set up notification channels for Android
    if (Platform.OS === "android") {
      // Default channel
      await Notifications.setNotificationChannelAsync("default", {
        name: "Notifications",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#007AFF",
        sound: "default",
      });

      // Important/urgent channel
      await Notifications.setNotificationChannelAsync("important", {
        name: "Important",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF3B30",
        sound: "default",
        bypassDnd: true,
      });

      // Messages channel
      await Notifications.setNotificationChannelAsync("messages", {
        name: "Messages",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#34C759",
        sound: "default",
      });

      // Calls channel
      await Notifications.setNotificationChannelAsync("calls", {
        name: "Calls",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 200, 500],
        lightColor: "#34C759",
        sound: "default",
        bypassDnd: true,
      });

      // Social channel
      await Notifications.setNotificationChannelAsync("social", {
        name: "Social",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250],
        lightColor: "#0084FF",
        sound: "default",
      });
    }
  }

  static getChannelId(categoryName?: string, isImportant?: boolean): string {
    if (isImportant) return "important";

    switch (categoryName?.toLowerCase()) {
      case "messages":
      case "messenger":
      case "whatsapp":
        return "messages";
      case "incoming call":
      case "missed call":
      case "phone":
        return "calls";
      case "social":
      case "facebook":
      case "twitter":
      case "instagram":
        return "social";
      default:
        return "default";
    }
  }

  static async sendNotification(notification: LocalNotification): Promise<void> {
    if (Platform.OS === "web") {
      console.log("Web notification (simulated):", notification);
      return;
    }

    try {
      const channelId = this.getChannelId(notification.categoryName, notification.isImportant);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          subtitle: notification.subtitle,
          sound: true,
          vibrate: [0, 250, 250, 250],
          badge: 1,
          priority: notification.isImportant
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.HIGH,
          data: {
            categoryName: notification.categoryName,
            isImportant: notification.isImportant,
            appIdentifier: notification.appIdentifier,
          },
        },
        trigger: null,
      });

      console.log("Notification sent:", notification.title);
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  }

  static async clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
  }

  static async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }
}
