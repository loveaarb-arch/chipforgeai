/**
 * BuildWorkspace — KiCad-style professional PCB editor layout.
 *
 * Layout (top-to-bottom, left-to-right):
 *   TopActionBar  (full width, dark)
 *   ToolRail | Canvas + FloatingZoom | LayersPanel
 *   StatsBar      (full width, dark)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DesignCanvasView } from '@/components/DesignCanvasView';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Palette ──────────────────────────────────────────────────────────────────

const BG        = '#0B1220';   // canvas / root background
const DARK_SURF = '#0d1525';   // toolbar / rail surface
const DARK_BORD = '#1a2840';   // borders on dark surfaces
const PANEL_BG  = '#ffffff';
const PANEL_BD  = '#d0d0d0';
const PANEL_TXT = '#1a1a1a';
const PANEL_MUT = '#666666';
const ACCENT    = '#00bcd4';   // teal accent for active states

// ─── Layer definitions ────────────────────────────────────────────────────────

interface LayerDef {
  id:      string;
  name:    string;
  color:   string;
  visible: boolean;
  locked:  boolean;
}

const LAYERS_DEFAULT: LayerDef[] = [
  { id:'comp',   name:'Components',      color:'#e03030', visible:true,  locked:false },
  { id:'topcu',  name:'Top Copper',      color:'#e07020', visible:true,  locked:false },
  { id:'botcu',  name:'Bottom Copper',   color:'#c05010', visible:true,  locked:false },
  { id:'gnd',    name:'GND Layer',       color:'#30a030', visible:true,  locked:false },
  { id:'v33',    name:'3.3V Layer',      color:'#2060d0', visible:true,  locked:false },
  { id:'pwr',    name:'Power Layer',     color:'#d03030', visible:true,  locked:false },
  { id:'silkf',  name:'Silkscreen Top',  color:'#f0f0f0', visible:true,  locked:false },
  { id:'silkb',  name:'Silkscreen Bot',  color:'#a0a0a0', visible:false, locked:false },
  { id:'maskf',  name:'Solder Mask Top', color:'#a040a0', visible:true,  locked:false },
  { id:'maskb',  name:'Solder Mask Bot', color:'#803080', visible:false, locked:false },
  { id:'drill',  name:'Drill Holes',     color:'#808080', visible:true,  locked:false },
  { id:'edge',   name:'Board Outline',   color:'#e0c000', visible:true,  locked:false },
  { id:'notes',  name:'Notes',           color:'#0080c0', visible:false, locked:false },
  { id:'cmt',    name:'Comments',        color:'#00a0c0', visible:true,  locked:false },
];

// ─── Tool definitions ─────────────────────────────────────────────────────────

type ToolId = 'select' | 'place' | 'route' | 'via' | 'delete' | 'measure' | 'pan';

interface ToolDef {
  id:    ToolId;
  label: string;
  icon:  React.ComponentProps<typeof Feather>['name'];
}

const TOOLS: ToolDef[] = [
  { id:'select',  label:'Select',  icon:'mouse-pointer' },
  { id:'place',   label:'Place',   icon:'square'        },
  { id:'route',   label:'Route',   icon:'zap'           },
  { id:'via',     label:'Via',     icon:'circle'        },
  { id:'delete',  label:'Delete',  icon:'trash-2'       },
  { id:'measure', label:'Measure', icon:'crosshair'      },
  { id:'pan',     label:'Pan',     icon:'move'          },
];

// ─── Component palette ────────────────────────────────────────────────────────

interface CompDef {
  type: ChipComponent['type'];
  label: string;
  symbol: string;
  w: number; h: number;
  bits: number | null;
}

const COMP_DEFS: CompDef[] = [
  { type:'logic_gate',  label:'AND',  symbol:'&',   w:80,  h:56, bits:1    },
  { type:'logic_gate',  label:'OR',   symbol:'≥1',  w:80,  h:56, bits:1    },
  { type:'logic_gate',  label:'XOR',  symbol:'=1',  w:80,  h:56, bits:1    },
  { type:'logic_gate',  label:'NOT',  symbol:'1̄',  w:64,  h:48, bits:1    },
  { type:'flip_flop',   label:'FF',   symbol:'D▷',  w:96,  h:72, bits:1    },
  { type:'multiplexer', label:'MUX',  symbol:'MUX', w:96,  h:80, bits:1    },
  { type:'alu',         label:'ALU',  symbol:'ALU', w:96,  h:80, bits:1    },
  { type:'register',    label:'REG',  symbol:'REG', w:112, h:72, bits:8    },
  { type:'memory',      label:'RAM',  symbol:'RAM', w:128, h:80, bits:8    },
  { type:'clock',       label:'CLK',  symbol:'CLK', w:72,  h:56, bits:null },
  { type:'io_port',     label:'IN',   symbol:'IN',  w:64,  h:48, bits:1    },
  { type:'io_port',     label:'OUT',  symbol:'OUT', w:64,  h:48, bits:1    },
];

const COMP_COLORS: Record<string, string> = {
  logic_gate:  '#00bcd4',
  flip_flop:   '#e07020',
  multiplexer: '#9c27b0',
  alu:         '#d03030',
  register:    '#30a030',
  memory:      '#673ab7',
  clock:       '#f0c030',
  io_port:     '#00e5ff',
};

// ─── Analysis helpers ─────────────────────────────────────────────────────────

function runDRC(design: ChipDesign): string {
  const issues: string[] = [];
  const conn = new Set([
    ...design.connections.map(c => c.fromComponentId),
    ...design.connections.map(c => c.toComponentId),
  ]);
  for (const c of design.components)
    if (!conn.has(c.id)) issues.push(`⚠ "${c.label}" — floating`);
  for (const c of design.components)
    if (['flip_flop','register','memory'].includes(c.type) &&
        !design.connections.some(cn => cn.toComponentId === c.id))
      issues.push(`⚠ "${c.label}" — no inputs`);
  if (design.components.length > 0 && !design.components.some(c => c.type === 'io_port'))
    issues.push('⚠ No I/O port');
  return issues.length === 0
    ? '✓ DRC passed — no violations.'
    : issues.join('\n\n');
}

function runERC(design: ChipDesign): string {
  const issues: string[] = [];
  const byId = new Map(design.components.map(c => [c.id, c]));
  const fo = new Map<string, number>();
  for (const c of design.connections) fo.set(c.fromComponentId, (fo.get(c.fromComponentId) ?? 0) + 1);
  fo.forEach((n, id) => {
    if (n > 4) { const b = byId.get(id); if (b) issues.push(`⚠ "${b.label}" — high fan-out (${n})`); }
  });
  const fw = new Map<string, Set<string>>();
  for (const c of design.connections) {
    if (!fw.has(c.fromComponentId)) fw.set(c.fromComponentId, new Set());
    fw.get(c.fromComponentId)!.add(c.toComponentId);
  }
  for (const [f, ts] of fw) for (const t of ts)
    if (fw.get(t)?.has(f)) issues.push(`⚠ Loop: "${byId.get(f)?.label}" ↔ "${byId.get(t)?.label}"`);
  if (design.components.length > 1 && design.connections.length === 0) issues.push('⚠ No wires');
  return issues.length === 0 ? '✓ ERC passed — no violations.' : issues.join('\n\n');
}

function autoRoute(design: ChipDesign): ChipDesign {
  if (!design.components.length) return design;
  const inDeg = new Map(design.components.map(c => [c.id, 0]));
  const out   = new Map(design.components.map(c => [c.id, [] as string[]]));
  for (const c of design.connections) {
    inDeg.set(c.toComponentId, (inDeg.get(c.toComponentId) ?? 0) + 1);
    out.get(c.fromComponentId)?.push(c.toComponentId);
  }
  const layers: string[][] = [], visited = new Set<string>();
  let q = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  while (q.length) {
    layers.push(q); q.forEach(id => visited.add(id));
    const nxt: string[] = [];
    for (const id of q) for (const nb of out.get(id) ?? []) {
      const nd = (inDeg.get(nb) ?? 1) - 1; inDeg.set(nb, nd);
      if (nd === 0 && !visited.has(nb)) nxt.push(nb);
    }
    q = nxt;
  }
  const uv = design.components.map(c => c.id).filter(id => !visited.has(id));
  if (uv.length) layers.push(uv);
  const byId = new Map(design.components.map(c => [c.id, c]));
  const pos  = new Map<string, { x: number; y: number }>();
  let x = 60;
  for (const layer of layers) {
    const lw = Math.max(...layer.map(id => byId.get(id)?.width ?? 140));
    let y = 60;
    for (const id of layer) { pos.set(id, { x, y }); y += (byId.get(id)?.height ?? 80) + 36; }
    x += lw + 140;
  }
  return { ...design, components: design.components.map(c => { const p = pos.get(c.id); return p ? { ...c, ...p } : c; }) };
}

// ─── Grid sizes ───────────────────────────────────────────────────────────────

const GRID_SIZES = [0.05, 0.10, 0.25, 0.50];

function showToast(msg: string) {
  Alert.alert('', msg);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  design: ChipDesign;
  onChange: (d: ChipDesign) => void;
  saving?: boolean;
  onValidate?: () => void;
  onAiAssist?: () => void;
  grid: boolean;
  snap: boolean;
  onGridChange: (v: boolean) => void;
  onSnapChange: (v: boolean) => void;
}

// ─── BuildWorkspace ───────────────────────────────────────────────────────────

export function BuildWorkspace({
  design, onChange, saving, onValidate, onAiAssist,
  grid, snap, onGridChange, onSnapChange,
}: Props) {
  const [layers,      setLayers]   = useState<LayerDef[]>(LAYERS_DEFAULT);
  const [activeTool,  setTool]     = useState<ToolId>('select');
  const [scale,       setScale]    = useState(1);
  const [gridSizeIdx, setGridIdx]  = useState(1); // 0.10 mm default
  const [showPanel,   setShowPanel]= useState(true);
  const [showRender,  setRender]   = useState(false);
  const [selectedId,  setId]       = useState<string | null>(null);

  const canvasWrapRef = useRef<View>(null);
  const sel = design.components.find(c => c.id === selectedId) ?? null;
  const blks  = design.components.length;

  // ── Scroll-wheel zoom (web only) ───────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = canvasWrapRef.current as unknown as HTMLElement;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale(v => Math.max(0.25, Math.min(3, +((v - e.deltaY / 400).toFixed(2)))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Keyboard shortcuts (web only) ─────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          onChange({
            components:  design.components.filter(c => c.id !== selectedId),
            connections: design.connections.filter(
              cn => cn.fromComponentId !== selectedId && cn.toComponentId !== selectedId,
            ),
          });
          setId(null);
        }
      } else if (e.key === 'Escape') {
        setId(null);
      } else if (e.key === '+' || e.key === '=') {
        setScale(v => Math.min(3, +((v + 0.15).toFixed(2))));
      } else if (e.key === '-') {
        setScale(v => Math.max(0.25, +((v - 0.15).toFixed(2))));
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // design auto-saves on every change
      }
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [design, selectedId, onChange]);
  const nets  = new Set(design.connections.map(c => c.fromComponentId + c.toComponentId)).size;
  const drcCount = (() => {
    const r = runDRC(design);
    return r.startsWith('✓') ? 0 : r.split('\n\n').length;
  })();
  const gridLabel = `${GRID_SIZES[gridSizeIdx].toFixed(2)} mm`;
  const zoomLabel = `${Math.round(scale * 100)}%`;

  function cycleTool(id: ToolId) {
    setTool(id);
    if (id !== 'select' && id !== 'pan' && id !== 'delete') {
      // Just activate — canvas gestures handle pan/drag regardless
    }
  }

  function place(def: CompDef) {
    const id = `comp_${Date.now().toString(36)}`;
    onChange({
      ...design,
      components: [...design.components, {
        id, type: def.type, label: def.label,
        x: 60 + (design.components.length % 5) * 20,
        y: 60 + (design.components.length % 7) * 16,
        width: def.w, height: def.h,
        bitWidth: def.bits ?? null, properties: {},
      }],
    });
    setId(id);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>

      {/* ═══════════════ TOP ACTION BAR ═══════════════ */}
      <View style={s.actionBar}>

        {/* Left group: Save / Undo / Redo */}
        <ActionBtn
          icon="save" label={saving ? 'Saving…' : 'Save'}
          onPress={() => {/* auto-saves on change */}}
          accent={!saving}
        />
        <View style={s.abDiv}/>
        <ActionBtn icon="rotate-ccw" label="Undo" onPress={() => showToast('No history yet')} />
        <ActionBtn icon="rotate-cw"  label="Redo" onPress={() => showToast('No history yet')} />

        <View style={s.abDiv}/>

        {/* Zoom picker */}
        <Pressable style={s.abPicker}
          onPress={() => {
            const steps = [0.5, 0.75, 1, 1.25, 1.5, 2];
            const idx = steps.findIndex(v => v >= scale);
            setScale(steps[(idx + 1) % steps.length]);
          }}>
          <Feather name="zoom-in" size={13} color="#7a9aba"/>
          <Text style={s.abPickerTxt}>{zoomLabel}</Text>
          <Feather name="chevron-down" size={10} color="#4a6a8a"/>
        </Pressable>

        {/* Grid picker */}
        <Pressable style={s.abPicker}
          onPress={() => setGridIdx(i => (i + 1) % GRID_SIZES.length)}>
          <Feather name="grid" size={13} color="#7a9aba"/>
          <Text style={s.abPickerTxt}>{gridLabel}</Text>
          <Feather name="chevron-down" size={10} color="#4a6a8a"/>
        </Pressable>

        <View style={{flex:1}}/>

        {/* Layers toggle */}
        <Pressable style={[s.abPicker, showPanel && s.abPickerOn]}
          onPress={() => setShowPanel(v => !v)}>
          <Feather name="layers" size={13} color={showPanel ? ACCENT : '#7a9aba'}/>
          <Text style={[s.abPickerTxt, showPanel && {color: ACCENT}]}>Layers</Text>
        </Pressable>

        {/* Render/Parts toggle */}
        <Pressable style={[s.abPicker, showRender && s.abPickerOn]}
          onPress={() => setRender(v => !v)}>
          <Feather name="cpu" size={13} color={showRender ? ACCENT : '#7a9aba'}/>
          <Text style={[s.abPickerTxt, showRender && {color: ACCENT}]}>Parts</Text>
        </Pressable>
      </View>

      {/* ═══════════════ MIDDLE ROW ═══════════════ */}
      <View style={s.middle}>

        {/* LEFT TOOL RAIL */}
        <View style={s.toolRail}>
          {TOOLS.map(t => {
            const active = activeTool === t.id;
            return (
              <Pressable key={t.id} style={[s.toolBtn, active && s.toolBtnActive]}
                onPress={() => cycleTool(t.id)}>
                <Feather name={t.icon} size={18} color={active ? ACCENT : '#4a6a8a'}/>
                <Text style={[s.toolLabel, active && s.toolLabelActive]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
          <View style={{flex:1}}/>
          {/* Divider + ERC/DRC shortcuts */}
          <View style={s.railDiv}/>
          <Pressable style={s.toolBtn} onPress={() => Alert.alert('DRC', runDRC(design))}>
            <Feather name="check-circle" size={16} color="#3d6a50"/>
            <Text style={[s.toolLabel, {color:'#3d6a50'}]}>DRC</Text>
          </Pressable>
          <Pressable style={s.toolBtn} onPress={() => Alert.alert('ERC', runERC(design))}>
            <Feather name="zap" size={16} color="#3d6a50"/>
            <Text style={[s.toolLabel, {color:'#3d6a50'}]}>ERC</Text>
          </Pressable>
          <Pressable style={s.toolBtn} onPress={() => onChange(autoRoute(design))}>
            <Feather name="share-2" size={16} color="#3d6a50"/>
            <Text style={[s.toolLabel, {color:'#3d6a50'}]}>Route</Text>
          </Pressable>
        </View>

        {/* CANVAS */}
        <View ref={canvasWrapRef} style={s.canvasWrap}>
          <DesignCanvasView
            design={design} onChange={onChange}
            grid={grid} snap={snap}
            darkCanvas hideToolbar
            externalScale={scale}
            onSelectComponent={setId}
          />

          {/* Floating zoom controls — bottom-right */}
          <View style={s.floatZoom}>
            <Pressable style={s.fzBtn}
              onPress={() => setScale(v => Math.min(3, +((v + 0.15).toFixed(2))))}>
              <Text style={s.fzTxt}>+</Text>
            </Pressable>
            <Pressable style={[s.fzBtn, s.fzMid]}
              onPress={() => setScale(1)}>
              <Text style={[s.fzTxt, {fontSize:9}]}>{zoomLabel}</Text>
            </Pressable>
            <Pressable style={s.fzBtn}
              onPress={() => setScale(v => Math.max(0.25, +((v - 0.15).toFixed(2))))}>
              <Text style={s.fzTxt}>−</Text>
            </Pressable>
          </View>

          {/* Snap + Grid toggles — bottom-left */}
          <View style={s.floatSnap}>
            <Pressable style={[s.snapPip, grid && s.snapPipOn]} onPress={() => onGridChange(!grid)}>
              <Text style={[s.snapTxt, grid && s.snapTxtOn]}>Grid</Text>
            </Pressable>
            <Pressable style={[s.snapPip, snap && s.snapPipOn]} onPress={() => onSnapChange(!snap)}>
              <Text style={[s.snapTxt, snap && s.snapTxtOn]}>Snap</Text>
            </Pressable>
          </View>
        </View>

        {/* RIGHT PANEL — Layers or Parts/Tools */}
        {showPanel && (
          <View style={s.panel}>
            {/* Panel header */}
            <View style={s.panelHeader}>
              <Text style={s.panelTitle}>Layers</Text>
              <Pressable onPress={() => setShowPanel(false)}>
                <Feather name="chevron-right" size={16} color={PANEL_MUT}/>
              </Pressable>
            </View>

            <ScrollView style={s.panelScroll} showsVerticalScrollIndicator={false} bounces={false}>
              {layers.map(l => (
                <View key={l.id} style={s.layerRow}>
                  {/* Color swatch */}
                  <View style={[s.swatch, {backgroundColor: l.color}]}/>
                  {/* Name */}
                  <Text style={[s.layerName, !l.visible && s.layerNameOff]} numberOfLines={1}>
                    {l.name}
                  </Text>
                  {/* Eye toggle */}
                  <Pressable hitSlop={8}
                    onPress={() => setLayers(ls => ls.map(x => x.id === l.id ? {...x, visible: !x.visible} : x))}>
                    <Feather name={l.visible ? 'eye' : 'eye-off'} size={14}
                      color={l.visible ? '#555' : '#c0c0c0'}/>
                  </Pressable>
                  {/* Lock toggle */}
                  <Pressable hitSlop={8}
                    onPress={() => setLayers(ls => ls.map(x => x.id === l.id ? {...x, locked: !x.locked} : x))}>
                    <Feather name={l.locked ? 'lock' : 'unlock'} size={14}
                      color={l.locked ? '#555' : '#c0c0c0'}/>
                  </Pressable>
                </View>
              ))}

              {/* + Add Layer */}
              <Pressable style={s.addLayerRow}
                onPress={() => showToast('Custom layers coming soon')}>
                <Feather name="plus" size={13} color={ACCENT}/>
                <Text style={s.addLayerTxt}>Add Layer</Text>
              </Pressable>

              <View style={{height:16}}/>
            </ScrollView>
          </View>
        )}

        {/* RENDER/PARTS panel — shown when Parts active */}
        {showRender && !showPanel && (
          <PartsPanel design={design} onPlace={place} onValidate={onValidate} onAiAssist={onAiAssist} sel={sel}/>
        )}
        {showRender && showPanel && (
          <PartsPanel design={design} onPlace={place} onValidate={onValidate} onAiAssist={onAiAssist} sel={sel}/>
        )}
      </View>

      {/* ═══════════════ STATS BAR ═══════════════ */}
      <View style={s.statsBar}>
        <StatCol icon="cpu"       label="Components" val={String(blks)}    />
        <View style={s.statDiv}/>
        <StatCol icon="git-merge" label="Nets"        val={String(nets)}    />
        <View style={s.statDiv}/>
        <StatCol icon="alert-triangle" label="Errors"  val={String(drcCount)} red={drcCount > 0}/>
        <View style={s.statDiv}/>
        <StatCol icon="grid"      label="Grid"        val={gridLabel}       />
        <View style={s.statDiv}/>
        <StatCol icon="zoom-in"   label="Zoom"        val={zoomLabel}       />
      </View>
    </View>
  );
}

// ─── Parts / Tools panel ──────────────────────────────────────────────────────

function PartsPanel({
  design, onPlace, onValidate, onAiAssist, sel,
}: {
  design: ChipDesign;
  onPlace: (def: CompDef) => void;
  onValidate?: () => void;
  onAiAssist?: () => void;
  sel: ChipComponent | null;
}) {
  return (
    <View style={s.panel}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>Parts</Text>
      </View>
      <ScrollView style={s.panelScroll} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={s.partsSec}><Text style={s.partsSecTxt}>COMPONENTS</Text></View>
        <View style={s.compGrid}>
          {COMP_DEFS.map((def, i) => {
            const col = COMP_COLORS[def.type] ?? '#6b7280';
            return (
              <Pressable key={i} style={s.compTile} onPress={() => onPlace(def)}>
                <View style={[s.compBox, {borderColor: col + '80', backgroundColor: col + '18'}]}>
                  <Text style={[s.compSym, {color: col}]}>{def.symbol}</Text>
                </View>
                <Text style={s.compLbl} numberOfLines={1}>{def.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.partsSec}><Text style={s.partsSecTxt}>TOOLS</Text></View>
        {([
          {icon:'cpu'    as const, lbl:'AI Assist', cb: onAiAssist, acc:true},
          {icon:'shield' as const, lbl:'Validate',  cb: onValidate, acc:true},
        ] as {icon: React.ComponentProps<typeof Feather>['name']; lbl:string; cb?:()=>void; acc?:boolean}[])
        .map(btn => (
          <Pressable key={btn.lbl}
            style={({pressed}) => [s.bigToolBtn, btn.acc && s.bigToolBtnAcc, pressed && {opacity:.75}]}
            onPress={btn.cb}>
            <Feather name={btn.icon} size={13} color={btn.acc ? '#fff' : PANEL_TXT}/>
            <Text style={[s.bigToolTxt, btn.acc && {color:'#fff'}]}>{btn.lbl}</Text>
          </Pressable>
        ))}

        {sel && (
          <>
            <View style={s.partsSec}><Text style={s.partsSecTxt}>PROPERTIES</Text></View>
            <View style={s.propBlock}>
              {[
                ['Type',  sel.type.replace('_',' ')],
                ['Label', sel.label],
                ['X',     String(Math.round(sel.x))],
                ['Y',     String(Math.round(sel.y))],
                ['W',     String(sel.width)],
                ['H',     String(sel.height)],
                ...(sel.bitWidth != null ? [['Bits', String(sel.bitWidth)]] : [] as string[][]),
              ].map(([k, v]) => (
                <View key={k} style={s.propRow}>
                  <Text style={s.propK}>{k}</Text>
                  <Text style={s.propV} numberOfLines={1}>{v}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        <View style={{height:16}}/>
      </ScrollView>
    </View>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, onPress, accent,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable style={({pressed}) => [s.abBtn, pressed && {opacity:.7}]} onPress={onPress}>
      <Feather name={icon} size={13} color={accent ? '#7a9aba' : '#4a6a8a'}/>
      <Text style={[s.abBtnTxt, accent && {color:'#7a9aba'}]}>{label}</Text>
    </Pressable>
  );
}

function StatCol({
  icon, label, val, red,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  val: string;
  red?: boolean;
}) {
  return (
    <View style={s.statCol}>
      <Feather name={icon} size={11} color={red ? '#a03030' : '#283848'}/>
      <View>
        <Text style={[s.statVal, red && {color:'#c04040'}]}>{val}</Text>
        <Text style={s.statLbl}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex:1, flexDirection:'column', backgroundColor: BG },

  // ── Top action bar ──────────────────────────────────────────────────────────
  actionBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 2,
    backgroundColor: DARK_SURF,
    borderBottomWidth: 1, borderBottomColor: DARK_BORD,
  },
  abBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 6,
  },
  abBtnTxt: { fontSize: 11, color: '#4a6a8a' },
  abDiv:    { width:1, height:20, backgroundColor: DARK_BORD, marginHorizontal: 4 },
  abPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1, borderColor: 'transparent',
  },
  abPickerOn:  { borderColor: ACCENT + '40', backgroundColor: ACCENT + '12' },
  abPickerTxt: { fontSize: 11, color: '#7a9aba', minWidth: 36 },

  // ── Middle row ──────────────────────────────────────────────────────────────
  middle: { flex:1, flexDirection:'row' },

  // ── Left tool rail ──────────────────────────────────────────────────────────
  toolRail: {
    width: 56,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
    backgroundColor: DARK_SURF,
    borderRightWidth: 1, borderRightColor: DARK_BORD,
  },
  toolBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, gap: 2,
  },
  toolBtnActive: { backgroundColor: ACCENT + '20' },
  toolLabel:      { fontSize: 7, color: '#4a6a8a', textAlign: 'center' },
  toolLabelActive:{ color: ACCENT },
  railDiv:        { width: 32, height: 1, backgroundColor: DARK_BORD, marginVertical: 4 },

  // ── Canvas area ──────────────────────────────────────────────────────────────
  canvasWrap: { flex:1, position: 'relative' },

  // Floating zoom pill (bottom-right)
  floatZoom: {
    position: 'absolute', right: 12, bottom: 12,
    flexDirection: 'column',
    backgroundColor: '#0d1525',
    borderRadius: 10,
    borderWidth: 1, borderColor: DARK_BORD,
    overflow: 'hidden',
  },
  fzBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  fzMid:{ borderTopWidth:1, borderBottomWidth:1, borderColor: DARK_BORD },
  fzTxt: { fontSize: 16, color: '#7a9aba', lineHeight: 20 },

  // Grid / Snap toggles (bottom-left)
  floatSnap: {
    position: 'absolute', left: 10, bottom: 12,
    flexDirection: 'row', gap: 4,
  },
  snapPip:   {
    paddingHorizontal: 7, paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#0d1525',
    borderWidth: 1, borderColor: DARK_BORD,
  },
  snapPipOn:  { borderColor: ACCENT + '60', backgroundColor: ACCENT + '18' },
  snapTxt:    { fontSize: 9, color: '#4a6a8a' },
  snapTxtOn:  { color: ACCENT },

  // ── Right panel (Layers / Parts) ────────────────────────────────────────────
  panel: {
    width: 182,
    backgroundColor: PANEL_BG,
    borderLeftWidth: 1, borderLeftColor: PANEL_BD,
    flexDirection: 'column',
  },
  panelHeader: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: PANEL_BD,
  },
  panelTitle: { fontSize: 12, fontWeight: '700', color: PANEL_TXT },
  panelScroll:{ flex:1 },

  // Layer rows
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  swatch:       { width: 14, height: 14, borderRadius: 2, flexShrink: 0 },
  layerName:    { flex:1, fontSize: 11, color: PANEL_TXT },
  layerNameOff: { color: '#c0c0c0' },

  addLayerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: PANEL_BD,
  },
  addLayerTxt: { fontSize: 11, color: ACCENT },

  // Parts panel
  partsSec:    {
    height: 24, justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: PANEL_BD,
  },
  partsSecTxt: { fontSize: 9, fontWeight: '700', color: PANEL_MUT, letterSpacing: 0.7 },

  compGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 6 },
  compTile: { width: 64, alignItems: 'center', gap: 3 },
  compBox:  { width: 50, height: 34, borderRadius: 6, borderWidth: 1,
              alignItems: 'center', justifyContent: 'center' },
  compSym:  { fontSize: 11, fontWeight: '700' },
  compLbl:  { fontSize: 9, color: '#374151', textAlign: 'center' },

  bigToolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 10, marginVertical: 3,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 6, borderWidth: 1, borderColor: PANEL_BD,
    backgroundColor: '#f8f8f8',
  },
  bigToolBtnAcc: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  bigToolTxt:    { fontSize: 11, color: PANEL_TXT, flex:1 },

  propBlock: { paddingHorizontal: 12, paddingVertical: 6 },
  propRow:   { flexDirection: 'row', paddingVertical: 3, gap: 8 },
  propK:     { fontSize: 10, color: PANEL_MUT, width: 32, flexShrink: 0 },
  propV:     { fontSize: 10, color: PANEL_TXT, flex:1 },

  // ── Stats bar ───────────────────────────────────────────────────────────────
  statsBar: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#070c13',
    borderTopWidth: 1, borderTopColor: '#0f1923',
  },
  statCol: { flex:1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDiv: { width:1, height:18, backgroundColor: '#1a2535', marginHorizontal: 4 },
  statVal: { fontSize: 11, fontWeight: '600', color: '#5a8ab0' },
  statLbl: { fontSize: 9, color: '#283848' },
});
