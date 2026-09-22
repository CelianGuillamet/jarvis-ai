# JAR-009 — Dependency security review

Reviewed 22 September 2026 against the npm registry. The owner explicitly authorized this scan in the execution task after disclosure of dependency names and versions to registry.npmjs.org was explained. No purchase, paid provider call or deployment was performed.

## Result

| Application | Before (affected packages) | After |
| --- | --- | --- |
| API | 42: 1 critical, 22 high, 17 moderate, 2 low | 0 |
| Web | 7: 5 high, 1 moderate, 1 low | 0 |

Counts include transitive/metavulnerability records; they are not counts of unique advisories or proven exploitable application paths. Both development and production dependencies were included. Every reported item is resolved in the updated lockfiles; no vulnerability risk exception was taken. Registry results are a point-in-time check, not proof that the application has no security defects.

## Reproduction and evidence

From each application directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm audit --package-lock-only --json --registry=https://registry.npmjs.org
```

The `jar-009-{api,web}-audit.json` files preserve the baseline; `jar-009-{api,web}-audit-after.json` preserve the clean result. Initial scans exited 1 for vulnerabilities; final scans exited 0. Compatible updates used `npm audit fix --package-lock-only --ignore-scripts` without `--force`; brace-expansion was refreshed separately within its existing ranges.

## Scoped overrides

| Parent → dependency | Pin | Reason and compatibility evidence |
| --- | --- | --- |
| @nestjs/platform-express → multer | 2.4.0 | Parent pins affected 2.2.0. Same-major fix for multipart denial of service, file-descriptor leak and size-limit bypass. Nest HTTP integration and full API suite pass. |
| prisma → mysql2 | 3.24.4 | Parent pins affected 3.15.3. Same-major fix for authentication downgrade and decompression denial of service. Application uses PostgreSQL; MySQL connections are not exercised. Prisma generation and all PostgreSQL migrations pass. |
| @prisma/config → deepmerge-ts | 8.0.2 | Parent pins affected 7.1.5; recursive-input stack exhaustion requires version 8. Prisma imports only deepmerge as the c12 configuration merger. Our configuration contains plain records and strings, not Maps; it does not use deepmergeInto or renamed TypeScript helper types. Config loading, generation and migration deployment pass. |

The deepmerge-ts major change is intentionally isolated to @prisma/config. Reviewed [upstream v8 release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0): Map merge behavior, deepmergeInto mutation behavior and helper-type names change. Reassess this override if configuration adds Maps or Prisma changes its merger integration. Remove each override when its parent selects a fixed dependency itself; rerun audit and the full relevant checks. No direct dependency major version was forced or downgraded.

## Verification

- Clean installs in both applications succeeded with lifecycle scripts disabled; Prisma client generation was run explicitly.
- API typecheck, zero-warning lint, build, 154 unit tests, four fixture-runner tests and five integration tests passed.
- Integration applied all 12 migrations to disposable loopback PostgreSQL and removed the database container. Google and other external transports use fakes/guards.
- Web typecheck, zero-warning lint, nine rendering/security tests and production build passed.
- Lockfile/package review and git diff --check passed. GitHub required checks must pass before merge.
- Live Google, MySQL server behavior and deployment were not tested.

## Advisory disposition

Every baseline affected package is listed below, including records inherited from another vulnerable package. Advisory links and exact ranges are retained in the baseline JSON. Versions are the resolved copies in each lockfile.

### API

| Package | Severity | Before → after | Advisory / inherited cause | Disposition |
| --- | --- | --- | --- | --- |
| @angular-devkit/core | moderate | 19.2.17, 19.2.19 → 19.2.24, 19.2.27 | ajv, picomatch | Fixed; absent from final audit |
| @angular-devkit/schematics | moderate | 19.2.17, 19.2.19 → 19.2.24, 19.2.27 | @angular-devkit/core | Fixed; absent from final audit |
| @angular-devkit/schematics-cli | moderate | 19.2.19 → 19.2.27 | @angular-devkit/core, @angular-devkit/schematics | Fixed; absent from final audit |
| @babel/core | low | 7.29.0 → 7.29.7 | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | Fixed; absent from final audit |
| @chevrotain/cst-dts-gen | moderate | 10.5.0 → removed | @chevrotain/gast, lodash | Fixed; absent from final audit |
| @chevrotain/gast | moderate | 10.5.0 → removed | lodash | Fixed; absent from final audit |
| @hono/node-server | high | 1.19.9 → removed | [GHSA-wc8c-qw6v-h7f6](https://github.com/advisories/GHSA-wc8c-qw6v-h7f6), [GHSA-92pp-h63x-v22m](https://github.com/advisories/GHSA-92pp-h63x-v22m), [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9) | Fixed; absent from final audit |
| @humanfs/node | moderate | 0.16.7 → 0.16.8 | [GHSA-p498-v437-472g](https://github.com/advisories/GHSA-p498-v437-472g) | Fixed; absent from final audit |
| @mrleebo/prisma-ast | moderate | 0.13.1 → removed | chevrotain | Fixed; absent from final audit |
| @nestjs/cli | moderate | 11.0.16 → 11.0.24 | @angular-devkit/core, @angular-devkit/schematics, @angular-devkit/schematics-cli | Fixed; absent from final audit |
| @nestjs/common | moderate | 11.1.15 → 11.2.5 | file-type | Fixed; absent from final audit |
| @nestjs/config | high | 4.0.3 → 4.0.4 | lodash | Fixed; absent from final audit |
| @nestjs/core | high | 11.1.15 → 11.2.5 | [GHSA-36xv-jgw5-4q75](https://github.com/advisories/GHSA-36xv-jgw5-4q75), path-to-regexp | Fixed; absent from final audit |
| @nestjs/platform-express | high | 11.1.15 → 11.2.5 | multer, path-to-regexp | Fixed; absent from final audit |
| @nestjs/schematics | moderate | 11.0.9 → 11.1.0 | @angular-devkit/core, @angular-devkit/schematics | Fixed; absent from final audit |
| @prisma/config | high | 7.4.2 → 7.10.0 | deepmerge-ts, effect | Fixed; absent from final audit |
| @prisma/dev | high | 0.20.0 → 0.24.17 | @hono/node-server, @mrleebo/prisma-ast, hono, valibot | Fixed; absent from final audit |
| ajv | moderate | 6.14.0, 8.17.1, 8.18.0 → 6.14.0, 8.18.0, 8.20.0 | [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) | Fixed; absent from final audit |
| baseline-browser-mapping | moderate | 2.10.0 → 2.11.25 | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | Fixed; absent from final audit |
| body-parser | low | 2.2.2 → 2.3.0 | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) | Fixed; absent from final audit |
| brace-expansion | high | 1.1.12, 2.0.2, 5.0.4 → 1.1.21, 2.1.7, 5.0.12 | [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v), [GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2), [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | Fixed; absent from final audit |
| browserslist | high | 4.28.1 → 4.29.0 | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | Fixed; absent from final audit |
| chevrotain | moderate | 10.5.0 → removed | @chevrotain/cst-dts-gen, @chevrotain/gast, lodash | Fixed; absent from final audit |
| deepmerge-ts | high | 7.1.5 → 8.0.2 | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | Fixed; absent from final audit |
| defu | high | 6.1.4 → 6.1.7 | [GHSA-737v-mqg7-c878](https://github.com/advisories/GHSA-737v-mqg7-c878) | Fixed; absent from final audit |
| effect | high | 3.18.4 → 3.20.0 | [GHSA-38f7-945m-qr2g](https://github.com/advisories/GHSA-38f7-945m-qr2g) | Fixed; absent from final audit |
| fast-uri | high | 3.1.0 → 3.1.8 | [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx), [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7), [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6), [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc), [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc), [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp), [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6) | Fixed; absent from final audit |
| file-type | moderate | 21.3.0 → 21.3.4 | [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473), [GHSA-j47w-4g3g-c36v](https://github.com/advisories/GHSA-j47w-4g3g-c36v) | Fixed; absent from final audit |
| flatted | high | 3.3.4 → 3.4.4 | [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f), [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) | Fixed; absent from final audit |
| form-data | high | 4.0.5 → 4.0.6 | [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | Fixed; absent from final audit |
| handlebars | critical | 4.7.8 → 4.7.9 | [GHSA-3mfm-83xf-c92r](https://github.com/advisories/GHSA-3mfm-83xf-c92r), [GHSA-2w6w-674q-4c4q](https://github.com/advisories/GHSA-2w6w-674q-4c4q), [GHSA-2qvq-rjwj-gvw9](https://github.com/advisories/GHSA-2qvq-rjwj-gvw9), [GHSA-7rx3-28cr-v5wh](https://github.com/advisories/GHSA-7rx3-28cr-v5wh), [GHSA-442j-39wm-28r2](https://github.com/advisories/GHSA-442j-39wm-28r2), [GHSA-xhpv-hc6g-r9c6](https://github.com/advisories/GHSA-xhpv-hc6g-r9c6), [GHSA-9cx6-37pm-9jff](https://github.com/advisories/GHSA-9cx6-37pm-9jff), [GHSA-xjpj-3mr7-gcpf](https://github.com/advisories/GHSA-xjpj-3mr7-gcpf) | Fixed; absent from final audit |
| hono | high | 4.11.4 → removed | [GHSA-9r54-q6cx-xmh5](https://github.com/advisories/GHSA-9r54-q6cx-xmh5), [GHSA-6wqw-2p9w-4vw4](https://github.com/advisories/GHSA-6wqw-2p9w-4vw4), [GHSA-r354-f388-2fhh](https://github.com/advisories/GHSA-r354-f388-2fhh), [GHSA-w332-q679-j88p](https://github.com/advisories/GHSA-w332-q679-j88p), [GHSA-gq3j-xvxp-8hrf](https://github.com/advisories/GHSA-gq3j-xvxp-8hrf), [GHSA-5pq2-9x2x-5p6w](https://github.com/advisories/GHSA-5pq2-9x2x-5p6w), [GHSA-p6xx-57qc-3wxr](https://github.com/advisories/GHSA-p6xx-57qc-3wxr), [GHSA-q5qw-h33p-qvwr](https://github.com/advisories/GHSA-q5qw-h33p-qvwr), [GHSA-v8w9-8mx6-g223](https://github.com/advisories/GHSA-v8w9-8mx6-g223), [GHSA-26pp-8wgv-hjvm](https://github.com/advisories/GHSA-26pp-8wgv-hjvm), [GHSA-r5rp-j6wh-rvv4](https://github.com/advisories/GHSA-r5rp-j6wh-rvv4), [GHSA-xf4j-xp2r-rqqx](https://github.com/advisories/GHSA-xf4j-xp2r-rqqx), [GHSA-wmmm-f939-6g9c](https://github.com/advisories/GHSA-wmmm-f939-6g9c), [GHSA-xpcf-pg52-r92g](https://github.com/advisories/GHSA-xpcf-pg52-r92g), [GHSA-qp7p-654g-cw7p](https://github.com/advisories/GHSA-qp7p-654g-cw7p), [GHSA-hm8q-7f3q-5f36](https://github.com/advisories/GHSA-hm8q-7f3q-5f36), [GHSA-p77w-8qqv-26rm](https://github.com/advisories/GHSA-p77w-8qqv-26rm), [GHSA-9vqf-7f2p-gf9v](https://github.com/advisories/GHSA-9vqf-7f2p-gf9v), [GHSA-69xw-7hcm-h432](https://github.com/advisories/GHSA-69xw-7hcm-h432), [GHSA-xrhx-7g5j-rcj5](https://github.com/advisories/GHSA-xrhx-7g5j-rcj5), [GHSA-3hrh-pfw6-9m5x](https://github.com/advisories/GHSA-3hrh-pfw6-9m5x), [GHSA-f577-qrjj-4474](https://github.com/advisories/GHSA-f577-qrjj-4474), [GHSA-2gcr-mfcq-wcc3](https://github.com/advisories/GHSA-2gcr-mfcq-wcc3), [GHSA-458j-xx4x-4375](https://github.com/advisories/GHSA-458j-xx4x-4375), [GHSA-rv63-4mwf-qqc2](https://github.com/advisories/GHSA-rv63-4mwf-qqc2), [GHSA-wgpf-jwqj-8h8p](https://github.com/advisories/GHSA-wgpf-jwqj-8h8p), [GHSA-88fw-hqm2-52qc](https://github.com/advisories/GHSA-88fw-hqm2-52qc), [GHSA-wwfh-h76j-fc44](https://github.com/advisories/GHSA-wwfh-h76j-fc44), [GHSA-j6c9-x7qj-28xf](https://github.com/advisories/GHSA-j6c9-x7qj-28xf), [GHSA-xgm2-5f3f-mvvc](https://github.com/advisories/GHSA-xgm2-5f3f-mvvc), [GHSA-w62v-xxxg-mg59](https://github.com/advisories/GHSA-w62v-xxxg-mg59), [GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239), [GHSA-f23p-vx2j-j53r](https://github.com/advisories/GHSA-f23p-vx2j-j53r), [GHSA-79qm-7rj5-m7r9](https://github.com/advisories/GHSA-79qm-7rj5-m7r9), [GHSA-gqvv-2mrq-wpjv](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv), [GHSA-g6gw-c38x-mqfc](https://github.com/advisories/GHSA-g6gw-c38x-mqfc), [GHSA-crvj-82cr-hjcx](https://github.com/advisories/GHSA-crvj-82cr-hjcx) | Fixed; absent from final audit |
| js-yaml | high | 3.14.2, 4.1.1 → 3.15.2, 4.3.2 | [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68), [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m), [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | Fixed; absent from final audit |
| lodash | high | 4.17.21, 4.17.23 → 4.18.1 | [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh), [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) | Fixed; absent from final audit |
| multer | high | 2.1.0 → 2.4.0 | [GHSA-5528-5vmv-3xc2](https://github.com/advisories/GHSA-5528-5vmv-3xc2), [GHSA-72gw-mp4g-v24j](https://github.com/advisories/GHSA-72gw-mp4g-v24j), [GHSA-3p4h-7m6x-2hcm](https://github.com/advisories/GHSA-3p4h-7m6x-2hcm), [GHSA-wc9g-mqfw-jrwm](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm), [GHSA-qvfw-j98x-7q72](https://github.com/advisories/GHSA-qvfw-j98x-7q72), [GHSA-535w-7cp7-47q4](https://github.com/advisories/GHSA-535w-7cp7-47q4) | Fixed; absent from final audit |
| mysql2 | high | 3.15.3 → 3.24.4 | [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) | Fixed; absent from final audit |
| path-to-regexp | high | 8.3.0 → 8.4.2 | [GHSA-j3q9-mxjg-w52f](https://github.com/advisories/GHSA-j3q9-mxjg-w52f), [GHSA-27v5-c462-wpq7](https://github.com/advisories/GHSA-27v5-c462-wpq7) | Fixed; absent from final audit |
| picomatch | high | 2.3.1, 4.0.2, 4.0.3 → 2.3.2, 4.0.4 | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p), [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | Fixed; absent from final audit |
| prisma | high | 7.4.2 → 7.10.0 | @prisma/config, @prisma/dev, mysql2 | Fixed; absent from final audit |
| qs | moderate | 6.15.0 → 6.16.0 | [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26), [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | Fixed; absent from final audit |
| uuid | moderate | 13.0.0 → 13.0.2 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Fixed; absent from final audit |
| valibot | moderate | 1.2.0 → 1.4.2 | [GHSA-5qjj-4xww-7phc](https://github.com/advisories/GHSA-5qjj-4xww-7phc) | Fixed; absent from final audit |

### WEB

| Package | Severity | Before → after | Advisory / inherited cause | Disposition |
| --- | --- | --- | --- | --- |
| baseline-browser-mapping | moderate | 2.10.20 → 2.11.25 | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | Fixed; absent from final audit |
| brace-expansion | high | 2.1.0, 5.0.12 → 2.1.7, 5.0.12 | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | Fixed; absent from final audit |
| browserslist | high | 4.28.2 → 4.29.0 | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | Fixed; absent from final audit |
| nanoid | high | 3.3.11 → 3.3.19 | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) | Fixed; absent from final audit |
| postcss | high | 8.5.10 → 8.5.28 | [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | Fixed; absent from final audit |
| postcss-selector-parser | low | 6.1.2, 7.1.6 → 6.1.4, 7.1.6 | [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92) | Fixed; absent from final audit |
| vite | high | 6.4.2 → 6.4.3 | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | Fixed; absent from final audit |
