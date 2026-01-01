# iPhone Notification Receiver

An Android tablet application that receives and displays notifications forwarded from an iPhone via Bluetooth using the Apple Notification Center Service (ANCS) protocol.

Built with **Expo/React Native** and **TypeScript**, featuring a native Android foreground service for reliable background operation.

## Features

- **Real-time Notification Mirroring**: Receive iPhone notifications on your Android tablet instantly
- **Background Operation**: Native foreground service keeps notifications flowing even when app is closed
- **Full ANCS Protocol**: Complete implementation with proper attribute fetching (app name, title, message, timestamp)
- **Auto-Reconnection**: Automatically reconnects to your iPhone when connection drops
- **Lock Screen Notifications**: Notifications appear on lock screen without opening the app
- **Debug Mode**: Detailed logging for troubleshooting ANCS protocol issues
- **Battery Optimized**: Guidance for disabling battery optimization on INMO Air3 and similar devices

## Requirements

- **Android Device**: Android 8.0+ (API 26+), tested on INMO Air3 tablet
- **iPhone**: iOS device with Bluetooth LE support
- **Node.js**: v18+ (v22.13.0 recommended)
- **pnpm**: v9.12.0+

## Installation

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/Flash-Bri/iphone-notification-receiver.git
cd iphone-notification-receiver
pnpm install
```

### 2. Environment Variables (Optional)

If you're using Manus OAuth or custom API endpoints, create a `.env` file:

```bash
# .env
EXPO_PUBLIC_OAUTH_PORTAL_URL=https://your-oauth-portal.com
EXPO_PUBLIC_OAUTH_SERVER_URL=https://your-oauth-server.com
EXPO_PUBLIC_APP_ID=your-app-id
EXPO_PUBLIC_OWNER_OPEN_ID=your-owner-id
EXPO_PUBLIC_OWNER_NAME=Your Name
EXPO_PUBLIC_API_BASE_URL=https://your-api-server.com
```

For local development without OAuth, these can be left empty.

## Development

### Run Locally on Android Device

```bash
# Start development server
pnpm dev

# In another terminal, run on Android
pnpm android
```

Or use QR code for Expo Go:

```bash
# Generate QR code for easy device connection
pnpm qr
```

### Run on Web (Limited Functionality)

```bash
pnpm dev:metro
```

**Note**: Web version has limited functionality. Bluetooth ANCS requires native Android.

## Building APK

### Option 1: EAS Build (Recommended)

1. **Install EAS CLI**:
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**:
   ```bash
   eas login
   ```

3. **Configure EAS Build**:
   Create `eas.json` if not present:
   ```json
   {
     "build": {
       "preview": {
         "android": {
           "buildType": "apk"
         }
       },
       "production": {
         "android": {
           "buildType": "app-bundle"
         }
       }
     }
   }
   ```

4. **Build APK**:
   ```bash
   # For preview/testing APK
   eas build --platform android --profile preview

   # For production AAB (Google Play)
   eas build --platform android --profile production
   ```

5. **Download APK**:
   After build completes, download the APK from the provided URL and install on your Android device.

### Option 2: Local Build with Expo Prebuild

1. **Prebuild Android Project**:
   ```bash
   npx expo prebuild --platform android
   ```

2. **Build APK with Gradle**:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

3. **Find APK**:
   ```
   android/app/build/outputs/apk/release/app-release.apk
   ```

### Option 3: Development Build

For testing without full release build:

```bash
npx expo run:android --variant release
```

## On-Device Setup

### 1. Install APK

Transfer the APK to your Android device and install it. You may need to enable "Install from Unknown Sources" in Settings.

### 2. Grant Permissions

When you first open the app, grant the following permissions:

- **Bluetooth**: Required for BLE connection to iPhone
- **Location** (Android 11 and below): Required for Bluetooth scanning
- **Notifications** (Android 13+): Required to post system notifications

### 3. Pair iPhone

1. Open the app and tap "Select Device"
2. Choose your iPhone from the list of paired Bluetooth devices
3. If not paired, go to iPhone Settings → Bluetooth and pair with your Android tablet
4. On iPhone, enable "Share System Notifications" for your tablet in Bluetooth settings

### 4. Enable Background Service (Recommended)

1. Go to Settings tab in the app
2. Enable "Run in Background" toggle
3. Tap "Battery Optimization" and disable battery optimization for this app
4. For INMO Air3: Follow the on-screen guidance to whitelist the app in power manager

### 5. Test Notifications

1. Lock your Android tablet screen
2. Send a test message to your iPhone from another device
3. Notification should appear on Android lock screen within 5 seconds

## Troubleshooting

### No Notifications Received

**Check iPhone Settings**:
- Go to Settings → Bluetooth → Your Tablet → "Share System Notifications" must be ON
- Some apps may restrict notification content due to iOS privacy settings

**Check App Connection**:
- Open the app and verify green "Connected" status
- If disconnected, tap "Select Device" and reconnect

**Enable Debug Mode**:
1. Go to Debug tab in the app
2. Enable debug logging toggle
3. Send a test notification to iPhone
4. Check logs for:
   - NS (Notification Source) entries - raw notification events
   - CP (Control Point) entries - attribute requests
   - DS (Data Source) entries - notification details
   - PA (Parsed Attributes) entries - final parsed data

### Notifications Only Show Category

This means the Data Source response is empty or truncated. Some iOS apps restrict notification content - this is an iOS limitation, not an app bug.

### Background Service Stops

**Disable Battery Optimization**:
- Settings → Battery → Battery Optimization → Find app → Don't optimize

**For INMO Air3**:
- Open Air3 Settings → Power Manager → Whitelist this app
- Disable "Aggressive Doze" if available

**Enable Auto-start on Boot**:
- In app Settings, enable "Auto-start on Boot" toggle

### App Crashes on Connect

1. Clear app data: Settings → Apps → iPhone Notifications → Storage → Clear Data
2. Unpair and re-pair devices in Bluetooth settings
3. Check Debug log for error entries before crash

### Native Service Not Available

If you see "Native service not available" in Settings:

1. Make sure you're running on Android (not web or iOS)
2. Rebuild the app with `npx expo prebuild --clean`
3. Check that native files were properly generated in `android/` directory

## Project Structure

```
├── app/                          # Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx            # Main notification list
│   │   ├── settings.tsx         # Settings and service controls
│   │   └── debug.tsx            # Debug logging
│   └── _layout.tsx              # Root layout
├── lib/                          # Core business logic
│   ├── bluetooth-service.ts     # ANCS protocol (JS layer)
│   ├── native-service.ts        # Native service wrapper
│   ├── notification-service.ts  # Android notifications
│   └── notification-storage.ts  # Local persistence
├── plugins/                      # Expo config plugins
│   ├── withAncsForegroundService.js  # Plugin for native service
│   └── native-android/          # Native Kotlin source files
│       ├── AncsForegroundService.kt
│       ├── AncsBluetoothManager.kt
│       ├── AncsServiceModule.kt
│       ├── AncsServicePackage.kt
│       └── BootReceiver.kt
├── components/                   # React components
├── constants/                    # App constants
├── hooks/                        # React hooks
└── assets/                       # Images and fonts
```

## Architecture

### Native Foreground Service

The app uses a native Android foreground service to ensure reliable background operation:

- **AncsForegroundService**: Main service with START_STICKY for auto-restart
- **AncsBluetoothManager**: Native BLE + ANCS protocol handler
- **AncsServiceModule**: React Native bridge for JS ↔ Native communication

The native service owns the BLE connection and runs independently of the JavaScript runtime, ensuring notifications are received even when the app is backgrounded or the device is locked.

### ANCS Protocol

The app implements the full Apple Notification Center Service protocol:

1. **Notification Source**: Receives notification events with UID
2. **Control Point**: Requests detailed attributes for each notification
3. **Data Source**: Receives multi-packet responses with notification details
4. **Attribute Parsing**: Extracts app name, title, message, and timestamp

## Development Notes

### Single Source of Truth for Bundle ID

The bundle ID is defined once in `app.config.ts` and exported for use in other files:

```typescript
// app.config.ts
export const bundleId = "space.manus.iphone.notification.receiver.t20241231115717";
export const schemeFromBundleId = "manus20241231115717";

// constants/oauth.ts
import { bundleId, schemeFromBundleId } from "../app.config";
```

### Native Module Availability Check

The native service module is only available on Android after prebuild. Use the strict truthy check:

```typescript
export function isNativeServiceAvailable(): boolean {
  return !!AncsServiceModule;
}
```

### Testing

Run tests with:

```bash
pnpm test
```

## Version History

- **1.6.0**: Native Android foreground service for background notifications
- **1.5.0**: Production ANCS implementation with correct attribute fetching
- **1.4.0**: Critical bug fixes for notifications and connection stability
- **1.3.0**: Stability fixes and orange logo
- **1.2.0**: Full notification details and connection monitoring
- **1.1.0**: Device selection modal
- **1.0.0**: Initial release

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues and questions, please open a GitHub issue.
