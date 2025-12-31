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
  categoryName?: string;
  isImportant?: boolean;
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
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });

      // High priority channel for important notifications
      await Notifications.setNotificationChannelAsync("important", {
        name: "Important",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF0000",
      });
    }
  }

  static async sendNotification(notification: LocalNotification): Promise<void> {
    try {
      const channelId = notification.isImportant ? "important" : "default";

      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          sound: true,
          vibrate: [0, 250, 250, 250],
          badge: 1,
          data: {
            categoryName: notification.categoryName,
            isImportant: notification.isImportant,
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

  static async clearNotification(notificationId: string): Promise<void> {
    console.log("Note: Cannot dismiss specific notification with ID:", notificationId);
  }
}
