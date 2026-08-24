# Third-party notices

This file records third-party components that were directly confirmed for the Motion Rig Lab MVP. It is not a substitute for the license texts shipped with those components or for a complete release-time software bill of materials.

## SLEAP App

- Project: SLEAP App
- Source: <https://github.com/talmolab/sleap-app>
- Pinned source commit: `02a4185401cdb6f0dfb8152b65ab59ec32d4dadc`
- License: BSD 3-Clause
- Copyright: Copyright (c) 2026, Talmo Lab
- Local license text: `LICENSE`

Motion Rig Lab preserves the upstream BSD 3-Clause notice and disclaimer.

## sleap-io.js

- Package: `@talmolab/sleap-io.js`
- Declared version range: `^0.5.10`
- Source: <https://github.com/talmolab/sleap-io.js>
- License: BSD 3-Clause

This is the confirmed project data-model and SLP/HDF5 I/O dependency declared by `package.json`.

## React

- Package: `react`
- Declared version range: `^19.0.0`
- Source: <https://github.com/facebook/react>
- License: MIT

## Vite

- Package: `vite`
- Declared version range: `^6.2.0`
- Source: <https://github.com/vitejs/vite>
- License: MIT

## Spine software is not bundled

This repository does not, by the work described here, bundle the proprietary Spine Editor or an official Spine Runtime. `Spine`, `.spine`, and related names belong to their respective owner. If a later build adds an official Spine Runtime or a derivative, the applicable Spine license and copyright notice must be reviewed and added before distribution. See <https://esotericsoftware.com/spine-editor-license>.

## Release checklist

Before redistributing a binary or hosted build:

1. Generate a complete dependency inventory from the locked dependency graph.
2. Collect the exact license text and required notices for every distributed package and asset.
3. Record the provenance and redistribution rights of Demo media separately from software dependencies.
4. Recheck whether a Spine Runtime, model weight, FFmpeg binary, font, or generated asset has been added.
5. Preserve `LICENSE`, this notice file, and any additional notices required by newly bundled components.
