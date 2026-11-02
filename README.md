# Linedrive

Neon 3D one-track runner for iOS. The game itself is a single WebGL page (`game/index.html`, three.js 0.147) that runs inside an Expo app. The app adds in-app purchases (RevenueCat), haptics, saved progress and a global leaderboard.

## How it fits together

| Part | Where | What it does |
| --- | --- | --- |
| Game | `game/index.html` | Rendering, physics, music, skins shop UI, leaderboard UI |
| Bundler | `scripts/build-game.mjs` | Inlines three.js and fonts into `src/gameHtml.ts` so the game works offline. Runs on every `npm install` (including on EAS) |
| App shell | `App.tsx` | Full-screen WebView, saves progress, haptics, RevenueCat purchases |
| Config | `src/config.ts`, `eas.json` | RevenueCat key, leaderboard URL, product IDs |
| Leaderboard | `leaderboard/` | Cloudflare Worker + D1 database |

Edit the game in `game/index.html`, then run `npm run build:game` (or just `npm install`). Open `dist/game.html` in a desktop browser to play it without the app.

## One-time setup

### 1. App Store Connect

1. **Apps → + → New App.** Platform iOS, name *Linedrive* (or the closest available), bundle ID `com.gbymedia.linedrive`, SKU `linedrive`.
2. **Monetization → In-App Purchases → +**, type **Non-Consumable**, one for each:

   | Product ID | Reference name | Suggested price |
   | --- | --- | --- |
   | `com.gbymedia.linedrive.skin.prism` | Prism skin | $0.99 |
   | `com.gbymedia.linedrive.skin.obsidian` | Obsidian skin | $0.99 |
   | `com.gbymedia.linedrive.skin.gold` | Gold skin | $0.99 |
   | `com.gbymedia.linedrive.skin.phantom` | Phantom skin | $0.99 |
   | `com.gbymedia.linedrive.skins.all` | All premium skins | $2.99 |

   Each needs a display name, description and a review screenshot (a screenshot of the Skins screen is fine). The first IAPs must be submitted together with the first app version.
3. Make sure the **Paid Applications agreement** under Business is active, or products won't load.

### 2. RevenueCat

1. Create a project (or reuse one) and add an **App Store** app with bundle ID `com.gbymedia.linedrive`.
2. Connect it to App Store Connect (In-App Purchase key or App Store Connect API key, as RevenueCat asks).
3. **Product catalog → Products → Import** the five products above. No offerings or entitlements are required; the app reads purchased product IDs directly.
4. Copy the **public iOS SDK key** (starts with `appl_`) into `eas.json` → `build.base.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY`.

### 3. Leaderboard (optional — the game works without it)

No command line needed:

1. Cloudflare dashboard → **Storage & Databases → D1 → Create database**, name it `linedrive`. Open its **Console** and run the contents of `leaderboard/schema.sql`.
2. **Workers & Pages → Create → Worker**, name it `linedrive-leaderboard`, deploy the starter, then **Edit code**, replace everything with `leaderboard/src/index.js`, and deploy.
3. Worker → **Settings → Bindings → Add → D1 database**: variable name `DB`, database `linedrive`.
4. Copy the Worker URL (e.g. `https://linedrive-leaderboard.<you>.workers.dev`) into `eas.json` → `EXPO_PUBLIC_LEADERBOARD_URL`.

Or with Wrangler: put the database ID in `leaderboard/wrangler.toml`, then `npx wrangler d1 execute linedrive --remote --file=schema.sql` and `npx wrangler deploy` from `leaderboard/`.

The Worker rejects any new best that's faster than the game's top speed allows for the reported run time.

## Building (no Mac needed)

From any computer with Node, or from the Expo dashboard's GitHub integration:

```bash
npm install
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

The first build asks to link the Expo project and to sign in to your Apple account; EAS creates the certificates and provisioning profile itself. After submit, the build appears in **TestFlight** on your iPhone in roughly 15–30 minutes.

**Testing purchases:** in TestFlight, purchases use the sandbox automatically and you are not charged. Purchases don't work in Expo Go; use a TestFlight or `preview` build.

## Before submitting for review

- Screenshots: 6.9" and 6.5" iPhone, landscape (take them from TestFlight).
- Privacy: the app collects no personal data. If the leaderboard is on, it stores a random player ID and the tag the player types. Declare it accordingly in App Privacy.
- The Skins screen has **Restore purchases**, which App Review checks for.

## Game notes

- The course is seeded (`SEED` in `game/index.html`), so every run is the same track. Change the seed for a new track; old leaderboard scores won't be comparable.
- Graphics start on high and drop to low automatically if the first run averages under ~44 fps. Players can switch with the Graphics button.
- Skins: Core (free), Volt (reach 300 m), Ember (reach 800 m), and four paid skins. Product IDs are defined in both `game/index.html` and `src/config.ts`; keep them in sync.
