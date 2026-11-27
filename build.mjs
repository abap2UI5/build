#!/usr/bin/env node
// build.mjs - the abap2UI5 sources in their three variants on main, and the
// renamed installations derived from them on delivery branches.
//
//   node build.mjs sync                       src/standard, src/cloud and upstream/ from abap2UI5/abap2UI5
//   node build.mjs deliver zabap2ui5 standard out/zabap2ui5-standard   (branch zabap2ui5-standard)
//   node build.mjs deliver /kro/ cloud        out/#kro#-cloud          (branch #kro#-cloud)
//   node build.mjs matrix                     the deliveries of deliveries.json, as a workflow matrix
//
// main holds:
//   src/standard   src/ of abap2UI5's branch 702    the downported
//                  sources, for every Standard ABAP system from 7.02 - ICF node and handler
//   src/cloud      src/ of the branch cloud         ABAP Cloud, an HTTP
//                  service in place of the node
//   upstream/      what a rename needs of abap2UI5's tooling (its rename
//                  config, rename-literal-gate, tools/bsp_rename), LICENSE and
//                  .abapgit.xml - taken from the branch 702
//   sources.json   the commits all of that was taken from
// Nothing in there is edited here: `sync` replaces it.
//
// deliver <name> <variant> turns src/<variant> into an abapGit repository
// under a new name:
//   1. src/00..02 by `abaplint --rename` with abap2UI5's own rename config
//      (every z2ui5_* class, interface and table and every reference), then
//      abap2UI5's rename-literal-gate over the result
//   2. the literals that gate leaves alone on purpose: in the test classes
//      every literal naming an abap2UI5 object, in the start app every class
//      name (the config class and the sample apps live under the same prefix)
//   3. src/03, the service package: for standard abap2UI5's tools/bsp_rename
//      (ICF nodes, BSP, handler), for cloud the renamer of this file (HTTP
//      service, its communication scenario, handler) - see renameCloudService
//      for what a renamed cloud delivery does not carry
//   4. .abapgit.xml, LICENSE, README.md, abaplint.jsonc and src/ in <out>
//   5. abaplint over <out> with that abaplint.jsonc; the outcome is
//      .badges/abaplint.json, the badge of the branch README. Issues are
//      reported, the result is written anyway (the badge says so)
//
// A name is a customer name (zabap2ui5, at most 10 characters) or a
// registered namespace with both slashes (/kro/, at most 10; #kro# is
// accepted too). The branch is <name>-<variant> with # for /.
//
// Options:
//   --out <dir>           deliver: where the result goes (default: out/<branch>)
//   --abap2ui5 <path>     sync: an existing clone of abap2UI5/abap2UI5 with
//                         origin/702 and origin/cloud fetched,
//                         instead of fetching them into work/
//   --abaplint <path>     the abaplint binary (default: node_modules/.bin/abaplint)
//
// Needs: node >= 22, git, and `npm ci` here.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = "https://github.com/abap2UI5/abap2UI5.git";
const OLD = "z2ui5";
// variant (the folder src/<variant> of main) -> the branch of abap2UI5 its
// content is src/ of: a delivery needs no new syntax, so the downported sources serve
// every Standard ABAP system
export const VARIANTS = { standard: "702", cloud: "cloud" };
// what a rename needs of abap2UI5 besides src/, kept at its own path
const TOOLING = [
  ".github/abaplint/rename.jsonc",
  ".github/scripts/rename-literal-gate.mjs",
  ".github/scripts/lib/walk.mjs",
  "tools/bsp_rename/rename-bsp.mjs",
  "LICENSE",
  ".abapgit.xml",
];
// the repository the branches are pushed to: the badge's url points there
const REPOSITORY = process.env.GITHUB_REPOSITORY || "abap2UI5/distributions";

function fail(message) {
  console.error(`build: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// the names: what z2ui5 becomes everywhere
// ---------------------------------------------------------------------------
export function deriveNames(input) {
  const ns = String(input ?? "").trim().toLowerCase().replace(/#/g, "/");
  if (!ns) throw new Error("a name is needed: a customer name (zabap2ui5) or a namespace with both slashes (/kro/)");
  if (/^[a-z][a-z0-9_]*$/.test(ns)) {
    if (ns === OLD) throw new Error(`'${input}' is the original name - nothing to rename`);
    if (ns.length > 10) throw new Error(`'${ns}' has ${ns.length} characters; a customer name has at most 10`);
    // the "_" is added; tools/bsp_rename reads a "__" prefix as the name with its separator
    if (ns.endsWith("_")) throw new Error(`'${ns}' ends in '_' - give the name without it, the '_' is added`);
    const upper = ns.toUpperCase();
    return {
      kind: "name",
      input: ns,                              // what abap2UI5's tools take
      prefix: `${ns}_`,                       // zabap2ui5_   (object prefix, replaces z2ui5_)
      label: upper,
      branchStem: ns,
      endpoint: `/sap/bc/${ns}`,              // standard: the ICF node of the handler
      bsp: upper,                             // standard: the BSP
      service: upper,                         // cloud: the HTTP service
      // the ICF nodes: the handler's first, then the BSP's two (not on 702)
      nodes: [`/sap/bc/${ns}`, `/sap/bc/ui5_ui5/sap/${ns}`, `/sap/bc/bsp/sap/${ns}`],
      index: `/sap/bc/ui5_ui5/sap/${ns}/index.html`,
      serviceUrl: `/sap/bc/http/sap/${ns}`,
    };
  }
  if (/^\/[a-z0-9][a-z0-9_]*\/$/.test(ns)) {
    if (ns.length > 10) throw new Error(`'${ns}' has ${ns.length} characters; a namespace has at most 10 with both slashes`);
    const bare = ns.slice(1, -1);
    const upper = ns.toUpperCase();
    return {
      kind: "namespace",
      input: ns,
      prefix: ns,                             // /kro/
      label: upper,
      branchStem: `#${bare}#`,
      endpoint: `/sap/bc/${bare}/ui5`,
      bsp: `${upper}UI5`,
      service: `${upper}UI5`,
      bare,
      // each with its namespace node above it, which a system does not have
      nodes: [`/sap/bc/${bare}/ui5`, `/sap/bc/ui5_ui5/${bare}/ui5`, `/sap/bc/bsp/${bare}/ui5`],
      namespaceNodes: [`/sap/bc/${bare}`, `/sap/bc/ui5_ui5/${bare}`, `/sap/bc/bsp/${bare}`],
      index: `/sap/bc/ui5_ui5/${bare}/ui5/index.html`,
      serviceUrl: `/sap/bc/http/${bare}/ui5`,
    };
  }
  throw new Error(`'${input}' is neither a customer name (letter, then letters/digits/_, max. 10) nor a namespace with both slashes (/kro/, max. 10)`);
}

// zabap2ui5-standard, #kro#-cloud
export const branchOf = (N, variant) => `${N.branchStem}-${variant}`;

// the name of an object as abapGit writes it into a file name
const fileStem = (objectName) => objectName.toLowerCase().replace(/\//g, "#");

// deliveries.json -> every name x variant, as the workflow's matrix
export function matrix(config) {
  const out = [];
  for (const name of config.names) {
    const N = deriveNames(name);
    for (const variant of config.variants) {
      if (!(variant in VARIANTS)) throw new Error(`deliveries.json: unknown variant '${variant}'`);
      out.push({ name: N.input, variant, branch: branchOf(N, variant) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) {
    if (opts.quiet) process.stderr.write(r.stdout ?? ""), process.stderr.write(r.stderr ?? "");
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  }
  return r.stdout;
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// the first directory of that name below root, depth first
function findDir(root, name) {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = join(root, e.name);
    if (e.name === name) return p;
    const found = findDir(p, name);
    if (found) return found;
  }
  return null;
}

// abaplint writes <output>/<absolute path of the checkout>/src. Asked by that
// path first: the first folder named src below <output> is a folder of the
// checkout's own path when that path has one (~/src/build), and the result
// would then nest the whole tree one level too deep
export function renamedSrc(output, checkout) {
  const exact = join(output, resolve(checkout), "src");
  if (existsSync(exact)) return exact;
  return findDir(output, "src");
}

// ---------------------------------------------------------------------------
// sync: abap2UI5 -> src/<variant>, upstream/, sources.json
// ---------------------------------------------------------------------------
function sync(o) {
  const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
  let repo;
  const ref = {};
  if (o.abap2ui5) {
    repo = resolve(o.abap2ui5);
    for (const branch of Object.values(VARIANTS)) ref[branch] = `origin/${branch}`;
  } else {
    repo = join(here, "work/abap2UI5");
    rmSync(repo, { recursive: true, force: true });
    mkdirSync(repo, { recursive: true });
    git(repo, "init", "-q");
    for (const branch of Object.values(VARIANTS)) {
      console.log(`fetch ${UPSTREAM} ${branch}`);
      run("git", ["-C", repo, "fetch", "-q", "--depth", "1", UPSTREAM, `refs/heads/${branch}:refs/sync/${branch}`]);
      ref[branch] = `refs/sync/${branch}`;
    }
  }
  // a path of a commit, extracted to <target> (the path's own content, not the path)
  const extract = (commit, path, target) => {
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    const depth = path.split("/").length;
    const tar = execFileSync("git", ["-C", repo, "archive", commit, path], { maxBuffer: 1 << 30 });
    execFileSync("tar", ["-x", "-C", target, `--strip-components=${depth}`], { input: tar });
  };

  // abap2UI5 regenerates both branches on every change of its main, as a new
  // commit also when src/ comes out the same: an entry whose src/ did not
  // change keeps the commit it was first seen at, so nothing downstream moves
  const known = existsSync(join(here, "sources.json")) ? JSON.parse(readFileSync(join(here, "sources.json"), "utf8")).variants ?? {} : {};
  const sources = {};
  for (const [variant, branch] of Object.entries(VARIANTS)) {
    const commit = git(repo, "rev-parse", ref[branch]);
    extract(commit, "src", join(here, "src", variant));
    const tree = git(repo, "rev-parse", `${commit}:src`);
    sources[variant] = known[variant]?.tree === tree && existsSync(join(here, "upstream"))
      ? known[variant]
      : { branch, commit, tree, date: git(repo, "log", "-1", "--format=%cI", commit) };
    console.log(`src/${variant}: abap2UI5 ${branch} ${commit.slice(0, 7)}, ${[...walk(join(here, "src", variant))].length} files`);
  }
  // the tooling comes with the standard sources (the branch is the whole
  // tree of abap2UI5): one commit, one way to rename
  const upstream = join(here, "upstream");
  const tooling = git(repo, "rev-parse", ref[VARIANTS.standard]);
  rmSync(upstream, { recursive: true, force: true });
  for (const file of TOOLING) {
    mkdirSync(dirname(join(upstream, file)), { recursive: true });
    writeFileSync(join(upstream, file), execFileSync("git", ["-C", repo, "show", `${tooling}:${file}`], { maxBuffer: 1 << 28 }));
  }
  writeFileSync(join(here, "sources.json"), `${JSON.stringify({ repository: "abap2UI5/abap2UI5", variants: sources }, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// deliver 1+2: src/00..02
// ---------------------------------------------------------------------------
// a checkout of abap2UI5 as far as its rename tooling needs one: upstream/
// at its own paths and src/<variant> as src/
function stage(variant, work) {
  rmSync(work, { recursive: true, force: true });
  cpSync(join(here, "upstream"), work, { recursive: true });
  cpSync(join(here, "src", variant), join(work, "src"), { recursive: true });
  return work;
}

function renameFramework(N, checkout, abaplint) {
  console.log(`\n== src/00..02: ${OLD}_* -> ${N.prefix}* (abaplint --rename, abap2UI5's rename.jsonc)`);
  const cfgDir = join(checkout, ".github/abaplint");
  const template = readFileSync(join(cfgDir, "rename.jsonc"), "utf8");
  if (!template.includes("znamespace_")) throw new Error("rename.jsonc: placeholder znamespace_ not found - abap2UI5 changed its rename config");
  if (!template.includes('"/src/03/"')) throw new Error("rename.jsonc: src/03 is no longer excluded - abap2UI5 changed its rename config");
  const cfg = join(cfgDir, "rename_run.jsonc");
  writeFileSync(cfg, template.split("znamespace_").join(N.prefix));
  const output = join(cfgDir, "output");
  // the dependency (the released APIs) is cloned by abaplint from the url in
  // the config into the staged checkout
  run(abaplint, [cfg, "--rename"], { cwd: checkout, quiet: true });
  rmSync(cfg);

  const src = renamedSrc(output, checkout);
  if (!src) throw new Error(`no renamed src folder under ${output}`);

  console.log("   literal gate (abap2UI5's rename-literal-gate.mjs --renamed)");
  run("node", [join(checkout, ".github/scripts/rename-literal-gate.mjs"), "--renamed", output], { cwd: checkout, quiet: true });

  const files = [...walk(src)];
  console.log(`   ${files.length} files renamed`);

  // abaplint --rename rewrites references, not string literals; the gate
  // above leaves the test classes alone, whose literals name objects on
  // purpose (rtti checks, expected texts) and would fail on the renamed system
  const objects = objectNames(join(checkout, "src"));
  let changed = 0;
  for (const f of files.filter((f) => f.endsWith(".testclasses.abap"))) {
    const before = readFileSync(f, "utf8");
    const after = renameLiterals(before, objects, N.prefix);
    if (after !== before) writeFileSync(f, after), changed++;
  }
  console.log(`   test literals: ${changed} test class(es) rewritten (${objects.size} object names)`);

  // the start app finds classes that are no object of abap2UI5 by name: the
  // user's config class (z2ui5_cl_config_app) and the sample apps
  // (z2ui5_cl_smp_app_000, ...). Installed next to this one, they carry the
  // prefix as well, so every class name in its literals is renamed
  const start = files.find((f) => basename(f).endsWith("cl_ui5_app_start.clas.abap"));
  if (!start) throw new Error("cl_ui5_app_start.clas.abap not found - abap2UI5 changed its start app");
  writeFileSync(start, renameLiterals(readFileSync(start, "utf8"), null, N.prefix));
  console.log("   start app: config class and sample apps renamed");
  return src;
}

// the z2ui5_* objects of a src folder, lower case, from the file names
// (z2ui5_cl_xyz.clas.abap -> z2ui5_cl_xyz)
export function objectNames(src) {
  const names = new Set();
  for (const f of walk(src)) {
    const name = basename(f).split(".")[0].toLowerCase();
    if (name.startsWith(`${OLD}_`)) names.add(name);
  }
  return names;
}

// every old object name inside a string literal (`...`, '...', |...|) becomes
// the renamed one, in the case it was written in; comments, code and names
// that are no object (z2ui5_cl_does_not_exist, z2ui5_cl_x_event) stay.
// objects null: every name is renamed. A name inside a path or url
// (.../src/z2ui5_cl_x.clas.abap) stays either way
export function renameLiterals(text, objects, prefix) {
  const word = new RegExp(`(?<![A-Za-z0-9_/])${OLD}_[A-Za-z0-9_]+`, "gi");
  const swap = (lit) => lit.replace(word, (m) => {
    if (objects && !objects.has(m.toLowerCase())) return m;
    const renamed = prefix + m.slice(OLD.length + 1);
    return m === m.toUpperCase() ? renamed.toUpperCase() : renamed.toLowerCase();
  });
  return text.split("\n").map((line) => {
    if (line.startsWith("*")) return line;
    let out = "";
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === '"') return out + line.slice(i);
      if (c !== "`" && c !== "'" && c !== "|") { out += c; i++; continue; }
      // a literal up to its closing delimiter: doubled for ` and ', \| in a template
      let j = i + 1;
      for (; j < line.length; j++) {
        if (c === "|" && line[j] === "\\") { j++; continue; }
        if (line[j] === c) {
          if (c !== "|" && line[j + 1] === c) { j++; continue; }
          break;
        }
      }
      out += swap(line.slice(i, j + 1));
      i = j + 1;
    }
    return out;
  }).join("\n");
}

// ---------------------------------------------------------------------------
// deliver 3: src/03, the service package
// ---------------------------------------------------------------------------
// nothing of the original identity may be left in a file name: a file that
// kept it is an object that kept it, and collides with the installation the
// rename exists to sit next to. (#z2ui5#ui5... is the namespace /Z2UI5/, a
// different object.)
function noOriginalFileNames(dir) {
  const kept = [...walk(dir)].filter((p) => /^z2ui5[ ._]/i.test(basename(p)));
  if (kept.length) throw new Error(`still named after the original:\n  ${kept.join("\n  ")}`);
}

// a namespace no object and no url of abap2UI5 holds
const NEUTRAL = "q7x7q";

// every <from> in the contents and file names below dir becomes <to>, in
// the case it stands in; an ICF node's file is named after its name and the
// hash of its url (abapGit: 15 characters of name, 25 of sha1), so that is
// derived again
function spellOut(dir, from, to) {
  const swap = (t) => t.split(from.toUpperCase()).join(to.toUpperCase()).split(from).join(to);
  for (const p of [...walk(dir)]) {
    const text = swap(readFileSync(p, "utf8"));
    let name = swap(basename(p));
    if (name.endsWith(".sicf.xml")) {
      const url = /<URL>([^<]+)<\/URL>/.exec(text)?.[1];
      const node = /<ORIG_NAME>([^<]+)<\/ORIG_NAME>/.exec(text)?.[1];
      if (!url || !node) throw new Error(`${basename(p)}: no URL or ORIG_NAME`);
      name = `${node.padEnd(15, " ")}${createHash("sha1").update(url).digest("hex").slice(0, 25)}.sicf.xml`;
    }
    rmSync(p);
    writeFileSync(join(dirname(p), name), text);
  }
}

// standard and 702: the ICF node, its handler and - standard only - the BSP
// with its two nodes, by abap2UI5's tools/bsp_rename, as its build-rename does
function renameStandardService(N, checkout, target) {
  console.log(`\n== src/03: node ${N.endpoint}, BSP ${N.bsp} (abap2UI5's tools/bsp_rename)`);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(checkout, "src/03"), target, { recursive: true });
  const bspRename = (name, prefix) => run("node", [join(checkout, "tools/bsp_rename/rename-bsp.mjs"), name, "--dir", target, "--backend", prefix, "--yes"], { cwd: checkout, quiet: true });
  if (N.kind === "namespace" && N.bare.includes(OLD)) {
    // bsp_rename writes the namespace into the node urls and then renames
    // the old name in what it wrote: /Z2UI5/ ends up as /sap/bc/ui5/ui5 and
    // without its namespace nodes. Renamed to a neutral namespace first,
    // which is then spelled out - no old name is left for a second look
    bspRename(`/${NEUTRAL}/`, `/${NEUTRAL}/`);
    spellOut(target, NEUTRAL, N.bare);
  } else {
    bspRename(N.input, N.prefix);
    noOriginalFileNames(target);
  }
  // the nodes are the ones this name stands for - all of them on standard,
  // the handler's alone on 702
  const urls = [...walk(target)].filter((p) => p.endsWith(".sicf.xml"))
    .map((p) => /<URL>([^<]+)<\/URL>/.exec(readFileSync(p, "utf8"))?.[1].replace(/\/$/, "")).sort();
  const expected = (bsp) => [...(bsp ? N.nodes : N.nodes.slice(0, 1)), ...(N.namespaceNodes ?? []).slice(0, bsp ? 3 : 1)].sort();
  const hasBsp = [...walk(target)].some((p) => p.endsWith(".wapa.xml"));
  if (urls.join() !== expected(hasBsp).join()) throw new Error(`src/03: the ICF nodes are ${urls.join(", ")} - expected ${expected(hasBsp).join(", ")}`);
  console.log(`   ${urls.length} ICF nodes`);

  const handlers = [...walk(target)].filter((p) => p.endsWith(".clas.abap"));
  if (handlers.length !== 1) throw new Error(`expected one handler class in src/03, found ${handlers.length}`);
  if (!readFileSync(handlers[0], "utf8").toLowerCase().includes(`${N.prefix}cl_ui5_http_handler=>`)) {
    throw new Error(`${basename(handlers[0])} does not call ${N.prefix}cl_ui5_http_handler`);
  }
  console.log(`   handler calls ${N.prefix}cl_ui5_http_handler`);

  // the BSP (not on 702). The endpoint its embed control loads the frontend
  // from is the manifest's data source, which bsp_rename repoints at the
  // renamed node - a frontend reading it from elsewhere would keep /sap/bc/z2ui5
  const manifests = [...walk(target)].filter((p) => p.endsWith(".wapa.manifest.json"));
  if (manifests.length > 1) throw new Error(`expected one manifest page, found ${manifests.length}`);
  for (const file of manifests) {
    const uri = /"uri":\s*"([^"]+)"/.exec(readFileSync(file, "utf8"))?.[1];
    if (uri !== N.endpoint) throw new Error(`${basename(file)}: data source uri is ${uri ?? "missing"}, expected ${N.endpoint}`);
    console.log(`   control endpoint ${N.endpoint} (manifest data source)`);
  }
  // every page of the BSP has its file (<bsp>.wapa.<pagename lower case, / as _->):
  // abapGit stops creating pages at the first one it finds no file for
  for (const xml of [...walk(target)].filter((p) => p.endsWith(".wapa.xml"))) {
    const stem = basename(xml).slice(0, -".xml".length);
    const files = new Set(readdirSync(dirname(xml)));
    const pages = [...readFileSync(xml, "utf8").matchAll(/<PAGENAME>([^<]+)<\/PAGENAME>/g)].map((m) => m[1]);
    for (const page of pages) {
      const file = `${stem}.${page.toLowerCase().replace(/\//g, "_-")}`;
      if (!files.has(file)) throw new Error(`BSP page ${page}: no file ${file} - abapGit would not create it`);
    }
    console.log(`   ${pages.length} pages, each with its file`);
  }
}

// cloud: the HTTP service, its inbound service and communication scenario
// and the handler on if_http_service_extension. abaplint and tools/bsp_rename
// know none of these object types; they are few and carry their names as
// plain values, which are rewritten here.
//
// What a renamed cloud delivery does NOT carry:
//   * the SUSH (the HTTP service's authorization defaults): its object name
//     is a hash the system derives from the service, not a name that could
//     be rewritten. The system creates the entry with the HTTP service
//   * src/03/02, the launchpad integration (IAM app, business catalog and
//     their assignment): the IAM app names that hash and the deployed Fiori
//     app of the cloud branch (Z2UI5_UI5R), neither of which exists renamed
// The result runs as an HTTP service; a launchpad tile for it is set up in
// the system (README of the branch).
export function renameCloudService(N, source, target) {
  console.log(`\n== src/03: HTTP service ${N.service} (cloud)`);
  const handler = `${N.prefix}cl_ui5_icf_handler`.toUpperCase();
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, "01"), { recursive: true });
  cpSync(join(source, "package.devc.xml"), join(target, "package.devc.xml"));

  // file of src/03/01 -> its new name and the values rewritten in it. Every
  // value has to be found: a file abap2UI5 changed stops the run
  const S = N.service;
  const plan = {
    "package.devc.xml": { name: "package.devc.xml", values: [] },
    "z2ui5.http.xml": {
      name: `${fileStem(S)}.http.xml`,
      values: [["<HTTPID>Z2UI5</HTTPID>", `<HTTPID>${S}</HTTPID>`], ["<ID>Z2UI5</ID>", `<ID>${S}</ID>`],
        ["<SERVICEHANDLER>Z2UI5_CL_UI5_ICF_HANDLER</SERVICEHANDLER>", `<SERVICEHANDLER>${handler}</SERVICEHANDLER>`]],
    },
    "z2ui5_http.sco2.xml": {
      name: `${fileStem(S)}_http.sco2.xml`,
      values: [["<IBS_ID>Z2UI5_HTTP</IBS_ID>", `<IBS_ID>${S}_HTTP</IBS_ID>`], ["<NAME>Z2UI5_HTTP</NAME>", `<NAME>${S}_HTTP</NAME>`],
        ["<HTTP_SERVICE_ID>Z2UI5</HTTP_SERVICE_ID>", `<HTTP_SERVICE_ID>${S}</HTTP_SERVICE_ID>`],
        ["HTTP Service Z2UI5</DESCRIPTION>", `HTTP Service ${S}</DESCRIPTION>`]],
    },
    "z2ui5_http_ibs.sia6.xml": {
      name: `${fileStem(S)}_http_ibs.sia6.xml`,
      values: [["<NAME>Z2UI5_HTTP_IBS</NAME>", `<NAME>${S}_HTTP_IBS</NAME>`], ["<APP_ID>Z2UI5_HTTP_IBS</APP_ID>", `<APP_ID>${S}_HTTP_IBS</APP_ID>`],
        ["<SECONDARY_ID>Z2UI5_HTTP</SECONDARY_ID>", `<SECONDARY_ID>${S}_HTTP</SECONDARY_ID>`],
        ["HTTP Service Z2UI5</DESCRIPTION>", `HTTP Service ${S}</DESCRIPTION>`]],
    },
    "z2ui5_cl_ui5_icf_handler.clas.xml": {
      name: `${fileStem(handler)}.clas.xml`,
      values: [["<CLSNAME>Z2UI5_CL_UI5_ICF_HANDLER</CLSNAME>", `<CLSNAME>${handler}</CLSNAME>`],
        ["HTTP Service Z2UI5</DESCRIPT>", `HTTP Service ${S}</DESCRIPT>`]],
    },
    "z2ui5_cl_ui5_icf_handler.clas.abap": {
      name: `${fileStem(handler)}.clas.abap`,
      values: [["z2ui5_cl_ui5_icf_handler", handler.toLowerCase()], ["z2ui5_cl_ui5_http_handler=>", `${N.prefix}cl_ui5_http_handler=>`]],
    },
  };
  const dropped = [];
  for (const file of readdirSync(join(source, "01"))) {
    if (file.endsWith(".sush.xml")) { dropped.push(file); continue; }
    const p = plan[file];
    if (!p) throw new Error(`src/cloud/03/01/${file}: an object this renamer does not know - abap2UI5 changed its cloud service`);
    let text = readFileSync(join(source, "01", file), "utf8");
    for (const [from, to] of p.values) {
      if (!text.includes(from)) throw new Error(`src/cloud/03/01/${file}: ${from} not found - abap2UI5 changed its cloud service`);
      text = text.split(from).join(to);
    }
    // what is left may name the product (abap2UI5), not an object
    const left = /(?<![A-Za-z0-9_/#])z2ui5/i.exec(text);
    if (left) throw new Error(`src/cloud/03/01/${file}: still names ${text.slice(left.index, left.index + 40).split("\n")[0]}`);
    writeFileSync(join(target, "01", p.name), text);
  }
  for (const file of Object.keys(plan)) {
    if (!existsSync(join(source, "01", file))) throw new Error(`src/cloud/03/01/${file} is gone - abap2UI5 changed its cloud service`);
  }
  noOriginalFileNames(target);
  console.log(`   handler ${handler.toLowerCase()} calls ${N.prefix}cl_ui5_http_handler`);
  console.log(`   not carried: ${dropped.join(", ") || "(no SUSH)"}, src/03/02 (launchpad integration)`);
}

// ---------------------------------------------------------------------------
// deliver 4: the result
// ---------------------------------------------------------------------------
function assemble(N, variant, out, src, checkout) {
  console.log(`\n== assemble ${out}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(src, join(out, "src"), { recursive: true });
  cpSync(join(checkout, "LICENSE"), join(out, "LICENSE"));
  // abap2UI5's descriptor; an object it names (a version constant) is renamed with the rest
  const abapgit = readFileSync(join(checkout, ".abapgit.xml"), "utf8");
  writeFileSync(join(out, ".abapgit.xml"), abapgit.replace(/Z2UI5_(?=[A-Z])/g, N.prefix.toUpperCase()));
  writeFileSync(join(out, "abaplint.jsonc"), lintConfig(variant));

  const branch = branchOf(N, variant);
  const source = JSON.parse(readFileSync(join(here, "sources.json"), "utf8")).variants[variant];
  const raw = `https://raw.githubusercontent.com/${REPOSITORY}/${encodeURIComponent(branch)}/.badges/abaplint.json`;
  const badgeUrl = `https://img.shields.io/endpoint?url=${encodeURIComponent(raw)}`;
  const system = { standard: "Standard ABAP from 7.02", cloud: "ABAP Cloud" }[variant];
  const namespace = N.kind === "namespace"
    ? `1. The namespace \`${N.label}\` has to exist in the system (SE03, changeable, with a developer license) and a package of that namespace to pull into.\n`
    : "1. Create a package to pull into.\n";
  const pull = `2. abapGit: New Online, this repository, branch \`${branch}\`, that package, Pull. The packages are named \`<package>_00\` .. \`<package>_03\` and below - abapGit's PREFIX folder logic.\n`;
  // the downported sources come without the BSP: the handler's node is the installation
  const nodes = N.nodes.slice(0, 1);
  const run = variant === "cloud"
    ? `3. Open the URL the HTTP service \`${N.service}\` shows in ADT (\`${N.serviceUrl}\`).

Not part of this branch: the launchpad integration of abap2UI5's \`cloud\` branch
(IAM app, business catalog, the deployed Fiori app). Their names are tied to the
original installation; for a tile, create an IAM app for the HTTP service
\`${N.service}\` and assign it to a business catalog of yours in ADT.
`
    : `3. SICF: activate ${nodes.join(", ")}${N.namespaceNodes ? ` (below the namespace nodes ${N.namespaceNodes.slice(0, nodes.length).join(", ")}, which the pull creates)` : ""}.
4. Open \`${N.endpoint}\`.
`;
  const service = variant === "cloud"
    ? `HTTP service \`${N.service}\`, handler \`${N.prefix}cl_ui5_icf_handler\``
    : `ICF node \`${N.endpoint}\`, handler \`${N.prefix}cl_ui5_icf_handler\``;
  writeFileSync(join(out, "README.md"), `# abap2UI5 as ${N.label} - ${variant}

[![abaplint](${badgeUrl})](https://github.com/${REPOSITORY}/actions/workflows/build.yaml)

[abap2UI5](https://github.com/abap2UI5/abap2UI5) under the name \`${N.label}\`, for ${system}.
Generated by [${REPOSITORY}](https://github.com/${REPOSITORY}) from \`src/${variant}\` of its main branch - do not edit, the build replaces it.

| | |
|---|---|
| source | abap2UI5/abap2UI5@${source.commit} (branch \`${source.branch}\`) |
| \`src/00\` .. \`src/02\` | the framework, every \`z2ui5_*\` object renamed to \`${N.prefix}*\` |
| \`src/03\` | ${service} |

## Install

${namespace}${pull}${run}`);
  console.log(`   ${[...walk(out)].length} files`);
}

// ---------------------------------------------------------------------------
// deliver 5: abaplint on the result
// ---------------------------------------------------------------------------
// the config the result is checked with, on the branch next to src/: the
// main config of the variant (abaplint.<variant>.jsonc), pointed at src/
export function lintConfig(variant) {
  const text = readFileSync(join(here, `abaplint.${variant}.jsonc`), "utf8");
  const cfg = JSON.parse(text.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));
  cfg.global.files = "/src/**/*.*";
  delete cfg.global.noIssues;
  return `${JSON.stringify(cfg, null, 2)}\n`;
}

// the shields.io endpoint of the badge
export function badge(issues) {
  return `${JSON.stringify({
    schemaVersion: 1,
    label: "abaplint",
    message: issues === 0 ? "passing" : `${issues} issue${issues === 1 ? "" : "s"}`,
    color: issues === 0 ? "brightgreen" : "red",
  }, null, 2)}\n`;
}

function lint(out, abaplint) {
  console.log(`\n== abaplint ${out} (its abaplint.jsonc)`);
  const r = spawnSync(abaplint, ["abaplint.jsonc"], { cwd: out, encoding: "utf8", maxBuffer: 1 << 28 });
  // the dependencies are cloned next to the config - not part of the result
  rmSync(join(out, "deps"), { recursive: true, force: true });
  const stdout = r.stdout ?? "";
  const total = /abaplint: (\d+) issue\(s\) found/.exec(stdout);
  if (!total) {
    process.stderr.write(stdout), process.stderr.write(r.stderr ?? "");
    throw new Error(`abaplint did not report a result (${r.status})`);
  }
  const issues = Number(total[1]);
  if (issues > 0) process.stdout.write(stdout.split("\n").filter((l) => l.trim()).join("\n") + "\n");
  mkdirSync(join(out, ".badges"), { recursive: true });
  writeFileSync(join(out, ".badges/abaplint.json"), badge(issues));
  console.log(issues === 0 ? "   no issues" : `   ! ${issues} issue(s) - the result is written, its badge says so`);
  return issues;
}

function deliver(o) {
  const [name, variant] = o.args;
  let N;
  try {
    N = deriveNames(name);
  } catch (e) {
    fail(e.message);
  }
  if (!(variant in VARIANTS)) fail(`the variant is one of ${Object.keys(VARIANTS).join(", ")} - got '${variant ?? ""}'`);
  const abaplint = o.abaplint ? resolve(o.abaplint) : join(here, "node_modules/.bin/abaplint");
  if (!existsSync(abaplint)) fail(`${abaplint} not found - run npm ci here first`);
  if (!existsSync(join(here, "src", variant, "03")) || !existsSync(join(here, "upstream/tools"))) fail(`src/${variant} or upstream/ missing - run: node build.mjs sync`);

  const branch = branchOf(N, variant);
  console.log(`abap2UI5 ${variant} as ${N.label}  (${OLD}_ -> ${N.prefix}, branch ${branch})`);
  const checkout = stage(variant, join(here, "work", `stage-${fileStem(N.label).replace(/#/g, "")}-${variant}`));
  const src = renameFramework(N, checkout, abaplint);
  if (variant === "cloud") renameCloudService(N, join(checkout, "src/03"), join(src, "03"));
  else renameStandardService(N, checkout, join(src, "03"));

  const out = o.out ? resolve(o.out) : join(here, "out", branch);
  assemble(N, variant, out, src, checkout);
  const issues = lint(out, abaplint);
  rmSync(checkout, { recursive: true, force: true });
  console.log(`\n${issues === 0 ? "OK" : `DONE, abaplint: ${issues} issue(s)`}: ${out}  (branch ${branch})`);
  // for the workflow: it pushes the branch either way and fails afterwards on issues
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `branch=${branch}\nout=${out}\nissues=${issues}\n`, { flag: "a" });
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { args: [], out: null, abap2ui5: null, abaplint: null };
  const valued = { "--out": "out", "--abap2ui5": "abap2ui5", "--abaplint": "abaplint" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") o.help = true;
    else if (valued[a]) {
      if (argv[i + 1] === undefined) fail(`${a} needs a value`);
      o[valued[a]] = argv[++i];
    } else if (a.startsWith("-")) fail(`unknown option ${a}`);
    else o.args.push(a);
  }
  o.command = o.args.shift();
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.command) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1).filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
    process.exit(o.help ? 0 : 2);
  }
  if (o.command === "sync") sync(o);
  else if (o.command === "deliver") deliver(o);
  else if (o.command === "matrix") console.log(JSON.stringify(matrix(JSON.parse(readFileSync(join(here, "deliveries.json"), "utf8")))));
  else fail(`unknown command ${o.command} - sync, deliver or matrix`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    fail(e.message);
  }
}
