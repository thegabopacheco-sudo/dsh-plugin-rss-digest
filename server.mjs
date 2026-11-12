#!/usr/bin/env node
// dsh-plugin-rss-digest — resumen de feeds RSS/Atom de hosts permitidos.
// Tools: status, digest.

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'rss-digest', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'rss-digest');
const DEFAULT_HOSTS = [];
const log = (m) => process.stderr.write(`[rss] ${m}\n`);

function loadConfig() { try { if (existsSync(CONFIG_FILE)) return { allowedHosts: DEFAULT_HOSTS, timeoutMs: 15000, ...(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}) }; } catch { /* defaults */ } return { allowedHosts: DEFAULT_HOSTS, timeoutMs: 15000 }; }
function allowedHosts() { const configured = loadConfig().allowedHosts; return Array.isArray(configured) ? configured : []; }
function checkUrl(urlText) {
  let url;
  try { url = new URL(urlText); } catch { throw new Error(`URL inválida: ${urlText}`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('solo http(s)');
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts().map((item) => String(item).toLowerCase());
  if (!allowed.some((value) => host === value || host.endsWith(`.${value}`))) throw new Error(`host no permitido: ${host} (revisa allowedHosts)`);
  return url;
}
function stripTags(text) { return String(text || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); }
function decodeCdata(text) { return String(text || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'); }
function parseFeed(xml) {
  const items = [];
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((match) => match[0]);
  for (const block of blocks) {
    const title = decodeCdata((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || '';
    const date = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const description = decodeCdata((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || '');
    items.push({ title: stripTags(title), link: stripTags(link), date: stripTags(date), summary: stripTags(description).slice(0, 220) });
  }
  const entries = [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  for (const block of entries) {
    const title = decodeCdata((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i) || block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const date = (block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1] || (block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1] || '';
    const summary = decodeCdata((block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || block.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || [])[1] || '');
    items.push({ title: stripTags(title), link: stripTags(linkMatch?.[1] || ''), date: stripTags(date), summary: stripTags(summary).slice(0, 220) });
  }
  const feedTitle = stripTags(decodeCdata((xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''));
  return { feedTitle, items };
}
async function fetchFeed(urlText, timeoutMs) {
  const url = checkUrl(urlText);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'dsh-rss-digest/0.1', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} al leer ${url}`);
    const xml = await response.text();
    if (xml.length > 5 * 1024 * 1024) throw new Error('feed demasiado grande');
    return parseFeed(xml);
  } finally { clearTimeout(timer); }
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'RSS Digest: resumen de feeds RSS/Atom de hosts permitidos.',
    '',
    `Hosts permitidos: ${allowedHosts().join(', ') || '(ninguno: configura allowedHosts)'}`,
    '',
    'Herramientas: status, digest.',
    '',
    'Reglas:',
    '- Solo descarga feeds http(s) de allowedHosts, con timeout.',
    '- Muestra títulos, fechas y enlaces reales; no inventes noticias.',
    '- No sigas enlaces automáticamente.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-rss-digest', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool('status', { title: 'Estado', description: 'Hosts permitidos y timeout.', inputSchema: z.object({}) }, async () => textResult([`Hosts permitidos: ${allowedHosts().join(', ') || '(ninguno)'}`, `Timeout: ${loadConfig().timeoutMs} ms`, 'Modo: solo lectura de red'].join('\n')));
  server.registerTool('digest', { title: 'Resumen del feed', description: 'Descarga el feed y devuelve un resumen Markdown.', inputSchema: z.object({ url: z.string().min(6).max(2000), limit: z.number().int().min(1).max(50).optional() }) }, async (args) => {
    const feed = await fetchFeed(args.url, loadConfig().timeoutMs);
    const items = feed.items.slice(0, args.limit ?? 15);
    if (items.length === 0) return textResult(`Feed sin items: ${args.url}`);
    return textResult([
      `# ${feed.feedTitle || 'Feed'} (${items.length} items)`,
      '',
      ...items.map((item) => `- **${item.title || '(sin título)'}**${item.date ? ` · ${item.date}` : ''}\n  ${item.link}\n  ${item.summary ? `${item.summary}\n  ` : ''}`),
    ].join('\n'));
  });
  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log('rss-digest listo');
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
