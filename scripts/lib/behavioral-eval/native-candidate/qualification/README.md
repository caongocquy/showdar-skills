# Native diagnostics — external qualification environment required

These versioned entry points package the existing model-free broker/supervisor diagnostic. They are not a live capture producer. No real provider/authentication path is enabled.

Run only on the already-qualified local macOS machine, with the exact0.162.1 CLI/host and original Docker image/provenance prerequisites. Example: `node scripts/lib/behavioral-eval/native-candidate/qualification/native-run.mjs BRAIN-002 positive /absolute/private/evidence-directory`.

The driver keeps fresh output separate from source, verifies the authorized prospective global-config hash without copying config bytes, and supplies only a minimal CLI environment. profile.toml and model-catalog.json preserve the reviewed bytes. External-runtime.mjs contains the original image verification logic plus fixed raw-byte pins for its four immutable external fixtures; no ignored executable module is imported.

Fixed local binary/source/provenance/config paths are intentional prerequisites for this pinned native qualification environment. Linux/Windows CI: **NOT_RUN / UNQUALIFIED** for native Code Mode, macOS Permission Profiles, supervisor ownership and native Docker lifecycle. Portable POSIX tests exercise budgets, authenticated HTTP, receipts and quarantine mechanics; they never stand in for native results. Original CI Docker tests do not qualify this native candidate.

Only the trusted host calls these entry points. Private IPC remains fixed typed operations; no generic execution or model-visible environment override was added. E-03 Environment remains UNQUALIFIED; PHASE4B_NO_GO; AUTHORITATIVE BEHAVIORAL BLOCKED.

The packaged CLI entrypoint accepts only BRAIN-002/003 positive smoke. Historical fault-injection branches remain visible in the broker source for audit but require their original external controller/evidence fixtures; they are NOT_RUN/UNQUALIFIED by this packaged entrypoint. No old negative matrix is claimed for the relocated harness.
