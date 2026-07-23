import * as XLSX from 'xlsx';

// Create a workbook with header "Tue 21.07" and some numbers
const ws_data = [
  ["Resource", "Product Number", "Product Short Description", "Total", "Base Unit", "Tue 21.07"],
  ["FCL7_3200_001", "04476102", "Desc", 192472, "CS", 33004],
  ["FCP3_3200_001", "04978529", "Desc", 24870, "CS", 15440]
];
const ws = XLSX.utils.aoa_to_sheet(ws_data);

// Simulate Excel serial date for Tue 21.07 (year 2026) -> July 21 2026 = 46224
const ws2_data = [
  ["Resource", "Product Number", "Product Short Description", "Total", "Base Unit", 46224],
  ["FCL7_3200_001", "04476102", "Desc", 192472, "CS", 33004],
  ["FCP3_3200_001", "04978529", "Desc", 24870, "CS", 15440]
];
const ws2 = XLSX.utils.aoa_to_sheet(ws2_data);

const rawData1 = XLSX.utils.sheet_to_json(ws, { header: 1 });
const rawData2 = XLSX.utils.sheet_to_json(ws2, { header: 1 });

console.log("Raw 1 (String):", rawData1[0][5]);
console.log("Raw 2 (Serial):", rawData2[0][5]);

function resolveHeaderDate(cellValue) {
  if (!cellValue) return null;
  const asNumber = Number(cellValue);
  if (!isNaN(asNumber) && asNumber > 30000 && asNumber < 100000) {
    const date = new Date((asNumber - 25569) * 86400 * 1000);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  const match = String(cellValue).trim().match(/^([A-Za-z]{3}\s+)?(\d{1,2})[./](\d{1,2})$/);
  if (!match) return null;
  const day = parseInt(match[2], 10);
  const month = parseInt(match[3], 10) - 1;
  return new Date(Date.UTC(2026, month, day, 0, 0, 0, 0));
}

const d1 = resolveHeaderDate(rawData1[0][5]);
const d2 = resolveHeaderDate(rawData2[0][5]);

console.log("Date 1:", d1.toISOString());
console.log("Date 2:", d2.toISOString());

// Simulating ProductionPlanPage behavior
const currentWeekStart = new Date();
currentWeekStart.setFullYear(2026, 6, 20); // July 20, 2026
currentWeekStart.setHours(0,0,0,0);

console.log("Local currentWeekStart:", currentWeekStart.toString());

const dDate1 = new Date(d1.getTime());
console.log("dDate1 matches currentWeekStart + idx?");
for (let i=0; i<7; i++) {
  const date = new Date(currentWeekStart);
  date.setDate(currentWeekStart.getDate() + i);
  if (dDate1.getDate() === date.getDate() &&
      dDate1.getMonth() === date.getMonth() &&
      dDate1.getFullYear() === date.getFullYear()) {
    console.log("Matched index", i, "which is", date.toDateString());
  }
}

