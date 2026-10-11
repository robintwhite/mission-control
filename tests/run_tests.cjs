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
 *    folder access, and no console errors anywhere. */
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
  const state = pg => pg.evaluate(() => { const s = MC.state(); return { mode: s.mode, projects: s.projects, warnings: s.warnings, level: s.level, buildings: s.buildings }; });
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
  ok(errors.length === 0, `no console errors or page errors${errors.length ? ":\n    " + errors.join("\n    ") : ""}`);
  await browser.close();
}

main().then(() => { console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED"); process.exit(failures ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
