# Performance debugging

Name the user-visible path, workload size, platform, and budget. Classify CPU/thread blocking, render/rebuild churn, layout/raster/GPU work, I/O/network, image decode, memory/GC, database/query, or bundle/startup cost. Record a baseline with the same scenario, then change one causal variable and measure the same metric. Prefer reducing work, moving it off a hot thread, batching, virtualizing, or bounding data over adding arbitrary delays or memoization. Report measurement noise and unverified devices.
