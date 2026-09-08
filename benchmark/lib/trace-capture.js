export function createTrace() {
  return {
    intent: null,
    primary: null,
    advisors: [],
    verificationBudget: null,
    evidenceStateDecisions: [],
    timestamps: {}
  };
}

export function recordIntent(trace, intent) {
  trace.intent = intent;
  trace.timestamps.intent = Date.now();
}

export function recordPrimary(trace, primary) {
  trace.primary = primary;
  trace.timestamps.primary = Date.now();
}

export function recordAdvisors(trace, advisors) {
  trace.advisors = advisors;
  trace.timestamps.advisors = Date.now();
}

export function recordVerificationBudget(trace, budget) {
  trace.verificationBudget = budget;
  trace.timestamps.verificationBudget = Date.now();
}

export function recordEvidenceDecision(trace, decision) {
  trace.evidenceStateDecisions.push({
    ...decision,
    timestamp: Date.now()
  });
}

export function finalizeTrace(trace) {
  trace.timestamps.completed = Date.now();
  trace.durationMs = trace.timestamps.completed - (trace.timestamps.intent || trace.timestamps.completed);
  return trace;
}

export function formatTrace(trace) {
  if (!trace.intent) return 'No trace available';
  
  let output = '=== ROUTING / STATE TRACE ===\n\n';
  output += `Intent: ${JSON.stringify(trace.intent, null, 2)}\n\n`;
  output += `Primary: ${trace.primary?.skill || 'unknown'} (score: ${trace.primary?.score || 'N/A'})\n\n`;
  output += `Advisors: ${trace.advisors.map(a => `${a.skill} (${a.score})`).join(', ') || 'none'}\n\n`;
  output += `Verification Budget: ${trace.verificationBudget?.budget || 'unknown'} (${trace.verificationBudget?.reasons?.join(', ') || 'no reasons'})\n\n`;
  
  if (trace.evidenceStateDecisions.length) {
    output += 'Evidence State Decisions:\n';
    for (const d of trace.evidenceStateDecisions) {
      output += `  ${d.type} -> ${d.target || 'continue'} (${d.reasons?.join('; ') || 'no reasons'})\n`;
    }
  }
  
  output += `\nDuration: ${trace.durationMs}ms\n`;
  return output;
}