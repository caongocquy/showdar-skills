# Rollback and migrations

Check whether the artifact, schema, data, and configuration are backward compatible. Define a rollback trigger from health or business evidence, the last safe version, recovery point, data consistency behavior, and owner.

Destructive or irreversible migrations require explicit approval and a tested recovery path. If rollback is impossible after a schema step, say so and plan expand/contract or forward-fix evidence rather than promising zero downtime.
