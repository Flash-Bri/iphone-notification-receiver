/**
 * Verification script to check if AncsServicePackage is correctly registered
 * in the generated Android project after expo prebuild.
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
const baseImport = 'import space.manus.iphone.notification.receiver.AncsServicePackage';
const expectedImport = isKotlin ? baseImport : `${baseImport};`;

const hasImport = content.includes(expectedImport);
const hasRegistration = isKotlin 
  ? content.includes('packages.add(AncsServicePackage())')
  : content.includes('packages.add(new AncsServicePackage())');

if (hasImport && hasRegistration) {
  console.log('✅ Success: AncsServicePackage is correctly registered in MainApplication!');
  process.exit(0);
} else {
  if (!hasImport) {
    if (!isKotlin && content.includes(baseImport)) {
      console.error(`❌ Error: Java import is missing the required semicolon: "${baseImport}"`);
    } else {
      console.error(`❌ Error: Missing import statement: "${expectedImport}"`);
    }
  }
  if (!hasRegistration) {
    const expectedReg = isKotlin ? 'packages.add(AncsServicePackage())' : 'packages.add(new AncsServicePackage())';
    console.error(`❌ Error: Missing package registration: "${expectedReg}"`);
  }
  process.exit(1);
}
