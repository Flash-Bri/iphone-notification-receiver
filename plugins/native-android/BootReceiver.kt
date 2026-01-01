package space.manus.iphone.notification.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Boot receiver to auto-start the ANCS service after device reboot.
 */
class BootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
        private const val PREF_NAME = "ancs_service_prefs"
        private const val PREF_AUTO_START = "auto_start"
        private const val PREF_DEVICE_MAC = "device_mac"
        private const val PREF_DEVICE_NAME = "device_name"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Boot completed, checking auto-start preference")
            
            val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            val autoStart = prefs.getBoolean(PREF_AUTO_START, false)
            
            if (autoStart) {
                val deviceMac = prefs.getString(PREF_DEVICE_MAC, null)
                val deviceName = prefs.getString(PREF_DEVICE_NAME, "iPhone")
                
                if (deviceMac != null) {
                    Log.d(TAG, "Auto-starting ANCS service")
                    
                    val serviceIntent = Intent(context, AncsForegroundService::class.java).apply {
                        action = AncsForegroundService.ACTION_START
                        putExtra(AncsForegroundService.EXTRA_DEVICE_MAC, deviceMac)
                        putExtra(AncsForegroundService.EXTRA_DEVICE_NAME, deviceName)
                    }
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                } else {
                    Log.w(TAG, "Auto-start enabled but no device MAC saved")
                }
            } else {
                Log.d(TAG, "Auto-start disabled")
            }
        }
    }
}
