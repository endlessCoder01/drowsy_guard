const fs = require('fs/promises');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const NATIVE_PACKAGE = 'com.drowsyguard.drive';

// Keep the native implementation in source control; android/ is generated.
module.exports = function withDriveMode(config) {
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const permissions = manifest['uses-permission'] || (manifest['uses-permission'] = []);
    for (const permission of [
      { 'android:name': 'android.permission.ACCESS_NOTIFICATION_POLICY' },
      { 'android:name': 'android.permission.BLUETOOTH', 'android:maxSdkVersion': '30' },
      { 'android:name': 'android.permission.BLUETOOTH_CONNECT' },
    ]) {
      if (!permissions.some((entry) => entry.$['android:name'] === permission['android:name'])) {
        permissions.push({ $: permission });
      }
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const services = application.service || (application.service = []);
    const name = `${NATIVE_PACKAGE}.DriveConditionService`;
    if (!services.some((entry) => entry.$['android:name'] === name)) {
      services.push({
        $: {
          'android:name': name,
          'android:label': 'DrowsyGuard drive focus',
          'android:permission': 'android.permission.BIND_CONDITION_PROVIDER_SERVICE',
          'android:exported': 'true',
          'android:process': ':driveFocus',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.notification.ConditionProviderService' } }] }],
        'meta-data': [
          { $: { 'android:name': 'android.service.zen.automatic.ruleType', 'android:value': 'DrowsyGuard drive focus' } },
          { $: { 'android:name': 'android.service.zen.automatic.ruleInstanceLimit', 'android:value': '1' } },
        ],
      });
    }
    return mod;
  });

  config = withMainApplication(config, (mod) => {
    const registration = 'packages.add(com.drowsyguard.drive.DriveModePackage())';
    if (!mod.modResults.contents.includes(registration)) {
      if (mod.modResults.language !== 'kt') {
        throw new Error('withDriveMode requires the Expo Kotlin MainApplication template.');
      }
      const anchor = 'val packages = PackageList(this).packages';
      if (!mod.modResults.contents.includes(anchor)) {
        throw new Error('withDriveMode could not find the MainApplication package list.');
      }
      mod.modResults.contents = mod.modResults.contents.replace(anchor, `${anchor}\n            ${registration}`);
    }
    return mod;
  });

  return withDangerousMod(config, ['android', async (mod) => {
    const source = path.join(__dirname, 'drive-mode', 'android');
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', ...NATIVE_PACKAGE.split('.'));
    await fs.mkdir(destination, { recursive: true });
    for (const file of ['DriveModePackage.kt', 'DriveModeModule.kt', 'DriveConditionService.kt']) {
      await fs.copyFile(path.join(source, file), path.join(destination, file));
    }
    return mod;
  }]);
};
