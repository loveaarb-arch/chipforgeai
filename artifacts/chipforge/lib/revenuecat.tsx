import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useAuth } from "@clerk/expo";

const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

// Expo Go (storeClient) cannot use native StoreKit — skip RevenueCat entirely
// and treat the session as subscribed so the rest of the app is testable.
const IS_EXPO_GO = Constants.executionEnvironment === "storeClient";

function getRevenueCatApiKey(): string {
  if (Platform.OS === "ios" && REVENUECAT_IOS_API_KEY) return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android" && REVENUECAT_ANDROID_API_KEY) return REVENUECAT_ANDROID_API_KEY;
  throw new Error("RevenueCat API key not found for this platform");
}

let revenueCatConfigured = false;
type PurchasesModule = typeof import("react-native-purchases").default;
let purchasesModule: PurchasesModule | null = null;

function getPurchasesModule(): PurchasesModule {
  if (purchasesModule) return purchasesModule;
  const loadedModule = require("react-native-purchases").default as PurchasesModule;
  purchasesModule = loadedModule;
  return loadedModule;
}

function initializeRevenueCat() {
  if (IS_EXPO_GO || Platform.OS === "web") {
    console.log("RevenueCat skipped — Expo Go or web environment");
    return;
  }
  if (revenueCatConfigured) return;
  const apiKey = getRevenueCatApiKey();
  const Purchases = getPurchasesModule();
  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  revenueCatConfigured = true;
  console.log("Configured RevenueCat");
}

function useSubscriptionContext(enabled: boolean, initializationError: string | null) {
  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => {
      if (IS_EXPO_GO || Platform.OS === "web") return null;
      return getPurchasesModule().getCustomerInfo();
    },
    enabled,
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      if (IS_EXPO_GO || Platform.OS === "web") return null;
      return getPurchasesModule().getOfferings();
    },
    enabled,
    staleTime: 300 * 1000,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: any) => {
      const { customerInfo } = await getPurchasesModule().purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => getPurchasesModule().restorePurchases(),
    onSuccess: () => customerInfoQuery.refetch(),
  });

  // In dev / Expo Go / web: treat as subscribed so the app is fully navigable during testing.
  // Paywall only enforced in production native builds.
  const isSubscribed =
    __DEV__ ||
    IS_EXPO_GO ||
    Platform.OS === "web" ||
    customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;

  return {
    customerInfo: customerInfoQuery.data ?? null,
    offerings: offeringsQuery.data ?? null,
    isSubscribed,
    isLoading:
      !initializationError &&
      (!enabled || customerInfoQuery.isLoading || offeringsQuery.isLoading),
    initializationError,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const skipNativeRevenueCat = IS_EXPO_GO || Platform.OS === "web";
  const [initialized, setInitialized] = useState(skipNativeRevenueCat);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || initialized || initializationError) return;

    try {
      initializeRevenueCat();
      setInitialized(true);
    } catch (error: any) {
      const message = error?.message ?? "RevenueCat initialization failed";
      console.warn("RevenueCat initialization failed:", message);
      setInitializationError(message);
    }
  }, [initializationError, initialized, isLoaded, isSignedIn]);

  const value = useSubscriptionContext(
    skipNativeRevenueCat || (isLoaded && !!isSignedIn && initialized),
    initializationError,
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
