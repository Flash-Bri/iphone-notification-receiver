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

// Find MainApplication file (could be .kt or .java)
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

console.log(`🔍 Checking ${path.relative(projectRoot, mainAppPath)}...`);

const content = fs.readFileSync(mainAppPath, 'utf8');
const hasImport = content.includes('import space.manus.iphone.notification.receiver.AncsServicePackage');
const hasRegistration = content.includes('AncsServicePackage()') || content.includes('new AncsServicePackage()');

if (hasImport && hasRegistration) {
  console.log('✅ Success: AncsServicePackage is correctly registered in MainApplication!');
  process.exit(0);
} else {
  if (!hasImport) console.error('❌ Error: Missing import statement in MainApplication');
  if (!hasRegistration) console.error('❌ Error: Missing package registration in MainApplication');
  process.exit(1);
}
