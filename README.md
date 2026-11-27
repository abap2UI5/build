# distributions

[abap2UI5](https://github.com/abap2UI5/abap2UI5) in its two delivery variants
on `main`, and from them **renamed installations** on delivery branches - each
one an abapGit repository to pull, for a parallel installation next to an
existing abap2UI5 or for a system that installs everything under a registered
namespace.

## Deliveries

| Name | Objects | Standard | Cloud |
|---|---|---|---|
| `ZABAP2UI5` | `zabap2ui5_cl_ui5_client`, ... | [`zabap2ui5-standard`](https://github.com/abap2UI5/distributions/tree/zabap2ui5-standard) | [`zabap2ui5-cloud`](https://github.com/abap2UI5/distributions/tree/zabap2ui5-cloud) |
| `/Z2UI5/` | `/z2ui5/cl_ui5_client`, ... | [`#z2ui5#-standard`](https://github.com/abap2UI5/distributions/tree/%23z2ui5%23-standard) | [`#z2ui5#-cloud`](https://github.com/abap2UI5/distributions/tree/%23z2ui5%23-cloud) |
| `/KRO/` | `/kro/cl_ui5_client`, ... | [`#kro#-standard`](https://github.com/abap2UI5/distributions/tree/%23kro%23-standard) | [`#kro#-cloud`](https://github.com/abap2UI5/distributions/tree/%23kro%23-cloud) |
| `/CA2UI5/` | `/ca2ui5/cl_ui5_client`, ... | [`#ca2ui5#-standard`](https://github.com/abap2UI5/distributions/tree/%23ca2ui5%23-standard) | [`#ca2ui5#-cloud`](https://github.com/abap2UI5/distributions/tree/%23ca2ui5%23-cloud) |

Pull a branch with abapGit; its README has the install steps. `standard` is for
every Standard ABAP system from 7.02, `cloud` for ABAP Cloud.

## main

| Folder | Source | For |
|---|---|---|
| `src/standard` | `src/` of abap2UI5's branch `702` | every Standard ABAP system from 7.02: framework, ICF node, handler |
| `src/cloud` | `src/` of the branch `cloud` | ABAP Cloud: an HTTP service in place of the ICF node |

A delivery needs no new syntax, so the downported sources are the standard
ones: one code line for every on-premise release.

Nothing in `src/` or `upstream/` is edited here - `node build.mjs sync`
replaces it, and `sources.json` names the commits it was taken from.
`upstream/` is what a rename needs of abap2UI5's own tooling (its rename
config, `rename-literal-gate`, `tools/bsp_rename`).

Each folder has its own two lint configurations, pointing at that folder only:

| Folder | abaplint | abap2UI5-linter |
|---|---|---|
| `src/standard` | `abaplint.standard.jsonc` (v702) | `abap2ui5lint.standard.jsonc` |
| `src/cloud` | `abaplint.cloud.jsonc` (Cloud) | `abap2ui5lint.cloud.jsonc` |

```bash
npm ci
npm run lint            # both, or lint:standard / lint:cloud
npm test
```

## How a delivery is built

`deliveries.json` lists the names and the variants; every name is built in
every variant, on the branch `<name>-<variant>` (`#` for the `/` of a
namespace, as abapGit writes it).

A branch holds `.abapgit.xml`, `LICENSE`, a `README.md` with the install
steps, `src/` and the `abaplint.jsonc` it is checked with; the outcome is the
badge of its README.

```bash
node build.mjs deliver zabap2ui5 standard     # src/standard -> out/zabap2ui5-standard
node build.mjs deliver /kro/ cloud            # src/cloud    -> out/#kro#-cloud
```

What a delivery is made of:

1. `src/00`..`src/02`, the framework: `abaplint --rename` with abap2UI5's
   rename config turns every `z2ui5_*` class, interface and table into
   `<prefix>*` and rewrites every reference; abap2UI5's `rename-literal-gate`
   proves no string literal still names an object by its old name. Two kinds
   of literal that gate leaves alone are rewritten here: in the test classes
   every literal naming an abap2UI5 object, and in the start app every class
   name (config class and sample apps are expected under the same prefix).
2. `src/03`, the service package:
   - **standard**: abap2UI5's `tools/bsp_rename` - the ICF node becomes
     `/sap/bc/<name>` (`/sap/bc/<ns>/ui5` for a namespace, with its namespace
     node), and the handler calls the renamed framework. The branch `702`
     comes without the launchpad BSP, and so does a standard delivery.
   - **cloud**: the HTTP service becomes `<NAME>` (`/NS/UI5`), with its
     inbound service, communication scenario and handler. Not carried: the
     SUSH of the HTTP service (its object name is a hash the system derives,
     the system creates it with the service) and `src/03/02`, the launchpad
     integration (IAM app, business catalog), which names that hash and the
     deployed Fiori app of the original.
3. abaplint over the result, with the configuration of its variant.

Rules for a name are abap2UI5's: a customer name has at most 10 characters, a
registered namespace at most 10 with both slashes. A namespace has to exist in
the target system (SE03) before the pull.

`/Z2UI5/` is not a neighbour of the original: its namespace node
`/sap/bc/z2ui5` is the ICF node the original abap2UI5 serves its handler from.
Install one or the other in a system.

## Workflow

[`build`](.github/workflows/build.yaml) runs daily, on a push to `main` and by
hand: it syncs `main` from abap2UI5, lints the two folders and pushes every
delivery branch that changed. On a pull request it lints and builds, and pushes
nothing. To add a delivery, add its name to `deliveries.json`.
