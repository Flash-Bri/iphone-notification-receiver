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

## Critical Issues

- [x] App crashes when selecting iPhone - likely Control Point write issue
- [x] Fix Control Point write to not crash on connection
- [x] Make Control Point write optional/non-blocking

## Phase 8: Full Notification Mirroring

- [ ] Save last connected device ID to AsyncStorage for auto-reconnection
- [ ] Auto-reconnect to saved device on app launch
- [x] Display app version number on Settings page
- [ ] Fetch full notification details from Data Source characteristic
- [ ] Parse notification title, message, and app name from ANCS
- [x] Send native push notifications to tablet notification center
- [x] Show notifications even when app is not in foreground
- [ ] Display app icon with notification card
- [ ] Add category-specific styling and icons
- [ ] Improve notification card layout to show full details


## Phase 9: Auto-Reconnection, Background Service & Floating Notifications

- [x] Save last connected device ID to AsyncStorage on successful connection
- [x] Auto-connect to saved device on app launch
- [x] Implement Data Source characteristic reading for full notification details
- [x] Parse notification title, message, and app name from Data Source
- [x] Create notification details modal/sheet component
- [x] Add system notifications for background alerts
- [x] Add Android permissions for foreground service and background operation
- [x] Add connection status monitoring and reconnection logic
- [x] Show connection popup when connection drops
- [x] Request SYSTEM_ALERT_WINDOW permission for float over other apps
- [x] Add RECEIVE_BOOT_COMPLETED permission for app auto-start
- [x] Improve notification card to show full details when available

## Phase 10: Stability Fixes & Code Quality Improvements


- [x] Fix crash when reconnecting after screen turns off
- [x] Add connection state mutex to prevent concurrent connection attempts
- [x] Improve BLE manager lifecycle handling for screen on/off events
- [x] Add proper cleanup when connection fails mid-attempt
- [x] Review and refactor Bluetooth service for better error handling
- [x] Add connection retry backoff strategy (exponential backoff)
- [x] Improve notification parsing robustness
- [x] Update app logo with orange accent
- [x] Comprehensive code review and optimization
- [x] Update version number to 1.3.0
