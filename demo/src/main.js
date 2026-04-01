import './style.css';
import { loadManifest, getSchema, validate } from './validator.js';

/* ── State ─────────────────────────────────────────────────────────────── */
/** @type {Array<{code: string, hasPbjs: boolean, hasPbs: boolean}>} */
let allBidders = [];
let currentBidder = null;
let runtime = 'pbjs';

/* ── DOM refs ──────────────────────────────────────────────────────────── */
const bidderList = document.getElementById('bidderList');
const bidderCount = document.getElementById('bidderCount');
const searchInput = document.getElementById('searchInput');
const schemaLabel = document.getElementById('schemaLabel');
const docLink = document.getElementById('docLink');
const schemaPre = document.getElementById('schemaPre');
const paramsEditor = document.getElementById('paramsEditor');
const jsonStatus = document.getElementById('jsonStatus');
const resultArea = document.getElementById('resultArea');
const validateBtn = document.getElementById('validateBtn');
const clearBtn = document.getElementById('clearBtn');
const generateBtn = document.getElementById('generateBtn');
const bidderPanel = document.getElementById('bidderPanel');
const schemaPanel = document.getElementById('schemaPanel');
const paramsPanel = document.getElementById('paramsPanel');
const bidderCurrent = document.getElementById('bidderCurrent');

/* ── Mobile accordion ──────────────────────────────────────────────────── */
const mobileQuery = window.matchMedia('(max-width: 768px)');
const _panels = [bidderPanel, schemaPanel, paramsPanel];

function isMobile() {
  return mobileQuery.matches;
}

/**
 * Toggle a panel's collapsed state.
 * @param {HTMLElement} target
 */
function togglePanel(target) {
  target.classList.toggle('collapsed');
}

document.querySelectorAll('.panel-head').forEach((head) => {
  head.addEventListener('click', (e) => {
    if (!isMobile()) return;
    if (e.target.closest('a, button')) return;
    togglePanel(head.closest('.panel'));
  });
});

if (isMobile()) {
  bidderPanel.classList.add('collapsed');
}

/* ── URL state ─────────────────────────────────────────────────────────── */

/**
 * Parse the URL hash into { bidder, runtime, config }.
 * Expected format: #<bidder>/<runtime>/<base64-json>  e.g. #appnexus/pbjs/eyJ...
 * Any segment may be absent; missing/invalid parts return null.
 *
 * @returns {{ bidder: string|null, runtime: string|null, config: string|null }}
 */
function parseHash() {
  const raw = location.hash.slice(1); // strip leading '#'
  if (!raw) return { bidder: null, runtime: null, config: null };
  const [bidder = null, rt = null, encoded = null] = raw.split('/');

  let config = null;
  if (encoded) {
    try {
      config = atob(encoded);
      JSON.parse(config); // validate it's usable JSON before accepting
    } catch {
      config = null;
    }
  }

  return {
    bidder: bidder || null,
    runtime: ['pbjs', 'pbs'].includes(rt) ? rt : null,
    config,
  };
}

/**
 * Write the current bidder + runtime + params editor content into the URL hash
 * using replaceState so selections don't flood the browser history stack.
 * The config segment is only appended when the editor contains valid JSON.
 */
function pushHash() {
  const raw = paramsEditor.value.trim();
  let encoded = '';
  if (raw) {
    try {
      JSON.parse(raw); // only encode valid JSON
      encoded = '/' + btoa(raw);
    } catch {
      /* invalid JSON — omit config from URL */
    }
  }
  const hash = `#${currentBidder}/${runtime}${encoded}`;
  if (location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

/* ── Boot ──────────────────────────────────────────────────────────────── */
async function init() {
  const manifest = await loadManifest();
  allBidders = Object.keys(manifest.bidders)
    .sort()
    .map((code) => ({
      code,
      hasPbjs: !!manifest.bidders[code]?.pbjs?.schema,
      hasPbs: !!manifest.bidders[code]?.pbs?.schema,
    }));
  renderList('');

  // Restore state from URL hash, falling back to first bidder / default runtime.
  const { bidder: hashBidder, runtime: hashRuntime, config: hashConfig } = parseHash();
  if (hashRuntime) {
    runtime = hashRuntime;
  }
  const initial = allBidders.find((b) => b.code === hashBidder) ?? allBidders[0];
  // selectBidder clears the editor, so restore config afterwards.
  await selectBidder(initial.code, { scroll: true });
  if (hashConfig) {
    paramsEditor.value = hashConfig;
    updateJsonStatus();
    pushHash();
  }
}

// Handle browser back/forward navigation through hash changes.
window.addEventListener('hashchange', () => {
  const { bidder, runtime: rt, config } = parseHash();
  if (rt && rt !== runtime) {
    runtime = rt;
  }
  // Restore config if it changed (e.g. navigating back to a shared link).
  if (config !== null && config !== paramsEditor.value) {
    paramsEditor.value = config;
    updateJsonStatus();
  }
  if (bidder && bidder !== currentBidder) {
    selectBidder(bidder);
  }
});

/* ── Bidder list ───────────────────────────────────────────────────────── */
function renderList(filter) {
  bidderList.dataset.runtime = runtime;
  const q = filter.toLowerCase();
  const hits = allBidders.filter((b) => b.code.toLowerCase().includes(q));
  bidderCount.textContent = hits.length;

  bidderList.innerHTML = hits.length
    ? hits
        .map((b) => {
          const active = b.code === currentBidder ? 'active' : '';
          const dot = b.code === 'ci_fixture' ? '<span class="dot"></span>' : '';
          const pbjsBadge = b.hasPbjs
            ? '<span class="badge badge-pbjs" data-runtime="pbjs">pbjs</span>'
            : '<span class="badge badge-ghost">pbjs</span>';
          const pbsBadge = b.hasPbs
            ? '<span class="badge badge-pbs" data-runtime="pbs">pbs</span>'
            : '<span class="badge badge-ghost">pbs</span>';
          return `<div class="bidder-item ${active}" data-bidder="${b.code}">${dot}<span class="bidder-name">${b.code}</span><span class="bidder-badges">${pbjsBadge}${pbsBadge}</span></div>`;
        })
        .join('')
    : '<div class="list-msg">No matches.</div>';
}

bidderList.addEventListener('click', (e) => {
  const badge = e.target.closest('.badge[data-runtime]');
  const item = e.target.closest('.bidder-item');
  if (!item?.dataset.bidder) return;

  if (badge) {
    const newRuntime = badge.dataset.runtime;
    if (newRuntime !== runtime) {
      runtime = newRuntime;
    }
  }

  selectBidder(item.dataset.bidder);
});

searchInput.addEventListener('input', () => renderList(searchInput.value));

/* ── Select bidder ─────────────────────────────────────────────────────── */
async function selectBidder(bidder, { scroll = false } = {}) {
  currentBidder = bidder;

  // If the selected bidder has no schema for the current runtime but does for the
  // other, auto-switch so the user always sees a meaningful schema.
  const meta = allBidders.find((b) => b.code === bidder);
  if (meta) {
    const hasCurrentRuntime = runtime === 'pbjs' ? meta.hasPbjs : meta.hasPbs;
    const hasOtherRuntime = runtime === 'pbjs' ? meta.hasPbs : meta.hasPbjs;
    if (!hasCurrentRuntime && hasOtherRuntime) {
      runtime = runtime === 'pbjs' ? 'pbs' : 'pbjs';
    }
  }

  pushHash();

  bidderList.dataset.runtime = runtime;
  bidderList.querySelectorAll('.bidder-item').forEach((el) => el.classList.toggle('active', el.dataset.bidder === bidder));
  if (scroll) {
    bidderList.querySelector('.bidder-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  bidderCurrent.textContent = `— ${bidder}`;
  if (isMobile()) {
    bidderPanel.classList.add('collapsed');
    schemaPanel.classList.remove('collapsed');
  }

  schemaLabel.textContent = bidder;
  docLink.hidden = true;
  schemaPre.innerHTML = '<span class="muted">Loading…</span>';
  clearResult();
  paramsEditor.value = '';
  updateJsonStatus();
  renderSchemaHints(null);

  try {
    const schema = await getSchema(runtime, bidder);
    schemaPre.innerHTML = highlight(JSON.stringify(schema, null, 2));
    renderSchemaHints(schema);
    const srcUrl = schema?.['x-source-url'];
    if (srcUrl) {
      docLink.href = srcUrl;
      docLink.hidden = false;
    }
  } catch (err) {
    schemaPre.innerHTML = `<span class="err">${esc(err.message)}</span>`;
    renderSchemaHints(null);
  }
}

/* ── Params editor ─────────────────────────────────────────────────────── */

/** Debounced hash update — fires 600 ms after the user stops typing. */
let _hashDebounce = null;
function scheduleHashUpdate() {
  clearTimeout(_hashDebounce);
  _hashDebounce = setTimeout(pushHash, 600);
}

paramsEditor.addEventListener('input', () => {
  updateJsonStatus();
  scheduleHashUpdate();
});

function updateJsonStatus() {
  const val = paramsEditor.value.trim();
  if (!val) {
    jsonStatus.textContent = '';
    jsonStatus.className = 'json-status';
    return;
  }
  try {
    JSON.parse(val);
    jsonStatus.textContent = '✓ valid JSON';
    jsonStatus.className = 'json-status ok';
  } catch {
    jsonStatus.textContent = '✗ invalid JSON';
    jsonStatus.className = 'json-status err';
  }
}

/* ── Generate sample ───────────────────────────────────────────────────── */
generateBtn.addEventListener('click', runGenerate);

async function runGenerate() {
  if (!currentBidder) return;

  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating…';

  try {
    const schema = await getSchema(runtime, currentBidder);
    const sample = generateSample(schema);
    paramsEditor.value = JSON.stringify(sample, null, 2);
    updateJsonStatus();
    pushHash();
    showResult(
      'info',
      '◎',
      'Sample generated',
      `<span class="desc">Sample params for <strong>${esc(currentBidder)}</strong> <em>${runtime}</em> — edit as needed, then Validate.</span>`,
    );
  } catch (err) {
    showResult('error', '✗', 'Generate Error', `<span class="desc">${esc(err.message)}</span>`);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  }
}

/**
 * Recursively generate a sample value from a JSON Schema node.
 * Prefers `examples[0]`, then `default`, then `enum[0]`, then type-based defaults.
 *
 * allOf branches are fully merged: required arrays are unioned and properties
 * are combined, so every required field across all branches is included.
 * anyOf / oneOf use the first branch only (any single branch is valid).
 *
 * For objects, only required properties are included (or all if none are declared).
 *
 * @param {object} schema - JSON Schema node
 * @returns {*} sample value
 */
function generateSample(schema) {
  if (!schema || typeof schema !== 'object') return null;

  if (schema.examples?.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];

  // Merge all allOf branches into the working schema.
  // The common pattern in these schemas is allOf: [{required:[...]}, {required:[...]}]
  // used to declare required fields separately; merging unions all of them.
  let merged = schema;
  if (schema.allOf?.length) {
    const mergedRequired = new Set(schema.required ?? []);
    const mergedProps = { ...(schema.properties ?? {}) };
    for (const branch of schema.allOf) {
      if (branch.required) branch.required.forEach((r) => mergedRequired.add(r));
      if (branch.properties) Object.assign(mergedProps, branch.properties);
    }
    merged = {
      ...schema,
      allOf: undefined,
      properties: mergedProps,
      required: mergedRequired.size ? [...mergedRequired] : undefined,
    };
  }

  // For anyOf / oneOf, the first branch is sufficient (any single branch is valid).
  const sub = merged.anyOf?.[0] ?? merged.oneOf?.[0];
  if (sub) return generateSample({ ...merged, anyOf: undefined, oneOf: undefined, ...sub });

  const type = Array.isArray(merged.type) ? merged.type[0] : merged.type;

  switch (type) {
    case 'object': {
      const props = merged.properties ?? {};
      const required = new Set(merged.required ?? []);
      const keys = required.size ? [...required].filter((k) => k in props) : Object.keys(props);
      return Object.fromEntries(keys.map((k) => [k, generateSample(props[k])]));
    }
    case 'array':
      return merged.items ? [generateSample(merged.items)] : [];
    case 'integer':
      return merged.minimum ?? 1;
    case 'number':
      return merged.minimum ?? 1.0;
    case 'boolean':
      return true;
    case 'string':
      if (merged.format === 'uri') return 'https://example.com';
      if (merged.pattern) return merged.pattern;
      return 'example';
    default:
      return null;
  }
}

/* ── Validate ──────────────────────────────────────────────────────────── */
validateBtn.addEventListener('click', runValidate);
clearBtn.addEventListener('click', clearResult);

async function runValidate() {
  if (!currentBidder) return;

  let params;
  try {
    params = JSON.parse(paramsEditor.value || '{}');
  } catch (e) {
    showResult('error', '✗', 'Parse Error', `<span class="desc">${esc(e.message)}</span>`);
    return;
  }

  validateBtn.disabled = true;
  validateBtn.textContent = 'Validating…';

  try {
    const result = await validate(runtime, currentBidder, params);

    if (result.valid) {
      showResult(
        'valid',
        '✓',
        'Valid',
        `<span class="desc">Params conform to the <strong>${esc(currentBidder)}</strong> <em>${runtime}</em> schema.</span>`,
      );
    } else {
      const items = (result.errors ?? []).map((e) => `<li>${esc(e)}</li>`).join('');
      const n = result.errors?.length ?? 0;
      showResult('invalid', '✗', `Invalid — ${n} error${n !== 1 ? 's' : ''}`, `<ul class="error-list">${items}</ul>`);
    }
  } catch (err) {
    showResult('error', '✗', 'Error', `<span class="desc">${esc(err.message)}</span>`);
  } finally {
    validateBtn.disabled = false;
    validateBtn.textContent = 'Validate';
  }
}

function showResult(cls, icon, label, body) {
  resultArea.innerHTML = `
    <div class="result-box ${cls}">
      <div class="result-icon">${icon}</div>
      <div><div class="result-label">${label}</div>${body}</div>
    </div>`;
}

function clearResult() {
  resultArea.innerHTML = '<p class="result-idle">Enter params or press Generate, then Validate.</p>';
}

/* ── Copy schema ───────────────────────────────────────────────────────── */
document.getElementById('copyBtn').addEventListener('click', () => {
  const text = schemaPre.textContent;
  if (!text || !currentBidder) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = 'copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'copy';
      btn.classList.remove('copied');
    }, 1500);
  });
});

/* ── Copy params ────────────────────────────────────────────────────────── */
document.getElementById('copyParamsBtn').addEventListener('click', () => {
  const text = paramsEditor.value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyParamsBtn');
    btn.textContent = 'copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'copy';
      btn.classList.remove('copied');
    }, 1500);
  });
});

/* ── Schema hints ───────────────────────────────────────────────────────── */

/**
 * Render plain-English explanations of allOf / anyOf / oneOf / not / if-then-else
 * conditions found in the schema, so the user knows what constraints apply.
 *
 * @param {object|null} schema
 */
function renderSchemaHints(schema) {
  const el = document.getElementById('schemaHints');
  const rows = [];

  if (schema?.allOf?.length) {
    // allOf: ALL branches must be satisfied simultaneously.
    // Common pattern: each branch is {required:[field]} to declare separate required fields.
    const labels = schema.allOf.map(branchLabel);
    rows.push(hintRow('allOf', 'kw-all', 'All must match', labels.join('<span class="hint-sep">&amp;</span>')));
  }

  if (schema?.anyOf?.length) {
    // anyOf: AT LEAST ONE branch must be satisfied (inclusive OR).
    const labels = schema.anyOf.map(branchLabel);
    rows.push(hintRow('anyOf', 'kw-any', 'At least one of', labels.join('<span class="hint-sep">|</span>')));
  }

  if (schema?.oneOf?.length) {
    // oneOf: EXACTLY ONE branch must be satisfied (exclusive OR).
    const labels = schema.oneOf.map(branchLabel);
    rows.push(hintRow('oneOf', 'kw-one', 'Exactly one of', labels.join('<span class="hint-sep">|</span>')));
  }

  if (schema?.if) {
    // if/then/else: conditional constraint — if schema matches `if`, `then` applies; otherwise `else`.
    const thenDesc = schema.then ? ` → then: ${esc(describeSchema(schema.then))}` : '';
    const elseDesc = schema.else ? ` → else: ${esc(describeSchema(schema.else))}` : '';
    rows.push(hintRow('if/then/else', 'kw-cond', 'Conditional', `if: ${esc(describeSchema(schema.if))}${thenDesc}${elseDesc}`));
  }

  if (schema?.not) {
    // not: the params must NOT match the given schema.
    rows.push(hintRow('not', 'kw-not', 'Must not match', esc(describeSchema(schema.not))));
  }

  if (!rows.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }

  el.innerHTML = rows.join('');
  el.hidden = false;
}

/**
 * Build one hint row.
 * @param {string} kw - keyword label
 * @param {string} kwClass - CSS class for the keyword badge colour
 * @param {string} label - plain-English verb phrase
 * @param {string} desc - HTML body (field names / options)
 */
function hintRow(kw, kwClass, label, desc) {
  return `<div class="hint-row">
    <code class="hint-kw ${kwClass}">${kw}</code>
    <span class="hint-label">${label}:</span>
    <span class="hint-desc">${desc}</span>
  </div>`;
}

/**
 * Produce a short human-readable description of a schema branch.
 * If the branch is a simple {required:[...]} declaration, list the fields.
 * Otherwise fall back to the keys present.
 *
 * @param {object} branch
 * @returns {string}
 */
function branchLabel(branch) {
  const keys = Object.keys(branch).filter((k) => k !== '$comment');
  if (keys.length === 1 && branch.required?.length) {
    return `<span class="hint-fields">${branch.required.map(esc).join(', ')}</span>`;
  }
  if (branch.required?.length) {
    return `<span class="hint-fields">${branch.required.map(esc).join(', ')}</span><span class="muted"> +more</span>`;
  }
  return `<span class="muted">[${keys.join(', ')}]</span>`;
}

/** Summarise a schema node as a terse string (for if/not display). */
function describeSchema(s) {
  if (!s || typeof s !== 'object') return String(s);
  if (s.required?.length) return `required: ${s.required.join(', ')}`;
  if (s.properties) return `properties: ${Object.keys(s.properties).join(', ')}`;
  return JSON.stringify(s);
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Minimal JSON syntax highlighter. */
function highlight(json) {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (m) => {
      if (/^"/.test(m)) return /:$/.test(m) ? `<span class="k">${m}</span>` : `<span class="s">${m}</span>`;
      if (/true|false/.test(m)) return `<span class="b">${m}</span>`;
      if (/null/.test(m)) return `<span class="n">${m}</span>`;
      return `<span class="d">${m}</span>`;
    });
}

init();
