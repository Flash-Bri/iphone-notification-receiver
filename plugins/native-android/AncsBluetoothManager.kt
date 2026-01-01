package space.manus.iphone.notification.receiver

import android.bluetooth.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.*

/**
 * Native BLE + ANCS protocol handler.
 * 
 * Handles connection, service discovery, CCCD subscription,
 * Control Point requests, and Data Source parsing.
 */
class AncsBluetoothManager(private val context: Context) {
    
    companion object {
        private const val TAG = "AncsBluetoothManager"
        
        // ANCS Service and Characteristics UUIDs
        private val ANCS_SERVICE_UUID = UUID.fromString("7905F431-B5CE-4E99-A40F-4B1E122D00D0")
        private val NOTIFICATION_SOURCE_UUID = UUID.fromString("9FBF120D-6301-42D9-8C58-25E699A21DBD")
        private val CONTROL_POINT_UUID = UUID.fromString("69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9")
        private val DATA_SOURCE_UUID = UUID.fromString("22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFF")
        private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
        
        private const val RECONNECT_DELAY = 5000L
    }
    
    private val bluetoothManager: BluetoothManager = 
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val handler = Handler(Looper.getMainLooper())
    
    private var bluetoothGatt: BluetoothGatt? = null
    private var notificationSourceChar: BluetoothGattCharacteristic? = null
    private var controlPointChar: BluetoothGattCharacteristic? = null
    private var dataSourceChar: BluetoothGattCharacteristic? = null
    
    private var isConnected = false
    private var shouldAutoReconnect = true
    private var lastDeviceMac: String? = null
    
    private var lastEventTime = 0L
    private var lastError = ""
    private var notificationCount = 0
    
    private val dataSourceBuffer = mutableListOf<Byte>()
    private val requestQueue = mutableListOf<ByteArray>()
    private var isProcessingRequest = false
    
    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Connected to device")
                    isConnected = true
                    lastError = ""
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Disconnected from device")
                    isConnected = false
                    lastError = "Connection lost"
                    
                    if (shouldAutoReconnect && lastDeviceMac != null) {
                        handler.postDelayed({
                            connect(lastDeviceMac!!)
                        }, RECONNECT_DELAY)
                    }
                }
            }
        }
        
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Services discovered")
                
                val ancsService = gatt.getService(ANCS_SERVICE_UUID)
                if (ancsService != null) {
                    notificationSourceChar = ancsService.getCharacteristic(NOTIFICATION_SOURCE_UUID)
                    controlPointChar = ancsService.getCharacteristic(CONTROL_POINT_UUID)
                    dataSourceChar = ancsService.getCharacteristic(DATA_SOURCE_UUID)
                    
                    // Enable notifications on Notification Source
                    notificationSourceChar?.let { char ->
                        gatt.setCharacteristicNotification(char, true)
                        val descriptor = char.getDescriptor(CCCD_UUID)
                        descriptor?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        gatt.writeDescriptor(descriptor)
                    }
                    
                    // Enable notifications on Data Source
                    dataSourceChar?.let { char ->
                        gatt.setCharacteristicNotification(char, true)
                        val descriptor = char.getDescriptor(CCCD_UUID)
                        descriptor?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        gatt.writeDescriptor(descriptor)
                    }
                } else {
                    Log.e(TAG, "ANCS service not found")
                    lastError = "ANCS service not found"
                }
            }
        }
        
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            when (characteristic.uuid) {
                NOTIFICATION_SOURCE_UUID -> {
                    handleNotificationSource(characteristic.value)
                }
                DATA_SOURCE_UUID -> {
                    handleDataSource(characteristic.value)
                }
            }
        }
    }
    
    fun connect(deviceMac: String) {
        lastDeviceMac = deviceMac
        
        try {
            val device = bluetoothManager.adapter.getRemoteDevice(deviceMac)
            bluetoothGatt = device.connectGatt(context, false, gattCallback)
            Log.d(TAG, "Connecting to $deviceMac")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect", e)
            lastError = e.message ?: "Connection failed"
        }
    }
    
    fun disconnect() {
        shouldAutoReconnect = false
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        isConnected = false
    }
    
    private fun handleNotificationSource(data: ByteArray) {
        if (data.size < 8) return
        
        // Parse Notification Source format:
        // EventID (1) | EventFlags (1) | CategoryID (1) | CategoryCount (1) | NotificationUID (4)
        val uid = ByteBuffer.wrap(data, 4, 4).order(ByteOrder.LITTLE_ENDIAN).int
        
        Log.d(TAG, "Notification received: UID=$uid")
        
        // Request notification attributes
        requestNotificationAttributes(uid)
    }
    
    private fun requestNotificationAttributes(uid: Int) {
        // Build GetNotificationAttributes command
        val command = ByteBuffer.allocate(18).apply {
            order(ByteOrder.LITTLE_ENDIAN)
            put(0x00.toByte()) // CommandID: GetNotificationAttributes
            putInt(uid) // NotificationUID (4 bytes, little-endian)
            
            // AppIdentifier (0x00)
            put(0x00.toByte())
            
            // Title (0x01, max 128 bytes)
            put(0x01.toByte())
            putShort(128)
            
            // Subtitle (0x02, max 128 bytes)
            put(0x02.toByte())
            putShort(128)
            
            // Message (0x03, max 1024 bytes)
            put(0x03.toByte())
            putShort(1024)
            
            // Date (0x05, max 32 bytes)
            put(0x05.toByte())
            putShort(32)
        }.array()
        
        // Add to queue and process
        requestQueue.add(command)
        processRequestQueue()
    }
    
    private fun processRequestQueue() {
        if (isProcessingRequest || requestQueue.isEmpty()) return
        
        isProcessingRequest = true
        val command = requestQueue.removeAt(0)
        
        controlPointChar?.let { char ->
            char.value = command
            bluetoothGatt?.writeCharacteristic(char)
            
            // Timeout after 5 seconds
            handler.postDelayed({
                if (isProcessingRequest) {
                    Log.w(TAG, "Request timeout")
                    isProcessingRequest = false
                    processRequestQueue()
                }
            }, 5000)
        }
    }
    
    private fun handleDataSource(data: ByteArray) {
        // Accumulate data packets
        dataSourceBuffer.addAll(data.toList())
        
        // Check if we have complete response
        if (isCompleteResponse()) {
            parseNotificationAttributes()
            dataSourceBuffer.clear()
            isProcessingRequest = false
            processRequestQueue()
        }
    }
    
    private fun isCompleteResponse(): Boolean {
        // Simple heuristic: if buffer ends with multiple zeros or is large enough
        return dataSourceBuffer.size > 10 && 
               (dataSourceBuffer.takeLast(3).all { it == 0.toByte() } || 
                dataSourceBuffer.size > 1500)
    }
    
    private fun parseNotificationAttributes() {
        val buffer = dataSourceBuffer.toByteArray()
        
        try {
            var offset = 5 // Skip CommandID (1) + UID (4)
            
            var appId = ""
            var title = ""
            var message = ""
            
            while (offset < buffer.size - 3) {
                val attrId = buffer[offset].toInt() and 0xFF
                val length = ByteBuffer.wrap(buffer, offset + 1, 2)
                    .order(ByteOrder.LITTLE_ENDIAN).short.toInt() and 0xFFFF
                
                offset += 3
                
                if (offset + length > buffer.size) break
                
                val value = String(buffer, offset, length, Charsets.UTF_8)
                
                when (attrId) {
                    0 -> appId = value
                    1 -> title = value
                    3 -> message = value
                }
                
                offset += length
            }
            
            if (title.isNotEmpty() || message.isNotEmpty()) {
                postNotification(appId, title, message)
                lastEventTime = System.currentTimeMillis()
                notificationCount++
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse attributes", e)
            lastError = "Parse error: ${e.message}"
        }
    }
    
    private fun postNotification(appId: String, title: String, message: String) {
        Log.d(TAG, "Posting notification: $title - $message")
        
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) 
            as android.app.NotificationManager
        
        // Create notification channel if needed
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                "ancs_notifications",
                "iPhone Notifications",
                android.app.NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }
        
        val notification = androidx.core.app.NotificationCompat.Builder(context, "ancs_notifications")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title.ifEmpty { appId })
            .setContentText(message)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
    
    fun isConnected() = isConnected
    fun getLastEventTime() = lastEventTime
    fun getLastError() = lastError
    fun getNotificationCount() = notificationCount
}
