const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Only bundle for native platforms — prevents accidental web bundling
// which fails on native-only modules like ReactDevToolsSettingsManager
config.resolver.platforms = ['ios', 'android'];

module.exports = config;
