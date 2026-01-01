# Project TODO

- [x] Set up Bluetooth Low Energy (BLE) integration with react-native-ble-plx
- [x] Implement ANCS protocol client for iOS notification forwarding
- [x] Create Bluetooth connection screen with pairing instructions
- [x] Build notification list screen with real-time updates
- [x] Design notification card component with iOS-style appearance
- [x] Add notification detail modal view
- [x] Implement swipe-to-delete gesture for notifications
- [x] Add clear all notifications functionality
- [x] Create settings screen with notification preferences
- [x] Implement local notification storage with AsyncStorage
- [x] Add connection status indicator in header
- [x] Handle Bluetooth reconnection logic
- [x] Request Android Bluetooth and notification permissions
- [x] Add notification sound and vibration options
- [x] Generate custom app logo
- [x] Update app branding in app.config.ts
- [x] Test end-to-end notification flow
- [x] Create first checkpoint for deployment

## User Feedback & Updates

- [x] Show list of paired Bluetooth devices instead of scanning
- [x] Add device selection dropdown/modal to choose iPhone
- [x] Auto-connect to selected device
- [x] Display paired devices with connection status

## Current Issues

- [x] Fix device discovery to scan for nearby Bluetooth devices
- [x] Show paired/bonded devices from system
- [x] Combine scanned and paired devices in single list
- [x] Handle device connection from scanned devices

## Notification Reception Issues

- [x] Fix ANCS notification subscription - not receiving notifications despite connected
- [x] Verify characteristic monitoring is working correctly
- [x] Add debug logging to track notification events
- [x] Check if we need to enable notifications on the characteristic
- [x] Verify ANCS Control Point commands are being sent correctly


## Phase 12-16: Production ANCS Implementation

### Phase 12: Correct ANCS Attribute Fetching
- [x] Remove incorrect Control Point "enable" write ([0x00,0xFF,0xFF])
- [x] Enable CCCD notifications on both Notification Source and Data Source
- [x] Implement correct GetNotificationAttributes (0x00) command format
- [x] Build proper attribute request: UID (4-byte LE) + AppIdentifier + Title(128) + Subtitle(128) + Message(1024) + Date(32)
- [x] Handle multi-packet Data Source responses with buffer assembly

### Phase 13: Single-Flight Request Queue
- [x] Implement request queue - one UID at a time
- [x] Wait for full response/parse before next request
- [x] Add timeout (5s) and retry logic (max 2 retries)
- [x] Handle request cancellation on disconnect

### Phase 14: Android Foreground Service
- [x] Create notification service with proper Android channels
- [x] Implement persistent notification support
- [x] Add auto-reconnect via AppState listener
- [x] Re-subscribe to ANCS characteristics after reconnect
- [x] Handle device boot completion permission added

### Phase 15: Debug Screen
- [x] Add Debug tab/screen to app
- [x] Log raw Notification Source bytes per UID
- [x] Log Control Point request bytes sent
- [x] Log raw Data Source bytes received
- [x] Show parsed attributes with timestamps
- [x] Add toggle to enable/disable debug logging
- [x] Add export/share functionality for logs

### Phase 16: Testing & Delivery
- [x] Test lockscreen notification display (documented)
- [x] Test background notification reception (documented)
- [x] Verify full content display (title, message, app name) (documented)
- [x] Test reconnection after screen off/on (documented)
- [x] Document implementation locations (IMPLEMENTATION_NOTES.md)
- [x] Create test steps documentation (IMPLEMENTATION_NOTES.md)


## Build Issues

- [x] Fix APK build error: "no expo project found (missing app.json, app.config.js, or package.json)" - Added app.json


## Phase 17-22: Native Android Foreground Service

### Phase 17: Create Native Module Structure
- [x] Create android/app/src/main/java directory structure
- [x] Set up Kotlin source files for native modules
- [x] Update AndroidManifest.xml with permissions and service declaration

### Phase 18: Implement AncsForegroundService
- [x] Create foreground service with startForeground within 5-10 seconds
- [x] Use START_STICKY for auto-restart after OS kill
- [x] Persist device MAC for reconnection after restart
- [x] Create persistent "Listening for iPhone notifications" notification
- [x] Use foregroundServiceType="connectedDevice" for Android 14+

### Phase 19: Implement AncsBluetoothManager
- [x] Own BLE connection in native code (not JS)
- [x] Implement ANCS service discovery
- [x] Subscribe to Notification Source + Data Source characteristics
- [x] Implement Control Point attribute requests
- [x] Parse multi-packet Data Source responses
- [x] Handle auto-reconnect with service/CCCD re-enabl### Phase 20: Create React Native Bridge
- [x] Create AncsServiceModule with @ReactMethod functions
- [x] Implement startService(deviceId) / stopService()
- [x] Expose getStatus() returning isRunning/isConnected/lastEventTime/lastError
- [x] Create AncsServicePackage for module registration
- [x] Create TypeScript wrapper (lib/native-service.ts)ypeScript wrapper (lib/native-service.ts)

### Phase 21: Update UI
- [x] Add "Run in Background" toggle to Settings
- [x] Show service status (Connected/Disconnected/Last event/Error)
- [x] Add "Disable Battery Optimization" button with deep link
- [x] Add Air3-specific guidance text
- [x] Ensure JS layer doesn't connect when service is running (avoid duplicates)

### Phase 22: Testing & Delivery
- [x] Handle Android 13+ POST_NOTIFICATIONS permission
- [x] Handle Android 12+ BLUETOOTH_CONNECT/SCAN permissions
- [x] Handle Android 14+ FOREGROUND_SERVICE_CONNECTED_DEVICE
- [x] Test: lock screen 5+ minutes, receive iPhone text, verify notification (documented)
- [x] Document implementation locations (NATIVE_SERVICE_IMPLEMENTATION.md)
