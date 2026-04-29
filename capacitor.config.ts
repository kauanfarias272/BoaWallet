import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.boa.wallet',
  appName: 'BoaWallet',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
  server: {
    // Allow the WebView to open external URLs for OAuth
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0a0a0a',
  },
};

export default config;
