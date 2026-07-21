# MPPS7 SAP Import Mapping & Architecture Specification

This document provides a comprehensive technical blueprint and mapping specification for importing SAP production planning data (MPPS7 format) into the Operations Visual Management System (OVMS). It details the workbook structures, parser algorithms, database schemas, validation matrices, and operational workflows required to convert raw ERP records into real-time visual management elements.

---

## 1. Source Workbook Summary

The OVMS ingestion pipeline processes raw production data from SAP and maps it to a visually-intuitive planner workbook and live operator dashboard.

*   **Factual Source (SAP MPPS7)**: The raw, multi-column spreadsheet exported directly from SAP. It holds the authoritative, granular plan of case quantities segmented by production resource, product, and calendar date.
*   **Presentation & Planner Workflow (Weekly Plan Review)**: A highly-visual planning board created by planners to sequence runs, track line events (maintenance, cleaning, trials), and convert volume metrics (Cases) into logistics units (Pallets) for the warehouse floor.

The importer's goal is to parse the authoritative SAP MPPS7 records, auto-resolve line and product mappings, calculate equivalent pallets, and support planner annotations for operational event notes.

---

## 2. MPPS7 Source Structure (SAP Raw Export)

Based on the raw SAP export analysis, the workbook exhibits the following structural layout:

*   **Workbook & Worksheet Names**: Typically exported with names containing the pattern `MPPS7` and a date stamp (e.g., `MPPS7_210726.xlsx`). The active data lies on the first worksheet (usually `"Sheet1"` or `"Sheet2"`).
*   **Header Row**:
    *   Row 1 contains the column headers: `Resource`, `Product Number`, `Product Short Description`, `Total`, `Base Unit of Measure`, followed by consecutive date columns (e.g., `Tue 21.07`, `Wed 22.07`, `Thu 23.07`, etc.).
*   **Key Fields**:
    *   **Resource (Column A)**: Identifies the production line resource using SAP technical IDs (e.g., `FCP3_3200_001`, `FCL5_3200_001`, `FCP4_3200_001`, `FCP6_3200_001`).
    *   **Product Number (Column B)**: The 8-digit product SKU master code (e.g., `04310500`, `04476102`). It may contain leading zeros, which must be preserved as text rather than truncated as integers.
    *   **Product Short Description (Column C)**: Standard SAP material description (e.g., `F1 Andrex Skin Protect 155sc 8rx3`).
    *   **Total (Column D)**: The computed sum of planned cases across the entire date horizon (e.g., `134,800 CS`). *Note: This column must be ignored for parsing purposes, as OVMS calculates daily totals dynamically from raw dates.*
    *   **Base Unit of Measure (Column E)**: Specifies the unit, typically `CS` (Cases) or `PC` (Pieces).
    *   **Date Columns (Column F onwards)**: Dynamic headings representing days in `DDD DD.MM` format (e.g., `Tue 21.07`). These are stored as text headers or serial dates with customized Excel cell formatting.
*   **Structural Characteristics**:
    *   Each row represents a unique combination of **Production Resource** and **Product SKU**.
    *   No empty separator rows exist in the raw format.
    *   No merged cells are present in the raw table grid.
    *   Quantities of 0 represent days with no planned production.

### Reliable Identifiers for Format Detection
A file is automatically recognized as an MPPS7 SAP raw export if:
1.  The first row contains exactly the headers: `Resource` in `A1`, `Product Number` in `B1`, `Product Short Description` in `C1`, and `Base Unit of Measure` in `E1`.
2.  Column E contains standard unit codes (`CS`, `PC`).

---

## 3. Weekly Plan Review Target Structure (Human-Readable)

The Weekly Plan Review is the layout planners use to manage operations at the Barrow site. The parser maps the parsed SAP records to align with this organizational layout:

*   **Worksheet Names**: Labeled with the week starting date (e.g., `08.07.2026`).
*   **Line Grouping**:
    *   Production data is split into distinct vertical blocks, each designated for a specific line resource:
        *   **Perini 3** (mapped from `FCP3_3200_001`)
        *   **Perini 4** (mapped from `FCP4_3200_001`)
        *   **Perini 6** (mapped from `FCP6_3200_001`)
        *   **Line 5** (mapped from `FCL5_3200_001`)
*   **Weekly Grid Fields**:
    *   **Code**: Product SKU.
    *   **Product Short Description**: Text title.
    *   **CS/Pallet**: Conversion multiplier (Cases per Pallet) defined on the Product Master.
    *   **Daily Quantities**: Displayed under date columns spanning a rolling 14-to-21 day horizon.
*   **Total Pallets Row**: Calculated at the bottom of each line block using:
    $$\text{Total Pallets} = \sum \left( \frac{\text{Daily Planned Cases}}{\text{Cases per Pallet}} \right)$$
    The result is rounded to the nearest integer for space conservation.
*   **Operational Notes (Annotations)**:
    *   Visual colored highlights represent line conditions:
        *   **Yellow (`CLEAN`)**: Line cleaning windows.
        *   **Purple (`GRADE_CHANGE`)**: Transition between product categories.
        *   **Cyan (`FORMAT_CHANGE`)**: Adjusting mechanical tooling for different SKU dimensions.
        *   **Green (`MAINT_SHUT`)**: Scheduled engineering maintenance shutdowns.
        *   **Yellow-Green (`RSR_TRIAL`)**: Running trials or research test batches.

---

## 4. Field Mapping: MPPS7 to OVMS

| SAP Source Header | OVMS Field Name | Target Table | Type | Mapping Logic / Rules |
|-------------------|-----------------|--------------|------|-----------------------|
| `Resource` | `productionLineCode` | `ProductionPlanRow` | `string` | Extract prefix (e.g., `FCP3` from `FCP3_3200_001`) and map to standard Line ID. |
| `Product Number` | `productCode` | `ProductionPlanRow` | `string` | Pad with leading zeros to maintain an 8-character string (e.g., `"04310500"`). |
| `Product Short Desc`| `sourceProductDescription` | `ProductionPlanRow` | `string` | Store verbatim for audit/fallback purposes. |
| `Base Unit of Measure`| `sourceUnitOfMeasure` | `ProductionPlanRow` | `string` | Typically `"CS"` (Cases). |
| Dynamic Header `F` | `productionDate` | `ProductionPlanRow` | `Timestamp` | Extract date column label, parse using the import's reference year, and save as date. |
| Cell `[Row, Col F]` | `plannedQuantity` | `ProductionPlanRow` | `number` | Parse as integer. Ignore if zero or null to optimize storage. |

---

## 5. Fields Derived from the OVMS Product Master

These fields are not present in the raw SAP MPPS7 file and must be looked up in the **OVMS Product Master Collection** during validation:

1.  **`casesPerPallet` (CS/Pallet)**: Essential for converting planned cases to equivalent pallets.
2.  **`matchedProductId`**: The internal Firestore document ID for the product.
3.  **`matchedProductDescription`**: The standardized, user-friendly description used within OVMS.
4.  **`palletType`**: The physical pallet specification (e.g., Blue Chep, Red LPR, Wood) required for warehousing workflows.

---

## 6. Fields Maintained Manually by Planners

Planners enrich the parsed schedule with operational context that SAP cannot provide:

1.  **Line Event Annotations (`ProductionLinePlanNote`)**: Adding blocks for maintenance (`MAINT_SHUT`), cleaning (`CLEAN`), and product restriction guidelines.
2.  **Plan Status Overrides**: Advancing a scheduled run status from `PLANNED` to `RUNNING`, `DELAYED`, or `COMPLETE`.
3.  **Manual Sequence Priority**: Adjusting the run queue ordering on a line for a given day.

---

## 7. Parser Assumptions & Logic

*   **Year Resolution**: Because the SAP MPPS7 date headings contain only day and month (e.g., `Tue 21.07`), the parser infers the correct year from the metadata or the **source workbook filename date** (e.g., `210726` -> `2026`).
*   **In-Memory Processing**: The raw binary spreadsheet is processed entirely in-memory using **SheetJS** in the client's browser. It is never transmitted as a raw file or Base64 string to Firestore, avoiding token and storage overhead.
*   **Timezone Standard**: All dates extracted from the spreadsheet are normalized to UTC at `00:00:00` to prevent timezone offsets from shifting production entries to the preceding or following calendar day.
*   **Superseding Logic**: When committing a new `ProductionPlanImport`, all active plan entries (`ProductionPlanEntry`) falling within the imported date range are marked as `SUPERSEDED` and replaced by the new records.

---

## 8. Parser Rejection & Warning Conditions

To maintain data integrity and prevent operational disruption, the parser enforces the following validation rules:

### Hard Rejections (Transaction Fails & File Aborts)
*   **Header Mismatch**: The sheet does not contain the mandatory headers: `Resource`, `Product Number`, `Base Unit of Measure`.
*   **Empty Date Range**: No recognizable date columns can be extracted from Column F onwards.
*   **Duplicate Key Rows**: Multiple rows are detected with the identical combination of `Resource` and `Product Number`.
*   **Malformed Numeric Values**: Non-numeric or negative values found in planned daily cells.

### Warnings (File Parsed but Flagged for Review)
*   **Unmatched Resource Code**: A resource ID in the file (e.g., `FCL7_3200_001`) does not match any registered line in the system.
*   **Unmatched Product SKU**: A product code does not exist in the OVMS SKU master. The parser creates a temporary stub record but flags a warning.
*   **Missing Conversion Rate**: A product has no `casesPerPallet` rate defined. The system defaults to `1` and raises a warning.

---

## 9. Example Transformed Production Record

Below is an example of a single cell cell-run from the raw row:
*   **Raw Resource**: `FCL5_3200_001`
*   **Product Number**: `04310500`
*   **Product Description**: `F1 Andrex Skin Protect 155sc 8rx3`
*   **Date Column**: `Tue 21.07` (Year resolved to 2026)
*   **Planned cases**: `1,500`

### Transformed `ProductionPlanRow` Structure (Firestore representation):
```json
{
  "tenantId": "gxo_retail_north",
  "siteId": "site_leeds",
  "importId": "imp_7f8a9b2c3d",
  "sourceSheetName": "Sheet1",
  "sourceRowNumber": 2,
  "productionLineCode": "FCL5",
  "productionLineName": "Line 5",
  "productCode": "04310500",
  "sourceProductDescription": "F1 Andrex Skin Protect 155sc 8rx3",
  "matchedProductId": "prod_andrex_skin_8rx3",
  "matchedProductDescription": "Andrex Skin Protect 155sc (8 Rolls x 3 Packs)",
  "productionDate": "2026-07-21T00:00:00.000Z",
  "plannedQuantity": 1500,
  "sourceUnitOfMeasure": "CS",
  "casesPerPallet": 54,
  "calculatedPallets": 27.78,
  "rowStatus": "VALID",
  "validationCodes": [],
  "validationMessages": [],
  "sourceData": {
    "Resource": "FCL5_3200_001",
    "Product Number": "04310500",
    "Base Unit of Measure": "CS"
  },
  "createdDate": "2026-07-21T11:15:00.000Z"
}
```

---

## 10. Uncertainties & Business Confirmations

Before finalizing the operational implementation, the following business questions require validation from the lead planner:

1.  **Resource Multi-Mapping**: Do resources like `FCL7_3200_001` or others map to a single logical production line, or should they be excluded from the visual dashboard?
2.  **Product Metadata Sync**: If a product SKU in the SAP file is missing from the local product collection, should the import be completely blocked, or should the parser auto-create the SKU using the SAP short description and default `casesPerPallet = 1`?
3.  **Active Run Preservation**: If an operator is currently running a task (e.g., "Active Run" on Perini 3) and a new SAP import arrives, should the system overwrite the status back to `PLANNED`, or should it preserve the `RUNNING` status and only update the planned quantity? *(We recommend preserving the active operational status and merging quantities).*
