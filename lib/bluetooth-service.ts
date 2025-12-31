import { BleManager, Device, Characteristic, Subscription } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { Platform } from "react-native";

// ANCS Service and Characteristic UUIDs
const ANCS_SERVICE_UUID = "7905F431-B5CE-4E99-A40F-4B1E122D00D0";
const NOTIFICATION_SOURCE_UUID = "9FBF120D-6301-42D9-8C58-25E699A21DBD";
const CONTROL_POINT_UUID = "69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9";
const DATA_SOURCE_UUID = "22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB";

// ANCS Notification Attribute IDs
const NotificationAttributeID = {
  AppIdentifier: 0,
  Title: 1,
  Subtitle: 2,
  Message: 3,
  MessageSize: 4,
  Date: 5,
  PositiveActionLabel: 6,
  NegativeActionLabel: 7,
};

export interface ANCSNotification {
  id: string;
  eventId: number;
  eventFlags: number;
  categoryId: number;
  categoryCount: number;
  notificationUid: number;
  timestamp: number;
  categoryName: string;
  isImportant: boolean;
  // Extended attributes from Data Source
  appIdentifier?: string;
  title?: string;
  subtitle?: string;
  message?: string;
  date?: string;
}

export enum EventID {
  Added = 0,
  Modified = 1,
  Removed = 2,
}

export enum CategoryID {
  Other = 0,
  IncomingCall = 1,
  MissedCall = 2,
  Voicemail = 3,
  Social = 4,
  Schedule = 5,
  Email = 6,
  News = 7,
  HealthAndFitness = 8,
  BusinessAndFinance = 9,
  Location = 10,
  Entertainment = 11,
}

const CATEGORY_NAMES: Record<CategoryID, string> = {
  [CategoryID.Other]: "Other",
  [CategoryID.IncomingCall]: "Incoming Call",
  [CategoryID.MissedCall]: "Missed Call",
  [CategoryID.Voicemail]: "Voicemail",
  [CategoryID.Social]: "Social",
  [CategoryID.Schedule]: "Schedule",
  [CategoryID.Email]: "Email",
  [CategoryID.News]: "News",
  [CategoryID.HealthAndFitness]: "Health & Fitness",
  [CategoryID.BusinessAndFinance]: "Business & Finance",
  [CategoryID.Location]: "Location",
  [CategoryID.Entertainment]: "Entertainment",
};

// Map app identifiers to friendly names
const APP_NAMES: Record<string, string> = {
  "com.apple.MobileSMS": "Messages",
  "com.apple.mobilemail": "Mail",
  "com.apple.mobilephone": "Phone",
  "com.apple.facetime": "FaceTime",
  "com.facebook.Messenger": "Messenger",
  "com.facebook.Facebook": "Facebook",
  "com.atebits.Tweetie2": "Twitter",
  "com.burbn.instagram": "Instagram",
  "net.whatsapp.WhatsApp": "WhatsApp",
  "com.google.Gmail": "Gmail",
  "com.apple.Preferences": "Settings",
  "com.apple.mobilecal": "Calendar",
  "com.apple.reminders": "Reminders",
  "com.spotify.client": "Spotify",
  "com.apple.Music": "Music",
};

export class BluetoothService {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private lastConnectedDeviceId: string | null = null;
  private onNotificationCallback: ((notification: ANCSNotification) => void) | null = null;
  private onConnectionChangeCallback: ((connected: boolean, deviceName?: string) => void) | null = null;
  private pendingNotifications: Map<number, ANCSNotification> = new Map();
  private dataSourceSubscription: Subscription | null = null;
  private notificationSourceSubscription: Subscription | null = null;

  constructor() {
    // BleManager will be initialized lazily
  }

  private getManager(): BleManager {
    if (!this.manager) {
      this.manager = new BleManager();
    }
    return this.manager;
  }

  async initialize(): Promise<void> {
    if (Platform.OS === "web") {
      throw new Error("Bluetooth is not supported on web platform");
    }

    const state = await this.getManager().state();
    if (state !== "PoweredOn") {
      throw new Error("Bluetooth is not powered on");
    }
  }

  onNotification(callback: (notification: ANCSNotification) => void): void {
    this.onNotificationCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean, deviceName?: string) => void): void {
    this.onConnectionChangeCallback = callback;
  }

  async getPairedDevices(): Promise<Device[]> {
    try {
      const devices = await this.getManager().connectedDevices([ANCS_SERVICE_UUID]);
      console.log("Found connected devices:", devices.map((device: Device) => device.name || "Unknown"));
      return devices;
    } catch (error) {
      console.error("Error getting connected devices:", error);
      return [];
    }
  }

  async discoverDevices(): Promise<Device[]> {
    return new Promise((resolve) => {
      const discoveredDevices: Map<string, Device> = new Map();
      let scanTimeout: ReturnType<typeof setTimeout>;

      const handleScanResult = (error: any, device: Device | null) => {
        if (error) {
          console.error("Scan error:", error);
          return;
        }

        if (device && device.id) {
          if (!discoveredDevices.has(device.id)) {
            console.log("Found device:", device.name || device.id);
            discoveredDevices.set(device.id, device);
          }
        }
      };

      this.getManager().startDeviceScan(null, null, handleScanResult);

      scanTimeout = setTimeout(() => {
        this.getManager().stopDeviceScan();
        const devices = Array.from(discoveredDevices.values());
        console.log("Scan complete. Found", devices.length, "devices");
        resolve(devices);
      }, 5000);
    });
  }

  async scanForDevices(): Promise<void> {
    this.getManager().startDeviceScan([ANCS_SERVICE_UUID], null, (error, device) => {
      if (error) {
        console.error("Scan error:", error);
        return;
      }

      if (device && device.name) {
        console.log("Found ANCS device:", device.name);
        this.connectToDevice(device);
      }
    });
  }

  async connectToDevice(device: Device): Promise<void> {
    try {
      this.getManager().stopDeviceScan();

      console.log("Connecting to device:", device.name);
      const connectedDevice = await device.connect();
      this.connectedDevice = connectedDevice;

      console.log("Discovering services and characteristics...");
      await connectedDevice.discoverAllServicesAndCharacteristics();

      console.log("Setting up notification listener...");
      await this.setupNotificationListener(connectedDevice);

      this.onConnectionChangeCallback?.(true, device.name || "iPhone");

      // Monitor disconnection
      connectedDevice.onDisconnected(() => {
        console.log("Device disconnected");
        this.connectedDevice = null;
        this.cleanupSubscriptions();
        this.onConnectionChangeCallback?.(false);
      });
    } catch (error) {
      console.error("Connection error:", error);
      this.connectedDevice = null;
      this.cleanupSubscriptions();
      this.onConnectionChangeCallback?.(false);
      throw error;
    }
  }

  private cleanupSubscriptions(): void {
    if (this.dataSourceSubscription) {
      this.dataSourceSubscription.remove();
      this.dataSourceSubscription = null;
    }
    if (this.notificationSourceSubscription) {
      this.notificationSourceSubscription.remove();
      this.notificationSourceSubscription = null;
    }
  }

  private async setupNotificationListener(device: Device): Promise<void> {
    try {
      console.log("Setting up ANCS notification listener...");

      // First, subscribe to Data Source to receive notification details
      console.log("Subscribing to Data Source characteristic...");
      this.dataSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        DATA_SOURCE_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("Data Source monitor error:", error);
            return;
          }

          if (characteristic?.value) {
            this.parseDataSourceResponse(characteristic);
          }
        }
      );

      // Subscribe to Notification Source characteristic
      console.log("Subscribing to Notification Source characteristic...");
      this.notificationSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        NOTIFICATION_SOURCE_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("Monitor error:", error);
            return;
          }

          console.log("Notification received:", characteristic?.value);
          if (characteristic?.value) {
            this.parseNotification(characteristic);
          }
        }
      );

      // Send Control Point command after a delay (non-blocking)
      console.log("Scheduling Control Point initialization...");
      setTimeout(() => {
        this.sendControlPointCommand(device);
      }, 1000);

      console.log("Successfully set up ANCS notifications");
    } catch (error) {
      console.error("Failed to setup notification listener:", error);
      throw error;
    }
  }

  private sendControlPointCommand(device: Device): void {
    try {
      const enableAllCommand = Buffer.from([0x00, 0xff, 0xff]);

      device
        .writeCharacteristicWithoutResponseForService(
          ANCS_SERVICE_UUID,
          CONTROL_POINT_UUID,
          enableAllCommand.toString("base64")
        )
        .then(() => {
          console.log("Control Point command sent successfully");
        })
        .catch((error: any) => {
          console.log("Control Point write not supported (this is OK):", error?.message);
        });
    } catch (error) {
      console.log("Could not send Control Point command:", error);
    }
  }

  private requestNotificationAttributes(notificationUid: number): void {
    if (!this.connectedDevice) return;

    try {
      // Command format:
      // [0] CommandID = 0 (Get Notification Attributes)
      // [1-4] NotificationUID (4 bytes, little-endian)
      // [5+] AttributeIDs with max lengths

      const command = Buffer.alloc(15);
      command[0] = 0; // CommandID: Get Notification Attributes
      command.writeUInt32LE(notificationUid, 1); // NotificationUID

      // Request attributes with max lengths
      command[5] = NotificationAttributeID.AppIdentifier;
      command[6] = NotificationAttributeID.Title;
      command.writeUInt16LE(255, 7); // Max length for title
      command[9] = NotificationAttributeID.Message;
      command.writeUInt16LE(255, 10); // Max length for message
      command[12] = NotificationAttributeID.Subtitle;
      command.writeUInt16LE(255, 13); // Max length for subtitle

      console.log("Requesting notification attributes for UID:", notificationUid);

      this.connectedDevice
        .writeCharacteristicWithoutResponseForService(
          ANCS_SERVICE_UUID,
          CONTROL_POINT_UUID,
          command.toString("base64")
        )
        .then(() => {
          console.log("Attribute request sent for UID:", notificationUid);
        })
        .catch((error: any) => {
          console.error("Error requesting attributes:", error?.message);
        });
    } catch (error) {
      console.error("Error building attribute request:", error);
    }
  }

  private parseDataSourceResponse(characteristic: Characteristic): void {
    try {
      if (!characteristic.value) return;

      const data = Buffer.from(characteristic.value, "base64");
      console.log("Data Source response received, length:", data.length);

      if (data.length < 5) return;

      const commandId = data[0];
      if (commandId !== 0) return; // Not a notification attributes response

      const notificationUid = data.readUInt32LE(1);
      console.log("Received attributes for notification UID:", notificationUid);

      const pendingNotification = this.pendingNotifications.get(notificationUid);
      if (!pendingNotification) {
        console.log("No pending notification found for UID:", notificationUid);
        return;
      }

      // Parse attributes
      let offset = 5;
      while (offset < data.length) {
        const attributeId = data[offset];
        offset++;

        if (offset + 2 > data.length) break;
        const length = data.readUInt16LE(offset);
        offset += 2;

        if (offset + length > data.length) break;
        const value = data.slice(offset, offset + length).toString("utf8");
        offset += length;

        switch (attributeId) {
          case NotificationAttributeID.AppIdentifier:
            pendingNotification.appIdentifier = value;
            break;
          case NotificationAttributeID.Title:
            pendingNotification.title = value;
            break;
          case NotificationAttributeID.Subtitle:
            pendingNotification.subtitle = value;
            break;
          case NotificationAttributeID.Message:
            pendingNotification.message = value;
            break;
          case NotificationAttributeID.Date:
            pendingNotification.date = value;
            break;
        }
      }

      // Update category name with app name if available
      if (pendingNotification.appIdentifier) {
        const appName = APP_NAMES[pendingNotification.appIdentifier] || pendingNotification.appIdentifier;
        pendingNotification.categoryName = appName;
      }

      console.log("Parsed notification:", pendingNotification);

      // Remove from pending and notify
      this.pendingNotifications.delete(notificationUid);
      this.onNotificationCallback?.(pendingNotification);
    } catch (error) {
      console.error("Error parsing Data Source response:", error);
    }
  }

  private parseNotification(characteristic: Characteristic): void {
    try {
      if (!characteristic.value) return;

      const data = Buffer.from(characteristic.value, "base64");

      if (data.length < 8) {
        console.warn("Invalid notification data length:", data.length);
        return;
      }

      const eventId = data[0];
      const eventFlags = data[1];
      const categoryId = data[2];
      const categoryCount = data[3];
      const notificationUid = data.readUInt32LE(4);

      const isImportant = (eventFlags & 0x01) !== 0;

      const notification: ANCSNotification = {
        id: `${notificationUid}-${Date.now()}`,
        eventId,
        eventFlags,
        categoryId,
        categoryCount,
        notificationUid,
        timestamp: Date.now(),
        categoryName: CATEGORY_NAMES[categoryId as CategoryID] || "Unknown",
        isImportant,
      };

      console.log("Received notification:", notification);

      // Only process added notifications
      if (eventId === EventID.Added) {
        // Store in pending and request full attributes
        this.pendingNotifications.set(notificationUid, notification);
        this.requestNotificationAttributes(notificationUid);

        // Set a timeout to deliver notification even if attributes fail
        setTimeout(() => {
          const pending = this.pendingNotifications.get(notificationUid);
          if (pending) {
            console.log("Timeout: delivering notification without full attributes");
            this.pendingNotifications.delete(notificationUid);
            this.onNotificationCallback?.(pending);
          }
        }, 3000);
      }
    } catch (error) {
      console.error("Error parsing notification:", error);
    }
  }

  async disconnect(): Promise<void> {
    this.cleanupSubscriptions();
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection();
      this.connectedDevice = null;
      this.onConnectionChangeCallback?.(false);
    }
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getConnectedDeviceName(): string | null {
    return this.connectedDevice?.name || null;
  }

  setLastConnectedDeviceId(deviceId: string | null): void {
    this.lastConnectedDeviceId = deviceId;
  }

  getLastConnectedDeviceId(): string | null {
    return this.lastConnectedDeviceId;
  }

  destroy(): void {
    this.cleanupSubscriptions();
    if (this.manager) {
      this.manager.destroy();
    }
  }
}

// Singleton instance
let bluetoothServiceInstance: BluetoothService | null = null;

export function getBluetoothService(): BluetoothService {
  if (!bluetoothServiceInstance) {
    bluetoothServiceInstance = new BluetoothService();
  }
  return bluetoothServiceInstance;
}
