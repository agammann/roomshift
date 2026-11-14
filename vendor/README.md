# Roomshift renderer fork

Roomshift uses `super-three-0.187.0-roomshift.13.tgz`, an intentionally maintained fork rather than a Meta release. IWSDK 1.0.1 declares `npm:super-three@0.181.0`; Roomshift overrides that exact declaration so the application and SDK use a single 0.187 renderer and matching types. Meta has not certified this combination. Physical Quest, native `OCULUS_multiview`, and device-specific GPU behavior have not been tested. The CI emulator uses the browser's `OVR_multiview2` through a test-only adapter; it is evidence about the renderer path, not native Oculus coverage. Multiview clipping planes are still transformed against the parent camera; Roomshift does not enable clipping, and the fork must not be treated as general Three.js multiview parity. Arbitrary custom and raw shader materials have not been validated for multiview. Multiview XR HDR output with tone mapping or post-processing and transmissive materials are rejected explicitly; Roomshift uses the default 8-bit output path and no transmission.

The archive is based on upstream `three@0.187.0` (SHA-256 `ff540832ded0cfe919764d24a3d88f3e2a05f23303f876423e4f893841e90728`) and ports renderer changes from `super-three@0.185.0` (SHA-256 `82eeb665094f127ba02ab212e7540f00c860bcde24e9887521121d48e87c0919`). Both upstream packages contain the same MIT license, which is included in the archive. `three-r187-roomshift.patch` contains the complete source changes relative to upstream Three 0.187, including Roomshift's multiview texture, shader, and error-recovery corrections.

The archive SHA-256 is `fe44c9c9cd6e46dad3bd386aabbac66f9831674a06cba2ddca6c67edfe58f124`. `pnpm check:three` also hashes every installed renderer file and only permits the exact SDK version and dependency declaration above. Neither hash establishes that the fork is compatible with an untested device.

## Rebuild and verify

With the repository's frozen dependencies installed, obtain the unmodified `three@0.187.0` npm tarball. Use a **new, nonexistent** output directory; the rebuild script refuses to overwrite an existing tree:

```sh
node scripts/rebuild-three-fork.mjs /path/to/three-0.187.0.tgz /path/to/new-renderer-directory
cd /path/to/new-renderer-directory
pnpm pack --out /path/to/rebuilt-super-three.tgz
```

The script verifies the upstream tarball hash, applies the checked-in source patch, requires the locked Rollup 4.64.5, builds the ESM, CommonJS, WebGPU, and TSL entry points, and writes provenance. The rebuilt archive should have the SHA-256 above; on Windows and Linux, Node can calculate it with `node -e "console.log(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync(process.argv[1])).digest('hex'))" /path/to/rebuilt-super-three.tgz`. Re-run the integrity, production, browser, and emulator checks after any fork or SDK change. An upstream SDK release with a matching renderer should replace this maintenance fork when it has been validated.
