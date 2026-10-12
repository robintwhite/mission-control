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
 *    the landing moment and sound toggle, labels that never overlap, reduced motion.
 * 4. Art pass 2a (O to Q): placement by start date, stages, status, the kit, the camera, the street.
 * 5. Art pass 2b (R): the city grows by blocks with the level, roads by tier, traffic by activity, HQ and its board,
 *    monuments by projects landed, lights only on landed buildings, the gold ring, faint blueprints, the spotlight,
 *    the blue title, no drawing while the city is scrolled away, and the budgets on a very big city. */
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
    "Projects/Good/Good MOC.md": "---\ntype: project\ncode: goo\nname: \"Good One\"\nnorthstar: \"A fine project\"\nprogress: 42\nlane: ready\nkind: software\nsize: L\nnext: \"Do it\"\nwaiting_on: \"\"\nupdated: " + TODAY + "\ncreated: 2026-03-01\n---\n# Good MOC\n",
    "Projects/TieA/TieA.md": "---\ntype: project\nname: Tie A\nlane: ready\nprogress: 50\nkind: hardware\nsize: M\nnorthstar: n\nnext: x\ncreated: 2026-04-04\n---\n",
    "Projects/TieB/TieB.md": "---\ntype: project\nname: Tie B\nlane: waiting\nprogress: 0\nkind: making\nsize: S\nnorthstar: n\nnext: x\ncreated: 2026-04-04\n---\n",
    "Projects/BadCreated/BadCreated.md": "---\ntype: project\nlane: ready\nprogress: 5\nkind: career\nsize: M\nnorthstar: n\nnext: x\ncreated: 2026-13-40\n---\n",
    "Projects/ListCreated/ListCreated.md": "---\ntype: project\nlane: ready\nprogress: 5\nkind: career\nsize: M\nnorthstar: n\nnext: x\ncreated: [2026-01-01]\n---\n",
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
  {
    const dn = d => Math.round((Date.parse(TODAY + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 864e5);
    const want = realPy.projects.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.updated) && dn(p.updated) <= 7).length;
    ok(realPy.projects.every(p => p.days === null || (Number.isInteger(p.days) && p.days === dn(p.updated))) && realPy.stats.active7 === want && realPy.stats.landed === realPy.projects.filter(p => p.lane === "landed").length,
      `R. days since updated on every project; ${realPy.stats.active7} active in the last 7 days, ${realPy.stats.landed} landed (stats parity above)`);
    const e = edgePy.projects;
    ok(e.find(p => p.id === "textdate").days === null && e.find(p => p.id === "baddate").days === null && e.find(p => p.id === "deep").days < 0, "R. days: null for a date that is not real, negative for a future date");
  }

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
    const toasts = await pg.evaluate(() => MC.state().show.toasts);
    ok(toasts[0] === "LANDED", `J. landing moment: toasts shown ${JSON.stringify(toasts)} (the slow software renderer can reach the level-up toast before this check)`);
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
  // O. art pass 2a: placement by start date, stages, status, the kit, the camera, the street, budgets
  {
    const { ctx, pg } = await open(page);
    const s = await pg.evaluate(() => MC.state());
    const cmpS = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const want = realPy.projects.slice().sort((a, b) => ((a.created ? 0 : 1) - (b.created ? 0 : 1)) || cmpS(a.created, b.created) || cmpS(a.name, b.name) || cmpS(a.note, b.note)).map(p => p.id);
    const got = s.towers.slice().sort((a, b) => a.lot - b.lot).map(t => t.id);
    ok(JSON.stringify(got) === JSON.stringify(want), `O. lots go by start date (created), oldest first: ${got.slice(0, 4).join(", ")} ... ${got.slice(-2).join(", ")}`);
    ok(s.towers.every(t => t.ring >= 1) && s.towers.filter(t => t.ring === 1).length === Math.min(32, s.towers.length), `O. the town square stays free; projects fill the first ring of blocks around it (${s.blocks}x${s.blocks} blocks)`);
    const ties = [];
    realPy.projects.forEach((a, i) => realPy.projects.slice(i + 1).forEach(b => { if (a.created && a.created === b.created) ties.push([a.id, b.id]); }));
    const T = id => s.towers.find(t => t.id === id);
    ok(ties.length > 0 && ties.every(([a, b]) => Math.abs(T(a).lot - T(b).lot) === 1 && Math.hypot(T(a).x - T(b).x, T(a).z - T(b).z) < 16), `O. same start date sits side by side: ${ties.map(([a, b]) => T(a).lot + "/" + T(b).lot).join(", ")}`);
    const st = t => t.stage;
    ok(s.towers.every(t => (st(t).clad || 0) === t.shown), "O. clad, lit floors = lit floors from progress, on every building");
    const live = s.towers.filter(t => t.lane !== "landed" && t.lane !== "parked" && t.shown < t.floors && realPy.projects.find(p => p.id === t.id).progress > 0);
    ok(live.every(t => { const left = t.floors - t.shown; return (st(t).scaf || 0) === Math.min(2, left) && (st(t).frame || 0) === Math.min(2, Math.max(0, left - 2)) && (st(t).holo || 0) === Math.max(0, left - 4); }),
      `O. build front on ${live.length} active sites: 2 floors scaffold and net, 2 floors steel frame ahead, the rest a hologram blueprint`);
    ok(s.towers.every(t => t.crane === ((t.lane === "ready" || t.lane === "waiting") && t.shown < t.floors && realPy.projects.find(p => p.id === t.id).progress > 0)), "O. a crane on every ready or waiting site that is not topped out");
    ok(s.towers.every(t => t.status.ring === ({ ready: "#2cf4ff", waiting: "#ffb347", blocked: "#ff4d6d", parked: "#7f8fb3", landed: "#5dffb0" })[t.lane]), "O. the base ring carries the status colour");
    ok(s.towers.filter(t => t.lane === "landed").every(t => t.trees && t.roof && t.crown && !t.crane && !t.props), "O. landed: scaffold gone, roof and crown on, trees planted, site cleared");
    const feet = new Set(s.towers.map(t => t.foot)), kits = new Set(s.towers.map(t => t.kit));
    ok(feet.size >= 4 && kits.size === s.towers.length, `O. the kit varies: footprints ${[...feet].join(", ")}; ${kits.size} different buildings out of ${s.towers.length}`);
    ok(s.camera.ortho && Math.abs(s.camera.elevation - 35.26) < .01, `O. isometric camera: orthographic, ${s.camera.elevation}° elevation`);
    const box = await pg.locator("canvas").boundingBox();
    await pg.mouse.move(box.x + 700, box.y + 300); await pg.mouse.down(); await pg.mouse.move(box.x + 500, box.y + 150, { steps: 5 }); await pg.mouse.up();
    const s2 = await pg.evaluate(() => MC.state().camera);
    ok(Math.abs(s2.az - s.camera.az) > .3 && s2.elevation === s.camera.elevation, `O. drag turns the city (az ${s.camera.az.toFixed(2)} -> ${s2.az.toFixed(2)}); the elevation stays isometric`);
    ok(!s.sceneSun && await pg.locator("header .sun").count() === 1 && await pg.evaluate(() => getComputedStyle(document.querySelector("header .sun")).borderRadius === "50%"), "O. the sun is in the title banner, not in the 3D scene");
    ok(s.street.roads > 0 && s.street.marks > 100 && s.street.crosswalks > 0 && s.street.cars === Math.min(48, 4 + 3 * s.stats.active7) && s.street.carLights === 4 * s.street.cars, `O. street level: ${s.street.roads} roads, ${s.street.marks} lane marks, ${s.street.crosswalks} crosswalks, ${s.street.cars} cars with ${s.street.carLights} lights`);
    ok(s.perf.calls < 600 && s.perf.tris < 150000, `O. budget: ${s.perf.calls} draw calls (under 600), ${Math.round(s.perf.tris / 1000)}K triangles (under 150K)`);
    // every stage on one page: zoned, parked, blocked, stale, a ready building at 100%
    const r = await pg.evaluate(() => { const ps = JSON.parse(JSON.stringify(MC.state().projects)); const by = l => ps.filter(p => p.lane === l);
      const a = by("ready")[0], b = by("ready")[1], c = by("waiting")[0], d = by("ready")[3], e = by("ready")[2];
      a.progress = 0; a.lit = 0; b.lane = "parked"; c.lane = "blocked"; d.stale = 75; e.progress = 100; e.lit = e.floors; MC.render({ projects: ps, warnings: [] });
      const T = id => MC.state().towers.find(t => t.id === id); return { a: T(a.id), b: T(b.id), c: T(c.id), d: T(d.id), e: T(e.id) }; });
    ok(r.a.stage.holo === r.a.floors && r.a.fence && !r.a.crane && !r.a.props, `O. 0%: zoned lot, fence and a full hologram blueprint (${r.a.id})`);
    ok(r.b.tarp && !r.b.crane && (r.b.stage.tarp || 0) === Math.min(4, r.b.floors - r.b.shown), `O. parked: a tarp over the build front, no crane (${r.b.id})`);
    ok(r.c.fence && !r.c.crane, `O. blocked: fence, hazard tape and a shut gate, no crane (${r.c.id})`);
    ok(r.d.stale === 75 && r.d.rust && r.d.crane && !r.d.craneTurns, `O. stale 75 days: rust, and the crane stands still (${r.d.id})`);
    ok(r.e.roof && !r.e.crane && !r.e.crown && !r.e.trees, `O. 100% but not landed: topped out with its roof, no crown or trees yet (${r.e.id})`);
    await pg.evaluate(id => MC.look(id, 14, Math.PI * 1.25 + .3), r.b.id); await pg.waitForTimeout(600);
    await pg.screenshot({ path: path.join(OUT, "art-stages.png") });
    await ctx.close();
  }
  // P. a building never moves: progress, landing, parking and a new project leave every other building where it was
  {
    const { ctx, pg } = await open(page);
    await stubPicker(pg, realFiles, "robin-personal");
    await pg.click("#connect");
    await waitLive(pg);
    const where = () => pg.evaluate(() => Object.fromEntries(MC.state().towers.map(t => [t.id, [t.x, t.z, t.lot]])));
    const edit = (note, fn) => pg.evaluate(([note, fn]) => { const parts = (note + ".md").split("/"); let n = FAKE._node; for (const p of parts.slice(0, -1)) n = n.children.get(p);
      const f = n.children.get(parts[parts.length - 1]).file; f.bytes = new TextEncoder().encode(eval(fn)(new TextDecoder().decode(f.bytes))); f.lastModified = Date.now(); }, [note, fn]);
    const w0 = await where();
    const target = realPy.projects.find(p => p.lane === "ready" && p.progress <= 80);
    await edit(target.note, `t => t.replace(/^progress:.*$/m, "progress: ${target.progress + 20}")`);
    await pg.click("#refresh"); await pg.waitForFunction(([id, v]) => MC.state().projects.find(p => p.id === id).progress === v, [target.id, target.progress + 20]);
    const w1 = await where();
    ok(JSON.stringify(w1) === JSON.stringify(w0), `P. ${target.code} +20% on Refresh: every building stays on its lot (${target.code} lot ${w0[target.id][2]})`);
    await edit(target.note, `t => t.replace(/^status:.*$/m, "status: completed\\ncompleted: 2026-10-11")`);
    await pg.click("#refresh"); await pg.waitForFunction(id => MC.state().projects.find(p => p.id === id).lane === "landed", target.id);
    const w2 = await where();
    ok(JSON.stringify(w2) === JSON.stringify(w0), `P. ${target.code} lands on Refresh: it stays on lot ${w2[target.id][2]}, nothing else moves`);
    const other = realPy.projects.find(p => p.lane === "waiting");
    await edit(other.note, `t => t.replace(/^status:.*$/m, "status: parked")`);
    await pg.click("#refresh"); await pg.waitForFunction(id => MC.state().projects.find(p => p.id === id).lane === "parked", other.id);
    ok(JSON.stringify(await where()) === JSON.stringify(w0), `P. ${other.code} parked on Refresh: no building moves`);
    await pg.evaluate(() => { const dir = FAKE._node.children.get("Projects");
      dir.children.set("Zz New", { kind: "directory", name: "Zz New", children: new Map([["Zz New.md", { kind: "file", name: "Zz New.md", file: { bytes: new TextEncoder().encode("---\ntype: project\ncode: NEW\nname: Brand New\nnorthstar: n\nprogress: 0\nlane: ready\nkind: software\nsize: S\nnext: x\ncreated: 2099-01-01\n---\n"), lastModified: Date.now() } }]]) }); });
    await pg.click("#refresh"); await pg.waitForFunction(n => MC.state().towers.length === n, realPy.projects.length + 1);
    const w4 = await where(), moved = Object.keys(w0).filter(id => JSON.stringify(w4[id]) !== JSON.stringify(w0[id]));
    ok(moved.length === 0 && w4["brand-new"][2] === realPy.projects.length + 1, `P. a new project takes the next lot (${w4["brand-new"][2]}); none of the others move`);
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: path.join(OUT, "art-live.png") });
    await ctx.close();
  }
  // Q. the edge vault: notes without a usable start date go on the outer edge, after every dated one
  {
    const { ctx, pg } = await open(page);
    await stubPicker(pg, edgeFiles, "edge-vault");
    await pg.click("#connect");
    await waitLive(pg);
    const t = await pg.evaluate(() => MC.state().towers);
    const dated = t.filter(x => x.created), undated = t.filter(x => !x.created);
    ok(dated.length >= 3 && Math.max(...dated.map(x => x.lot)) < Math.min(...undated.map(x => x.lot)), `Q. ${dated.length} dated projects first, ${undated.length} with no date after them`);
    const a = t.find(x => x.id === "tie-a"), b = t.find(x => x.id === "tie-b");
    ok(a && b && Math.abs(a.lot - b.lot) === 1, `Q. Tie A and Tie B (same date) on lots ${a && a.lot} and ${b && b.lot}`);
    ok(edgePy.warnings.some(w => /BadCreated: created '2026-13-40' is not a date/.test(w)) && edgePy.warnings.some(w => /ListCreated: created/.test(w)), "Q. a bad created date is a warning");
    await ctx.close();
  }
  // R. art pass 2b: the city layer
  {
    const { ctx, pg } = await open(page);
    await pg.waitForTimeout(600);
    const s = await pg.evaluate(() => MC.state());
    // free lots: four per block, less the square and the five landmark blocks (blocks 9 to 13, art pass 3)
    const needFor = n => { let K = 1; const free = K => 4 * Math.max(0, K - 1 - Math.min(5, Math.max(0, K - 9))); while (free(K) < n + 3) K++; return K; };
    const L = s.level, byLevel = 9 + 2 * Math.max(0, L - 2), need = needFor(s.towers.length);
    ok(s.street.blocks === Math.max(byLevel, need) && s.street.onRoad, `R. level ${L}: ${s.street.blocks} blocks open (9 + 2 a level from level 3), every block has a road on all four sides`);
    ok(s.beyond === 0, `R. no skyline towers: nothing stands outside the open blocks (${s.beyond} parts beyond the edge)`);
    const pl = await pg.evaluate(() => { const out = []; for (let lv = 1; lv <= 40; lv++) out.push(MC.plan(21, lv)); return out; });
    ok(pl.every((p, i) => p.blocks === Math.max(9 + 2 * Math.max(0, i - 1), 7)), "R. blocks by level 1 to 40: " + [1, 3, 10, 22, 40].map(l => `L${l} ${pl[l - 1].blocks}`).join(", ") + ". No cap");
    ok(pl.every((p, i) => i === 0 || p.order.slice(0, pl[i - 1].order.length).join("|") === pl[i - 1].order.join("|")), "R. the city only adds blocks: each level keeps every block it had, in the same place");
    ok(pl.every(p => p.lots.join("|") === pl[0].lots.join("|")), "R. growing the city never moves a project: the same 21 lots at every level");
    ok(pl[2].order.slice(9, 11).sort().join(" ") === "-2,0 2,0" && pl[3].order.slice(11, 13).sort().join(" ") === "0,-2 0,2", `R. ring 2 opens from the middle of each side, opposite sides in pairs (level 3: ${pl[2].order.slice(9, 11).join(" and ")}; level 4: ${pl[3].order.slice(11, 13).join(" and ")})`);
    ok(s.street.tier === (L >= 6 ? 3 : L >= 3 ? 2 : 1) && (s.street.tier < 3 || s.street.neonEdges > 0) && (s.street.tier < 2 || s.street.marks > 0), `R. roads at level ${L}: tier ${s.street.tier} (${s.street.marks} lane marks, ${s.street.crosswalks} crosswalks, ${s.street.neonEdges} neon edges)`);
    ok(s.hq.floors === (L < 3 ? 1 : L < 6 ? 2 : 3) && (L < 2 ? s.hq.tower === 0 : s.hq.tower === Math.min(28, 3 + 1.5 * (L - 1))) && s.hq.parts.includes("plaza") && s.hq.parts.includes("board") && (L < 4 || s.hq.parts.includes("pavilions")) && (L < 5 || s.hq.parts.includes("observation pod")),
      `R. HQ is a domed civic centre on a round plaza: ${s.hq.floors} drum floors and a ${s.hq.tower} high needle tower at level ${L}; ${s.hq.parts.join(", ")}`);
    ok(s.hq.boardW >= 12 && s.hq.board.split(" | ").length <= 5, `R. the board is big (${s.hq.boardW} wide) with few lines: "${s.hq.board}"`);
    const sel = s.towers.find(t => t.id === (s.projects.find(p => p.lane === "ready") || {}).id);
    ok(sel && s.hq.board.startsWith(sel.id ? s.projects.find(p => p.id === sel.id).code : "") && s.hq.boardFacesCamera, `R. the board shows the selected project and faces the camera: "${s.hq.board.slice(0, 60)}..."`);
    ok(s.spot && s.spot.on && Math.abs(s.spot.x - sel.x) < .01 && Math.abs(s.spot.z - sel.z) < .01 && s.spot.sourceY > 1.2, `R. a spotlight shines on the selected building from above the view (its source is off screen, y ${s.spot.sourceY})`);
    const other = s.projects.find(p => p.lane === "landed");
    await pg.evaluate(id => { const c = document.querySelector(`.card[data-id="${id}"]`); c.click(); }, other.id); await pg.waitForTimeout(300);
    const s1 = await pg.evaluate(() => MC.state());
    ok(s1.hq.board.startsWith(other.code) && s1.hq.board.includes("LANDED"), `R. select another building: the board follows ("${s1.hq.board.slice(0, 40)}...")`);
    ok(s1.towers.filter(t => t.holoFull).map(t => t.id).join() === other.id, "R. only the selected building's blueprint is full strength; the rest are faint");
    const mode = t => t.lane === "landed" ? "lit" : (t.lane === "ready" || t.lane === "waiting") && !t.stale ? "work" : "off";
    ok(s.towers.every(t => t.lights === mode(t)), `R. lights on only when landed (${s.towers.filter(t => t.lights === "lit").length}), work lights on active sites (${s.towers.filter(t => t.lights === "work").length}), dark when stopped (${s.towers.filter(t => t.lights === "off").length})`);
    ok(s.towers.every(t => t.ringWide === (t.lane === "landed")), "R. the wide green ring only on landed buildings");
    const act = s.towers.filter(t => t.lane !== "landed" && t.lane !== "parked" && t.shown < t.floors && (t.stage.scaf || 0) > 0);
    ok(act.length > 0 && act.every(t => t.net === 1), `R. green net on the top scaffold floor only (${act.length} sites)`);
    const title = await pg.evaluate(() => getComputedStyle(document.querySelector("header h1")).backgroundImage);
    ok(!/255, 60, 172/.test(title) && /44, 244, 255/.test(title), "R. the title is all neon blue (pink only in its glow)");
    ok(s.monuments.landed === s.stats.landed && s.monuments.plaza === (s.stats.landed >= 5) && !s.monuments.rocket, `R. ${s.stats.landed} landed: monuments ${["plaza", "pad", "rocket"].filter(k => s.monuments[k]).join(", ") || "none yet"}`);
    // clearing the selection: Esc, and a click on empty ground. It stays clear after a refresh
    const key0 = await pg.evaluate(() => getComputedStyle(document.getElementById("keymore")).display);
    await pg.click("#keyinfo"); await pg.mouse.move(5, 5); await pg.waitForTimeout(100);
    const key1 = await pg.evaluate(() => getComputedStyle(document.getElementById("keymore")).display);
    await pg.click("#keyinfo"); await pg.mouse.move(5, 5);
    const keyH = await pg.evaluate(() => document.getElementById("key").getBoundingClientRect().height);
    ok(key0 === "none" && key1 === "block" && keyH < 40, `R. the legend shows only the status colours (${Math.round(keyH)} px high); the i button opens the rest`);
    await pg.keyboard.press("Escape"); await pg.waitForTimeout(150);
    const d1 = await pg.evaluate(() => ({ s: MC.state(), det: document.getElementById("detail").textContent, cards: document.querySelectorAll(".card.sel").length }));
    ok(d1.s.selected === null && d1.s.spot && !d1.s.spot.on && /NOTHING SELECTED/.test(d1.det) && d1.cards === 0 && d1.s.hq.board.startsWith("MISSION CONTROL"), "R. Esc clears the selection: no spotlight, the detail panel and the board show the city");
    await pg.evaluate(id => document.querySelector(`.card[data-id="${id}"]`).click(), other.id); await pg.waitForTimeout(150);
    const cb = await pg.locator("canvas").boundingBox();
    await pg.mouse.click(cb.x + 60, cb.y + cb.height - 70); await pg.waitForTimeout(200);
    const d2 = await pg.evaluate(() => MC.state());
    await pg.evaluate(() => { const ps = JSON.parse(JSON.stringify(MC.state().projects)); MC.render({ projects: ps, warnings: [] }); });
    const d3 = await pg.evaluate(() => MC.state().selected);
    ok(d2.selected === null && d3 === null, "R. a click on empty ground clears it too, and it stays clear after a refresh");
    await pg.evaluate(id => document.querySelector(`.card[data-id="${id}"]`).click(), sel.id);
    // traffic follows activity
    const traffic = await pg.evaluate(() => { const ps = JSON.parse(JSON.stringify(MC.state().projects)); const out = [];
      ps.forEach(p => p.days = 40); MC.render({ projects: ps, warnings: [] }); out.push(MC.state().street.cars);
      ps.forEach((p, i) => p.days = i < 5 ? 2 : 40); MC.render({ projects: ps, warnings: [] }); out.push(MC.state().street.cars);
      ps.forEach(p => p.days = 0); MC.render({ projects: ps, warnings: [] }); out.push(MC.state().street.cars); return out; });
    ok(traffic[0] === 4 && traffic[1] === 19 && traffic[2] === 48, `R. traffic follows activity: no project moved this week ${traffic[0]} cars, 5 moved ${traffic[1]}, all moved ${traffic[2]} (the most)`);
    // a small city at level 1: plain roads only
    const small = await pg.evaluate(() => { const ps = JSON.parse(JSON.stringify(MC.state().projects)).slice(0, 3); ps.forEach(p => { p.lane = "ready"; p.progress = 10; p.lit = Math.floor(p.floors / 10); }); MC.render({ projects: ps, warnings: [] }); return MC.state(); });
    ok(small.level === 1 && small.street.blocks === 9 && small.street.tier === 1 && small.street.marks === 0 && small.street.neonEdges === 0 && small.hq.floors === 1 && small.hq.tower === 0, `R. level 1: the square and ring 1 (9 blocks), plain roads, a small domed HQ with no tower yet`);
    // monuments: 5, 10 and 25 landed; the rocket launches
    const mon = await pg.evaluate(() => { const base = JSON.parse(JSON.stringify(MC.state().projects)); const out = {};
      const make = n => { const ps = []; for (let k = 0; k < n; k++) { const q = JSON.parse(JSON.stringify(base[k % base.length])); q.id = "m" + k; q.code = "M" + k; q.created = "2026-0" + (1 + k % 9) + "-1" + (k % 10); q.lane = "landed"; q.progress = 100; q.lit = q.floors; ps.push(q); } MC.render({ projects: ps, warnings: [] }); return MC.state(); };
      for (const n of [5, 10, 25]) { const st = make(n); out[n] = st.monuments; out["r" + n] = st.rocket; out["perf" + n] = st.perf; } return out; });
    ok(mon[5].plaza && !mon[5].pad && mon[10].pad && !mon[10].rocket && mon[25].rocket && mon.r25.phase === "idle", "R. monuments: 5 landed a plaza with a statue, 10 a launch pad, 25 a rocket on the pad");
    await pg.evaluate(() => MC.launch()); await pg.waitForTimeout(2600);
    const r1 = await pg.evaluate(() => MC.state().rocket);
    ok(r1.launches === 1 && r1.phase === "launch" && r1.y > mon.r25.y, `R. the rocket launches (height ${r1.y})`);
    await pg.evaluate(() => MC.view(Math.PI / 4 + .5, 1, 18)); await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.join(OUT, "square.png") });
    // a very big city: 61 projects, all XL and landed (level 80+). Budgets still hold
    const big = await pg.evaluate(() => { const base = JSON.parse(JSON.stringify(MC.state().projects)); const ps = [];
      for (let k = 0; k < 61; k++) { const q = JSON.parse(JSON.stringify(base[k % base.length])); q.id = "b" + k; q.code = "B" + k; q.size = "XL"; q.floors = 24; q.created = "2027-01-" + String(1 + k % 28).padStart(2, "0"); q.lane = "landed"; q.progress = 100; q.lit = 24; ps.push(q); }
      MC.render({ projects: ps, warnings: [] }); MC.view(Math.PI / 4, 1, 200); return null; });
    await pg.waitForTimeout(800);
    const sb = await pg.evaluate(() => MC.state());
    // art pass 3: the hero pieces (five landmarks at about 2,000 triangles, 5 train cars at 900, 10 hover cars at 600) add about
    // 20K to this stress city, which was 144K in 2b. The 150K line holds for the real city (33K today) and up to roughly 50 landed XL
    // projects; this case is checked against 175K. See the vault note, art pass 3 status.
    ok(sb.level > 60 && sb.perf.calls < 600 && sb.perf.tris < 175000 && sb.street.onRoad && sb.beyond === 0, `R. a very big city (61 XL landed, level ${sb.level}, ${sb.street.blocks} blocks): ${sb.perf.calls} draw calls, ${Math.round(sb.perf.tris / 1000)}K triangles (under 175K; the 150K line is for the real city)`);
    await pg.screenshot({ path: path.join(OUT, "big-city.png") });
    await ctx.close();
  }
  // S. art pass 3: the Meshy hero pieces. Landmarks per kind on their own blocks, the train, the hover cars, the fallback
  {
    const html = fs.readFileSync(page, "utf-8");
    const m = /const MODELS=(\{.*?\});/.exec(html), names = m ? Object.keys(JSON.parse(m[1])).sort() : [];
    ok(names.join(",") === "arena,data-spire,deco-tower,factory,hovercar,telescope,train" && /THREE\.GLTFLoader\s*=/.test(html), `S. the page carries the seven hero pieces as inline GLB and the GLTF loader (${names.length} pieces, page ${(html.length / 1024).toFixed(0)} KB)`);
    const lk = realPy.stats.landed_kinds, want = {}; for (const k of ["software", "making", "hardware", "career", "athletics"]) want[k] = realPy.projects.filter(p => p.lane === "landed" && p.kind === k).length;
    ok(JSON.stringify(lk) === JSON.stringify(want) && Object.keys(lk).join() === "software,making,hardware,career,athletics", `S. landed per kind in both parsers (parity above): ${JSON.stringify(lk)}`);
    const { ctx, pg } = await open(page);
    await pg.waitForTimeout(500);
    const s = await pg.evaluate(() => MC.state());
    ok(s.hero.ready && s.hero.loaded.length === 7 && s.hero.failed.length === 0 && Object.values(s.hero.tris).every(t => t <= 2100), `S. all seven pieces parsed: ${Object.entries(s.hero.tris).map(([k, v]) => k + " " + v).join(", ")} triangles`);
    const LM = s.landmarks, at = { software: "30.4,0", hardware: "-30.4,0", making: "0,30.4", athletics: "0,-30.4", career: "30.4,15.2" };
    ok(Object.keys(LM).length === 5 && Object.entries(at).every(([k, xz]) => LM[k].open && LM[k].x + "," + LM[k].z === xz && LM[k].ring === 2 && LM[k].block === 9 + Object.keys(at).indexOf(k)),
      `S. five landmark blocks in ring 2 (blocks 9 to 13): ${Object.entries(LM).map(([k, v]) => `${k} ${v.model} at ${v.x},${v.z}`).join("; ")}`);
    ok(Object.entries(LM).every(([k, v]) => v.on === (lk[k] > 0) && v.ghost === !(lk[k] > 0) && v.hero), `S. a landmark is built only when its kind has landed, else a wireframe ghost: built ${Object.keys(LM).filter(k => LM[k].on).join(", ") || "none"}; ghosts ${Object.keys(LM).filter(k => LM[k].ghost).join(", ")}`);
    const li = await pg.evaluate(() => [...document.querySelectorAll("#landmarks li")].map(l => l.className + ":" + l.textContent.trim()));
    ok(li.length === 5 && li.filter(x => x.startsWith("done")).length === Object.keys(lk).filter(k => lk[k] > 0).length && li.every(x => x.startsWith("done") || /land a \w+ project/.test(x)), `S. the unlocks panel lists the five landmarks: ${li.map(x => x.replace(/:/, " ")).join(" · ")}`);
    // landmark blocks are never project lots, and growing the city still moves nothing
    const pl = await pg.evaluate(() => { const out = []; for (let lv = 1; lv <= 40; lv++) out.push(MC.plan(45, lv)); return out; });
    const lmXZ = new Set(Object.values(at).map(x => x.split(",").map(Number)));
    const onLM = p => p.lots.filter(l => { const [x, z] = l.split(",").map(Number); return [...lmXZ].some(([a, b]) => Math.abs(x - a) < 6 && Math.abs(z - b) < 6); }).length;
    ok(pl.every(p => onLM(p) === 0) && pl.every(p => p.lots.join("|") === pl[0].lots.join("|")) && pl[0].lots.slice(0, 21).join("|") === (await pg.evaluate(() => MC.plan(21, 1).lots.join("|"))),
      `S. 45 projects: none takes a landmark block, the same 45 lots at every level, and the first 21 are the lots of today's 21`);
    ok(pl[0].blocks === 18 && pl[9].blocks === 25, `S. 45 projects need ${pl[0].blocks} blocks at level 1 (ring 1, the five landmark blocks skipped, then five more); level 10 opens ${pl[9].blocks}`);
    // the train is the hero piece; at level 9 the hover cars are too
    ok(s.trains.n === 3 && s.trains.hero === 3, `S. the monorail carries ${s.trains.hero} of ${s.trains.n} hero train cars`);
    const full = await pg.evaluate(() => { const ps = JSON.parse(JSON.stringify(MC.state().projects)); ps.forEach(p => { if (p.lane !== "landed") { p.lane = "landed"; p.progress = 100; p.lit = p.floors; } }); MC.render({ projects: ps, warnings: [] }); return MC.state(); });
    ok(full.level >= 9 && full.fliers.n === 10 && full.fliers.hero === 10 && Object.values(full.landmarks).every(v => v.on && !v.ghost) && full.trains.hero === full.trains.n, `S. everything landed (level ${full.level}): all five landmarks built, ${full.fliers.hero} hover cars flying, ${full.trains.hero} train cars`);
    ok(full.perf.calls < 600 && full.perf.tris < 150000 && full.beyond === 0, `S. with every hero piece in: ${full.perf.calls} draw calls, ${Math.round(full.perf.tris / 1000)}K triangles, nothing outside the open blocks`);
    await pg.evaluate(() => MC.view(Math.PI / 4, 1, 60)); await pg.waitForTimeout(400);
    await pg.screenshot({ path: path.join(OUT, "landmarks-all.png") });
    // fallback: a piece that failed to load leaves the drawn look in place, with no errors
    const fb = await pg.evaluate(() => { ["factory", "train", "hovercar"].forEach(n => MC.dropModel(n)); const ps = JSON.parse(JSON.stringify(MC.state().projects)); MC.render({ projects: ps, warnings: [] }); return MC.state(); });
    ok(fb.hero.failed.join() === "factory,train,hovercar" && fb.landmarks.making.on && !fb.landmarks.making.hero && fb.landmarks.athletics.hero && fb.trains.n === full.trains.n && fb.trains.hero === 0 && fb.fliers.n === 10 && fb.fliers.hero === 0,
      `S. fallback: factory, train and hover car dropped: the factory block keeps its sign and a garden, the train and the fliers are the drawn boxes again`);
    const none = await pg.evaluate(() => { ["arena", "data-spire", "deco-tower", "telescope"].forEach(n => MC.dropModel(n)); const ps = JSON.parse(JSON.stringify(MC.state().projects)); MC.render({ projects: ps, warnings: [] }); return MC.state(); });
    ok(none.hero.failed.length === 7 && Object.values(none.landmarks).every(v => v.on && !v.hero && !v.ghost) && none.perf.calls < 600, `S. no model at all: the page still draws (${none.perf.calls} draw calls)`);
    await ctx.close();
  }
  // S. a first landing of a kind builds its landmark on Refresh: it rises in after the landing moment, with a toast
  {
    const { ctx, pg } = await open(page);
    await pg.evaluate(() => { window.__noReload = 1; });
    await stubPicker(pg, realFiles, "robin-personal");
    await pg.click("#connect");
    await waitLive(pg);
    const lk = realPy.stats.landed_kinds, kind = Object.keys(lk).find(k => lk[k] === 0 && realPy.projects.some(p => p.kind === k && p.lane !== "landed"));
    const target = realPy.projects.find(p => p.kind === kind && p.lane !== "landed");
    const before = await pg.evaluate(k => MC.state().landmarks[k], kind);
    await pg.evaluate(([note]) => {
      const parts = (note + ".md").split("/"); let n = FAKE._node; for (const p of parts.slice(0, -1)) n = n.children.get(p);
      const f = n.children.get(parts[parts.length - 1]).file;
      f.bytes = new TextEncoder().encode(new TextDecoder().decode(f.bytes).replace(/^status:.*$/m, "status: completed\ncompleted: 2026-10-12"));
    }, [target.note]);
    await pg.click("#refresh");
    await pg.waitForFunction(() => MC.state().show.landmarks === 1, null, { timeout: 25000 });
    const s = await pg.evaluate(k => { const s = MC.state(); return { lm: s.landmarks[k], landings: s.show.landings, toast: document.getElementById("toast").textContent.replace(/\s+/g, " "), stats: s.stats }; }, kind);
    ok(before && before.ghost && !before.on && s.lm.on && !s.lm.ghost && s.landings === 1 && /LANDMARK BUILT/.test(s.toast) && s.stats.landed_kinds[kind] === 1,
      `S. ${target.code} (${kind}) landed on Refresh: the ${s.lm.name.toLowerCase()} ghost became the built piece after the landing moment; toast "${s.toast}"`);
    await pg.waitForTimeout(1700);
    const risen = await pg.evaluate(k => MC.state().landmarks[k].rise, kind);
    ok(risen > 0.95, `S. the ${s.lm.name.toLowerCase()} has risen in (scale ${risen})`);
    await pg.evaluate(() => MC.view(Math.PI / 4, 1, 60)); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(OUT, "landmark-unlock.png") });
    await ctx.close();
  }
  // R. no 3D drawing while the city is scrolled out of view
  {
    const { ctx, pg } = await open(page);
    await pg.setViewportSize({ width: 1400, height: 600 }); await pg.waitForTimeout(300);
    await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(800);
    const a = await pg.evaluate(() => MC.state().render); await pg.waitForTimeout(500);
    const b = await pg.evaluate(() => MC.state().render);
    await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(800);
    const c = await pg.evaluate(() => MC.state().render); await pg.waitForTimeout(400);
    const d = await pg.evaluate(() => MC.state().render);
    ok(!a.visible && b.skipped > a.skipped && c.visible && d.skipped === c.skipped && d.labelSkips > 0, `R. scrolled away: drawing paused (${b.skipped - a.skipped} frames skipped in 0.5 s); back in view: drawing again. Labels wait while the page scrolls`);
    await ctx.close();
  }
  // R. reduced motion: the rocket stays on the pad
  {
    const c2 = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1400, height: 1000 } });
    const p2 = await c2.newPage(); p2.on("pageerror", e => errors.push("reduced 2b: " + e.message));
    await p2.goto(url(page)); await p2.waitForFunction(() => window.MC && MC.state().towers.length > 0);
    const r = await p2.evaluate(async () => { const base = JSON.parse(JSON.stringify(MC.state().projects)); const ps = [];
      for (let k = 0; k < 25; k++) { const q = JSON.parse(JSON.stringify(base[k % base.length])); q.id = "m" + k; q.code = "M" + k; q.lane = "landed"; q.progress = 100; q.lit = q.floors; ps.push(q); }
      MC.render({ projects: ps, warnings: [] }); MC.launch(); await new Promise(r => setTimeout(r, 1500)); return MC.state().rocket; });
    ok(r.phase === "idle" && r.launches === 0, "R. reduced motion: the rocket does not launch");
    await c2.close();
  }
  ok(errors.length === 0, `no console errors or page errors${errors.length ? ":\n    " + errors.join("\n    ") : ""}`);
  await browser.close();
}

main().then(() => { console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED"); process.exit(failures ? 1 : 0); })
  .catch(e => { console.error(e); process.exit(1); });
