/**
 * Test script for MainApplication patching logic
 */

const IMPORT_STATEMENT = "import space.manus.iphone.notification.receiver.AncsServicePackage";
const PACKAGE_NAME = "AncsServicePackage";

function patchContent(content, isKotlin) {
  // 1. Idempotent Import Injection
  if (!content.includes(IMPORT_STATEMENT)) {
    const lines = content.split('\n');
    const lastImportIndex = lines.findLastIndex(line => line.trim().startsWith('import '));
    
    if (lastImportIndex !== -1) {
      lines.splice(lastImportIndex + 1, 0, IMPORT_STATEMENT);
      content = lines.join('\n');
    } else {
      // Fallback: after package declaration
      content = content.replace(/(package\s+[\w.]+;?\n)/, `$1\n${IMPORT_STATEMENT}\n`);
    }
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
      throw new Error(`Could not find package list initialization in ${isKotlin ? 'Kotlin' : 'Java'} MainApplication. Content snippet: ${content.substring(0, 500)}...`);
    }
  }

  return content;
}

// Test Cases
const kotlinTemplate1 = `package com.example.app
import android.app.Application
import com.facebook.react.PackageList

class MainApplication : Application() {
  override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages.toMutableList()
    return packages
  }
}`;

const kotlinTemplate2 = `package com.example.app
import android.app.Application

class MainApplication : Application() {
  override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages as MutableList<ReactPackage>
    return packages
  }
}`;

const javaTemplate = `package com.example.app;
import android.app.Application;
import java.util.List;

public class MainApplication extends Application {
  @Override
  protected List<ReactPackage> getPackages() {
    List<ReactPackage> packages = new PackageList(this).getPackages();
    return packages;
  }
}`;

try {
  console.log("Testing Kotlin Template 1...");
  let res = patchContent(kotlinTemplate1, true);
  console.log("Result contains import:", res.includes(IMPORT_STATEMENT));
  console.log("Result contains registration:", res.includes("packages.add(AncsServicePackage())"));
  
  console.log("\nTesting Idempotency (Kotlin)...");
  let res2 = patchContent(res, true);
  const importCount = (res2.match(new RegExp(IMPORT_STATEMENT, 'g')) || []).length;
  const regCount = (res2.match(/AncsServicePackage\(\)/g) || []).length;
  console.log("Import count (should be 1):", importCount);
  console.log("Registration count (should be 1):", regCount);

  console.log("\nTesting Java Template...");
  let resJava = patchContent(javaTemplate, false);
  console.log("Result contains import:", resJava.includes(IMPORT_STATEMENT));
  console.log("Result contains registration:", resJava.includes("packages.add(new AncsServicePackage());"));

  console.log("\nAll tests passed!");
} catch (e) {
  console.error("Test failed:", e.message);
  process.exit(1);
}
