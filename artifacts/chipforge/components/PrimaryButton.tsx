import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive';
  style?: ViewStyle;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: Props) {
  const colors = useColors();
  const isDisabled = disabled || loading;

  const backgroundColor =
    variant === 'primary'
      ? colors.primary
      : variant === 'destructive'
        ? colors.destructive
        : colors.secondary;
  const textColor =
    variant === 'primary'
      ? colors.primaryForeground
      : variant === 'destructive'
        ? colors.destructiveForeground
        : colors.secondaryForeground;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
});
