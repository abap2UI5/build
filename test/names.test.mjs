import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { branchOf, deriveNames, matrix } from "../build.mjs";

test("a customer name", () => {
  const n = deriveNames("ZABAP2UI5");
  assert.equal(n.prefix, "zabap2ui5_");
  assert.equal(n.input, "zabap2ui5");
  assert.equal(n.bsp, "ZABAP2UI5");
  assert.equal(n.service, "ZABAP2UI5");
  assert.equal(n.endpoint, "/sap/bc/zabap2ui5");
  assert.equal(branchOf(n, "standard"), "zabap2ui5-standard");
  assert.equal(branchOf(n, "cloud"), "zabap2ui5-cloud");
});

test("a registered namespace, in every spelling", () => {
  for (const input of ["/kro/", "/KRO/", "#kro#"]) {
    const n = deriveNames(input);
    assert.equal(n.prefix, "/kro/");
    assert.equal(n.input, "/kro/");
    assert.equal(n.bsp, "/KRO/UI5");
    assert.equal(n.service, "/KRO/UI5");
    assert.equal(n.endpoint, "/sap/bc/kro/ui5");
    assert.deepEqual(n.namespaceNodes, ["/sap/bc/kro", "/sap/bc/ui5_ui5/kro", "/sap/bc/bsp/kro"]);
    assert.equal(branchOf(n, "standard"), "#kro#-standard");
  }
});

test("the namespace /Z2UI5/ is a name of its own", () => {
  const n = deriveNames("#z2ui5#");
  assert.equal(n.prefix, "/z2ui5/");
  assert.equal(branchOf(n, "cloud"), "#z2ui5#-cloud");
});

test("refused names", () => {
  assert.throws(() => deriveNames("z2ui5"), /original name/);
  assert.throws(() => deriveNames("zabap2ui5zz"), /at most 10/);
  assert.throws(() => deriveNames("/abap2ui5x/"), /at most 10/);
  assert.throws(() => deriveNames("zmyui5_"), /ends in/);
  assert.throws(() => deriveNames("/abap2ui5"), /neither/);
  assert.throws(() => deriveNames("2abap"), /neither/);
  assert.throws(() => deriveNames(""), /needed/);
});

test("the deliveries: every name in every variant, one branch each", () => {
  const m = matrix({ names: ["zabap2ui5", "/kro/"], variants: ["standard", "cloud"] });
  assert.deepEqual(m.map((d) => d.branch), ["zabap2ui5-standard", "zabap2ui5-cloud", "#kro#-standard", "#kro#-cloud"]);
  assert.throws(() => matrix({ names: ["zabap2ui5"], variants: ["onprem"] }), /unknown variant/);
});

test("deliveries.json holds valid names and no branch twice", () => {
  const m = matrix(JSON.parse(readFileSync(new URL("../deliveries.json", import.meta.url), "utf8")));
  assert.equal(new Set(m.map((d) => d.branch)).size, m.length);
});
