/* A stand-in for a File System Access directory handle, built from a list of files.
 * Used by the tests in Node and, injected, in the browser (where the folder picker cannot be automated).
 * files: [{path: "Projects/X/Y.md", bytes: Uint8Array, lastModified: ms}], or {path: "X/Y", dir: true} for a folder alone */
(function (root) {
  function makeVault(name, files) {
    const rootDir = { kind: "directory", name, children: new Map() };
    for (const f of files) {
      const parts = f.path.split("/");
      let d = rootDir;
      for (const p of (f.dir ? parts : parts.slice(0, -1))) {
        if (!d.children.has(p)) d.children.set(p, { kind: "directory", name: p, children: new Map() });
        d = d.children.get(p);
      }
      if (f.dir) continue;
      const fn = parts[parts.length - 1];
      d.children.set(fn, { kind: "file", name: fn, file: f });
    }
    const wrap = node => node.kind === "directory" ? {
      kind: "directory", name: node.name, _node: node,
      async getDirectoryHandle(n) { const c = node.children.get(n); if (!c || c.kind !== "directory") { const e = new Error("not found"); e.name = c ? "TypeMismatchError" : "NotFoundError"; throw e; } return wrap(c); },
      async getFileHandle(n) { const c = node.children.get(n); if (!c || c.kind !== "file") { const e = new Error("not found"); e.name = c ? "TypeMismatchError" : "NotFoundError"; throw e; } return wrap(c); },
      async *entries() { for (const [n, c] of node.children) yield [n, wrap(c)]; },
      perm: "granted",
      async queryPermission() { return this.perm; },
      async requestPermission() { this.perm = "granted"; return "granted"; },
    } : {
      kind: "file", name: node.name,
      async getFile() { return new File([node.file.bytes], node.name, { lastModified: node.file.lastModified }); },
    };
    return wrap(rootDir);
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { makeVault };
  else root.makeFakeVault = makeVault;
})(typeof window !== "undefined" ? window : globalThis);
