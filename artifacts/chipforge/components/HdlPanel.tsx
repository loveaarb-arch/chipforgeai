import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  getGetProjectQueryKey,
  useGenerateProjectHdl,
  type ChipProject,
} from '@workspace/api-client-react';

interface Props {
  projectId: number;
  project: ChipProject;
}

export function HdlPanel({ projectId, project }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const generateHdl = useGenerateProjectHdl({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PrimaryButton
        title={project.hdlCode ? 'Regenerate HDL' : 'Generate HDL'}
        onPress={() => generateHdl.mutate({ id: projectId })}
        loading={generateHdl.isPending}
        disabled={project.design.components.length === 0}
      />

      {project.design.components.length === 0 ? (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Add or generate an architecture first — HDL is derived from the
          current block diagram.
        </Text>
      ) : null}

      {project.hdlCode ? (
        <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.codeHeader}>
            <Feather name="code" size={14} color={colors.mutedForeground} />
            <Text style={[styles.codeHeaderText, { color: colors.mutedForeground }]}>
              module.v
            </Text>
          </View>
          <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
            {project.hdlCode}
          </Text>
        </View>
      ) : (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          No HDL generated yet for the current design.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  hint: { fontSize: 13, lineHeight: 20 },
  codeBlock: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  codeHeaderText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    padding: 14,
  },
});
