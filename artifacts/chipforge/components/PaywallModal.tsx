import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  const { offerings, purchase, restore, isPurchasing, isRestoring } = useSubscription();
  const [error, setError] = useState<string | null>(null);

  const pkg = offerings?.current?.availablePackages?.[0];
  const priceString = pkg?.product?.priceString ?? '—';
  const busy = isPurchasing || isRestoring;

  async function handlePurchase() {
    if (!pkg) return;
    setError(null);
    try {
      await purchase(pkg);
    } catch (e: any) {
      if (e?.userCancelled) return;
      setError(e?.message ?? 'Purchase failed. Please try again.');
    }
  }

  async function handleRestore() {
    setError(null);
    try {
      await restore();
    } catch (e: any) {
      setError(e?.message ?? 'Restore failed. Please try again.');
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
            <View style={[styles.badge, { backgroundColor: colors.primary + '22' }]}>
              <Feather name="zap" size={18} color={colors.primary} />
              <Text style={[styles.badgeText, { color: colors.primary }]}>ChipForge Pro</Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Design smarter chips with AI
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Everything you need to go from idea to Gerber file in one session.
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

          {/* Price */}
          <View style={[styles.priceBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.price, { color: colors.foreground }]}>{priceString}</Text>
            <Text style={[styles.period, { color: colors.mutedForeground }]}> / month</Text>
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
            disabled={busy || !pkg}
          >
            {busy && isPurchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {pkg ? `Subscribe for ${priceString}/mo` : 'Loading…'}
              </Text>
            )}
          </Pressable>

          {/* Restore */}
          <Pressable onPress={handleRestore} disabled={busy} style={styles.restoreBtn}>
            {isRestoring ? (
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            ) : (
              <Text style={[styles.restoreText, { color: colors.mutedForeground }]}>
                Restore purchases
              </Text>
            )}
          </Pressable>

          <Text style={[styles.legal, { color: colors.mutedForeground }]}>
            Subscription renews monthly. Cancel anytime in your App Store or Google Play settings.
          </Text>
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  badgeText: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  features: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14 },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  price: { fontSize: 26, fontWeight: '700' },
  period: { fontSize: 14 },
  error: { fontSize: 13, textAlign: 'center' },
  cta: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  restoreBtn: { alignItems: 'center', paddingVertical: 4 },
  restoreText: { fontSize: 13 },
  legal: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
