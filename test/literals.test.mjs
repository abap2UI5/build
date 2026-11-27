import { test } from "node:test";
import assert from "node:assert/strict";
import { renameLiterals } from "../build.mjs";

const objects = new Set(["z2ui5_cl_ui5_app_hi_world", "z2ui5_if_app", "z2ui5_cx_ui5_util_error"]);

test("object names in literals, in their case", () => {
  assert.equal(
    renameLiterals("    x( class = `Z2UI5_CL_UI5_APP_HI_WORLD` intf = 'z2ui5_if_app' ).", objects, "/kro/"),
    "    x( class = `/KRO/CL_UI5_APP_HI_WORLD` intf = '/kro/if_app' ).");
  assert.equal(renameLiterals("    t = |[1] Z2UI5_CX_UI5_UTIL_ERROR { a }|.", objects, "zkro_"), "    t = |[1] ZKRO_CX_UI5_UTIL_ERROR { a }|.");
});

test("names that are no object, comments and code stay", () => {
  for (const line of [
    "    x = `Z2UI5_CL_APP_DOES_NOT_EXIST`.",
    "    x = `z2ui5_if_app_event`.",
    "* z2ui5_if_app in a comment",
    "    x = 1. \" z2ui5_if_app",
    "    x = `a `` z2ui5_test`.",
  ]) assert.equal(renameLiterals(line, objects, "/kro/"), line);
});

test("escaped delimiters keep the literal open", () => {
  assert.equal(renameLiterals("    x = `a `` Z2UI5_IF_APP`.", objects, "/kro/"), "    x = `a `` /KRO/IF_APP`.");
  assert.equal(renameLiterals("    x = |a \\| Z2UI5_IF_APP|.", objects, "/kro/"), "    x = |a \\| /KRO/IF_APP|.");
});

test("without an object list every name is renamed, urls stay", () => {
  assert.equal(renameLiterals("    c = `Z2UI5_CL_CONFIG_APP`. x = `z2ui5_cl_smp_app_000`.", null, "/kro/"), "    c = `/KRO/CL_CONFIG_APP`. x = `/kro/cl_smp_app_000`.");
  const url = "    h = `https://github.com/abap2UI5/abap2UI5/blob/main/src/01/04/z2ui5_cl_ui5_app_hi_world.clas.abap`.";
  assert.equal(renameLiterals(url, null, "/kro/"), url);
});
