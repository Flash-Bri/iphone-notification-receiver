/**
 * Test script for Universal MainApplication patching logic
 */

const BASE_IMPORT = "import space.manus.iphone.notification.receiver.AncsServicePackage";
const PACKAGE_NAME = "AncsServicePackage";

function patchContent(content, filePath) {
  const isKotlin = filePath.endsWith('.kt');
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
    content = content.replace(importRegex, `${importStatement}\n`);
  }

  // 2. Idempotent Package Registration
  if (content.includes(PACKAGE_NAME + "(")) {
    return content; // Already registered
  }

  if (isKotlin) {
    // Kotlin Universal Patching
    const registration = `.apply { add(${PACKAGE_NAME}()) }`;
    
    // 1. Match 'val packages = PackageList(this).packages...'
    const valRegex = /(val\s+packages\s*=\s*PackageList\(this\)\.packages(?:\.toMutableList\(\))?)(?=\n|\s+return|\s+as)/;
    if (valRegex.test(content)) {
      return content.replace(valRegex, (match, p1) => {
        const base = p1.includes('.toMutableList()') ? p1 : `${p1}.toMutableList()`;
        return `${base}${registration}`;
      });
    }

    // 2. Match 'return PackageList(this).packages...'
    const returnRegex = /(return\s+PackageList\(this\)\.packages(?:\.toMutableList\(\))?)(?=\n|;|\s+as)/;
    if (returnRegex.test(content)) {
      return content.replace(returnRegex, (match, p1) => {
        const base = p1.includes('.toMutableList()') ? p1 : `${p1}.toMutableList()`;
        return `${base}${registration}`;
      });
    }

    // 3. Match expression body 'override fun getPackages(): List<ReactPackage> = PackageList(this).packages...'
    const expressionRegex = /(=(\s+)PackageList\(this\)\.packages(?:\.toMutableList\(\))?)/;
    if (expressionRegex.test(content)) {
      return content.replace(expressionRegex, (match, p1) => {
        const base = p1.includes('.toMutableList()') ? p1 : `${p1}.toMutableList()`;
        return `${base}${registration}`;
      });
    }

    throw new Error(`[withAncsForegroundService] FAILED TO PATCH MainApplication.kt\nREASON: Could not find Kotlin package list insertion point.`);
  } else {
    // Java Universal Patching
    // 1. Match 'List<ReactPackage> packages = new PackageList(this).getPackages();'
    const listRegex = /List<ReactPackage>\s+packages\s*=\s*new\s+PackageList\(this\)\.getPackages\(\);/;
    if (listRegex.test(content)) {
      return content.replace(listRegex, `List<ReactPackage> packages = new java.util.ArrayList<>(new PackageList(this).getPackages());\n      packages.add(new ${PACKAGE_NAME}());`);
    }

    // 2. Match 'return new PackageList(this).getPackages();'
    const returnJavaRegex = /return\s+new\s+PackageList\(this\)\.getPackages\(\);/;
    if (returnJavaRegex.test(content)) {
      return content.replace(returnJavaRegex, `List<ReactPackage> packages = new java.util.ArrayList<>(new PackageList(this).getPackages());\n      packages.add(new ${PACKAGE_NAME}());\n      return packages;`);
    }

    throw new Error(`[withAncsForegroundService] FAILED TO PATCH MainApplication.java\nREASON: Could not find Java package list insertion point.`);
  }
}

// Test Cases
const cases = [
  {
    name: "Kotlin val block-body",
    file: "MainApplication.kt",
    content: `override fun getPackages(): List<ReactPackage> {
      val packages = PackageList(this).packages.toMutableList()
      return packages
    }`,
    expected: "add(AncsServicePackage())"
  },
  {
    name: "Kotlin direct-return",
    file: "MainApplication.kt",
    content: `override fun getPackages(): List<ReactPackage> {
      return PackageList(this).packages
    }`,
    expected: ".apply { add(AncsServicePackage()) }"
  },
  {
    name: "Kotlin expression-body",
    file: "MainApplication.kt",
    content: `override fun getPackages(): List<ReactPackage> = PackageList(this).packages`,
    expected: ".apply { add(AncsServicePackage()) }"
  },
  {
    name: "Java direct-return",
    file: "MainApplication.java",
    content: `protected List<ReactPackage> getPackages() {
      return new PackageList(this).getPackages();
    }`,
    expected: "packages.add(new AncsServicePackage())"
  }
];

try {
  cases.forEach(c => {
    console.log(`Testing ${c.name}...`);
    const res = patchContent(c.content, c.file);
    if (!res.includes(c.expected)) {
      console.error(`Failed ${c.name}`);
      console.error("Result:", res);
      throw new Error(`Expected registration not found in ${c.name}`);
    }
  });

  console.log("\nTesting Idempotency...");
  const initial = cases[0].content;
  const first = patchContent(initial, "MainApplication.kt");
  const second = patchContent(first, "MainApplication.kt");
  const count = (second.match(/AncsServicePackage/g) || []).length;
  if (count !== 1) throw new Error("Idempotency failed: duplicated registration");

  console.log("\nAll universal patching tests passed!");
} catch (e) {
  console.error("Test failed:", e.message);
  process.exit(1);
}
