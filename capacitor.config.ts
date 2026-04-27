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
    // Prevent horizontal scrolling / content wider than viewport
    overScrollMode: 'never' as any,
    // Ensure WebView fits within the screen bounds
    initialFocus: false as any,
    backgroundColor: '#0a0a0a',
  },
};

export default config;
