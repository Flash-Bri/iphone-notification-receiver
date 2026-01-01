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
