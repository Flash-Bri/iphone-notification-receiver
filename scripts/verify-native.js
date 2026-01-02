/**
 * Verification script to check if AncsServicePackage is correctly registered
 * in the generated Android project after expo prebuild.
 * 
 * This script is robust and handles various patching styles (apply, add, etc.)
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const androidDir = path.join(projectRoot, 'android');

if (!fs.existsSync(androidDir)) {
  console.error('❌ Error: android/ directory not found. Did you run "npx expo prebuild"?');
  process.exit(1);
}

const searchDir = path.join(androidDir, 'app', 'src', 'main', 'java');
let mainAppPath = null;

function findMainApp(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findMainApp(fullPath);
    } else if (file === 'MainApplication.kt' || file === 'MainApplication.java') {
      mainAppPath = fullPath;
    }
  }
}

try {
  findMainApp(searchDir);
} catch (e) {
  console.error('❌ Error searching for MainApplication:', e.message);
  process.exit(1);
}

if (!mainAppPath) {
  console.error('❌ Error: Could not find MainApplication.kt or MainApplication.java');
  process.exit(1);
}

const isKotlin = mainAppPath.endsWith('.kt');
console.log(`🔍 Checking ${path.relative(projectRoot, mainAppPath)} (${isKotlin ? 'Kotlin' : 'Java'})...`);

const content = fs.readFileSync(mainAppPath, 'utf8');

// 1. Robust Import Check
// Matches 'import space.manus.iphone.notification.receiver.AncsServicePackage' with or without semicolon
const importRegex = /import\s+space\.manus\.iphone\.notification\.receiver\.AncsServicePackage;?/;
const hasImport = importRegex.test(content);

// 2. Robust Registration Check
// Kotlin: matches 'add(AncsServicePackage())' or 'packages.add(AncsServicePackage())'
// Java: matches 'add(new AncsServicePackage())' or 'packages.add(new AncsServicePackage())'
const kotlinRegRegex = /add\s*\(\s*AncsServicePackage\s*\(\s*\)\s*\)/;
const javaRegRegex = /add\s*\(\s*new\s+AncsServicePackage\s*\(\s*\)\s*\)/;

const hasRegistration = isKotlin ? kotlinRegRegex.test(content) : javaRegRegex.test(content);

if (hasImport && hasRegistration) {
  console.log('✅ Success: AncsServicePackage is correctly registered in MainApplication!');
  process.exit(0);
} else {
  if (!hasImport) {
    console.error('❌ Error: Missing import statement for AncsServicePackage');
  }
  if (!hasRegistration) {
    const expected = isKotlin ? 'add(AncsServicePackage())' : 'add(new AncsServicePackage())';
    console.error(`❌ Error: Missing package registration. Expected something matching: ${expected}`);
  }
  process.exit(1);
}
