# Upstream provenance

Motion Rig Lab is derived from the SLEAP App repository.

| Field | Value |
|---|---|
| Upstream project | `talmolab/sleap-app` |
| Repository | <https://github.com/talmolab/sleap-app> |
| Pinned commit | `02a4185401cdb6f0dfb8152b65ab59ec32d4dadc` |
| Upstream branch at import | `main` |
| Import date | 2026-08-24 |
| Upstream license | BSD 3-Clause |

The upstream copyright and license text are retained in `LICENSE`.

## Local scope

The local work adds a focused Motion Rig review workflow and a Zhao Yun demonstration. The goal is video pose pre-label review, point correction, constraint annotation, and data handoff to a separate T-Pose/Spine solver. It does not claim to be an upstream SLEAP release or an official Esoteric Software product.

## Reproducing the base

```powershell
git clone https://github.com/talmolab/sleap-app.git MotionRigLab
Set-Location MotionRigLab
git checkout 02a4185401cdb6f0dfb8152b65ab59ec32d4dadc
git rev-parse HEAD
```

Expected final output:

```text
02a4185401cdb6f0dfb8152b65ab59ec32d4dadc
```

When taking future upstream changes, record the new commit here, review dependency/license changes, then rerun the unit, E2E, Demo-generation, and manual validation suites. Do not silently replace this pin.
