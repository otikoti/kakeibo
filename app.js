const STORAGE_KEY = "free-household-ledger-v1";
const SYNC_URL_KEY = "free-household-ledger-sync-url-v1";

const form = document.querySelector("#entryForm");
const entryId = document.querySelector("#entryId");
const dateInput = document.querySelector("#date");
const bankInput = document.querySelector("#bank");
const partnerInput = document.querySelector("#partner");
const categoryInput = document.querySelector("#category");
const amountInput = document.querySelector("#amount");
const memoInput = document.querySelector("#memo");
const monthFilter = document.querySelector("#monthFilter");
const searchInput = document.querySelector("#search");
const entriesEl = document.querySelector("#entries");
const incomeTotal = document.querySelector("#incomeTotal");
const expenseTotal = document.querySelector("#expenseTotal");
const balanceTotal = document.querySelector("#balanceTotal");
const entryCount = document.querySelector("#entryCount");
const monthLabel = document.querySelector("#monthLabel");
const bankOptions = document.querySelector("#bankOptions");
const partnerOptions = document.querySelector("#partnerOptions");
const syncUrlInput = document.querySelector("#syncUrl");
const syncStatus = document.querySelector("#syncStatus");

let entries = loadEntries();
let syncTimer = null;

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return today().slice(0, 7);
}

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadSyncUrl() {
  return localStorage.getItem(SYNC_URL_KEY) || "";
}

function saveSyncUrl() {
  const url = syncUrlInput.value.trim();
  localStorage.setItem(SYNC_URL_KEY, url);
  setSyncStatus(url ? "設定済み" : "未設定");
}

function formatYen(value) {
  return yen.format(value);
}

function selectedType() {
  return new FormData(form).get("type");
}

function setSelectedType(type) {
  document.querySelector(`input[name="type"][value="${type}"]`).checked = true;
}

function resetForm() {
  form.reset();
  entryId.value = "";
  dateInput.value = today();
  setSelectedType("expense");
  categoryInput.value = "食費";
  partnerInput.focus();
}

function filteredEntries() {
  const month = monthFilter.value;
  const query = searchInput.value.trim().toLowerCase();

  return entries
    .filter((entry) => !entry.deleted)
    .filter((entry) => !month || entry.date.startsWith(month))
    .filter((entry) => {
      if (!query) return true;
      return [entry.bank, entry.partner, entry.category, entry.memo]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function renderOptions() {
  const activeEntries = entries.filter((entry) => !entry.deleted);
  const banks = [...new Set(activeEntries.map((entry) => entry.bank).filter(Boolean))].sort();
  const partners = [...new Set(activeEntries.map((entry) => entry.partner).filter(Boolean))].sort();

  bankOptions.innerHTML = banks.map((bank) => `<option value="${escapeHtml(bank)}"></option>`).join("");
  partnerOptions.innerHTML = partners.map((partner) => `<option value="${escapeHtml(partner)}"></option>`).join("");
}

function render() {
  const visible = filteredEntries();
  const income = visible
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expense = visible
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);

  incomeTotal.textContent = formatYen(income);
  expenseTotal.textContent = formatYen(expense);
  balanceTotal.textContent = formatYen(income - expense);
  entryCount.textContent = `${visible.length}件`;
  monthLabel.textContent = monthFilter.value ? `${monthFilter.value} の記録` : "すべての記録";

  if (!visible.length) {
    entriesEl.innerHTML = '<p class="empty">まだ明細がありません</p>';
    renderOptions();
    return;
  }

  entriesEl.innerHTML = visible.map((entry) => {
    const sign = entry.type === "income" ? "+" : "-";
    const bank = entry.bank ? `${escapeHtml(entry.bank)} / ` : "";
    const memo = entry.memo ? ` / ${escapeHtml(entry.memo)}` : "";
    return `
      <article class="entry">
        <div class="entry-main">
          <div class="entry-title">
            <strong>${escapeHtml(entry.partner)}</strong>
            <span class="pill">${escapeHtml(entry.category)}</span>
          </div>
          <div class="meta">${entry.date} / ${bank}${escapeHtml(entry.type === "income" ? "収入" : "支出")}${memo}</div>
        </div>
        <div class="amount ${entry.type}">${sign}${formatYen(entry.amount)}</div>
        <div class="entry-actions">
          <button type="button" data-action="edit" data-id="${entry.id}">編集</button>
          <button class="danger" type="button" data-action="delete" data-id="${entry.id}">削除</button>
        </div>
      </article>
    `;
  }).join("");

  renderOptions();
}

function setSyncStatus(message) {
  syncStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function upsertEntry(event) {
  event.preventDefault();

  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const now = new Date().toISOString();
  const item = {
    id: entryId.value || crypto.randomUUID(),
    type: selectedType(),
    date: dateInput.value,
    bank: bankInput.value.trim(),
    partner: partnerInput.value.trim(),
    category: categoryInput.value,
    amount: Math.round(amount),
    memo: memoInput.value.trim(),
    createdAt: entryId.value ? entries.find((entry) => entry.id === entryId.value)?.createdAt || now : now,
    updatedAt: now,
    deleted: false
  };

  entries = entries.filter((entry) => entry.id !== item.id).concat(item);
  saveEntries();
  queueSync();
  resetForm();
  render();
  setSyncStatus(loadSyncUrl() ? "保存済み・同期待ち" : "端末内に保存");
}

function editEntry(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;

  entryId.value = entry.id;
  setSelectedType(entry.type);
  dateInput.value = entry.date;
  bankInput.value = entry.bank;
  partnerInput.value = entry.partner;
  categoryInput.value = entry.category;
  amountInput.value = entry.amount;
  memoInput.value = entry.memo;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteEntry(id) {
  if (!confirm("この明細を削除しますか？")) return;
  const now = new Date().toISOString();
  entries = entries.map((entry) => entry.id === id ? { ...entry, deleted: true, updatedAt: now } : entry);
  saveEntries();
  queueSync();
  render();
}

function exportCsv() {
  const rows = [["日付", "入出金", "銀行名", "取引先名", "分類", "金額", "メモ"]];
  filteredEntries().forEach((entry) => {
    rows.push([
      entry.date,
      entry.type === "income" ? "収入" : "支出",
      entry.bank,
      entry.partner,
      entry.category,
      entry.amount,
      entry.memo
    ]);
  });

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `家計簿_${monthFilter.value || "all"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted && char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((line) => line.some((value) => value.trim()));
}

async function importCsv(file) {
  const text = await file.text();
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const dataRows = rows[0]?.[0] === "日付" ? rows.slice(1) : rows;
  const now = new Date().toISOString();
  const imported = dataRows.map((row) => ({
    id: crypto.randomUUID(),
    date: row[0] || today(),
    type: row[1] === "収入" || row[1] === "income" ? "income" : "expense",
    bank: row[2] || "",
    partner: row[3] || "未入力",
    category: row[4] || "その他",
    amount: Math.max(1, Math.round(Number(row[5]) || 0)),
    memo: row[6] || "",
    createdAt: now,
    updatedAt: now,
    deleted: false
  })).filter((entry) => entry.amount > 0);

  entries = entries.concat(imported);
  saveEntries();
  queueSync();
  render();
}

function mergeEntries(remoteEntries) {
  const byId = new Map();
  [...entries, ...remoteEntries].forEach((entry) => {
    const current = byId.get(entry.id);
    if (!current || String(entry.updatedAt || "").localeCompare(String(current.updatedAt || "")) > 0) {
      byId.set(entry.id, normalizeEntry(entry));
    }
  });
  entries = [...byId.values()];
  saveEntries();
}

function normalizeEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    type: entry.type === "income" ? "income" : "expense",
    date: entry.date || today(),
    bank: entry.bank || "",
    partner: entry.partner || "未入力",
    category: entry.category || "その他",
    amount: Math.max(1, Math.round(Number(entry.amount) || 0)),
    memo: entry.memo || "",
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
    deleted: entry.deleted === true || entry.deleted === "true"
  };
}

function queueSync() {
  if (!loadSyncUrl()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow({ quiet: true }), 800);
}

function fetchRemoteEntries(url) {
  return jsonpRequest(url).then((data) => Array.isArray(data.entries) ? data.entries : []);
}

function jsonpRequest(url, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `ledgerSync${Date.now()}${Math.round(Math.random() * 100000)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("同期先から応答がありません"));
    }, 12000);

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data || {});
    };

    const remoteUrl = new URL(url);
    Object.entries(params).forEach(([key, value]) => remoteUrl.searchParams.set(key, value));
    remoteUrl.searchParams.set("callback", callbackName);
    remoteUrl.searchParams.set("t", Date.now());
    script.onerror = () => {
      cleanup();
      reject(new Error("同期先を読み込めません"));
    };
    script.src = remoteUrl.toString();
    document.body.append(script);
  });
}

async function pushEntries(url) {
  const activeCount = entries.filter((entry) => !entry.deleted).length;
  setSyncStatus(`${activeCount}件を送信中...`);
  const data = await jsonpRequest(url, {
    action: "replace",
    payload: JSON.stringify({ entries })
  });
  if (!data.ok) throw new Error("同期先に保存できませんでした");
}

async function syncNow(options = {}) {
  const url = loadSyncUrl();
  if (!url) {
    setSyncStatus("未設定");
    return;
  }

  try {
    setSyncStatus("読み込み中...");
    const remoteEntries = await fetchRemoteEntries(url);
    mergeEntries(remoteEntries);
    render();
    await pushEntries(url);
    const confirmedEntries = await fetchRemoteEntries(url);
    mergeEntries(confirmedEntries);
    render();
    const activeCount = entries.filter((entry) => !entry.deleted).length;
    setSyncStatus(`同期済み ${activeCount}件 ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (error) {
    setSyncStatus(options.quiet ? `同期待ち: ${error.message}` : "同期エラー");
    if (!options.quiet) alert(error.message);
  }
}

form.addEventListener("submit", upsertEntry);
document.querySelector("#resetButton").addEventListener("click", resetForm);
document.querySelector("#exportButton").addEventListener("click", exportCsv);
monthFilter.addEventListener("input", render);
searchInput.addEventListener("input", render);

entriesEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit") editEntry(button.dataset.id);
  if (button.dataset.action === "delete") deleteEntry(button.dataset.id);
});

document.querySelector("#clearAllButton").addEventListener("click", () => {
  const activeEntries = entries.filter((entry) => !entry.deleted);
  if (!activeEntries.length || !confirm("すべての明細を削除しますか？")) return;
  const now = new Date().toISOString();
  entries = entries.map((entry) => ({ ...entry, deleted: true, updatedAt: now }));
  saveEntries();
  queueSync();
  render();
});

document.querySelector("#importFile").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importCsv(file);
  event.target.value = "";
});

dateInput.value = today();
monthFilter.value = currentMonth();
syncUrlInput.value = loadSyncUrl();
setSyncStatus(syncUrlInput.value ? "設定済み" : "未設定");
render();

document.querySelector("#saveSyncButton").addEventListener("click", () => {
  saveSyncUrl();
  syncNow();
});

document.querySelector("#syncNowButton").addEventListener("click", () => syncNow());

if (syncUrlInput.value) {
  syncNow({ quiet: true });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
