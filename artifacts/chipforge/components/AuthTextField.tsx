import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface Props extends TextInputProps {
  label: string;
  errorMessage?: string | null;
}

export function AuthTextField({ label, errorMessage, style, ...rest }: Props) {
  const colors = useColors();

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            backgroundColor: colors.input,
            borderColor: errorMessage ? colors.destructive : colors.border,
            color: colors.foreground,
          },
          style,
        ]}
        {...rest}
      />
      {errorMessage ? (
        <Text style={[styles.error, { color: colors.destructive }]}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    fontFamily: 'Inter_600SemiBold',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  error: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
