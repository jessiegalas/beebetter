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

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || readLocalMapsKey();

if (!googleMapsApiKey) {
  console.warn(
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Android MapView will not work until it is configured.'
  );
}

module.exports = {
  ...baseConfig,
  plugins: [
    ...baseConfig.plugins,
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
      },
    ],
  ],
};
