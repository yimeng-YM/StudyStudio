# StudyStudio Android

StudyStudio now ships as a Capacitor Android application with an in-process
search gateway. The APK does not require Docker, Python, `start-search.bat`, or
another computer.

## Architecture

- The React/Vite application is bundled into the APK by Capacitor.
- The Android process starts a native HTTP gateway on
  `http://127.0.0.1:17890/api`.
- The gateway implements the existing health, web search, image search, and
  static page extraction endpoints, so the front-end tools keep the same API.
- Search uses HTTPS web sources with fallback and a five-minute memory cache.
- Page extraction uses OkHttp and Jsoup on the device with a 24-hour memory
  cache. JavaScript-only or login-protected pages are not rendered with a
  headless browser and return a clear error instead.
- The desktop build is unchanged and can continue to use the separate
  FastAPI/SearXNG service from the `search` checkout.

## Security boundaries

- The gateway listens on Android loopback only and is not exposed to the LAN.
- Only StudyStudio's packaged `localhost` origins are accepted.
- Extracted URLs must use HTTP(S) on ports 80 or 443.
- Loopback, private, link-local, multicast, reserved local hostnames, unsafe
  redirects, and downloads larger than 5 MB are rejected.
- Clear-text traffic is allowed only for the in-app loopback server; external
  search, extraction, and AI traffic remains HTTPS.

## Build

Requirements:

- Node.js and npm
- Android SDK with platform 36
- JDK 21

Run from PowerShell at the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-android.ps1
```

The script regenerates branded Android resources, builds the Vite application,
syncs Capacitor, compiles an installable debug-signed APK, and prints its size
and SHA-256. The versioned output is:

```text
release\StudyStudio-v<version>-debug.apk
```

For day-to-day work, these npm commands are also available:

```powershell
npm run android:assets
npm run android:sync
npm run android:apk
```

The debug APK can be installed directly with `adb install -r <apk-path>`. A
store release still requires a private release signing key and the corresponding
Gradle signing configuration.
