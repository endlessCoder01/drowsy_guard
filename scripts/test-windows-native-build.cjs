const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pluginFile = path.join(__dirname, '..', 'plugins', 'withWindowsNativeBuild.js');
const source = fs.readFileSync(pluginFile, 'utf8');
const registeredMods = [];
const sandbox = {
  module: { exports: {} },
  require(name) {
    assert.equal(name, '@expo/config-plugins');
    return {
      withProjectBuildGradle(config, callback) {
        registeredMods.push(callback);
        return config;
      },
    };
  },
};
vm.runInNewContext(source, sandbox, { filename: pluginFile });

const config = { name: 'DrowsyGuard' };
assert.equal(sandbox.module.exports(config), config);
assert.equal(registeredMods.length, 1, 'The plugin must register its project Gradle mod.');
const applyMod = registeredMods[0];
const apply = (contents, language = 'groovy') => {
  const mod = { modResults: { contents, language } };
  assert.equal(applyMod(mod), mod);
  return mod.modResults.contents;
};

const begin = '// @generated begin drowsyguard-windows-native-build';
const end = '// @generated end drowsyguard-windows-native-build';
const original = '// User Gradle configuration\nbuildscript { repositories { google() } }\n';
const once = apply(original);
assert.ok(once.startsWith(original), 'Existing project Gradle configuration must survive.');
assert.equal(apply(once), once, 'Repeated prebuilds must produce identical output.');
assert.equal(once.split(begin).length - 1, 1, 'Only one generated block is allowed.');
assert.equal(once.split(end).length - 1, 1);

const tail = '\n// Independent Gradle configuration\nallprojects { repositories { mavenCentral() } }\n';
const stale = `${original}${begin}\n// Old generated implementation\n${end}${tail}`;
const updated = apply(stale);
assert.ok(updated.startsWith(original));
assert.ok(updated.endsWith(tail), 'Updating the block must preserve following Gradle content.');
assert.ok(!updated.includes('Old generated implementation'));
assert.equal(apply(updated), updated);
assert.equal(updated.split(begin).length - 1, 1);

const crlf = apply(original.replace(/\n/g, '\r\n'));
assert.equal(crlf.replace(/\r\n/g, '').includes('\n'), false, 'Preserve the template newline style.');
assert.equal(apply(crlf), crlf);

assert.throws(() => apply(original, 'kotlin'), /Groovy/);
assert.throws(() => apply(`${original}${begin}\n// Incomplete block`), /incomplete or duplicate/);
assert.throws(() => apply(`${once}${begin}\n${end}\n`), /incomplete or duplicate/);

// Keep the change scoped to the affected Windows libraries, with distinct caches
// and a callback that runs before the Android DSL locks.
const generated = once.slice(once.indexOf(begin), once.indexOf(end));
assert.match(generated, /if \(System\.getProperty\('os\.name'\)\.toLowerCase\(\)\.contains\('windows'\)\)\s*\{/);
assert.match(generated, /'react-native-worklets-core': 'worklets'/);
assert.match(generated, /'react-native-vision-camera': 'camera'/);
assert.match(generated, /def cacheName = nativeBuildCaches\[nativeProject\.name\]\s*if \(cacheName != null\)\s*\{\s*nativeProject\.plugins\.withId\('com\.android\.library'\)\s*\{\s*nativeProject\.extensions\.getByName\('androidComponents'\)\.finalizeDsl/);
assert.match(generated, /androidDsl\.externalNativeBuild\.cmake\.buildStagingDirectory = new File\(rootProject\.projectDir, '\.cxx\/' \+ cacheName\)/);
assert.doesNotMatch(generated, /afterEvaluate|abiFilters|reactNativeArchitectures|dependencies\s*\{|\.\/build\/|['"]build\//);

console.log('Windows native build plugin checks passed.');
