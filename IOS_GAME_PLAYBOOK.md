# iOS Game Playbook (from Linedrive)

How Dave ships small iOS games without a Mac: build the game as a single WebGL page, wrap it in an Expo app, sell cosmetics through RevenueCat, and build and ship with EAS through the Expo connector. Linedrive is the reference implementation: `github.com/dmartirosian-ggm/linedrive`.

## Stack

- **Game:** one HTML file (`game/index.html`) using three.js 0.147 (the last version with `examples/js` UMD files: EffectComposer, UnrealBloomPass). No build step for the game itself.
- **Bundler:** `scripts/build-game.mjs` inlines three.js and fonts (from `@fontsource`) into `src/gameHtml.ts`, so the app works offline. Runs on `postinstall`, so EAS runs it automatically.
- **App shell:** Expo SDK 58, a single screen: full-screen `react-native-webview` loading the bundled HTML.
- **Native features via a bridge:** saves (AsyncStorage), haptics (expo-haptics), purchases (react-native-purchases), audio in silent mode (expo-audio `setAudioModeAsync({ playsInSilentMode: true })`).
- **Leaderboard:** Cloudflare Worker + D1 (`leaderboard/`). Rejects scores faster than the game's top speed allows for the reported run time.
- **Builds:** EAS Build in the cloud, triggered through the Expo connector from GitHub. TestFlight for testing.

## Bridge protocol (game ↔ app)

Game → app via `window.ReactNativeWebView.postMessage(JSON)`:
`ready`, `save {k, v}`, `haptic {s: light|soft|medium|select|success|death}`, `buy {id}`, `restore`.

App → game via `injectJavaScript("window.LD.receive(msg)")`:
`products {items:[{id, price}]}`, `owned {ids}`, `buyResult {ok, owned, cancelled, error}`, `restoreResult {ok, count}`.

Before load, the app injects `window.__LD_SAVE` (saved data) and `window.__LD_CONFIG` (leaderboard URL, platform). The game falls back to localStorage when not inside the app, so the same file runs on the web.

## Game feel checklist (what made Linedrive feel good)

- Fixed seed course (same track every run) plus instant retry.
- Squash and stretch on jump and land, mid-air flip that snaps to 90°, lean while steering.
- Afterimage ghosts, trail particles, landing dust, near-miss sparks with a "CLOSE" callout.
- Death: slow motion, debris cubes, particle burst, screen flash, chromatic aberration spike, low-pass sweep on the music.
- Recorded tracks (Suno, 128 BPM) alternate per run and restart from the top each run, so the music is tied to the course like The Impossible Game. The synth plays on the menu.
- Everything pulses on the beat (grid, sun, portals, bloom, FOV). Music is synthesized with WebAudio and gains layers as distance grows.
- Palette shifts every 300 m, milestone popup and chime every 100 m.
- Jump buffer (130 ms) and coyote time (90 ms). Holding jump keeps hopping.
- Phone controls: floating analog thumbstick on the left half, big jump button on the right. Landscape orientation.
- Auto graphics: drops to low (no bloom, pixel ratio 1) if the first run averages under ~44 fps; manual toggle too.
- Keep the track in view on tall screens by enforcing a minimum horizontal FOV.

## Monetization pattern

- Non-consumable cosmetic skins: some free, some unlocked by distance (gives free players goals), some paid at $0.99, plus a $2.99 "unlock all" bundle.
- Product IDs: `com.gbymedia.<game>.skin.<name>` and `com.gbymedia.<game>.skins.all`.
- The app reads `customerInfo.allPurchasedProductIdentifiers` directly, so no RevenueCat entitlements or offerings are needed.
- A Restore purchases button is required by App Review.

## Setup order for a new game (what actually worked)

1. **GitHub repo:** Dave creates an empty private repo under `dmartirosian-ggm` (Claude can't create repos); Claude attaches it and pushes.
2. **Expo project:** Dave creates it on expo.dev under the `gbymediallc` account and links the GitHub repo in project settings (the connector can't create projects). Put `owner` and `extra.eas.projectId` in `app.json`.
3. **Bundle ID:** Dave registers it at developer.apple.com → Identifiers (team GBY Media LLC, B7HPM349K9). App Store Connect's New App form only lists registered IDs.
4. **App Store Connect app:** Dave creates it; Claude puts its Apple ID in `eas.json` → `submit.production.ios.ascAppId`.
5. **Signing credentials (one time per app):** from any computer, run `npx eas-cli@latest credentials --platform ios` in the repo and choose production. The Expo connector's token is view-and-run only, so builds fail with "Entity not authorized … AppleAppIdentifier CREATE" until this is done.
6. **RevenueCat (connector):** in project `proj4109f1ac` (GBY Media LLC), create the App Store app with `copy_subscription_key_from_app_id: appab13df11c7` (Spark's In-App Purchase key), register products with `create-product`, then fetch the `appl_` key with `list-app-public-api-keys` and put it in `eas.json` env.
7. **Store products:** RevenueCat can create the in-app purchases in App Store Connect (store state plans) once the app has an **App Store Connect API key (Team Key)**. That's a different key from the In-App Purchase key. Otherwise create them by hand in App Store Connect. The Paid Applications agreement must be active.
8. **Build:** Expo connector `build_run` (platform IOS, profile production, gitRef main, autoSubmit true). Check with `build_info`; read `build_logs` on failure.

## Gotchas hit on Linedrive

- **Network:** in Claude's workspace, `npx expo install` fails (blocked API); use `EXPO_OFFLINE=1 npx expo install …`.
- **WebView types:** react-native-webview 14's class typing collapses to `never` under TypeScript 6; cast the component (see `App.tsx`).
- **Splash screen:** SDK 58 wants the `expo-splash-screen` config plugin, not the top-level `splash` key.
- **Export compliance:** `ios.config.usesNonExemptEncryption` was dropped from the resolved config; set `infoPlist.ITSAppUsesNonExemptEncryption: false` instead.
- **EAS env:** `eas.json` rejects empty-string env values; leave the key out instead.
- **Build numbers:** `appVersionSource: remote` plus `autoIncrement` means you shouldn't set `ios.buildNumber` in `app.json`.
- **Hidden elements:** a standalone HTML page needs its own `[hidden]{display:none!important}`. Without it, hidden overlays block taps (the claude.ai artifact wrapper had been supplying it).
- **Recorded music:** embed MP3s as base64 and play them with WebAudio (`decodeAudioData` + looping `AudioBufferSource`) so the low-pass death sweep and beat sync still work. Keep the base64 in its own ASCII-only string literal and join at runtime with `[a, b, c].join('')`: Hermes stores any string containing a non-ASCII character at 2 bytes per char, and `a + b` gets constant-folded into one string (15 MB vs 10 MB bundle).
- **Overlay stacking:** keep the top bar's z-index above full-screen menus, or its buttons (sound, graphics) become untappable on the menu.
- **Testing without a phone:** headless Chrome via Playwright (`/usr/bin/google-chrome`, swiftshader flags) can load `dist/game.html` with a fake `ReactNativeWebView` to test the bridge and take screenshots.

## Linedrive status (Nov 1, 2026)

- Code: `dmartirosian-ggm/linedrive` on `main`. Web prototype artifact also exists on claude.ai.
- Expo: `@gbymediallc/linedrive`, project ID `56077049-ce45-4e8e-93c4-93799bf85326`.
- App Store Connect: "Linedrive Neon Runner", Apple ID `6829575701`, bundle `com.gbymedia.linedrive`.
- RevenueCat: app `app0cb7f88991` in project `proj4109f1ac`; 5 products registered; public key in `eas.json`.
- First build (`5fca04f7…`) failed on signing credentials. **Next:** run `eas credentials` once, then rebuild with auto-submit to TestFlight.
- Still to do: create the 5 in-app purchases in App Store Connect (needs a Team Key in RevenueCat, or do it by hand); optionally deploy the leaderboard Worker and set `EXPO_PUBLIC_LEADERBOARD_URL`; App Store screenshots, privacy details, review submission.
