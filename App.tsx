import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { setAudioModeAsync } from 'expo-audio';
import Purchases, {
  PRODUCT_CATEGORY,
  type CustomerInfo,
  type PurchasesStoreProduct,
} from 'react-native-purchases';

import { GAME_HTML } from './src/gameHtml';
import { LEADERBOARD_URL, PRODUCT_IDS, REVENUECAT_IOS_KEY } from './src/config';

// react-native-webview's class typing collapses to `never` under current TypeScript;
// describe just the parts we use.
type WebViewHandle = { injectJavaScript: (script: string) => void; reload: () => void };
const WebView = RNWebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebViewHandle> }>;

const SAVE_KEY = 'linedrive.save.v1';
const BG = '#07030f';

type Save = Record<string, unknown>;
type GameMessage =
  | { t: 'ready' }
  | { t: 'save'; k: string; v: unknown }
  | { t: 'haptic'; s: string }
  | { t: 'buy'; id: string }
  | { t: 'restore' };

let purchasesConfigured = false;
function configurePurchases(): boolean {
  if (purchasesConfigured) return true;
  if (Platform.OS !== 'ios' || !REVENUECAT_IOS_KEY) return false;
  try {
    Purchases.configure({ apiKey: REVENUECAT_IOS_KEY });
    purchasesConfigured = true;
  } catch (e) {
    console.warn('RevenueCat configure failed', e);
  }
  return purchasesConfigured;
}

const ownedFrom = (info: CustomerInfo) => info.allPurchasedProductIdentifiers ?? [];

export default function App() {
  const web = useRef<WebViewHandle>(null);
  const [save, setSave] = useState<Save | null>(null);
  const saveRef = useRef<Save>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const products = useRef<Map<string, PurchasesStoreProduct>>(new Map());

  // Load saved progress before the game starts, so it can read it synchronously.
  useEffect(() => {
    AsyncStorage.getItem(SAVE_KEY)
      .then((raw) => {
        const data = raw ? (JSON.parse(raw) as Save) : {};
        saveRef.current = data;
        setSave(data);
      })
      .catch(() => setSave({}));
    // Let the game's sound play even with the ringer switch on silent.
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  const toGame = useCallback((msg: object) => {
    web.current?.injectJavaScript(`window.LD&&window.LD.receive(${JSON.stringify(msg)});true;`);
  }, []);

  const persist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(SAVE_KEY, JSON.stringify(saveRef.current)).catch(() => {});
    }, 250);
  }, []);

  const sendStore = useCallback(async () => {
    if (!configurePurchases()) {
      toGame({ t: 'products', items: [] });
      return;
    }
    try {
      const list = await Purchases.getProducts(PRODUCT_IDS, PRODUCT_CATEGORY.NON_SUBSCRIPTION);
      products.current = new Map(list.map((p) => [p.identifier, p]));
      toGame({ t: 'products', items: list.map((p) => ({ id: p.identifier, price: p.priceString })) });
    } catch (e) {
      console.warn('getProducts failed', e);
      toGame({ t: 'products', items: [] });
    }
    try {
      toGame({ t: 'owned', ids: ownedFrom(await Purchases.getCustomerInfo()) });
    } catch {}
  }, [toGame]);

  // Keep the game's owned list in sync (e.g. purchases approved later via Ask to Buy).
  useEffect(() => {
    if (!configurePurchases()) return;
    const listener = (info: CustomerInfo) => toGame({ t: 'owned', ids: ownedFrom(info) });
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [toGame]);

  const buy = useCallback(
    async (id: string) => {
      if (!configurePurchases()) {
        toGame({ t: 'buyResult', ok: false, error: 'The store is not available right now.' });
        return;
      }
      try {
        let product = products.current.get(id);
        if (!product) {
          const [p] = await Purchases.getProducts([id], PRODUCT_CATEGORY.NON_SUBSCRIPTION);
          product = p;
        }
        if (!product) throw new Error('That item is not available right now.');
        const { customerInfo } = await Purchases.purchaseStoreProduct(product);
        toGame({ t: 'buyResult', ok: true, owned: ownedFrom(customerInfo) });
      } catch (e: any) {
        if (e?.userCancelled) toGame({ t: 'buyResult', ok: false, cancelled: true });
        else toGame({ t: 'buyResult', ok: false, error: e?.message || 'Purchase failed. Try again.' });
      }
    },
    [toGame]
  );

  const restore = useCallback(async () => {
    if (!configurePurchases()) {
      toGame({ t: 'restoreResult', ok: false });
      return;
    }
    try {
      const info = await Purchases.restorePurchases();
      const ids = ownedFrom(info);
      toGame({ t: 'owned', ids });
      toGame({ t: 'restoreResult', ok: true, count: ids.length });
    } catch {
      toGame({ t: 'restoreResult', ok: false });
    }
  }, [toGame]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: GameMessage;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'ready':
          sendStore();
          break;
        case 'save':
          if (typeof msg.k === 'string' && msg.k.startsWith('ld_')) {
            saveRef.current = { ...saveRef.current, [msg.k]: msg.v };
            persist();
          }
          break;
        case 'haptic':
          haptic(msg.s);
          break;
        case 'buy':
          buy(msg.id);
          break;
        case 'restore':
          restore();
          break;
      }
    },
    [buy, persist, restore, sendStore]
  );

  const injected = useMemo(() => {
    if (!save) return '';
    const cfg = { leaderboardUrl: LEADERBOARD_URL, platform: Platform.OS };
    return `window.__LD_SAVE=${JSON.stringify(save)};window.__LD_CONFIG=${JSON.stringify(cfg)};true;`;
  }, [save]);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {save && (
        <WebView
          ref={web}
          style={styles.web}
          source={{ html: GAME_HTML, baseUrl: 'https://linedrive.app/' }}
          originWhitelist={['*']}
          injectedJavaScriptBeforeContentLoaded={injected}
          onMessage={onMessage}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          ignoreSilentHardwareSwitch
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          allowsLinkPreview={false}
          textInteractionEnabled={false}
          hideKeyboardAccessoryView
          setSupportMultipleWindows={false}
          webviewDebuggingEnabled={__DEV__}
          onContentProcessDidTerminate={() => web.current?.reload()}
        />
      )}
    </View>
  );
}

function haptic(kind: string) {
  switch (kind) {
    case 'light':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      break;
    case 'soft':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      break;
    case 'medium':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      break;
    case 'select':
      Haptics.selectionAsync().catch(() => {});
      break;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      break;
    case 'death':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}), 90);
      break;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
});
