# @adzazueta/color-scheme

Repository of the npm package `@adzazueta/color-scheme`. It turns seed colors into an accessible role-based color scheme, in light and dark modes.

## Commands (Vite+)

- `vp install`: install dependencies.
- `vp dev`: open the browser lab at `/lab/`.
- `vp check`: format, lint, and type check.
- `vp test`: run tests.
- `vp pack`: build the package.
- `vp run bench`: build `dist/` and time `createColorScheme` on the seeds in `bench/seeds.ts`. CI runs the benchmarks once in the `pack` job and shows the times in the summary, without a limit.
- `vp run eval`: evaluate the external color-extractor covers, generate public and local visual reports, and record benchmarks (needs `../color-extractor-eval` or `COLOR_EXTRACTOR_EVAL_DIR`).

## Branches, pull requests, and releases

- One short branch per task, named with its task key (for example, `ADZE-83-tsconfig`), and a pull request into `main`. Never push to `main` directly.
- Pull request titles start with the task key, for example `ADZE-83 Configure tsconfig.json with TypeScript 7`. With squash merging, the title becomes the commit message.
- A pull request that touches `src/` or `package.json` includes a changeset. Changes that users do not notice use `changeset --empty`; run `vp fmt` on the new file, or the pre-commit hook rejects it. During 0.x, breaking changes are `minor`, never `major`.
- Never merge the "Version Packages" pull request and never publish to npm. Only the maintainer does that.
- Change repository settings (rulesets, environments, Actions, and security features) only after the maintainer confirms exactly what will change.
- Workflows: read-only permissions by default, actions pinned by commit SHA, and no untrusted input, such as a pull request title, inline in a script.

## Rules

- The package specification is the contract. Do not add features that are not in it, and do not change its behavior without a decision from the maintainer. If something is missing, ask.
- ESM only, TypeScript 7 in strict mode with `isolatedDeclarations`, Node 22.12 or later.
- Import from `src/` with the `@/` alias (`@/contrast.js`), keeping the `.js` extension. Relative imports are fine inside the same folder.
- No runtime or optional dependencies. The package does not depend on other `@adzazueta/*` packages, not even for types: the `color-extractor` adapter describes the result it reads with its own types.
- The package is pure computation: no DOM, file system, or network.
- Every role is a lowercase `#rrggbb` hex color in sRGB.
- **Accessibility:**
  - Contrast follows WCAG 2.2 and is computed exactly on the final 8-bit color. APCA is not computed, reported, or reimplemented.
  - Every guaranteed pair and the Oklab lightness rule hold in every scheme, in both modes. A failing pair is a bug in the package: never relax a minimum to make a test pass.
  - Tests measure contrast and conversions with Color.js (a development dependency only), never with the package's own formulas.
- **Determinism:**
  - No `Math.random`.
  - No `Math.pow`, `Math.cbrt`, `Math.exp`, or trigonometry in calculations that influence an output color: use precomputed tables and custom functions. Hue is kept by scaling Oklab's a and b.
  - Comparators with a total order, and iteration in a fixed order.
- Code copied from `color-extractor`, such as the sRGB ↔ Oklab conversions, keeps a note of its origin, and reference-value tests check that both copies give identical results.
- Any change that can alter an output color changes `algorithmVersion`.
- Never update snapshots to make a test pass. Regenerate them with `vp test -u` only for an intentional algorithm change, which also changes `algorithmVersion`.
- Do not commit cover images or any other third-party images; evaluation covers live outside the repository.
- Code, identifiers, comments, commit messages, the README, the changelog, and all documentation are in English.
