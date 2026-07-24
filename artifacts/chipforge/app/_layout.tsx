import React, { useEffect } from 'react';
import { Alert, Platform, useWindowDimensions, View, Text, StyleSheet } from 'react-native';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';

try {
  initializeRevenueCat();
} catch (err: any) {
  // Keys not yet set — silently skip during development before seed script is run
  console.warn("RevenueCat init skipped:", err?.message ?? "Unknown error");
}
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ClerkProvider, ClerkLoaded } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { setBaseUrl } from '@workspace/api-client-react';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

const queryClient = new QueryClient();

function MinWidthGuard({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web' && width < 480) {
    return (
      <View style={guard.root}>
        <Text style={guard.icon}>🖥</Text>
        <Text style={guard.title}>Window too narrow</Text>
        <Text style={guard.body}>Please widen your browser window or open ChipForge on a larger screen.</Text>
      </View>
    );
  }
  return <>{children}</>;
}

const guard = StyleSheet.create({
  root:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220', padding: 32, gap: 12 },
  icon:  { fontSize: 40 },
  title: { fontSize: 18, fontWeight: '700', color: '#e6edf5', textAlign: 'center' },
  body:  { fontSize: 14, color: '#4a6a8a', textAlign: 'center', lineHeight: 22 },
});

function RootLayoutNav() {
  return (
    <MinWidthGuard>
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </MinWidthGuard>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
      proxyUrl={proxyUrl}
    >
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
              <GestureHandlerRootView>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </QueryClientProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
