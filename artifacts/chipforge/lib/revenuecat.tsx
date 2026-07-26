import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

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

export function initializeRevenueCat() {
  if (IS_EXPO_GO || Platform.OS === "web") {
    console.log("RevenueCat skipped — Expo Go or web environment");
    return;
  }
  const apiKey = getRevenueCatApiKey();
  Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  console.log("Configured RevenueCat");
}

function useSubscriptionContext() {
  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => {
      if (IS_EXPO_GO || Platform.OS === "web") return null;
      return Purchases.getCustomerInfo();
    },
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      if (IS_EXPO_GO || Platform.OS === "web") return null;
      return Purchases.getOfferings();
    },
    staleTime: 300 * 1000,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: any) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: async () => Purchases.restorePurchases(),
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
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
