# Risk analysis

Classify risk by blast radius and reversibility: data loss, auth/security, public API compatibility, native build/signing, migration, concurrency, performance hot paths, and deployment coupling deserve explicit treatment.

For each high-risk item record affected users or systems, failure mode, detection signal, containment, recovery mechanism, and irreversible step. Check whether old and new readers or writers coexist during rollout. A feature flag is useful only when both branches are tested and its removal owner or event is explicit. For high-risk changes, define rollback before implementation; a one-line schema or permission change can have a large blast radius.
