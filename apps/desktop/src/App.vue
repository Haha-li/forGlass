<script setup lang="ts">
import { computed, reactive } from "vue";
import {
  solveCuttingPlan,
  type PieceRequirement,
  type Placement,
  type SheetLayout,
  type SolveRequest
} from "@forglass/core";

type NumericFieldValue = number | "";

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

const samplePieceText = ["120*80*1", "90*60*2", "50*40*4"].join("\n");
const pieceLinePattern =
  /^(?:([^:：\s]+)\s*[:：]\s*)?(\d+(?:\.\d+)?)\s*(?:\*|x|X|×)\s*(\d+(?:\.\d+)?)\s*(?:\*|x|X|×)\s*(\d+)\s*$/;

const form = reactive<{
  stockWidth: NumericFieldValue;
  stockHeight: NumericFieldValue;
  kerf: NumericFieldValue;
  edgeMargin: NumericFieldValue;
  maxSheetsText: string;
  pieceText: string;
}>({
  stockWidth: 250,
  stockHeight: 200,
  kerf: 0,
  edgeMargin: 0,
  maxSheetsText: "",
  pieceText: ""
});

const sheetRotationOverrides = reactive<Record<number, boolean>>({});

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
  return `${formatNumber(value)} cm`;
}

function formatArea(value: number | null | undefined): string {
  return `${formatNumber(value)} cm2`;
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

function clearPieces(): void {
  form.pieceText = "";
  clearSheetRotationOverrides();
}

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
      errors.push(`第 ${index + 1} 行格式不对，请写成“长*宽*数量”，例如 30*20*3`);
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

const stockValidationMessage = computed(() => {
  if (form.stockWidth === "" || form.stockHeight === "") {
    return "请先输入原片宽度和高度。";
  }

  if (parsePositiveNumber(form.stockWidth) === null || parsePositiveNumber(form.stockHeight) === null) {
    return "原片宽度和高度必须是大于 0 的数字。";
  }

  return "";
});

const request = computed<SolveRequest>(() => {
  const stockWidth = parsePositiveNumber(form.stockWidth) ?? 0;
  const stockHeight = parsePositiveNumber(form.stockHeight) ?? 0;
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
    stock: {
      width: stockWidth,
      height: stockHeight
    },
    options,
    pieces: pieceResult.value.pieces.map(({ spec, area, lineNumbers, ...piece }) => piece)
  };
});

const solveState = computed(() => {
  if (pieceResult.value.errors.length > 0) {
    return { plan: null, error: "" };
  }

  if (stockValidationMessage.value) {
    return { plan: null, error: stockValidationMessage.value };
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
</script>

<template>
  <main class="shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Glass Cutting Optimizer</p>
        <h1>输入原片尺寸和成品清单，自动生成切割方案</h1>
        <p class="lead">
          原片尺寸可以手动输入，成品清单按每行一个规格录入，例如
          <code>30*20*3</code>，这里默认表示 30cm × 20cm，共 3 件。系统会优先尽量少用原片，再尽量减少废料；一块放不下时会自动追加到第
          2 块、第 3 块原片。
        </p>
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
          <span>总废料面积 (cm2)</span>
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
          <span>长度单位：cm</span>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>原片宽度 (cm)</span>
            <input v-model.number="form.stockWidth" type="number" min="0.01" step="0.01" />
          </label>
          <label class="field">
            <span>原片高度 (cm)</span>
            <input v-model.number="form.stockHeight" type="number" min="0.01" step="0.01" />
          </label>
          <label class="field">
            <span>刀缝 (cm)</span>
            <input v-model.number="form.kerf" type="number" min="0" step="0.01" />
          </label>
          <label class="field">
            <span>边距 (cm)</span>
            <input v-model.number="form.edgeMargin" type="number" min="0" step="0.01" />
          </label>
          <label class="field field-wide">
            <span>最多原片数</span>
            <input v-model="form.maxSheetsText" type="number" min="1" step="1" placeholder="留空表示不限" />
            <small>可选。如果只允许最多 2 块或 3 块原片，可以在这里限制。</small>
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
            每行一项，支持 <code>*</code>、<code>x</code>、<code>×</code>，默认单位都是 cm，例如
            <code>120*80*1</code> 或 <code>90*60*2</code>。如需控制某张原片是否允许旋转，请在下方切割结果里切换。
          </small>
        </label>

        <div class="action-row">
          <button class="button button-ghost" type="button" @click="clearPieces">清空清单</button>
        </div>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <h2>计算概览</h2>
          <span>实时更新</span>
        </div>

        <ul class="rule-list">
          <li>优先减少原片数量，不够时自动增加下一块原片。</li>
          <li>在原片数量相同的前提下，尽量减少废料面积。</li>
          <li>每块原片都可以在结果区单独切换是否允许旋转。</li>
          <li>当前采用启发式二维排样，适合快速给出合理方案。</li>
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
            <span>原片尺寸</span>
            <strong>{{ formatSize(form.stockWidth, form.stockHeight) }} cm</strong>
          </article>
          <article class="overview-card">
            <span>原片限制</span>
            <strong>{{ form.maxSheetsText.trim() || "不限" }}</strong>
          </article>
        </div>

        <div v-if="pieceResult.errors.length > 0 || stockValidationMessage || maxSheetsValidationMessage || solveError" class="message message-error">
          <h3>输入还需要调整</h3>
          <ul>
            <li v-for="error in pieceResult.errors" :key="error">{{ error }}</li>
            <li v-if="stockValidationMessage">{{ stockValidationMessage }}</li>
            <li v-if="maxSheetsValidationMessage">{{ maxSheetsValidationMessage }}</li>
            <li v-if="solveError && !pieceResult.errors.length && !stockValidationMessage && !maxSheetsValidationMessage">{{ solveError }}</li>
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
        每行录入一个规格，例如 <code>30*20*3</code>，表示长 30cm、宽 20cm、数量 3。
      </div>

      <div v-else class="table-wrap">
        <table class="piece-table">
          <thead>
            <tr>
              <th>规格</th>
              <th>数量</th>
              <th>单件面积 (cm2)</th>
              <th>来源行</th>
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
              <td>{{ formatArea(piece.area) }}</td>
              <td>{{ piece.lineNumbers.join(", ") }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-heading">
        <h2>切割结果</h2>
        <span>每块原片单独切换旋转</span>
      </div>

      <div v-if="!plan" class="empty-state">
        录入完原片和成品清单后，这里会显示每块原片的利用率、摆放位置和切割明细。
      </div>

      <div v-else-if="plan.sheets.length === 0" class="empty-state">
        当前没有生成可用原片，请检查成品尺寸是否超过原片可用范围（单位为 cm）。
      </div>

      <div v-else class="sheet-list">
        <article v-for="sheet in plan.sheets" :key="sheet.index" class="sheet-card">
          <header>
            <div class="sheet-header-main">
              <h3>原片 {{ sheet.index + 1 }}</h3>
              <p>切换旋转后会立即重新计算当前方案</p>
            </div>
            <div class="sheet-header-actions">
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
            <span>尺寸 {{ formatSize(sheet.width, sheet.height) }} cm</span>
            <span>已用 {{ formatArea(sheet.placedArea) }}</span>
            <span>废料 {{ formatArea(sheet.wasteArea) }}</span>
            <span>最大连续余料 {{ formatArea(sheet.largestLeftoverArea) }}</span>
          </div>

          <div class="layout-frame">
            <div class="layout-canvas" :style="{ aspectRatio: `${sheet.width} / ${sheet.height}` }">
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

          <ul class="placement-list">
            <li v-for="placement in sheet.placements" :key="`${sheet.index}-${placement.instanceId}`">
              <span>{{ placement.instanceId }}</span>
              <span>{{ formatSize(placement.width, placement.height) }} cm</span>
              <span>坐标 ({{ formatLength(placement.x) }}, {{ formatLength(placement.y) }})</span>
              <span>{{ placement.rotated ? "已旋转" : "未旋转" }}</span>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section v-if="plan && plan.unplaced.length > 0" class="panel panel-warning">
      <div class="panel-heading">
        <h2>未能排入的成品</h2>
        <span>{{ plan.unplaced.length }} 件</span>
      </div>

      <ul class="warning-list">
        <li v-for="piece in plan.unplaced" :key="piece.instanceId">
          {{ piece.instanceId }} / {{ formatSize(piece.width, piece.height) }} cm: {{ piece.reason }}
        </li>
      </ul>
    </section>
  </main>
</template>



