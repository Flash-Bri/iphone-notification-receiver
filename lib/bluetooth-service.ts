import { BleManager, Device, Characteristic } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { Platform } from "react-native";

// ANCS Service and Characteristic UUIDs
const ANCS_SERVICE_UUID = "7905F431-B5CE-4E99-A40F-4B1E122D00D0";
const NOTIFICATION_SOURCE_UUID = "9FBF120D-6301-42D9-8C58-25E699A21DBD";
const CONTROL_POINT_UUID = "69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9";
const DATA_SOURCE_UUID = "22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB";

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

export class BluetoothService {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private onNotificationCallback: ((notification: ANCSNotification) => void) | null = null;
  private onConnectionChangeCallback: ((connected: boolean, deviceName?: string) => void) | null = null;

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
      // Get all connected devices (supports ANCS service)
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
        this.onConnectionChangeCallback?.(false);
      });
    } catch (error) {
      console.error("Connection error:", error);
      this.connectedDevice = null;
      this.onConnectionChangeCallback?.(false);
      throw error;
    }
  }

  private async setupNotificationListener(device: Device): Promise<void> {
    try {
      console.log("Setting up ANCS notification listener...");

      // Subscribe to Notification Source characteristic
      console.log("Subscribing to Notification Source characteristic...");
      device.monitorCharacteristicForService(
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
      // This tells the iPhone we want to receive notifications
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
      // Command format: [CommandID, CategoryID, CategoryBitMask]
      // 0x00 = EnableNotificationForUID
      // 0xFF = All categories
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

  private parseNotification(characteristic: Characteristic): void {
    try {
      if (!characteristic.value) return;

      // Decode base64 value to bytes
      const data = Buffer.from(characteristic.value, "base64");

      // ANCS Notification Source format (8 bytes):
      // [0] EventID (1 byte)
      // [1] EventFlags (1 byte)
      // [2] CategoryID (1 byte)
      // [3] CategoryCount (1 byte)
      // [4-7] NotificationUID (4 bytes, little-endian)

      if (data.length < 8) {
        console.warn("Invalid notification data length:", data.length);
        return;
      }

      const eventId = data[0];
      const eventFlags = data[1];
      const categoryId = data[2];
      const categoryCount = data[3];
      const notificationUid = data.readUInt32LE(4);

      // Check if this is an important notification (bit 0 of EventFlags)
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

      // Only notify for added notifications, not modifications or removals
      if (eventId === EventID.Added) {
        this.onNotificationCallback?.(notification);
      }
    } catch (error) {
      console.error("Error parsing notification:", error);
    }
  }

  async disconnect(): Promise<void> {
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

  destroy(): void {
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
