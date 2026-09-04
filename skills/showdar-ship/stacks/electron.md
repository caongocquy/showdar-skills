# Electron delivery verification

Verify renderer production assets, main/preload packaging, context isolation,
application ID/version, platform signing, update metadata, and clean-machine
install/update behavior locally. Retain symbols and previous signed artifacts.
Treat successful packaging or upload as incomplete until launch and critical IPC
flows pass; upload and updater publication require explicit execution intent.
