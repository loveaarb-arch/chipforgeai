import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { getGetAccountAccessQueryKey, setAuthTokenGetter, useGetAccountAccess } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useSubscription } from '@/lib/revenuecat';
import { PaywallModal } from '@/components/PaywallModal';

export default function AppLayout() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscription();
  const colors = useColors();
  const [authReadyFor, setAuthReadyFor] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && isSignedIn && userId) {
      setAuthTokenGetter(() => getToken());
      setAuthReadyFor(userId);
    } else {
      setAuthTokenGetter(null);
      setAuthReadyFor(null);
    }
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded, isSignedIn, userId]);

  const accountAccess = useGetAccountAccess({
    query: {
      queryKey: [...getGetAccountAccessQueryKey(), userId],
      enabled: !!isLoaded && !!isSignedIn && !!userId && authReadyFor === userId,
      staleTime: 60_000,
      retry: 1,
    },
  });
  const hasComplimentaryAccess = accountAccess.data?.complimentaryAccess === true;

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (!hasComplimentaryAccess && !isSubscribed &&
      (subscriptionLoading || authReadyFor !== userId || accountAccess.isPending)) {
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

  if (!isSubscribed && !hasComplimentaryAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PaywallModal
          visible
          accessCheckError={accountAccess.isError}
          onRetryAccess={() => { void accountAccess.refetch(); }}
        />
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
        <Stack.Screen name="index" options={{ title: 'Chip Forge SI' }} />
        <Stack.Screen name="project/[id]" options={{ title: 'Project' }} />
      </Stack>
    </View>
  );
}
