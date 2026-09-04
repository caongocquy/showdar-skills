# Upgrade rollback

Preserve previous manifest, lockfile, toolchain, artifact, and configuration where practical. Identify irreversible steps such as database migrations, Xcode/Gradle project transforms, codegen format changes, capability changes, or minimum OS changes. A rollback plan must name what can actually be restored, schema compatibility, and the trigger for stopping. “Reinstall” is not a rollback if it changes the resolved graph.
