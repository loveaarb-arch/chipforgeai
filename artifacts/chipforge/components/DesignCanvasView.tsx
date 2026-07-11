import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ComponentEditModal } from '@/components/ComponentEditModal';
import type { ChipComponent, ChipConnection, ChipDesign } from '@workspace/api-client-react';

const CANVAS_SIZE = 1600;
const TAP_SLOP = 4;

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
  // Shared values drive the transform entirely on the UI thread, so dragging
  // stays smooth (60fps) even while the JS thread is busy elsewhere.
  const translateX = useSharedValue(component.x);
  const translateY = useSharedValue(component.y);
  const startX = useSharedValue(component.x);
  const startY = useSharedValue(component.y);
  const dragging = useSharedValue(false);

  // Keep in sync with position changes coming from outside this gesture
  // (e.g. the AI regenerating the design, or a version restore) as long as
  // the user isn't actively dragging this node right now.
  useEffect(() => {
    if (!dragging.value) {
      translateX.value = component.x;
      translateY.value = component.y;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component.x, component.y]);

  const pan = Gesture.Pan()
    .minDistance(1)
    .onBegin(() => {
      dragging.value = true;
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX / scale;
      translateY.value = startY.value + e.translationY / scale;
    })
    .onEnd((e) => {
      dragging.value = false;
      const moved = Math.abs(e.translationX) > TAP_SLOP || Math.abs(e.translationY) > TAP_SLOP;
      if (moved) {
        runOnJS(onDragEnd)(
          component.id,
          Math.round(translateX.value),
          Math.round(translateY.value),
        );
      } else {
        runOnJS(onPress)(component);
      }
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.node,
          {
            width: component.width,
            height: component.height,
            borderColor: color,
          },
          animatedStyle,
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
    </GestureDetector>
  );
}

export function DesignCanvasView({ design, onChange, saving }: Props) {
  const colors = useColors();
  const [scale, setScale] = useState(1);
  const [editing, setEditing] = useState<ChipComponent | null>(null);

  const lines = useMemo(() => {
    const byId = new Map(design.components.map((c) => [c.id, c]));
    return design.connections
      .map((conn: ChipConnection) => {
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
            onPress={() => setScale((s) => Math.max(0.4, Math.round((s - 0.15) * 100) / 100))}
            style={[styles.zoomButton, { borderColor: colors.border }]}
          >
            <Feather name="zoom-out" size={16} color={colors.foreground} />
          </Pressable>
          <Pressable
            onPress={() => setScale((s) => Math.min(2, Math.round((s + 0.15) * 100) / 100))}
            style={[styles.zoomButton, { borderColor: colors.border }]}
          >
            <Feather name="zoom-in" size={16} color={colors.foreground} />
          </Pressable>
        </View>
        {saving ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Saving…</Text>
        ) : null}
      </View>

      {/* Using gesture-handler's ScrollView (not the plain RN one) lets the
          drag gesture on each node negotiate cleanly with canvas panning
          instead of both fighting over the same touch. */}
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
              <Svg style={StyleSheet.absoluteFill} width={CANVAS_SIZE} height={CANVAS_SIZE}>
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
