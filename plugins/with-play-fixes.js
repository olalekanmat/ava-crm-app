// Fixes Google Play's pre-launch warnings on Android release builds:
// - turns on R8 shrinking and obfuscation (Play's "DEX code optimization" check) and adds keep rules;
// - drops the status/navigation bar colours from the app theme, which Android 15+ ignores (Play's "deprecated edge-to-edge" check).
const { withAndroidStyles, withGradleProperties, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KEEP_RULES = `
# Ava CRM (plugins/with-play-fixes.js): keep code reached by reflection or from JavaScript.
-keep class expo.modules.** { *; }
-keep class * implements expo.modules.kotlin.records.Record { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class com.avacrm.app.** { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-dontwarn expo.modules.**
`;

const DEPRECATED_THEME_ITEMS = ['android:statusBarColor', 'android:navigationBarColor'];

module.exports = function withPlayFixes(config) {
  config = withGradleProperties(config, (cfg) => {
    for (const key of ['android.enableMinifyInReleaseBuilds']) {
      cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      cfg.modResults.push({ type: 'property', key, value: 'true' });
    }
    return cfg;
  });

  config = withAndroidStyles(config, (cfg) => {
    for (const style of cfg.modResults.resources.style ?? []) {
      if (style.item) style.item = style.item.filter((i) => !DEPRECATED_THEME_ITEMS.includes(i.$.name));
    }
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes('plugins/with-play-fixes.js')) fs.writeFileSync(file, current + KEEP_RULES);
      return cfg;
    },
  ]);
};
