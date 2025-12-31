# iPhone Notification Receiver - Design Document

## App Overview
An Android tablet app that receives and displays notifications forwarded from an iPhone via Bluetooth using the Apple Notification Center Service (ANCS) protocol.

## Screen List

### 1. Home Screen (Main Notification List)
- **Primary Content**: Real-time list of received iPhone notifications
- **Functionality**: 
  - Display notification cards with app icon, title, message, and timestamp
  - Pull-to-refresh to clear old notifications
  - Tap notification to view full details
  - Clear individual notifications with swipe gesture
  - Clear all button in header

### 2. Bluetooth Connection Screen
- **Primary Content**: Bluetooth connection status and pairing instructions
- **Functionality**:
  - Show current connection status (Connected/Disconnected)
  - Display connected iPhone device name
  - Show pairing instructions when not connected
  - Manual reconnect button
  - Connection indicator (green dot when active)

### 3. Settings Screen
- **Primary Content**: App preferences and notification filters
- **Functionality**:
  - Toggle notification sound
  - Toggle vibration on new notification
  - Filter notifications by app category
  - Clear all notifications history
  - About section with app version

## Key User Flows

### Flow 1: Initial Setup
1. User opens app for first time
2. App shows Bluetooth connection screen with pairing instructions
3. User pairs iPhone with tablet via iOS Bluetooth settings
4. User enables "Share System Notifications" on iPhone
5. App detects connection and navigates to Home screen
6. Notifications start appearing in real-time

### Flow 2: Viewing Notifications
1. User sees new notification appear in list with animation
2. User taps notification card
3. Detail modal slides up showing full notification content
4. User can dismiss modal or clear notification

### Flow 3: Managing Notifications
1. User swipes left on notification card
2. Delete button appears
3. User taps delete, notification fades out
4. OR user taps "Clear All" button in header
5. Confirmation dialog appears
6. All notifications cleared

## Color Choices

**Brand Colors:**
- Primary: `#007AFF` (iOS Blue) - represents iPhone connection
- Secondary: `#34C759` (iOS Green) - connection status indicator
- Background: `#FFFFFF` (Light) / `#000000` (Dark)
- Surface: `#F2F2F7` (Light) / `#1C1C1E` (Dark) - notification cards
- Foreground: `#000000` (Light) / `#FFFFFF` (Dark)
- Muted: `#8E8E93` - timestamps and secondary text
- Border: `#C6C6C8` (Light) / `#38383A` (Dark)
- Success: `#34C759` - connected state
- Warning: `#FF9500` - reconnecting state
- Error: `#FF3B30` - disconnected state

## Design Principles

1. **iOS-Inspired Design**: Since notifications come from iPhone, use iOS-style notification cards for familiarity
2. **Real-time Updates**: Notifications appear instantly with smooth animations
3. **One-Handed Usage**: All primary actions accessible from bottom half of screen
4. **Clear Status**: Always show Bluetooth connection status prominently
5. **Minimal Setup**: Auto-detect connection, minimal configuration needed
6. **Portrait Orientation**: Optimized for tablet in portrait mode (9:16)

## Technical Considerations

- Use React Native Bluetooth Low Energy library for ANCS protocol
- Implement notification persistence with AsyncStorage (local only)
- Handle Bluetooth reconnection automatically in background
- Request necessary Android permissions (Bluetooth, Notifications)
- Parse ANCS data packets to extract notification details
