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
   | `com.gbymedia.linedrive.skins.all` | Unlock everything | $2.99 |

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
4. Copy the Worker URL (e.g. `https://linedrive-leaderboard.<you>.workers.dev`) into `eas.json` as `build.base.env.EXPO_PUBLIC_LEADERBOARD_URL` (add the line; EAS rejects an empty value).

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

- Music: every `.mp3` in `game/music/` is embedded in the app (`npm run build:game`). Runs alternate between the tracks and each run starts its track from the top. Tracks must be 128 BPM so the beat-synced visuals line up; the first downbeat offset is `TRACK_OFFSET` in `game/index.html`. Add a track by dropping in the file and adding it to `TRACKS`. Encode at 128 kbps (`ffmpeg -i in.mp3 -b:a 128k out.mp3`) to keep the app small. The built-in synth still plays on the menu and as a fallback.

- The course is seeded (`SEED` in `game/index.html`), so every run is the same track. Change the seed for a new track; old leaderboard scores won't be comparable.
- Graphics start on high and drop to low automatically if the first run averages under ~44 fps. Players can switch with the Graphics button.
- Locker (unlockables), in three tabs. Product IDs are defined in both `game/index.html` and `src/config.ts`; keep them in sync. The `skins.all` bundle unlocks **everything** in the Locker, premium and earned.
  - Earned items unlock from five stats: best run (`reach`), runs played (`tries`), lifetime distance (`total`), lifetime close calls (`close`) and lifetime jumps (`jumps`). The death screen shows the closest next unlock with a progress bar, and the Locker shows progress on every locked item.
  - Boxes: Core (free); earned: Smiley, Checkered, Volt, Spectrum, Old Glory (USA flag, 600 m), Ember, Candy Cane, Frost, Tiger, Toxic, Disco, Watermelon, Galaxy, Pop Art, Circuit, Magma, Neon Zebra; paid: Jack, Skull, Gift, Prism, Obsidian, Gold, Phantom. Pattern boxes are drawn on a canvas at runtime (`PATS`).
  - Trails: Neon (free); earned: Superstar, Red White Blue, Stardust, Snowfall, Rainbows, Flag Parade (76 runs), Hot Streak, Lightning, Beats, Prism Neon, Lucky, Pizza Party, Blossom, Diamonds, Fireworks, Unicorns, Donuts, Invaders, Eagles, Rockets, Cash Flow; paid: Bats, Skulls, Gifts, Hearts. Emoji trails are sprites in a canvas atlas; color trails override the box's trail colors.
  - Worlds: Synthwave (free); earned: Deep Space, Sunset Strip, Fourth of July (1776 m, fireworks), Northern Lights, Candyland (confetti), Inferno (embers), Mainframe (data rain), Rainbow Road; paid: Haunted, Winter. Each world sets its own palette cycle, sky (sun, moon or ringed planet), horizon silhouette and ambient effects.
  - Paint: paint jobs that recolor the floor, rails and obstacles and override the world's palette. World Colors (free); earned: Checker Flag, Stars & Stripes, Rainbow Rush, Toxic Waste, Bubblegum, Black Ice, Blood Moon, Gold Rush, Deep Ocean, Lava Floor, Monochrome, Disco Floor. Floor styles (`uFloor` in the floor shader): grid, checker, stripes, diamonds, polka dots, disco tiles, flowing lava.
  - Music: 26 songs (4 starters, the rest earned). Unlocked songs join the player's queue automatically; each run plays a shuffled song from the queue, and players can preview songs or take them out of the queue.

### Music

- Source files live in `game/music`, listed in `game/music/tracks.json` (id, name, genre, unlock rule, `off` = time of the first kick so the beat pulse lines up). Every song must be 128 BPM; the game loops the first 120 s (256 beats).
- `node scripts/encode-music.mjs` (needs ffmpeg) trims each song to the loop, normalizes loudness and writes `assets/music/<id>.mp3`. Run it after adding songs and commit `assets/music`. EAS doesn't run it.
- The app ships `assets/music` as native assets (`src/musicAssets.ts` is generated by the build). The game asks for a song (`{t:'track'}`) right before it needs it, and the app sends the file back in base64 chunks, so the JavaScript bundle stays small and only ~3 decoded songs are in memory at once.
- To add a song: put the MP3 in `game/music`, add an entry to `tracks.json`, run `node scripts/encode-music.mjs`, then `npm run build:game`.
  - Box textures and skyline silhouettes live in `game/tex/` (generated with Replicate's flux-schnell) and are embedded by the build.

## Ads (AdMob)

Interstitial ads show between runs only: when the player taps Retry, at most once every 3 runs and 2 minutes, never in a session's first 3 runs. Any in-app purchase turns ads off. The first time ads are needed (after the second run), the app shows Google's consent form where the law requires it (EU/UK), then Apple's tracking prompt; players who decline get non-personalized ads.

The app ships with Google's **test** IDs until you replace them:

1. AdMob → Apps → Add app → iOS, "Linedrive Neon Runner". Copy the **App ID** (`ca-app-pub-…~…`) into `app.json` → plugin `react-native-google-mobile-ads` → `iosAppId`.
2. In that app, Ad units → Add → **Interstitial**. Copy the **ad unit ID** (`ca-app-pub-…/…`) into `eas.json` → `build.base.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS`.
3. Privacy & messaging → create a **GDPR** message for the app (required to serve ads in the EU/UK) and publish it.
4. Rebuild. App Store Connect → App Privacy must declare what the AdMob SDK collects (see Google's "Data disclosure" page for the current list).
