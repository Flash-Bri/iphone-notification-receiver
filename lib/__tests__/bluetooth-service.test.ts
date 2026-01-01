import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventID, CategoryID } from "../bluetooth-service";

// Mock react-native-ble-plx
vi.mock("react-native-ble-plx", () => ({
  BleManager: vi.fn().mockImplementation(() => ({
    state: vi.fn().mockResolvedValue("PoweredOn"),
    startDeviceScan: vi.fn(),
    stopDeviceScan: vi.fn(),
    destroy: vi.fn(),
    onStateChange: vi.fn((callback) => {
      callback("PoweredOn");
      return { remove: vi.fn() };
    }),
  })),
}));

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock react-native Platform and AppState
vi.mock("react-native", () => ({
  Platform: {
    OS: "android",
  },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: "android.permission.BLUETOOTH_SCAN",
      BLUETOOTH_CONNECT: "android.permission.BLUETOOTH_CONNECT",
      ACCESS_FINE_LOCATION: "android.permission.ACCESS_FINE_LOCATION",
    },
    requestMultiple: vi.fn().mockResolvedValue({
      "android.permission.BLUETOOTH_SCAN": "granted",
      "android.permission.BLUETOOTH_CONNECT": "granted",
      "android.permission.ACCESS_FINE_LOCATION": "granted",
    }),
  },
}));

// Import BluetoothService after mocks are set up
const { BluetoothService, getBluetoothService } = await import("../bluetooth-service");

describe("BluetoothService", () => {
  let service: InstanceType<typeof BluetoothService>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton
    (globalThis as any).__bluetoothServiceInstance = undefined;
    service = new BluetoothService();
  });

  it("should initialize successfully when Bluetooth is powered on", async () => {
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it("should handle connection state correctly", () => {
    expect(service.isConnected()).toBe(false);
    expect(service.getConnectedDeviceName()).toBeNull();
  });

  it("should report not connected initially", () => {
    expect(service.isConnected()).toBe(false);
  });

  it("should return null for device name when not connected", () => {
    expect(service.getConnectedDeviceName()).toBeNull();
  });

  it("should register notification callback", () => {
    const callback = vi.fn();
    service.onNotification(callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it("should register connection change callback", () => {
    const callback = vi.fn();
    service.onConnectionChange(callback);
    expect(callback).not.toHaveBeenCalled();
  });

  it("should return singleton instance", () => {
    const instance1 = getBluetoothService();
    const instance2 = getBluetoothService();
    expect(instance1).toBe(instance2);
  });

  it("should set debug enabled state", () => {
    service.setDebugEnabled(true);
    service.setDebugEnabled(false);
    // No error means success
    expect(true).toBe(true);
  });
});

describe("ANCS Constants", () => {
  it("should have correct EventID values", () => {
    expect(EventID.Added).toBe(0);
    expect(EventID.Modified).toBe(1);
    expect(EventID.Removed).toBe(2);
  });

  it("should have correct CategoryID values", () => {
    expect(CategoryID.Other).toBe(0);
    expect(CategoryID.IncomingCall).toBe(1);
    expect(CategoryID.Email).toBe(6);
    expect(CategoryID.Entertainment).toBe(11);
  });
});
