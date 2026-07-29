import { build } from "esbuild";

/**
 * Bundles the action into a single ESM file for the `node24` runtime.
 *
 * Two banner statements are prepended to the output:
 *
 * 1. `createRequire` — some bundled transitive dependencies (notably undici) are
 *    CommonJS and lazily `require()` Node built-ins from inside functions. esbuild
 *    rewrites those to its `__require` shim, which throws `Dynamic require of "x"
 *    is not supported` unless a `require` binding exists in module scope. ESM has
 *    no implicit `require`, so we provide one.
 * 2. `setSourceMapsEnabled` — makes the emitted source map apply to stack traces,
 *    replacing the `sourcemap-register.js` shim the previous bundler generated.
 */
const banner = [
  'import { createRequire } from "node:module";',
  "const require = createRequire(import.meta.url);",
  "process.setSourceMapsEnabled(true);",
].join("\n");

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  banner: { js: banner },
});
