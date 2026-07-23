/**
 * BuildWorkspace — pixel-matched to KiCad's Visibles panel layout.
 *
 * Left:  pure black grid canvas
 * Right: white EDA panel — "Visibles" header, raised Windows-style Layer/Render tabs,
 *        compact layer rows (sharp swatches + square checkboxes), KiCad status bar.
 */

import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DesignCanvasView } from '@/components/DesignCanvasView';
import type { ChipComponent, ChipDesign } from '@workspace/api-client-react';

// ─── Type accent colours ──────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  logic_gate:  '#818cf8',
  flip_flop:   '#22d3ee',
  multiplexer: '#fb923c',
  alu:         '#f59e0b',
  register:    '#34d399',
  memory:      '#a78bfa',
  clock:       '#fb7185',
  io_port:     '#38bdf8',
};

// ─── Analysis helpers ─────────────────────────────────────────────────────────

function runDRC(design: ChipDesign): string {
  const issues: string[] = [];
  const conn = new Set([
    ...design.connections.map((c) => c.fromComponentId),
    ...design.connections.map((c) => c.toComponentId),
  ]);
  for (const c of design.components)
    if (!conn.has(c.id)) issues.push(`⚠ "${c.label}" — floating`);
  for (const c of design.components)
    if (['flip_flop','register','memory'].includes(c.type) &&
        !design.connections.some((cn) => cn.toComponentId === c.id))
      issues.push(`⚠ "${c.label}" — no inputs`);
  if (design.components.length > 0 && !design.components.some((c) => c.type === 'io_port'))
    issues.push('⚠ No I/O port');
  return issues.length === 0
    ? '✓ DRC passed — no violations.'
    : issues.join('\n\n');
}

function runERC(design: ChipDesign): string {
  const issues: string[] = [];
  const byId = new Map(design.components.map((c) => [c.id, c]));
  const fo = new Map<string,number>();
  for (const c of design.connections) fo.set(c.fromComponentId,(fo.get(c.fromComponentId)??0)+1);
  fo.forEach((n,id)=>{ if(n>4){ const b=byId.get(id); if(b) issues.push(`⚠ "${b.label}" — high fan-out (${n})`); } });
  const fw = new Map<string,Set<string>>();
  for (const c of design.connections){
    if(!fw.has(c.fromComponentId)) fw.set(c.fromComponentId,new Set());
    fw.get(c.fromComponentId)!.add(c.toComponentId);
  }
  for(const [f,ts] of fw) for(const t of ts)
    if(fw.get(t)?.has(f)) issues.push(`⚠ Loop: "${byId.get(f)?.label}" ↔ "${byId.get(t)?.label}"`);
  if(design.components.length>1 && design.connections.length===0) issues.push('⚠ No wires');
  return issues.length===0 ? '✓ ERC passed — no violations.' : issues.join('\n\n');
}

function autoRoute(design: ChipDesign): ChipDesign {
  if(!design.components.length) return design;
  const inDeg=new Map(design.components.map(c=>[c.id,0]));
  const out=new Map(design.components.map(c=>[c.id,[] as string[]]));
  for(const c of design.connections){
    inDeg.set(c.toComponentId,(inDeg.get(c.toComponentId)??0)+1);
    out.get(c.fromComponentId)?.push(c.toComponentId);
  }
  const layers:string[][]=[], visited=new Set<string>();
  let q=[...inDeg.entries()].filter(([,d])=>d===0).map(([id])=>id);
  while(q.length){ layers.push(q); q.forEach(id=>visited.add(id)); const nxt:string[]=[];
    for(const id of q) for(const nb of out.get(id)??[]){ const nd=(inDeg.get(nb)??1)-1; inDeg.set(nb,nd); if(nd===0&&!visited.has(nb)) nxt.push(nb); } q=nxt; }
  const uv=design.components.map(c=>c.id).filter(id=>!visited.has(id));
  if(uv.length) layers.push(uv);
  const byId=new Map(design.components.map(c=>[c.id,c]));
  const pos=new Map<string,{x:number,y:number}>();
  let x=60;
  for(const layer of layers){
    const lw=Math.max(...layer.map(id=>byId.get(id)?.width??140));
    let y=60; for(const id of layer){ pos.set(id,{x,y}); y+=(byId.get(id)?.height??80)+36; }
    x+=lw+140;
  }
  return{...design,components:design.components.map(c=>{const p=pos.get(c.id);return p?{...c,...p}:c;})};
}

// ─── Layer definitions ────────────────────────────────────────────────────────

interface LayerDef { id: string; name: string; color: string; visible: boolean }
const LAYERS_DEFAULT: LayerDef[] = [
  { id:'composant', name:'Composant',  color:'#e05050', visible:true  },
  { id:'gnd',       name:'GND_layer',  color:'#505050', visible:true  },
  { id:'v33',       name:'3.3V_layer', color:'#2060d0', visible:true  },
  { id:'cuivre',    name:'Cuivre',     color:'#30b030', visible:true  },
  { id:'adhf',      name:'Adhes_Front',color:'#a050a0', visible:true  },
  { id:'adhb',      name:'Adhes_Back', color:'#804080', visible:false },
  { id:'soldf',     name:'SoldP_Front',color:'#e06020', visible:true  },
  { id:'soldb',     name:'SoldP_Back', color:'#c04010', visible:false },
  { id:'silkf',     name:'SilkS_Front',color:'#f0f0f0', visible:true  },
  { id:'silkb',     name:'SilkS_Back', color:'#c0c0c0', visible:false },
  { id:'maskf',     name:'Mask_Front', color:'#d04040', visible:true  },
  { id:'maskb',     name:'Mask_Back',  color:'#a02020', visible:false },
  { id:'draw',      name:'Drawings',   color:'#c0c000', visible:true  },
  { id:'cmt',       name:'Comments',   color:'#0060a0', visible:true  },
  { id:'eco1',      name:'Eco1',       color:'#408050', visible:false },
  { id:'eco2',      name:'Eco2',       color:'#306040', visible:false },
  { id:'pcbedge',   name:'PCB_Edges',  color:'#e0c000', visible:true  },
];

// ─── Component palette ────────────────────────────────────────────────────────

interface CompDef { type:ChipComponent['type']; label:string; symbol:string; w:number; h:number; bits:number|null }
const COMP_DEFS: CompDef[] = [
  { type:'logic_gate',  label:'AND',  symbol:'&',   w:80,  h:56, bits:1    },
  { type:'logic_gate',  label:'OR',   symbol:'≥1',  w:80,  h:56, bits:1    },
  { type:'logic_gate',  label:'XOR',  symbol:'=1',  w:80,  h:56, bits:1    },
  { type:'logic_gate',  label:'NOT',  symbol:'1̄',  w:64,  h:48, bits:1    },
  { type:'logic_gate',  label:'NAND', symbol:'&̄',  w:80,  h:56, bits:1    },
  { type:'logic_gate',  label:'NOR',  symbol:'≥̄',  w:80,  h:56, bits:1    },
  { type:'flip_flop',   label:'FF',   symbol:'D▷',  w:96,  h:72, bits:1    },
  { type:'multiplexer', label:'MUX',  symbol:'MUX', w:96,  h:80, bits:1    },
  { type:'alu',         label:'DEC',  symbol:'DEC', w:96,  h:80, bits:1    },
  { type:'register',    label:'REG',  symbol:'REG', w:112, h:72, bits:8    },
  { type:'memory',      label:'RAM',  symbol:'RAM', w:128, h:80, bits:8    },
  { type:'clock',       label:'CLK',  symbol:'⏱',  w:72,  h:56, bits:null },
  { type:'io_port',     label:'IN',   symbol:'▶I',  w:64,  h:48, bits:1    },
  { type:'io_port',     label:'OUT',  symbol:'O▶',  w:64,  h:48, bits:1    },
  { type:'io_port',     label:'VDD',  symbol:'VDD', w:48,  h:48, bits:null },
  { type:'io_port',     label:'GND',  symbol:'GND', w:48,  h:48, bits:null },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  design: ChipDesign; onChange: (d: ChipDesign) => void; saving?: boolean;
  onValidate?: () => void; onAiAssist?: () => void;
  grid: boolean; snap: boolean; onGridChange:(v:boolean)=>void; onSnapChange:(v:boolean)=>void;
}

// ─── BuildWorkspace ───────────────────────────────────────────────────────────

export function BuildWorkspace({ design, onChange, saving, onValidate, onAiAssist, grid, snap, onGridChange, onSnapChange }: Props) {
  const [layers, setLayers]     = useState<LayerDef[]>(LAYERS_DEFAULT);
  const [activeLayer, setActive]= useState('cuivre');
  const [tab, setTab]           = useState<'layer'|'render'>('layer');
  const [scale, setScale]       = useState(1);
  const [selectedId, setId]     = useState<string|null>(null);

  const sel = design.components.find(c=>c.id===selectedId)??null;

  function place(def: CompDef) {
    const id = `comp_${Date.now().toString(36)}`;
    onChange({...design, components:[...design.components,{
      id, type:def.type, label:def.label,
      x:60+(design.components.length%5)*18,
      y:60+(design.components.length%7)*14,
      width:def.w, height:def.h, bitWidth:def.bits??null, properties:{},
    }]});
    setId(id);
  }

  const blks=design.components.length, wires=design.connections.length;
  const nets=new Set(design.connections.map(c=>c.fromComponentId+c.toComponentId)).size;

  return (
    <View style={s.root}>

      {/* ══════════════ LEFT — black canvas ══════════════ */}
      <View style={s.canvasCol}>

        {/* Slim toolbar above canvas */}
        <View style={s.cBar}>
          <Pressable style={s.zBtn} onPress={()=>setScale(v=>Math.max(0.25,+((v-0.15).toFixed(2))))}>
            <Text style={s.zBtnTxt}>−</Text>
          </Pressable>
          <Text style={s.zLabel}>{Math.round(scale*100)}%</Text>
          <Pressable style={s.zBtn} onPress={()=>setScale(v=>Math.min(3,+((v+0.15).toFixed(2))))}>
            <Text style={s.zBtnTxt}>+</Text>
          </Pressable>
          <View style={s.cBarDiv}/>
          <Pressable onPress={()=>onGridChange(!grid)} style={s.toggle}>
            <View style={[s.togglePip, grid&&s.togglePipOn]}/>
            <Text style={s.toggleTxt}>Grid</Text>
          </Pressable>
          <Pressable onPress={()=>onSnapChange(!snap)} style={s.toggle}>
            <View style={[s.togglePip, snap&&s.togglePipOn]}/>
            <Text style={s.toggleTxt}>Snap</Text>
          </Pressable>
          {saving && <View style={s.savingDot}/>}
        </View>

        {/* Canvas */}
        <View style={{flex:1}}>
          <DesignCanvasView
            design={design} onChange={onChange}
            grid={grid} snap={snap}
            darkCanvas hideToolbar
            externalScale={scale}
            onSelectComponent={setId}
          />
        </View>

        {/* KiCad-style status bar */}
        <View style={s.statusBar}>
          <Stat label="Blks"  val={blks}  />
          <Stat label="Wires" val={wires} />
          <Stat label="Nets"  val={nets}  red />
          <Stat label="Uncon" val={Math.max(0,blks-wires)} />
          <View style={{flex:1}}/>
          {sel&&<Text style={s.coords} numberOfLines={1}>
            {sel.label}  X {Math.round(sel.x)}  Y {Math.round(sel.y)}
          </Text>}
        </View>
      </View>

      {/* ══════════════ RIGHT — Visibles panel ══════════════ */}
      <View style={s.panel}>

        {/* "Visibles" title bar */}
        <View style={s.visTitle}>
          <Text style={s.visTitleTxt}>Visibles</Text>
        </View>

        {/* Windows-style raised tabs ─────────────────────────────────────
            Technique: tabStrip has borderBottom=1 (#808080).
            Active tab has marginBottom=-1 and white bg so it visually
            "lifts" through the strip border, merging with the list below. */}
        <View style={s.tabStrip}>
          {(['layer','render'] as const).map(t=>(
            <Pressable key={t} onPress={()=>setTab(t)}
              style={[s.tabBtn, tab===t && s.tabBtnActive]}>
              <Text style={[s.tabTxt, tab===t && s.tabTxtActive]}>
                {t==='layer'?'Layer':'Render'}
              </Text>
            </Pressable>
          ))}
          {/* filler that completes the bottom border */}
          <View style={s.tabFill}/>
        </View>

        {/* Panel body */}
        <ScrollView style={s.panelBody} showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── LAYER tab ─────────────────────────────────────────────── */}
          {tab==='layer' && layers.map((l,i)=>(
            <Pressable key={l.id}
              style={[s.row, l.id===activeLayer&&s.rowActive, i===0&&{borderTopWidth:0}]}
              onPress={()=>setActive(l.id)}>

              {/* Sharp coloured swatch — NO border radius */}
              <View style={[s.swatch,{backgroundColor:l.color}]}/>

              <Text style={[s.layerName, !l.visible&&s.layerNameOff]} numberOfLines={1}>
                {l.name}
              </Text>

              {/* Square Windows-style checkbox */}
              <Pressable hitSlop={8} onPress={()=>setLayers(ls=>ls.map(x=>x.id===l.id?{...x,visible:!x.visible}:x))}>
                <View style={[s.chk, l.visible&&s.chkOn]}>
                  {l.visible && <Text style={s.chkMark}>✓</Text>}
                </View>
              </Pressable>
            </Pressable>
          ))}

          {/* ── RENDER tab — Parts + Tools ────────────────────────────── */}
          {tab==='render' && (
            <>
              {/* PARTS */}
              <View style={s.rSecHeader}><Text style={s.rSecTxt}>PARTS</Text></View>
              <View style={s.compGrid}>
                {COMP_DEFS.map((def,i)=>{
                  const col=TYPE_COLOR[def.type]??'#6b7280';
                  return(
                    <Pressable key={i} style={s.compTile} onPress={()=>place(def)}>
                      <View style={[s.compBox,{borderColor:col+'80',backgroundColor:col+'18'}]}>
                        <Text style={[s.compSym,{color:col}]}>{def.symbol}</Text>
                      </View>
                      <Text style={s.compLbl} numberOfLines={1}>{def.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* TOOLS */}
              <View style={s.rSecHeader}><Text style={s.rSecTxt}>TOOLS</Text></View>
              {([
                {icon:'check-circle' as const, lbl:'DRC',        cb:()=>Alert.alert('DRC',runDRC(design))},
                {icon:'zap'          as const, lbl:'ERC',        cb:()=>Alert.alert('ERC',runERC(design))},
                {icon:'share-2'      as const, lbl:'Auto Route', cb:()=>onChange(autoRoute(design))},
                {icon:'cpu'          as const, lbl:'AI Assist',  cb:onAiAssist, accent:true},
                {icon:'shield'       as const, lbl:'Validate',   cb:onValidate, accent:true},
              ] as {icon:React.ComponentProps<typeof Feather>['name'];lbl:string;cb?:()=>void;accent?:boolean}[])
              .map(btn=>(
                <Pressable key={btn.lbl}
                  style={({pressed})=>[s.toolBtn, btn.accent&&s.toolBtnAcc, pressed&&{opacity:.7}]}
                  onPress={btn.cb}>
                  <Feather name={btn.icon} size={10} color={btn.accent?'#fff':'#1a1a1a'}/>
                  <Text style={[s.toolTxt, btn.accent&&s.toolTxtAcc]}>{btn.lbl}</Text>
                </Pressable>
              ))}

              {/* PROPERTIES — shows when a component is selected */}
              {sel&&(<>
                <View style={s.rSecHeader}><Text style={s.rSecTxt}>PROPERTIES</Text></View>
                <View style={s.propBlock}>
                  {[
                    ['Type',  sel.type.replace('_',' ')],
                    ['Label', sel.label],
                    ['X',     String(Math.round(sel.x))],
                    ['Y',     String(Math.round(sel.y))],
                    ['W',     String(sel.width)],
                    ['H',     String(sel.height)],
                    ...(sel.bitWidth!=null?[['Bits',String(sel.bitWidth)]]:[] as string[][]),
                  ].map(([k,v])=>(
                    <View key={k} style={s.propRow}>
                      <Text style={s.propK}>{k}</Text>
                      <Text style={s.propV} numberOfLines={1}>{v}</Text>
                    </View>
                  ))}
                </View>
              </>)}
            </>
          )}

          <View style={{height:20}}/>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Stat({label,val,red}:{label:string;val:number;red?:boolean}){
  return(
    <View style={s.stat}>
      <Text style={s.statLbl}>{label}</Text>
      <Text style={[s.statVal, red&&s.statRed]}>{val}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PW   = 160;   // panel width
const P_WHITE = '#ffffff';
const P_BGROW = '#f8f8f8';  // row bg
const P_ACTIVE= '#cce4ff';  // selected row (like KiCad blue highlight)
const P_BD    = '#a0a0a0';  // panel border colour
const P_DARK  = '#1a1a1a';
const P_MUTED = '#666666';

// Tab strip colours — classic Windows look
const TAB_STRIP_BG = '#d4d0c8'; // Win95/KiCad gray
const TAB_ACTIVE   = P_WHITE;
const TAB_INACTIVE = '#c0bdb5';

const s = StyleSheet.create({
  root: { flex:1, flexDirection:'row', backgroundColor:'#000' },

  // ── Canvas ─────────────────────────────────────────────────────────────────
  canvasCol: { flex:1, flexDirection:'column' },

  cBar: {
    height:26, flexDirection:'row', alignItems:'center', gap:5,
    paddingHorizontal:8,
    backgroundColor:'#0d1117',
    borderBottomWidth:1, borderBottomColor:'#1e2a38',
  },
  zBtn:      { width:18, height:18, alignItems:'center', justifyContent:'center',
               backgroundColor:'#1a2535', borderRadius:3 },
  zBtnTxt:   { fontSize:13, color:'#7a9aba', lineHeight:16 },
  zLabel:    { fontSize:10, color:'#4a6a8a', minWidth:30, textAlign:'center' },
  cBarDiv:   { width:1, height:14, backgroundColor:'#1e2a38', marginHorizontal:2 },
  toggle:    { flexDirection:'row', alignItems:'center', gap:3 },
  togglePip: { width:7, height:7, borderRadius:4, backgroundColor:'#1e2a38' },
  togglePipOn:{ backgroundColor:'#3b82f6' },
  toggleTxt: { fontSize:9, color:'#3d5a78' },
  savingDot: { width:5, height:5, borderRadius:3, backgroundColor:'#3b82f6', marginLeft:'auto' },

  statusBar: {
    height:20, flexDirection:'row', alignItems:'center', gap:10,
    paddingHorizontal:8,
    backgroundColor:'#070c13',
    borderTopWidth:1, borderTopColor:'#0f1923',
  },
  stat:     { flexDirection:'row', alignItems:'center', gap:3 },
  statLbl:  { fontSize:9, color:'#283848' },
  statVal:  { fontSize:9, color:'#3d6080' },
  statRed:  { color:'#a03030' },
  coords:   { fontSize:9, color:'#283848', flexShrink:1 },

  // ── Right panel ────────────────────────────────────────────────────────────
  panel: {
    width:PW,
    backgroundColor:P_WHITE,
    borderLeftWidth:1, borderLeftColor:P_BD,
    flexDirection:'column',
  },

  // "Visibles" title bar — matches KiCad's white header above the tabs
  visTitle: {
    height:22,
    justifyContent:'center',
    paddingHorizontal:6,
    backgroundColor:P_WHITE,
    borderBottomWidth:1, borderBottomColor:P_BD,
  },
  visTitleTxt: { fontSize:11, fontWeight:'700', color:P_DARK },

  // Windows notebook tab strip
  // The strip itself has borderBottomWidth:1 in P_BD.
  // Active tab: marginBottom:-1 + white bg → visually "cuts" through that border.
  tabStrip: {
    flexDirection:'row',
    backgroundColor:TAB_STRIP_BG,
    borderBottomWidth:1, borderBottomColor:P_BD,
    paddingTop:3, paddingLeft:3, gap:2,
  },
  tabBtn: {
    paddingHorizontal:10, paddingVertical:3,
    backgroundColor:TAB_INACTIVE,
    borderTopWidth:1, borderLeftWidth:1, borderRightWidth:1,
    borderColor:P_BD,
    borderTopLeftRadius:2, borderTopRightRadius:2,
    marginBottom:0,
  },
  tabBtnActive: {
    backgroundColor:TAB_ACTIVE,
    marginBottom:-1,          // lifts through strip bottom border
    paddingBottom:4,
    zIndex:2,
  },
  tabTxt:      { fontSize:10, color:P_MUTED },
  tabTxtActive:{ color:P_DARK, fontWeight:'600' },
  tabFill:     { flex:1 },   // fills remaining strip width with gray

  // Scrollable body
  panelBody: { flex:1, backgroundColor:P_WHITE },

  // ── Layer rows — ultra-compact, sharp corners everywhere ───────────────────
  row: {
    flexDirection:'row', alignItems:'center',
    height:20,                              // fixed 20 px rows like KiCad
    paddingHorizontal:5, gap:5,
    backgroundColor:P_BGROW,
    borderTopWidth:StyleSheet.hairlineWidth, borderTopColor:'#e0e0e0',
  },
  rowActive: { backgroundColor:P_ACTIVE },

  // Sharp-cornered coloured swatch (NO borderRadius — KiCad uses square)
  swatch: { width:13, height:13, borderRadius:0, flexShrink:0 },

  layerName:    { flex:1, fontSize:10, color:P_DARK },
  layerNameOff: { color:'#b0b0b0' },

  // Square Windows-style checkbox (NO borderRadius)
  chk: {
    width:13, height:13, borderRadius:0,
    borderWidth:1, borderColor:'#808080',
    backgroundColor:'#fff',
    alignItems:'center', justifyContent:'center',
    flexShrink:0,
  },
  chkOn:   { backgroundColor:'#f8f8f8' },
  chkMark: { fontSize:9, color:'#1a1a1a', lineHeight:12, marginTop:-1 },

  // ── Render tab ─────────────────────────────────────────────────────────────
  rSecHeader: {
    height:18, justifyContent:'center',
    paddingHorizontal:6,
    backgroundColor:'#e8e8e8',
    borderTopWidth:1, borderBottomWidth:1, borderColor:'#d0d0d0',
  },
  rSecTxt: { fontSize:9, fontWeight:'700', color:P_MUTED, letterSpacing:0.7 },

  compGrid: { flexDirection:'row', flexWrap:'wrap', padding:5, gap:4 },
  compTile: { width:68, alignItems:'center', gap:2, paddingVertical:2 },
  compBox:  { width:52, height:32, borderRadius:4, borderWidth:1,
              alignItems:'center', justifyContent:'center' },
  compSym:  { fontSize:11, fontWeight:'700' },
  compLbl:  { fontSize:8, color:'#374151', textAlign:'center' },

  toolBtn: {
    flexDirection:'row', alignItems:'center', gap:5,
    marginHorizontal:6, marginVertical:2,
    paddingHorizontal:7, paddingVertical:5,
    borderRadius:3, borderWidth:1, borderColor:'#d1d5db',
    backgroundColor:'#f5f5f5',
  },
  toolBtnAcc:  { backgroundColor:'#2563eb', borderColor:'#1d4ed8' },
  toolTxt:     { fontSize:10, color:P_DARK, flex:1 },
  toolTxtAcc:  { color:'#fff' },

  propBlock: { paddingHorizontal:8, paddingVertical:4 },
  propRow:   { flexDirection:'row', paddingVertical:2, gap:4 },
  propK:     { fontSize:9, color:P_MUTED, width:30, flexShrink:0 },
  propV:     { fontSize:9, color:P_DARK, flex:1 },
});
