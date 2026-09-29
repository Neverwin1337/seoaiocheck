import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuditor, getRuleById } from '@seomator/seo-audit';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);
const port = Number(process.env.PORT || 3000);

function publicAddress(address) {
  if (address.includes(':')) {
    const value = address.toLowerCase();
    return !(/^(::1|::|fc|fd|fe[89ab])/.test(value) || value.startsWith('::ffff:'));
  }
  const [first, second] = address.split('.').map(Number);
  return first !== 0 && first !== 10 && first !== 127 && first !== 169 && first < 224
    && !(first === 100 && second >= 64 && second <= 127)
    && !(first === 172 && second >= 16 && second <= 31)
    && !(first === 192 && (second === 168 || second === 0))
    && !(first === 198 && (second === 18 || second === 19));
}

async function parseTarget(input) {
  if (typeof input !== 'string' || input.length > 2048) throw new Error('請輸入有效的網站網址。');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('請輸入完整網址，例如 https://example.com。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('只支援不含帳密的 HTTP 或 HTTPS 網址。');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) {
    throw new Error('無法檢測本機或內部網站。');
  }
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
    throw new Error('無法檢測本機或內部網站。');
  }
  url.hash = '';
  return url.href;
}

function geoAudit(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(root, '.venv/bin/geo'), ['audit', '--url', url, '--format', 'json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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

const seoFixes = {
  'core-title-length': '將 <title> 改為能描述頁面主題的標題，建議約 30–60 個字元。',
  'core-description-present': '在 <head> 加入 <meta name="description" content="頁面摘要">。',
  'core-description-length': '補上獨特的 meta description，建議約 120–160 個字元。',
  'core-canonical-present': '在 <head> 加入指向正式頁面網址的 <link rel="canonical" href="...">。',
  'core-canonical-valid': '確認 canonical 指向可存取的完整 HTTPS 網址，且與正式頁面一致。',
  'core-h1-present': '在頁面主要內容加入描述主題的 <h1>。',
  'core-h1-single': '讓頁面有且只有一個主要 <h1>，其餘段落改用 <h2>、<h3>。',
  'technical-robots-txt-exists': '在網站根目錄建立 /robots.txt，並確認公開讀取回傳 HTTP 200。',
  'technical-robots-txt-valid': '建立 robots.txt 後檢查 User-agent 與 Allow／Disallow 指令語法。',
  'technical-sitemap-exists': '發布 /sitemap.xml，並在 robots.txt 加入 Sitemap: 網址。',
  'technical-sitemap-valid': '建立 sitemap.xml 後確認 XML 合法、所列網址可存取。',
  'technical-www-redirect': '選定 www 或非 www 作為正式網域，將另一版本以永久轉址導向正式版本。',
  'technical-404-page': '製作能返回 HTTP 404 的自訂找不到頁面，提供返回首頁或相關內容的連結。',
  'perf-http2': '請先在瀏覽器網路面板確認實際 HTTP 協定；若仍使用 HTTP/1.1，再檢查主機或 CDN 的 HTTP/2 設定。',
  'security-https-redirect': '在伺服器或 CDN 將所有 HTTP 請求永久轉址至對應 HTTPS 網址。',
  'security-hsts': '確認全站 HTTPS 後，在回應標頭設定 Strict-Transport-Security；先以較短 max-age 測試再逐步提高。',
  'security-csp': '依網站使用的資源來源加入 Content-Security-Policy，先用 Report-Only 驗證再啟用限制。',
  'security-x-frame-options': '若不需被嵌入 iframe，在回應設定 CSP frame-ancestors none 或 X-Frame-Options: DENY。',
  'security-x-content-type-options': '在 HTTP 回應標頭加入 X-Content-Type-Options: nosniff。',
  'crawl-sitemap-domain': '先建立 sitemap.xml，再確認每個網址屬於本站正式網域。',
  'crawl-canonical-redirect': '先設定 canonical，再確認指向的網址不經轉址且回傳成功。',
  'schema-present': '在頁面加入符合內容的 JSON-LD 結構化資料，例如 WebSite 或 Organization。',
  'schema-valid': '加入 JSON-LD 後用 Schema Markup Validator 檢查 JSON 語法與欄位。',
  'schema-type': '在 JSON-LD 中標明適合內容的 @type，例如 WebSite。',
  'schema-required-fields': '依所選 schema 類型補齊名稱、網址及其他必要欄位。',
  'a11y-link-text': '將「了解更多」等模糊連結改為能說明目的地的文字。',
  'a11y-main-landmark': '以 <main> 包住頁面的主要內容，每頁只保留一個主要地標。',
};

async function audit(url) {
  const results = await Promise.allSettled([
    createAuditor({ measureCwv: false, timeout: 15000 }).audit(url),
    geoAudit(url),
  ]);
  const seo = sourceResult(results[0], 'SEOmator');
  const geo = sourceResult(results[1], 'GEO Optimizer');
  return {
    url,
    checkedAt: new Date().toISOString(),
    seo: seo.error ? seo : {
      score: seo.overallScore,
      categories: seo.categoryResults.map(item => ({ name: item.categoryId, score: item.score })),
      findings: seo.categoryResults.flatMap(item => item.results
        .filter(rule => rule.status === 'fail' || rule.status === 'warn')
        .map(rule => {
          const metadata = getRuleById(rule.ruleId);
          const recommendation = rule.details?.recommendation || rule.details?.suggestion;
          return {
            source: 'SEO', category: item.categoryId, text: rule.message,
            severity: rule.status, severitySource: 'native',
            fix: typeof recommendation === 'string' && recommendation.trim()
              ? recommendation : seoFixes[rule.ruleId]
                || `依規則「${metadata?.name || rule.ruleId}」檢查頁面：${metadata?.description || rule.message}；修正後重新檢測。`,
          };
        })).slice(0, 30),
    },
    geo: geo.error ? geo : {
      score: geo.score,
      categories: Object.entries(geo.checks || {}).map(([name, value]) => ({ name, score: value.score, max: value.max })),
      findings: (geo.recommendations || []).slice(0, 30).map(recommendation => {
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
  if (request.method === 'POST' && request.url === '/api/audit') {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 4096) throw new Error('網址輸入過長。');
      }
      const url = await parseTarget(JSON.parse(body).url);
      const report = await audit(url);
      response.end(JSON.stringify(report));
    } catch (error) {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: error instanceof SyntaxError ? '請提供正確的網址資料。' : error.message }));
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

server.listen(port, '127.0.0.1', () => console.log(`雙軌網站檢測：http://127.0.0.1:${port}`));
