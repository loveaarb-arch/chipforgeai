import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk, useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ProjectCard } from '@/components/ProjectCard';
import { AuthTextField } from '@/components/AuthTextField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListProjectsQueryKey,
  useCreateProject,
  useListProjects,
} from '@workspace/api-client-react';

export default function ProjectListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();

  const queryClient = useQueryClient();
  const { data: projects, isLoading, refetch, isRefetching } = useListProjects();
  const createProject = useCreateProject();

  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = () => {
    createProject.mutate(
      { data: { name: name.trim(), description: description.trim() || undefined } },
      {
        onSuccess: (project) => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setModalVisible(false);
          setName('');
          setDescription('');
          router.push(`/(app)/project/${project.id}`);
        },
      },
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          {/* Logo mark */}
          <View style={[styles.logoMark, { borderColor: colors.primary + '60' }]}>
            <View style={[styles.logoInner, { backgroundColor: colors.primary }]} />
            <View style={[styles.logoCorner, { borderColor: colors.primary }]} />
          </View>
          <View>
            <Text style={[styles.appLabel, { color: colors.mutedForeground }]}>
              CHIPFORGE
            </Text>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {user?.firstName ? `${user.firstName}'s designs` : 'Designs'}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => signOut()}
          hitSlop={12}
          style={[styles.signOutBtn, { borderColor: colors.border }]}
        >
          <Feather name="log-out" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* List */}
      <FlatList
        data={projects ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshing={isRefetching}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <ProjectCard
            project={item}
            onPress={() => router.push(`/(app)/project/${item.id}`)}
          />
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.listCount, { color: colors.mutedForeground }]}>
              {projects ? `${projects.length} project${projects.length !== 1 ? 's' : ''}` : ''}
            </Text>
            <Pressable
              onPress={() => setModalVisible(true)}
              style={[styles.newBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="plus" size={13} color={colors.primaryForeground} />
              <Text style={[styles.newBtnText, { color: colors.primaryForeground }]}>
                New project
              </Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { borderColor: colors.border }]}>
                <Feather name="cpu" size={22} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No projects yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                Create a project and describe the chip you want to build.
              </Text>
            </View>
          ) : null
        }
      />

      {/* New project modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              New project
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              You can describe the chip in Chat once it's created.
            </Text>
            <AuthTextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. 8-bit ALU"
            />
            <AuthTextField
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="What is this chip for?"
              multiline
            />
            <View style={styles.modalActions}>
              <PrimaryButton
                title="Create"
                onPress={handleCreate}
                loading={createProject.isPending}
                disabled={!name.trim()}
                style={styles.modalCreateBtn}
              />
              <Pressable
                onPress={() => setModalVisible(false)}
                style={[styles.cancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  logoInner: { width: 10, height: 10, borderRadius: 2 },
  logoCorner: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 1,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  appLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    marginTop: 1,
  },
  signOutBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 40, flexGrow: 1 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  listCount: { fontSize: 12, fontFamily: 'Inter_400Regular', letterSpacing: 0.3 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  newBtnText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },

  // Empty state
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40, gap: 10 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: 'Inter_400Regular',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    padding: 24,
    paddingBottom: 40,
    gap: 4,
  },
  modalHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#2a3a52',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCreateBtn: { flex: 1 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  cancelText: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
