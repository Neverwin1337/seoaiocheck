const form = document.querySelector('#audit-form');
const input = document.querySelector('#site-url');
const button = document.querySelector('#submit');
const content = document.querySelector('#report-content');
const intro = document.querySelector('#report-intro');
const report = document.querySelector('.report');
const exports = document.querySelector('#export-actions');
let lastReport = null;
const names = { core: '核心 SEO', perf: '效能', links: '連結', images: '圖片', security: '安全性', technical: '技術 SEO', crawl: '可檢索性', crawlability: '可檢索性', schema: '結構化資料', js: 'JavaScript 呈現', a11y: '無障礙', content: '內容', 'robots_txt': 'robots.txt', 'llms_txt': 'llms.txt', 'schema_jsonld': 'JSON-LD', 'meta_tags': 'Meta 標籤', signals: '網站訊號', ai_discovery: 'AI 探索入口', brand_entity: '品牌識別' };
const severityLabels = { fail: '未通過', warn: '注意', high: '高（估算）', medium: '中（估算）', low: '低（估算）', unranked: '未分級' };
const $ = selector => document.querySelector(selector);

function setScore(source, value, caption) {
  $(`#${source}-score`).textContent = value.score === null ? '—' : value.score;
  $(`#${source}-rail`).style.width = `${value.score ?? 0}%`;
  $(`#${source}-caption`).textContent = value.error || caption;
  $(`#${source}-caption`).classList.toggle('error-caption', Boolean(value.error));
}

function showCategories(selector, rows) {
  const parent = $(selector);
  parent.replaceChildren();
  if (!rows?.length) { parent.textContent = '這個來源暫時沒有分類資料。'; return; }
  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'category-row';
    const label = document.createElement('span');
    label.textContent = names[row.name] || row.name.replaceAll('_', ' ');
    const score = document.createElement('strong');
    score.textContent = `${Math.round(row.score)} / ${row.max ?? 100}`;
    line.append(label, score);
    parent.append(line);
  }
}

function showFindings(items) {
  const parent = $('#finding-list');
  parent.replaceChildren();
  $('#finding-count').textContent = `${items.length} 項`;
  if (!items.length) { parent.textContent = '目前沒有需要優先檢查的項目。'; return; }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'finding-row';
    const source = document.createElement('span');
    source.className = `finding-source ${item.source.toLowerCase()}`;
    source.textContent = item.source;
    const body = document.createElement('div');
    const text = document.createElement('p');
    text.textContent = item.text;
    const severity = document.createElement('span');
    severity.className = `finding-severity severity-${item.severity}`;
    severity.textContent = severityLabels[item.severity] || '未分級';
    const category = document.createElement('small');
    category.textContent = names[item.category] || item.category;
    const fix = document.createElement('p');
    fix.className = 'finding-fix';
    fix.textContent = `建議做法：${item.fix || '請依規則檢查並修正後重新檢測。'}`;
    body.append(text, severity, category, fix);
    row.append(source, body);
    parent.append(row);
  }
}

function download(content, type, filename) {
  const objectUrl = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

exports.addEventListener('click', async event => {
  const format = event.target.closest('button[data-export]')?.dataset.export;
  if (!lastReport || !format) return;
  const filename = `seo-geo-${new URL(lastReport.url).hostname.replace(/[^a-z0-9.-]/gi, '-')}-${lastReport.checkedAt.slice(0, 10)}`;
  if (format === 'json') {
    download(JSON.stringify(lastReport, null, 2), 'application/json;charset=utf-8', `${filename}.json`);
    return;
  }
  const documentCopy = document.documentElement.cloneNode(true);
  documentCopy.querySelector('script')?.remove();
  documentCopy.querySelector('.intro')?.remove();
  documentCopy.querySelector('#audit-form')?.remove();
  documentCopy.querySelector('#report-intro')?.remove();
  documentCopy.querySelector('#export-actions')?.remove();
  documentCopy.querySelector('#report-content')?.removeAttribute('hidden');
  documentCopy.querySelector('#audit-status')?.remove();
  documentCopy.querySelector('title').textContent = `網站檢測報告｜${lastReport.url}`;
  try {
    const response = await fetch('/style.css');
    if (!response.ok) throw new Error('無法載入報告樣式。');
    const style = documentCopy.ownerDocument.createElement('style');
    style.textContent = await response.text();
    documentCopy.querySelector('link[rel="stylesheet"]')?.replaceWith(style);
    download(`<!doctype html>\n${documentCopy.outerHTML}`, 'text/html;charset=utf-8', `${filename}.html`);
  } catch (error) {
    $('#form-error').textContent = error instanceof Error ? error.message : '無法匯出 HTML 報告。';
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  lastReport = null;
  exports.hidden = true;
  $('#form-error').textContent = '';
  button.disabled = true;
  $('#submit-text').textContent = '正在檢測…';
  intro.hidden = true;
  content.hidden = false;
  report.classList.add('loading');
  setScore('seo', { score: null }, '正在取得 SEOmator 報告…');
  setScore('geo', { score: null }, '正在取得 GEO Optimizer 報告…');
  $('#checked-at').textContent = '分析進行中';
  $('#audit-status').textContent = '正在檢測網站，請稍候。';
  $('#target-url').textContent = input.value;
  $('#seo-categories').replaceChildren();
  $('#geo-categories').replaceChildren();
  $('#finding-list').replaceChildren();
  $('#finding-count').textContent = '';
  try {
    const response = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: input.value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '無法完成檢測。');
    lastReport = data;
    exports.hidden = false;
    $('#target-url').textContent = data.url;
    $('#checked-at').textContent = `檢測時間 ${new Date(data.checkedAt).toLocaleString('zh-TW')}`;
    $('#audit-status').textContent = data.seo.error || data.geo.error ? '檢測已完成，部分來源失敗，請查看結果。' : '檢測已完成，兩個分數與報告已顯示。';
    setScore('seo', data.seo, '檢查技術 SEO、內容、連結與可存取性。');
    setScore('geo', data.geo, '評估 AI 檢索準備度；不是實際引用率。');
    showCategories('#seo-categories', data.seo.categories);
    showCategories('#geo-categories', data.geo.categories);
    showFindings([...(data.seo.findings || []), ...(data.geo.findings || [])]);
  } catch (error) {
    $('#form-error').textContent = error.message || '檢測失敗，請稍後重試。';
    intro.hidden = false;
    content.hidden = true;
    $('#checked-at').textContent = '等待輸入網址';
    $('#audit-status').textContent = '檢測失敗，請修正網址或稍後重試。';
    input.focus();
  } finally {
    report.classList.remove('loading');
    button.disabled = false;
    $('#submit-text').textContent = '開始檢測';
  }
});
