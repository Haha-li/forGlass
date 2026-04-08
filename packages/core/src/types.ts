export interface StockSheet {
  id?: string;
  width: number;
  height: number;
  quantity?: number;
}

export interface PieceRequirement {
  id: string;
  width: number;
  height: number;
  quantity: number;
  canRotate?: boolean;
}

export interface SolverOptions {
  kerf?: number;
  edgeMargin?: number;
  maxSheets?: number;
  sheetRotation?: boolean[];
}

export interface SolveRequest {
  stock: StockSheet | StockSheet[];
  pieces: PieceRequirement[];
  options?: SolverOptions;
}

export interface PieceInstance {
  pieceId: string;
  instanceId: string;
  width: number;
  height: number;
  canRotate: boolean;
}

export interface Placement {
  pieceId: string;
  instanceId: string;
  sheetIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  rotated: boolean;
  splitStrategy: "horizontal" | "vertical";
}

export interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetLayout {
  index: number;
  stockId?: string;
  stockTypeIndex: number;
  width: number;
  height: number;
  placements: Placement[];
  freeRects: FreeRect[];
  placedArea: number;
  wasteArea: number;
  utilization: number;
  remainingFreeArea: number;
  largestLeftoverArea: number;
}

export interface UnplacedPiece {
  pieceId: string;
  instanceId: string;
  width: number;
  height: number;
  reason: string;
}

export interface PlanScore {
  sheetCount: number;
  wasteArea: number;
  reusableLeftoverArea: number;
}

export interface CuttingPlanSummary {
  sheetCount: number;
  totalSheetArea: number;
  totalPlacedArea: number;
  totalWasteArea: number;
  utilization: number;
  largestLeftoverArea: number;
  reusableLeftoverArea: number;
}

export interface CuttingPlan {
  request: SolveRequest;
  sheets: SheetLayout[];
  unplaced: UnplacedPiece[];
  score: PlanScore;
  summary: CuttingPlanSummary;
}
