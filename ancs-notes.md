# ANCS Protocol Implementation Notes

## Service UUIDs
- **ANCS Service**: `7905F431-B5CE-4E99-A40F-4B1E122D00D0`
- **Notification Source**: `9FBF120D-6301-42D9-8C58-25E699A21DBD` (notifiable)
- **Control Point**: `69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9` (writeable with response)
- **Data Source**: `22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB` (notifiable)

## Notification Source Format (8 bytes)
Each notification received contains:
1. **EventID** (1 byte): Added=0, Modified=1, Removed=2
2. **EventFlags** (1 byte): Bitmask for notification properties (silent, important, etc.)
3. **CategoryID** (1 byte): Category of notification (email, social, incoming call, etc.)
4. **CategoryCount** (1 byte): Number of active notifications in this category
5. **NotificationUID** (4 bytes): Unique identifier for this notification

## Category IDs
- 0: Other
- 1: Incoming Call
- 2: Missed Call
- 3: Voicemail
- 4: Social
- 5: Schedule
- 6: Email
- 7: News
- 8: Health and Fitness
- 9: Business and Finance
- 10: Location
- 11: Entertainment

## Implementation Steps
1. Scan for BLE devices with ANCS service UUID
2. Connect to iPhone device
3. Discover ANCS service and characteristics
4. Subscribe to Notification Source characteristic
5. Parse incoming notification data (8-byte packets)
6. Optionally: Use Control Point to request full notification details
7. Display notifications in app UI

## Key Notes
- ANCS may not always be present on iOS device
- All characteristics require authorization
- Notifications are delivered as soon as subscription is active
- Can request additional attributes (title, message, app name) via Control Point
