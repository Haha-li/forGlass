import test from "node:test";
import assert from "node:assert/strict";
import { solveCuttingPlan } from "../src/solver.ts";

test("packs four 50x50 pieces into one 100x100 sheet", () => {
  const plan = solveCuttingPlan({
    stock: { width: 100, height: 100 },
    pieces: [{ id: "P", width: 50, height: 50, quantity: 4 }]
  });

  assert.equal(plan.summary.sheetCount, 1);
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.sheets[0].placements.length, 4);
  assert.equal(plan.summary.totalPlacedArea, 10000);
  assert.equal(plan.summary.totalWasteArea, 0);
});

test("adds another sheet when one sheet is not enough", () => {
  const plan = solveCuttingPlan({
    stock: { width: 100, height: 100 },
    pieces: [{ id: "P", width: 50, height: 50, quantity: 5 }]
  });

  assert.equal(plan.summary.sheetCount, 2);
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.sheets[0].placements.length, 4);
  assert.equal(plan.sheets[1].placements.length, 1);
});

test("respects edge margin and kerf", () => {
  const plan = solveCuttingPlan({
    stock: { width: 100, height: 50 },
    options: { edgeMargin: 2, kerf: 2 },
    pieces: [{ id: "P", width: 47, height: 46, quantity: 2 }]
  });

  assert.equal(plan.summary.sheetCount, 1);
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.sheets[0].placements.length, 2);
});

test("marks pieces as unplaced when they cannot fit even on an empty sheet", () => {
  const plan = solveCuttingPlan({
    stock: { width: 100, height: 100 },
    options: { edgeMargin: 5 },
    pieces: [{ id: "TooLarge", width: 96, height: 96, quantity: 1 }]
  });

  assert.equal(plan.summary.sheetCount, 0);
  assert.equal(plan.unplaced.length, 1);
  assert.match(plan.unplaced[0].reason, /does not fit/i);
});

test("respects per-sheet rotation settings", () => {
  const blockedPlan = solveCuttingPlan({
    stock: { width: 60, height: 100 },
    options: { sheetRotation: [false, false] },
    pieces: [
      { id: "Base", width: 60, height: 100, quantity: 1 },
      { id: "RotateOnly", width: 70, height: 40, quantity: 1 }
    ]
  });

  assert.equal(blockedPlan.summary.sheetCount, 1);
  assert.equal(blockedPlan.unplaced.length, 1);

  const allowedPlan = solveCuttingPlan({
    stock: { width: 60, height: 100 },
    options: { sheetRotation: [false, true] },
    pieces: [
      { id: "Base", width: 60, height: 100, quantity: 1 },
      { id: "RotateOnly", width: 70, height: 40, quantity: 1 }
    ]
  });

  assert.equal(allowedPlan.summary.sheetCount, 2);
  assert.equal(allowedPlan.unplaced.length, 0);
  assert.equal(allowedPlan.sheets[1].placements[0].rotated, true);
});

test("selects the smallest available stock that fits", () => {
  const plan = solveCuttingPlan({
    stock: [
      { id: "large", width: 100, height: 100, quantity: 1 },
      { id: "small", width: 60, height: 60, quantity: 1 }
    ],
    pieces: [{ id: "P", width: 60, height: 60, quantity: 1 }]
  });

  assert.equal(plan.summary.sheetCount, 1);
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.sheets[0].width, 60);
  assert.equal(plan.sheets[0].height, 60);
  assert.equal(plan.sheets[0].stockTypeIndex, 1);
});

test("uses another stock type when the first one runs out", () => {
  const plan = solveCuttingPlan({
    stock: [
      { id: "square", width: 60, height: 60, quantity: 1 },
      { id: "wide", width: 100, height: 60, quantity: 1 }
    ],
    pieces: [{ id: "P", width: 60, height: 60, quantity: 2 }]
  });

  assert.equal(plan.summary.sheetCount, 2);
  assert.equal(plan.unplaced.length, 0);
  assert.deepEqual(
    plan.sheets.map((sheet) => String(sheet.width) + "x" + String(sheet.height)),
    ["60x60", "100x60"]
  );
});
