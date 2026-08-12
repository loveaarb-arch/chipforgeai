/**
 * Chip3DView — Real 3D PCB renderer using Three.js in a WebView.
 *
 * Renders the ChipDesign as a proper 3D scene with:
 *   - Green PCB board with lambert shading
 *   - IC packages with coloured top faces and gold pin rows
 *   - Discrete components (LED dome, capacitor cylinder, etc.)
 *   - Gold copper trace tubes connecting nets
 *   - Directional + ambient lighting with shadows
 *   - Touch-to-orbit and pinch-to-zoom
 *   - Slow auto-rotation when idle
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ChipDesign } from '@workspace/api-client-react';

// ─── Component type → hex color (matches BuildWorkspace palette) ──────────────

const TYPE_COLOR: Record<string, number> = {
  logic_gate:  0x2d8fa8,
  flip_flop:   0xa07820,
  multiplexer: 0x7040a8,
  alu:         0xb03030,
  register:    0x1d8040,
  memory:      0x5040a0,
  clock:       0x2060a8,
  io_port:     0x1878a0,
  led:         0xc0392b,
  resistor:    0x9a7840,
  capacitor:   0x1e50a8,
  header_pin:  0xb08000,
  transistor:  0x505050,
  diode:       0x282828,
};

const DISCRETE_TYPES = new Set([
  'led', 'resistor', 'capacitor', 'header_pin', 'transistor', 'diode',
]);

// ─── Build the full HTML page as a string ────────────────────────────────────

function buildHtml(design: ChipDesign): string {
  // Compute board dimensions from component bounding box
  const comps = design.components;
  const PAD = 60;
  let boardW = 300, boardD = 200;
  if (comps.length > 0) {
    boardW = Math.max(...comps.map(c => c.x + c.width))  + PAD;
    boardD = Math.max(...comps.map(c => c.y + c.height)) + PAD;
  }

  // Serialise type-color map to JS object literal
  const colorMapJs = Object.entries(TYPE_COLOR)
    .map(([k, v]) => `"${k}":${v}`)
    .join(',');

  const discreteJs = [...DISCRETE_TYPES].map(t => `"${t}"`).join(',');

  const designJson = JSON.stringify({
    components: design.components,
    connections: design.connections,
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#060a12;overflow:hidden;width:100vw;height:100vh;touch-action:none;}
  canvas{display:block;}
  #hint{
    position:fixed;bottom:14px;width:100%;text-align:center;
    font-family:-apple-system,sans-serif;font-size:11px;color:#2a4a6a;
    pointer-events:none;letter-spacing:0.4px;
  }
</style>
</head>
<body>
<div id="hint">Drag to rotate · Pinch to zoom</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
<script>
(function(){
  const DESIGN   = ${designJson};
  const TYPE_CLR = {${colorMapJs}};
  const DISCRETE = new Set([${discreteJs}]);
  const BW = ${boardW}, BD = ${boardD};

  // ── Renderer ───────────────────────────────────────────────────────────────
  const W = window.innerWidth, H = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a12);
  scene.fog = new THREE.Fog(0x060a12, 800, 1400);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const diagLen = Math.sqrt(BW*BW + BD*BD);
  const camDist = diagLen * 1.1;
  const camera = new THREE.PerspectiveCamera(42, W/H, 1, 2000);
  camera.position.set(0, camDist * 0.7, camDist * 0.85);
  camera.lookAt(0, 0, 0);

  // ── Pivot group (everything rotates around this) ───────────────────────────
  const pivot = new THREE.Group();
  scene.add(pivot);
  pivot.rotation.x = 0.38;
  pivot.rotation.y = 0.45;

  // ── PCB Board ──────────────────────────────────────────────────────────────
  const boardH = 5;
  const boardTopMat  = new THREE.MeshLambertMaterial({ color: 0x1a5c2a });
  const boardSideMat = new THREE.MeshLambertMaterial({ color: 0x0d3318 });
  const boardGeo     = new THREE.BoxGeometry(BW, boardH, BD);
  const board = new THREE.Mesh(boardGeo, [
    boardSideMat, boardSideMat, boardTopMat, boardSideMat, boardSideMat, boardSideMat,
  ]);
  board.position.y = -boardH / 2;
  board.receiveShadow = true;
  pivot.add(board);

  // Board silk-screen border (thin plane slightly above board)
  const borderPad = 12;
  const blineGeo = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(BW - borderPad*2, 0.1, BD - borderPad*2)
  );
  const blineMat = new THREE.LineBasicMaterial({ color: 0x2a7a3a, linewidth: 1 });
  const bline = new THREE.LineSegments(blineGeo, blineMat);
  bline.position.y = 0.1;
  pivot.add(bline);

  // ── Components ─────────────────────────────────────────────────────────────
  const comps = DESIGN.components || [];
  for (const c of comps) {
    const cx = c.x + c.width/2  - BW/2;
    const cz = c.y + c.height/2 - BD/2;
    const cw = c.width;
    const cd = c.height;
    const clr = TYPE_CLR[c.type] ?? 0x1a1a2e;

    if (DISCRETE.has(c.type)) {
      // ── Discrete: smaller coloured box
      const h = 9;
      const mat = new THREE.MeshLambertMaterial({ color: clr });
      const geo = new THREE.BoxGeometry(cw * 0.75, h, cd * 0.75);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, h/2, cz);
      mesh.castShadow = true;
      pivot.add(mesh);

      // LED: little dome on top
      if (c.type === 'led') {
        const domeGeo = new THREE.SphereGeometry(Math.min(cw,cd)*0.25, 8, 6, 0, Math.PI*2, 0, Math.PI/2);
        const domeMat = new THREE.MeshLambertMaterial({ color: clr, emissive: clr, emissiveIntensity: 0.4 });
        const dome = new THREE.Mesh(domeGeo, domeMat);
        dome.position.set(cx, h, cz);
        pivot.add(dome);
      }
      // Capacitor: cylinder body
      if (c.type === 'capacitor') {
        const capGeo = new THREE.CylinderGeometry(Math.min(cw,cd)*0.3, Math.min(cw,cd)*0.3, h, 10);
        const capMat = new THREE.MeshLambertMaterial({ color: clr });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(cx, h/2, cz);
        cap.castShadow = true;
        pivot.add(cap);
      }
    } else {
      // ── IC Package: dark body + coloured top face + gold pins
      const h = 13;
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x12121e });
      const topMat  = new THREE.MeshLambertMaterial({ color: clr });
      const geo = new THREE.BoxGeometry(cw * 0.82, h, cd * 0.82);
      const mesh = new THREE.Mesh(geo, [
        bodyMat, bodyMat, topMat, bodyMat, bodyMat, bodyMat,
      ]);
      mesh.position.set(cx, h/2, cz);
      mesh.castShadow = true;
      pivot.add(mesh);

      // Gold pin rows on two sides
      const pinRowW = cw * 0.82;
      const pinH = 1.5;
      const pinD = 3.5;
      const pinGeo = new THREE.BoxGeometry(pinRowW, pinH, pinD);
      const pinMat = new THREE.MeshLambertMaterial({ color: 0xc0a030 });
      const pinOffset = cd * 0.41 + pinD/2;
      [-1, 1].forEach(side => {
        const pins = new THREE.Mesh(pinGeo, pinMat);
        pins.position.set(cx, pinH/2, cz + side * pinOffset);
        pivot.add(pins);
      });

      // Dot marker (notch indicator) on top
      const dotGeo = new THREE.CircleGeometry(Math.min(cw,cd)*0.07, 8);
      const dotMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.FrontSide });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI/2;
      dot.position.set(cx - cw*0.3, h + 0.2, cz - cd*0.3);
      pivot.add(dot);
    }
  }

  // ── Copper traces ──────────────────────────────────────────────────────────
  const byId = {};
  for (const c of comps) byId[c.id] = c;
  const conns = DESIGN.connections || [];
  for (const conn of conns) {
    const from = byId[conn.fromComponentId];
    const to   = byId[conn.toComponentId];
    if (!from || !to) continue;
    const x1 = from.x + from.width  - BW/2;
    const z1 = from.y + from.height/2 - BD/2;
    const x2 = to.x - BW/2;
    const z2 = to.y + to.height/2 - BD/2;
    const midX = (x1+x2)/2, midZ = (z1+z2)/2;
    const pts = [
      new THREE.Vector3(x1, 0.4, z1),
      new THREE.Vector3(x1 + (midX-x1)*0.4, 0.4, z1),
      new THREE.Vector3(midX, 0.4, midZ),
      new THREE.Vector3(x2 - (x2-midX)*0.4, 0.4, z2),
      new THREE.Vector3(x2, 0.4, z2),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 10, 1.6, 5, false);
    const tubeMat = new THREE.MeshLambertMaterial({ color: 0xb08820 });
    pivot.add(new THREE.Mesh(tubeGeo, tubeMat));
  }

  // ── Lighting ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(300, 500, 250);
  sun.castShadow = true;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 1500;
  const sw = Math.max(BW, BD) * 0.8;
  sun.shadow.camera.left   = -sw;
  sun.shadow.camera.right  =  sw;
  sun.shadow.camera.top    =  sw;
  sun.shadow.camera.bottom = -sw;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x4466cc, 0.25);
  fill.position.set(-200, 150, -250);
  scene.add(fill);

  // ── Touch orbit + pinch-zoom ───────────────────────────────────────────────
  let dragging = false, px = 0, py = 0, pd = 0;
  let autoRot  = true;
  const el = renderer.domElement;

  el.addEventListener('touchstart', e => {
    e.preventDefault();
    autoRot = false;
    if (e.touches.length === 1) {
      dragging = true;
      px = e.touches[0].clientX;
      py = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      pd = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: false });

  el.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - px;
      const dy = e.touches[0].clientY - py;
      pivot.rotation.y += dx * 0.007;
      pivot.rotation.x += dy * 0.007;
      pivot.rotation.x = Math.max(-1.3, Math.min(1.5, pivot.rotation.x));
      px = e.touches[0].clientX;
      py = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (pd > 0) {
        const factor = pd / d;
        camera.position.multiplyScalar(factor);
        camera.position.y = Math.max(30, Math.min(700, camera.position.y));
        camera.position.z = Math.max(30, Math.min(700, camera.position.z));
      }
      pd = d;
    }
  }, { passive: false });

  el.addEventListener('touchend', e => {
    if (e.touches.length === 0) dragging = false;
    if (e.touches.length < 2) pd = 0;
  });

  // ── Render loop ────────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    if (autoRot) pivot.rotation.y += 0.0035;
    renderer.render(scene, camera);
  }
  animate();
})();
</script>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Chip3DView({ design }: { design: ChipDesign }) {
  const html = useMemo(() => buildHtml(design), [design]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>3D View</Text>
        <Text style={styles.sub}>
          {design.components.length} components · {design.connections.length} nets
        </Text>
      </View>
      <WebView
        style={styles.webview}
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // Allow loading Three.js from cdnjs CDN
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060a12',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0a1020',
    borderBottomWidth: 1,
    borderBottomColor: '#1a2a3a',
  },
  title: {
    color: '#c0d8f0',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  sub: {
    color: '#3a5a7a',
    fontSize: 11,
  },
  webview: {
    flex: 1,
    backgroundColor: '#060a12',
  },
});
