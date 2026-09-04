# Build failures

Start at the first causal error, not the last cascade. Capture command, target/variant, toolchain versions, resolved dependency graph, generated step, configuration, signing/native context, and the first failing task. Compare clean checkout, warm build, and target environment only when each tests a stated cache/environment hypothesis. Preserve logs and mapping/symbol artifacts. Avoid deleting caches, lockfiles, volumes, or generated files until evidence points to corruption and the recovery path is understood.
