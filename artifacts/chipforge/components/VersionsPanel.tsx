import React, { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { AuthTextField } from '@/components/AuthTextField';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  getGetProjectQueryKey,
  getListProjectVersionsQueryKey,
  getListProjectsQueryKey,
  useListProjectVersions,
  useRestoreProjectVersion,
  useSaveProjectVersion,
  type ChipVersionSummary,
} from '@workspace/api-client-react';

interface Props {
  projectId: number;
  currentVersionNumber: number;
}

export function VersionsPanel({ projectId, currentVersionNumber }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { data: versions } = useListProjectVersions(projectId);
  const saveVersion = useSaveProjectVersion();
  const restoreVersion = useRestoreProjectVersion({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getListProjectVersionsQueryKey(projectId) });
      },
    },
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [label, setLabel] = useState('');
  const [changeNote, setChangeNote] = useState('');

  const handleSave = () => {
    saveVersion.mutate(
      {
        id: projectId,
        data: { label: label.trim() || undefined, changeNote: changeNote.trim() || undefined },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectVersionsQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          setModalVisible(false);
          setLabel('');
          setChangeNote('');
        },
      },
    );
  };

  const confirmRestore = (version: ChipVersionSummary) => {
    Alert.alert(
      `Restore v${version.versionNumber}?`,
      'This replaces your current working design with this saved version.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => restoreVersion.mutate({ id: projectId, versionId: version.id }),
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <PrimaryButton
          title="Save current version"
          onPress={() => setModalVisible(true)}
        />
      </View>

      <FlatList
        data={versions ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            No saved versions yet. Save one to create a restore point.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.versionTitle, { color: colors.foreground }]}>
                v{item.versionNumber}
                {item.versionNumber === currentVersionNumber ? ' · current' : ''}
                {item.label ? ` — ${item.label}` : ''}
              </Text>
              {item.changeNote ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {item.changeNote}
                </Text>
              ) : null}
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </View>
            <Pressable onPress={() => confirmRestore(item)} hitSlop={10}>
              <Feather name="rotate-ccw" size={18} color={colors.primary} />
            </Pressable>
          </View>
        )}
      />

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Save version
            </Text>
            <AuthTextField
              label="Label (optional)"
              value={label}
              onChangeText={setLabel}
              placeholder="e.g. Working counter"
            />
            <AuthTextField
              label="Change note (optional)"
              value={changeNote}
              onChangeText={setChangeNote}
              placeholder="What changed?"
              multiline
            />
            <PrimaryButton
              title="Save"
              onPress={handleSave}
              loading={saveVersion.isPending}
            />
            <Pressable onPress={() => setModalVisible(false)} style={styles.cancelButton}>
              <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingBottom: 8 },
  listContent: { padding: 16, paddingTop: 0, gap: 10 },
  hint: { fontSize: 13, marginTop: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionTitle: { fontSize: 14, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 18 },
  cancelButton: { alignItems: 'center', marginTop: 12, padding: 8 },
});
