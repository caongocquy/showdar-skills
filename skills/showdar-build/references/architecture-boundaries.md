# Architecture boundaries

Follow existing dependency direction unless the requested change exposes a concrete defect. Keep domain policy out of UI glue, persistence details out of callers, and platform behavior behind explicit seams. Before adding a seam, name its owner, input/output contract, lifecycle, and second concrete consumer or volatility it isolates. Preserve public contracts unless change is requested; if they change, update types, serializers, consumers, and tests together.
