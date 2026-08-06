import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { ChipProjectSummary } from '@workspace/api-client-react';

interface Props {
  project: ChipProjectSummary;
  onPress: () => void;
}

export function ProjectCard({ project, onPress }: Props) {
  const colors = useColors();

  const versionLabel =
    project.currentVersionNumber > 0
      ? `v${project.currentVersionNumber}`
      : 'unsaved';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.top}>
          <Text
            style={[styles.name, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {project.name}
          </Text>
          <View style={[styles.versionPill, { borderColor: colors.border }]}>
            <Text style={[styles.versionText, { color: colors.mutedForeground }]}>
              {versionLabel}
            </Text>
          </View>
        </View>

        {project.description ? (
          <Text
            style={[styles.description, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {project.description}
          </Text>
        ) : (
          <Text style={[styles.description, { color: colors.border }]}>
            No description
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  versionPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  versionText: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    letterSpacing: 0.4,
  },
  description: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
