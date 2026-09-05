import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { ChatPanel } from '@/components/ChatPanel';
import { BuildWorkspace } from '@/components/BuildWorkspace';
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

type Tab = 'chat' | 'build' | 'diagram' | 'validate' | 'hdl' | 'versions';

const TABS: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'chat',     label: 'Chat',     icon: 'message-circle' },
  { key: 'build',    label: 'Build',    icon: 'box'            },
  { key: 'diagram',  label: 'Diagram',  icon: 'git-merge'      },
  { key: 'validate', label: 'Validate', icon: 'check-square'   },
  { key: 'hdl',      label: 'HDL',      icon: 'code'           },
  { key: 'versions', label: 'Versions', icon: 'clock'          },
];

function SidebarTabItem({
  tab, active, primary, mutedForeground, onPress,
}: {
  tab: { key: Tab; label: string; icon: keyof typeof Feather.glyphMap };
  active: boolean;
  primary: string;
  mutedForeground: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.sidebarItem,
        active && { backgroundColor: primary + '18' },
        !active && hovered && { backgroundColor: 'rgba(255,255,255,0.06)' },
      ]}
    >
      <Feather name={tab.icon} size={16} color={active ? primary : mutedForeground} />
      <Text style={[styles.sidebarLabel, { color: active ? primary : mutedForeground, fontWeight: active ? '600' : '400' }]}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

export default function ProjectWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = Number(id);
  const colors = useColors();
  const navigation = useNavigation();

  const { isMobile } = useBreakpoint();
  const [tab, setTab] = useState<Tab>('chat');
  const [localDesign, setLocalDesign] = useState<ChipDesign | null>(null);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // DRC warning count — computed live from current design
  const drcWarnings = useMemo(() => {
    if (!localDesign) return 0;
    const conn = new Set([
      ...localDesign.connections.map(c => c.fromComponentId),
      ...localDesign.connections.map(c => c.toComponentId),
    ]);
    let n = 0;
    for (const c of localDesign.components) if (!conn.has(c.id)) n++;
    if (localDesign.components.length > 0 && !localDesign.components.some(c => c.type === 'io_port')) n++;
    return n;
  }, [localDesign]);

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

  // Shared tab content — rendered in both mobile and desktop branches
  const tabContent = (
    <>
      {tab === 'chat' && <ChatPanel projectId={projectId} locked={project?.locked ?? false} />}
      {tab === 'diagram' && localDesign && (
        <DesignCanvasView
          design={localDesign} onChange={handleDesignChange}
          saving={updateDesign.isPending} grid={gridEnabled} snap={snapEnabled}
        />
      )}
      {tab === 'build' && localDesign && (
        <BuildWorkspace
          design={localDesign} onChange={handleDesignChange}
          saving={updateDesign.isPending}
          onValidate={() => setTab('validate')} onAiAssist={() => setTab('chat')}
          grid={gridEnabled} snap={snapEnabled}
          onGridChange={setGridEnabled} onSnapChange={setSnapEnabled}
        />
      )}
      {tab === 'validate' && project && <ValidationPanel projectId={projectId} project={project} />}
      {tab === 'hdl'      && project && <HdlPanel projectId={projectId} project={project} />}
      {tab === 'versions' && project && (
        <VersionsPanel projectId={projectId} currentVersionNumber={project.currentVersionNumber} />
      )}
    </>
  );

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
              hitSlop={10}
              style={({ pressed }) => [styles.headerIconButton, pressed && { opacity: 0.6 }]}
              onPress={() =>
                Alert.alert(project?.name ?? 'Project', 'Choose an action', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete project', style: 'destructive', onPress: handleDelete },
                ])
              }
            >
              <Feather name="more-vertical" size={20} color={colors.foreground} />
            </Pressable>
          ),
        }}
      />

      {isMobile ? (
        /* ── MOBILE: horizontal tab strip then content ── */
        <>
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
                  <Feather name={t.icon} size={15} color={active ? colors.primary : colors.mutedForeground} />
                  <Text style={{ marginLeft: 6, color: active ? colors.primary : colors.mutedForeground, fontWeight: active ? '600' : '400', fontSize: 13 }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {tab === 'chat' && !project.locked && localDesign && localDesign.components.length > 0 && (
            <Pressable onPress={() => setTab('hdl')} style={[styles.handoffBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="upload" size={16} color={colors.primary} />
              <Text style={[styles.handoffText, { color: colors.foreground }]}>Ready to send this to a manufacturer? Go to the HDL tab to generate HDL and export a design package you can share.</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>{tabContent}</View>
        </>
      ) : (
        /* ── DESKTOP/TABLET: vertical sidebar + content side by side ── */
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Sidebar */}
          <View style={[styles.sidebar, { backgroundColor: colors.card, borderRightColor: colors.border }]}>
            <View style={[styles.sidebarSep, { borderBottomColor: colors.border }]} />
            {TABS.map((t) => (
              <SidebarTabItem
                key={t.key}
                tab={t}
                active={t.key === tab}
                primary={colors.primary}
                mutedForeground={colors.mutedForeground}
                onPress={() => setTab(t.key)}
              />
            ))}
          </View>

          {/* Content area */}
          <View style={{ flex: 1 }}>
            {tab === 'chat' && !project.locked && localDesign && localDesign.components.length > 0 && (
              <Pressable onPress={() => setTab('hdl')} style={[styles.handoffBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="upload" size={16} color={colors.primary} />
                <Text style={[styles.handoffText, { color: colors.foreground }]}>Ready to send this to a manufacturer? Go to the HDL tab to generate HDL and export a design package you can share.</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
            <View style={{ flex: 1 }}>{tabContent}</View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeTxt: { fontSize: 10, fontWeight: '600' },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
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
  // Desktop sidebar
  sidebar: {
    width: 180,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  sidebarSep: { borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
    borderRadius: 0,
  },
  sidebarLabel: { fontSize: 13 },
});
