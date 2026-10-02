const fs = require('fs');
const path = require('path');
const baseConfig = require('./app.json').expo;

function readLocalMapsKey() {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
    const match = envFile.match(/^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=(.+)$/m);
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || readLocalMapsKey();

const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || '../google-services.json';
if (process.env.EAS_BUILD_PLATFORM === 'android' && !process.env.GOOGLE_SERVICES_JSON) {
  throw new Error('Android EAS builds require the GOOGLE_SERVICES_JSON file environment variable.');
}
if (process.env.GOOGLE_SERVICES_JSON || process.env.EAS_BUILD_PLATFORM === 'android') {
  let firebase;
  try { firebase = JSON.parse(fs.readFileSync(path.resolve(__dirname, googleServicesFile), 'utf8')); }
  catch { throw new Error('GOOGLE_SERVICES_JSON must point to a readable Firebase Android configuration file.'); }
  if (!firebase.client?.some(client => client.client_info?.android_client_info?.package_name === baseConfig.android.package)) {
    throw new Error('Firebase Android configuration does not match the app package.');
  }
}

if (!googleMapsApiKey) {
  console.warn(
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Android MapView will not work until it is configured.'
  );
}

module.exports = {
  ...baseConfig,

  android: {
    ...baseConfig.android,
    googleServicesFile,
  },

  plugins: [
    ...(baseConfig.plugins ?? []),

    'expo-image',
    'expo-web-browser',

    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
      },
    ],
  ],
};