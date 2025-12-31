import { describe, it, expect, beforeEach, vi } from "vitest";
import { NotificationStorage } from "../notification-storage";
import { ANCSNotification } from "../bluetooth-service";

// Mock AsyncStorage
const mockStorage: Record<string, string> = {};

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    getItem: vi.fn((key: string) => {
      return Promise.resolve(mockStorage[key] || null);
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

describe("NotificationStorage", () => {
  let storage: NotificationStorage;

  const mockNotification: ANCSNotification = {
    id: "test-1",
    eventId: 0,
    eventFlags: 0,
    categoryId: 6,
    categoryCount: 1,
    notificationUid: 12345,
    timestamp: Date.now(),
    categoryName: "Email",
    isImportant: false,
  };

  beforeEach(() => {
    storage = new NotificationStorage();
    // Clear mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it("should save notification successfully", async () => {
    await storage.saveNotification(mockNotification);
    const notifications = await storage.getAllNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe("test-1");
  });

  it("should return empty array when no notifications exist", async () => {
    const notifications = await storage.getAllNotifications();
    expect(notifications).toEqual([]);
  });

  it("should save multiple notifications in order", async () => {
    const notification1 = { ...mockNotification, id: "test-1" };
    const notification2 = { ...mockNotification, id: "test-2" };

    await storage.saveNotification(notification1);
    await storage.saveNotification(notification2);

    const notifications = await storage.getAllNotifications();
    expect(notifications).toHaveLength(2);
    expect(notifications[0].id).toBe("test-2"); // Most recent first
    expect(notifications[1].id).toBe("test-1");
  });

  it("should delete notification by id", async () => {
    await storage.saveNotification(mockNotification);
    await storage.deleteNotification("test-1");

    const notifications = await storage.getAllNotifications();
    expect(notifications).toHaveLength(0);
  });

  it("should clear all notifications", async () => {
    await storage.saveNotification({ ...mockNotification, id: "test-1" });
    await storage.saveNotification({ ...mockNotification, id: "test-2" });

    await storage.clearAll();

    const notifications = await storage.getAllNotifications();
    expect(notifications).toEqual([]);
  });

  it("should limit notifications to MAX_NOTIFICATIONS", async () => {
    // Save 101 notifications (MAX is 100)
    for (let i = 0; i < 101; i++) {
      await storage.saveNotification({ ...mockNotification, id: `test-${i}` });
    }

    const notifications = await storage.getAllNotifications();
    expect(notifications).toHaveLength(100);
    expect(notifications[0].id).toBe("test-100"); // Most recent
    expect(notifications[99].id).toBe("test-1"); // Oldest kept
  });
});
