import { BleManager, Device, Characteristic, Subscription } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { Platform, AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ANCS Service and Characteristic UUIDs
const ANCS_SERVICE_UUID = "7905F431-B5CE-4E99-A40F-4B1E122D00D0";
const NOTIFICATION_SOURCE_UUID = "9FBF120D-6301-42D9-8C58-25E699A21DBD";
const CONTROL_POINT_UUID = "69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9";
const DATA_SOURCE_UUID = "22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB";

// ANCS Command IDs
const CMD_GET_NOTIFICATION_ATTRIBUTES = 0x00;
const CMD_GET_APP_ATTRIBUTES = 0x01;
const CMD_PERFORM_NOTIFICATION_ACTION = 0x02;

// ANCS Notification Attribute IDs
const ATTR_APP_IDENTIFIER = 0x00;
const ATTR_TITLE = 0x01;
const ATTR_SUBTITLE = 0x02;
const ATTR_MESSAGE = 0x03;
const ATTR_MESSAGE_SIZE = 0x04;
const ATTR_DATE = 0x05;
const ATTR_POSITIVE_ACTION_LABEL = 0x06;
const ATTR_NEGATIVE_ACTION_LABEL = 0x07;

// ANCS App Attribute IDs
const APP_ATTR_DISPLAY_NAME = 0x00;

// Storage keys
const LAST_DEVICE_KEY = "@ancs_last_device_id";
const APP_NAME_CACHE_KEY = "@ancs_app_name_cache";

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
  appDisplayName?: string;
  title?: string;
  subtitle?: string;
  message?: string;
  date?: string;
}

export interface DebugLogEntry {
  timestamp: number;
  uid: number;
  type: "notification_source" | "control_point_request" | "data_source_response" | "parsed_attributes" | "error";
  rawBytes?: string;
  parsedData?: any;
  error?: string;
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

// Request queue item
interface AttributeRequest {
  uid: number;
  notification: ANCSNotification;
  resolve: (notification: ANCSNotification) => void;
  reject: (error: Error) => void;
  retryCount: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export class BluetoothService {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private notificationSourceSubscription: Subscription | null = null;
  private dataSourceSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private appStateSubscription: any = null;
  
  private onNotificationCallback: ((notification: ANCSNotification) => void) | null = null;
  private onConnectionChangeCallback: ((connected: boolean, deviceName?: string) => void) | null = null;
  private onDebugLogCallback: ((entry: DebugLogEntry) => void) | null = null;
  
  // Single-flight request queue
  private requestQueue: AttributeRequest[] = [];
  private currentRequest: AttributeRequest | null = null;
  private dataSourceBuffer: Buffer = Buffer.alloc(0);
  private expectedResponseUid: number | null = null;
  
  // App name cache
  private appNameCache: Map<string, string> = new Map();
  
  // Connection state
  private isConnecting = false;
  private lastConnectedDeviceId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  // Debug mode
  private debugEnabled = false;

  constructor() {
    this.loadAppNameCache();
    this.loadLastDeviceId();
    this.setupAppStateListener();
  }

  private getManager(): BleManager {
    if (!this.manager) {
      this.manager = new BleManager();
    }
    return this.manager;
  }

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener("change", this.handleAppStateChange.bind(this));
  }

  private handleAppStateChange(nextAppState: AppStateStatus): void {
    if (nextAppState === "active" && !this.connectedDevice && this.lastConnectedDeviceId) {
      console.log("[BLE] App became active, attempting reconnect...");
      this.attemptReconnect();
    }
  }

  private async loadAppNameCache(): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem(APP_NAME_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        this.appNameCache = new Map(Object.entries(parsed));
        console.log("[BLE] Loaded app name cache:", this.appNameCache.size, "entries");
      }
    } catch (e) {
      console.error("[BLE] Failed to load app name cache:", e);
    }
  }

  private async saveAppNameCache(): Promise<void> {
    try {
      const obj = Object.fromEntries(this.appNameCache);
      await AsyncStorage.setItem(APP_NAME_CACHE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.error("[BLE] Failed to save app name cache:", e);
    }
  }

  private async loadLastDeviceId(): Promise<void> {
    try {
      this.lastConnectedDeviceId = await AsyncStorage.getItem(LAST_DEVICE_KEY);
      console.log("[BLE] Last device ID:", this.lastConnectedDeviceId);
    } catch (e) {
      console.error("[BLE] Failed to load last device ID:", e);
    }
  }

  private async saveLastDeviceId(deviceId: string): Promise<void> {
    try {
      this.lastConnectedDeviceId = deviceId;
      await AsyncStorage.setItem(LAST_DEVICE_KEY, deviceId);
    } catch (e) {
      console.error("[BLE] Failed to save last device ID:", e);
    }
  }

  // Debug logging
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    console.log("[BLE] Debug mode:", enabled ? "enabled" : "disabled");
  }

  onDebugLog(callback: (entry: DebugLogEntry) => void): void {
    this.onDebugLogCallback = callback;
  }

  private logDebug(entry: Omit<DebugLogEntry, "timestamp">): void {
    if (!this.debugEnabled) return;
    const fullEntry: DebugLogEntry = { ...entry, timestamp: Date.now() };
    console.log("[BLE DEBUG]", fullEntry);
    this.onDebugLogCallback?.(fullEntry);
  }

  async initialize(): Promise<void> {
    if (Platform.OS === "web") {
      console.log("[BLE] Web platform - Bluetooth not supported");
      return;
    }

    try {
      const manager = this.getManager();
      
      // Wait for Bluetooth to be ready
      const state = await manager.state();
      console.log("[BLE] Bluetooth state:", state);
      
      if (state !== "PoweredOn") {
        // Wait for state change
        await new Promise<void>((resolve, reject) => {
          const subscription = manager.onStateChange((newState) => {
            console.log("[BLE] State changed to:", newState);
            if (newState === "PoweredOn") {
              subscription.remove();
              resolve();
            } else if (newState === "PoweredOff" || newState === "Unsupported") {
              subscription.remove();
              reject(new Error(`Bluetooth is ${newState}`));
            }
          }, true);
          
          // Timeout after 10 seconds
          setTimeout(() => {
            subscription.remove();
            reject(new Error("Bluetooth initialization timeout"));
          }, 10000);
        });
      }
      
      console.log("[BLE] Initialized successfully");
    } catch (error) {
      console.error("[BLE] Initialization error:", error);
      throw error;
    }
  }

  onNotification(callback: (notification: ANCSNotification) => void): void {
    this.onNotificationCallback = callback;
  }

  onConnectionChange(callback: (connected: boolean, deviceName?: string) => void): void {
    this.onConnectionChangeCallback = callback;
  }

  async discoverDevices(): Promise<Device[]> {
    console.log("[BLE] Starting device discovery...");
    
    return new Promise((resolve) => {
      const discoveredDevices: Map<string, Device> = new Map();
      
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

      try {
        this.getManager().startDeviceScan(null, { allowDuplicates: false }, handleScanResult);
      } catch (e) {
        console.error("[BLE] Failed to start scan:", e);
        resolve([]);
        return;
      }

      setTimeout(() => {
        try {
          this.getManager().stopDeviceScan();
        } catch (e) {
          console.error("[BLE] Failed to stop scan:", e);
        }
        const devices = Array.from(discoveredDevices.values());
        console.log("[BLE] Scan complete. Found", devices.length, "devices");
        resolve(devices);
      }, 5000);
    });
  }

  async connectToDevice(device: Device): Promise<void> {
    if (this.isConnecting) {
      console.log("[BLE] Already connecting, ignoring request");
      return;
    }

    this.isConnecting = true;
    console.log("[BLE] Connecting to device:", device.name || device.id);

    try {
      // Stop any ongoing scan
      try {
        this.getManager().stopDeviceScan();
      } catch (e) {
        // Ignore
      }

      // Disconnect existing connection
      if (this.connectedDevice) {
        await this.cleanupConnection();
      }

      // Connect to device
      const connectedDevice = await device.connect({ timeout: 10000 });
      console.log("[BLE] Connected, discovering services...");

      // Discover services and characteristics
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log("[BLE] Services discovered");

      this.connectedDevice = connectedDevice;
      await this.saveLastDeviceId(device.id);
      this.reconnectAttempts = 0;

      // Setup ANCS subscriptions
      await this.setupANCSSubscriptions(connectedDevice);

      // Monitor disconnection
      this.disconnectSubscription = connectedDevice.onDisconnected((error) => {
        console.log("[BLE] Device disconnected:", error?.message || "No error");
        this.handleDisconnect();
      });

      this.onConnectionChangeCallback?.(true, device.name || "iPhone");
      console.log("[BLE] Connection setup complete");

    } catch (error: any) {
      console.error("[BLE] Connection error:", error);
      this.logDebug({ uid: 0, type: "error", error: `Connection failed: ${error.message}` });
      await this.cleanupConnection();
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async setupANCSSubscriptions(device: Device): Promise<void> {
    console.log("[BLE] Setting up ANCS subscriptions...");

    try {
      // IMPORTANT: Subscribe to Data Source FIRST before Notification Source
      // This is required by ANCS spec - Data Source must be ready to receive responses
      console.log("[BLE] Subscribing to Data Source characteristic...");
      this.dataSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        DATA_SOURCE_UUID,
        this.handleDataSourceNotification.bind(this)
      );

      // Small delay to ensure Data Source subscription is active
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now subscribe to Notification Source
      console.log("[BLE] Subscribing to Notification Source characteristic...");
      this.notificationSourceSubscription = device.monitorCharacteristicForService(
        ANCS_SERVICE_UUID,
        NOTIFICATION_SOURCE_UUID,
        this.handleNotificationSourceNotification.bind(this)
      );

      console.log("[BLE] ANCS subscriptions active");
      
      // NOTE: We do NOT write anything to Control Point here.
      // Control Point is ONLY used to request notification attributes AFTER receiving a notification.
      // CCCD subscription (monitorCharacteristicForService) automatically enables notifications.

    } catch (error: any) {
      console.error("[BLE] Failed to setup ANCS subscriptions:", error);
      this.logDebug({ uid: 0, type: "error", error: `ANCS setup failed: ${error.message}` });
      throw error;
    }
  }

  private handleNotificationSourceNotification(error: any, characteristic: Characteristic | null): void {
    if (error) {
      console.error("[BLE] Notification Source error:", error);
      this.logDebug({ uid: 0, type: "error", error: `Notification Source error: ${error.message}` });
      return;
    }

    if (!characteristic?.value) {
      return;
    }

    try {
      const data = Buffer.from(characteristic.value, "base64");
      
      // Log raw bytes
      this.logDebug({
        uid: data.length >= 8 ? data.readUInt32LE(4) : 0,
        type: "notification_source",
        rawBytes: data.toString("hex"),
      });

      // ANCS Notification Source format (8 bytes):
      // [0] EventID (1 byte)
      // [1] EventFlags (1 byte)
      // [2] CategoryID (1 byte)
      // [3] CategoryCount (1 byte)
      // [4-7] NotificationUID (4 bytes, little-endian)

      if (data.length < 8) {
        console.warn("[BLE] Invalid notification data length:", data.length);
        return;
      }

      const eventId = data[0];
      const eventFlags = data[1];
      const categoryId = data[2];
      const categoryCount = data[3];
      const notificationUid = data.readUInt32LE(4);

      console.log(`[BLE] Notification Source: EventID=${eventId}, CategoryID=${categoryId}, UID=${notificationUid}`);

      // Only process Added and Modified events
      if (eventId === EventID.Removed) {
        console.log("[BLE] Notification removed, ignoring");
        return;
      }

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

      // Queue attribute request for this notification
      this.queueAttributeRequest(notification);

    } catch (error: any) {
      console.error("[BLE] Error parsing notification source:", error);
      this.logDebug({ uid: 0, type: "error", error: `Parse error: ${error.message}` });
    }
  }

  private handleDataSourceNotification(error: any, characteristic: Characteristic | null): void {
    if (error) {
      console.error("[BLE] Data Source error:", error);
      this.logDebug({ uid: 0, type: "error", error: `Data Source error: ${error.message}` });
      return;
    }

    if (!characteristic?.value) {
      return;
    }

    try {
      const data = Buffer.from(characteristic.value, "base64");
      
      // Log raw bytes
      this.logDebug({
        uid: this.expectedResponseUid || 0,
        type: "data_source_response",
        rawBytes: data.toString("hex"),
      });

      // Append to buffer for multi-packet assembly
      this.dataSourceBuffer = Buffer.concat([this.dataSourceBuffer, data]);

      // Try to parse the response
      this.tryParseDataSourceResponse();

    } catch (error: any) {
      console.error("[BLE] Error handling data source:", error);
      this.logDebug({ uid: this.expectedResponseUid || 0, type: "error", error: `Data source error: ${error.message}` });
    }
  }

  private queueAttributeRequest(notification: ANCSNotification): void {
    console.log(`[BLE] Queueing attribute request for UID ${notification.notificationUid}`);

    const request: AttributeRequest = {
      uid: notification.notificationUid,
      notification,
      resolve: () => {},
      reject: () => {},
      retryCount: 0,
    };

    // Create promise for this request
    const promise = new Promise<ANCSNotification>((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });

    this.requestQueue.push(request);

    // Process queue if not already processing
    if (!this.currentRequest) {
      this.processNextRequest();
    }

    // Handle the result
    promise
      .then((enrichedNotification) => {
        console.log(`[BLE] Notification enriched:`, enrichedNotification);
        this.onNotificationCallback?.(enrichedNotification);
      })
      .catch((error) => {
        console.error(`[BLE] Failed to enrich notification:`, error);
        // Still send the notification with basic info
        this.onNotificationCallback?.(notification);
      });
  }

  private async processNextRequest(): Promise<void> {
    if (this.currentRequest || this.requestQueue.length === 0) {
      return;
    }

    this.currentRequest = this.requestQueue.shift()!;
    const { uid, notification } = this.currentRequest;

    console.log(`[BLE] Processing attribute request for UID ${uid}`);

    // Reset buffer and expected UID
    this.dataSourceBuffer = Buffer.alloc(0);
    this.expectedResponseUid = uid;

    // Set timeout for this request (5 seconds)
    this.currentRequest.timeoutId = setTimeout(() => {
      console.warn(`[BLE] Attribute request timeout for UID ${uid}`);
      this.handleRequestTimeout();
    }, 5000);

    try {
      await this.sendGetNotificationAttributesCommand(uid);
    } catch (error: any) {
      console.error(`[BLE] Failed to send attribute request:`, error);
      this.handleRequestError(error);
    }
  }

  private async sendGetNotificationAttributesCommand(uid: number): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error("Not connected");
    }

    // Build GetNotificationAttributes command
    // Format: CommandID (1) + NotificationUID (4, LE) + AttributeIDs with lengths
    
    // Attributes we want:
    // - AppIdentifier (0x00) - no length
    // - Title (0x01) - max length 128
    // - Subtitle (0x02) - max length 128  
    // - Message (0x03) - max length 1024
    // - Date (0x05) - max length 32

    const command = Buffer.alloc(1 + 4 + 1 + 3 + 3 + 3 + 3);
    let offset = 0;

    // Command ID
    command.writeUInt8(CMD_GET_NOTIFICATION_ATTRIBUTES, offset);
    offset += 1;

    // Notification UID (4 bytes, little-endian)
    command.writeUInt32LE(uid, offset);
    offset += 4;

    // AppIdentifier (no length parameter)
    command.writeUInt8(ATTR_APP_IDENTIFIER, offset);
    offset += 1;

    // Title with max length 128
    command.writeUInt8(ATTR_TITLE, offset);
    offset += 1;
    command.writeUInt16LE(128, offset);
    offset += 2;

    // Subtitle with max length 128
    command.writeUInt8(ATTR_SUBTITLE, offset);
    offset += 1;
    command.writeUInt16LE(128, offset);
    offset += 2;

    // Message with max length 1024
    command.writeUInt8(ATTR_MESSAGE, offset);
    offset += 1;
    command.writeUInt16LE(1024, offset);
    offset += 2;

    // Date with max length 32
    command.writeUInt8(ATTR_DATE, offset);
    offset += 1;
    command.writeUInt16LE(32, offset);
    offset += 2;

    // Log the command
    this.logDebug({
      uid,
      type: "control_point_request",
      rawBytes: command.toString("hex"),
    });

    console.log(`[BLE] Sending GetNotificationAttributes for UID ${uid}, command: ${command.toString("hex")}`);

    // Write to Control Point
    await this.connectedDevice.writeCharacteristicWithResponseForService(
      ANCS_SERVICE_UUID,
      CONTROL_POINT_UUID,
      command.toString("base64")
    );

    console.log(`[BLE] GetNotificationAttributes command sent`);
  }

  private tryParseDataSourceResponse(): void {
    if (!this.currentRequest || this.dataSourceBuffer.length < 5) {
      return;
    }

    try {
      // Data Source response format:
      // CommandID (1) + NotificationUID (4, LE) + Attribute data...
      
      const commandId = this.dataSourceBuffer.readUInt8(0);
      const uid = this.dataSourceBuffer.readUInt32LE(1);

      if (commandId !== CMD_GET_NOTIFICATION_ATTRIBUTES) {
        console.warn(`[BLE] Unexpected command ID in response: ${commandId}`);
        return;
      }

      if (uid !== this.expectedResponseUid) {
        console.warn(`[BLE] UID mismatch: expected ${this.expectedResponseUid}, got ${uid}`);
        return;
      }

      // Try to parse all attributes
      const attributes = this.parseAttributes(this.dataSourceBuffer.slice(5));
      
      if (attributes === null) {
        // Need more data
        console.log(`[BLE] Waiting for more data packets...`);
        return;
      }

      // Successfully parsed all attributes
      console.log(`[BLE] Parsed attributes for UID ${uid}:`, attributes);

      this.logDebug({
        uid,
        type: "parsed_attributes",
        parsedData: attributes,
      });

      // Enrich the notification
      const enrichedNotification: ANCSNotification = {
        ...this.currentRequest.notification,
        appIdentifier: attributes.appIdentifier,
        title: attributes.title,
        subtitle: attributes.subtitle,
        message: attributes.message,
        date: attributes.date,
      };

      // Look up app display name
      if (attributes.appIdentifier) {
        const cachedName = this.appNameCache.get(attributes.appIdentifier);
        if (cachedName) {
          enrichedNotification.appDisplayName = cachedName;
        } else {
          // Queue app attribute request (async, don't wait)
          this.requestAppDisplayName(attributes.appIdentifier);
        }
      }

      // Clear timeout and resolve
      if (this.currentRequest.timeoutId) {
        clearTimeout(this.currentRequest.timeoutId);
      }
      this.currentRequest.resolve(enrichedNotification);
      this.currentRequest = null;
      this.dataSourceBuffer = Buffer.alloc(0);
      this.expectedResponseUid = null;

      // Process next request
      this.processNextRequest();

    } catch (error: any) {
      console.error(`[BLE] Error parsing data source response:`, error);
      // Don't fail yet - might need more data
    }
  }

  private parseAttributes(data: Buffer): { appIdentifier?: string; title?: string; subtitle?: string; message?: string; date?: string } | null {
    const attributes: { appIdentifier?: string; title?: string; subtitle?: string; message?: string; date?: string } = {};
    let offset = 0;
    let parsedCount = 0;
    const expectedAttributes = 5; // AppIdentifier, Title, Subtitle, Message, Date

    while (offset < data.length && parsedCount < expectedAttributes) {
      if (offset + 1 > data.length) {
        // Need more data for attribute ID
        return null;
      }

      const attrId = data.readUInt8(offset);
      offset += 1;

      if (offset + 2 > data.length) {
        // Need more data for length
        return null;
      }

      const attrLength = data.readUInt16LE(offset);
      offset += 2;

      if (offset + attrLength > data.length) {
        // Need more data for value
        return null;
      }

      const attrValue = data.slice(offset, offset + attrLength).toString("utf8");
      offset += attrLength;
      parsedCount++;

      switch (attrId) {
        case ATTR_APP_IDENTIFIER:
          attributes.appIdentifier = attrValue;
          break;
        case ATTR_TITLE:
          attributes.title = attrValue;
          break;
        case ATTR_SUBTITLE:
          attributes.subtitle = attrValue;
          break;
        case ATTR_MESSAGE:
          attributes.message = attrValue;
          break;
        case ATTR_DATE:
          attributes.date = attrValue;
          break;
      }
    }

    // Check if we have all expected attributes
    if (parsedCount < expectedAttributes && offset >= data.length) {
      // We've consumed all data but don't have all attributes - need more
      return null;
    }

    return attributes;
  }

  private async requestAppDisplayName(appIdentifier: string): Promise<void> {
    if (!this.connectedDevice || this.appNameCache.has(appIdentifier)) {
      return;
    }

    try {
      // Build GetAppAttributes command
      // Format: CommandID (1) + AppIdentifier (null-terminated string) + AttributeID (1)
      const appIdBuffer = Buffer.from(appIdentifier + "\0", "utf8");
      const command = Buffer.alloc(1 + appIdBuffer.length + 1);
      
      command.writeUInt8(CMD_GET_APP_ATTRIBUTES, 0);
      appIdBuffer.copy(command, 1);
      command.writeUInt8(APP_ATTR_DISPLAY_NAME, 1 + appIdBuffer.length);

      console.log(`[BLE] Requesting app display name for: ${appIdentifier}`);

      await this.connectedDevice.writeCharacteristicWithResponseForService(
        ANCS_SERVICE_UUID,
        CONTROL_POINT_UUID,
        command.toString("base64")
      );

      // Note: Response will come via Data Source, but we handle it separately
      // For now, we'll use the bundle ID as fallback

    } catch (error) {
      console.error(`[BLE] Failed to request app display name:`, error);
    }
  }

  private handleRequestTimeout(): void {
    if (!this.currentRequest) return;

    const { uid, notification, retryCount } = this.currentRequest;
    
    if (retryCount < 2) {
      // Retry
      console.log(`[BLE] Retrying attribute request for UID ${uid} (attempt ${retryCount + 2})`);
      this.currentRequest.retryCount++;
      this.dataSourceBuffer = Buffer.alloc(0);
      
      this.sendGetNotificationAttributesCommand(uid).catch((error) => {
        this.handleRequestError(error);
      });
    } else {
      // Max retries reached, resolve with basic notification
      console.warn(`[BLE] Max retries reached for UID ${uid}, using basic notification`);
      
      // Add fallback message
      const fallbackNotification: ANCSNotification = {
        ...notification,
        message: "Content hidden by iOS settings",
      };
      
      this.currentRequest.resolve(fallbackNotification);
      this.currentRequest = null;
      this.dataSourceBuffer = Buffer.alloc(0);
      this.expectedResponseUid = null;
      
      this.processNextRequest();
    }
  }

  private handleRequestError(error: Error): void {
    if (!this.currentRequest) return;

    if (this.currentRequest.timeoutId) {
      clearTimeout(this.currentRequest.timeoutId);
    }

    this.currentRequest.reject(error);
    this.currentRequest = null;
    this.dataSourceBuffer = Buffer.alloc(0);
    this.expectedResponseUid = null;

    this.processNextRequest();
  }

  private handleDisconnect(): void {
    console.log("[BLE] Handling disconnect...");
    this.cleanupConnection();
    this.onConnectionChangeCallback?.(false);

    // Attempt reconnect if we have a last device ID
    if (this.lastConnectedDeviceId && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`[BLE] Will attempt reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      setTimeout(() => {
        this.attemptReconnect();
      }, delay);
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.lastConnectedDeviceId || this.isConnecting || this.connectedDevice) {
      return;
    }

    console.log(`[BLE] Attempting reconnect to ${this.lastConnectedDeviceId}...`);

    try {
      const devices = await this.discoverDevices();
      const targetDevice = devices.find(d => d.id === this.lastConnectedDeviceId);
      
      if (targetDevice) {
        await this.connectToDevice(targetDevice);
      } else {
        console.log("[BLE] Last device not found in scan");
      }
    } catch (error) {
      console.error("[BLE] Reconnect failed:", error);
    }
  }

  private async cleanupConnection(): Promise<void> {
    console.log("[BLE] Cleaning up connection...");

    // Cancel current request
    if (this.currentRequest) {
      if (this.currentRequest.timeoutId) {
        clearTimeout(this.currentRequest.timeoutId);
      }
      this.currentRequest.reject(new Error("Connection lost"));
      this.currentRequest = null;
    }

    // Clear request queue
    this.requestQueue.forEach(req => {
      if (req.timeoutId) clearTimeout(req.timeoutId);
      req.reject(new Error("Connection lost"));
    });
    this.requestQueue = [];

    // Remove subscriptions
    if (this.notificationSourceSubscription) {
      this.notificationSourceSubscription.remove();
      this.notificationSourceSubscription = null;
    }
    if (this.dataSourceSubscription) {
      this.dataSourceSubscription.remove();
      this.dataSourceSubscription = null;
    }
    if (this.disconnectSubscription) {
      this.disconnectSubscription.remove();
      this.disconnectSubscription = null;
    }

    // Disconnect device
    if (this.connectedDevice) {
      try {
        await this.connectedDevice.cancelConnection();
      } catch (e) {
        // Ignore
      }
      this.connectedDevice = null;
    }

    // Reset state
    this.dataSourceBuffer = Buffer.alloc(0);
    this.expectedResponseUid = null;
    this.isConnecting = false;
  }

  async disconnect(): Promise<void> {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
    await this.cleanupConnection();
    this.onConnectionChangeCallback?.(false);
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getIsConnecting(): boolean {
    return this.isConnecting;
  }

  getConnectedDeviceName(): string | null {
    return this.connectedDevice?.name || null;
  }

  getLastConnectedDeviceId(): string | null {
    return this.lastConnectedDeviceId;
  }

  destroy(): void {
    console.log("[BLE] Destroying service...");
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.cleanupConnection();

    if (this.manager) {
      this.manager.destroy();
      this.manager = null;
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

export function resetBluetoothService(): void {
  if (bluetoothServiceInstance) {
    bluetoothServiceInstance.destroy();
    bluetoothServiceInstance = null;
  }
}
