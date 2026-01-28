
window.ExcelParser = {

    // Reads file and returns data + column metadata
    parse(file) {
        console.log('ExcelParser.parse called for:', file.name);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                console.log('FileReader: Load complete');
                try {
                    const data = new Uint8Array(e.target.result);
                    console.log('Uint8Array created, size:', data.length);

                    if (typeof XLSX === 'undefined') {
                        throw new Error("SheetJS (XLSX) library not loaded. Check your internet connection or CDN link.");
                    }

                    const workbook = XLSX.read(data, { type: 'array' });
                    console.log('Workbook read successful. Sheets found:', workbook.SheetNames);

                    const results = {
                        data: null,
                        qcData: null,
                        sheets: {},
                        columns: [],
                        summary: { rowCount: 0, colCount: 0, sheetsCount: workbook.SheetNames.length }
                    };

                    workbook.SheetNames.forEach((sheetName, index) => {
                        const sheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: null });
                        results.sheets[sheetName] = jsonData;

                        // Case 1: "QC" sheet for rules
                        if (sheetName.trim().toUpperCase() === 'QC') {
                            results.qcData = jsonData;
                        }

                        // Case 2: Use the FIRST sheet as the main data sheet by default
                        if (index === 0) {
                            results.data = jsonData;
                            const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
                            results.columns = headers.map(header => ({
                                name: header,
                                type: this.inferType(jsonData, header)
                            }));
                            results.summary.rowCount = jsonData.length;
                            results.summary.colCount = headers.length;
                        }
                    });

                    if (!results.data || results.data.length === 0) throw new Error("Main data sheet is empty");

                    resolve(results);

                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    },

    // Simple heuristic to guess column type based on first 100 non-null values
    inferType(data, key) {
        let numberCount = 0;
        let dateCount = 0;
        let validSamples = 0;

        for (let i = 0; i < Math.min(data.length, 100); i++) {
            const val = data[i][key];
            if (val === null || val === undefined || val === '') continue;

            validSamples++;

            if (!isNaN(Number(val))) numberCount++;

            // Basic date check (string dates or JS dates)
            if (val instanceof Date || !isNaN(Date.parse(val))) dateCount++;
        }

        if (validSamples === 0) return 'string'; // Default

        // If > 80% looks like number, treat as number.
        // Priority: Date > Number > String (because dates can look like numbers sometimes in Excel)

        // Note: SheetJS parses dates as numbers sometimes if not configured, 
        // but let's assume raw string or number for now.

        if (numberCount / validSamples > 0.9) return 'number';
        // if (dateCount / validSamples > 0.8) return 'date'; // Date inference is tricky without proper context

        return 'string';
    },

    // Export DQM Report
    exportReport(originalData, results, rules, summary, globalErrors, filename, healthScan) {
        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet
        const summaryData = [
            ["Metric", "Value"],
            ["Total Records", summary.total],
            ["Passed Records", summary.passed],
            ["Failed Records", summary.failed],
            ["Pass Percentage", summary.passPercentage + "%"],
            ["Quality Score", summary.score],
            ["Execution Date", new Date().toISOString()],
            [],
            ["GLOBAL ERRORS", globalErrors && globalErrors.length > 0 ? "YES" : "NO"]
        ];

        if (globalErrors && globalErrors.length > 0) {
            globalErrors.forEach(err => summaryData.push(["Error", err]));
        }

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        // 2. Health Summary (System Scan)
        if (healthScan) {
            const healthData = [
                ["Health Check Metric", "Value"],
                ["Total Rows Scanned", healthScan.stats.totalRows],
                ["Total Columns Scanned", healthScan.stats.totalCols],
                ["Total Missing/Invalid Values", healthScan.stats.nullCount],
                ["Duplicate Row Count", healthScan.duplicates.length],
                ["Duplicate Row IDs", healthScan.duplicates.join(', ') || "None"],
                [],
                ["COLUMN-WISE DATA PROFILING", "", "", "", "", "", ""],
                ["Column Name", "Type", "Unique Count", "Uniqueness %", "Null Rate %", "Range/Length", "PK Candidate"]
            ];

            Object.entries(healthScan.columnMetrics).forEach(([col, m]) => {
                let range = "N/A";
                if (m.inferredType === 'Number' && m.min !== undefined) {
                    range = `[${m.min} to ${m.max}] Avg: ${m.avg}`;
                } else if (m.inferredType === 'String' && m.minLength !== undefined) {
                    range = `Len: ${m.minLength}-${m.maxLength}`;
                }

                healthData.push([
                    col,
                    m.inferredType,
                    m.uniqueCount,
                    (m.uniquenessRatio * 100).toFixed(2) + "%",
                    (m.nullRate * 100).toFixed(2) + "%",
                    range,
                    m.isPrimaryKey ? "YES" : "NO"
                ]);
            });

            const wsHealth = XLSX.utils.aoa_to_sheet(healthData);
            XLSX.utils.book_append_sheet(wb, wsHealth, "Data_Health_Audit");
        }

        // 3. Rules Sheet
        const rulesData = rules.map(r => {
            let target = r.value;
            if (r.isColumnComparison) {
                target = r.isAgg ? `${(r.refAggType || 'sum').toUpperCase()}(${r.value})` : `Column: ${r.value}`;
            }
            return {
                "Scope": r.isAgg ? "Aggregate" : "Row",
                "Column": r.column,
                "Operator": r.operator,
                "Target": target,
                "Type": r.type
            };
        });
        const wsRules = XLSX.utils.json_to_sheet(rulesData);
        XLSX.utils.book_append_sheet(wb, wsRules, "Rules_Applied");

        // 4. Results Sheet
        const combinedData = originalData.map((row, idx) => {
            const result = results ? results[idx] : null;
            return {
                ...row,
                "_DQM_STATUS": result ? (result.passed ? "PASS" : "FAIL") : "NOT_VALIDATED",
                "_FAILURE_REASONS": result ? result.reasons.join('; ') : ""
            };
        });
        const wsResults = XLSX.utils.json_to_sheet(combinedData);
        XLSX.utils.book_append_sheet(wb, wsResults, "DQM_Detailed_Results");

        XLSX.writeFile(wb, `${filename}.xlsx`);
    },

    // --- Collections Specific Exports ---

    // Export a generic JSON array to CSV
    exportCSV(data, filename) {
        const ws = XLSX.utils.json_to_sheet(data);
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // Export Collections Detailed Excel
    exportCollectionsDetailed(rawData, results, filename, dataProfile) {
        console.log('ExcelParser: Exporting detailed collections report');
        const wb = XLSX.utils.book_new();

        // 1. Data Profile Sheet
        if (dataProfile) {
            const profileData = Object.keys(dataProfile).map(col => ({
                "Column Name": col,
                "Blank Count": dataProfile[col].blanks,
                "#DIV/0! / Errors": dataProfile[col].divErrors,
                "Zero Values": dataProfile[col].zeros
            }));
            const wsProfile = XLSX.utils.json_to_sheet(profileData);
            XLSX.utils.book_append_sheet(wb, wsProfile, "Data_Profile");
        }

        // 2. Detailed Data
        // Map data to include status and failures
        const detailedData = rawData.map((row, idx) => {
            const res = results[idx];
            return {
                ...row,
                "_QC_STATUS": res ? (res.passed ? "PASS" : "FAIL") : "N/A",
                "_FAILURE_MESSAGE": res && !res.passed ? res.failures.map(f => f.message).join('; ') : ""
            };
        });

        const ws = XLSX.utils.json_to_sheet(detailedData);
        XLSX.utils.book_append_sheet(wb, ws, "Collections_QC_Detailed");
        XLSX.writeFile(wb, `${filename}.xlsx`);
    }

};
