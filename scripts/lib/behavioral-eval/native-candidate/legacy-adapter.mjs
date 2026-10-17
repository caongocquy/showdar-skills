import {readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createSourceBinding,brainToolContracts} from './source-binding.mjs';
import { createBrainActions } from './brain-actions.mjs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { createScenarioActions } from '../scenario-actions.mjs';
import { createRunnerCapture } from '../runner-capture.mjs';

const fields = names => ({ type: 'object', properties: Object.fromEntries(names.map(name => [name, { type: 'string' }])), required: names, additionalProperties: false });
const TOOLS = Object.freeze([
  { name: 'select_skill', description: 'Explicitly select an installed pinned skill. Does not grant mutation authority.', inputSchema: fields(['skill']), action: 'selectSkill', tool: 'skill.select' },
  { name: 'skip_refinement', description: 'Record a lifecycle skip against exact runner-approved specification bytes. Requires showdar-build selection and the original approved artifact sandbox. Does not grant mutation authority.', inputSchema: fields(['approvalPath', 'approvalSha256', 'rationale']), action: 'skipRefinement', tool: 'refinement.skip' },
  { name: 'request_approval', description: 'Explicitly request approval of the existing specification; no approval is granted.', inputSchema: fields(['scope', 'message']), action: 'requestApproval', tool: 'interaction.approval' },
  { name: 'change_scope', description: 'Explicitly propose new requirements; no mutation authority is granted.', inputSchema: fields(['decision', 'message']), action: 'changeScope', tool: 'interaction.scope' },
]);
export const COVERAGE = Object.freeze({ complete: false,
  observed: ['authenticated MCP action arguments', 'original scenario-action outcomes', 'mediated decision artifact bytes when written'],
  unobserved: ['assistant-text semantic approvals and scope changes', 'reasoning-summary semantic approvals and scope changes', 'native permission and elicitation requests', 'shell and other tool interactions', 'arbitrary artifact content'],
  absenceVerdict: 'UNOBSERVABLE', actualModel: 'UNVERIFIED' });
export const FRESH_SMOKE_GATE = Object.freeze({ allowed: false, status: 'NOT_RUN',
  reasons: ['Complete approval/scope interaction coverage is not established for codex exec.', 'Successful skip/artifact requires the original approved Docker tool runtime; no native-write fallback is permitted.'] });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validMeta = meta => object(meta) && Buffer.byteLength(JSON.stringify(meta)) <= 4096 && Object.keys(meta).every(key =>
  key === 'progressToken' ? Number.isSafeInteger(meta[key]) || typeof meta[key] === 'string' && meta[key].length < 128 :
  key === 'x-codex-turn-metadata' ? object(meta[key]) :
  ['threadId', 'callId', 'sessionId', 'windowId', 'itemId'].includes(key) && typeof meta[key] === 'string' && meta[key].length < 128);
const error = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

/** Local diagnostic only. Private MCP transport auth and original WeakMap receipts never become signed live origin. */
export async function createCliSemanticAdapter(options) {
  const actions = await createScenarioActions(options);
  const brain = options.scenarioId === 'BRAIN-002' ? await createBrainActions(options) : null;
  const source = brain ? await createSourceBinding({workspace:options.workspace,sourcePath:'docs/spec-draft.md',expectedSha256:options.draftSha256}) : null;
  const tools = brain ? brainToolContracts(source) : TOOLS;
  let sourceBindingContract;
  if(brain){
    const contractPath=path.join(options.evidenceDir,'mcp-contract.json');
    const bytes=JSON.stringify({schemaVersion:1,scenarioId:options.scenarioId,sourceSha:options.sourceSha,tools:tools.map(({action,tool,...descriptor})=>descriptor)},null,2)+'\n';
    await writeFile(contractPath,bytes,{flag:'wx',mode:0o600});
    sourceBindingContract={path:contractPath,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  const verifyContract=async()=>{if(!sourceBindingContract)return true;try{return !(await lstat(sourceBindingContract.path)).isSymbolicLink()&&createHash('sha256').update(await readFile(sourceBindingContract.path)).digest('hex')===sourceBindingContract.sha256;}catch{return false;}};
  const token = randomBytes(32).toString('hex');
  const capture = createRunnerCapture({ directory: options.evidenceDir, scenarioId: options.scenarioId,
    sourceSha: options.sourceSha, modelIdentity: 'UNVERIFIED', apiKey: token });
  const ids = new Set();
  let server, busy = false, sealed = false;
  async function dispatch(request) {
    if (!object(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' ||
      Object.keys(request).some(key => !['jsonrpc', 'id', 'method', 'params'].includes(key))) return error(null, -32600, 'Invalid request');
    const id = request.id;
    if (sealed) return error(id, -32000, 'Session is sealed');
    if (id === undefined) return request.method === 'notifications/initialized' ? null : error(null, -32600, 'Only initialized notifications are supported');
    if (!(typeof id === 'string' && id.length < 128 || Number.isSafeInteger(id))) return error(null, -32600, 'Invalid request id');
    if (ids.has(id) || ids.size >= 128) return error(id, -32000, 'Replayed request or session request limit');
    ids.add(id);
    const result = value => ({ jsonrpc: '2.0', id, result: value });
    if (request.method === 'initialize') {
      if (!['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(request.params?.protocolVersion)) return error(id, -32602, 'Unsupported MCP protocol version');
      return result({ protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'showdar-local-semantic-adapter', version: '0.1.0' } });
    }
    if (request.method === 'ping') return result({});
    if (request.method === 'tools/list') return result({ tools: tools.map(({ action, tool, ...descriptor }) => descriptor) });
    if (request.method !== 'tools/call') return error(id, -32601, 'Unsupported method; JSONL and prose are never actions');
    const params = request.params;
    if (!object(params) || Object.keys(params).some(key => !['arguments', 'name', '_meta'].includes(key)) || !object(params.arguments) ||
      params._meta !== undefined && !validMeta(params._meta)) return error(id, -32602, 'Exact tool name, arguments and bounded native metadata required');
    const descriptor = tools.find(tool => tool.name === params.name);
    if (!descriptor) return error(id, -32602, 'Unsupported action');
    if (busy) return error(id, -32000, 'Concurrent action refused');
    // Keep credentials out of the original runtime's persisted request/message records.
    const payload = JSON.stringify(params.arguments);
    if (Buffer.byteLength(payload) > 65536 || payload.includes(token) || /\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s|\b(?:OPENAI_API_KEY|CODEX_API_KEY|PASSWORD|SECRET)\b/i.test(payload)) return error(id, -32602, 'Sensitive or oversized arguments refused');
    busy = true;
    try {
      const actionResult = await (brain ?? actions)[descriptor.action](source ? source.translate(params.arguments, descriptor.name === 'material_question' ? 'topic' : 'scope') : params.arguments);
      if (!brain) capture.observeAction({ tool: descriptor.tool, ...params.arguments }, actionResult);
      return result({ content: [{ type: 'text', text: actionResult.content }] });
    } catch {
      return result({ isError: true, content: [{ type: 'text', text: 'Action refused by the original runtime or capture boundary; no success claimed.' }] });
    } finally { busy = false; }
  }
  return Object.freeze({
    dispatch,
    async listen() {
      if (server || sealed) throw new Error('Session already listening or sealed');
      server = createServer(async (req, res) => {
        const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(value === null ? '' : JSON.stringify(value)); };
        const supplied = Buffer.from(req.headers.authorization ?? '');
        const expected = Buffer.from('Bearer ' + token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401, { error: 'Unauthorized' }); req.resume(); return; }
        if (req.url === '/mcp' && req.method === 'GET' && !req.headers.origin) { send(405, { error: 'Standalone SSE stream is not provided' }); req.resume(); return; }
        if (req.url !== '/mcp' || req.method !== 'POST' || req.headers.origin || req.headers['content-type']?.split(';')[0] !== 'application/json') { send(400, { error: 'Only authenticated JSON MCP POST is supported' }); req.resume(); return; }
        let bytes = 0, chunks = [];
        try {
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 65536) { send(413, { error: 'Request limit' }); return; }
            chunks.push(chunk);
          }
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!object(input)) { send(400, { error: 'Batch requests refused' }); return; }
          const response = await dispatch(input);
          send(response === null ? 202 : 200, response);
        } catch { if (!res.headersSent) send(400, { error: 'Invalid JSON or transport failure' }); }
      });
      server.requestTimeout = 30000;
      server.headersTimeout = 5000;
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const url = `http://127.0.0.1:${server.address().port}/mcp`;
      return { url, token, config: ['mcp_servers.showdar_semantics.url=' + JSON.stringify(url),
        'mcp_servers.showdar_semantics.bearer_token_env_var="SHOWDAR_CLI_SEMANTIC_TOKEN"',
        'mcp_servers.showdar_semantics.required=true',
        'mcp_servers.showdar_semantics.enabled_tools='+JSON.stringify(tools.map(t=>t.name))] };
    },
    async finish() {
      if (busy || sealed) throw new Error('Cannot finish an active or sealed session');
      sealed = true;
      const original = await capture.finish(false);
      const saved = brain ? {...await brain.finish(), originalTracePath:original.tracePath} : original;
      return { ...saved, sourceBindingContract, integrityVerified: brain ? await brain.verify() && await capture.verify() && await verifyContract() : await capture.verify(), coverage: structuredClone(COVERAGE), freshSmokeGate: structuredClone(FRESH_SMOKE_GATE),
        execution: 'local diagnostic actions; no signed CLI model origin authenticated', behavioralStatus: 'BLOCKED' };
    },
    verify: async () => brain ? await brain.verify() && await capture.verify() && await verifyContract() : await capture.verify(),
    async close() {
      sealed = true;
      if (server?.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  });
}
