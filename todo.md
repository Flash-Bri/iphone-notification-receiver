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
