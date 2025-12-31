import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure notification handler - MUST be called at module load time
// This ensures notifications show even when app is in background
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
  private static isInitialized = false;
  private static permissionGranted = false;

  static async initialize(): Promise<boolean> {
    if (Platform.OS === "web") {
      console.log("[Notification] Web platform - skipping initialization");
      return false;
    }

    if (this.isInitialized) {
      console.log("[Notification] Already initialized");
      return this.permissionGranted;
    }

    try {
      console.log("[Notification] Initializing notification service...");

      // Request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        console.log("[Notification] Requesting permissions...");
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      this.permissionGranted = finalStatus === "granted";

      if (!this.permissionGranted) {
        console.warn("[Notification] Permissions not granted:", finalStatus);
        return false;
      }

      console.log("[Notification] Permissions granted");

      // Set up notification channels for Android
      if (Platform.OS === "android") {
        await this.setupAndroidChannels();
      }

      this.isInitialized = true;
      console.log("[Notification] Service initialized successfully");
      return true;
    } catch (error) {
      console.error("[Notification] Initialization error:", error);
      return false;
    }
  }

  private static async setupAndroidChannels(): Promise<void> {
    console.log("[Notification] Setting up Android channels...");

    // Delete existing channels to ensure fresh setup
    try {
      await Notifications.deleteNotificationChannelAsync("default");
      await Notifications.deleteNotificationChannelAsync("important");
      await Notifications.deleteNotificationChannelAsync("messages");
      await Notifications.deleteNotificationChannelAsync("calls");
      await Notifications.deleteNotificationChannelAsync("social");
    } catch (e) {
      // Channels may not exist yet
    }

    // Default channel - HIGH importance for visibility
    await Notifications.setNotificationChannelAsync("default", {
      name: "iPhone Notifications",
      description: "Notifications from your iPhone",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#007AFF",
      sound: "default",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Important/urgent channel - MAX importance, bypasses DND
    await Notifications.setNotificationChannelAsync("important", {
      name: "Important Notifications",
      description: "Urgent notifications from your iPhone",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: "#FF3B30",
      sound: "default",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Messages channel
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      description: "Text messages and iMessages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#34C759",
      sound: "default",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Calls channel - MAX importance
    await Notifications.setNotificationChannelAsync("calls", {
      name: "Calls",
      description: "Incoming and missed calls",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 500, 1000],
      lightColor: "#34C759",
      sound: "default",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Social channel
    await Notifications.setNotificationChannelAsync("social", {
      name: "Social",
      description: "Social media notifications",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
      lightColor: "#0084FF",
      sound: "default",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    console.log("[Notification] Android channels created");
  }

  static getChannelId(categoryName?: string, isImportant?: boolean): string {
    if (isImportant) return "important";

    const category = categoryName?.toLowerCase() || "";

    if (
      category.includes("message") ||
      category.includes("sms") ||
      category.includes("imessage") ||
      category.includes("whatsapp") ||
      category.includes("messenger")
    ) {
      return "messages";
    }

    if (
      category.includes("call") ||
      category.includes("phone") ||
      category.includes("facetime")
    ) {
      return "calls";
    }

    if (
      category.includes("social") ||
      category.includes("facebook") ||
      category.includes("twitter") ||
      category.includes("instagram") ||
      category.includes("tiktok")
    ) {
      return "social";
    }

    return "default";
  }

  static async sendNotification(notification: LocalNotification): Promise<boolean> {
    if (Platform.OS === "web") {
      console.log("[Notification] Web notification (simulated):", notification.title);
      return false;
    }

    // Ensure initialized
    if (!this.isInitialized) {
      console.log("[Notification] Not initialized, initializing now...");
      await this.initialize();
    }

    if (!this.permissionGranted) {
      console.warn("[Notification] Cannot send - permissions not granted");
      return false;
    }

    try {
      const channelId = this.getChannelId(notification.categoryName, notification.isImportant);

      console.log(`[Notification] Sending: "${notification.title}" on channel: ${channelId}`);

      // Use presentNotificationAsync for immediate display (more reliable than scheduleNotificationAsync with null trigger)
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title || "iPhone Notification",
          body: notification.body || "New notification from iPhone",
          subtitle: notification.subtitle,
          sound: "default",
          vibrate: [0, 250, 250, 250],
          badge: 1,
          priority: notification.isImportant
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.HIGH,
          sticky: false,
          autoDismiss: true,
          data: {
            categoryName: notification.categoryName,
            isImportant: notification.isImportant,
            appIdentifier: notification.appIdentifier,
            timestamp: Date.now(),
          },
        },
        trigger: null, // null trigger = immediate
      });

      console.log(`[Notification] Sent successfully, ID: ${notificationId}`);
      return true;
    } catch (error) {
      console.error("[Notification] Error sending:", error);
      return false;
    }
  }

  static async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error("[Notification] Error clearing:", error);
    }
  }

  static async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error("[Notification] Error setting badge:", error);
    }
  }

  static async getPermissionStatus(): Promise<string> {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  }
}
