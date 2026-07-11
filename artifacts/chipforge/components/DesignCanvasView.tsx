import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ComponentEditModal } from '@/components/ComponentEditModal';
import type { ChipComponent, ChipConnection, ChipDesign } from '@workspace/api-client-react';

const CANVAS_SIZE = 1600;

interface Props {
  design: ChipDesign;
  onChange: (design: ChipDesign) => void;
  saving?: boolean;
}

function nextId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function ComponentNode({
  component,
  scale,
  color,
  onDragEnd,
  onPress,
}: {
  component: ChipComponent;
  scale: number;
  color: string;
  onDragEnd: (id: string, x: number, y: number) => void;
  onPress: (component: ChipComponent) => void;
}) {
  const start = useRef({ x: component.x, y: component.y });
  const pan = useRef(new Animated.ValueXY({ x: component.x, y: component.y })).current;
  const dragged = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        dragged.current = false;
        start.current = { x: (pan.x as any)._value, y: (pan.y as any)._value };
      },
      onPanResponderMove: (_, gesture) => {
        dragged.current = true;
        pan.setValue({
          x: start.current.x + gesture.dx / scale,
          y: start.current.y + gesture.dy / scale,
        });
      },
      onPanResponderRelease: () => {
        const x = Math.round((pan.x as any)._value);
        const y = Math.round((pan.y as any)._value);
        if (dragged.current) {
          onDragEnd(component.id, x, y);
        } else {
          onPress(component);
        }
      },
    }),
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.node,
        {
          width: component.width,
          height: component.height,
          borderColor: color,
          transform: pan.getTranslateTransform(),
        },
      ]}
    >
      <Text style={styles.nodeType} numberOfLines={1}>
        {component.type.replace('_', ' ')}
      </Text>
      <Text style={styles.nodeLabel} numberOfLines={2}>
        {component.label}
        {component.bitWidth ? ` [${component.bitWidth - 1}:0]` : ''}
      </Text>
    </Animated.View>
  );
}

export function DesignCanvasView({ design, onChange, saving }: Props) {
  const colors = useColors();
  const [scale, setScale] = useState(1);
  const [editing, setEditing] = useState<ChipComponent | null>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>()).current;

  design.components.forEach((c) => {
    if (!positions.has(c.id)) positions.set(c.id, { x: c.x, y: c.y });
  });

  const lines = useMemo(() => {
    const byId = new Map(design.components.map((c) => [c.id, c]));
    return design.connections
      .map((conn) => {
        const from = byId.get(conn.fromComponentId);
        const to = byId.get(conn.toComponentId);
        if (!from || !to) return null;
        return {
          id: conn.id,
          x1: from.x + from.width / 2,
          y1: from.y + from.height / 2,
          x2: to.x + to.width / 2,
          y2: to.y + to.height / 2,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [design]);

  const updateComponentPosition = (id: string, x: number, y: number) => {
    onChange({
      ...design,
      components: design.components.map((c) => (c.id === id ? { ...c, x, y } : c)),
    });
  };

  const handleAddComponent = () => {
    const newComponent: ChipComponent = {
      id: nextId('comp'),
      type: 'register',
      label: 'New block',
      x: 80,
      y: 80,
      width: 140,
      height: 80,
      bitWidth: 8,
      properties: {},
    };
    onChange({ ...design, components: [...design.components, newComponent] });
    setEditing(newComponent);
  };

  const handleSaveComponent = (updated: ChipComponent) => {
    onChange({
      ...design,
      components: design.components.map((c) => (c.id === updated.id ? updated : c)),
    });
    setEditing(null);
  };

  const handleDeleteComponent = (id: string) => {
    onChange({
      components: design.components.filter((c) => c.id !== id),
      connections: design.connections.filter(
        (conn) => conn.fromComponentId !== id && conn.toComponentId !== id,
      ),
    });
    setEditing(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={handleAddComponent}
          style={[styles.toolbarButton, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={16} color={colors.primaryForeground} />
          <Text style={[styles.toolbarButtonText, { color: colors.primaryForeground }]}>
            Add block
          </Text>
        </Pressable>
        <View style={styles.zoomGroup}>
          <Pressable
            onPress={() => setScale((s) => Math.max(0.4, s - 0.15))}
            style={[styles.zoomButton, { borderColor: colors.border }]}
          >
            <Feather name="zoom-out" size={16} color={colors.foreground} />
          </Pressable>
          <Pressable
            onPress={() => setScale((s) => Math.min(2, s + 0.15))}
            style={[styles.zoomButton, { borderColor: colors.border }]}
          >
            <Feather name="zoom-in" size={16} color={colors.foreground} />
          </Pressable>
        </View>
        {saving ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Saving…</Text>
        ) : null}
      </View>

      <ScrollView>
        <ScrollView horizontal>
          <View
            style={{
              width: CANVAS_SIZE * scale,
              height: CANVAS_SIZE * scale,
            }}
          >
            <View
              style={{
                width: CANVAS_SIZE,
                height: CANVAS_SIZE,
                transform: [{ scale }],
                transformOrigin: '0 0',
              }}
            >
              <Svg
                style={StyleSheet.absoluteFill}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
              >
                {lines.map((line) => (
                  <Line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke={colors.primary}
                    strokeWidth={2}
                  />
                ))}
              </Svg>

              {design.components.length === 0 ? (
                <View style={styles.emptyCanvas}>
                  <Text style={{ color: colors.mutedForeground }}>
                    Ask the AI in the Chat tab to generate an architecture, or add a
                    block manually.
                  </Text>
                </View>
              ) : null}

              {design.components.map((component) => (
                <ComponentNode
                  key={component.id}
                  component={component}
                  scale={scale}
                  color={colors.primary}
                  onDragEnd={updateComponentPosition}
                  onPress={setEditing}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      <ComponentEditModal
        visible={!!editing}
        component={editing}
        onClose={() => setEditing(null)}
        onSave={handleSaveComponent}
        onDelete={handleDeleteComponent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toolbarButtonText: { fontSize: 13, fontWeight: '600' },
  zoomGroup: { flexDirection: 'row', gap: 8 },
  zoomButton: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  node: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(18,28,49,0.95)',
    padding: 8,
    justifyContent: 'center',
  },
  nodeType: {
    color: '#8494b3',
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  nodeLabel: { color: '#e6edf5', fontSize: 13, fontWeight: '600' },
  emptyCanvas: { position: 'absolute', top: 40, left: 20, right: 20 },
});
