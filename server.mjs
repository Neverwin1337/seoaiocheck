import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuditor, AuditsDatabase, saveAuditToDatabase, getAuditDetail } from '@seomator/seo-audit';
import { allowedOrigin, publicIp } from './network-guard.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const port = Number(process.env.PORT || 3000);
let auditInProgress = false;

async function parseTarget(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('請輸入有效的網站網址。');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('請輸入完整網址，例如 https://example.com。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('只支援不含帳密的 HTTP 或 HTTPS 網址。');
  }

  url.hash = '';
  return url.href;
}

function geoAudit(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(root, '.venv/bin/geo'), ['audit', '--url', url, '--format', 'json'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', NO_PROXY: '*' },
    });
    let output = '';
    let errorOutput = '';
    const timer = setTimeout(() => child.kill(), 90000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 5_000_000) child.kill();
    });
    child.stderr.on('data', chunk => { errorOutput += chunk.slice(0, 2000); });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(errorOutput.trim() || 'GEO Optimizer 無法完成檢測。'));
      try { resolve(JSON.parse(output)); } catch { reject(new Error('GEO Optimizer 回傳了無效報告。')); }
    });
  });
}

function sourceResult(result, source) {
  if (result.status === 'rejected') return { score: null, error: `${source} 檢測失敗，請稍後重試。` };
  return result.value;
}

function geoCategory(recommendation) {
  if (/robots\.txt|GPTBot|ClaudeBot|PerplexityBot|crawler permissions/i.test(recommendation)) return 'robots_txt';
  if (/llms\.txt/i.test(recommendation)) return 'llms_txt';
  if (/JSON-LD|schema|sameAs|potentialAction/i.test(recommendation)) return 'schema_jsonld';
  if (/meta description|meta tag|canonical|Open Graph/i.test(recommendation)) return 'meta_tags';
  if (/H1|H2|H3|heading|content|statistics|front-load|JavaScript to render|server-side/i.test(recommendation)) return 'content';
  if (/brand|about|contact|Knowledge Graph/i.test(recommendation)) return 'brand_entity';
  if (/RSS|Atom|freshness/i.test(recommendation)) return 'signals';
  if (/\.well-known\/ai\.txt|\/ai\/|WebMCP/i.test(recommendation)) return 'ai_discovery';
  return null;
}

function geoPriority(check) {
  if (!check || !check.max) return 'unranked';
  const ratio = check.score / check.max;
  if (ratio < 0.4) return 'high';
  if (ratio < 0.8) return 'medium';
  return 'low';
}

async function audit(url) {
  const results = await Promise.allSettled([
    createAuditor({ measureCwv: false, timeout: 15000, signal: AbortSignal.timeout(90000) }).audit(url),
    geoAudit(url),
  ]);
  const seo = sourceResult(results[0], 'SEOmator');
  const geo = sourceResult(results[1], 'GEO Optimizer');
  let seoDetail;
  if (!seo.error) {
    const db = AuditsDatabase.open(':memory:');
    try {
      const saved = saveAuditToDatabase(seo, { db });
      seoDetail = getAuditDetail(db, saved.auditId);
    } finally {
      db.close();
    }
  }
  return {
    url,
    checkedAt: new Date().toISOString(),
    seo: seo.error ? seo : {
      score: seo.overallScore,
      categories: seo.categoryResults.map(item => ({ name: item.categoryId, score: item.score })),
      findings: seo.categoryResults.flatMap(item => item.results
        .filter(rule => rule.status === 'fail' || rule.status === 'warn')
        .map(rule => {
          const metadata = seoDetail?.ruleMetadata[rule.ruleId];
          const recommendation = rule.details?.recommendation || rule.details?.suggestion || metadata?.fix;
          return {
            source: 'SEO', ruleId: rule.ruleId, category: item.categoryId, text: rule.message,
            severity: rule.status, severitySource: 'native',
            fix: typeof recommendation === 'string' && recommendation.trim()
              ? recommendation : `依規則「${metadata?.name || rule.ruleId}」檢查頁面：${metadata?.description || rule.message}；修正後重新檢測。`,
          };
        })),
    },
    geo: geo.error ? geo : {
      score: geo.score,
      categories: Object.entries(geo.checks || {}).map(([name, value]) => ({ name, score: value.score, max: value.max })),
      findings: (geo.recommendations || []).map(recommendation => {
        const category = geoCategory(recommendation);
        return {
          source: 'GEO', category: category || 'AI 檢索準備度',
          text: category ? `改善 ${category.replaceAll('_', ' ')} 相關設定` : '其他 AI 檢索改善建議',
          severity: category ? geoPriority(geo.checks?.[category]) : 'unranked',
          severitySource: 'estimated', fix: recommendation,
        };
      }),
    },
  };
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'GET' && request.url === '/healthz') {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end('ok');
    return;
  }
  if (request.method === 'POST' && request.url === '/api/audit') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (auditInProgress) {
      response.statusCode = 429;
      response.setHeader('Retry-After', '15');
      response.end(JSON.stringify({ error: '已有網站正在檢測，請稍後重試。' }));
      return;
    }
    let ownsAudit = false;
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 4096) throw new Error('網址輸入過長。');
      }
      const url = await parseTarget(JSON.parse(body).url);
      if (auditInProgress) {
        response.statusCode = 429;
        response.end(JSON.stringify({ error: '已有網站正在檢測，請稍後重試。' }));
        return;
      }
      auditInProgress = true;
      ownsAudit = true;
      const report = await audit(url);
      response.end(JSON.stringify(report));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: error instanceof SyntaxError ? '請提供正確的網址資料。' : error.message }));
    } finally {
      if (ownsAudit) auditInProgress = false;
    }
    return;
  }
  if (request.method === 'GET' && files.has(request.url)) {
    const [name, type] = files.get(request.url);
    response.setHeader('Content-Type', type);
    response.end(await readFile(join(root, 'public', name)));
    return;
  }
  response.statusCode = 404;
  response.end('Not found');
});

server.listen(port, '0.0.0.0', () => console.log(`雙軌網站檢測：http://127.0.0.1:${port}`));
