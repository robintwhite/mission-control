/* Mission Control vault parser.
 * A line-for-line port of collect() in build.py, so the page can read the vault itself.
 * Keep the two in step: tests/run_tests.cjs checks them against each other on a real vault.
 * Works in the browser (window.MCParser) and in Node (module.exports).
 * Input: a directory handle (File System Access API) for the vault root, or anything with
 * the same shape: getDirectoryHandle(name), entries(), and getFile() on file handles. */
(function (root) {
  "use strict";
  const LANES = ["ready", "waiting", "blocked", "parked", "landed"];
  const KINDS = ["software", "making", "hardware", "career", "athletics"];
  const SIZES = ["S", "M", "L", "XL"];
  const SIZE_FLOORS = { S: 6, M: 10, L: 16, XL: 24 }; // building height by size (v0.2)
  const STALE_DAYS = 30;
  const XP_PER_LEVEL = 30; // city XP per level. XP = lit floors, plus the building's floors again when it lands
  // progress % of the building's floors, rounded half up. Integer maths, so it matches build.py exactly
  const litFloors = (progress, floors) => Math.floor((2 * progress * floors + 100) / 200);
  function cityStats(projects) {
    let lit = 0, bonus = 0;
    for (const p of projects) { lit += p.lit; if (p.lane === "landed") bonus += p.floors; }
    const xp = lit + bonus;
    return { lit, bonus, xp, level: 1 + Math.floor(xp / XP_PER_LEVEL), per_level: XP_PER_LEVEL };
  }

  // Python's str.isspace() set, so strip() and \s behave the same as in build.py
  const WS = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
  const RE_STRIP = new RegExp("^[" + WS + "]+|[" + WS + "]+$", "g");
  const RE_LSTRIP = new RegExp("^[" + WS + "]+");
  const RE_KEY = new RegExp("^([A-Za-z_][\\p{L}\\p{N}_-]*):[" + WS + "]*([\\s\\S]*)$", "u");
  const RE_TITLE_LEAD = /^[^\p{L}\p{N}_\[]+/u;
  const RE_MOC_END = new RegExp("[" + WS + "]+MOC$");
  const RE_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  const RE_FLOAT = /^[+-]?(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?|\.[0-9](?:_?[0-9])*)(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/;

  const strip = s => s.replace(RE_STRIP, "");
  const lstrip = s => s.replace(RE_LSTRIP, "");
  const splitlines = s => s.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  function stripChars(s, chars) {
    let a = 0, b = s.length;
    while (a < b && chars.includes(s[a])) a++;
    while (b > a && chars.includes(s[b - 1])) b--;
    return s.slice(a, b);
  }
  // Python truthiness and str() for the two value types the parser makes: strings and lists
  const truthy = v => v !== undefined && v !== null && v.length > 0;
  function pyRepr(s) {
    const q = s.includes("'") && !s.includes('"') ? '"' : "'";
    let out = q;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (ch === "\\" || ch === q) out += "\\" + ch;
      else if (ch === "\t") out += "\\t";
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch !== " " && /[\p{C}\p{Z}]/u.test(ch))
        out += c < 0x100 ? "\\x" + c.toString(16).padStart(2, "0") : c < 0x10000 ? "\\u" + c.toString(16).padStart(4, "0") : "\\U" + c.toString(16).padStart(8, "0");
      else out += ch;
    }
    return out + q;
  }
  const pyStr = v => Array.isArray(v) ? "[" + v.map(pyRepr).join(", ") + "]" : String(v);
  // int(float(v)) as Python does it; throws where Python raises
  function pyIntFloat(v) {
    if (typeof v === "number") return Math.trunc(v);
    if (typeof v !== "string") throw new TypeError("not a number");
    const s = strip(v);
    let n;
    if (RE_FLOAT.test(s)) n = Number(s.replace(/_/g, ""));
    else if (/^[+-]?(inf|infinity|nan)$/i.test(s)) n = NaN;
    else throw new TypeError("not a number");
    if (!Number.isFinite(n)) throw new RangeError("not finite");
    return Math.trunc(n);
  }
  // Python sorts strings by code point
  function cmp(a, b) {
    const A = Array.from(a), B = Array.from(b);
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      const x = A[i].codePointAt(0), y = B[i].codePointAt(0);
      if (x !== y) return x < y ? -1 : 1;
    }
    return A.length - B.length;
  }
  // date.fromisoformat for YYYY-MM-DD: day number, or null when not a real date
  function dayNumber(s) {
    const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    if (y < 1) return null;
    const t = new Date(0);
    t.setUTCFullYear(y, m - 1, d);
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return Math.round(t.getTime() / 86400000);
  }
  function localISODate(ms) {
    const d = new Date(ms);
    return d.getFullYear().toString().padStart(4, "0") + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  // urllib.parse.quote(s, safe="")
  const quote = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

  function parseFrontmatter(text) {
    if (!text.startsWith("---")) return [null, text];
    const end = text.indexOf("\n---", 3);
    if (end < 0) return [null, text];
    const fm = text.slice(4, end), body = text.slice(end + 4);
    const out = Object.create(null);
    let key = null;
    for (const line of splitlines(fm)) {
      if (!strip(line)) continue;
      const m = RE_KEY.exec(line);
      if (m) {
        key = m[1];
        let val = strip(m[2]);
        if (val === "") out[key] = []; // may become a `- item` list
        else if (val.startsWith("[") && val.endsWith("]")) out[key] = val.slice(1, -1).split(",").filter(v => strip(v)).map(v => stripChars(strip(v), "\"'"));
        else {
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1).split('\\"').join('"');
          out[key] = val;
        }
      } else if (lstrip(line).startsWith("- ") && key !== null && Array.isArray(out[key])) {
        out[key].push(stripChars(strip(lstrip(line).slice(2)), "\"'"));
      }
    }
    return [out, body];
  }

  function titleOf(body, fallback) {
    for (const line of splitlines(body)) {
      if (line.startsWith("# ")) {
        let t = strip(line.slice(2));
        t = t.replace(RE_TITLE_LEAD, ""); // drop a leading emoji
        t = t.replace(RE_MOC_END, "");
        if (t.startsWith("Project ")) t = t.slice(8);
        return strip(t);
      }
    }
    return fallback;
  }

  const slug = s => stripChars(s.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "-");

  // One note -> a project object, null (not a project, or skipped), plus any warnings
  function parseNote(rel, fn, text, lastModified, today, vaultName, warnings) {
    const [fm, body] = parseFrontmatter(text);
    if (!fm || Object.keys(fm).length === 0 || fm.type !== "project") return null;
    const get = k => fm[k];
    const name = (truthy(get("name")) ? pyStr(get("name")) : "") || titleOf(body, fn.slice(0, -3).replace(RE_MOC_END, ""));
    let status = pyStr(get("status") === undefined ? "" : get("status")).toLowerCase();
    if (status === "complete") status = "completed";
    let lane = pyStr(get("lane") === undefined ? "" : get("lane")).toLowerCase() || (status === "completed" ? "landed" : "");
    if (status === "completed") lane = "landed";
    else if (status === "parked") lane = "parked";
    if (!LANES.includes(lane)) {
      warnings.push(rel + ": lane '" + lane + "' missing or invalid (ready|waiting|blocked|parked|landed); skipped");
      return null;
    }
    let progress;
    try {
      progress = pyIntFloat(get("progress") === undefined ? (lane === "landed" ? 100 : 0) : get("progress"));
    } catch (e) {
      warnings.push(rel + ": progress not a number; using 0");
      progress = 0;
    }
    progress = Math.max(0, Math.min(100, progress)) + 0;
    if (lane === "landed") progress = 100;
    const code = (truthy(get("code")) ? pyStr(get("code")) : "").toUpperCase() || slug(name).slice(0, 3).toUpperCase();
    // `updated` if the note has it, else the note file's last-modified date
    let updated = truthy(get("updated")) ? pyStr(get("updated")) : "";
    if (!updated) updated = localISODate(lastModified);
    if (lane === "landed") updated = truthy(get("completed")) ? pyStr(get("completed")) : updated;
    let stale = 0;
    if (lane !== "landed" && lane !== "parked" && RE_DATE.test(updated)) {
      const dn = dayNumber(updated);
      if (dn === null) warnings.push(rel + ": updated '" + updated + "' is not a real date");
      else {
        const d = dayNumber(today) - dn;
        stale = d > STALE_DAYS ? d : 0;
      }
    }
    // `created` places the building: oldest at the centre, newer ones outward. It never moves after that
    let created = truthy(get("created")) ? pyStr(get("created")) : "";
    if (!created) warnings.push(rel + ": 'created' is empty; placed on the outer edge");
    else if (!RE_DATE.test(created) || dayNumber(created) === null) {
      warnings.push(rel + ": created '" + created + "' is not a date (YYYY-MM-DD); placed on the outer edge");
      created = "";
    }
    const kind = (truthy(get("kind")) ? pyStr(get("kind")) : "").toLowerCase();
    if (!KINDS.includes(kind)) warnings.push(rel + ": kind '" + kind + "' missing or invalid (software|making|hardware|career|athletics)");
    let size = (truthy(get("size")) ? pyStr(get("size")) : "").toUpperCase();
    if (!SIZES.includes(size)) {
      warnings.push(rel + ": size '" + size + "' missing or invalid (S|M|L|XL); using M");
      size = "M";
    }
    for (const k of ["northstar", "next"]) if (lane !== "landed" && !truthy(get(k))) warnings.push(rel + ": '" + k + "' is empty");
    const s = k => truthy(get(k)) ? pyStr(get(k)) : "";
    return {
      id: truthy(get("project")) ? pyStr(get("project")) : slug(name),
      code, name, lane, progress,
      north: s("northstar"), next: s("next"), wait: s("waiting_on"), updated, created,
      completed: s("completed"), stale, area: s("area"), kind, size,
      floors: SIZE_FLOORS[size], lit: litFloors(progress, SIZE_FLOORS[size]), note: rel,
      link: "obsidian://open?vault=" + vaultName + "&file=" + quote(rel),
    };
  }

  async function* walk(dir, prefix) {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === "directory") yield* walk(h, prefix + name + "/");
      else yield [prefix + name, name, h];
    }
  }

  const sortProjects = list => list.sort((a, b) => (LANES.indexOf(a.lane) - LANES.indexOf(b.lane)) || (b.progress - a.progress) || cmp(a.name, b.name) || cmp(a.note, b.note));

  // The vault root handle -> {projects, warnings}. today: "YYYY-MM-DD" in local time.
  async function collectVault(vault, opts) {
    const today = (opts && opts.today) || localISODate(Date.now());
    const vaultName = (opts && opts.vaultName) || "robin-personal";
    const files = [];
    for (const top of ["Projects", "Archive"]) {
      let dir;
      try { dir = await vault.getDirectoryHandle(top); } catch (e) { continue; }
      for await (const [path, fn, h] of walk(dir, top + "/")) if (fn.endsWith(".md")) files.push([path, fn, h]);
    }
    const projects = [], warnings = [];
    const decoder = new TextDecoder("utf-8", { fatal: true }); // strips a BOM, like utf-8-sig
    let i = 0;
    async function worker() {
      while (i < files.length) {
        const [path, fn, h] = files[i++];
        const rel = path.slice(0, -3);
        let text, lastModified;
        try {
          const f = await h.getFile();
          lastModified = f.lastModified;
          text = decoder.decode(await f.arrayBuffer()).replace(/\r\n?/g, "\n"); // Python's universal newlines
        } catch (e) {
          warnings.push(rel + ".md: unreadable, skipped");
          continue;
        }
        const p = parseNote(rel, fn, text, lastModified, today, vaultName, warnings);
        if (p) projects.push(p);
      }
    }
    await Promise.all(Array.from({ length: 16 }, worker));
    return { projects: sortProjects(projects), warnings: warnings.sort(cmp) };
  }

  const api = { collectVault, parseFrontmatter, titleOf, slug, parseNote, localISODate, cityStats, litFloors, LANES, KINDS, SIZES, SIZE_FLOORS, XP_PER_LEVEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MCParser = api;
})(typeof window !== "undefined" ? window : globalThis);
