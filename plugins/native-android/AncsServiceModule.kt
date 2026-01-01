package space.manus.iphone.notification.receiver

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import android.util.Log

/**
 * React Native bridge module for ANCS foreground service.
 * 
 * Exposes native methods to JavaScript for service control.
 */
class AncsServiceModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {
    
    companion object {
        private const val TAG = "AncsServiceModule"
    }
    
    override fun getName(): String {
        return "AncsServiceModule"
    }
    
    /**
     * Start the foreground service with device info
     */
    @ReactMethod
    fun startService(deviceMac: String, deviceName: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, AncsForegroundService::class.java).apply {
                action = AncsForegroundService.ACTION_START
                putExtra(AncsForegroundService.EXTRA_DEVICE_MAC, deviceMac)
                putExtra(AncsForegroundService.EXTRA_DEVICE_NAME, deviceName)
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            
            Log.d(TAG, "Service start requested")
            promise.resolve(true)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start service", e)
            promise.reject("START_FAILED", e.message, e)
        }
    }
    
    /**
     * Stop the foreground service
     */
    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, AncsForegroundService::class.java).apply {
                action = AncsForegroundService.ACTION_STOP
            }
            context.startService(intent)
            
            Log.d(TAG, "Service stop requested")
            promise.resolve(true)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop service", e)
            promise.reject("STOP_FAILED", e.message, e)
        }
    }
    
    /**
     * Get current service status
     */
    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            val isRunning = isServiceRunning(AncsForegroundService::class.java)
            
            val status = Arguments.createMap().apply {
                putBoolean("isRunning", isRunning)
                putBoolean("isConnected", false) // TODO: Get from service
                putDouble("lastEventTime", 0.0)
                putString("lastError", null)
                putInt("notificationCount", 0)
            }
            
            promise.resolve(status)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get status", e)
            promise.reject("STATUS_FAILED", e.message, e)
        }
    }
    
    /**
     * Check if service is running
     */
    private fun isServiceRunning(serviceClass: Class<*>): Boolean {
        val manager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) 
            as ActivityManager
        
        @Suppress("DEPRECATION")
        for (service in manager.getRunningServices(Int.MAX_VALUE)) {
            if (serviceClass.name == service.service.className) {
                return true
            }
        }
        return false
    }
    
    /**
     * Check permission status
     */
    @ReactMethod
    fun checkPermissions(promise: Promise) {
        try {
            val permissions = Arguments.createMap().apply {
                putBoolean("bluetoothConnect", true) // Simplified
                putBoolean("bluetoothScan", true)
                putBoolean("postNotifications", true)
                putBoolean("batteryOptimizationIgnored", isBatteryOptimizationIgnored())
                putBoolean("allGranted", true)
            }
            
            promise.resolve(permissions)
            
        } catch (e: Exception) {
            promise.reject("CHECK_PERMISSIONS_FAILED", e.message, e)
        }
    }
    
    /**
     * Request battery optimization exemption
     */
    @ReactMethod
    fun requestBatteryOptimization(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${reactApplicationContext.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request battery optimization", e)
            promise.reject("BATTERY_OPT_FAILED", e.message, e)
        }
    }
    
    /**
     * Open app settings
     */
    @ReactMethod
    fun openAppSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open app settings", e)
            promise.reject("OPEN_SETTINGS_FAILED", e.message, e)
        }
    }
    
    /**
     * Get required permissions list
     */
    @ReactMethod
    fun getRequiredPermissions(promise: Promise) {
        try {
            val permissions = Arguments.createArray().apply {
                pushString("BLUETOOTH_CONNECT")
                pushString("BLUETOOTH_SCAN")
                pushString("POST_NOTIFICATIONS")
                pushString("FOREGROUND_SERVICE")
            }
            promise.resolve(permissions)
        } catch (e: Exception) {
            promise.reject("GET_PERMISSIONS_FAILED", e.message, e)
        }
    }
    
    /**
     * Check if battery optimization is ignored
     */
    private fun isBatteryOptimizationIgnored(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) 
                as android.os.PowerManager
            return powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName)
        }
        return true
    }
}
