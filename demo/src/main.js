import "./style.css";
import { listBidders, getSchema, validate } from "./validator.js";

/* ── State ─────────────────────────────────────────────────────────────── */
let allBidders = [];
let currentBidder = null;
let runtime = "pbjs";

/* ── DOM refs ──────────────────────────────────────────────────────────── */
const bidderList = document.getElementById("bidderList");
const bidderCount = document.getElementById("bidderCount");
const searchInput = document.getElementById("searchInput");
const schemaLabel = document.getElementById("schemaLabel");
const schemaPre = document.getElementById("schemaPre");
const paramsEditor = document.getElementById("paramsEditor");
const jsonStatus = document.getElementById("jsonStatus");
const resultArea = document.getElementById("resultArea");
const validateBtn = document.getElementById("validateBtn");
const clearBtn = document.getElementById("clearBtn");

/* ── Boot ──────────────────────────────────────────────────────────────── */
async function init() {
  allBidders = await listBidders();
  renderList("");
  selectBidder(allBidders[0]);
}

/* ── Bidder list ───────────────────────────────────────────────────────── */
function renderList(filter) {
  const q = filter.toLowerCase();
  const hits = allBidders.filter((b) => b.toLowerCase().includes(q));
  bidderCount.textContent = hits.length;

  bidderList.innerHTML = hits.length
    ? hits
        .map((b) => {
          const active = b === currentBidder ? "active" : "";
          const dot = b === "ci_fixture" ? '<span class="dot"></span>' : "";
          return `<div class="bidder-item ${active}" data-bidder="${b}">${dot}${b}</div>`;
        })
        .join("")
    : '<div class="list-msg">No matches.</div>';
}

bidderList.addEventListener("click", (e) => {
  const item = e.target.closest(".bidder-item");
  if (item?.dataset.bidder) selectBidder(item.dataset.bidder);
});

searchInput.addEventListener("input", () => renderList(searchInput.value));

/* ── Select bidder ─────────────────────────────────────────────────────── */
async function selectBidder(bidder) {
  currentBidder = bidder;

  bidderList
    .querySelectorAll(".bidder-item")
    .forEach((el) => el.classList.toggle("active", el.dataset.bidder === bidder));

  schemaLabel.textContent = bidder;
  schemaPre.innerHTML = '<span class="muted">Loading…</span>';
  clearResult();
  paramsEditor.value = "";
  updateJsonStatus();

  try {
    const schema = await getSchema(runtime, bidder);
    schemaPre.innerHTML = highlight(JSON.stringify(schema, null, 2));
  } catch (err) {
    schemaPre.innerHTML = `<span class="err">${esc(err.message)}</span>`;
  }
}

/* ── Runtime toggle ────────────────────────────────────────────────────── */
document.getElementById("runtimeToggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".rt-btn");
  if (!btn || btn.dataset.runtime === runtime) return;
  runtime = btn.dataset.runtime;
  document
    .querySelectorAll(".rt-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.runtime === runtime));
  if (currentBidder) selectBidder(currentBidder);
});

/* ── Params editor ─────────────────────────────────────────────────────── */
paramsEditor.addEventListener("input", updateJsonStatus);

function updateJsonStatus() {
  const val = paramsEditor.value.trim();
  if (!val) {
    jsonStatus.textContent = "";
    jsonStatus.className = "json-status";
    return;
  }
  try {
    JSON.parse(val);
    jsonStatus.textContent = "✓ valid JSON";
    jsonStatus.className = "json-status ok";
  } catch {
    jsonStatus.textContent = "✗ invalid JSON";
    jsonStatus.className = "json-status err";
  }
}

/* ── Validate ──────────────────────────────────────────────────────────── */
validateBtn.addEventListener("click", runValidate);
clearBtn.addEventListener("click", clearResult);

async function runValidate() {
  if (!currentBidder) return;

  let params;
  try {
    params = JSON.parse(paramsEditor.value || "{}");
  } catch (e) {
    showResult("error", "✗", "Parse Error", `<span class="desc">${esc(e.message)}</span>`);
    return;
  }

  validateBtn.disabled = true;
  validateBtn.textContent = "Validating…";

  try {
    const result = await validate(runtime, currentBidder, params);

    if (result.valid) {
      showResult(
        "valid",
        "✓",
        "Valid",
        `<span class="desc">Params conform to the <strong>${esc(currentBidder)}</strong> <em>${runtime}</em> schema.</span>`
      );
    } else {
      const items = (result.errors ?? []).map((e) => `<li>${esc(e)}</li>`).join("");
      const n = result.errors?.length ?? 0;
      showResult(
        "invalid",
        "✗",
        `Invalid — ${n} error${n !== 1 ? "s" : ""}`,
        `<ul class="error-list">${items}</ul>`
      );
    }
  } catch (err) {
    showResult("error", "✗", "Error", `<span class="desc">${esc(err.message)}</span>`);
  } finally {
    validateBtn.disabled = false;
    validateBtn.textContent = "Validate";
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
  resultArea.innerHTML = '<p class="result-idle">Enter params and press Validate.</p>';
}

/* ── Copy schema ───────────────────────────────────────────────────────── */
document.getElementById("copyBtn").addEventListener("click", () => {
  const text = schemaPre.textContent;
  if (!text || !currentBidder) return;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById("copyBtn");
    btn.textContent = "copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "copy";
      btn.classList.remove("copied");
    }, 1500);
  });
});

/* ── Helpers ───────────────────────────────────────────────────────────── */
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal JSON syntax highlighter. */
function highlight(json) {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (m) => {
        if (/^"/.test(m))
          return /:$/.test(m) ? `<span class="k">${m}</span>` : `<span class="s">${m}</span>`;
        if (/true|false/.test(m)) return `<span class="b">${m}</span>`;
        if (/null/.test(m)) return `<span class="n">${m}</span>`;
        return `<span class="d">${m}</span>`;
      }
    );
}

init();
