# QA planning guide

Use this reference to keep a QA plan small but risk-complete.

## Risk partitions

Prioritize changed boundaries, high-impact data, authorization, state transitions, external integrations, platform differences, and recovery. Partition inputs into valid, invalid, missing, minimum, maximum, duplicate, stale, concurrent, offline, and cancelled cases only when each can produce a distinct outcome.

## Evidence vocabulary

- **Planned:** scenario exists but was not run.
- **Executed:** command/device/environment and result are recorded.
- **Passed/failed:** an executed check has observable evidence against its expected result.
- **Blocked:** required environment, fixture, device, permission, or dependency was unavailable.

Never turn planned coverage into a pass claim.

## Platform matrix

Choose supported partitions rather than every device. Record OS/browser version, device class, orientation, permission state, network transition, app lifecycle, locale, and build flavor when those dimensions affect behavior. For native apps include cold/warm launch, background/foreground, upgrade, and low-memory checks when the feature touches lifecycle or resources.
