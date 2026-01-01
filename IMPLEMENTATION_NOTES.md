# iPhone Notification Receiver - Implementation Notes

## Version 1.5.0

This document describes the key implementation locations and test steps for the ANCS notification mirroring app.

---

## Key Implementation Locations

### 1. ANCS Protocol Implementation
**File:** `lib/bluetooth-service.ts`

#### Control Point Builder (GetNotificationAttributes)
- **Location:** `requestNotificationAttributes()` method (line ~350)
- **Format:** `[0x00, UID (4-byte LE), AttrID, MaxLen (2-byte LE), ...]`
- **Attributes requested:**
  - AppIdentifier (0x00)
  - Title (0x01, max 128 bytes)
  - Subtitle (0x02, max 128 bytes)
  - Message (0x03, max 1024 bytes)
  - Date (0x05, max 32 bytes)

#### Data Source Parser / Multi-packet Assembly
- **Location:** `handleDataSourceResponse()` method (line ~400)
- **Buffer assembly:** `dataSourceBuffer` accumulates packets until complete
- **Parsing:** `parseNotificationAttributes()` extracts attributes from assembled buffer

#### Single-Flight Request Queue
- **Location:** `requestQueue`, `isProcessingRequest`, `processRequestQueue()` (line ~300)
- **Timeout:** 5 seconds per request
- **Retry:** Max 2 retries on failure

#### App Name Resolution (GetAppAttributes)
- **Location:** `requestAppAttributes()` method (line ~450)
- **Cache:** `appNameCache` Map with AsyncStorage persistence

### 2. Notification Service (System Notifications)
**File:** `lib/notification-service.ts`

#### Android Notification Channels
- **Messages:** High priority, vibration enabled
- **Calls:** Max priority, persistent
- **Social:** High priority
- **Email:** Default priority
- **Other:** Default priority
- **Service:** Low priority (foreground service)

#### Immediate Notification Posting
- **Location:** `sendNotification()` method
- **Trigger:** Called immediately from `handleNewNotification()` in home screen

### 3. Debug Logging
**File:** `lib/bluetooth-service.ts`

#### Debug Log Types
- `notification_source`: Raw NS characteristic data
- `control_point_request`: CP write command bytes
- `data_source_response`: Raw DS characteristic data
- `parsed_attributes`: Final parsed notification data
- `error`: Any errors during processing

#### Debug Screen
**File:** `app/(tabs)/debug.tsx`
- Toggle to enable/disable logging
- Real-time log display with color-coded types
- Export/share functionality

### 4. Connection Management
**File:** `lib/bluetooth-service.ts`

#### Auto-reconnection
- **Location:** `handleDisconnect()`, `attemptReconnect()` methods
- **Trigger:** AppState change listener, connection drop detection
- **Backoff:** Exponential (1s, 2s, 4s, 8s, 16s)

#### Device Persistence
- **Location:** `saveLastDeviceId()`, `loadLastDeviceId()` methods
- **Storage:** AsyncStorage with key `@last_connected_device`

---

## Test Steps

### Test 1: Lock Screen Notification Display
1. Open the app and connect to your iPhone
2. Verify green "Connected" status shows
3. Lock your Air3 tablet screen
4. Send a message to your iPhone from another device
5. **Expected:** Notification appears on Air3 lock screen within 5 seconds

### Test 2: Background Notification Reception
1. Connect to iPhone in the app
2. Press Home to minimize the app
3. Open a different app on your tablet
4. Send a message to your iPhone
5. **Expected:** System notification appears in notification shade

### Test 3: Full Content Display
1. Connect to iPhone
2. Send a text message to your iPhone
3. **Expected:** Notification card shows:
   - App name (e.g., "Messages")
   - Sender name (title)
   - Message preview (body)
   - Timestamp

### Test 4: Reconnection After Screen Off/On
1. Connect to iPhone
2. Let tablet screen turn off (wait 2+ minutes)
3. Turn screen back on
4. **Expected:** App shows "Reconnecting..." then "Connected"
5. Send a test notification
6. **Expected:** Notification appears normally

### Test 5: Debug Mode Verification
1. Go to Debug tab
2. Enable debug logging toggle
3. Connect to iPhone (or reconnect)
4. Send a notification to iPhone
5. **Expected:** Debug log shows:
   - NS entry with raw bytes
   - CP entry with request bytes
   - DS entry with response bytes
   - PA entry with parsed attributes

---

## Known Limitations

1. **iOS Content Restrictions:** Some apps may hide notification content due to iOS privacy settings. In these cases, you'll see "Content hidden by iOS settings" with the app identifier.

2. **Bluetooth Range:** ANCS notifications require active Bluetooth connection. If devices move out of range, notifications will queue until reconnection.

3. **Battery Impact:** Continuous BLE monitoring may impact battery life on both devices.

4. **App-Specific Icons:** The app uses category-based icons rather than actual app icons, as ANCS doesn't provide app icon data.

---

## Troubleshooting

### No Notifications Received
1. Check iPhone Bluetooth settings → Your tablet → "Share System Notifications" is ON
2. Verify app shows green "Connected" status
3. Enable Debug mode and check for NS entries when notifications arrive
4. If NS entries appear but no PA entries, there may be a parsing issue

### Notifications Show Only Category
1. This means Data Source response is empty or truncated
2. Check Debug log for DS entries
3. Some apps restrict notification content - this is an iOS limitation

### App Crashes on Connect
1. Clear app data and restart
2. Unpair and re-pair devices in Bluetooth settings
3. Check Debug log for error entries before crash

---

## File Structure

```
lib/
├── bluetooth-service.ts    # ANCS protocol, BLE connection, attribute parsing
├── notification-service.ts # Android system notifications
├── notification-storage.ts # Local notification persistence
└── __tests__/
    ├── bluetooth-service.test.ts
    └── notification-storage.test.ts

app/(tabs)/
├── index.tsx    # Main notification list screen
├── settings.tsx # App settings
├── debug.tsx    # Debug logging screen
└── _layout.tsx  # Tab navigation

components/
├── notification-card.tsx       # Notification display card
├── device-selection-modal.tsx  # Bluetooth device picker
└── ui/icon-symbol.tsx          # Icon mappings
```
