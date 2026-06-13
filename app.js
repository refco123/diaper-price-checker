const STORAGE_KEY = "diaper-price-checker:v1";
const GEMINI_KEY_STORAGE = "diaper-price-checker:gemini-key";
const GEMINI_MODEL = "gemini-2.5-flash";

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
  imageInput: document.querySelector("#imageInput"),
  emptyPreview: document.querySelector("#emptyPreview"),
  tabButtons: document.querySelectorAll(".tab-button[data-tab]"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  runOcr: document.querySelector("#runOcr"),
  ocrStatus: document.querySelector("#ocrStatus"),
  geminiStatus: document.querySelector("#geminiStatus"),
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
  clearForm: document.querySelector("#clearForm"),
  clearHistory: document.querySelector("#clearHistory"),
  exportCsv: document.querySelector("#exportCsv"),
  refreshApp: document.querySelector("#refreshApp"),
  filterSize: document.querySelector("#filterSize"),
  bestList: document.querySelector("#bestList"),
  historyList: document.querySelector("#historyList"),
  template: document.querySelector("#historyItemTemplate"),
  imageViewer: document.querySelector("#imageViewer"),
  viewerImage: document.querySelector("#viewerImage"),
};

let imageDataUrl = "";
let history = loadHistory();
let historyRenderSignature = "";

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
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
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

function openFileInput(input, message) {
  input.value = "";
  input.click();
  els.ocrStatus.textContent = message;
}

function handleImageFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    const loadedImage = String(reader.result);
    const compressedImage = await resizeImageDataUrl(loadedImage, 900, 0.72);
    setImage(`data:image/jpeg;base64,${compressedImage}`);
    switchTab("check");
    els.ocrStatus.textContent = "画像を読み込みました。必要なら読取を押してください。";
  });
  reader.readAsDataURL(file);
}

function getGeminiKey() {
  let key = localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  if (!key) {
    key = prompt("このブラウザ用のGemini APIキーを入力してください。端末内に保存され、GitHubには保存されません。スマホとPCブラウザでは別々に設定が必要です。") || "";
    key = key.trim();
    if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key);
  }
  updateGeminiStatus();
  return key;
}

function setGeminiKey() {
  const currentKey = localStorage.getItem(GEMINI_KEY_STORAGE) || "";
  const key = prompt("Gemini APIキーを入力してください。空欄で保存するとGeminiをOFFにします。", currentKey) ?? currentKey;
  const trimmedKey = key.trim();
  if (trimmedKey) {
    localStorage.setItem(GEMINI_KEY_STORAGE, trimmedKey);
    els.ocrStatus.textContent = "Gemini APIキーをこのブラウザに保存しました。";
  } else {
    localStorage.removeItem(GEMINI_KEY_STORAGE);
    els.ocrStatus.textContent = "Gemini APIキーを削除しました。ローカルOCRで読み取ります。";
  }
  updateGeminiStatus();
}

function updateGeminiStatus(extra = "") {
  const hasKey = Boolean(localStorage.getItem(GEMINI_KEY_STORAGE));
  els.geminiStatus.dataset.ready = String(hasKey);
  els.geminiStatus.textContent = hasKey
    ? `Gemini: ON（このブラウザで使用）${extra}`
    : "Gemini: OFF（PCブラウザ・スマホごとに設定が必要）";
}

async function loadImage(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return img;
}

function resizeImageDataUrl(dataUrl, maxSize = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > height && width > maxSize) {
        height = Math.round(height * (maxSize / width));
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round(width * (maxSize / height));
        height = maxSize;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function preprocessImage(img, options = {}) {
  const scale = options.scale || 2;
  const crop = options.crop || { x: 0, y: 0, width: 1, height: 1 };
  const sourceX = Math.round(img.naturalWidth * crop.x);
  const sourceY = Math.round(img.naturalHeight * crop.y);
  const sourceWidth = Math.round(img.naturalWidth * crop.width);
  const sourceHeight = Math.round(img.naturalHeight * crop.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sourceWidth * scale);
  canvas.height = Math.max(1, sourceHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const contrast = options.contrast || 1.35;
  const brightness = options.brightness || 12;
  for (let index = 0; index < image.data.length; index += 4) {
    const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    const adjusted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128 + brightness));
    const value = options.threshold ? (adjusted > options.threshold ? 255 : 0) : adjusted;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function extractAmounts(text) {
  const compact = text.replace(/[，]/g, ",").replace(/[￥¥]/g, "円");
  const matches = [...compact.matchAll(/(?:税込|税抜|各)?\s*([0-9]{1,3}(?:,[0-9]{3})|[0-9]{3,6})\s*円?/g)];
  return matches
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter((value) => value >= 100 && value <= 50000);
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSONを取得できませんでした");
    return JSON.parse(match[0]);
  }
}

function applyGeminiResult(result) {
  if (result.productName) els.productName.value = String(result.productName).slice(0, 80);
  if (result.size) {
    const normalizedSize = String(result.size).replace("BIG", "Big");
    const option = [...els.size.options].find((item) => item.value === normalizedSize || item.textContent === normalizedSize);
    if (option) els.size.value = option.value || option.textContent;
  }
  if (Number(result.count) > 0) els.count.value = String(Number(result.count));
  if (Number(result.price) > 0) els.price.value = String(Number(result.price));
  if (result.store && !els.store.value) els.store.value = String(result.store).slice(0, 40);
  if (result.memo) els.memo.value = String(result.memo).slice(0, 160);
  updateCalculated();
}

async function runGeminiOcr() {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("Gemini APIキーが未設定です");
  els.ocrStatus.textContent = "Geminiで商品と値札を解析しています...";
  const base64Image = await resizeImageDataUrl(imageDataUrl);
  const prompt = `
あなたは日本のドラッグストアやスーパーのオムツ棚を読む専門OCRです。
画像から、オムツの商品パッケージと値札を解析してください。

返答はJSONだけにしてください。
{
  "productName": "商品名。例: パンパース はじめての肌へのいちばん",
  "size": "新生児/S/M/L/Big/Bigより大きい/おやすみ のどれか。不明なら空文字",
  "count": 60,
  "price": 1848,
  "store": "店舗名が見えれば。なければ空文字",
  "memo": "判断根拠を短く。例: 値札は税込1,848円、左の商品は新生児60枚",
  "confidence": 0.0
}

重要:
- price は税込価格を優先してください。税込が見えなければ税抜価格。
- 値札に「各」とある場合は該当商品の価格として扱ってください。
- 画像内に複数商品がある場合は、中央または最も大きく写っている商品を優先してください。
- count はパッケージに書かれた枚数です。
- 推測できない項目は空文字または0にしてください。
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/jpeg", data: base64Image } },
        ],
      }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) localStorage.removeItem(GEMINI_KEY_STORAGE);
    updateGeminiStatus(` / API Error ${response.status}`);
    const detail = response.status === 403
      ? "APIキーの制限にこのURLを許可する必要があります"
      : `Gemini API Error: ${response.status}`;
    throw new Error(detail);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const result = extractJson(text);
  applyGeminiResult(result);
  updateGeminiStatus(" / 最終読取: Gemini");
  els.ocrStatus.textContent = `Gemini読取を反映しました。${result.memo || "違う場合は手入力で直してください。"}`;
}

function parseText(text) {
  const normalized = text.replace(/[,\s]/g, "");
  const yenMatches = extractAmounts(text);
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

  try {
    await runGeminiOcr();
    return;
  } catch (error) {
    updateGeminiStatus(` / Gemini失敗: ${error.message}`);
    els.ocrStatus.textContent = `${error.message} ローカルOCRに切り替えます...`;
  }

  els.ocrStatus.textContent = "ローカルOCRで画像を読み取っています...";
  const img = await loadImage(imageDataUrl);

  let text = "";
  if ("TextDetector" in window) {
    const detector = new TextDetector();
    const result = await detector.detect(img);
    text = result.map((item) => item.rawValue).join("\n");
  } else if (window.Tesseract?.recognize) {
    const fullImage = preprocessImage(img, { scale: 1.8, contrast: 1.35, brightness: 8 });
    const priceStrip = preprocessImage(img, {
      scale: 3,
      crop: { x: 0, y: 0.42, width: 1, height: 0.36 },
      contrast: 1.75,
      brightness: 18,
      threshold: 145,
    });

    const fullResult = await Tesseract.recognize(fullImage, "jpn+eng", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          els.ocrStatus.textContent = `商品情報を読み取っています... ${Math.round(message.progress * 100)}%`;
        }
      },
    });

    const priceResult = await Tesseract.recognize(priceStrip, "eng", {
      tessedit_char_whitelist: "0123456789,円税込税抜各￥¥.",
      logger: (message) => {
        if (message.status === "recognizing text") {
          els.ocrStatus.textContent = `値札を読み取っています... ${Math.round(message.progress * 100)}%`;
        }
      },
    });

    text = `${fullResult.data?.text || ""}\n${priceResult.data?.text || ""}`;
  } else {
    els.ocrStatus.textContent = "OCRエンジンを読み込めませんでした。通信環境を確認して、再読み込みしてください。";
    return;
  }

  if (!text) {
    els.ocrStatus.textContent = "文字を検出できませんでした。正面から明るく撮ると読み取りやすくなります。";
    return;
  }
  parseText(text);
  els.ocrStatus.textContent = `読取候補を反映しました。違う場合は手入力で直してください: ${text.replace(/\s+/g, " ").slice(0, 110)}`;
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

function openImageViewer(src) {
  if (!src) return;
  els.viewerImage.src = src;
  els.imageViewer.hidden = false;
  document.body.classList.add("viewer-open");
}

function closeImageViewer() {
  els.imageViewer.hidden = true;
  els.viewerImage.removeAttribute("src");
  document.body.classList.remove("viewer-open");
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
  const sortedHistory = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const signature = JSON.stringify(sortedHistory.map((item) => [
    item.id,
    item.productName,
    item.size,
    item.count,
    item.price,
    item.coupon,
    item.cashback,
    item.net,
    item.unitPrice,
    item.store,
    item.date,
    item.memo,
    item.imageDataUrl ? item.imageDataUrl.length : 0,
  ]));
  if (signature === historyRenderSignature) return;
  historyRenderSignature = signature;
  els.historyList.innerHTML = "";

  if (!history.length) {
    els.historyList.innerHTML = '<div class="empty-state">撮影後、商品情報を保存するとここに履歴が残ります。</div>';
    return;
  }

  for (const item of sortedHistory) {
    const node = els.template.content.cloneNode(true);
    const date = new Date(`${item.date}T00:00:00`);
    const dateText = Number.isNaN(date.getTime())
      ? item.date
      : date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
    const thumb = node.querySelector(".item-thumb");
    const thumbImage = thumb.querySelector("img");
    thumbImage.loading = "lazy";
    thumbImage.decoding = "async";
    if (item.imageDataUrl) {
      thumb.disabled = false;
      thumb.addEventListener("click", () => openImageViewer(item.imageDataUrl));
      thumbImage.src = item.imageDataUrl;
      thumbImage.hidden = false;
      thumb.querySelector("span").hidden = true;
    } else {
      thumb.disabled = true;
      thumbImage.hidden = true;
      thumb.querySelector("span").hidden = false;
    }
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

async function refreshApp() {
  els.ocrStatus.textContent = "アプリのキャッシュを更新しています...";
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  window.location.reload();
}

els.nativeCameraInput.addEventListener("change", (event) => {
  handleImageFile(event.target.files?.[0]);
});
els.imageInput.addEventListener("change", (event) => {
  handleImageFile(event.target.files?.[0]);
});
document.querySelector(".app-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  event.preventDefault();
  switchTab(button.dataset.tab);
});
document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "open-camera") {
    event.preventDefault();
    openFileInput(els.nativeCameraInput, "スマホのカメラで商品と値札を撮影してください。");
  }
  if (action === "open-image") {
    event.preventDefault();
    openFileInput(els.imageInput, "商品と値札の画像を選んでください。");
  }
  if (action === "run-ocr") {
    event.preventDefault();
    runOcr().catch((error) => {
      els.ocrStatus.textContent = `読取に失敗しました: ${error.message}`;
    });
  }
  if (action === "set-gemini") {
    event.preventDefault();
    setGeminiKey();
  }
  if (action === "close-viewer") {
    event.preventDefault();
    closeImageViewer();
  }
  if (action === "clear-form") {
    event.preventDefault();
    clearForm();
  }
  if (action === "clear-history") {
    event.preventDefault();
    if (!history.length) return;
    if (!confirm("履歴をすべて削除しますか？")) return;
    history = [];
    saveHistory();
    render();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.imageViewer.hidden) closeImageViewer();
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
els.exportCsv.addEventListener("click", exportCsv);
els.refreshApp.addEventListener("click", () => {
  refreshApp().catch(() => window.location.reload());
});
els.filterSize.addEventListener("change", renderBest);

updateGeminiStatus();
render();
