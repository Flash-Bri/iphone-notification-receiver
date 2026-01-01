/**
 * Test script for MainApplication patching logic
 */

const BASE_IMPORT = "import space.manus.iphone.notification.receiver.AncsServicePackage";
const PACKAGE_NAME = "AncsServicePackage";

function patchContent(content, isKotlin) {
  const importStatement = isKotlin ? BASE_IMPORT : `${BASE_IMPORT};`;

  // 1. Idempotent Import Injection
  const importRegex = new RegExp(`import\\s+space\\.manus\\.iphone\\.notification\\.receiver\\.AncsServicePackage;?\\s*`, 'g');
  
  if (!importRegex.test(content)) {
    const lines = content.split('\n');
    const lastImportIndex = lines.findLastIndex(line => line.trim().startsWith('import '));
    
    if (lastImportIndex !== -1) {
      lines.splice(lastImportIndex + 1, 0, importStatement);
      content = lines.join('\n');
    } else {
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

    const kotlinRegex = /(val\s+packages\s*=\s*PackageList\(this\)\.packages(?:\.toMutableList\(\))?(?:\s+as\s+MutableList<ReactPackage>)?)/;
    const javaRegex = /(List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\);)/;

    const regex = isKotlin ? kotlinRegex : javaRegex;

    if (regex.test(content)) {
      content = content.replace(regex, `$1\n${registration}`);
    } else {
      throw new Error(`Could not find package list initialization in ${isKotlin ? 'Kotlin' : 'Java'} MainApplication.`);
    }
  }

  return content;
}

// Test Cases
const kotlinTemplate = `package com.example.app
import android.app.Application
import com.facebook.react.PackageList

class MainApplication : Application() {
  override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages.toMutableList()
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

const javaTemplateNoSemicolon = `package com.example.app;
import android.app.Application;
import space.manus.iphone.notification.receiver.AncsServicePackage
import java.util.List;

public class MainApplication extends Application {
  @Override
  protected List<ReactPackage> getPackages() {
    List<ReactPackage> packages = new PackageList(this).getPackages();
    return packages;
  }
}`;

try {
  console.log("Testing Kotlin Template...");
  let res = patchContent(kotlinTemplate, true);
  if (!res.includes(BASE_IMPORT)) throw new Error("Kotlin import missing");
  if (res.includes(BASE_IMPORT + ";")) throw new Error("Kotlin import should not have semicolon");
  
  console.log("Testing Java Template...");
  let resJava = patchContent(javaTemplate, false);
  if (!resJava.includes(BASE_IMPORT + ";")) throw new Error("Java import missing semicolon");

  console.log("Testing Java Normalization (fixing missing semicolon)...");
  let resJavaFix = patchContent(javaTemplateNoSemicolon, false);
  if (!resJavaFix.includes(BASE_IMPORT + ";")) throw new Error("Java normalization failed to add semicolon");
  const count = (resJavaFix.match(new RegExp(BASE_IMPORT, 'g')) || []).length;
  if (count !== 1) throw new Error("Java normalization duplicated import");

  console.log("Testing Idempotency...");
  let resIdem = patchContent(res, true);
  if ((resIdem.match(new RegExp(BASE_IMPORT, 'g')) || []).length !== 1) throw new Error("Kotlin import duplicated");

  console.log("\nAll tests passed!");
} catch (e) {
  console.error("Test failed:", e.message);
  process.exit(1);
}
