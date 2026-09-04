# Memory failures

Separate retained objects from transient allocation spikes. Name the repeated user flow, baseline, sample points, heap/native resource view, and tolerance. Inspect ownership/lifecycle of listeners, subscriptions, timers, images, caches, native resources, and large collections. Repeat the flow enough to distinguish warm-up from growth, compare after disposal/idle, and identify the retaining path. Do not “fix” retention by raising limits or forcing collection; bound the owner or dispose the resource and rerun the original scenario.
