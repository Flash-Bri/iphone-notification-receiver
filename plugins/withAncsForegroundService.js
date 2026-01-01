/**
 * Expo Config Plugin for ANCS Foreground Service
 * 
 * This plugin adds the native Android foreground service implementation
 * for reliable background ANCS notification reception.
 * 
 * It handles:
 * 1. AndroidManifest.xml permissions and service/receiver declarations
 * 2. Copying native Kotlin source files
 * 3. Patching MainApplication to register the AncsServicePackage (Robust & Idempotent)
 */

const {
  withAndroidManifest,
  withMainApplication,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const BASE_IMPORT = "import space.manus.iphone.notification.receiver.AncsServicePackage";
const PACKAGE_NAME = "AncsServicePackage";

/**
 * Add permissions to AndroidManifest.xml
 */
function addPermissions(androidManifest) {
  const { manifest } = androidManifest;

  if (!manifest["uses-permission"]) {
    manifest["uses-permission"] = [];
  }

  const permissions = [
    // Foreground Service
    { $: { "android:name": "android.permission.FOREGROUND_SERVICE" } },
    {
      $: {
        "android:name": "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
      },
    },
    // Battery Optimization
    {
      $: {
        "android:name": "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      },
    },
    // Boot Completed
    { $: { "android:name": "android.permission.RECEIVE_BOOT_COMPLETED" } },
    // Wake Lock
    { $: { "android:name": "android.permission.WAKE_LOCK" } },
  ];

  permissions.forEach((permission) => {
    const exists = manifest["uses-permission"].some(
      (p) => p.$["android:name"] === permission.$["android:name"]
    );
    if (!exists) {
      manifest["uses-permission"].push(permission);
    }
  });

  return androidManifest;
}

/**
 * Add service and receiver declarations to AndroidManifest.xml
 */
function addServiceAndReceiver(androidManifest) {
  const { manifest } = androidManifest;

  if (!manifest.application) {
    manifest.application = [{ $: {} }];
  }

  const application = manifest.application[0];

  // Add service
  if (!application.service) {
    application.service = [];
  }

  const serviceExists = application.service.some(
    (s) =>
      s.$["android:name"] ===
      "space.manus.iphone.notification.receiver.AncsForegroundService"
  );

  if (!serviceExists) {
    application.service.push({
      $: {
        "android:name":
          "space.manus.iphone.notification.receiver.AncsForegroundService",
        "android:foregroundServiceType": "connectedDevice",
        "android:stopWithTask": "false",
        "android:exported": "false",
      },
    });
  }

  // Add boot receiver
  if (!application.receiver) {
    application.receiver = [];
  }

  const receiverExists = application.receiver.some(
    (r) =>
      r.$["android:name"] ===
      "space.manus.iphone.notification.receiver.BootReceiver"
  );

  if (!receiverExists) {
    application.receiver.push({
      $: {
        "android:name": "space.manus.iphone.notification.receiver.BootReceiver",
        "android:enabled": "true",
        "android:exported": "false",
      },
      "intent-filter": [
        {
          action: [
            {
              $: {
                "android:name": "android.intent.action.BOOT_COMPLETED",
              },
            },
          ],
        },
      ],
    });
  }

  return androidManifest;
}

/**
 * Patch MainApplication to register the AncsServicePackage
 */
function patchMainApplication(config) {
  return withMainApplication(config, (config) => {
    let content = config.modResults.contents;
    const isKotlin = config.modResults.language === 'kt' || content.includes('class MainApplication : Application');
    const importStatement = isKotlin ? BASE_IMPORT : `${BASE_IMPORT};`;

    // 1. Idempotent Import Injection
    // Match import with or without semicolon and varying whitespace
    const importRegex = new RegExp(`import\\s+space\\.manus\\.iphone\\.notification\\.receiver\\.AncsServicePackage;?\\s*`, 'g');
    
    if (!importRegex.test(content)) {
      const lines = content.split('\n');
      const lastImportIndex = lines.findLastIndex(line => line.trim().startsWith('import '));
      
      if (lastImportIndex !== -1) {
        lines.splice(lastImportIndex + 1, 0, importStatement);
        content = lines.join('\n');
      } else {
        // Fallback: after package declaration
        content = content.replace(/(package\s+[\w.]+;?\n)/, `$1\n${importStatement}\n`);
      }
    } else if (!isKotlin && !content.includes(`${BASE_IMPORT};`)) {
      // Fix missing semicolon in Java
      content = content.replace(importRegex, `${importStatement}\n`);
    }

    // 2. Idempotent Package Registration
    if (!content.includes(PACKAGE_NAME + "(")) {
      const registration = isKotlin 
        ? `      packages.add(${PACKAGE_NAME}())` 
        : `      packages.add(new ${PACKAGE_NAME}());`;

      // Resilient regex for various template variants
      const kotlinRegex = /(val\s+packages\s*=\s*PackageList\(this\)\.packages(?:\.toMutableList\(\))?(?:\s+as\s+MutableList<ReactPackage>)?)/;
      const javaRegex = /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\);)/;

      const regex = isKotlin ? kotlinRegex : javaRegex;

      if (regex.test(content)) {
        content = content.replace(regex, `$1\n${registration}`);
      } else {
        // Fail loudly if we can't find the insertion point
        const patternTried = isKotlin 
          ? "/(val\\s+packages\\s*=\\s*PackageList\\(this\\)\\.packages(?:\\.toMutableList\\(\\))?(?:\\s+as\\s+MutableList<ReactPackage>)?)/"
          : "/(List<ReactPackage>\\s+packages\\s*=\\s*new\\s+PackageList\\(this\\)\\.getPackages\\(\\);)/";
          
        throw new Error(
          `[withAncsForegroundService] FAILED TO PATCH MainApplication.${isKotlin ? 'kt' : 'java'}\n` +
          `REASON: Could not find the package list initialization insertion point.\n` +
          `PATTERN TRIED: ${patternTried}\n` +
          `SUGGESTION: Ensure your MainApplication follows standard Expo/React Native templates. ` +
          `If you have a custom template, you may need to manually add 'packages.add(${isKotlin ? 'AncsServicePackage()' : 'new AncsServicePackage()'})' to your getPackages() method.`
        );
      }
    }

    config.modResults.contents = content;
    return config;
  });
}

/**
 * Copy native Kotlin files to the Android project
 */
function withNativeFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidProjectPath = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        "space",
        "manus",
        "iphone",
        "notification",
        "receiver"
      );

      // Create directory structure
      if (!fs.existsSync(androidProjectPath)) {
        fs.mkdirSync(androidProjectPath, { recursive: true });
      }

      // Native files to copy
      const nativeFiles = [
        "AncsForegroundService.kt",
        "AncsBluetoothManager.kt",
        "AncsServiceModule.kt",
        "AncsServicePackage.kt",
        "BootReceiver.kt",
      ];

      const pluginDir = path.join(projectRoot, "plugins", "native-android");

      nativeFiles.forEach((file) => {
        const sourcePath = path.join(pluginDir, file);
        const destPath = path.join(androidProjectPath, file);

        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`✓ Copied ${file} to Android project`);
        } else {
          console.warn(`⚠ Native file not found: ${sourcePath}`);
        }
      });

      return config;
    },
  ]);
}

/**
 * Main plugin function
 */
const withAncsForegroundService = (config) => {
  // 1. Add permissions and service/receiver to AndroidManifest
  config = withAndroidManifest(config, (config) => {
    config.modResults = addPermissions(config.modResults);
    config.modResults = addServiceAndReceiver(config.modResults);
    return config;
  });

  // 2. Patch MainApplication to register the package
  config = patchMainApplication(config);

  // 3. Copy native files
  config = withNativeFiles(config);

  return config;
};

module.exports = withAncsForegroundService;
