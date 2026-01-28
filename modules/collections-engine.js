/**
 * Collections DQM Engine
 * Specialized logic for Step 3.1 (Header Validation) and Step 3.2 (QC Execution)
 */

const CollectionsEngine = (() => {

    const MANDATORY_HEADERS = [
        "Region Code",
        "FPO Code",
        "Agri Area",
        "Geographical Area",
        "Sowing 1 Area",
        "Sowing 1 %",
        "Sowing 2 Area",
        "Sowing 2 %",
        "Sowing 3 Area",
        "Sowing 3 %"
    ];

    /**
     * Step 3.1: Header Validation (Hard Stop)
     * Strict comparison: Case-sensitive, order-sensitive, no missing/extra columns.
     */
    const validateHeaders = (uploadedHeaders) => {
        // According to Step 3.1: "Compare uploaded headers with Collections standard headers... NO extra columns... NO missing columns... Order must match."
        // We will assume MANDATORY_HEADERS defines the exact standard.

        if (uploadedHeaders.length !== MANDATORY_HEADERS.length) {
            return {
                valid: false,
                reason: `Header Count Mismatch: Expected ${MANDATORY_HEADERS.length}, found ${uploadedHeaders.length}.`
            };
        }

        for (let i = 0; i < MANDATORY_HEADERS.length; i++) {
            if (uploadedHeaders[i] !== MANDATORY_HEADERS[i]) {
                return {
                    valid: false,
                    reason: `Header Mismatch at Index ${i}: Expected "${MANDATORY_HEADERS[i]}", found "${uploadedHeaders[i]}".`
                };
            }
        }

        return { valid: true };
    };

    /**
     * Helper: Resolve value from row/static (Supports comma-separated columns for SUM)
     */
    const resolveValue = (val, row, isColumn) => {
        if (!val) return 0;
        if (isColumn) {
            const cols = String(val).split(',').map(c => c.trim()).filter(c => c !== "");
            if (cols.length > 1) {
                return cols.reduce((sum, col) => sum + (Number(row[col]) || 0), 0);
            }
            return row[val];
        }
        // Clean numeric
        if (!isNaN(Number(val)) && String(val).trim() !== '') return Number(val);
        // #N/A specifically
        if (String(val).trim().toUpperCase() === '#N/A') return '#N/A';
        return val;
    };

    /**
     * Helper: Operators
     */
    const OP_MAP = {
        '<=': (a, b) => a <= b,
        '>=': (a, b) => a >= b,
        '!=': (a, b) => a !== b,
        '==': (a, b) => a === b,
        '=': (a, b) => a === b,
        '<': (a, b) => a < b,
        '>': (a, b) => a > b
    };

    /**
     * Helper: Aggregations (Supports comma-separated columns for multi-sum)
     */
    const calculateAgg = (data, colStr, type) => {
        const cols = String(colStr).split(',').map(c => c.trim()).filter(c => c !== "");
        let totalVal = 0;
        cols.forEach(col => {
            const values = data.map(r => Number(r[col])).filter(v => !isNaN(v));
            if (values.length === 0) return;
            const t = (type || 'sum').toLowerCase();
            switch (t) {
                case 'sum': totalVal += values.reduce((a, b) => a + b, 0); break;
                case 'avg': totalVal += (values.reduce((a, b) => a + b, 0) / values.length); break;
                case 'min': totalVal = (totalVal === 0) ? Math.min(...values) : Math.min(totalVal, ...values); break;
                case 'max': totalVal = Math.max(totalVal, ...values); break;
                case 'count': totalVal += values.length; break;
            }
        });
        return totalVal;
    };

    /**
     * Convert Structured Excel "QC" sheet data into rule objects
     */
    const parseRules = (qcData, allData = []) => {
        if (!qcData || !Array.isArray(qcData)) return [];

        return qcData.map((r, i) => {
            const level = (r["Level"] || "Row").trim().toLowerCase();
            const targetCol = r["Target_Column"] || "";
            const condition = String(r["Condition"] || "").trim().replace(/^'/, ''); // Strip Excel escape
            const compareAgainst = r["Compare_Against"] || "";
            const isCompareCol = String(r["Is_Compare_Column"]).toLowerCase() === 'true' || String(r["Is_Compare_Column"]).toLowerCase() === 'yes';
            const aggType = r["Aggregation"] || "Sum";

            let fn;
            let message = `${targetCol} ${condition} ${compareAgainst}`;

            if (level === 'row') {
                fn = (row) => {
                    const tVal = resolveValue(targetCol, row, true);
                    const cVal = resolveValue(compareAgainst, row, isCompareCol);
                    return OP_MAP[condition] ? OP_MAP[condition](tVal, cVal) : true;
                };
            } else {
                // Aggregate Level
                fn = (row, dataContext) => {
                    const actualTargetVal = calculateAgg(dataContext || [], targetCol, aggType);
                    const actualCompareVal = isCompareCol ? calculateAgg(dataContext || [], compareAgainst, aggType) : Number(compareAgainst);

                    const passed = OP_MAP[condition] ? OP_MAP[condition](actualTargetVal, actualCompareVal) : true;
                    if (!passed) {
                        const targetLabel = `${aggType}(${targetCol})`;
                        const compareLabel = isCompareCol ? `${aggType}(${compareAgainst})` : compareAgainst;
                        message = `AGG FAIL: ${targetLabel} [${actualTargetVal.toFixed(2)}] ${condition} ${compareLabel} [${actualCompareVal.toFixed(2)}]`;
                    }
                    return passed;
                };
            }

            return {
                id: i + 500,
                name: r["QC_Check_Name"] || `Rule ${i + 1}`,
                column: targetCol.split(',')[0].trim(),
                level: level,
                fn: fn,
                message: message
            };
        });
    };

    /**
     * Universal Data Profiling
     * Checks for Blanks/-, #DIV/0!, and Zero values across ALL columns.
     */
    const generateDataProfile = (data) => {
        if (!data || data.length === 0) return {};

        const columns = Object.keys(data[0]);
        const profile = {};

        columns.forEach(col => {
            profile[col] = {
                blanks: 0,
                divErrors: 0,
                zeros: 0,
                uniqueSet: new Set()
            };
        });

        data.forEach(row => {
            columns.forEach(col => {
                const val = row[col];
                const strVal = String(val !== undefined && val !== null ? val : "").trim();
                const numVal = Number(val);

                // 1. Blanks or "-"
                if (strVal === "" || strVal === "-") {
                    profile[col].blanks++;
                } else {
                    // Track unique non-blank values
                    profile[col].uniqueSet.add(strVal);
                }

                // 2. #DIV/0! Errors (and generic errors)
                if (strVal.toUpperCase() === "#DIV/0!" || strVal.toUpperCase() === "#REF!" || strVal.toUpperCase() === "#VALUE!" || strVal.toUpperCase() === "#N/A") {
                    profile[col].divErrors++;
                }

                // 3. Zero values
                if (strVal !== "" && strVal !== "-" && !isNaN(numVal) && numVal === 0) {
                    profile[col].zeros++;
                }
            });
        });

        // Convert Sets to counts
        columns.forEach(col => {
            profile[col].uniqueCount = profile[col].uniqueSet.size;
            delete profile[col].uniqueSet;
        });

        return profile;
    };

    /**
     * Step 3.2: QC Execution
     */
    const runQC = (data, externalRules = null) => {
        const rowResults = [];
        const globalFailures = [];
        const summary = {
            total: data.length,
            passed: 0,
            failed: 0,
            passPercentage: 0,
            score: 0,
            impactedRows: new Set()
        };

        // ... (Rule setup omitted for brevity, logic remains same) ...
        const defaultRules = [
            { id: 1, name: "Region Code #N/A Check", column: "Region Code", level: 'row', fn: r => r["Region Code"] !== "#N/A", message: "Region Code is #N/A" },
            { id: 2, name: "FPO Code #N/A Check", column: "FPO Code", level: 'row', fn: r => r["FPO Code"] !== "#N/A", message: "FPO Code is #N/A" },
            { id: 3, name: "Agri Area vs Geographical Area", column: "Agri Area", level: 'row', fn: r => Number(r["Agri Area"]) <= Number(r["Geographical Area"]), message: "Agri Area > Geographical Area" },
            { id: 4, name: "Sowing 1 vs Agri Area", column: "Sowing 1 Area", level: 'row', fn: r => Number(r["Sowing 1 Area"]) <= Number(r["Agri Area"]), message: "Sowing 1 Area > Agri Area" },
            { id: 5, name: "Sowing 2 vs Agri Area", column: "Sowing 2 Area", level: 'row', fn: r => Number(r["Sowing 2 Area"]) <= Number(r["Agri Area"]), message: "Sowing 2 Area > Agri Area" },
            { id: 6, name: "Sowing 3 vs Agri Area", column: "Sowing 3 Area", level: 'row', fn: r => Number(r["Sowing 3 Area"]) <= Number(r["Agri Area"]), message: "Sowing 3 Area > Agri Area" },
            { id: 7, name: "Sowing 2 vs Sowing 1", column: "Sowing 2 Area", level: 'row', fn: r => Number(r["Sowing 2 Area"]) >= Number(r["Sowing 1 Area"]), message: "Sowing 2 Area < Sowing 1 Area" },
            { id: 8, name: "Sowing 3 vs Sowing 2", column: "Sowing 3 Area", level: 'row', fn: r => Number(r["Sowing 3 Area"]) >= Number(r["Sowing 2 Area"]), message: "Sowing 3 Area < Sowing 2 Area" },
            { id: 9, name: "Sowing 1 % Range", column: "Sowing 1 %", level: 'row', fn: r => { const val = Number(r["Sowing 1 %"]); return val >= 0 && val <= 100; }, message: "Sowing 1 % outside [0, 100]" },
            { id: 10, name: "Sowing 2 % Range", column: "Sowing 2 %", level: 'row', fn: r => { const val = Number(r["Sowing 2 %"]); return val >= 0 && val <= 100; }, message: "Sowing 2 % outside [0, 100]" },
            { id: 11, name: "Sowing 3 % Range", column: "Sowing 3 %", level: 'row', fn: r => { const val = Number(r["Sowing 3 %"]); return val >= 0 && val <= 100; }, message: "Sowing 3 % outside [0, 100]" },
            {
                id: 12, name: "Sowing 1 Zero Area Dependency", column: "Sowing 1 Area", level: 'row', fn: r => {
                    if (Number(r["Sowing 1 Area"]) === 0) return Number(r["Sowing 1 %"]) === 0;
                    return true;
                }, message: "Sowing 1 Area is 0 but % is not 0"
            },
            {
                id: 13, name: "Sowing 1 Zero % Dependency", column: "Sowing 1 %", level: 'row', fn: r => {
                    if (Number(r["Sowing 1 %"]) === 0) return Number(r["Sowing 1 Area"]) === 0;
                    return true;
                }, message: "Sowing 1 % is 0 but Area is not 0"
            },
            {
                id: 14, name: "Sowing 2 Zero Area Cascade", column: "Sowing 2 Area", level: 'row', fn: r => {
                    if (Number(r["Sowing 2 Area"]) === 0) {
                        return Number(r["Sowing 1 Area"]) === 0 && Number(r["Sowing 1 %"]) === 0 && Number(r["Sowing 2 %"]) === 0;
                    }
                    return true;
                }, message: "Sowing 2 Area is 0 but nested values (S1 Area, S1 %, S2 %) are not 0"
            }
        ];

        const processedDefaultRules = defaultRules.map(r => ({ ...r, level: r.level || 'row' }));
        const activeRules = externalRules && externalRules.length > 0 ? externalRules : processedDefaultRules;

        console.log(`CollectionsEngine: Running QC with ${activeRules.length} rules.`);
        const dataProfile = generateDataProfile(data);

        // ... (Aggregate Rule Execution) ...
        const rowRules = activeRules.filter(r => r.level === 'row');
        const aggRules = activeRules.filter(r => r.level === 'agg');

        aggRules.forEach(rule => {
            const passed = rule.fn(null, data);
            if (!passed) globalFailures.push(`[AGGREGATE FAIL] ${rule.name}: ${rule.message}`);
        });

        // ... (Row Rule Execution) ...
        data.forEach((row, index) => {
            const rowFailures = [];
            const evaluations = [];

            rowRules.forEach(rule => {
                // Check if target column exists
                if (row[rule.column] === undefined) {
                    rowFailures.push({ column: rule.column, rule: rule.name, message: `Missing Column: ${rule.column}` });
                    evaluations.push({ ruleId: rule.id, ruleDesc: rule.name, passed: false, value: 'MISSING' });
                    return;
                }

                const passed = rule.fn(row);
                evaluations.push({ ruleId: rule.id, ruleDesc: rule.name, passed: passed, value: row[rule.column] });
                if (!passed) rowFailures.push({ column: rule.column, rule: rule.name, message: rule.message });
            });

            const rowPassed = rowFailures.length === 0;
            if (rowPassed) summary.passed++;
            else {
                summary.failed++;
                summary.impactedRows.add(index + 1);
            }

            rowResults.push({ row: index + 1, passed: rowPassed, failures: rowFailures, evaluations: evaluations });
        });

        summary.passPercentage = ((summary.passed / summary.total) * 100).toFixed(1);
        summary.score = (Number(summary.passPercentage) / 10).toFixed(1);

        return {
            summary,
            results: rowResults,
            globalErrors: globalFailures,
            dataProfile: dataProfile, // New Profile Data
            rulesApplied: activeRules
        };
    };

    window.CollectionsEngine = {
        MANDATORY_HEADERS,
        validateHeaders,
        parseRules,
        runQC
    };

    return window.CollectionsEngine;

})();

// Export for module use if in Node, else it's global in browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollectionsEngine;
}
