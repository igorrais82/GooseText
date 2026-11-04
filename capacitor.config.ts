import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.goosetext.app',
  appName: 'GooseText',
  webDir: 'dist',
  android: {
    backgroundColor: '#fff7f0',
    allowMixedContent: false,
  },
};

export default config;
