import { BleManager, Device, Characteristic, Subscription, State } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { Platform, AppState, AppStateStatus } from "react-native";

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

// Connection states for state machine
enum ConnectionState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Reconnecting = "reconnecting",
}

export class BluetoothService {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private lastConnectedDeviceId: string | null = null;
  private lastConnectedDeviceName: string | null = null;
  private onNotificationCallback: ((notification: ANCSNotification) => void) | null = null;
  private onConnectionChangeCallback: ((connected: boolean, deviceName?: string) => void) | null = null;
  private pendingNotifications: Map<number, ANCSNotification> = new Map();
  private dataSourceSubscription: Subscription | null = null;
  private notificationSourceSubscription: Subscription | null = null;
  private stateSubscription: Subscription | null = null;
  private disconnectionSubscription: Subscription | null = null;
  
  // Connection state management
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private connectionLock: boolean = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed: boolean = false;

  constructor() {
    // BleManager will be initialized lazily
  }

  private getManager(): BleManager {
    if (!this.manager) {
      this.manager = new BleManager();
    }
    return this.manager;
  }

  private setConnectionState(state: ConnectionState): void {
    console.log(`[BLE] Connection state: ${this.connectionState} -> ${state}`);
    this.connectionState = state;
  }

  async initialize(): Promise<void> {
    if (Platform.OS === "web") {
      console.log("[BLE] Web platform - Bluetooth not supported");
      return;
    }

    if (this.isDestroyed) {
      console.log("[BLE] Service was destroyed, reinitializing...");
      this.isDestroyed = false;
      this.manager = null;
    }

    try {
      const manager = this.getManager();
      
      // Monitor Bluetooth state changes
      this.stateSubscription = manager.onStateChange((state: State) => {
        console.log("[BLE] Bluetooth state changed:", state);
        if (state === State.PoweredOff) {
          this.handleBluetoothOff();
        } else if (state === State.PoweredOn && this.lastConnectedDeviceId) {
          // Bluetooth turned back on, could attempt reconnect
          console.log("[BLE] Bluetooth powered on, ready for connection");
        }
      }, true);

      const state = await manager.state();
      console.log("[BLE] Initial Bluetooth state:", state);
      
      if (state !== State.PoweredOn) {
        console.warn("[BLE] Bluetooth is not powered on, waiting...");
        // Wait for Bluetooth to be ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Bluetooth initialization timeout"));
          }, 10000);
          
          const sub = manager.onStateChange((newState: State) => {
            if (newState === State.PoweredOn) {
              clearTimeout(timeout);
              sub.remove();
              resolve();
            }
          }, true);
        });
      }
      
      console.log("[BLE] Bluetooth initialized successfully");
    } catch (error) {
      console.error("[BLE] Initialization error:", error);
      throw error;
    }
  }

  private handleBluetoothOff(): void {
    console.log("[BLE] Bluetooth turned off, cleaning up...");
    this.cleanupSubscriptions();
    this.connectedDevice = null;
    this.setConnectionState(ConnectionState.Disconnected);
    this.connectionLock = false;
    this.onConnectionChangeCallback?.(false);
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
      console.log("[BLE] Found connected devices:", devices.map((d: Device) => d.name || "Unknown"));
      return devices;
    } catch (error) {
      console.error("[BLE] Error getting connected devices:", error);
      return [];
    }
  }

  async discoverDevices(): Promise<Device[]> {
    if (this.isDestroyed) {
      console.log("[BLE] Service destroyed, cannot discover");
      return [];
    }

    return new Promise((resolve) => {
      const discoveredDevices: Map<string, Device> = new Map();
      let scanTimeout: ReturnType<typeof setTimeout>;

      try {
        const handleScanResult = (error: any, device: Device | null) => {
          if (error) {
            console.error("[BLE] Scan error:", error);
            return;
          }

          if (device && device.id) {
            if (!discoveredDevices.has(device.id)) {
              console.log("[BLE] Found device:", device.name || device.id);
              discoveredDevices.set(device.id, device);
            }
          }
        };

        this.getManager().startDeviceScan(null, null, handleScanResult);

        scanTimeout = setTimeout(() => {
          try {
            this.getManager().stopDeviceScan();
          } catch (e) {
            console.log("[BLE] Error stopping scan:", e);
          }
          const devices = Array.from(discoveredDevices.values());
          console.log("[BLE] Scan complete. Found", devices.length, "devices");
          resolve(devices);
        }, 5000);
      } catch (error) {
        console.error("[BLE] Error starting scan:", error);
        resolve([]);
      }
    });
  }

  async connectToDevice(device: Device): Promise<void> {
    // Prevent concurrent connection attempts
    if (this.connectionLock) {
      console.log("[BLE] Connection already in progress, ignoring request");
      throw new Error("Connection already in progress");
    }

    if (this.isDestroyed) {
      console.log("[BLE] Service destroyed, cannot connect");
      throw new Error("Service destroyed");
    }

    // Check if already connected to this device
    if (this.connectedDevice?.id === device.id && this.connectionState === ConnectionState.Connected) {
      console.log("[BLE] Already connected to this device");
      return;
    }

    this.connectionLock = true;
    this.setConnectionState(ConnectionState.Connecting);

    try {
      // Stop any ongoing scan
      try {
        this.getManager().stopDeviceScan();
      } catch (e) {
        // Ignore scan stop errors
      }

      // Clean up any existing connection
      await this.cleanupExistingConnection();

      console.log("[BLE] Connecting to device:", device.name || device.id);

      // Check if device is already connected at system level
      const isConnected = await device.isConnected();
      let connectedDevice: Device;

      if (isConnected) {
        console.log("[BLE] Device already connected at system level");
        connectedDevice = device;
      } else {
        // Connect with timeout
        connectedDevice = await Promise.race([
          device.connect({ autoConnect: false }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("Connection timeout")), 15000)
          ),
        ]);
      }

      this.connectedDevice = connectedDevice;
      this.lastConnectedDeviceId = device.id;
      this.lastConnectedDeviceName = device.name || "iPhone";

      console.log("[BLE] Discovering services and characteristics...");
      await connectedDevice.discoverAllServicesAndCharacteristics();

      console.log("[BLE] Setting up notification listener...");
      await this.setupNotificationListener(connectedDevice);

      this.setConnectionState(ConnectionState.Connected);
      this.onConnectionChangeCallback?.(true, device.name || "iPhone");

      // Monitor disconnection
      this.disconnectionSubscription = connectedDevice.onDisconnected((error) => {
        console.log("[BLE] Device disconnected", error ? `with error: ${error}` : "");
        this.handleDisconnection();
      });

      console.log("[BLE] Successfully connected to", device.name || device.id);
    } catch (error) {
      console.error("[BLE] Connection error:", error);
      this.cleanupSubscriptions();
      this.connectedDevice = null;
      this.setConnectionState(ConnectionState.Disconnected);
      this.onConnectionChangeCallback?.(false);
      throw error;
    } finally {
      this.connectionLock = false;
    }
  }

  private async cleanupExistingConnection(): Promise<void> {
    this.cleanupSubscriptions();
    
    if (this.connectedDevice) {
      try {
        const isConnected = await this.connectedDevice.isConnected();
        if (isConnected) {
          console.log("[BLE] Disconnecting existing connection...");
          await this.connectedDevice.cancelConnection();
        }
      } catch (e) {
        console.log("[BLE] Error during cleanup:", e);
      }
      this.connectedDevice = null;
    }
  }

  private handleDisconnection(): void {
    console.log("[BLE] Handling disconnection...");
    this.cleanupSubscriptions();
    this.connectedDevice = null;
    this.setConnectionState(ConnectionState.Disconnected);
    this.connectionLock = false;
    this.onConnectionChangeCallback?.(false);
  }

  private cleanupSubscriptions(): void {
    if (this.dataSourceSubscription) {
      try {
        this.dataSourceSubscription.remove();
      } catch (e) {
        console.log("[BLE] Error removing data source subscription:", e);
      }
      this.dataSourceSubscription = null;
    }
    if (this.notificationSourceSubscription) {
      try {
        this.notificationSourceSubscription.remove();
      } catch (e) {
        console.log("[BLE] Error removing notification source subscription:", e);
      }
      this.notificationSourceSubscription = null;
    }
    if (this.disconnectionSubscription) {
      try {
        this.disconnectionSubscription.remove();
      } catch (e) {
        console.log("[BLE] Error removing disconnection subscription:", e);
      }
      this.disconnectionSubscription = null;
    }
  }

  private async setupNotificationListener(device: Device): Promise<void> {
    try {
      console.log("[BLE] Setting up ANCS notification listener...");

      // Subscribe to Data Source first
      console.log("[BLE] Subscribing to Data Source characteristic...");
      this.dataSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        DATA_SOURCE_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("[BLE] Data Source monitor error:", error);
            return;
          }
          if (characteristic?.value) {
            this.parseDataSourceResponse(characteristic);
          }
        }
      );

      // Subscribe to Notification Source
      console.log("[BLE] Subscribing to Notification Source characteristic...");
      this.notificationSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        NOTIFICATION_SOURCE_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("[BLE] Notification Source monitor error:", error);
            return;
          }
          if (characteristic?.value) {
            this.parseNotification(characteristic);
          }
        }
      );

      // Send Control Point command after a delay (non-blocking)
      setTimeout(() => {
        if (this.connectedDevice && this.connectionState === ConnectionState.Connected) {
          this.sendControlPointCommand(device);
        }
      }, 1500);

      console.log("[BLE] Successfully set up ANCS notifications");
    } catch (error) {
      console.error("[BLE] Failed to setup notification listener:", error);
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
          console.log("[BLE] Control Point command sent successfully");
        })
        .catch((error: any) => {
          console.log("[BLE] Control Point write not supported (OK):", error?.message);
        });
    } catch (error) {
      console.log("[BLE] Could not send Control Point command:", error);
    }
  }

  private requestNotificationAttributes(notificationUid: number): void {
    if (!this.connectedDevice || this.connectionState !== ConnectionState.Connected) {
      console.log("[BLE] Cannot request attributes - not connected");
      return;
    }

    try {
      const command = Buffer.alloc(15);
      command[0] = 0; // CommandID: Get Notification Attributes
      command.writeUInt32LE(notificationUid, 1);

      command[5] = NotificationAttributeID.AppIdentifier;
      command[6] = NotificationAttributeID.Title;
      command.writeUInt16LE(255, 7);
      command[9] = NotificationAttributeID.Message;
      command.writeUInt16LE(255, 10);
      command[12] = NotificationAttributeID.Subtitle;
      command.writeUInt16LE(255, 13);

      console.log("[BLE] Requesting notification attributes for UID:", notificationUid);

      this.connectedDevice
        .writeCharacteristicWithoutResponseForService(
          ANCS_SERVICE_UUID,
          CONTROL_POINT_UUID,
          command.toString("base64")
        )
        .then(() => {
          console.log("[BLE] Attribute request sent for UID:", notificationUid);
        })
        .catch((error: any) => {
          console.error("[BLE] Error requesting attributes:", error?.message);
        });
    } catch (error) {
      console.error("[BLE] Error building attribute request:", error);
    }
  }

  private parseDataSourceResponse(characteristic: Characteristic): void {
    try {
      if (!characteristic.value) return;

      const data = Buffer.from(characteristic.value, "base64");
      console.log("[BLE] Data Source response received, length:", data.length);

      if (data.length < 5) return;

      const commandId = data[0];
      if (commandId !== 0) return;

      const notificationUid = data.readUInt32LE(1);
      console.log("[BLE] Received attributes for notification UID:", notificationUid);

      const pendingNotification = this.pendingNotifications.get(notificationUid);
      if (!pendingNotification) {
        console.log("[BLE] No pending notification found for UID:", notificationUid);
        return;
      }

      // Parse attributes
      let offset = 5;
      while (offset < data.length) {
        if (offset >= data.length) break;
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

      console.log("[BLE] Parsed notification:", {
        title: pendingNotification.title,
        message: pendingNotification.message?.substring(0, 50),
        app: pendingNotification.categoryName,
      });

      this.pendingNotifications.delete(notificationUid);
      this.onNotificationCallback?.(pendingNotification);
    } catch (error) {
      console.error("[BLE] Error parsing Data Source response:", error);
    }
  }

  private parseNotification(characteristic: Characteristic): void {
    try {
      if (!characteristic.value) return;

      const data = Buffer.from(characteristic.value, "base64");

      if (data.length < 8) {
        console.warn("[BLE] Invalid notification data length:", data.length);
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

      console.log("[BLE] Received notification:", {
        eventId,
        category: notification.categoryName,
        uid: notificationUid,
      });

      // Only process added notifications
      if (eventId === EventID.Added) {
        this.pendingNotifications.set(notificationUid, notification);
        this.requestNotificationAttributes(notificationUid);

        // Timeout fallback - deliver notification even if attributes fail
        setTimeout(() => {
          const pending = this.pendingNotifications.get(notificationUid);
          if (pending) {
            console.log("[BLE] Timeout: delivering notification without full attributes");
            this.pendingNotifications.delete(notificationUid);
            this.onNotificationCallback?.(pending);
          }
        }, 3000);
      }
    } catch (error) {
      console.error("[BLE] Error parsing notification:", error);
    }
  }

  async disconnect(): Promise<void> {
    console.log("[BLE] Disconnecting...");
    this.cleanupSubscriptions();
    
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (e) {
        console.log("[BLE] Error during disconnect:", e);
      }
      this.connectedDevice = null;
    }
    
    this.setConnectionState(ConnectionState.Disconnected);
    this.connectionLock = false;
    this.onConnectionChangeCallback?.(false);
  }

  isConnected(): boolean {
    return this.connectionState === ConnectionState.Connected && this.connectedDevice !== null;
  }

  isConnecting(): boolean {
    return this.connectionState === ConnectionState.Connecting || this.connectionLock;
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getConnectedDeviceName(): string | null {
    return this.connectedDevice?.name || this.lastConnectedDeviceName || null;
  }

  setLastConnectedDeviceId(deviceId: string | null): void {
    this.lastConnectedDeviceId = deviceId;
  }

  getLastConnectedDeviceId(): string | null {
    return this.lastConnectedDeviceId;
  }

  destroy(): void {
    console.log("[BLE] Destroying service...");
    this.isDestroyed = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.cleanupSubscriptions();
    
    if (this.stateSubscription) {
      try {
        this.stateSubscription.remove();
      } catch (e) {
        console.log("[BLE] Error removing state subscription:", e);
      }
      this.stateSubscription = null;
    }
    
    if (this.connectedDevice) {
      try {
        this.connectedDevice.cancelConnection();
      } catch (e) {
        console.log("[BLE] Error canceling connection:", e);
      }
      this.connectedDevice = null;
    }
    
    if (this.manager) {
      try {
        this.manager.destroy();
      } catch (e) {
        console.log("[BLE] Error destroying manager:", e);
      }
      this.manager = null;
    }
    
    this.setConnectionState(ConnectionState.Disconnected);
    this.connectionLock = false;
    this.pendingNotifications.clear();
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

export function resetBluetoothService(): void {
  if (bluetoothServiceInstance) {
    bluetoothServiceInstance.destroy();
    bluetoothServiceInstance = null;
  }
}
