import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cn.mengstudystudio.app',
  appName: 'StudyStudio',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    hostname: 'localhost',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#fafafa',
  },
};

export default config;
