import { BleManager, Device, Characteristic, Subscription, State } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { Platform } from "react-native";

// ANCS Service and Characteristic UUIDs (lowercase for compatibility)
const ANCS_SERVICE_UUID = "7905f431-b5ce-4e99-a40f-4b1e122d00d0";
const NOTIFICATION_SOURCE_UUID = "9fbf120d-6301-42d9-8c58-25e699a21dbd";
const CONTROL_POINT_UUID = "69d1d8f3-45e1-49a8-9821-9bbdfdaad9d9";
const DATA_SOURCE_UUID = "22eac6e9-24d6-4bb5-be44-b36ace7c7bfb";

// ANCS Command IDs
const CommandID = {
  GetNotificationAttributes: 0,
  GetAppAttributes: 1,
  PerformNotificationAction: 2,
};

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

const CATEGORY_NAMES: Record<number, string> = {
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
  "com.apple.AccessibilityUtilities.AXNotificationCenter": "System",
};

// Connection states
enum ConnectionState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
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
  private dataBuffer: Buffer = Buffer.alloc(0);
  
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private connectionLock: boolean = false;
  private isDestroyed: boolean = false;

  constructor() {}

  private getManager(): BleManager {
    if (!this.manager) {
      this.manager = new BleManager();
    }
    return this.manager;
  }

  private setConnectionState(state: ConnectionState): void {
    console.log(`[BLE] State: ${this.connectionState} -> ${state}`);
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
      
      this.stateSubscription = manager.onStateChange((state: State) => {
        console.log("[BLE] Bluetooth state:", state);
        if (state === State.PoweredOff) {
          this.handleBluetoothOff();
        }
      }, true);

      const state = await manager.state();
      console.log("[BLE] Initial state:", state);
      
      if (state !== State.PoweredOn) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Bluetooth timeout")), 10000);
          const sub = manager.onStateChange((newState: State) => {
            if (newState === State.PoweredOn) {
              clearTimeout(timeout);
              sub.remove();
              resolve();
            }
          }, true);
        });
      }
      
      console.log("[BLE] Initialized successfully");
    } catch (error) {
      console.error("[BLE] Init error:", error);
      throw error;
    }
  }

  private handleBluetoothOff(): void {
    console.log("[BLE] Bluetooth off, cleaning up...");
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
      return devices;
    } catch (error) {
      console.error("[BLE] Error getting devices:", error);
      return [];
    }
  }

  async discoverDevices(): Promise<Device[]> {
    if (this.isDestroyed) return [];

    return new Promise((resolve) => {
      const discovered: Map<string, Device> = new Map();

      try {
        this.getManager().startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
          if (error) {
            console.error("[BLE] Scan error:", error);
            return;
          }
          if (device?.id && !discovered.has(device.id)) {
            console.log("[BLE] Found:", device.name || device.id);
            discovered.set(device.id, device);
          }
        });

        setTimeout(() => {
          try {
            this.getManager().stopDeviceScan();
          } catch (e) {}
          resolve(Array.from(discovered.values()));
        }, 5000);
      } catch (error) {
        console.error("[BLE] Scan start error:", error);
        resolve([]);
      }
    });
  }

  async connectToDevice(device: Device): Promise<void> {
    if (this.connectionLock) {
      console.log("[BLE] Connection in progress");
      throw new Error("Connection in progress");
    }

    if (this.isDestroyed) {
      throw new Error("Service destroyed");
    }

    if (this.connectedDevice?.id === device.id && this.connectionState === ConnectionState.Connected) {
      console.log("[BLE] Already connected");
      return;
    }

    this.connectionLock = true;
    this.setConnectionState(ConnectionState.Connecting);

    try {
      try { this.getManager().stopDeviceScan(); } catch (e) {}
      await this.cleanupExistingConnection();

      console.log("[BLE] Connecting to:", device.name || device.id);

      const isConnected = await device.isConnected();
      let connectedDevice: Device;

      if (isConnected) {
        console.log("[BLE] Already connected at system level");
        connectedDevice = device;
      } else {
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

      console.log("[BLE] Discovering services...");
      await connectedDevice.discoverAllServicesAndCharacteristics();

      console.log("[BLE] Setting up ANCS...");
      await this.setupANCS(connectedDevice);

      this.setConnectionState(ConnectionState.Connected);
      this.onConnectionChangeCallback?.(true, device.name || "iPhone");

      this.disconnectionSubscription = connectedDevice.onDisconnected((error) => {
        console.log("[BLE] Disconnected", error ? `error: ${error}` : "");
        this.handleDisconnection();
      });

      console.log("[BLE] Connected successfully");
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
    this.pendingNotifications.clear();
    this.dataBuffer = Buffer.alloc(0);
    
    if (this.connectedDevice) {
      try {
        const isConnected = await this.connectedDevice.isConnected();
        if (isConnected) {
          await this.connectedDevice.cancelConnection();
        }
      } catch (e) {}
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
    [this.dataSourceSubscription, this.notificationSourceSubscription, this.disconnectionSubscription].forEach(sub => {
      try { sub?.remove(); } catch (e) {}
    });
    this.dataSourceSubscription = null;
    this.notificationSourceSubscription = null;
    this.disconnectionSubscription = null;
  }

  private async setupANCS(device: Device): Promise<void> {
    try {
      console.log("[BLE] Subscribing to Data Source...");
      this.dataSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        DATA_SOURCE_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("[BLE] Data Source error:", error.message);
            return;
          }
          if (characteristic?.value) {
            this.handleDataSourceResponse(characteristic);
          }
        }
      );

      // Small delay before subscribing to Notification Source
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log("[BLE] Subscribing to Notification Source...");
      this.notificationSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        NOTIFICATION_SOURCE_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("[BLE] Notification Source error:", error.message);
            return;
          }
          if (characteristic?.value) {
            this.handleNotificationSource(characteristic);
          }
        }
      );

      console.log("[BLE] ANCS setup complete");
    } catch (error) {
      console.error("[BLE] ANCS setup failed:", error);
      throw error;
    }
  }

  private handleNotificationSource(characteristic: Characteristic): void {
    try {
      if (!characteristic.value) return;

      const data = Buffer.from(characteristic.value, "base64");
      if (data.length < 8) return;

      const eventId = data[0];
      const eventFlags = data[1];
      const categoryId = data[2];
      const categoryCount = data[3];
      const notificationUid = data.readUInt32LE(4);

      console.log(`[BLE] Notification: event=${eventId}, category=${categoryId}, uid=${notificationUid}`);

      // Only process new notifications
      if (eventId !== EventID.Added) {
        console.log("[BLE] Skipping non-add event");
        return;
      }

      const notification: ANCSNotification = {
        id: `${notificationUid}-${Date.now()}`,
        eventId,
        eventFlags,
        categoryId,
        categoryCount,
        notificationUid,
        timestamp: Date.now(),
        categoryName: CATEGORY_NAMES[categoryId] || "Notification",
        isImportant: (eventFlags & 0x01) !== 0 || categoryId === CategoryID.IncomingCall,
      };

      this.pendingNotifications.set(notificationUid, notification);
      
      // Request full notification attributes
      this.requestNotificationAttributes(notificationUid);

      // Fallback: deliver after timeout if attributes don't arrive
      setTimeout(() => {
        const pending = this.pendingNotifications.get(notificationUid);
        if (pending) {
          console.log("[BLE] Timeout - delivering without full attributes");
          this.pendingNotifications.delete(notificationUid);
          this.deliverNotification(pending);
        }
      }, 5000);
    } catch (error) {
      console.error("[BLE] Error parsing notification:", error);
    }
  }

  private requestNotificationAttributes(notificationUid: number): void {
    if (!this.connectedDevice || this.connectionState !== ConnectionState.Connected) {
      console.log("[BLE] Cannot request attributes - not connected");
      return;
    }

    try {
      // Build the Get Notification Attributes command according to ANCS spec
      // Format: CommandID (1) + NotificationUID (4) + AttributeID + MaxLen pairs
      const parts: number[] = [
        CommandID.GetNotificationAttributes,
        // NotificationUID (4 bytes, little endian)
        notificationUid & 0xff,
        (notificationUid >> 8) & 0xff,
        (notificationUid >> 16) & 0xff,
        (notificationUid >> 24) & 0xff,
        // App Identifier (no max length needed)
        NotificationAttributeID.AppIdentifier,
        // Title with max length 255
        NotificationAttributeID.Title,
        0xff, 0x00, // 255 in little endian
        // Subtitle with max length 255
        NotificationAttributeID.Subtitle,
        0xff, 0x00,
        // Message with max length 500
        NotificationAttributeID.Message,
        0xf4, 0x01, // 500 in little endian
        // Date
        NotificationAttributeID.Date,
      ];

      const command = Buffer.from(parts);
      console.log(`[BLE] Requesting attributes for UID ${notificationUid}, cmd length: ${command.length}`);

      this.connectedDevice
        .writeCharacteristicWithResponseForService(
          ANCS_SERVICE_UUID,
          CONTROL_POINT_UUID,
          command.toString("base64")
        )
        .then(() => {
          console.log("[BLE] Attribute request sent");
        })
        .catch((error: any) => {
          console.error("[BLE] Attribute request failed:", error?.message);
          // Try without response as fallback
          this.connectedDevice?.writeCharacteristicWithoutResponseForService(
            ANCS_SERVICE_UUID,
            CONTROL_POINT_UUID,
            command.toString("base64")
          ).catch(() => {});
        });
    } catch (error) {
      console.error("[BLE] Error building attribute request:", error);
    }
  }

  private handleDataSourceResponse(characteristic: Characteristic): void {
    try {
      if (!characteristic.value) return;

      const newData = Buffer.from(characteristic.value, "base64");
      console.log(`[BLE] Data Source received ${newData.length} bytes`);

      // Accumulate data (responses can be fragmented)
      this.dataBuffer = Buffer.concat([this.dataBuffer, newData]);

      // Try to parse complete responses
      this.parseDataBuffer();
    } catch (error) {
      console.error("[BLE] Data Source error:", error);
    }
  }

  private parseDataBuffer(): void {
    while (this.dataBuffer.length >= 5) {
      const commandId = this.dataBuffer[0];
      
      if (commandId !== CommandID.GetNotificationAttributes) {
        // Unknown command, skip one byte
        this.dataBuffer = this.dataBuffer.slice(1);
        continue;
      }

      const notificationUid = this.dataBuffer.readUInt32LE(1);
      console.log(`[BLE] Parsing attributes for UID: ${notificationUid}`);

      const pending = this.pendingNotifications.get(notificationUid);
      if (!pending) {
        console.log("[BLE] No pending notification for UID:", notificationUid);
        // Try to skip this response
        this.dataBuffer = this.dataBuffer.slice(5);
        continue;
      }

      // Parse attributes
      let offset = 5;
      let complete = false;
      let attributesParsed = 0;

      while (offset < this.dataBuffer.length) {
        if (offset >= this.dataBuffer.length) break;
        
        const attributeId = this.dataBuffer[offset];
        offset++;

        // Check if we have length bytes
        if (offset + 2 > this.dataBuffer.length) {
          // Need more data
          break;
        }

        const length = this.dataBuffer.readUInt16LE(offset);
        offset += 2;

        // Check if we have the full value
        if (offset + length > this.dataBuffer.length) {
          // Need more data
          offset -= 3; // Rewind
          break;
        }

        const value = this.dataBuffer.slice(offset, offset + length).toString("utf8");
        offset += length;
        attributesParsed++;

        console.log(`[BLE] Attribute ${attributeId}: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);

        switch (attributeId) {
          case NotificationAttributeID.AppIdentifier:
            pending.appIdentifier = value;
            if (APP_NAMES[value]) {
              pending.categoryName = APP_NAMES[value];
            }
            break;
          case NotificationAttributeID.Title:
            pending.title = value;
            break;
          case NotificationAttributeID.Subtitle:
            pending.subtitle = value;
            break;
          case NotificationAttributeID.Message:
            pending.message = value;
            break;
          case NotificationAttributeID.Date:
            pending.date = value;
            complete = true; // Date is our last requested attribute
            break;
        }
      }

      // Consume parsed data
      this.dataBuffer = this.dataBuffer.slice(offset);

      // If we parsed at least some attributes, deliver the notification
      if (attributesParsed > 0 || complete) {
        console.log(`[BLE] Delivering notification: title="${pending.title}", msg="${pending.message?.substring(0, 30)}..."`);
        this.pendingNotifications.delete(notificationUid);
        this.deliverNotification(pending);
      }
    }
  }

  private deliverNotification(notification: ANCSNotification): void {
    console.log(`[BLE] Delivering: ${notification.categoryName} - ${notification.title || 'No title'}`);
    this.onNotificationCallback?.(notification);
  }

  async disconnect(): Promise<void> {
    console.log("[BLE] Disconnecting...");
    this.cleanupSubscriptions();
    
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (e) {}
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
    console.log("[BLE] Destroying...");
    this.isDestroyed = true;
    this.cleanupSubscriptions();
    
    try { this.stateSubscription?.remove(); } catch (e) {}
    this.stateSubscription = null;
    
    if (this.connectedDevice) {
      try { this.connectedDevice.cancelConnection(); } catch (e) {}
      this.connectedDevice = null;
    }
    
    if (this.manager) {
      try { this.manager.destroy(); } catch (e) {}
      this.manager = null;
    }
    
    this.setConnectionState(ConnectionState.Disconnected);
    this.connectionLock = false;
    this.pendingNotifications.clear();
    this.dataBuffer = Buffer.alloc(0);
  }
}

// Singleton
let instance: BluetoothService | null = null;

export function getBluetoothService(): BluetoothService {
  if (!instance) {
    instance = new BluetoothService();
  }
  return instance;
}

export function resetBluetoothService(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
