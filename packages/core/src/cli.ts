import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { solveCuttingPlan } from "./solver.ts";
import type { SolveRequest } from "./types.ts";

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function printUsage(): void {
  console.log("Usage: node --experimental-strip-types packages/core/src/cli.ts <input.json>");
}

const inputPath = process.argv[2];

if (!inputPath) {
  printUsage();
  process.exit(1);
}

const fullPath = resolve(process.cwd(), inputPath);
const fileContent = readFileSync(fullPath, "utf-8").replace(/^\uFEFF/, "");
const request = JSON.parse(fileContent) as SolveRequest;
const plan = solveCuttingPlan(request);

console.log(`Cutting plan for ${basename(fullPath)}`);
console.log("");
console.log(`Stock: ${request.stock.width} x ${request.stock.height}`);
console.log(`Sheets used: ${plan.summary.sheetCount}`);
console.log(`Placed area: ${formatNumber(plan.summary.totalPlacedArea)}`);
console.log(`Waste area: ${formatNumber(plan.summary.totalWasteArea)}`);
console.log(`Utilization: ${(plan.summary.utilization * 100).toFixed(2)}%`);
console.log(`Largest leftover rectangle: ${formatNumber(plan.summary.largestLeftoverArea)}`);
console.log("");

for (const sheet of plan.sheets) {
  console.log(`Sheet #${sheet.index + 1}`);
  console.log(
    `  placed area ${formatNumber(sheet.placedArea)}, waste ${formatNumber(sheet.wasteArea)}, largest leftover ${formatNumber(sheet.largestLeftoverArea)}`
  );

  for (const placement of sheet.placements) {
    console.log(
      `  - ${placement.instanceId}: ${placement.width} x ${placement.height} at (${placement.x}, ${placement.y})${
        placement.rotated ? " rotated" : ""
      }`
    );
  }

  console.log("");
}

if (plan.unplaced.length > 0) {
  console.log("Unplaced pieces:");

  for (const piece of plan.unplaced) {
    console.log(`  - ${piece.instanceId}: ${piece.reason}`);
  }
}
