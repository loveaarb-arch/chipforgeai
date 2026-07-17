import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ChatPanel } from '@/components/ChatPanel';
import { DesignCanvasView } from '@/components/DesignCanvasView';
import { ValidationPanel } from '@/components/ValidationPanel';
import { HdlPanel } from '@/components/HdlPanel';
import { VersionsPanel } from '@/components/VersionsPanel';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  useDeleteProject,
  useGetProject,
  useUpdateProjectDesign,
  type ChipDesign,
} from '@workspace/api-client-react';

type Tab = 'chat' | 'diagram' | 'validate' | 'hdl' | 'versions';

const TABS: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'chat', label: 'Chat', icon: 'message-circle' },
  { key: 'diagram', label: 'Diagram', icon: 'git-merge' },
  { key: 'validate', label: 'Validate', icon: 'check-square' },
  { key: 'hdl', label: 'HDL', icon: 'code' },
  { key: 'versions', label: 'Versions', icon: 'clock' },
];

export default function ProjectWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const colors = useColors();
  const navigation = useNavigation();

  const [tab, setTab] = useState<Tab>('chat');
  const [localDesign, setLocalDesign] = useState<ChipDesign | null>(null);

  const queryClient = useQueryClient();
  const { data: project, isLoading, error } = useGetProject(projectId);
  const updateDesign = useUpdateProjectDesign();
  const deleteProject = useDeleteProject();

  useEffect(() => {
    if (project) {
      navigation.setOptions({ title: project.name });
    }
  }, [project, navigation]);

  useEffect(() => {
    if (project && !localDesign) {
      setLocalDesign(project.design);
    }
  }, [project, localDesign]);

  // Keep the local (editable) design in sync whenever the server design
  // changes for a reason outside of manual editing (AI chat updates, restores).
  const lastServerUpdatedAt = project?.updatedAt;
  useEffect(() => {
    if (project) setLocalDesign(project.design);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastServerUpdatedAt]);

  const handleDesignChange = useCallback(
    (design: ChipDesign) => {
      setLocalDesign(design);
      updateDesign.mutate(
        { id: projectId, data: design },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
            queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          },
        },
      );
    },
    [projectId, updateDesign, queryClient],
  );

  const handleDelete = () => {
    Alert.alert('Delete project?', 'This permanently deletes the project and all saved versions.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteProject.mutate(
            { id: projectId },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
                navigation.goBack();
              },
            },
          ),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !project) {
    const errorData =
      error && typeof error === 'object' && 'data' in error
        ? (error as { data?: { error?: string } }).data
        : undefined;
    const message = errorData?.error ?? 'This project could not be loaded.';
    return (
      <View style={[styles.center, styles.errorCenter, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={32} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.foreground }]}>
          {message}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={handleDelete}
              hitSlop={10}
              style={({ pressed }) => [
                styles.headerIconButton,
                {
                  backgroundColor: pressed ? `${colors.destructive}33` : `${colors.destructive}1a`,
                },
              ]}
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { borderBottomColor: colors.border }]}
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tabItem,
                active && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
            >
              <Feather
                name={t.icon}
                size={15}
                color={active ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={{
                  marginLeft: 6,
                  color: active ? colors.primary : colors.mutedForeground,
                  fontWeight: active ? '600' : '400',
                  fontSize: 13,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'chat' && !project.locked && localDesign && localDesign.components.length > 0 && (
        <Pressable
          onPress={() => setTab('hdl')}
          style={[
            styles.handoffBanner,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="upload" size={16} color={colors.primary} />
          <Text style={[styles.handoffText, { color: colors.foreground }]}>
            Ready to send this to a manufacturer? Go to the HDL tab to generate
            HDL and export a design package you can share.
          </Text>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      )}

      <View style={{ flex: 1 }}>
        {tab === 'chat' && <ChatPanel projectId={projectId} locked={project.locked} />}
        {tab === 'diagram' && localDesign && (
          <DesignCanvasView
            design={localDesign}
            onChange={handleDesignChange}
            saving={updateDesign.isPending}
          />
        )}
        {tab === 'validate' && <ValidationPanel projectId={projectId} project={project} />}
        {tab === 'hdl' && <HdlPanel projectId={projectId} project={project} />}
        {tab === 'versions' && (
          <VersionsPanel
            projectId={projectId}
            currentVersionNumber={project.currentVersionNumber}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCenter: { paddingHorizontal: 32, gap: 14 },
  handoffBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  handoffText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  errorText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, flexGrow: 0 },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
