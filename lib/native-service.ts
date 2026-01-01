/**
 * TypeScript wrapper for the native ANCS foreground service module.
 * 
 * This module provides a clean interface to the native Android service
 * that handles BLE connection and ANCS notifications in the background.
 */

import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

// Native module interface
interface AncsServiceModuleInterface {
  startService(deviceMac: string, deviceName: string): Promise<boolean>;
  stopService(): Promise<boolean>;
  getStatus(): Promise<ServiceStatus>;
  checkPermissions(): Promise<PermissionStatus>;
  requestBatteryOptimization(): Promise<boolean>;
  openAppSettings(): Promise<boolean>;
  getRequiredPermissions(): Promise<string[]>;
}

export interface ServiceStatus {
  isRunning: boolean;
  isConnected: boolean;
  lastEventTime: number;
  lastError: string | null;
  notificationCount: number;
}

export interface PermissionStatus {
  bluetoothConnect: boolean;
  bluetoothScan: boolean;
  postNotifications: boolean;
  batteryOptimizationIgnored: boolean;
  allGranted: boolean;
}

// Get native module (only available on Android)
const AncsServiceModule: AncsServiceModuleInterface | null = 
  Platform.OS === 'android' ? NativeModules.AncsServiceModule : null;

/**
 * Check if the native service module is available.
 */
export function isNativeServiceAvailable(): boolean {
  return AncsServiceModule !== null;
}

/**
 * Start the ANCS foreground service.
 * 
 * @param deviceMac - The MAC address of the iPhone to connect to
 * @param deviceName - The display name of the iPhone
 * @returns Promise that resolves when service is started
 */
export async function startBackgroundService(
  deviceMac: string, 
  deviceName: string
): Promise<boolean> {
  if (!AncsServiceModule) {
    console.warn('[NativeService] Native module not available (not Android)');
    return false;
  }
  
  try {
    // Request permissions first
    const permissionsGranted = await requestAllPermissions();
    if (!permissionsGranted) {
      throw new Error('Required permissions not granted');
    }
    
    return await AncsServiceModule.startService(deviceMac, deviceName);
  } catch (error) {
    console.error('[NativeService] Failed to start service:', error);
    throw error;
  }
}

/**
 * Stop the ANCS foreground service.
 */
export async function stopBackgroundService(): Promise<boolean> {
  if (!AncsServiceModule) {
    return false;
  }
  
  try {
    return await AncsServiceModule.stopService();
  } catch (error) {
    console.error('[NativeService] Failed to stop service:', error);
    throw error;
  }
}

/**
 * Get the current status of the ANCS service.
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  if (!AncsServiceModule) {
    return {
      isRunning: false,
      isConnected: false,
      lastEventTime: 0,
      lastError: 'Native module not available',
      notificationCount: 0,
    };
  }
  
  try {
    return await AncsServiceModule.getStatus();
  } catch (error) {
    console.error('[NativeService] Failed to get status:', error);
    return {
      isRunning: false,
      isConnected: false,
      lastEventTime: 0,
      lastError: String(error),
      notificationCount: 0,
    };
  }
}

/**
 * Check permission status.
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  if (!AncsServiceModule) {
    return {
      bluetoothConnect: false,
      bluetoothScan: false,
      postNotifications: false,
      batteryOptimizationIgnored: false,
      allGranted: false,
    };
  }
  
  try {
    return await AncsServiceModule.checkPermissions();
  } catch (error) {
    console.error('[NativeService] Failed to check permissions:', error);
    throw error;
  }
}

/**
 * Request all required permissions for the service.
 */
export async function requestAllPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  
  try {
    type Permission = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];
    const permissions: Permission[] = [];
    
    // Android 12+ Bluetooth permissions
    if (Platform.Version >= 31) {
      permissions.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
      );
    }
    
    // Android 13+ notification permission
    if (Platform.Version >= 33) {
      permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    
    // Location permission (may be needed for BLE scanning)
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    
    if (permissions.length === 0) {
      return true;
    }
    
    const results = await PermissionsAndroid.requestMultiple(permissions as Permission[]);
    
    // Check if all permissions were granted
    const allGranted = Object.values(results).every(
      result => result === PermissionsAndroid.RESULTS.GRANTED
    );
    
    console.log('[NativeService] Permission results:', results);
    return allGranted;
    
  } catch (error) {
    console.error('[NativeService] Failed to request permissions:', error);
    return false;
  }
}

/**
 * Request battery optimization exemption.
 */
export async function requestBatteryOptimization(): Promise<boolean> {
  if (!AncsServiceModule) {
    return false;
  }
  
  try {
    return await AncsServiceModule.requestBatteryOptimization();
  } catch (error) {
    console.error('[NativeService] Failed to request battery optimization:', error);
    throw error;
  }
}

/**
 * Open app settings for manual permission management.
 */
export async function openAppSettings(): Promise<boolean> {
  if (!AncsServiceModule) {
    return false;
  }
  
  try {
    return await AncsServiceModule.openAppSettings();
  } catch (error) {
    console.error('[NativeService] Failed to open app settings:', error);
    throw error;
  }
}

/**
 * Format the last event time for display.
 */
export function formatLastEventTime(timestamp: number): string {
  if (timestamp === 0) {
    return 'Never';
  }
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Get a human-readable status message.
 */
export function getStatusMessage(status: ServiceStatus): string {
  if (!status.isRunning) {
    return 'Service stopped';
  }
  
  if (status.isConnected) {
    return `Connected • ${status.notificationCount} notifications`;
  }
  
  if (status.lastError) {
    return `Disconnected: ${status.lastError}`;
  }
  
  return 'Connecting...';
}
