import React, { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { PrimaryButton } from '@/components/PrimaryButton';
import { exportDesignPackage, hasBlockingIssues } from '@/lib/exportDesign';
import {
  getGetProjectQueryKey,
  useGenerateProjectConstraints,
  useGenerateProjectHdl,
  useValidateProjectDesign,
  type ChipProject,
} from '@workspace/api-client-react';

interface Props {
  projectId: number;
  project: ChipProject;
}

function formatNetlist(netlist: string): string {
  try {
    return JSON.stringify(JSON.parse(netlist), null, 2);
  } catch {
    return netlist;
  }
}

export function HdlPanel({ projectId, project }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);
  const [xdcExpanded, setXdcExpanded] = useState(true);
  const [sdcExpanded, setSdcExpanded] = useState(true);
  const [xdcCopied, setXdcCopied] = useState(false);
  const [sdcCopied, setSdcCopied] = useState(false);

  const handleCopy = async (text: string, setCopied: (v: boolean) => void) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const generateHdl = useGenerateProjectHdl({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });
  const generateConstraints = useGenerateProjectConstraints({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
    },
  });
  const validate = useValidateProjectDesign();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const validation = await validate.mutateAsync({ id: projectId });
      if (hasBlockingIssues(validation)) {
        Alert.alert(
          'Fix errors before exporting',
          'Validation found structural errors (e.g. a missing clock source or a connection to an unknown component). Fix these in Validate or Diagram before exporting a design package.',
        );
        return;
      }
      await exportDesignPackage(project, validation);
    } catch (err) {
      Alert.alert(
        'Export failed',
        err instanceof Error ? err.message : 'Something went wrong while exporting.',
      );
    } finally {
      setIsExporting(false);
    }
  };

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

      {project.netlist ? (
        <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.codeHeader}>
            <Feather name="share-2" size={14} color={colors.mutedForeground} />
            <Text style={[styles.codeHeaderText, { color: colors.mutedForeground }]}>
              netlist.json
            </Text>
          </View>
          <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
            {formatNetlist(project.netlist)}
          </Text>
        </View>
      ) : null}

      <View style={[styles.exportSection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Constraints
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Generates XDC (Xilinx) and SDC (Synopsys / OpenROAD) constraint
          files — clock definitions, pin assignments, and timing constraints —
          as a starting point for your EDA tooling. Requires HDL to be
          generated first.
        </Text>

        {!project.hdlCode ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Generate HDL above before generating constraints.
          </Text>
        ) : (
          <PrimaryButton
            title={
              project.xdcConstraints
                ? 'Regenerate constraints'
                : 'Generate constraints'
            }
            onPress={() => generateConstraints.mutate({ id: projectId })}
            loading={generateConstraints.isPending}
            disabled={!project.hdlCode}
            variant="secondary"
          />
        )}

        {project.xdcConstraints ? (
          <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.codeHeader}>
              <Pressable
                onPress={() => setXdcExpanded((v) => !v)}
                style={styles.codeHeaderLeft}
              >
                <Feather name="sliders" size={14} color={colors.mutedForeground} />
                <Text style={[styles.codeHeaderText, { color: colors.mutedForeground, flex: 1 }]}>
                  constraints.xdc
                </Text>
                <Feather
                  name={xdcExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                onPress={() => handleCopy(project.xdcConstraints!, setXdcCopied)}
                style={styles.copyButton}
                hitSlop={8}
              >
                {xdcCopied ? (
                  <Text style={[styles.copiedText, { color: colors.mutedForeground }]}>Copied!</Text>
                ) : (
                  <Feather name="copy" size={14} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
            {xdcExpanded ? (
              <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
                {project.xdcConstraints}
              </Text>
            ) : null}
          </View>
        ) : null}

        {project.sdcConstraints ? (
          <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.codeHeader}>
              <Pressable
                onPress={() => setSdcExpanded((v) => !v)}
                style={styles.codeHeaderLeft}
              >
                <Feather name="sliders" size={14} color={colors.mutedForeground} />
                <Text style={[styles.codeHeaderText, { color: colors.mutedForeground, flex: 1 }]}>
                  constraints.sdc
                </Text>
                <Feather
                  name={sdcExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                onPress={() => handleCopy(project.sdcConstraints!, setSdcCopied)}
                style={styles.copyButton}
                hitSlop={8}
              >
                {sdcCopied ? (
                  <Text style={[styles.copiedText, { color: colors.mutedForeground }]}>Copied!</Text>
                ) : (
                  <Feather name="copy" size={14} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
            {sdcExpanded ? (
              <Text selectable style={[styles.codeText, { color: colors.foreground }]}>
                {project.sdcConstraints}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.exportSection, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Export design package
        </Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Bundles the design, HDL, netlist, constraints, and a validation
          report into one file you can save or hand to an engineer. This is a
          pre-tapeout handoff — synthesis, physical design, DFT, packaging,
          and signoff for a specific foundry still need to happen before
          fabrication.
        </Text>
        <PrimaryButton
          title="Export design package"
          onPress={handleExport}
          loading={isExporting || validate.isPending}
          disabled={project.design.components.length === 0}
          variant="secondary"
        />
      </View>
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  codeHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  copyButton: {
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copiedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  codeHeaderText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeText: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
    padding: 14,
  },
  exportSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
