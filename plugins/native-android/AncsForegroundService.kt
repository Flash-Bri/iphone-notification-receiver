package space.manus.iphone.notification.receiver

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import android.util.Log

/**
 * Foreground service for ANCS notification reception.
 * 
 * This service runs independently of the React Native JavaScript runtime,
 * ensuring notifications are received even when the app is backgrounded.
 */
class AncsForegroundService : Service() {
    
    companion object {
        private const val TAG = "AncsForegroundService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "ancs_service_channel"
        private const val CHANNEL_NAME = "ANCS Service"
        
        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
        const val EXTRA_DEVICE_MAC = "EXTRA_DEVICE_MAC"
        const val EXTRA_DEVICE_NAME = "EXTRA_DEVICE_NAME"
        
        private const val PREF_NAME = "ancs_service_prefs"
        private const val PREF_DEVICE_MAC = "device_mac"
        private const val PREF_DEVICE_NAME = "device_name"
        private const val PREF_AUTO_START = "auto_start"
    }
    
    private lateinit var prefs: SharedPreferences
    private var bluetoothManager: AncsBluetoothManager? = null
    private var wakeLock: PowerManager.WakeLock? = null
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        
        prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        
        // Acquire wake lock to prevent CPU sleep
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "AncsService::WakeLock"
        )
        wakeLock?.acquire(10*60*1000L /*10 minutes*/)
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: action=${intent?.action}")
        
        when (intent?.action) {
            ACTION_START -> {
                val deviceMac = intent.getStringExtra(EXTRA_DEVICE_MAC)
                val deviceName = intent.getStringExtra(EXTRA_DEVICE_NAME) ?: "iPhone"
                
                if (deviceMac != null) {
                    // Save device info for reconnection
                    prefs.edit()
                        .putString(PREF_DEVICE_MAC, deviceMac)
                        .putString(PREF_DEVICE_NAME, deviceName)
                        .apply()
                    
                    startForegroundService(deviceName)
                    connectToDevice(deviceMac)
                } else {
                    Log.e(TAG, "No device MAC provided")
                }
            }
            ACTION_STOP -> {
                stopForegroundService()
            }
            else -> {
                // Service restarted by system (START_STICKY)
                val savedMac = prefs.getString(PREF_DEVICE_MAC, null)
                val savedName = prefs.getString(PREF_DEVICE_NAME, "iPhone")
                
                if (savedMac != null) {
                    Log.d(TAG, "Service restarted, reconnecting to $savedMac")
                    startForegroundService(savedName!!)
                    connectToDevice(savedMac)
                }
            }
        }
        
        // START_STICKY ensures service is restarted if killed by system
        return START_STICKY
    }
    
    private fun startForegroundService(deviceName: String) {
        createNotificationChannel()
        
        val notification = createNotification(
            "Listening for $deviceName notifications",
            "Tap to open app"
        )
        
        startForeground(NOTIFICATION_ID, notification)
        Log.d(TAG, "Service started in foreground")
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the ANCS service running in background"
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(title: String, text: String): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }
    
    private fun connectToDevice(deviceMac: String) {
        if (bluetoothManager == null) {
            bluetoothManager = AncsBluetoothManager(this)
        }
        
        bluetoothManager?.connect(deviceMac)
    }
    
    private fun stopForegroundService() {
        Log.d(TAG, "Stopping service")
        
        bluetoothManager?.disconnect()
        bluetoothManager = null
        
        wakeLock?.release()
        
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        
        bluetoothManager?.disconnect()
        bluetoothManager = null
        
        wakeLock?.release()
    }
    
    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
    
    /**
     * Get current service status
     */
    fun getStatus(): Map<String, Any> {
        return mapOf(
            "isRunning" to true,
            "isConnected" to (bluetoothManager?.isConnected() ?: false),
            "lastEventTime" to (bluetoothManager?.getLastEventTime() ?: 0L),
            "lastError" to (bluetoothManager?.getLastError() ?: ""),
            "notificationCount" to (bluetoothManager?.getNotificationCount() ?: 0)
        )
    }
}
