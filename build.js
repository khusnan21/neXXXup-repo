/**
 * Custom raw builder for SkyStream Built-in Plugins.
 * Generates raw .js and .json files directly without .sky wrapping.
 */

const fs = require('fs');
const path = require('path');

// Target directory paths
const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read repository config
const repoJsonPath = path.join(rootDir, 'repo.json');
let repoJson = {};
if (fs.existsSync(repoJsonPath)) {
  repoJson = JSON.parse(fs.readFileSync(repoJsonPath, 'utf8'));
}

// Scan directories for plugins (excluding standard ones)
const ignoredDirs = ['.git', '.github', 'dist', 'deploy', 'node_modules'];
const items = fs.readdirSync(rootDir, { withFileTypes: true });
const pluginDirs = items
  .filter(item => item.isDirectory() && !ignoredDirs.includes(item.name))
  .map(item => item.name);

const pluginsList = [];

console.log(`Starting build. Scanning for plugin directories...`);

for (const dir of pluginDirs) {
  const pluginJsonPath = path.join(rootDir, dir, 'plugin.json');
  const pluginJsPath = path.join(rootDir, dir, 'plugin.js');

  if (fs.existsSync(pluginJsonPath) && fs.existsSync(pluginJsPath)) {
    try {
      const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      const packageName = pluginJson.packageName;

      if (!packageName) {
        console.warn(`[WARNING] Skip directory "${dir}": packageName is missing in plugin.json.`);
        continue;
      }

      // 1. Copy plugin.js as raw <packageName>.js
      const rawJsName = `${packageName}.js`;
      const destJsPath = path.join(distDir, rawJsName);
      fs.copyFileSync(pluginJsPath, destJsPath);

      // 2. Copy plugin.json as raw <packageName>.json
      const rawJsonName = `${packageName}.json`;
      const destJsonPath = path.join(distDir, rawJsonName);
      fs.copyFileSync(pluginJsonPath, destJsonPath);

      // 3. Create raw URL mapping based on GitHub repo branch structure
      const githubRepo = process.env.GITHUB_REPOSITORY || 'techmind09/skystream-nsfw';
      const baseUrl = `https://raw.githubusercontent.com/${githubRepo}/repo/dist`;

      // 4. Add plugin metadata with direct references
      const pluginEntry = {
        ...pluginJson,
        url: `${baseUrl}/${rawJsName}`,
        jsonUrl: `${baseUrl}/${rawJsonName}`
      };

      pluginsList.push(pluginEntry);
      console.log(`✓ Copied and mapped: ${pluginJson.name} -> ${rawJsName}`);
    } catch (e) {
      console.error(`[ERROR] Failed compiling ${dir}:`, e.message);
    }
  } else {
    console.log(`[INFO] Skipped directory "${dir}" (Missing plugin.json or plugin.js)`);
  }
}

// Write the compiled plugins.json file listing all raw plugins
fs.writeFileSync(
  path.join(distDir, 'plugins.json'),
  JSON.stringify(pluginsList, null, 2),
  'utf8'
);

console.log(`\n🎉 Success! Combined plugins.json generated with ${pluginsList.length} plugins.`);
