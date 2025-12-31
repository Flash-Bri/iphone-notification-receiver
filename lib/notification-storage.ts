import AsyncStorage from "@react-native-async-storage/async-storage";
import { ANCSNotification } from "./bluetooth-service";

const STORAGE_KEY = "@notifications";
const MAX_NOTIFICATIONS = 100; // Keep last 100 notifications

export class NotificationStorage {
  async saveNotification(notification: ANCSNotification): Promise<void> {
    try {
      const existing = await this.getAllNotifications();
      const updated = [notification, ...existing];

      // Keep only the most recent notifications
      const trimmed = updated.slice(0, MAX_NOTIFICATIONS);

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (error) {
      console.error("Error saving notification:", error);
    }
  }

  async getAllNotifications(): Promise<ANCSNotification[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error("Error loading notifications:", error);
      return [];
    }
  }

  async deleteNotification(id: string): Promise<void> {
    try {
      const existing = await this.getAllNotifications();
      const filtered = existing.filter((n) => n.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error("Error deleting notification:", error);
    }
  }

  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch (error) {
      console.error("Error clearing notifications:", error);
    }
  }
}

// Singleton instance
let notificationStorageInstance: NotificationStorage | null = null;

export function getNotificationStorage(): NotificationStorage {
  if (!notificationStorageInstance) {
    notificationStorageInstance = new NotificationStorage();
  }
  return notificationStorageInstance;
}
