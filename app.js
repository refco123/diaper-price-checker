const STORAGE_KEY = "diaper-price-checker:v1";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // The app still works without offline caching.
    });
  });
}

const els = {
  preview: document.querySelector("#preview"),
  nativeCameraInput: document.querySelector("#nativeCameraInput"),
  emptyPreview: document.querySelector("#emptyPreview"),
  tabButtons: document.querySelectorAll(".tab-button[data-tab]"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  runOcr: document.querySelector("#runOcr"),
  ocrStatus: document.querySelector("#ocrStatus"),
  form: document.querySelector("#priceForm"),
  productName: document.querySelector("#productName"),
  size: document.querySelector("#size"),
  count: document.querySelector("#count"),
  price: document.querySelector("#price"),
  coupon: document.querySelector("#coupon"),
  cashback: document.querySelector("#cashback"),
  store: document.querySelector("#store"),
  date: document.querySelector("#date"),
  memo: document.querySelector("#memo"),
  netPrice: document.querySelector("#netPrice"),
  unitPrice: document.querySelector("#unitPrice"),
  bestCompare: document.querySelector("#bestCompare"),
  sampleFill: document.querySelector("#sampleFill"),
  clearForm: document.querySelector("#clearForm"),
  clearHistory: document.querySelector("#clearHistory"),
  exportCsv: document.querySelector("#exportCsv"),
  filterSize: document.querySelector("#filterSize"),
  bestList: document.querySelector("#bestList"),
  historyList: document.querySelector("#historyList"),
  template: document.querySelector("#historyItemTemplate"),
};

let imageDataUrl = "";
let history = loadHistory();

els.date.valueAsDate = new Date();

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function createId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function yen(value) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function unit(value) {
  return `${value.toFixed(2)}円`;
}

function getNumbers() {
  const count = Number(els.count.value || 0);
  const price = Number(els.price.value || 0);
  const coupon = Number(els.coupon.value || 0);
  const cashback = Number(els.cashback.value || 0);
  const net = Math.max(0, price - coupon - cashback);
  const unitPrice = count > 0 ? net / count : 0;
  return { count, price, coupon, cashback, net, unitPrice };
}

function bestKey(record) {
  return `${record.productName.trim().toLowerCase()}|${record.size}`;
}

function findBestForCurrent() {
  const productName = els.productName.value.trim().toLowerCase();
  const size = els.size.value;
  if (!productName || !size) return null;
  return history
    .filter((item) => item.productName.trim().toLowerCase() === productName && item.size === size)
    .sort((a, b) => a.unitPrice - b.unitPrice)[0] ?? null;
}

function updateCalculated() {
  const { net, unitPrice } = getNumbers();
  els.netPrice.textContent = yen(net);
  els.unitPrice.textContent = unit(unitPrice);

  const best = findBestForCurrent();
  if (!best || unitPrice === 0) {
    els.bestCompare.textContent = best ? `最安 ${unit(best.unitPrice)}` : "未記録";
    els.bestCompare.style.color = "";
    return;
  }

  const diff = unitPrice - best.unitPrice;
  if (diff <= -0.005) {
    els.bestCompare.textContent = `${unit(Math.abs(diff))}安い`;
    els.bestCompare.style.color = "var(--good)";
  } else if (Math.abs(diff) < 0.005) {
    els.bestCompare.textContent = "最安と同じ";
    els.bestCompare.style.color = "var(--good)";
  } else {
    els.bestCompare.textContent = `${unit(diff)}高い`;
    els.bestCompare.style.color = "var(--warn)";
  }
}

function switchTab(tabName) {
  els.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  els.tabPanels.forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function setImage(dataUrl) {
  imageDataUrl = dataUrl;
  els.preview.src = dataUrl;
  els.preview.hidden = false;
  els.emptyPreview.hidden = true;
}

function parseText(text) {
  const normalized = text.replace(/[,\s]/g, "");
  const yenMatches = [...normalized.matchAll(/([0-9]{2,6})円/g)].map((match) => Number(match[1]));
  const countMatch = normalized.match(/([0-9]{1,3})(枚|個入|枚入)/);
  const sizeMatch = normalized.match(/(新生児|Bigより大きい|BIGより大きい|Big|BIG|[SML])/);

  if (yenMatches.length) els.price.value = Math.max(...yenMatches);
  if (countMatch) els.count.value = countMatch[1];
  if (sizeMatch) {
    const size = sizeMatch[1].replace("BIG", "Big");
    els.size.value = size;
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && !/[0-9]{2,}/.test(line));
  if (!els.productName.value && lines[0]) els.productName.value = lines[0].slice(0, 60);
  updateCalculated();
}

async function runOcr() {
  if (!imageDataUrl) {
    els.ocrStatus.textContent = "先にカメラで撮影してください。";
    return;
  }

  if (!("TextDetector" in window)) {
    els.ocrStatus.textContent =
      "このブラウザは画像内テキスト読取に未対応です。画像を見ながら商品名・枚数・金額を入力してください。";
    return;
  }

  els.ocrStatus.textContent = "画像を読み取っています...";
  const img = new Image();
  img.src = imageDataUrl;
  await img.decode();
  const detector = new TextDetector();
  const result = await detector.detect(img);
  const text = result.map((item) => item.rawValue).join("\n");
  if (!text) {
    els.ocrStatus.textContent = "文字を検出できませんでした。正面から明るく撮ると読み取りやすくなります。";
    return;
  }
  parseText(text);
  els.ocrStatus.textContent = `読取候補を反映しました: ${text.slice(0, 90)}`;
}

function recordFromForm() {
  const numbers = getNumbers();
  return {
    id: createId(),
    productName: els.productName.value.trim(),
    size: els.size.value,
    count: numbers.count,
    price: numbers.price,
    coupon: numbers.coupon,
    cashback: numbers.cashback,
    net: numbers.net,
    unitPrice: numbers.unitPrice,
    store: els.store.value.trim(),
    date: els.date.value,
    memo: els.memo.value.trim(),
    imageDataUrl,
    createdAt: new Date().toISOString(),
  };
}

function fillSample() {
  const sampleDate = new Date().toISOString().slice(0, 10);
  const benchmark = {
    id: createId(),
    productName: "メリーズ エアスルー",
    size: "L",
    count: 54,
    price: 1680,
    coupon: 120,
    cashback: 40,
    net: 1520,
    unitPrice: 1520 / 54,
    store: "過去サンプル",
    date: sampleDate,
    memo: "比較用の過去価格",
    imageDataUrl: "",
    createdAt: new Date(Date.now() - 1000).toISOString(),
  };

  const hasBenchmark = history.some(
    (item) => item.productName === benchmark.productName && item.size === benchmark.size && item.store === benchmark.store
  );
  if (!hasBenchmark) {
    history.push(benchmark);
    saveHistory();
  }

  els.productName.value = "メリーズ エアスルー";
  els.size.value = "L";
  els.count.value = "54";
  els.price.value = "1580";
  els.coupon.value = "150";
  els.cashback.value = "80";
  els.store.value = "サンプル店舗";
  els.date.value = sampleDate;
  els.memo.value = "サンプル: 実質1350円、1枚25.00円";
  els.ocrStatus.textContent = "サンプルを入力しました。過去サンプル最安と比較できます。";
  render();
}

function clearForm() {
  els.form.reset();
  els.date.valueAsDate = new Date();
  els.coupon.value = "0";
  els.cashback.value = "0";
  imageDataUrl = "";
  els.preview.hidden = true;
  els.emptyPreview.hidden = false;
  updateCalculated();
}

function renderBest() {
  const filterSize = els.filterSize.value;
  const bestByKey = new Map();

  for (const item of history) {
    if (filterSize && item.size !== filterSize) continue;
    const key = bestKey(item);
    const current = bestByKey.get(key);
    if (!current || item.unitPrice < current.unitPrice) bestByKey.set(key, item);
  }

  const bestItems = [...bestByKey.values()].sort((a, b) => a.unitPrice - b.unitPrice);
  els.bestList.innerHTML = "";

  if (!bestItems.length) {
    els.bestList.innerHTML = '<div class="empty-state">保存した履歴から最安値が表示されます。</div>';
    return;
  }

  for (const item of bestItems) {
    const card = document.createElement("article");
    card.className = "best-card";
    card.innerHTML = `
      <span>${item.productName} / ${item.size}</span>
      <strong>${unit(item.unitPrice)}</strong>
      <span>${item.count}枚 ${yen(item.net)} / ${item.store || "店舗未入力"} / ${item.date}</span>
    `;
    els.bestList.append(card);
  }
}

function renderHistory() {
  els.historyList.innerHTML = "";

  if (!history.length) {
    els.historyList.innerHTML = '<div class="empty-state">撮影後、商品情報を保存するとここに履歴が残ります。</div>';
    return;
  }

  for (const item of [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const node = els.template.content.cloneNode(true);
    const date = new Date(`${item.date}T00:00:00`);
    const dateText = Number.isNaN(date.getTime())
      ? item.date
      : date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
    node.querySelector(".item-date strong").textContent = dateText;
    node.querySelector(".item-date span").textContent = item.store || "店舗未入力";
    node.querySelector("h3").textContent = `${item.productName} / ${item.size}`;
    const tags = node.querySelectorAll(".item-tags span");
    tags[0].textContent = `${item.count}枚`;
    tags[1].textContent = `店頭 ${yen(item.price)} / 値引 ${yen(item.coupon)} / CB ${yen(item.cashback)}`;
    node.querySelector(".item-note").textContent = item.memo;
    node.querySelector(".item-price strong").textContent = yen(item.net);
    node.querySelector(".item-price span").textContent = `${unit(item.unitPrice)} / 枚`;
    node.querySelector("button").addEventListener("click", () => {
      history = history.filter((record) => record.id !== item.id);
      saveHistory();
      render();
    });
    els.historyList.append(node);
  }
}

function render() {
  renderBest();
  renderHistory();
  updateCalculated();
}

function exportCsv() {
  const header = ["日付", "商品名", "サイズ", "枚数", "価格", "クーポン", "CB", "実質価格", "1枚単価", "店舗", "メモ"];
  const rows = history.map((item) => [
    item.date,
    item.productName,
    item.size,
    item.count,
    item.price,
    item.coupon,
    item.cashback,
    item.net,
    item.unitPrice.toFixed(2),
    item.store,
    item.memo,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `diaper-price-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

els.nativeCameraInput.addEventListener("click", () => {
  els.nativeCameraInput.value = "";
  els.ocrStatus.textContent = "スマホのカメラで商品と値札を撮影してください。";
});
els.nativeCameraInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    setImage(String(reader.result));
    switchTab("check");
    els.ocrStatus.textContent = "撮影画像を読み込みました。必要なら読取を押してください。";
  });
  reader.readAsDataURL(file);
});
els.runOcr.addEventListener("click", () => {
  runOcr().catch((error) => {
    els.ocrStatus.textContent = `読取に失敗しました: ${error.message}`;
  });
});
els.tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});
els.form.addEventListener("input", updateCalculated);
els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const record = recordFromForm();
  if (!record.productName || !record.size || !record.count || !record.price) return;
  history.push(record);
  saveHistory();
  render();
  clearForm();
  switchTab("history");
});
els.sampleFill.addEventListener("click", () => {
  try {
    fillSample();
  } catch (error) {
    els.ocrStatus.textContent = `サンプル入力に失敗しました: ${error.message}`;
  }
});
els.clearForm.addEventListener("click", clearForm);
els.clearHistory.addEventListener("click", () => {
  if (!history.length) return;
  if (!confirm("履歴をすべて削除しますか？")) return;
  history = [];
  saveHistory();
  render();
});
els.exportCsv.addEventListener("click", exportCsv);
els.filterSize.addEventListener("change", renderBest);

render();
