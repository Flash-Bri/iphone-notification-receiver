# Native Android Foreground Service Implementation

## Overview

This document describes the native Android foreground service implementation for reliable background ANCS notification reception on INMO Air3 and similar Android devices.

## Problem

The React Native JavaScript runtime is suspended by Android when the app is backgrounded, causing:
- BLE characteristic monitoring callbacks to stop firing
- No notifications processed until app returns to foreground
- "Catch-up" behavior when app is reopened

## Solution

A native Android foreground service that:
1. Owns the BLE connection and ANCS subscriptions
2. Runs independently of the JS runtime
3. Posts Android system notifications directly via NotificationManager
4. Auto-reconnects when connection drops

---

## File Locations

### Native Android Files

| File | Purpose |
|------|---------|
| `android/app/src/main/java/space/manus/iphone/notification/receiver/AncsForegroundService.kt` | Main foreground service with startForeground, START_STICKY, device MAC persistence |
| `android/app/src/main/java/space/manus/iphone/notification/receiver/AncsBluetoothManager.kt` | Native BLE + ANCS protocol handler with CCCD subscription, Control Point requests, Data Source parsing |
| `android/app/src/main/java/space/manus/iphone/notification/receiver/AncsServiceModule.kt` | React Native bridge module with @ReactMethod functions |
| `android/app/src/main/java/space/manus/iphone/notification/receiver/AncsServicePackage.kt` | Package registration for React Native |
| `android/app/src/main/java/space/manus/iphone/notification/receiver/BootReceiver.kt` | Auto-start service on device boot |
| `android/app/src/main/AndroidManifest.xml` | Permissions and service declaration |

### TypeScript Files

| File | Purpose |
|------|---------|
| `lib/native-service.ts` | TypeScript wrapper for native module with permission handling |
| `app/(tabs)/settings.tsx` | UI for background service toggle and status display |

---

## Key Implementation Details

### 1. Foreground Service (AncsForegroundService.kt)

```kotlin
// Start with startForegroundService (Android 8+)
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    context.startForegroundService(intent)
} else {
    context.startService(intent)
}

// Call startForeground within 5 seconds
startForeground(NOTIFICATION_ID, notification)

// Use START_STICKY for auto-restart
override fun onStartCommand(...): Int {
    return START_STICKY
}

// Persist device MAC for reconnection
prefs.edit().putString(PREF_DEVICE_MAC, deviceMac).apply()
```

### 2. BLE Ownership (AncsBluetoothManager.kt)

```kotlin
// Single-source BLE ownership
// When service is running, JS layer must NOT connect

// CCCD subscription for both characteristics
enableNotifications(NOTIFICATION_SOURCE_UUID)
enableNotifications(DATA_SOURCE_UUID)

// Control Point requests with proper format
// Command: GetNotificationAttributes (0x00) + UID (4-byte LE) + attributes
val command = byteArrayOf(
    0x00,  // GetNotificationAttributes
    *uid.toByteArrayLE(),
    0x00,  // AppIdentifier
    0x01, 0x80, 0x00,  // Title (128 bytes max)
    0x02, 0x80, 0x00,  // Subtitle (128 bytes max)
    0x03, 0x00, 0x04,  // Message (1024 bytes max)
    0x05, 0x20, 0x00   // Date (32 bytes max)
)
```

### 3. Android Notifications (Direct via NotificationManager)

```kotlin
// Post notifications directly from native code
val notification = NotificationCompat.Builder(context, channelId)
    .setSmallIcon(R.drawable.ic_notification)
    .setContentTitle(title)
    .setContentText(message)
    .setPriority(NotificationCompat.PRIORITY_HIGH)
    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
    .build()

notificationManager.notify(notificationId, notification)
```

### 4. Auto-Reconnect

```kotlin
// On disconnect, attempt reconnection
private fun onDisconnected() {
    if (shouldAutoReconnect) {
        handler.postDelayed({
            connect(savedDeviceMac)
        }, RECONNECT_DELAY)
    }
}

// After reconnect: rediscover services + re-enable CCCDs
private fun onConnected() {
    discoverServices()
    enableNotifications(NOTIFICATION_SOURCE_UUID)
    enableNotifications(DATA_SOURCE_UUID)
}
```

---

## Permissions

### AndroidManifest.xml

```xml
<!-- Bluetooth -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />

<!-- Foreground Service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />

<!-- Notifications (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Battery Optimization -->
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

<!-- Boot Completed -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

### Service Declaration

```xml
<service
    android:name=".AncsForegroundService"
    android:foregroundServiceType="connectedDevice"
    android:stopWithTask="false" />
```

---

## UI Controls (Settings Screen)

1. **Run in Background Toggle** - Start/stop the foreground service
2. **Service Status Display** - Connected/Disconnected/Last event/Error
3. **Auto-start on Boot Toggle** - Enable service auto-start
4. **Battery Optimization Button** - Request exemption via ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
5. **Air3 Guidance** - Instructions for INMO Air3 power manager whitelisting

---

## Test Steps

### Validation Test

1. Install APK on INMO Air3
2. Open app and connect to iPhone from Home screen
3. Go to Settings and enable "Run in Background"
4. Verify persistent "Listening for iPhone notifications" notification appears
5. Tap "Battery Optimization" and disable for this app
6. Lock screen and wait 5+ minutes
7. Send text message to iPhone from another device
8. **Expected**: Android notification appears on lockscreen without opening app

### Debug Verification

1. Enable debug logging in Debug tab
2. Connect and receive a notification
3. Verify logs show:
   - Notification Source bytes received
   - Control Point request bytes sent
   - Data Source bytes received
   - Parsed attributes (title, message, app)

---

## Version History

- **1.6.0**: Added native Android foreground service for background notification reception
- **1.5.0**: Production ANCS implementation with correct attribute fetching
- **1.4.0**: Critical bug fixes for notifications and connection stability
- **1.3.0**: Stability fixes and orange logo
- **1.2.0**: Full notification details and connection monitoring
- **1.1.0**: Device selection modal
- **1.0.0**: Initial release
