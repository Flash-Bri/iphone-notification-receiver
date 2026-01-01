import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { ANCSNotification } from "./bluetooth-service";

// Background task name
const BACKGROUND_NOTIFICATION_TASK = "ANCS_BACKGROUND_NOTIFICATION_TASK";

// Configure notification handler - MUST be called at module load time
// This ensures notifications show even when app is in background/killed
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
  data?: Record<string, any>;
}

class NotificationServiceClass {
  private isInitialized = false;
  private permissionGranted = false;
  private notificationCount = 0;

  async initialize(): Promise<boolean> {
    if (Platform.OS === "web") {
      console.log("[NotificationService] Web platform - skipping initialization");
      return false;
    }

    if (this.isInitialized) {
      console.log("[NotificationService] Already initialized");
      return this.permissionGranted;
    }

    try {
      console.log("[NotificationService] Initializing...");

      // Request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        console.log("[NotificationService] Requesting permissions...");
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
          android: {},
        });
        finalStatus = status;
      }

      this.permissionGranted = finalStatus === "granted";

      if (!this.permissionGranted) {
        console.warn("[NotificationService] Permissions not granted:", finalStatus);
        return false;
      }

      console.log("[NotificationService] Permissions granted");

      // Set up notification channels for Android
      if (Platform.OS === "android") {
        await this.setupAndroidChannels();
      }

      this.isInitialized = true;
      console.log("[NotificationService] Initialized successfully");
      return true;
    } catch (error) {
      console.error("[NotificationService] Initialization error:", error);
      return false;
    }
  }

  private async setupAndroidChannels(): Promise<void> {
    console.log("[NotificationService] Setting up Android channels...");

    // Delete existing channels to ensure fresh setup
    const existingChannels = ["default", "important", "messages", "calls", "social", "foreground"];
    for (const channelId of existingChannels) {
      try {
        await Notifications.deleteNotificationChannelAsync(channelId);
      } catch (e) {
        // Channel may not exist
      }
    }

    // Foreground service channel (required for persistent notification)
    await Notifications.setNotificationChannelAsync("foreground", {
      name: "Background Service",
      description: "Keeps the app running to receive iPhone notifications",
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: null,
      lightColor: "#007AFF",
      sound: null,
      enableVibrate: false,
      enableLights: false,
      showBadge: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
    });

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
      description: "Urgent notifications from your iPhone (calls, etc.)",
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
      description: "Text messages and iMessages from iPhone",
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
      description: "Incoming and missed calls from iPhone",
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
      description: "Social media notifications from iPhone",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
      lightColor: "#0084FF",
      sound: "default",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    console.log("[NotificationService] Android channels created");
  }

  getChannelId(notification: ANCSNotification | LocalNotification): string {
    // Check if important (calls, etc.)
    if ("isImportant" in notification && notification.isImportant) {
      return "important";
    }

    // Check category
    const categoryName = notification.categoryName?.toLowerCase() || "";
    const appId = ("appIdentifier" in notification ? notification.appIdentifier : "") || "";

    // Calls
    if (
      categoryName.includes("call") ||
      categoryName.includes("incoming") ||
      categoryName.includes("missed") ||
      appId.includes("facetime") ||
      appId.includes("phone")
    ) {
      return "calls";
    }

    // Messages
    if (
      categoryName.includes("message") ||
      categoryName.includes("sms") ||
      appId.includes("messages") ||
      appId.includes("whatsapp") ||
      appId.includes("telegram") ||
      appId.includes("messenger")
    ) {
      return "messages";
    }

    // Social
    if (
      categoryName.includes("social") ||
      appId.includes("facebook") ||
      appId.includes("twitter") ||
      appId.includes("instagram") ||
      appId.includes("tiktok") ||
      appId.includes("snapchat") ||
      appId.includes("linkedin")
    ) {
      return "social";
    }

    return "default";
  }

  async sendNotification(notification: ANCSNotification): Promise<boolean> {
    if (Platform.OS === "web") {
      console.log("[NotificationService] Web notification (simulated):", notification.title || notification.categoryName);
      return false;
    }

    // Ensure initialized
    if (!this.isInitialized) {
      console.log("[NotificationService] Not initialized, initializing now...");
      await this.initialize();
    }

    if (!this.permissionGranted) {
      console.warn("[NotificationService] Cannot send - permissions not granted");
      return false;
    }

    try {
      const channelId = this.getChannelId(notification);

      // Build notification content
      let title = notification.title || notification.appDisplayName || notification.categoryName || "iPhone Notification";
      let body = notification.message || notification.subtitle || `New ${notification.categoryName} notification`;
      
      // If we only have category (no real content), show a more informative message
      if (!notification.title && !notification.message && !notification.subtitle) {
        if (notification.appIdentifier) {
          body = `New notification from ${this.formatAppName(notification.appIdentifier)}`;
        } else {
          body = `New ${notification.categoryName} notification`;
        }
      }

      console.log(`[NotificationService] Sending: "${title}" - "${body}" on channel: ${channelId}`);

      this.notificationCount++;

      // Schedule notification immediately (null trigger = immediate)
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          subtitle: notification.subtitle,
          sound: "default",
          vibrate: notification.isImportant ? [0, 500, 200, 500] : [0, 250, 250, 250],
          badge: this.notificationCount,
          priority: notification.isImportant
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.HIGH,
          sticky: false,
          autoDismiss: true,
          data: {
            notificationUid: notification.notificationUid,
            categoryId: notification.categoryId,
            categoryName: notification.categoryName,
            appIdentifier: notification.appIdentifier,
            timestamp: notification.timestamp,
          },
        },
        trigger: null, // null = immediate
      });

      console.log(`[NotificationService] Sent successfully, ID: ${notificationId}`);
      return true;
    } catch (error) {
      console.error("[NotificationService] Error sending:", error);
      return false;
    }
  }

  private formatAppName(appIdentifier: string): string {
    // Extract app name from bundle ID (e.g., "com.facebook.Messenger" -> "Messenger")
    const parts = appIdentifier.split(".");
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      // Capitalize first letter
      return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
    }
    return appIdentifier;
  }

  async showForegroundServiceNotification(): Promise<string | null> {
    if (Platform.OS !== "android") {
      return null;
    }

    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "iPhone Notifications",
          body: "Listening for notifications from your iPhone...",
          sound: undefined,
          vibrate: undefined,
          badge: 0,
          priority: Notifications.AndroidNotificationPriority.LOW,
          sticky: true,
          autoDismiss: false,
        },
        trigger: null,
      });

      console.log("[NotificationService] Foreground service notification shown:", notificationId);
      return notificationId;
    } catch (error) {
      console.error("[NotificationService] Error showing foreground notification:", error);
      return null;
    }
  }

  async dismissForegroundServiceNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.dismissNotificationAsync(notificationId);
    } catch (error) {
      console.error("[NotificationService] Error dismissing foreground notification:", error);
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.setBadgeCountAsync(0);
      this.notificationCount = 0;
    } catch (error) {
      console.error("[NotificationService] Error clearing:", error);
    }
  }

  async setBadgeCount(count: number): Promise<void> {
    try {
      this.notificationCount = count;
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error("[NotificationService] Error setting badge:", error);
    }
  }

  async getPermissionStatus(): Promise<string> {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  }

  isReady(): boolean {
    return this.isInitialized && this.permissionGranted;
  }
}

// Singleton instance
export const NotificationService = new NotificationServiceClass();
