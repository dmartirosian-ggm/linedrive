// Interstitial ads between runs (Google AdMob).
// Flow at launch: Google's consent form (only shown where the law requires it, e.g. the EU),
// then Apple's tracking prompt, then the SDK starts and preloads one ad.
import { Platform } from 'react-native';
import mobileAds, { AdEventType, AdsConsent, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { ADMOB_INTERSTITIAL_IOS } from './config';

const UNIT = ADMOB_INTERSTITIAL_IOS || TestIds.INTERSTITIAL;

let started: Promise<boolean> | null = null;
let personalized = false;
let ad: InterstitialAd | null = null;
let loaded = false;
let loading = false;

function load() {
  if (loading || loaded) return;
  loading = true;
  ad = InterstitialAd.createForAdRequest(UNIT, { requestNonPersonalizedAdsOnly: !personalized });
  const offLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
    loaded = true;
    loading = false;
  });
  const offError = ad.addAdEventListener(AdEventType.ERROR, () => {
    loaded = false;
    loading = false;
    offLoaded();
    offError();
    setTimeout(load, 60_000); // no fill or offline: try again later
  });
  ad.load();
}

/** Ask for consent and tracking permission, start the SDK and preload an ad. Safe to call more than once. */
export function startAds(): Promise<boolean> {
  if (Platform.OS !== 'ios') return Promise.resolve(false);
  started ??= (async () => {
    try {
      const consent = await AdsConsent.gatherConsent().catch(() => null);
      if (consent && !consent.canRequestAds) return false;
      const att = await requestTrackingPermissionsAsync().catch(() => null);
      personalized = att?.granted === true;
      await mobileAds().initialize();
      load();
      return true;
    } catch (e) {
      console.warn('ads start failed', e);
      return false;
    }
  })();
  return started;
}

/** Show the preloaded interstitial. Resolves once it is closed (true) or right away if none is ready (false). */
export function showInterstitial(): Promise<boolean> {
  if (!ad || !loaded) {
    load();
    return Promise.resolve(false);
  }
  const current = ad;
  loaded = false;
  return new Promise((resolve) => {
    let done = false;
    const finish = (shown: boolean) => {
      if (done) return;
      done = true;
      offClosed();
      offError();
      load(); // preload the next one
      resolve(shown);
    };
    const offClosed = current.addAdEventListener(AdEventType.CLOSED, () => finish(true));
    const offError = current.addAdEventListener(AdEventType.ERROR, () => finish(false));
    current.show().catch(() => finish(false));
  });
}
