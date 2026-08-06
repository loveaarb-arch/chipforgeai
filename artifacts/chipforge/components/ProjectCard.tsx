import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ChipProjectSummary } from '@workspace/api-client-react';

interface Props {
  project: ChipProjectSummary;
  onPress: () => void;
}

export function ProjectCard({ project, onPress }: Props) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.info}>
          <Text
            style={[styles.name, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {project.name}
          </Text>
          {project.description ? (
            <Text
              style={[styles.description, { color: colors.mutedForeground }]}
              numberOfLines={2}
            >
              {project.description}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {project.currentVersionNumber > 0
              ? `v${project.currentVersionNumber} saved`
              : 'No saved versions yet'}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  info: { flex: 1, marginRight: 8 },
  name: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    fontFamily: 'Inter_600SemiBold',
  },
  description: {
    fontSize: 13,
    marginBottom: 6,
    fontFamily: 'Inter_400Regular',
  },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
