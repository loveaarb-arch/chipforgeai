import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AuthTextField } from '@/components/AuthTextField';
import { PrimaryButton } from '@/components/PrimaryButton';
import type { ChipComponent } from '@workspace/api-client-react';

export const COMPONENT_TYPES = [
  'register',
  'alu',
  'mux',
  'memory',
  'input_port',
  'output_port',
  'clock',
  'wire',
  'logic_gate',
  'counter',
  'decoder',
  'custom',
];

interface Props {
  visible: boolean;
  component: ChipComponent | null;
  onClose: () => void;
  onSave: (component: ChipComponent) => void;
  onDelete: (id: string) => void;
}

export function ComponentEditModal({
  visible,
  component,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const colors = useColors();
  const [label, setLabel] = useState('');
  const [type, setType] = useState('register');
  const [bitWidth, setBitWidth] = useState('');

  useEffect(() => {
    if (component) {
      setLabel(component.label);
      setType(component.type);
      setBitWidth(component.bitWidth != null ? String(component.bitWidth) : '');
    }
  }, [component]);

  if (!component) return null;

  const handleSave = () => {
    const parsedBitWidth = bitWidth.trim() ? Number(bitWidth) : null;
    onSave({
      ...component,
      label: label.trim() || component.label,
      type,
      bitWidth: Number.isFinite(parsedBitWidth) ? parsedBitWidth : null,
    });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Edit component
          </Text>

          <AuthTextField label="Label" value={label} onChangeText={setLabel} />
          <AuthTextField
            label="Bit width (optional)"
            value={bitWidth}
            onChangeText={setBitWidth}
            keyboardType="number-pad"
            placeholder="e.g. 8"
          />

          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            Type
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.typeRow}
          >
            {COMPONENT_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor: t === type ? colors.primary : colors.secondary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      t === type ? colors.primaryForeground : colors.secondaryForeground,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  {t.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <PrimaryButton title="Save" onPress={handleSave} style={styles.saveButton} />
          <PrimaryButton
            title="Delete component"
            variant="destructive"
            onPress={() => onDelete(component.id)}
            style={styles.deleteButton}
          />
          <Pressable onPress={onClose} style={styles.cancelButton}>
            <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: { borderRadius: 18, padding: 22 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 18,
    fontFamily: 'Inter_700Bold',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    fontFamily: 'Inter_600SemiBold',
  },
  typeRow: { marginBottom: 20 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  saveButton: { marginTop: 4 },
  deleteButton: { marginTop: 10 },
  cancelButton: { alignItems: 'center', marginTop: 12, padding: 8 },
});
