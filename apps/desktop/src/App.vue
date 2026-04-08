<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  solveCuttingPlan,
  type FreeRect,
  type PieceRequirement,
  type Placement,
  type SheetLayout,
  type SolveRequest,
  type StockSheet
} from "@forglass/core";

type NumericFieldValue = number | "";

interface StockFormRow {
  key: number;
  width: NumericFieldValue;
  height: NumericFieldValue;
  quantity: NumericFieldValue;
}

interface ParsedPieceRow extends PieceRequirement {
  spec: string;
  area: number;
  lineNumbers: number[];
}

interface PieceParseResult {
  pieces: ParsedPieceRow[];
  errors: string[];
  totalQuantity: number;
}

interface StockParseResult {
  stocks: StockSheet[];
  errors: string[];
  totalQuantity: number;
}

interface UnplacedPieceCard {
  pieceId: string;
  spec: string;
  width: number;
  height: number;
  quantity: number;
  reasonText: string;
  lineNumbers: number[];
}

const samplePieceText = ["1200*800*1", "900*600*2", "500*400*4"].join("\n");
const pieceLinePattern =
  /^(?:([^:：\s]+)\s*[:：]\s*)?(\d+(?:\.\d+)?)\s*(?:\*|x|X|\u00D7)\s*(\d+(?:\.\d+)?)\s*(?:\*|x|X|\u00D7)\s*(\d+)\s*$/;

let nextStockRowKey = 1;

function createStockRow(
  width: NumericFieldValue = "",
  height: NumericFieldValue = "",
  quantity: NumericFieldValue = 1
): StockFormRow {
  return {
    key: nextStockRowKey++,
    width,
    height,
    quantity
  };
}

const form = reactive<{
  stockRows: StockFormRow[];
  kerf: NumericFieldValue;
  edgeMargin: NumericFieldValue;
  maxSheetsText: string;
  pieceText: string;
}>({
  stockRows: [createStockRow(2500, 2000, 1)],
  kerf: 0,
  edgeMargin: 0,
  maxSheetsText: "",
  pieceText: ""
});

const sheetRotationOverrides = reactive<Record<number, boolean>>({});

const AUTH_PASSWORD = "2580";
const AUTH_STORAGE_KEY = "forglass-auth-session";
const AUTH_STORAGE_VALUE = "verified";

const authPassword = ref("");
const authError = ref("");
const authReady = ref(false);
const isAuthenticated = ref(false);
const fullscreenSheetIndex = ref<number | null>(null);

function setDocumentScrollLocked(locked: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  document.body.style.overflow = locked ? "hidden" : "";
}

function openSheetFullscreen(index: number): void {
  fullscreenSheetIndex.value = index;
}

function closeSheetFullscreen(): void {
  fullscreenSheetIndex.value = null;
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeSheetFullscreen();
  }
}

onMounted(() => {
  if (typeof window !== "undefined") {
    isAuthenticated.value = window.localStorage.getItem(AUTH_STORAGE_KEY) === AUTH_STORAGE_VALUE;
    window.addEventListener("keydown", handleWindowKeydown);
  }

  authReady.value = true;
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleWindowKeydown);
  }

  setDocumentScrollLocked(false);
});

function submitLogin(): void {
  if (!authPassword.value) {
    authError.value = "请输入密码";
    return;
  }

  if (authPassword.value !== AUTH_PASSWORD) {
    authError.value = "密码错误，请重新输入";
    return;
  }

  isAuthenticated.value = true;
  authError.value = "";
  authPassword.value = "";

  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_STORAGE_KEY, AUTH_STORAGE_VALUE);
  }
}

function logout(): void {
  isAuthenticated.value = false;
  authPassword.value = "";
  authError.value = "";

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function parseNumber(value: NumericFieldValue): number | null {
  if (value === "") {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

function parsePositiveNumber(value: NumericFieldValue): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value: NumericFieldValue): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function parsePositiveInteger(value: NumericFieldValue): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function formatNumber(value: number | null | undefined): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSize(width: number | null | undefined, height: number | null | undefined): string {
  return `${formatNumber(width)} × ${formatNumber(height)}`;
}

function formatLength(value: number | null | undefined): string {
  return `${formatNumber(value)} mm`;
}

function formatArea(value: number | null | undefined): string {
  return `${formatNumber(value)} mm2`;
}

function clearSheetRotationOverrides(): void {
  for (const key of Object.keys(sheetRotationOverrides)) {
    delete sheetRotationOverrides[Number(key)];
  }
}

function buildSheetRotationSettings(): boolean[] | undefined {
  const disabledIndexes = Object.keys(sheetRotationOverrides)
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && sheetRotationOverrides[index] === false);

  if (disabledIndexes.length === 0) {
    return undefined;
  }

  const maxIndex = Math.max(...disabledIndexes);
  const settings = Array.from({ length: maxIndex + 1 }, () => true);

  for (const index of disabledIndexes) {
    settings[index] = false;
  }

  return settings;
}

function sheetRotationEnabled(index: number): boolean {
  return sheetRotationOverrides[index] !== false;
}

function toggleSheetRotation(index: number): void {
  if (sheetRotationEnabled(index)) {
    sheetRotationOverrides[index] = false;
    return;
  }

  delete sheetRotationOverrides[index];
}

function addStockRow(): void {
  const lastRow = form.stockRows[form.stockRows.length - 1];
  form.stockRows.push(createStockRow(lastRow?.width ?? "", lastRow?.height ?? "", 1));
  clearSheetRotationOverrides();
}

function removeStockRow(key: number): void {
  const index = form.stockRows.findIndex((row) => row.key === key);

  if (index === -1) {
    return;
  }

  form.stockRows.splice(index, 1);
  clearSheetRotationOverrides();
}

function isBlankStockRow(row: StockFormRow): boolean {
  return row.width === "" && row.height === "" && row.quantity === "";
}

function hashText(value: string): number {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }

  return Math.abs(hash);
}

function pieceSizeKey(width: number, height: number): string {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  return `${formatNumber(shortSide)}x${formatNumber(longSide)}`;
}

function buildSwatch(index: number) {
  const hue = (index * 137.508 + 18) % 360;
  const saturation = 72;
  const lightness = 52 - (index % 2) * 4;

  return {
    fill: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.42)`,
    border: `hsl(${hue}, ${Math.min(saturation + 8, 88)}%, ${Math.max(lightness - 16, 28)}%)`,
    text: `hsl(${hue}, ${Math.max(saturation - 18, 48)}%, 20%)`
  };
}

function pieceSwatchBySize(width: number, height: number) {
  const key = pieceSizeKey(width, height);
  const swatch = sizeSwatches.value.get(key);

  if (swatch) {
    return swatch;
  }

  return buildSwatch(hashText(key) % 24);
}

function pieceChipStyle(width: number, height: number) {
  const swatch = pieceSwatchBySize(width, height);
  return {
    backgroundColor: swatch.border,
    borderColor: swatch.border,
    boxShadow: `inset 0 0 0 1px ${swatch.border}`
  };
}

function placementStyle(sheet: SheetLayout, placement: Placement) {
  const swatch = pieceSwatchBySize(placement.sourceWidth, placement.sourceHeight);

  return {
    left: `${(placement.x / sheet.width) * 100}%`,
    top: `${(placement.y / sheet.height) * 100}%`,
    width: `${(placement.width / sheet.width) * 100}%`,
    height: `${(placement.height / sheet.height) * 100}%`,
    backgroundColor: swatch.fill,
    borderColor: swatch.border,
    color: swatch.text,
    boxShadow: `inset 0 0 0 0.35px ${swatch.border}`
  };
}

function freeRectStyle(sheet: SheetLayout, freeRect: FreeRect) {
  return {
    left: `${(freeRect.x / sheet.width) * 100}%`,
    top: `${(freeRect.y / sheet.height) * 100}%`,
    width: `${(freeRect.width / sheet.width) * 100}%`,
    height: `${(freeRect.height / sheet.height) * 100}%`
  };
}

function sheetCanvasStyle(sheet: SheetLayout) {
  return {
    aspectRatio: `${sheet.width} / ${sheet.height}`
  };
}

function fullscreenFrameStyle(sheet: SheetLayout) {
  return {
    "--sheet-ratio": String(sheet.width / sheet.height)
  };
}

function clearPieces(): void {
  form.pieceText = "";
  clearSheetRotationOverrides();
}

const stockResult = computed<StockParseResult>(() => {
  const stocks: StockSheet[] = [];
  const errors: string[] = [];
  let totalQuantity = 0;

  for (const [index, row] of form.stockRows.entries()) {
    if (isBlankStockRow(row)) {
      continue;
    }

    const width = parsePositiveNumber(row.width);
    const height = parsePositiveNumber(row.height);
    const quantity = parsePositiveInteger(row.quantity);
    const lineLabel = `${index + 1}`;

    if (width === null) { errors.push(`第 ${lineLabel} 条原片的宽度必须是大于 0 的数字`); }
    if (height === null) { errors.push(`第 ${lineLabel} 条原片的高度必须是大于 0 的数字`); }
    if (quantity === null) { errors.push(`第 ${lineLabel} 条原片的个数必须是正整数`); }

    if (width === null || height === null || quantity === null) {
      continue;
    }

    stocks.push({
      id: `stock-${index + 1}`,
      width,
      height,
      quantity
    });
    totalQuantity += quantity;
  }

  if (stocks.length === 0) {
    errors.push("请至少添加一条原片规格。");
  }

  return {
    stocks,
    errors,
    totalQuantity
  };
});

const pieceResult = computed<PieceParseResult>(() => {
  const grouped = new Map<string, ParsedPieceRow>();
  const errors: string[] = [];
  const lines = form.pieceText.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = pieceLinePattern.exec(line);

    if (!match) {
      errors.push(`第 ${index + 1} 行格式不对，请写成“长*宽*数量”，例如 300*200*3`);
      continue;
    }

    const label = match[1]?.trim();
    const width = Number(match[2]);
    const height = Number(match[3]);
    const quantity = Number(match[4]);

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      errors.push(`第 ${index + 1} 行尺寸必须是正数`);
      continue;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      errors.push(`第 ${index + 1} 行数量必须是正整数`);
      continue;
    }

    const spec = formatSize(width, height);
    const id = label || spec;
    const key = `${label ?? ""}|${width}|${height}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.quantity += quantity;
      existing.lineNumbers.push(index + 1);
      continue;
    }

    grouped.set(key, {
      id,
      width,
      height,
      quantity,
      spec,
      area: width * height,
      lineNumbers: [index + 1]
    });
  }

  const pieces = [...grouped.values()].sort((left, right) => {
    if (right.area !== left.area) {
      return right.area - left.area;
    }

    const rightLongSide = Math.max(right.width, right.height);
    const leftLongSide = Math.max(left.width, left.height);

    if (rightLongSide !== leftLongSide) {
      return rightLongSide - leftLongSide;
    }

    return left.id.localeCompare(right.id);
  });

  const totalQuantity = pieces.reduce((sum, piece) => sum + piece.quantity, 0);

  return {
    pieces,
    errors,
    totalQuantity
  };
});

const sizeSwatches = computed(() => {
  const map = new Map<string, ReturnType<typeof buildSwatch>>();

  for (const piece of pieceResult.value.pieces) {
    const key = pieceSizeKey(piece.width, piece.height);

    if (!map.has(key)) {
      map.set(key, buildSwatch(map.size));
    }
  }

  return map;
});

const maxSheetsValidationMessage = computed(() => {
  const raw = form.maxSheetsText.trim();

  if (!raw) {
    return "";
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    return "最多原片数必须是正整数，留空表示不限。";
  }

  return "";
});

const request = computed<SolveRequest>(() => {
  const options: NonNullable<SolveRequest["options"]> = {
    kerf: parseNonNegativeNumber(form.kerf) ?? 0,
    edgeMargin: parseNonNegativeNumber(form.edgeMargin) ?? 0
  };
  const rawMaxSheets = form.maxSheetsText.trim();
  const sheetRotation = buildSheetRotationSettings();

  if (rawMaxSheets) {
    options.maxSheets = Number(rawMaxSheets);
  }

  if (sheetRotation) {
    options.sheetRotation = sheetRotation;
  }

  return {
    stock: stockResult.value.stocks,
    options,
    pieces: pieceResult.value.pieces.map(({ spec, area, lineNumbers, ...piece }) => piece)
  };
});

const solveState = computed(() => {
  if (pieceResult.value.errors.length > 0) {
    return { plan: null, error: "" };
  }

  if (stockResult.value.errors.length > 0) {
    return { plan: null, error: "" };
  }

  if (maxSheetsValidationMessage.value) {
    return { plan: null, error: maxSheetsValidationMessage.value };
  }

  if (pieceResult.value.pieces.length === 0) {
    return { plan: null, error: "" };
  }

  try {
    return { plan: solveCuttingPlan(request.value), error: "" };
  } catch (error) {
    return {
      plan: null,
      error: error instanceof Error ? error.message : "计算失败，请检查输入内容。"
    };
  }
});

const plan = computed(() => solveState.value.plan);
const solveError = computed(() => solveState.value.error);
const fullscreenSheet = computed(() => {
  if (!plan.value || fullscreenSheetIndex.value === null) {
    return null;
  }

  return plan.value.sheets.find((sheet) => sheet.index === fullscreenSheetIndex.value) ?? null;
});

watch(
  fullscreenSheet,
  (sheet) => {
    setDocumentScrollLocked(Boolean(sheet));
  },
  { immediate: true }
);

const piecePlacementMetaById = computed(() => {
  const placedCounts = new Map<string, number>();
  const unplacedCounts = new Map<string, number>();
  const sheetCounts = new Map<string, Map<number, number>>();
  const sheetSummaryById = new Map<string, string>();

  if (!plan.value) {
    return { placedCounts, unplacedCounts, sheetSummaryById };
  }

  for (const sheet of plan.value.sheets) {
    for (const placement of sheet.placements) {
      placedCounts.set(placement.pieceId, (placedCounts.get(placement.pieceId) ?? 0) + 1);
      const counts = sheetCounts.get(placement.pieceId) ?? new Map<number, number>();
      counts.set(sheet.index, (counts.get(sheet.index) ?? 0) + 1);
      sheetCounts.set(placement.pieceId, counts);
    }
  }

  for (const piece of plan.value.unplaced) {
    unplacedCounts.set(piece.pieceId, (unplacedCounts.get(piece.pieceId) ?? 0) + 1);
  }

  const pieceIds = new Set<string>([...placedCounts.keys(), ...unplacedCounts.keys()]);

  for (const pieceId of pieceIds) {
    const parts: string[] = [];
    const counts = sheetCounts.get(pieceId);

    if (counts) {
      for (const [sheetIndex, quantity] of [...counts.entries()].sort((left, right) => left[0] - right[0])) {
        parts.push(`原片${sheetIndex + 1} ×${quantity}`);
      }
    }

    const unplacedCount = unplacedCounts.get(pieceId) ?? 0;

    if (unplacedCount > 0) {
      parts.push(`未排入 ×${unplacedCount}`);
    }

    if (parts.length > 0) {
      sheetSummaryById.set(pieceId, parts.join("，"));
    }
  }

  return { placedCounts, unplacedCounts, sheetSummaryById };
});

function piecePlacedCountText(pieceId: string): string {
  return plan.value ? String(piecePlacementMetaById.value.placedCounts.get(pieceId) ?? 0) : "--";
}

function pieceUnplacedCountText(pieceId: string): string {
  return plan.value ? String(piecePlacementMetaById.value.unplacedCounts.get(pieceId) ?? 0) : "--";
}

function pieceSheetSourceText(pieceId: string): string {
  return piecePlacementMetaById.value.sheetSummaryById.get(pieceId) ?? "--";
}

const unplacedPieceCards = computed<UnplacedPieceCard[]>(() => {
  if (!plan.value || plan.value.unplaced.length === 0) {
    return [];
  }

  const parsedById = new Map(pieceResult.value.pieces.map((piece) => [piece.id, piece]));
  const grouped = new Map<string, UnplacedPieceCard>();

  for (const piece of plan.value.unplaced) {
    const existing = grouped.get(piece.pieceId);

    if (existing) {
      existing.quantity += 1;

      if (!existing.reasonText.split(" / ").includes(piece.reason)) {
        existing.reasonText = `${existing.reasonText} / ${piece.reason}`;
      }

      continue;
    }

    const parsedPiece = parsedById.get(piece.pieceId);
    grouped.set(piece.pieceId, {
      pieceId: piece.pieceId,
      spec: parsedPiece?.spec ?? formatSize(piece.width, piece.height),
      width: piece.width,
      height: piece.height,
      quantity: 1,
      reasonText: piece.reason,
      lineNumbers: parsedPiece?.lineNumbers ? [...parsedPiece.lineNumbers] : []
    });
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.quantity !== left.quantity) {
      return right.quantity - left.quantity;
    }

    const areaDiff = right.width * right.height - left.width * left.height;

    if (areaDiff !== 0) {
      return areaDiff;
    }

    return left.pieceId.localeCompare(right.pieceId);
  });
});

const stockUsageMetaById = computed(() => {
  const usedCounts = new Map<string, number>();

  if (!plan.value) {
    return usedCounts;
  }

  for (const sheet of plan.value.sheets) {
    if (!sheet.stockId) {
      continue;
    }

    usedCounts.set(sheet.stockId, (usedCounts.get(sheet.stockId) ?? 0) + 1);
  }

  return usedCounts;
});

function stockUsageMetaByIndex(index: number) {
  const stockId = `stock-${index + 1}`;
  const stock = stockResult.value.stocks.find((item) => item.id === stockId);

  if (!plan.value || !stock?.quantity) {
    return null;
  }

  const used = stockUsageMetaById.value.get(stockId) ?? 0;

  return {
    used,
    unused: Math.max(stock.quantity - used, 0),
    total: stock.quantity
  };
}

function stockUnusedCountText(index: number): string {
  const meta = stockUsageMetaByIndex(index);
  return meta ? String(meta.unused) : "--";
}

function stockHasUnused(index: number): boolean {
  const meta = stockUsageMetaByIndex(index);
  return Boolean(meta && meta.unused > 0);
}

function stockFullyUsed(index: number): boolean {
  const meta = stockUsageMetaByIndex(index);
  return Boolean(meta && meta.used > 0 && meta.unused === 0);
}
</script>

<template>
  <main v-if="!authReady" class="auth-shell">
    <section class="auth-card auth-card-loading">
      <p class="eyebrow">Glass Cutting Optimizer</p>
      <h1 class="auth-title">正在检查登录状态</h1>
    </section>
  </main>

  <main v-else-if="!isAuthenticated" class="auth-shell">
    <section class="auth-card">
      <p class="eyebrow">Glass Cutting Optimizer</p>
      <h1 class="auth-title">请输入登录密码</h1>
      <p class="auth-copy">输入正确密码后才能查看切割结果。</p>
      <form class="auth-form" @submit.prevent="submitLogin">
        <label class="field">
          <span>登录密码</span>
          <input
            v-model="authPassword"
            type="password"
            inputmode="numeric"
            autocomplete="current-password"
            placeholder="请输入密码"
            autofocus
            @input="authError = ''"
          />
        </label>
        <p v-if="authError" class="auth-error">{{ authError }}</p>
        <button class="button auth-submit" type="submit">登录</button>
      </form>
    </section>
  </main>

  <main v-else class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Glass Cutting Optimizer</p>
        <h1>输入原片尺寸和成品清单，自动生成切割方案</h1>
        <p class="lead">
          原片清单支持录入多种尺寸和数量，成品清单按每行一个规格录入，例如
          <code>300*200*3</code>，这里默认表示 300 × 200，共 3 件。系统会先在你提供的原片范围内优先减少用片数量，再尽量减少废料。
        </p>
        <div class="hero-actions">
          <button class="button button-ghost button-inline" type="button" @click="logout">退出登录</button>
        </div>
      </div>

      <div class="hero-metrics">
        <article class="metric">
          <span>原片数量</span>
          <strong>{{ plan?.summary.sheetCount ?? 0 }}</strong>
        </article>
        <article class="metric">
          <span>综合利用率</span>
          <strong>{{ formatPercent(plan?.summary.utilization ?? 0) }}</strong>
        </article>
        <article class="metric">
          <span>总废料面积 (mm2)</span>
          <strong>{{ formatArea(plan?.summary.totalWasteArea ?? 0) }}</strong>
        </article>
        <article class="metric">
          <span>成品总件数</span>
          <strong>{{ pieceResult.totalQuantity }}</strong>
        </article>
      </div>
    </section>

    <section class="workspace-grid">
      <article class="panel input-panel">
        <div class="panel-heading">
          <h2>输入参数</h2>
          <span>长度单位：mm</span>
        </div>

        <div class="stock-section">
          <div class="section-heading">
            <div>
              <h3>原片清单</h3>
              <p>支持多种尺寸，每条都可以设置宽、高和个数。</p>
            </div>
            <button class="button" type="button" @click="addStockRow">添加原片</button>
          </div>

          <div v-if="form.stockRows.length === 0" class="empty-state stock-empty">
            先添加一条原片规格，再填写宽、高和个数。
          </div>

          <div v-else class="stock-list">
            <section
              v-for="(stockRow, index) in form.stockRows"
              :key="stockRow.key"
              class="stock-row"
              :class="{ 'stock-row-has-unused': stockHasUnused(index) }"
            >
              <div class="stock-row-head">
                <strong>原片规格 {{ index + 1 }}</strong>
                <div class="stock-row-actions">
                  <span v-if="stockHasUnused(index)" class="stock-usage-badge stock-usage-badge-unused">未使用 {{ stockUnusedCountText(index) }} 块</span>
                  <span v-else-if="stockFullyUsed(index)" class="stock-usage-badge">已全部使用</span>
                  <button class="button button-ghost button-inline" type="button" @click="removeStockRow(stockRow.key)">删除</button>
                </div>
              </div>

              <div class="stock-row-grid">
                <label class="field">
                  <span>宽度</span>
                  <input v-model.number="stockRow.width" type="number" min="0.01" step="0.01" />
                </label>
                <label class="field">
                  <span>高度</span>
                  <input v-model.number="stockRow.height" type="number" min="0.01" step="0.01" />
                </label>
                <label class="field">
                  <span>个数</span>
                  <input v-model.number="stockRow.quantity" type="number" min="1" step="1" />
                </label>
              </div>
            </section>
          </div>

          <p class="section-tip">同尺寸直接改个数，不同尺寸就新增一条原片规格。</p>
        </div>

        <div class="field-grid field-grid-secondary">
          <label class="field">
            <span>刀缝 (mm)</span>
            <input v-model.number="form.kerf" type="number" min="0" step="0.01" />
          </label>
          <label class="field">
            <span>边距 (mm)</span>
            <input v-model.number="form.edgeMargin" type="number" min="0" step="0.01" />
          </label>
          <label class="field field-wide">
            <span>最多原片数</span>
            <input v-model="form.maxSheetsText" type="number" min="1" step="1" placeholder="留空表示不限" />
            <small>可选。即使原片清单里还有库存，也可以在这里再加一层总数限制。</small>
          </label>
        </div>

        <label class="field field-block">
          <span>成品清单</span>
          <textarea
            v-model="form.pieceText"
            :placeholder="samplePieceText"
            rows="8"
            spellcheck="false"
          />
          <small>
            每行一项，支持 <code>*</code>、<code>x</code>、<code>×</code>，默认单位都是 mm，例如
            <code>1200*800*1</code> 或 <code>900*600*2</code>。如需控制某张原片是否允许旋转，请在下方切割结果里切换。
          </small>
        </label>

        <div class="action-row">
          <button class="button button-ghost" type="button" @click="clearPieces">清空清单</button>
        </div>
      </article>

      <article v-if="false" class="panel">
        <div class="panel-heading">
          <h2>计算概览</h2>
          <span>实时更新</span>
        </div>

        <ul class="rule-list">
          <li>原片清单支持多种尺寸，每种可分别设置数量。</li>
          <li>优先减少实际使用的原片数量，在此前提下再尽量减少废料面积。</li>
          <li>如果某种原片不够，系统会自动尝试其他可用的原片规格。</li>
          <li>每块原片都可以在结果区单独切换是否允许旋转。</li>
        </ul>

        <div class="overview-grid">
          <article class="overview-card">
            <span>已解析规格</span>
            <strong>{{ pieceResult.pieces.length }} 种</strong>
          </article>
          <article class="overview-card">
            <span>已解析件数</span>
            <strong>{{ pieceResult.totalQuantity }} 件</strong>
          </article>
          <article class="overview-card">
            <span>原片规格</span>
            <strong>{{ stockResult.stocks.length }} 种</strong>
          </article>
          <article class="overview-card">
            <span>可用原片总数</span>
            <strong>{{ stockResult.totalQuantity }} 块</strong>
          </article>
        </div>

        <div v-if="pieceResult.errors.length > 0 || stockResult.errors.length > 0 || maxSheetsValidationMessage || solveError" class="message message-error">
          <h3>输入还需要调整</h3>
          <ul>
            <li v-for="error in pieceResult.errors" :key="error">{{ error }}</li>
            <li v-for="error in stockResult.errors" :key="`stock-${error}`">{{ error }}</li>
            <li v-if="maxSheetsValidationMessage">{{ maxSheetsValidationMessage }}</li>
            <li v-if="solveError && !pieceResult.errors.length && !stockResult.errors.length && !maxSheetsValidationMessage">{{ solveError }}</li>
          </ul>
        </div>

        <div v-else class="message message-ok">
          <h3>当前输入可直接计算</h3>
          <p v-if="plan">
            共需 {{ plan.summary.sheetCount }} 块原片，综合利用率
            {{ formatPercent(plan.summary.utilization) }}，总废料面积
            {{ formatArea(plan.summary.totalWasteArea) }}。
          </p>
          <p v-else>先输入至少一条成品规格，系统就会开始计算。</p>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <h2>解析后的成品清单</h2>
        <span>{{ pieceResult.pieces.length }} 种 / {{ pieceResult.totalQuantity }} 件</span>
      </div>

      <div v-if="pieceResult.pieces.length === 0" class="empty-state">
        每行录入一个规格，例如 <code>300*200*3</code>，表示长 300mm、宽 200mm、数量 3。
      </div>

      <div v-else class="table-wrap">
        <table class="piece-table">
          <thead>
            <tr>
              <th>规格</th>
              <th>数量</th>
              <th>已切割数</th>
              <th>未切割数</th>
              <th>单件面积 (mm2)</th>
              <th>来源行</th>
              <th>切自原片</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="piece in pieceResult.pieces" :key="piece.id">
              <td>
                <div class="piece-cell">
                  <span class="piece-chip" :style="pieceChipStyle(piece.width, piece.height)" />
                  <div>
                    <strong>{{ piece.spec }}</strong>
                    <small v-if="piece.id !== piece.spec">编号 {{ piece.id }}</small>
                  </div>
                </div>
              </td>
              <td>{{ piece.quantity }}</td>
              <td>{{ piecePlacedCountText(piece.id) }}</td>
              <td :class="{ 'piece-unplaced-count': Number(pieceUnplacedCountText(piece.id)) > 0 }">{{ pieceUnplacedCountText(piece.id) }}</td>
              <td>{{ formatArea(piece.area) }}</td>
              <td>{{ piece.lineNumbers.join(", ") }}</td>
              <td>{{ pieceSheetSourceText(piece.id) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel panel-results">
      <div class="panel-heading">
        <h2>切割结果</h2>
        <span>每块原片单独切换旋转</span>
      </div>

      <div v-if="!plan" class="empty-state">
        录入完原片清单和成品清单后，这里会显示每块原片的利用率、摆放位置和切割明细。
      </div>

      <div v-else-if="plan.sheets.length === 0" class="empty-state">
        当前没有生成可用原片，请检查成品尺寸是否超过原片可用范围（单位为 mm）。
      </div>

      <div v-else class="sheet-list">
        <article v-for="sheet in plan.sheets" :key="sheet.index" class="sheet-card">
          <header>
            <div class="sheet-header-main">
              <h3>原片 {{ sheet.index + 1 }}</h3>
              <p>规格 {{ formatSize(sheet.width, sheet.height) }}，切换旋转后会立即重新计算当前方案</p>
            </div>
            <div class="sheet-header-actions">
              <button
                type="button"
                class="button button-ghost button-inline sheet-fullscreen-toggle"
                @click="openSheetFullscreen(sheet.index)"
              >
                全屏查看
              </button>
              <button
                type="button"
                class="sheet-rotation-toggle"
                :class="{ 'sheet-rotation-toggle-off': !sheetRotationEnabled(sheet.index) }"
                @click="toggleSheetRotation(sheet.index)"
              >
                {{ sheetRotationEnabled(sheet.index) ? "允许旋转" : "禁止旋转" }}
              </button>
              <span>{{ formatPercent(sheet.utilization) }}</span>
            </div>
          </header>

          <div class="sheet-stats">
            <span>尺寸 {{ formatSize(sheet.width, sheet.height) }} mm</span>
            <span>已用 {{ formatArea(sheet.placedArea) }}</span>
            <span>废料 {{ formatArea(sheet.wasteArea) }}</span>
            <span>最大连续余料 {{ formatArea(sheet.largestLeftoverArea) }}</span>
          </div>

          <div class="layout-frame">
            <div class="layout-canvas" :style="sheetCanvasStyle(sheet)">
              <div
                v-for="(freeRect, freeRectIndex) in sheet.freeRects"
                :key="`${sheet.index}-leftover-${freeRectIndex}`"
                class="leftover-block"
                :style="freeRectStyle(sheet, freeRect)"
              >
                <span class="leftover-dimension leftover-dimension-top">
                  {{ formatNumber(freeRect.width) }}
                </span>
                <span class="leftover-dimension leftover-dimension-bottom">
                  {{ formatNumber(freeRect.width) }}
                </span>
                <span class="leftover-dimension leftover-dimension-left">
                  {{ formatNumber(freeRect.height) }}
                </span>
                <span class="leftover-dimension leftover-dimension-right">
                  {{ formatNumber(freeRect.height) }}
                </span>
              </div>
              <div
                v-for="placement in sheet.placements"
                :key="placement.instanceId"
                class="placement-block"
                :style="placementStyle(sheet, placement)"
              >
                <span class="placement-dimension placement-dimension-horizontal">
                  {{ formatNumber(placement.width) }}
                </span>
                <span class="placement-dimension placement-dimension-vertical">
                  {{ formatNumber(placement.height) }}
                </span>
                <strong class="placement-label">{{ placement.pieceId }}</strong>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="plan && plan.unplaced.length > 0" class="panel panel-warning">
      <div class="panel-heading">
        <h2>未能排入的成品</h2>
        <span>{{ plan.unplaced.length }} 件 / {{ unplacedPieceCards.length }} 种规格</span>
      </div>

      <div class="unplaced-grid">
        <article v-for="item in unplacedPieceCards" :key="item.pieceId" class="unplaced-card">
          <div class="unplaced-card-head">
            <div class="piece-cell">
              <span class="piece-chip" :style="pieceChipStyle(item.width, item.height)" />
              <div>
                <strong>{{ item.spec }}</strong>
                <small v-if="item.pieceId !== item.spec">编号 {{ item.pieceId }}</small>
              </div>
            </div>
            <span class="unplaced-badge">未切割 {{ item.quantity }}</span>
          </div>

          <div class="unplaced-meta">
            <span>单件面积 {{ formatArea(item.width * item.height) }}</span>
            <span v-if="item.lineNumbers.length > 0">来源行 {{ item.lineNumbers.join(", ") }}</span>
          </div>

          <p class="unplaced-reason">{{ item.reasonText }}</p>
        </article>
      </div>
    </section>

    <div
      v-if="fullscreenSheet"
      class="sheet-fullscreen-overlay"
      @click.self="closeSheetFullscreen"
    >
      <section class="sheet-fullscreen-dialog">
        <div class="sheet-fullscreen-toolbar">
          <div class="sheet-fullscreen-title">
            <p>原片 {{ fullscreenSheet.index + 1 }}</p>
            <h2>{{ formatSize(fullscreenSheet.width, fullscreenSheet.height) }}</h2>
          </div>
          <button
            type="button"
            class="button button-inline sheet-fullscreen-close"
            @click="closeSheetFullscreen"
          >
            关闭
          </button>
        </div>

        <div class="sheet-fullscreen-stats">
          <span>利用率 {{ formatPercent(fullscreenSheet.utilization) }}</span>
          <span>已用 {{ formatArea(fullscreenSheet.placedArea) }}</span>
          <span>废料 {{ formatArea(fullscreenSheet.wasteArea) }}</span>
        </div>

        <div class="sheet-fullscreen-view">
          <div class="layout-frame layout-frame-fullscreen" :style="fullscreenFrameStyle(fullscreenSheet)">
            <div class="layout-canvas layout-canvas-fullscreen" :style="sheetCanvasStyle(fullscreenSheet)">
              <div
                v-for="(freeRect, freeRectIndex) in fullscreenSheet.freeRects"
                :key="`fullscreen-${fullscreenSheet.index}-leftover-${freeRectIndex}`"
                class="leftover-block"
                :style="freeRectStyle(fullscreenSheet, freeRect)"
              >
                <span class="leftover-dimension leftover-dimension-top">
                  {{ formatNumber(freeRect.width) }}
                </span>
                <span class="leftover-dimension leftover-dimension-bottom">
                  {{ formatNumber(freeRect.width) }}
                </span>
                <span class="leftover-dimension leftover-dimension-left">
                  {{ formatNumber(freeRect.height) }}
                </span>
                <span class="leftover-dimension leftover-dimension-right">
                  {{ formatNumber(freeRect.height) }}
                </span>
              </div>
              <div
                v-for="placement in fullscreenSheet.placements"
                :key="`fullscreen-${placement.instanceId}`"
                class="placement-block"
                :style="placementStyle(fullscreenSheet, placement)"
              >
                <span class="placement-dimension placement-dimension-horizontal">
                  {{ formatNumber(placement.width) }}
                </span>
                <span class="placement-dimension placement-dimension-vertical">
                  {{ formatNumber(placement.height) }}
                </span>
                <strong class="placement-label">{{ placement.pieceId }}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>




