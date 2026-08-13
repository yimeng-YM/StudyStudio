import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cn.mengstudystudio.app',
  appName: 'StudyStudio',
  webDir: 'dist',
  server: {
    // Keep the packaged page and the in-app loopback search gateway in the
    // same clear-text address space. External AI/search traffic remains HTTPS.
    androidScheme: 'http',
    hostname: 'localhost',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#fafafa',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      hidden: false,
    },
  },
};

export default config;
