// Test end-to-end de rss-digest con feed local.
import path from 'node:path';
import http from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(path.join(home, 'rss-digest'), { recursive: true });
writeFileSync(path.join(home, 'rss-digest', 'config.json'), JSON.stringify({ allowedHosts: ['127.0.0.1'], timeoutMs: 5000 }), 'utf8');
const rss = `<?xml version="1.0"?><rss><channel><title>Mi Feed</title>
<item><title>Primera noticia</title><link>http://example.com/1</link><pubDate>Mon, 10 Nov 2026 10:00:00 GMT</pubDate><description>Resumen uno</description></item>
<item><title>Segunda noticia</title><link>http://example.com/2</link><pubDate>Tue, 11 Nov 2026 10:00:00 GMT</pubDate><description>Resumen dos</description></item>
</channel></rss>`;
const server = http.createServer((request, response) => {
  if (request.url === '/feed') { response.writeHead(200, { 'content-type': 'application/rss+xml' }); response.end(rss); }
  else { response.writeHead(404); response.end('no'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

function makeClient() {
  const entry = process.env.RSS_SERVER ? path.resolve(process.env.RSS_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'rss-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const digest = textOf(await client.callTool({ name: 'digest', arguments: { url: `http://127.0.0.1:${port}/feed` } }));
console.log('--- digest ---'); console.log(digest);
console.log('título del feed:', digest.includes('Mi Feed'));
console.log('2 items:', digest.includes('Primera noticia') && digest.includes('Segunda noticia'));
console.log('fechas y enlaces:', digest.includes('example.com/1') && digest.includes('2026'));
const limited = textOf(await client.callTool({ name: 'digest', arguments: { url: `http://127.0.0.1:${port}/feed`, limit: 1 } }));
console.log('limit 1:', limited.includes('Primera noticia') && !limited.includes('Segunda noticia'));
const denied = await client.callTool({ name: 'digest', arguments: { url: 'http://example.com/feed' } });
console.log('host no permitido isError:', denied.isError === true);
const notFound = await client.callTool({ name: 'digest', arguments: { url: `http://127.0.0.1:${port}/otra` } });
console.log('404 isError:', notFound.isError === true);
await new Promise((resolve) => server.close(resolve));
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
