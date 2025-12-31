import { describe, it, expect, beforeEach, vi } from "vitest";
import { BluetoothService, EventID, CategoryID } from "../bluetooth-service";

// Mock react-native-ble-plx
vi.mock("react-native-ble-plx", () => ({
  BleManager: vi.fn().mockImplementation(() => ({
    state: vi.fn().mockResolvedValue("PoweredOn"),
    startDeviceScan: vi.fn(),
    stopDeviceScan: vi.fn(),
    destroy: vi.fn(),
  })),
}));

// Mock react-native Platform
vi.mock("react-native", () => ({
  Platform: {
    OS: "android",
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

describe("BluetoothService", () => {
  let service: BluetoothService;

  beforeEach(() => {
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
