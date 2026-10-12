const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
// Use physical CSS modules so Android receives new utility rules reliably on this Metro version.
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './src/global.css', inlineRem: 16, forceWriteFileSystem: true });
