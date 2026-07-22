/**
 * ComponentLibraryPanel — manual EDA component picker.
 *
 * Organised into categories matching real EDA tool palettes. Tapping any
 * component adds it to the live design and shows a confirmation badge.
 * The user then switches to the Diagram tab to position and connect it.
 */
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Component catalogue ────────────────────────────────────────────────────

interface LibraryItem {
  type: ChipComponent['type'];
  label: string;
  defaultLabel: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  defaultWidth: number;
  defaultHeight: number;
  defaultBitWidth: number | null;
}

interface LibraryCategory {
  key: string;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  items: LibraryItem[];
}

const CATEGORIES: LibraryCategory[] = [
  {
    key: 'logic',
    title: 'Logic gates',
    icon: 'git-merge',
    color: '#6366f1',
    items: [
      {
        type: 'logic_gate',
        label: 'AND',
        defaultLabel: 'AND Gate',
        description: 'Output is HIGH only when all inputs are HIGH',
        icon: 'minimize-2',
        defaultWidth: 120,
        defaultHeight: 70,
        defaultBitWidth: 1,
      },
      {
        type: 'logic_gate',
        label: 'OR',
        defaultLabel: 'OR Gate',
        description: 'Output is HIGH when any input is HIGH',
        icon: 'maximize-2',
        defaultWidth: 120,
        defaultHeight: 70,
        defaultBitWidth: 1,
      },
      {
        type: 'logic_gate',
        label: 'NAND',
        defaultLabel: 'NAND Gate',
        description: 'Inverted AND — universal building block',
        icon: 'minimize-2',
        defaultWidth: 120,
        defaultHeight: 70,
        defaultBitWidth: 1,
      },
      {
        type: 'logic_gate',
        label: 'NOR',
        defaultLabel: 'NOR Gate',
        description: 'Inverted OR — universal building block',
        icon: 'maximize-2',
        defaultWidth: 120,
        defaultHeight: 70,
        defaultBitWidth: 1,
      },
      {
        type: 'logic_gate',
        label: 'XOR',
        defaultLabel: 'XOR Gate',
        description: 'High when inputs differ — used in adders and parity',
        icon: 'shuffle',
        defaultWidth: 120,
        defaultHeight: 70,
        defaultBitWidth: 1,
      },
      {
        type: 'logic_gate',
        label: 'NOT',
        defaultLabel: 'Inverter',
        description: 'Inverts the input — single input, single output',
        icon: 'refresh-cw',
        defaultWidth: 100,
        defaultHeight: 60,
        defaultBitWidth: 1,
      },
      {
        type: 'logic_gate',
        label: 'XNOR',
        defaultLabel: 'XNOR Gate',
        description: 'High when inputs match — equality detector',
        icon: 'shuffle',
        defaultWidth: 120,
        defaultHeight: 70,
        defaultBitWidth: 1,
      },
    ],
  },
  {
    key: 'arithmetic',
    title: 'Arithmetic',
    icon: 'plus-square',
    color: '#f59e0b',
    items: [
      {
        type: 'alu',
        label: 'ALU',
        defaultLabel: 'ALU',
        description: 'Arithmetic Logic Unit — add, sub, AND, OR, shift in one block',
        icon: 'cpu',
        defaultWidth: 160,
        defaultHeight: 100,
        defaultBitWidth: 8,
      },
      {
        type: 'alu',
        label: 'Adder',
        defaultLabel: 'Adder',
        description: 'Combinational adder with carry-in and carry-out',
        icon: 'plus',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'alu',
        label: 'Subtractor',
        defaultLabel: 'Subtractor',
        description: 'Binary subtractor with borrow output',
        icon: 'minus',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'alu',
        label: 'Multiplier',
        defaultLabel: 'Multiplier',
        description: 'Parallel multiplier — uses DSP slices on FPGA',
        icon: 'x',
        defaultWidth: 160,
        defaultHeight: 90,
        defaultBitWidth: 8,
      },
      {
        type: 'alu',
        label: 'Comparator',
        defaultLabel: 'Comparator',
        description: 'Outputs equal, less-than, greater-than flags',
        icon: 'bar-chart-2',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'alu',
        label: 'Shifter',
        defaultLabel: 'Barrel Shifter',
        description: 'Logical / arithmetic shift left or right by N bits',
        icon: 'chevrons-right',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
    ],
  },
  {
    key: 'storage',
    title: 'Storage & registers',
    icon: 'database',
    color: '#10b981',
    items: [
      {
        type: 'register',
        label: 'D Flip-Flop',
        defaultLabel: 'D Flip-Flop',
        description: 'Single-bit clocked storage element',
        icon: 'toggle-right',
        defaultWidth: 130,
        defaultHeight: 80,
        defaultBitWidth: 1,
      },
      {
        type: 'register',
        label: 'Register',
        defaultLabel: 'Register',
        description: 'N-bit parallel register with synchronous load',
        icon: 'layers',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'register',
        label: 'Shift Reg',
        defaultLabel: 'Shift Register',
        description: 'Serial-in / parallel-out or SIPO shift register',
        icon: 'align-left',
        defaultWidth: 160,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'counter',
        label: 'Counter',
        defaultLabel: 'Counter',
        description: 'N-bit up/down counter with enable and reset',
        icon: 'hash',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'memory',
        label: 'FIFO',
        defaultLabel: 'FIFO Buffer',
        description: 'First-in / first-out queue with full / empty flags',
        icon: 'align-justify',
        defaultWidth: 160,
        defaultHeight: 90,
        defaultBitWidth: 8,
      },
      {
        type: 'memory',
        label: 'BRAM',
        defaultLabel: 'Block RAM',
        description: 'On-chip synchronous dual-port block RAM',
        icon: 'server',
        defaultWidth: 160,
        defaultHeight: 100,
        defaultBitWidth: 8,
      },
      {
        type: 'memory',
        label: 'ROM',
        defaultLabel: 'ROM',
        description: 'Read-only memory — initialised at synthesis',
        icon: 'book',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
    ],
  },
  {
    key: 'mux',
    title: 'Multiplexing & routing',
    icon: 'git-pull-request',
    color: '#ec4899',
    items: [
      {
        type: 'mux',
        label: '2:1 Mux',
        defaultLabel: '2:1 Mux',
        description: 'Selects one of two inputs based on a 1-bit select',
        icon: 'git-merge',
        defaultWidth: 130,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'mux',
        label: '4:1 Mux',
        defaultLabel: '4:1 Mux',
        description: 'Selects one of four inputs with a 2-bit select bus',
        icon: 'git-merge',
        defaultWidth: 140,
        defaultHeight: 90,
        defaultBitWidth: 8,
      },
      {
        type: 'mux',
        label: '8:1 Mux',
        defaultLabel: '8:1 Mux',
        description: 'Selects one of eight inputs with a 3-bit select bus',
        icon: 'git-merge',
        defaultWidth: 140,
        defaultHeight: 90,
        defaultBitWidth: 8,
      },
      {
        type: 'mux',
        label: 'Demux',
        defaultLabel: 'Demultiplexer',
        description: 'Routes one input to one of N outputs based on select',
        icon: 'git-branch',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: 8,
      },
      {
        type: 'decoder',
        label: 'Decoder',
        defaultLabel: 'Decoder',
        description: 'N-to-2ⁿ binary decoder, e.g. 3-to-8',
        icon: 'unlock',
        defaultWidth: 130,
        defaultHeight: 80,
        defaultBitWidth: null,
      },
      {
        type: 'decoder',
        label: 'Encoder',
        defaultLabel: 'Priority Encoder',
        description: '2ⁿ-to-N priority encoder with valid flag',
        icon: 'lock',
        defaultWidth: 130,
        defaultHeight: 80,
        defaultBitWidth: null,
      },
    ],
  },
  {
    key: 'io',
    title: 'I/O & clocking',
    icon: 'zap',
    color: '#f97316',
    items: [
      {
        type: 'input_port',
        label: 'Input',
        defaultLabel: 'Input Port',
        description: 'External input pin or bus entering the design',
        icon: 'log-in',
        defaultWidth: 120,
        defaultHeight: 60,
        defaultBitWidth: 1,
      },
      {
        type: 'output_port',
        label: 'Output',
        defaultLabel: 'Output Port',
        description: 'External output pin or bus leaving the design',
        icon: 'log-out',
        defaultWidth: 120,
        defaultHeight: 60,
        defaultBitWidth: 1,
      },
      {
        type: 'clock',
        label: 'Clock',
        defaultLabel: 'CLK',
        description: 'Clock source — drives all synchronous elements',
        icon: 'clock',
        defaultWidth: 110,
        defaultHeight: 60,
        defaultBitWidth: 1,
      },
      {
        type: 'input_port',
        label: 'Reset',
        defaultLabel: 'RST',
        description: 'Synchronous or asynchronous reset signal',
        icon: 'refresh-ccw',
        defaultWidth: 110,
        defaultHeight: 60,
        defaultBitWidth: 1,
      },
      {
        type: 'wire',
        label: 'Bus',
        defaultLabel: 'Data Bus',
        description: 'Multi-bit wire bundle connecting components',
        icon: 'minus',
        defaultWidth: 140,
        defaultHeight: 50,
        defaultBitWidth: 8,
      },
      {
        type: 'input_port',
        label: 'Enable',
        defaultLabel: 'Enable',
        description: 'Global or local enable / chip-select signal',
        icon: 'power',
        defaultWidth: 110,
        defaultHeight: 60,
        defaultBitWidth: 1,
      },
    ],
  },
  {
    key: 'fsm',
    title: 'Control & FSM',
    icon: 'activity',
    color: '#8b5cf6',
    items: [
      {
        type: 'custom',
        label: 'FSM',
        defaultLabel: 'State Machine',
        description: 'Finite state machine controller with encoded states',
        icon: 'activity',
        defaultWidth: 160,
        defaultHeight: 100,
        defaultBitWidth: null,
      },
      {
        type: 'custom',
        label: 'Controller',
        defaultLabel: 'Controller',
        description: 'Datapath controller that sequences operations',
        icon: 'settings',
        defaultWidth: 160,
        defaultHeight: 100,
        defaultBitWidth: null,
      },
      {
        type: 'custom',
        label: 'Arbiter',
        defaultLabel: 'Bus Arbiter',
        description: 'Grants bus access among competing requesters',
        icon: 'git-pull-request',
        defaultWidth: 150,
        defaultHeight: 90,
        defaultBitWidth: null,
      },
      {
        type: 'custom',
        label: 'UART',
        defaultLabel: 'UART',
        description: 'Universal asynchronous receiver-transmitter',
        icon: 'radio',
        defaultWidth: 150,
        defaultHeight: 90,
        defaultBitWidth: 8,
      },
      {
        type: 'custom',
        label: 'SPI',
        defaultLabel: 'SPI Controller',
        description: 'Serial Peripheral Interface master/slave',
        icon: 'link-2',
        defaultWidth: 150,
        defaultHeight: 90,
        defaultBitWidth: 8,
      },
      {
        type: 'custom',
        label: 'I²C',
        defaultLabel: 'I²C Controller',
        description: 'Two-wire Inter-Integrated Circuit interface',
        icon: 'share-2',
        defaultWidth: 150,
        defaultHeight: 90,
        defaultBitWidth: 8,
      },
    ],
  },
  {
    key: 'custom',
    title: 'Custom block',
    icon: 'box',
    color: '#64748b',
    items: [
      {
        type: 'custom',
        label: 'Custom',
        defaultLabel: 'Custom Block',
        description: 'Blank block — name it whatever you need',
        icon: 'box',
        defaultWidth: 140,
        defaultHeight: 80,
        defaultBitWidth: null,
      },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function nextId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function spawnPosition(existing: ChipComponent[], w: number, h: number) {
  // Offset each new component so they don't stack on top of one another.
  const n = existing.length;
  const col = n % 4;
  const row = Math.floor(n / 4);
  return {
    x: 80 + col * (w + 40),
    y: 80 + row * (h + 40),
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  design: ChipDesign;
  onChange: (design: ChipDesign) => void;
  onGoToDiagram: () => void;
}

export function ComponentLibraryPanel({ design, onChange, onGoToDiagram }: Props) {
  const colors = useColors();
  const [openCategory, setOpenCategory] = useState<string | null>('logic');
  const [addedId, setAddedId] = useState<string | null>(null);

  const handleAdd = (item: LibraryItem) => {
    const pos = spawnPosition(design.components, item.defaultWidth, item.defaultHeight);
    const newComp: ChipComponent = {
      id: nextId('comp'),
      type: item.type,
      label: item.defaultLabel,
      x: pos.x,
      y: pos.y,
      width: item.defaultWidth,
      height: item.defaultHeight,
      bitWidth: item.defaultBitWidth,
      properties: { subtype: item.label },
    };
    onChange({ ...design, components: [...design.components, newComp] });
    setAddedId(newComp.id);
    setTimeout(() => setAddedId(null), 1500);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.heading, { color: colors.foreground }]}>Component library</Text>
          <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
            Tap any component to add it to your design
          </Text>
        </View>
        {design.components.length > 0 ? (
          <Pressable
            onPress={onGoToDiagram}
            style={[styles.diagramBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="git-merge" size={14} color={colors.primaryForeground} />
            <Text style={[styles.diagramBtnText, { color: colors.primaryForeground }]}>
              Diagram
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Component count */}
      {design.components.length > 0 ? (
        <View style={[styles.countBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="layers" size={14} color={colors.primary} />
          <Text style={[styles.countText, { color: colors.foreground }]}>
            {design.components.length} component{design.components.length !== 1 ? 's' : ''} in design
            {'  '}
            <Text style={{ color: colors.mutedForeground }}>
              — switch to Diagram to position and connect them
            </Text>
          </Text>
        </View>
      ) : null}

      {/* Category accordion */}
      {CATEGORIES.map((category) => (
        <View key={category.key} style={[styles.category, { borderColor: colors.border }]}>
          {/* Category header */}
          <Pressable
            onPress={() =>
              setOpenCategory(openCategory === category.key ? null : category.key)
            }
            style={[styles.categoryHeader, { backgroundColor: colors.card }]}
          >
            <View style={[styles.categoryIcon, { backgroundColor: category.color + '22' }]}>
              <Feather name={category.icon} size={16} color={category.color} />
            </View>
            <Text style={[styles.categoryTitle, { color: colors.foreground }]}>
              {category.title}
            </Text>
            <Text style={[styles.categoryCount, { color: colors.mutedForeground }]}>
              {category.items.length}
            </Text>
            <Feather
              name={openCategory === category.key ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.mutedForeground}
            />
          </Pressable>

          {/* Items */}
          {openCategory === category.key ? (
            <View style={[styles.itemList, { borderTopColor: colors.border }]}>
              {category.items.map((item, i) => {
                const justAdded = addedId !== null; // flash any recently added item
                return (
                  <Pressable
                    key={`${item.type}-${item.label}-${i}`}
                    onPress={() => handleAdd(item)}
                    style={({ pressed }) => [
                      styles.item,
                      {
                        backgroundColor: pressed ? colors.card : 'transparent',
                        borderBottomColor: colors.border,
                        borderBottomWidth: i < category.items.length - 1 ? StyleSheet.hairlineWidth : 0,
                      },
                    ]}
                  >
                    {/* Icon badge */}
                    <View style={[styles.itemIcon, { backgroundColor: category.color + '18' }]}>
                      <Feather name={item.icon} size={18} color={category.color} />
                    </View>

                    {/* Text */}
                    <View style={styles.itemText}>
                      <View style={styles.itemTitleRow}>
                        <Text style={[styles.itemLabel, { color: colors.foreground }]}>
                          {item.label}
                        </Text>
                        {item.defaultBitWidth !== null ? (
                          <View style={[styles.bitBadge, { borderColor: colors.border }]}>
                            <Text style={[styles.bitBadgeText, { color: colors.mutedForeground }]}>
                              {item.defaultBitWidth}-bit
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.itemDescription, { color: colors.mutedForeground }]}
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>
                    </View>

                    {/* Add button */}
                    <View style={[styles.addButton, { borderColor: category.color }]}>
                      <Feather name="plus" size={16} color={category.color} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ))}

      {/* Flash toast */}
      {addedId ? (
        <View
          style={[
            styles.toast,
            { backgroundColor: colors.primary },
          ]}
          pointerEvents="none"
        >
          <Feather name="check" size={14} color={colors.primaryForeground} />
          <Text style={[styles.toastText, { color: colors.primaryForeground }]}>
            Added — switch to Diagram to place it
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heading: { fontSize: 17, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  subheading: { fontSize: 13, marginTop: 2, fontFamily: 'Inter_400Regular' },

  diagramBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  diagramBtnText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },

  countBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  countText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },

  category: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  categoryIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  categoryCount: { fontSize: 12, fontFamily: 'Inter_400Regular', marginRight: 4 },

  itemList: { borderTopWidth: StyleSheet.hairlineWidth },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: { flex: 1, gap: 2 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  itemDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },

  bitBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  bitBadgeText: { fontSize: 10, fontFamily: 'Inter_400Regular' },

  addButton: {
    width: 32,
    height: 32,
    borderWidth: 1.5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  toast: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  toastText: { fontSize: 13, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
});
