import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSubscription } from '@/lib/revenuecat';
import { useColors } from '@/hooks/useColors';

const FEATURES = [
  { icon: 'cpu' as const,         label: 'AI-assisted chip design' },
  { icon: 'layers' as const,      label: 'Unlimited PCB projects' },
  { icon: 'download' as const,    label: 'HDL & Gerber export' },
  { icon: 'check-circle' as const, label: 'DRC / ERC validation' },
  { icon: 'zap' as const,         label: 'Auto-route & AI fixes' },
];

interface Props {
  visible: boolean;
  onDismiss?: () => void;    // undefined = non-dismissible (hard gate)
}

export function PaywallModal({ visible, onDismiss }: Props) {
  const colors = useColors();
  const { offerings, purchase, isPurchasing } = useSubscription();
  const [error, setError] = useState<string | null>(null);
  const isStoreUnavailable =
    Constants.executionEnvironment === 'storeClient' || Platform.OS === 'web';

  const pkg = offerings?.current?.availablePackages?.[0];
  const busy = isPurchasing;

  async function handlePurchase() {
    if (!pkg) {
      if (isStoreUnavailable) {
        Alert.alert(
          'TestFlight required',
          'Apple subscription checkout is available in the TestFlight or App Store version of ChipForge.',
        );
      } else {
        setError('Subscription is unavailable right now. Please try again.');
      }
      return;
    }
    setError(null);
    try {
      await purchase(pkg);
    } catch (e: any) {
      if (e?.userCancelled) return;
      setError(e?.message ?? 'Purchase failed. Please try again.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Dismiss button (optional) */}
          {onDismiss && (
            <Pressable style={styles.closeBtn} onPress={onDismiss} hitSlop={10}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          )}

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Design smarter chips with AI
            </Text>
          </View>

          {/* Feature list */}
          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.featureRow}>
                <Feather name={f.icon} size={15} color={colors.primary} />
                <Text style={[styles.featureText, { color: colors.foreground }]}>{f.label}</Text>
              </View>
            ))}
          </View>

          {/* Error */}
          {error && (
            <Text style={[styles.error, { color: '#f87171' }]}>{error}</Text>
          )}

          {/* CTA */}
          <Pressable
            style={[
              styles.cta,
              { backgroundColor: colors.primary },
              busy && { opacity: 0.6 },
            ]}
            onPress={handlePurchase}
            disabled={busy}
          >
            {busy && isPurchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                Subscribe
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 28,
    paddingBottom: 40,
    gap: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    padding: 4,
  },
  header: { gap: 8 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  features: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14 },
  error: { fontSize: 13, textAlign: 'center' },
  cta: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
