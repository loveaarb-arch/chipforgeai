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
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Your chips
          </Text>
        </View>
        <Pressable onPress={() => signOut()} hitSlop={10}>
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

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
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Feather name="cpu" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                No chips yet
              </Text>
              <Text
                style={[styles.emptySubtitle, { color: colors.mutedForeground }]}
              >
                Create a project and describe the chip you want to build in
                plain language.
              </Text>
            </View>
          ) : null
        }
      />

      <Pressable
        onPress={() => setModalVisible(true)}
        style={[styles.fab, { backgroundColor: colors.primary }]}
      >
        <Feather name="plus" size={26} color={colors.primaryForeground} />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              New chip project
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
            <PrimaryButton
              title="Create project"
              onPress={handleCreate}
              loading={createProject.isPending}
              disabled={!name.trim()}
            />
            <Pressable
              onPress={() => setModalVisible(false)}
              style={styles.cancelButton}
            >
              <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greeting: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
    fontFamily: 'Inter_700Bold',
  },
  listContent: { padding: 20, paddingBottom: 100, flexGrow: 1 },
  empty: { alignItems: 'center', marginTop: 80, paddingHorizontal: 32 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    fontFamily: 'Inter_400Regular',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 18,
    fontFamily: 'Inter_700Bold',
  },
  cancelButton: { alignItems: 'center', marginTop: 12, padding: 8 },
});
