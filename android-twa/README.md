# Shmeera — Android TWA (Trusted Web Activity)

Wraps the installable PWA at `https://shmeera.com` in a real Android app for
Play Store distribution, using [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
No app code lives here — this is purely a thin native shell around the web
app; the actual app lives in `client/`.

**Everything in this directory except `twa-manifest.json`, `gen-manifest.js`,
`package.json`, and this README is regenerated, not committed** (same
principle as `client/dist/`). To rebuild from scratch, follow the steps
below in order — they encode several non-obvious fixes needed to get this
working at all in a Windows + Git Bash environment with no prior bubblewrap
setup.

## One-time environment setup

This assumes Android Studio (with its bundled JDK and a full Android SDK,
including `build-tools;36.1.0`) is already installed — check
`%LOCALAPPDATA%\Android\Sdk` exists first.

1. **Install bubblewrap**: `npm install -g @bubblewrap/cli`
2. **Write its config directly instead of running the interactive wizard**
   (the wizard's multi-prompt flow reliably crashes with
   `ERR_USE_AFTER_CLOSE` on piped/non-TTY stdin — this is a bubblewrap/
   inquirer bug, not an environment misconfiguration). Create
   `~/.bubblewrap/config.json`:
   ```json
   {"jdkPath":"C:/jbr","androidSdkPath":"C:/Users/<you>/AppData/Local/Android/Sdk"}
   ```
3. **Create a no-space junction to the JDK**: bubblewrap's apksigner
   invocation on Windows doesn't quote the Java executable path, so a JDK
   under `C:\Program Files\...` (any path with spaces) breaks it with
   `'C:\Program' is not recognized...`. Work around it with a junction:
   ```powershell
   New-Item -ItemType Junction -Path "C:\jbr" -Target "C:\Program Files\Android\Android Studio\jbr"
   ```
   (This is why the config above points `jdkPath` at `C:/jbr`, not the real path.)

## Regenerating the project (after any web manifest change)

Run everything below from **PowerShell**, not Git Bash — bubblewrap shells
out to `gradlew.bat`, and that invocation's stdout/exit-code handling is
unreliable through Git Bash's `cmd.exe` wrapping (commands silently produce
no output). `npm install` once in this directory to get `@bubblewrap/core`
(used by `gen-manifest.js`), then:

```powershell
cd android-twa
node gen-manifest.js   # fetches https://shmeera.com/manifest.json, writes twa-manifest.json
```

`gen-manifest.js` calls `fetchUtils.setFetchEngine("node-fetch")` before
fetching — bubblewrap's default `fetch-h2` engine gets a 403/HTML response
from Hostinger's CDN for reasons never fully diagnosed (possibly its spoofed
old-Firefox user agent or HTTP/2 negotiation tripping something on the CDN
side); plain `node-fetch` works fine against the same URL. The same flag is
needed on the CLI itself (`--fetchEngine=node-fetch`) for the icon downloads
in the next step.

If `twa-manifest.json`'s `packageId` or any other field needs to change,
edit the file directly, then:

```powershell
$env:JAVA_HOME = "C:\jbr"
$env:ANDROID_HOME = "C:\Users\<you>\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
bubblewrap update --skipVersionUpgrade --fetchEngine=node-fetch
```

**Required manual fix after every `update`** (bubblewrap's template is
stale): open the generated root `build.gradle` and replace both `jcenter()`
lines with `mavenCentral()`. JCenter/Bintray has been shut down for years;
Gradle fails with an SSL `bad_record_mac` error trying to reach it, which
reads like a network/proxy problem but isn't one.

## Signing key

Generate once, keep forever (losing it means you can never update the app
under the same package id once published — unless already enrolled in Play
App Signing, see below):

```powershell
& "C:\jbr\bin\keytool.exe" -genkeypair -v -keystore android.keystore -alias shmeera `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -dname "CN=Shmeera, OU=Shmeera, O=Shmeera, L=Unknown, ST=Unknown, C=US"
```

Store the password somewhere durable outside this repo (a password manager —
`keystore-credentials.txt` in this directory is gitignored but is not a
real backup). Put the keystore's SHA-256 fingerprint
(`keytool -list -v -keystore android.keystore -alias shmeera`) into
`twa-manifest.json`'s `fingerprints` array **and** into
`client/public/.well-known/assetlinks.json` — both must match the
certificate of whatever APK is actually installed, or the TWA falls back to
showing a browser address bar instead of running full-screen.

## Building

```powershell
$env:Path = "$PWD;" + $env:Path   # see note below
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = "<password>"
$env:BUBBLEWRAP_KEY_PASSWORD = "<password>"
bubblewrap build --skipPwaValidation
```

Prepending the project directory to `PATH` works around bubblewrap invoking
`gradlew.bat` in a way that otherwise fails with `'gradlew.bat' is not
recognized...` even though the file exists in the current directory and the
`cwd` option is set correctly — root cause not fully diagnosed, but adding
the directory to `PATH` reliably fixes it.

Outputs `app-release-signed.apk` (for sideloading onto a test device —
`adb install app-release-signed.apk`) and `app-release-bundle.aab` (the file
to actually upload to Play Console).

## Play Store distribution — what's left (not automatable from here)

1. A Google Play Console developer account ($25 one-time, needs the
   account owner's identity/payment details).
2. Enroll in **Play App Signing** on first upload — Google then re-signs the
   app with its own key for distribution, and reveals that key's SHA-256
   fingerprint. **Add that fingerprint as a second entry** in
   `client/public/.well-known/assetlinks.json` — end users install the
   Google-signed APK, not the one built here, so the live site needs to
   trust both.
3. Store listing: screenshots, description, content rating questionnaire,
   and — since this app handles children's personal data by design — Play's
   **Families Policy** compliance declarations. Expect this review to take
   longer than everything above combined.
4. `android:minSdkVersion` is 21 (Android 5.0+) by bubblewrap's default,
   generous enough not to need changing.
