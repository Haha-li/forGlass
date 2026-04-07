import type {
  CuttingPlan,
  FreeRect,
  PieceInstance,
  PieceRequirement,
  Placement,
  SheetLayout,
  SolveRequest,
  SolverOptions,
  UnplacedPiece
} from "./types.ts";

interface NormalizedOptions {
  kerf: number;
  edgeMargin: number;
  maxSheets: number;
  sheetRotation: boolean[];
}

interface MutableSheet {
  index: number;
  width: number;
  height: number;
  placements: Placement[];
  freeRects: FreeRect[];
}

interface PlacementCandidate {
  requiresNewSheet: boolean;
  sheetIndex: number;
  freeRectIndex: number;
  placement: Placement;
  nextFreeRects: FreeRect[];
  leftoverArea: number;
  shortSideGap: number;
  longSideGap: number;
  largestGeneratedArea: number;
}

const MIN_RECT_SIZE = 0.0001;

function normalizeOptions(options?: SolverOptions): NormalizedOptions {
  return {
    kerf: Math.max(0, options?.kerf ?? 0),
    edgeMargin: Math.max(0, options?.edgeMargin ?? 0),
    maxSheets: options?.maxSheets && options.maxSheets > 0 ? options.maxSheets : Number.POSITIVE_INFINITY,
    sheetRotation: (options?.sheetRotation ?? []).map((value) => value !== false)
  };
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

function createInitialFreeRect(stockWidth: number, stockHeight: number, edgeMargin: number): FreeRect {
  const usableWidth = stockWidth - edgeMargin * 2;
  const usableHeight = stockHeight - edgeMargin * 2;

  if (usableWidth <= 0 || usableHeight <= 0) {
    throw new Error("edgeMargin is too large for the stock sheet");
  }

  return {
    x: edgeMargin,
    y: edgeMargin,
    width: usableWidth,
    height: usableHeight
  };
}

function expandPieces(pieces: PieceRequirement[]): PieceInstance[] {
  const result: PieceInstance[] = [];

  for (const piece of pieces) {
    assertPositive(`piece ${piece.id} width`, piece.width);
    assertPositive(`piece ${piece.id} height`, piece.height);

    if (!Number.isInteger(piece.quantity) || piece.quantity <= 0) {
      throw new Error(`piece ${piece.id} quantity must be a positive integer`);
    }

    for (let index = 1; index <= piece.quantity; index += 1) {
      result.push({
        pieceId: piece.id,
        instanceId: `${piece.id}#${index}`,
        width: piece.width,
        height: piece.height,
        canRotate: piece.canRotate ?? true
      });
    }
  }

  return result.sort((left, right) => {
    const leftArea = left.width * left.height;
    const rightArea = right.width * right.height;

    if (rightArea !== leftArea) {
      return rightArea - leftArea;
    }

    const leftLongSide = Math.max(left.width, left.height);
    const rightLongSide = Math.max(right.width, right.height);

    if (rightLongSide !== leftLongSide) {
      return rightLongSide - leftLongSide;
    }

    return left.instanceId.localeCompare(right.instanceId);
  });
}

function areaOf(rect: Pick<FreeRect, "width" | "height">): number {
  return rect.width * rect.height;
}

function sanitizeRect(rect: FreeRect): FreeRect | null {
  if (rect.width <= MIN_RECT_SIZE || rect.height <= MIN_RECT_SIZE) {
    return null;
  }

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  };
}

function splitFreeRect(
  freeRect: FreeRect,
  placedWidth: number,
  placedHeight: number,
  kerf: number,
  strategy: "horizontal" | "vertical"
): FreeRect[] {
  const nextRects: Array<FreeRect | null> =
    strategy === "horizontal"
      ? [
          sanitizeRect({
            x: freeRect.x + placedWidth + kerf,
            y: freeRect.y,
            width: freeRect.width - placedWidth - kerf,
            height: placedHeight
          }),
          sanitizeRect({
            x: freeRect.x,
            y: freeRect.y + placedHeight + kerf,
            width: freeRect.width,
            height: freeRect.height - placedHeight - kerf
          })
        ]
      : [
          sanitizeRect({
            x: freeRect.x + placedWidth + kerf,
            y: freeRect.y,
            width: freeRect.width - placedWidth - kerf,
            height: freeRect.height
          }),
          sanitizeRect({
            x: freeRect.x,
            y: freeRect.y + placedHeight + kerf,
            width: placedWidth,
            height: freeRect.height - placedHeight - kerf
          })
        ];

  return nextRects.filter((rect): rect is FreeRect => rect !== null);
}

function buildEmptySheet(index: number, request: SolveRequest, options: NormalizedOptions): MutableSheet {
  return {
    index,
    width: request.stock.width,
    height: request.stock.height,
    placements: [],
    freeRects: [createInitialFreeRect(request.stock.width, request.stock.height, options.edgeMargin)]
  };
}

function evaluateCandidate(
  piece: PieceInstance,
  sheet: MutableSheet,
  freeRect: FreeRect,
  freeRectIndex: number,
  rotated: boolean,
  requiresNewSheet: boolean,
  strategy: "horizontal" | "vertical",
  options: NormalizedOptions
): PlacementCandidate | null {
  const width = rotated ? piece.height : piece.width;
  const height = rotated ? piece.width : piece.height;

  if (width > freeRect.width || height > freeRect.height) {
    return null;
  }

  const nextFreeRects = splitFreeRect(freeRect, width, height, options.kerf, strategy);
  const leftoverArea = areaOf(freeRect) - width * height;
  const shortSideGap = Math.min(freeRect.width - width, freeRect.height - height);
  const longSideGap = Math.max(freeRect.width - width, freeRect.height - height);
  const largestGeneratedArea = nextFreeRects.reduce((largest, rect) => Math.max(largest, areaOf(rect)), 0);

  return {
    requiresNewSheet,
    sheetIndex: sheet.index,
    freeRectIndex,
    leftoverArea,
    shortSideGap,
    longSideGap,
    largestGeneratedArea,
    placement: {
      pieceId: piece.pieceId,
      instanceId: piece.instanceId,
      sheetIndex: sheet.index,
      x: freeRect.x,
      y: freeRect.y,
      width,
      height,
      sourceWidth: piece.width,
      sourceHeight: piece.height,
      rotated,
      splitStrategy: strategy
    },
    nextFreeRects
  };
}

function compareCandidates(left: PlacementCandidate, right: PlacementCandidate): number {
  if (left.requiresNewSheet !== right.requiresNewSheet) {
    return left.requiresNewSheet ? 1 : -1;
  }

  if (left.leftoverArea !== right.leftoverArea) {
    return left.leftoverArea - right.leftoverArea;
  }

  if (left.shortSideGap !== right.shortSideGap) {
    return left.shortSideGap - right.shortSideGap;
  }

  if (left.longSideGap !== right.longSideGap) {
    return left.longSideGap - right.longSideGap;
  }

  if (left.largestGeneratedArea !== right.largestGeneratedArea) {
    return right.largestGeneratedArea - left.largestGeneratedArea;
  }

  return left.sheetIndex - right.sheetIndex;
}

function applyCandidate(sheet: MutableSheet, candidate: PlacementCandidate): void {
  const nextFreeRects = sheet.freeRects.filter((_, index) => index !== candidate.freeRectIndex);
  nextFreeRects.push(...candidate.nextFreeRects);
  nextFreeRects.sort((left, right) => areaOf(right) - areaOf(left));

  sheet.freeRects = nextFreeRects;
  sheet.placements.push(candidate.placement);
}

function isSheetRotationEnabled(sheetIndex: number, options: NormalizedOptions): boolean {
  return options.sheetRotation[sheetIndex] !== false;
}

function findBestPlacement(
  piece: PieceInstance,
  sheets: MutableSheet[],
  request: SolveRequest,
  options: NormalizedOptions
): PlacementCandidate | null {
  let bestCandidate: PlacementCandidate | null = null;
  const candidateSheets = [...sheets];

  if (sheets.length < options.maxSheets) {
    candidateSheets.push(buildEmptySheet(sheets.length, request, options));
  }

  for (const sheet of candidateSheets) {
    const requiresNewSheet = sheet.index >= sheets.length;
    const canRotateOnSheet = piece.canRotate && isSheetRotationEnabled(sheet.index, options);
    const rotationModes = canRotateOnSheet ? [false, true] : [false];

    for (const [freeRectIndex, freeRect] of sheet.freeRects.entries()) {
      for (const rotated of rotationModes) {
        for (const strategy of ["horizontal", "vertical"] as const) {
          const candidate = evaluateCandidate(
            piece,
            sheet,
            freeRect,
            freeRectIndex,
            rotated,
            requiresNewSheet,
            strategy,
            options
          );

          if (!candidate) {
            continue;
          }

          if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
            bestCandidate = candidate;
          }
        }
      }
    }
  }

  return bestCandidate;
}

function summarizeSheet(sheet: MutableSheet): SheetLayout {
  const sheetArea = sheet.width * sheet.height;
  const placedArea = sheet.placements.reduce((sum, placement) => sum + placement.width * placement.height, 0);
  const remainingFreeArea = sheet.freeRects.reduce((sum, rect) => sum + areaOf(rect), 0);
  const largestLeftoverArea = sheet.freeRects.reduce((largest, rect) => Math.max(largest, areaOf(rect)), 0);

  return {
    index: sheet.index,
    width: sheet.width,
    height: sheet.height,
    placements: [...sheet.placements],
    freeRects: [...sheet.freeRects],
    placedArea,
    wasteArea: sheetArea - placedArea,
    utilization: placedArea / sheetArea,
    remainingFreeArea,
    largestLeftoverArea
  };
}

export function solveCuttingPlan(request: SolveRequest): CuttingPlan {
  assertPositive("stock width", request.stock.width);
  assertPositive("stock height", request.stock.height);

  const options = normalizeOptions(request.options);
  const pieces = expandPieces(request.pieces);
  const sheets: MutableSheet[] = [];
  const unplaced: UnplacedPiece[] = [];

  for (const piece of pieces) {
    const candidate = findBestPlacement(piece, sheets, request, options);

    if (!candidate) {
      unplaced.push({
        pieceId: piece.pieceId,
        instanceId: piece.instanceId,
        width: piece.width,
        height: piece.height,
        reason: "Piece does not fit into the stock sheet with current edge margin and kerf"
      });
      continue;
    }

    if (candidate.requiresNewSheet) {
      sheets.push(buildEmptySheet(candidate.sheetIndex, request, options));
    }

    applyCandidate(sheets[candidate.sheetIndex], candidate);
  }

  const summarizedSheets = sheets.map(summarizeSheet);
  const sheetArea = request.stock.width * request.stock.height;
  const totalSheetArea = summarizedSheets.length * sheetArea;
  const totalPlacedArea = summarizedSheets.reduce((sum, sheet) => sum + sheet.placedArea, 0);
  const totalWasteArea = totalSheetArea - totalPlacedArea;
  const largestLeftoverArea = summarizedSheets.reduce((largest, sheet) => Math.max(largest, sheet.largestLeftoverArea), 0);
  const reusableLeftoverArea = summarizedSheets.reduce((sum, sheet) => sum + sheet.largestLeftoverArea, 0);

  return {
    request,
    sheets: summarizedSheets,
    unplaced,
    score: {
      sheetCount: summarizedSheets.length,
      wasteArea: totalWasteArea,
      reusableLeftoverArea
    },
    summary: {
      sheetCount: summarizedSheets.length,
      totalSheetArea,
      totalPlacedArea,
      totalWasteArea,
      utilization: totalSheetArea > 0 ? totalPlacedArea / totalSheetArea : 0,
      largestLeftoverArea,
      reusableLeftoverArea
    }
  };
}
