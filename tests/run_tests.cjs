/* Mission Control tests: build.py and the in-page parser must agree, and the live refresh must work.
 *
 *   node tests/run_tests.cjs --vault "E:\ObsidianVaults\robin-personal" [--python .venv\Scripts\python.exe]
 *
 * Needs Node 18+ and Playwright with its Chromium (dev only; the dashboard itself needs neither).
 * Writes everything to tests/out/ (git-ignored). Never writes to the vault.
 *
 * 1. Parity in Node: build.py --dump vs template/vault-parser.js, on the real vault and on a
 *    generated edge-case vault (BOM, CRLF, bad lanes, bad dates, lists, odd file names...).
 * 2. Headless Chromium on the built page, opened from file:// like the real thing:
 *    snapshot fallback, Connect vault (picker stubbed with a fake folder) with parity against
 *    build.py, Refresh after an edit with no page reload, warnings panel, wrong folder,
 *    stored handle that needs one Allow click, stored handle already allowed, a real
 *    FileSystemDirectoryHandle kept in IndexedDB across a reload (via the origin private file
 *    system, since the folder picker cannot be automated), the mirror build, a browser with no
 *    folder access, and no console errors anywhere.
 * 3. The city (v0.2 step 2): heights from size, lit floors, size-weighted XP, "since your last visit",
 *    the landing moment and sound toggle, labels that never overlap, reduced motion. */
const fs = require("fs"), path = require("path"), os = require("os"), { execFileSync } = require("child_process");
const { makeVault } = require("./fake-vault.js");
const P = require("../template/vault-parser.js");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const VAULT = arg("--vault", process.env.MC_VAULT);
const PY = arg("--python", fs.existsSync(path.join(ROOT, ".venv/Scripts/python.exe")) ? path.join(ROOT, ".venv/Scripts/python.exe") : path.join(ROOT, ".venv/bin/python"));
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (!VAULT) { console.error("Pass --vault PATH"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const TODAY = P.localISODate(Date.now());

let failures = 0;
const ok = (cond, msg) => { console.log((cond ? "  PASS " : "  FAIL ") + msg); if (!cond) failures++; };
const py = (...a) => execFileSync(PY, [path.join(ROOT, "build.py"), ...a], { encoding: "utf-8" });

function readTree(dir) {
  const files = [];
  (function walk(d, rel) {
    for (const n of fs.readdirSync(d)) {
      const full = path.join(d, n), r = rel ? rel + "/" + n : n, st = fs.statSync(full);
      if (st.isDirectory()) { if (rel || n === "Projects" || n === "Archive") walk(full, r); }
      else if (rel) files.push({ path: r, bytes: fs.readFileSync(full), lastModified: st.mtimeMs });
    }
  })(dir, "");
  return files;
}

// ---------- an edge-case vault: every quirk the two parsers must treat the same way ----------
function makeEdgeVault(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const notes = {
    "Projects/Good/Good MOC.md": "---\ntype: project\ncode: goo\nname: \"Good One\"\nnorthstar: \"A fine project\"\nprogress: 42\nlane: ready\nkind: software\nsize: L\nnext: \"Do it\"\nwaiting_on: \"\"\nupdated: " + TODAY + "\n---\n# Good MOC\n",
    "Projects/Crlf/Crlf.md": "---\r\ntype: project\r\nprogress: 55\r\nlane: Waiting\r\nkind: Hardware\r\nsize: xl\r\nnorthstar: crlf note\r\nnext: next\r\nupdated: 2026-01-02\r\n---\r\n# 🚀 Project Crlf Thing MOC\r\n",
    "Projects/Bom/Bom.md": "\ufeff---\ntype: project\nlane: blocked\nprogress: 1_0\nkind: making\nsize: S\nnorthstar: x\nnext: y\n---\n",
    "Projects/BadLane/BadLane.md": "---\ntype: project\nlane: someday\nprogress: 10\n---\n",
    "Projects/NoLane/NoLane.md": "---\ntype: project\nprogress: 10\n---\n",
    "Projects/EmptyLane/EmptyLane.md": "---\ntype: project\nlane:\nprogress: 10\n---\n",
    "Projects/Words/Words.md": "---\ntype: project\nlane: ready\nprogress: lots\nkind: knitting\nsize: huge\n---\n# Words\n",
    "Projects/EmptyProgress/EmptyProgress.md": "---\ntype: project\nlane: ready\nprogress:\nkind: software\nsize: M\nnorthstar: n\nnext: x\n---\n",
    "Projects/Inf/Inf.md": "---\ntype: project\nlane: ready\nprogress: inf\nkind: software\nsize: M\nnorthstar: n\nnext: x\n---\n",
    "Projects/Comment/Comment.md": "---\ntype: project\nlane: ready\nprogress: 60 # guess\nkind: software\nsize: M\nnorthstar: n\nnext: x\n---\n",
    "Projects/Float/Float.md": "---\ntype: project\nlane: ready\nprogress: \" 77.9 \"\nkind: career\nsize: S\nnorthstar: n\nnext: x\n---\n",
    "Projects/Over/Over.md": "---\ntype: project\nlane: ready\nprogress: 250\nkind: athletics\nsize: S\nnorthstar: n\nnext: x\n---\n",
    "Projects/Neg/Neg.md": "---\ntype: project\nlane: ready\nprogress: -0.5\nkind: athletics\nsize: S\nnorthstar: n\nnext: x\n---\n",
    "Projects/Lists/Lists.md": "---\ntype: project\nlane: waiting\nprogress: 30\nkind: software\nsize: M\nnorthstar:\n  - first\n  - \"second's\"\nnext: [a, 'b', \"c\"]\nwaiting_on:\ntags: [x, y]\nproject: [p, q]\n---\n",
    "Projects/BadDate/BadDate.md": "---\ntype: project\nlane: ready\nprogress: 5\nkind: software\nsize: M\nnorthstar: n\nnext: x\nupdated: 2026-02-30\n---\n",
    "Projects/OldDate/OldDate.md": "---\ntype: project\nlane: ready\nprogress: 5\nkind: software\nsize: M\nnorthstar: n\nnext: x\nupdated: 2025-01-01\n---\n",
    "Projects/TextDate/TextDate.md": "---\ntype: project\nlane: ready\nprogress: 5\nkind: software\nsize: M\nnorthstar: n\nnext: x\nupdated: last week\n---\n",
    "Projects/NoUpdated/NoUpdated.md": "---\ntype: project\nlane: waiting\nprogress: 5\nkind: software\nsize: M\nnorthstar: n\nnext: x\n---\n# Title Without Moc\n",
    "Projects/Parked/Parked.md": "---\ntype: project\nstatus: parked\nlane: ready\nprogress: 20\nkind: making\nsize: S\nnorthstar: n\nnext: x\nupdated: 2025-01-01\n---\n",
    "Projects/Quotes/Quotes.md": "---\ntype: project\nlane: ready\nprogress: '45'\nkind: software\nsize: M\nnorthstar: \"He said \\\"hi\\\" </script><b>x</b>\"\nnext: 'single'\ncode: \"q\"\n---\n",
    "Projects/Odd (name) it's! [x].md": "---\ntype: project\nlane: ready\nprogress: 33\nkind: software\nsize: M\nnorthstar: n\nnext: x\n---\nno heading here\n",
    "Projects/Ünïcødé/Café Ünïcødé MOC.md": "---\ntype: project\nlane: ready\nprogress: 12\nkind: software\nsize: M\nnorthstar: \"naïve · résumé\"\nnext: x\n---\n#   ✨ Café Ünïcødé   MOC  \n",
    "Projects/NotProject/Note.md": "---\ntype: note\nlane: ready\n---\n",
    "Projects/NoFrontmatter.md": "# Just a note\n",
    "Projects/Unclosed.md": "---\ntype: project\nlane: ready\n",
    "Projects/EmptyFm.md": "---\n---\n# Empty\n",
    "Projects/notes.txt": "---\ntype: project\nlane: ready\n---\n",
    "Projects/Upper.MD": "---\ntype: project\nlane: ready\n---\n",
    "Archive/Done/Done MOC.md": "---\ntype: project\nstatus: Complete\nprogress: 40\ncompleted: 2026-09-01\nkind: making\nsize: S\nnorthstar: done\n---\n# Done MOC\n",
    "Archive/Done2/Done2.md": "---\ntype: project\nstatus: completed\nlane: ready\nkind: making\nsize: S\n---\n",
    "Archive/Deep/a/b/c/Deep.md": "---\ntype: project\nlane: blocked\nprogress: 99.99\nkind: hardware\nsize: XL\nnorthstar: deep\nnext: deeper\nupdated: 2099-01-01\n---\n",
  };
  for (const [rel, text] of Object.entries(notes)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text, "utf-8");
  }
  // not valid UTF-8: both sides must report it as unreadable
  fs.writeFileSync(path.join(dir, "Projects/Binary.md"), Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a]));
  // a fixed old mtime for the note with no `updated`, so its stale value is known
  const t = new Date(2026, 0, 15, 12, 0, 0);
  fs.utimesSync(path.join(dir, "Projects/NoUpdated/NoUpdated.md"), t, t);
  return dir;
}

function diff(a, b) {
  const out = [];
  if (JSON.stringify(a.warnings) !== JSON.stringify(b.warnings)) out.push("warnings differ:\n    JS " + JSON.stringify(a.warnings) + "\n    PY " + JSON.stringify(b.warnings));
  const n = Math.max(a.projects.length, b.projects.length);
  for (let i = 0; i < n; i++) { const x = JSON.stringify(a.projects[i]), y = JSON.stringify(b.projects[i]); if (x !== y) out.push("project " + i + ":\n    JS " + x + "\n    PY " + y); }
  return out;
}

async function nodeParity(name, vaultDir) {
  const dump = path.join(OUT, name + ".py.json");
  py("--vault", vaultDir, "--check", "--dump", dump, "--today", TODAY);
  const expected = JSON.parse(fs.readFileSync(dump, "utf-8"));
  const got = await P.collectVault(makeVault("v", readTree(vaultDir)), { today: TODAY });
  const d = diff(got, expected);
  ok(d.length === 0, `node parity on ${name}: ${expected.projects.length} projects, ${expected.warnings.length} warnings identical, order too`);
  d.slice(0, 10).forEach(x => console.log("    " + x));
  return expected;
}

async function main() {
  console.log(`Mission Control tests · today ${TODAY} · TZ ${TZ} · vault ${VAULT}`);
  const edgeDir = makeEdgeVault(path.join(OUT, "edge-vault"));

  console.log("1. Parity in Node");
  const realPy = await nodeParity("real vault", VAULT);
  const edgePy = await nodeParity("edge vault", edgeDir);
  ok(edgePy.warnings.length >= 12 && edgePy.projects.length >= 20, `edge vault exercises the rules (${edgePy.projects.length} projects, ${edgePy.warnings.length} warnings)`);
  for (const [name, d] of [["real vault", realPy], ["edge vault", edgePy]]) {
    const js = P.cityStats(d.projects);
    ok(JSON.stringify(js) === JSON.stringify(d.stats), `city XP parity on ${name}: ${JSON.stringify(js)}`);
  }
  const lits = [[50, 24, 12], [50, 6, 3], [25, 6, 2], [5, 16, 1], [3, 16, 0], [99, 6, 6], [100, 24, 24], [0, 10, 0], [45, 10, 5], [35, 10, 4]];
  ok(lits.every(([p, n, want]) => P.litFloors(p, n) === want), "lit floors round half up: " + lits.map(([p, n, w]) => `${p}% of ${n} = ${P.litFloors(p, n)}`).join(", "));
  ok(realPy.projects.every(p => p.floors === P.SIZE_FLOORS[p.size] && p.lit === P.litFloors(p.progress, p.floors)), "real vault: every project's floors come from its size (S 6, M 10, L 16, XL 24)");

  console.log("2. Build");
  const page = path.join(OUT, "mc.html"), mirror = path.join(OUT, "mc-mirror.html");
  py("--vault", VAULT, "--out", page, "--today", TODAY);
  py("--vault", VAULT, "--out", mirror, "--today", TODAY, "--mirror");
  const kb = fs.statSync(page).size / 1024;
  ok(kb < 5 * 1024, `page size ${kb.toFixed(0)} KB, under the 5 MB Sync cap`);

  console.log("3. Headless Chromium (file://)");
  let chromium;
  try { ({ chromium } = require("playwright")); } catch (e) { console.log("  SKIP playwright not installed (npm i playwright)"); return; }
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const errors = [];
  const fakeSrc = fs.readFileSync(path.join(__dirname, "fake-vault.js"), "utf-8");
  const encode = files => files.map(f => ({ path: f.path, b64: Buffer.from(f.bytes).toString("base64"), lastModified: f.lastModified }));
  const realFiles = encode(readTree(VAULT)), edgeFiles = encode(readTree(edgeDir));
  const url = f => "file://" + (os.platform() === "win32" ? "/" : "") + f.replace(/\\/g, "/");

  async function open(file, init) {
    const ctx = await browser.newContext({ timezoneId: TZ, viewport: { width: 1400, height: 1000 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    const pg = await ctx.newPage();
    pg.on("console", m => { if (m.type() === "error") errors.push(path.basename(file) + ": " + m.text()); });
    pg.on("pageerror", e => errors.push(path.basename(file) + ": " + e.message));
    await pg.addInitScript(fakeSrc);
    await pg.addInitScript(`window.__decode=fs=>fs.map(f=>({path:f.path,bytes:Uint8Array.from(atob(f.b64),c=>c.charCodeAt(0)),lastModified:f.lastModified}));`);
    if (init) await pg.addInitScript(init);
    await pg.goto(url(file));
    await pg.waitForFunction(() => window.MC && document.getElementById("src").textContent.length > 0);
    return { ctx, pg };
  }
  const state = pg => pg.evaluate(() => { const s = MC.state(); return { mode: s.mode, projects: s.projects, warnings: s.warnings, level: s.level, buildings: s.buildings, towers: s.towers }; });
  const srcText = pg => pg.textContent("#src");
  const stubPicker = (pg, files, name) => pg.evaluate(([files, name]) => { window.FAKE = makeFakeVault(name, __decode(files)); window.showDirectoryPicker = async () => window.FAKE; }, [files, name]);
  const waitLive = pg => pg.waitForFunction(() => document.getElementById("src").classList.contains("live") || document.getElementById("src").classList.contains("err"), null, { timeout: 15000 });

  // A. snapshot fallback
  {
    const { ctx, pg } = await open(page);
    const s = await state(pg), t = await srcText(pg);
    ok(t.includes("SNAPSHOT FROM " + TODAY), `A. no vault connected: label reads "${t}"`);
    ok(s.projects.length === realPy.projects.length && s.buildings === realPy.projects.length, `A. snapshot draws ${s.buildings} buildings and ${await pg.locator(".card").count()} cards`);
    ok(await pg.isVisible("#connect") && (await pg.textContent("#connect")) === "CONNECT VAULT", "A. Connect vault button shown");
    ok(await pg.isDisabled("#refresh"), "A. Refresh disabled until a vault is connected");
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: path.join(OUT, "snapshot.png") });
    await ctx.close();
  }
  // B. connect (picker stubbed) -> parity with build.py on the real vault; then edit + refresh with no reload
  {
    const { ctx, pg } = await open(page);
    await pg.evaluate(() => { window.__noReload = 1; });
    await stubPicker(pg, realFiles, "robin-personal");
    await pg.click("#connect");
    await waitLive(pg);
    const s = await state(pg), t = await srcText(pg);
    ok(s.mode === "live" && /^LIVE · robin-personal · REFRESHED \d/.test(t), `B. connected: "${t}"`);
    const d = diff(s, realPy);
    ok(d.length === 0, `B. browser parity on the real vault: ${s.projects.length} projects, ${s.warnings.length} warnings identical to build.py`);
    d.slice(0, 10).forEach(x => console.log("    " + x));
    ok((await pg.textContent("#connect")) === "CHANGE VAULT" && !(await pg.isDisabled("#refresh")), "B. buttons now read CHANGE VAULT and REFRESH");
    // edit one note, add one, then Refresh
    const target = realPy.projects.find(p => p.lane === "ready");
    const before = await pg.evaluate(() => MC.state().level);
    await pg.evaluate(([note]) => {
      const parts = (note + ".md").split("/"); let n = FAKE._node; for (const p of parts.slice(0, -1)) n = n.children.get(p);
      const f = n.children.get(parts[parts.length - 1]).file;
      const txt = new TextDecoder().decode(f.bytes).replace(/^progress:.*$/m, "progress: 95");
      f.bytes = new TextEncoder().encode(txt); f.lastModified = Date.now();
      const dir = FAKE._node.children.get("Projects");
      dir.children.set("Zz New", { kind: "directory", name: "Zz New", children: new Map([["Zz New.md", { kind: "file", name: "Zz New.md", file: { bytes: new TextEncoder().encode("---\ntype: project\ncode: NEW\nname: Brand New\nnorthstar: n\nprogress: 100\nlane: ready\nkind: software\nsize: S\nnext: x\n---\n"), lastModified: Date.now() } }]]) });
    }, [target.note]);
    await pg.click("#refresh");
    await pg.waitForFunction(n => MC.state().projects.length === n, realPy.projects.length + 1);
    const card = await pg.textContent(`.card[data-id="${target.id}"] .m span`);
    const s2 = await state(pg);
    ok(card === "95%", `B. Refresh after an edit: ${target.code} card now ${card} (was ${target.progress}%)`);
    ok(s2.buildings === realPy.projects.length + 1 && (await pg.locator('.card[data-id="brand-new"]').count()) === 1, `B. Refresh picked up a new note: ${s2.buildings} buildings`);
    ok(await pg.evaluate(() => window.__noReload === 1), "B. no page reload (in-page state survived)");
    ok(s2.level >= before, `B. HUD recomputed: level ${before} -> ${s2.level}, ${await pg.textContent(".xpl span")}`);
    await pg.click("#refresh");
    await pg.waitForFunction(() => /NO CHANGES/.test(document.getElementById("src").textContent));
    ok(true, `B. second Refresh with nothing changed: "${await srcText(pg)}"`);
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: path.join(OUT, "live.png") });
    await ctx.close();
  }
  // C. edge vault in the browser: parity and the warnings panel
  {
    const { ctx, pg } = await open(page);
    await stubPicker(pg, edgeFiles, "edge-vault");
    await pg.click("#connect");
    await waitLive(pg);
    const s = await state(pg);
    const d = diff(s, edgePy);
    ok(d.length === 0, `C. browser parity on the edge vault: ${s.projects.length} projects, ${s.warnings.length} warnings`);
    d.slice(0, 10).forEach(x => console.log("    " + x));
    const sum = await pg.textContent("#warnsum");
    await pg.click("#warnsum");
    const items = await pg.locator("#warnlist li").count();
    ok(sum === `⚠ ${edgePy.warnings.length} WARNINGS` && items === edgePy.warnings.length && await pg.isVisible("#warnlist"), `C. warnings panel: "${sum}", opens to ${items} lines`);
    ok(await pg.evaluate(() => !document.querySelector(".card .n b") && document.querySelector('.card[data-id="quotes"] .n').textContent.includes("</script><b>x</b>")), "C. note text is escaped, not run as HTML");
    const tw = s.towers || (await pg.evaluate(() => MC.state().towers));
    const parked = tw.find(t => t.id === "parked"), old = tw.find(t => t.id === "olddate");
    ok(parked && parked.tarp && parked.lane === "parked" && old && old.stale > 60, `C. parked site under a tarp; stale building rusts (${old && old.stale} days)`);
    await pg.screenshot({ path: path.join(OUT, "warnings.png") });
    await ctx.close();
  }
  // D. a folder that is not the vault
  {
    const { ctx, pg } = await open(page);
    await stubPicker(pg, [{ path: "Notes/a.md", b64: "", lastModified: 0 }], "Documents");
    await pg.click("#connect");
    await pg.waitForFunction(() => document.getElementById("src").classList.contains("err"));
    const s = await state(pg);
    ok(/NOT THE VAULT/.test(await srcText(pg)) && s.projects.length === realPy.projects.length, `D. wrong folder: "${await srcText(pg)}", snapshot kept`);
    await ctx.close();
  }
  // E. stored handle that needs one Allow click (the worst case for file:// pages)
  {
    const init = `window.MC_TEST_HANDLE_FILES=${JSON.stringify(realFiles)};document.addEventListener("DOMContentLoaded",()=>{});
      Object.defineProperty(window,"MC_TEST_HANDLE",{configurable:true,get(){if(!this.__h){this.__h=makeFakeVault("robin-personal",__decode(MC_TEST_HANDLE_FILES));this.__h.perm="prompt";this.__h.requestPermission=async function(){window.__asked=(window.__asked||0)+1;this.perm="granted";return "granted"}}return this.__h}});`;
    const { ctx, pg } = await open(page, init);
    await pg.waitForFunction(() => document.getElementById("connect").textContent === "ALLOW VAULT ACCESS");
    ok(/SNAPSHOT FROM/.test(await srcText(pg)) && (await state(pg)).mode === "needs-permission", `E. stored handle, permission "prompt": "${await srcText(pg)}"`);
    await pg.click("#connect");
    await waitLive(pg);
    ok((await state(pg)).mode === "live" && await pg.evaluate(() => window.__asked === 1), "E. one click on ALLOW VAULT ACCESS asks once and goes live");
    await ctx.close();
  }
  // F. stored handle already allowed: live on load, no click
  {
    const init = `window.MC_TEST_HANDLE_FILES=${JSON.stringify(realFiles)};Object.defineProperty(window,"MC_TEST_HANDLE",{configurable:true,get(){return this.__h||(this.__h=makeFakeVault("robin-personal",__decode(MC_TEST_HANDLE_FILES)))}});`;
    const { ctx, pg } = await open(page, init);
    await waitLive(pg);
    ok((await state(pg)).mode === "live", `F. stored handle, permission "granted": live on load, "${await srcText(pg)}"`);
    await ctx.close();
  }
  // G1. IndexedDB keeps data across a reload on a file:// page (where the picked folder handle is stored)
  {
    const { ctx, pg } = await open(page);
    await pg.evaluate(() => new Promise((res, rej) => { const q = indexedDB.open("mc-test", 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => { const t = q.result.transaction("kv", "readwrite"); t.objectStore("kv").put({ hi: 1 }, "k"); t.oncomplete = () => { q.result.close(); res(); }; }; q.onerror = () => rej(q.error); }));
    await pg.reload(); await pg.waitForFunction(() => window.MC);
    const v = await pg.evaluate(() => new Promise(res => { const q = indexedDB.open("mc-test", 1); q.onsuccess = () => { const r = q.result.transaction("kv").objectStore("kv").get("k"); r.onsuccess = () => res(r.result); }; }));
    ok(v && v.hi === 1, "G1. IndexedDB works on file:// and survives a reload");
    await ctx.close();
  }
  // G2. a real FileSystemDirectoryHandle kept in IndexedDB across a reload. The folder picker cannot be
  // automated and the origin private file system is blocked on file://, so this one runs over http://127.0.0.1.
  {
    const http = require("http");
    const html = fs.readFileSync(page);
    const server = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end(html); });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const { ctx, pg } = await open(page);
    await pg.goto(`http://127.0.0.1:${server.address().port}/mc.html`);
    await pg.waitForFunction(() => window.MC);
    const r = await pg.evaluate(async () => {
      let root; try { root = await navigator.storage.getDirectory(); } catch (e) { return "OPFS blocked: " + e.name; }
      const vault = await root.getDirectoryHandle("opfs-vault", { create: true });
      const dir = await (await vault.getDirectoryHandle("Projects", { create: true })).getDirectoryHandle("Opfs Test", { create: true });
      const w = await (await dir.getFileHandle("Opfs Test MOC.md", { create: true })).createWritable();
      await w.write("---\ntype: project\ncode: OPF\nnorthstar: real handle\nprogress: 50\nlane: ready\nkind: software\nsize: S\nnext: x\n---\n# Opfs Test MOC\n"); await w.close();
      const db = await new Promise((res, rej) => { const q = indexedDB.open("mission-control", 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(vault, "vault"); t.oncomplete = res; t.onerror = () => rej(t.error); });
      db.close(); return "stored";
    });
    if (r !== "stored") console.log("  SKIP G2. " + r);
    else {
      await pg.reload();
      await pg.waitForFunction(() => window.MC);
      await waitLive(pg);
      const s = await state(pg);
      ok(s.mode === "live" && s.projects.length === 1 && s.projects[0].code === "OPF", `G2. real folder handle from IndexedDB after a reload, live with no click: "${await srcText(pg)}"`);
    }
    await ctx.close(); server.close();
  }
  // H. the mirror build, and a browser without folder access
  {
    const { ctx, pg } = await open(mirror);
    ok(/PHONE MIRROR/.test(await srcText(pg)) && !(await pg.isVisible("#connect")) && !(await pg.isVisible("#refresh")), `H. mirror build: "${await srcText(pg)}", no buttons`);
    await ctx.close();
    const o = await open(page, "delete window.showDirectoryPicker; delete Window.prototype.showDirectoryPicker;");
    ok(/NEEDS CHROME OR EDGE/.test(await srcText(o.pg)) && !(await o.pg.isVisible("#connect")), `H. no folder access (Firefox, Obsidian viewer): "${await srcText(o.pg)}"`);
    await o.ctx.close();
  }
  // I. heights from size, lit floors from progress
  {
    const { ctx, pg } = await open(page);
    const s = await pg.evaluate(() => MC.state());
    const want = realPy.projects.map(p => [p.id, p.floors, p.lit]).sort().join(";");
    const got = s.towers.map(t => [t.id, t.floors, t.shown]).sort().join(";");
    ok(got === want, `I. ${s.towers.length} towers: height = size, lit floors = progress (${realPy.projects.map(p => p.code + " " + p.lit + "/" + p.floors).join(", ")})`);
    ok(s.stats.xp === realPy.stats.xp && s.level === realPy.stats.level, `I. HUD uses size-weighted XP: ${s.stats.xp} XP (${s.stats.lit} lit + ${s.stats.bonus} landing bonus), level ${s.level}`);
    ok(s.towers.filter(t => t.lane === "landed").every(t => t.crown && t.roof), "I. every landed building wears a crown and its finished roof");
    const FH = { software: 1.2, making: 0.96, hardware: 1.2, career: 1.2, athletics: 1.08 };
    ok(s.towers.every(t => Math.abs(t.height - t.floors * FH[t.kind]) < 0.02 && t.roof === (t.shown === t.floors)), `I. shape by kind: floor height per kind, roof only once topped out (${[...new Set(s.towers.map(t => t.kind))].join(", ")})`);
    ok(JSON.stringify(s.unlocks) === JSON.stringify(Array.from({ length: s.level - 1 }, (_, i) => i + 2).filter(l => l !== 7 || s.level >= 7)), `I. level ${s.level} draws its unlocks: groups for levels ${s.unlocks.join(", ")}`);
    ok(s.perf.calls > 0 && s.perf.calls < 600, `I. ${s.perf.calls} draw calls, ${Math.round(s.perf.tris / 1000)}K triangles (budget 600 calls)`);
    ok(await pg.evaluate(() => !document.querySelector('link[href*="fonts.googleapis"]') && document.fonts.check("700 14px Rajdhani") && document.fonts.check("12px 'Share Tech Mono'") && document.fonts.check("40px Monoton")), "I. fonts are built into the page (no Google Fonts link) and loaded");
    ok(/FIRST VISIT/.test(await pg.textContent("#since")), `I. first visit on this browser: "${await pg.textContent("#since")}"`);
    ok(s.queue === 0 && s.show.floors === 0 && s.show.landings === 0, "I. first visit: nothing to animate");
    await ctx.close();
  }
  // J. since your last visit (snapshot page, vault not connected), the landing moment, and the strip across reloads
  {
    const ready = realPy.projects.find(p => p.lane === "ready" && p.lit >= 3);
    const landed = realPy.projects.find(p => p.lane === "landed");
    const gone = realPy.projects.find(p => p.lane === "waiting");
    const map = {};
    realPy.projects.forEach(p => { map[p.id] = { lit: p.lit, floors: p.floors, lane: p.lane, code: p.code, name: p.name, progress: p.progress }; });
    map[ready.id].lit -= 3;
    map[landed.id] = { ...map[landed.id], lane: "ready", lit: landed.floors - 2, progress: 80 };
    delete map[gone.id];
    const before = Date.now() - 2 * 3600e3;
    const oldXp = realPy.stats.xp - 3 - 2 - landed.floors - gone.lit;
    const rec = { base: { at: before - 3600e3, map, xp: oldXp, level: 1 + Math.floor(oldXp / 30) }, cur: { at: before, map, xp: oldXp, level: 1 + Math.floor(oldXp / 30) } };
    const seed = `if(!sessionStorage.getItem("seeded")){localStorage.setItem("mc-visit-v1:snap",${JSON.stringify(JSON.stringify(rec))});sessionStorage.setItem("seeded","1")}`;
    const { ctx, pg } = await open(page, seed);
    const strip = await pg.textContent("#since");
    ok(strip.includes(`${ready.code} +3 FLOORS`) && strip.includes(`${landed.code} LANDED`) && strip.includes(`NEW · ${gone.code}`) && /\+\d+ XP/.test(strip), `J. strip: "${strip}"`);
    const t0 = await pg.evaluate(id => MC.state().towers.find(t => t.id === id).shown, ready.id);
    ok(t0 === ready.lit - 3, `J. on open, ${ready.code} starts at its old ${t0} lit floors`);
    await pg.waitForFunction(() => MC.state().show.landings === 1, null, { timeout: 15000 });
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: path.join(OUT, "landing.png") });
    ok(/LANDED/.test(await pg.textContent("#toast")) && await pg.evaluate(() => document.getElementById("toast").classList.contains("show")), `J. landing moment: toast "${(await pg.textContent("#toast")).replace(/\s+/g, " ")}"`);
    await pg.waitForFunction(() => MC.state().queue === 0, null, { timeout: 15000 });
    const s = await pg.evaluate(() => MC.state());
    ok(s.towers.every(t => t.shown === realPy.projects.find(p => p.id === t.id).lit), "J. after the show every building is at its real lit floors");
    ok(s.show.floors === 3 + 2 + gone.lit, `J. ${s.show.floors} new floors lit one by one (3 + 2 + ${gone.lit} for the new building)`);
    ok(s.sound.on && s.sound.stings >= 1, `J. landing sting asked for (sound on by default; ${s.sound.notes} notes played before any click)`);
    ok(await pg.evaluate(id => MC.state().projects.find(p => p.lane === "landed" && p.id === id) && document.querySelector(".card.sel").dataset.id === id, landed.id), `J. the landed building is selected during its moment`);
    const btn = pg.locator(`#since button[data-id="${ready.id}"]`);
    await btn.click();
    ok(await pg.evaluate(id => document.querySelector(".card.sel").dataset.id === id, ready.id), "J. clicking a strip item selects that building");
    await pg.reload(); await pg.waitForFunction(() => window.MC && document.getElementById("since").textContent.length > 0);
    ok((await pg.textContent("#since")).includes(`${landed.code} LANDED`), "J. a reload in the same sitting keeps the strip");
    await pg.evaluate(() => { const k = "mc-visit-v1:snap", r = JSON.parse(localStorage.getItem(k)); r.cur.at -= 3 * 3600e3; localStorage.setItem(k, JSON.stringify(r)); });
    await pg.reload(); await pg.waitForFunction(() => window.MC && document.getElementById("since").textContent.length > 0);
    ok(/NOTHING NEW/.test(await pg.textContent("#since")) && (await pg.evaluate(() => MC.state().queue)) === 0, `J. next visit (over 30 min later): "${await pg.textContent("#since")}"`);
    await ctx.close();
  }
  // K. sound toggle, remembered in this browser
  {
    const { ctx, pg } = await open(page);
    ok((await pg.getAttribute("#snd", "aria-pressed")) === "true" && (await pg.textContent("#snd")) === "♪ SOUND ON", "K. sound on by default");
    await pg.click("#snd");
    ok((await pg.textContent("#snd")) === "♪ SOUND OFF" && await pg.evaluate(() => localStorage.getItem("mc-sound")) === "off", "K. click turns it off and it is remembered");
    await pg.reload(); await pg.waitForFunction(() => window.MC);
    ok((await pg.textContent("#snd")) === "♪ SOUND OFF", "K. still off after a reload");
    await ctx.close();
  }
  // L. live: a project lands on Refresh. First live read is a first visit; the Refresh plays the moment
  {
    const { ctx, pg } = await open(page);
    await stubPicker(pg, realFiles, "robin-personal");
    await pg.click("#connect");
    await waitLive(pg);
    const target = realPy.projects.filter(p => p.lane !== "landed").sort((a, b) => b.floors - a.floors)[0];
    const lv0 = await pg.evaluate(() => MC.state().level);
    await pg.evaluate(([note]) => {
      const parts = (note + ".md").split("/"); let n = FAKE._node; for (const p of parts.slice(0, -1)) n = n.children.get(p);
      const f = n.children.get(parts[parts.length - 1]).file;
      f.bytes = new TextEncoder().encode(new TextDecoder().decode(f.bytes).replace(/^status:.*$/m, "status: completed\ncompleted: 2026-10-11"));
    }, [target.note]);
    await pg.click("#refresh");
    await pg.waitForFunction(() => MC.state().show.landings === 1, null, { timeout: 20000 });
    const s = await pg.evaluate(() => MC.state());
    const t = s.towers.find(x => x.id === target.id);
    ok(t.lane === "landed" && t.crown && s.stats.xp === realPy.stats.xp + (target.floors - target.lit) + target.floors, `L. ${target.code} (${target.size}) landed on Refresh: crown, +${target.floors - target.lit} floors and +${target.floors} landing bonus, ${s.stats.xp} XP, level ${lv0} -> ${s.level}`);
    ok(s.sound.stings >= 1 && s.sound.notes > 0, `L. after a click the sting plays: ${s.sound.notes} notes`);
    ok((await pg.textContent("#since")).includes(`${target.code} LANDED`), `L. strip: "${await pg.textContent("#since")}"`);
    if (s.level > lv0) { await pg.waitForFunction(() => MC.state().show.levelups === 1, null, { timeout: 20000 }); ok(/CITY LEVEL/.test(await pg.textContent("#toast")), `L. level up toast: "${(await pg.textContent("#toast")).replace(/\s+/g, " ")}"`);
      await pg.waitForTimeout(1600);
      ok(await pg.evaluate(lv => MC.state().unlocks.includes(lv), s.level), `L. level ${s.level}'s new things rise in on the level up`); }
    await ctx.close();
  }
  // N. levels 7 to 10 draw something; the #fps readout
  {
    const { ctx, pg } = await open(page + "#fps");
    await pg.evaluate(() => { const ps = JSON.parse(JSON.stringify(MC.state().projects)); ps.forEach(p => { if (p.lane !== "landed") { p.lane = "landed"; p.progress = 100; p.lit = p.floors; } }); MC.render({ projects: ps, warnings: [] }); });
    await pg.waitForTimeout(900);
    const s = await pg.evaluate(() => MC.state());
    ok(s.level >= 10 && [7, 8, 9, 10].every(l => s.unlocks.includes(l)), `N. everything landed: level ${s.level}, ${s.stats.xp} XP, unlock groups ${s.unlocks.join(", ")}`);
    ok(s.perf.calls < 700, `N. full city: ${s.perf.calls} draw calls, ${Math.round(s.perf.tris / 1000)}K triangles`);
    ok(/^FPS \d+ · \d+ DRAW CALLS/.test(await pg.textContent(".fps")), `N. #fps readout: "${await pg.textContent(".fps")}"`);
    await pg.evaluate(() => MC.view(-0.4, 1.0, 120)); await pg.waitForTimeout(500);
    await pg.screenshot({ path: path.join(OUT, "level10.png") });
    await ctx.close();
  }
  // M. labels never overlap, from several angles and at phone width; reduced motion skips the show
  {
    const { ctx, pg } = await open(page);
    let worst = 0, moved = 0, hidden = 0;
    for (const [az, pol, rad] of [[-0.6, 1.06, 111], [0.5, 1.06, 111], [1.6, 0.8, 90], [2.7, 1.3, 140], [3.9, 1.06, 60], [5.0, 0.5, 111]]) {
      await pg.evaluate(([a, p, r]) => MC.view(a, p, r), [az, pol, rad]);
      await pg.waitForTimeout(250);
      const r = await pg.evaluate(() => { const ls = [...document.querySelectorAll(".lbl")].filter(e => e.style.display !== "none" && !e.classList.contains("on")).map(e => e.getBoundingClientRect()); const hud = document.getElementById("hud").getBoundingClientRect(); let ov = ls.filter(a => a.left < hud.right && hud.left < a.right && a.top < hud.bottom && hud.top < a.bottom).length; ls.push(...[...document.querySelectorAll(".lbl.on")].map(e => e.getBoundingClientRect())); for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i], b = ls[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) ov++; } return { ov, st: MC.state().labels }; });
      worst = Math.max(worst, r.ov); moved += r.st.moved; hidden += r.st.hidden;
    }
    await pg.evaluate(() => MC.view(-0.6, 1.06, 111)); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(OUT, "labels.png"), clip: { x: 300, y: 150, width: 800, height: 520 } });
    ok(worst === 0, `M. no label overlaps another label or the HUD, from 6 camera angles (${moved} moved up with a leader line, ${hidden} hidden until hovered, over all angles)`);
    await pg.setViewportSize({ width: 390, height: 900 }); await pg.waitForTimeout(400);
    const ph = await pg.evaluate(() => { const ls = [...document.querySelectorAll(".lbl")].filter(e => e.style.display !== "none" && !e.classList.contains("on")).map(e => e.getBoundingClientRect()); const hud = document.getElementById("hud").getBoundingClientRect(); let ov = ls.filter(a => a.left < hud.right && hud.left < a.right && a.top < hud.bottom && hud.top < a.bottom).length; ls.push(...[...document.querySelectorAll(".lbl.on")].map(e => e.getBoundingClientRect())); for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i], b = ls[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) ov++; } return { ov, n: ls.length, sw: document.documentElement.scrollWidth }; });
    ok(ph.ov === 0 && ph.sw <= 390, `M. phone width: ${ph.n} labels, none over another or the HUD, no sideways scroll`);
    await pg.screenshot({ path: path.join(OUT, "phone.png"), fullPage: false });
    await ctx.close();
    const map = {}; realPy.projects.forEach(p => { map[p.id] = { lit: 0, floors: p.floors, lane: "ready", code: p.code, name: p.name, progress: 0 }; });
    const rec = { base: { at: Date.now() - 9e6, map, xp: 0, level: 1 }, cur: { at: Date.now() - 9e6, map, xp: 0, level: 1 } };
    const c2 = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1400, height: 1000 } });
    await c2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    const p2 = await c2.newPage(); p2.on("pageerror", e => errors.push("reduced: " + e.message));
    await p2.addInitScript(`localStorage.setItem("mc-visit-v1:snap",${JSON.stringify(JSON.stringify(rec))})`);
    await p2.goto(url(page)); await p2.waitForFunction(() => window.MC && MC.state().towers.length > 0);
    const s2 = await p2.evaluate(() => MC.state());
    ok(s2.towers.every(t => t.shown === realPy.projects.find(p => p.id === t.id).lit) && s2.show.floors === 0, "M. reduced motion: floors shown at once, no floor-by-floor show");
    await c2.close();
  }
  ok(errors.length === 0, `no console errors or page errors${errors.length ? ":\n    " + errors.join("\n    ") : ""}`);
  await browser.close();
}

main().then(() => { console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED"); process.exit(failures ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
