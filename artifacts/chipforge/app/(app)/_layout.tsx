import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useSubscription } from '@/lib/revenuecat';
import { PaywallModal } from '@/components/PaywallModal';

export default function AppLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscription();
  const colors = useColors();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (subscriptionLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Chip Forge AI' }} />
        <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
      </Stack>
      <PaywallModal visible={!isSubscribed} />
    </View>
  );
}
