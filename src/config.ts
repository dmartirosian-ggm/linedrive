// App configuration. Values come from EXPO_PUBLIC_* environment variables,
// set in eas.json (per build profile) or a local .env file.

/** RevenueCat public iOS SDK key (starts with "appl_"). Safe to ship in the app. */
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

/** Base URL of the leaderboard Worker, e.g. https://linedrive-leaderboard.you.workers.dev. Empty = device-only best scores. */
export const LEADERBOARD_URL = process.env.EXPO_PUBLIC_LEADERBOARD_URL ?? '';

const PID = 'com.gbymedia.linedrive.';

/** Non-consumable in-app purchases. These IDs must match App Store Connect and the game (game/index.html). */
export const PRODUCT_IDS = [
  PID + 'skin.prism',
  PID + 'skin.obsidian',
  PID + 'skin.gold',
  PID + 'skin.phantom',
  PID + 'skin.jack',
  PID + 'skin.skull',
  PID + 'skin.gift',
  PID + 'trail.bats',
  PID + 'trail.skulls',
  PID + 'trail.gifts',
  PID + 'trail.hearts',
  PID + 'world.haunted',
  PID + 'world.winter',
  PID + 'skins.all',
];
