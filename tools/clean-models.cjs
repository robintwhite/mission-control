/* Clean the Meshy hero pieces for the page (art pass 3).
 *
 *   node tools/clean-models.cjs            # assets/meshy-raw/*.glb -> assets/models/*.glb
 *
 * Each raw GLB is what Meshy exported after its free Remesh step (about 2,600 to 3,000 triangles, untextured).
 * This script: drops normals and UVs (the page flat-shades, so it needs neither), welds and dedups, simplifies to
 * about TARGET triangles with meshoptimizer, centres the piece on x/z with its base at y = 0, scales it so the wider
 * of its footprint sides is 1 (the page sets the real size per piece), and quantizes positions to int16.
 * The result is a small, indexed, position-only GLB. build.py inlines them into the page as base64.
 * A raw file named <name>-30k.glb (a denser Meshy remesh of the same piece) is preferred over <name>.glb: simplifying
 * from 30K keeps edges that Meshy's own 3K remesh rounds off. */
const fs = require("fs"), path = require("path");
const { NodeIO, getBounds } = require("@gltf-transform/core");
const { KHRMeshQuantization } = require("@gltf-transform/extensions");
const { dedup, weld, simplify, quantize, prune } = require("@gltf-transform/functions");
const { MeshoptSimplifier } = require("meshoptimizer");

const ROOT = path.resolve(__dirname, ".."), RAW = path.join(ROOT, "assets", "meshy-raw"), OUT = path.join(ROOT, "assets", "models");
const TARGET = 2000;  // landmarks: about 2,000 triangles each
// the small repeated pieces get fewer: 10 hover cars and 5 train cars at 2,000 each would cost 30K triangles in a big city
const TARGETS = { train: 900, hovercar: 600 };
// yaw (quarter turns about y) applied to a piece so its long axis runs along x where the page needs it
const YAW = {};

async function main() {
  const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
  await MeshoptSimplifier.ready;
  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  const sources = {};
  for (const f of fs.readdirSync(RAW).filter(n => n.endsWith(".glb")).sort()) {
    const name = f.replace(/(-\d+k|-planar)?\.glb$/, "");
    if (!sources[name] || /-(\d+k|planar)\.glb$/.test(f)) sources[name] = f;
  }
  for (const name of Object.keys(sources).sort()) {
    const f = sources[name];
    const doc = await io.read(path.join(RAW, f));
    const root = doc.getRoot();
    const before = triCount(root);
    // one mesh, position only
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      for (const sem of prim.listSemantics()) if (sem !== "POSITION") prim.setAttribute(sem, null);
      prim.setMaterial(null);
    }
    for (const m of root.listMaterials()) m.dispose();
    for (const t of root.listTextures()) t.dispose();
    // bake the node transforms into the vertices (Meshy exports Z-up data under a rotated node)
    for (const node of root.listNodes()) {
      const mesh = node.getMesh(); if (!mesh) continue;
      const M = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const acc = prim.getAttribute("POSITION"), a = acc.getArray(), out = new Float32Array(a.length);
        for (let i = 0; i < a.length; i += 3) {
          const x = a[i], y = a[i + 1], z = a[i + 2];
          out[i] = M[0] * x + M[4] * y + M[8] * z + M[12];
          out[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
          out[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
        }
        acc.setArray(out);
      }
      node.setTranslation([0, 0, 0]); node.setRotation([0, 0, 0, 1]); node.setScale([1, 1, 1]);
    }
    await doc.transform(dedup(), weld());
    const target = TARGETS[name] || TARGET, ratio = Math.min(1, target / before);
    if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: ratio < 0.2 ? (+process.env.ERR || 0.02) : 0.01, lockBorder: false }));
    // centre on x/z, base at y = 0, wider footprint side = 1. Baked into the vertex data, so the page needs no transform
    const scene = root.listScenes()[0], b = getBounds(scene);
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y0 = b.min[1];
    const s = 1 / Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
    const q = YAW[name] || 0, ca = Math.cos(q * Math.PI / 2), sa = Math.sin(q * Math.PI / 2);
    for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
      const acc = prim.getAttribute("POSITION"), a = acc.getArray(), out = new Float32Array(a.length);
      for (let i = 0; i < a.length; i += 3) {
        const x = (a[i] - cx) * s, y = (a[i + 1] - y0) * s, z = (a[i + 2] - cz) * s;
        out[i] = x * ca + z * sa; out[i + 1] = y; out[i + 2] = -x * sa + z * ca;
      }
      acc.setArray(out);
    }
    for (const n of root.listNodes()) { n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); n.setName(name); }
    await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 10 }));
    const after = triCount(root), bb = getBounds(scene);
    const outPath = path.join(OUT, name + ".glb");
    await io.write(outPath, doc);
    const kb = fs.statSync(outPath).size / 1024;
    report.push({ name, source: f, before, after, kb: +kb.toFixed(1), size: bb.max.map((v, i) => +(v - bb.min[i]).toFixed(3)) });
  }
  for (const r of report) console.log(`${r.name.padEnd(12)} ${String(r.before).padStart(6)} -> ${String(r.after).padStart(5)} triangles, ${r.kb} KB, size ${r.size.join(" x ")}  (${r.source})`);
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ target: TARGET, targets: TARGETS, pieces: report }, null, 1) + "\n");
}
function triCount(root) {
  let n = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const i = p.getIndices(); n += (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3; }
  return n;
}
main().catch(e => { console.error(e); process.exit(1); });
