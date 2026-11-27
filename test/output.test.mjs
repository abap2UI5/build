import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VARIANTS, badge, deriveNames, lintConfig, renameCloudService, renamedSrc } from "../build.mjs";

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

// main: one abaplint and one abap2UI5-linter config per variant, each
// pointing at its folder and at nothing else
test("the lint configs of main point at their folder only", () => {
  for (const variant of Object.keys(VARIANTS)) {
    const abaplint = strip(readFileSync(join(root, `abaplint.${variant}.jsonc`), "utf8"));
    assert.equal(abaplint.global.files, `/src/${variant}/**/*.*`);
    assert.equal(abaplint.syntax.errorNamespace, ".");
    const linter = strip(readFileSync(join(root, `abap2ui5lint.${variant}.jsonc`), "utf8"));
    assert.deepEqual(linter.paths, [`src/${variant}`]);
    assert.ok(linter.ignore.every((p) => p.startsWith(`/src/${variant}/`)));
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

// the cloud service package of main, renamed: every object under the new
// name, nothing of the old one, and without what cannot be renamed
test("the cloud service renamed", { skip: !existsSync(join(root, "src/cloud/03")) }, () => {
  const dir = mkdtempSync(join(tmpdir(), "build-"));
  const log = console.log;
  console.log = () => {};
  try {
    for (const [name, files] of [
      ["/kro/", ["#kro#cl_ui5_icf_handler.clas.abap", "#kro#cl_ui5_icf_handler.clas.xml", "#kro#ui5.http.xml", "#kro#ui5_http.sco2.xml", "#kro#ui5_http_ibs.sia6.xml", "package.devc.xml"]],
      ["zabap2ui5", ["package.devc.xml", "zabap2ui5.http.xml", "zabap2ui5_cl_ui5_icf_handler.clas.abap", "zabap2ui5_cl_ui5_icf_handler.clas.xml", "zabap2ui5_http.sco2.xml", "zabap2ui5_http_ibs.sia6.xml"]],
    ]) {
      const N = deriveNames(name);
      const target = join(dir, N.input.replace(/\//g, ""));
      renameCloudService(N, join(root, "src/cloud/03"), target);
      assert.deepEqual(readdirSync(target).sort(), ["01", "package.devc.xml"]);
      assert.deepEqual(readdirSync(join(target, "01")).sort(), files);
      const http = readFileSync(join(target, "01", files.find((f) => f.endsWith(".http.xml"))), "utf8");
      assert.ok(http.includes(`<HTTPID>${N.service}</HTTPID>`));
      assert.ok(http.includes(`<SERVICEHANDLER>${N.prefix.toUpperCase()}CL_UI5_ICF_HANDLER</SERVICEHANDLER>`));
      const abap = readFileSync(join(target, "01", files.find((f) => f.endsWith(".clas.abap"))), "utf8");
      assert.ok(abap.includes(`${N.prefix}cl_ui5_http_handler=>run(`));
      assert.ok(!/z2ui5/i.test(abap));
    }
  } finally {
    console.log = log;
    rmSync(dir, { recursive: true, force: true });
  }
});
