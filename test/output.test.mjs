import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VARIANTS, badge, cloudServicePatterns, deriveNames, lintConfig, outRefusal, renameCloudService, renameConfig, renamedSrc, rootRenameConfig } from "../build.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const strip = (text) => JSON.parse(text.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));

// abaplint --rename writes <output>/<absolute path of the checkout>/src; a
// checkout whose own path has a folder named src (~/src/build) must not be
// taken for it
test("the renamed src of a checkout below a folder named src", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-"));
  try {
    const checkout = join(dir, "src", "build");
    const output = join(dir, "output");
    const expected = join(output, checkout, "src");
    mkdirSync(join(expected, "00"), { recursive: true });
    assert.equal(renamedSrc(output, checkout), expected);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// from a run config at the checkout's root, every abaplint writes
// <output>/src - asked for before the absolute layout of older runs
test("the renamed src of a run config at the root", () => {
  const dir = mkdtempSync(join(tmpdir(), "build-"));
  try {
    const checkout = join(dir, "src", "build");
    const output = join(checkout, ".github/abaplint/output");
    mkdirSync(join(output, checkout, "src"), { recursive: true });
    mkdirSync(join(output, "src", "00"), { recursive: true });
    assert.equal(renamedSrc(output, checkout), join(output, "src"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// abap2UI5's rename.jsonc, written for .github/abaplint, rebased onto the
// root: abaplint 2.120.122 writes the output relative to the config's folder
test("abap2UI5's rename config, run from the root", () => {
  const cfg = rootRenameConfig({
    global: { files: "/../../src/**/*.*", exclude: ["/src/03/"] },
    dependencies: [{ url: "https://github.com/abapedia/x", folder: "/../../node/deps/x", files: "/src/**/*.*" }],
    rename: { output: "output", patterns: [{ type: "CLAS", oldName: "^z2ui5_(.*)$", newName: "zabc_$1" }] },
  });
  assert.equal(cfg.global.files, "/src/**/*.*");
  assert.deepEqual(cfg.global.exclude, ["/src/03/"]);
  assert.equal(cfg.dependencies[0].folder, "/node/deps/x");
  assert.equal(cfg.dependencies[0].files, "/src/**/*.*");
  assert.equal(cfg.rename.output, ".github/abaplint/output");
  assert.equal(cfg.rename.patterns[0].newName, "zabc_$1");
  assert.throws(() => rootRenameConfig({ global: { files: "/../../../x/**" } }), /outside the checkout/);
});

// --out is deleted first: never the repository, above it, or what it reads
test("--out refuses this repository and what the build reads", () => {
  for (const out of [".", "..", "/", "src", "src/standard", "upstream", ".git"]) {
    assert.ok(outRefusal(resolve(root, out), root), out);
  }
  for (const out of ["out/zabc-standard", "../elsewhere", join(tmpdir(), "delivery")]) {
    assert.equal(outRefusal(resolve(root, out), root), undefined, out);
  }
});

// main: one abaplint and one abap2UI5-linter config per folder, each
// pointing at its folder and at nothing else
test("the lint configs of main point at their folder only", () => {
  for (const variant of Object.keys(VARIANTS)) {
    const abaplint = strip(readFileSync(join(root, `abaplint.${variant}.jsonc`), "utf8"));
    assert.equal(abaplint.global.files, `/src/${variant}/**/*.*`);
    assert.equal(abaplint.syntax.errorNamespace, ".");
    const linter = strip(readFileSync(join(root, `abap2ui5lint.${variant}.jsonc`), "utf8"));
    assert.deepEqual(linter.paths, [`src/${variant}`]);
    assert.ok(linter.ignore.every((p) => p.startsWith(`/src/${variant}/01/`)));
  }
});

// a delivery branch: the config of its variant, pointed at src/
test("the lint config of a delivery", () => {
  for (const variant of Object.keys(VARIANTS)) {
    const cfg = JSON.parse(lintConfig(variant));
    assert.equal(cfg.global.files, "/src/**/*.*");
    assert.deepEqual(cfg.rules, strip(readFileSync(join(root, `abaplint.${variant}.jsonc`), "utf8")).rules);
  }
});

test("the badge", () => {
  assert.deepEqual(JSON.parse(badge(0)), { schemaVersion: 1, label: "abaplint", message: "passing", color: "brightgreen" });
  assert.equal(JSON.parse(badge(1)).message, "1 issue");
  assert.equal(JSON.parse(badge(3)).message, "3 issues");
  assert.equal(JSON.parse(badge(3)).color, "red");
});

// the rename config of a variant: for cloud the service package comes
// along, but neither its SUSH nor the launchpad integration (03/02); the
// patterns of the cloud service go first, abaplint takes the first match
test("the rename config per variant", { skip: !existsSync(join(root, "upstream/.github/abaplint/rename.jsonc")) }, () => {
  const template = readFileSync(join(root, "upstream/.github/abaplint/rename.jsonc"), "utf8");
  const N = deriveNames("/kro/");
  const standard = renameConfig(template, N, "standard");
  assert.ok(standard.global.exclude.includes("/src/03/"));
  assert.deepEqual(standard.rules, { parser_error: true });
  const cloud = renameConfig(template, N, "cloud");
  assert.ok(!cloud.global.exclude.includes("/src/03/"));
  assert.ok(cloud.global.exclude.includes("/src/03/02/"));
  assert.ok(cloud.global.exclude.some((e) => new RegExp(e, "i").test("/x/src/03/01/1782d97775fb5801cef397bb74b1dcht.sush.xml")));
  assert.deepEqual(cloud.rename.patterns.slice(0, 3), cloudServicePatterns(N));
  assert.deepEqual(cloudServicePatterns(N).map((p) => p.newName), ["/KRO/UI5", "/KRO/UI5_HTTP", "/KRO/UI5_HTTP_IBS"]);
});

// the cloud service package of main, renamed by abaplint as deliver does it
// (the framework stands in as the one class the handler calls) and checked:
// every object under the new name, nothing of the old one, and without what
// cannot be renamed
const abaplint = join(root, "node_modules/.bin/abaplint");
test("the cloud service renamed", { skip: !existsSync(join(root, "src/cloud/01/03")) || !existsSync(abaplint) }, () => {
  const dir = mkdtempSync(join(tmpdir(), "build-"));
  const log = console.log;
  console.log = () => {};
  try {
    for (const [name, files] of [
      ["/kro/", ["#kro#cl_ui5_icf_handler.clas.abap", "#kro#cl_ui5_icf_handler.clas.xml", "#kro#ui5.http.xml", "#kro#ui5_http.sco2.xml", "#kro#ui5_http_ibs.sia6.xml", "package.devc.xml"]],
      ["zabap2ui5", ["package.devc.xml", "zabap2ui5.http.xml", "zabap2ui5_cl_ui5_icf_handler.clas.abap", "zabap2ui5_cl_ui5_icf_handler.clas.xml", "zabap2ui5_http.sco2.xml", "zabap2ui5_http_ibs.sia6.xml"]],
    ]) {
      const N = deriveNames(name);
      const checkout = join(dir, N.input.replace(/\//g, ""));
      cpSync(join(root, "src/cloud/01/03"), join(checkout, "src/03"), { recursive: true });
      mkdirSync(join(checkout, "src/02"), { recursive: true });
      writeFileSync(join(checkout, "src/02/z2ui5_cl_ui5_http_handler.clas.abap"),
        "CLASS z2ui5_cl_ui5_http_handler DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    CLASS-METHODS run IMPORTING server TYPE REF TO object.\nENDCLASS.\n\nCLASS z2ui5_cl_ui5_http_handler IMPLEMENTATION.\n  METHOD run.\n  ENDMETHOD.\nENDCLASS.\n");
      writeFileSync(join(checkout, "src/02/z2ui5_cl_ui5_http_handler.clas.xml"), readFileSync(join(checkout, "src/03/01/z2ui5_cl_ui5_icf_handler.clas.xml"), "utf8").replace("Z2UI5_CL_UI5_ICF_HANDLER", "Z2UI5_CL_UI5_HTTP_HANDLER"));
      const template = JSON.stringify({ global: { files: "/../../src/**/*.*", exclude: ["/src/03/"] }, rename: { output: "output", patterns: [{ type: "CLAS|INTF|TABL", oldName: "^z2ui5_(.*)$", newName: "znamespace_$1" }] }, syntax: { version: "Cloud", errorNamespace: "." }, rules: {} });
      writeFileSync(join(checkout, "rename_run.json"), JSON.stringify(renameConfig(template, N, "cloud")));
      execFileSync(abaplint, ["rename_run.json", "--rename"], { cwd: checkout, stdio: "pipe" });
      const target = join(renamedSrc(join(checkout, ".github/abaplint/output"), checkout), "03");
      renameCloudService(N, target);
      assert.deepEqual(readdirSync(target).sort(), ["01", "package.devc.xml"]);
      assert.deepEqual(readdirSync(join(target, "01")).sort(), files);
      const http = readFileSync(join(target, "01", files.find((f) => f.endsWith(".http.xml"))), "utf8");
      assert.ok(http.includes(`<HTTPID>${N.service}</HTTPID>`));
      assert.ok(http.includes(`<SERVICEHANDLER>${N.prefix.toUpperCase()}CL_UI5_ICF_HANDLER</SERVICEHANDLER>`));
      const sco2 = readFileSync(join(target, "01", files.find((f) => f.endsWith(".sco2.xml"))), "utf8");
      assert.ok(sco2.includes(`<DESCRIPTION> HTTP Service ${N.service}</DESCRIPTION>`));
      const abap = readFileSync(join(target, "01", files.find((f) => f.endsWith(".clas.abap"))), "utf8");
      assert.ok(abap.includes(`${N.prefix}cl_ui5_http_handler=>run(`));
      assert.ok(!/z2ui5/i.test(abap));
    }
  } finally {
    console.log = log;
    rmSync(dir, { recursive: true, force: true });
  }
});
