/**
 * Collections DQM Engine
 * Specialized logic for Step 3.1 (Header Validation) and Step 3.2 (QC Execution)
 */

const CollectionsEngine = (() => {

    const MANDATORY_HEADERS = [
        "FPO Code",
        "State",
        "District",
        "Subdistrict",
        "Village",
        "RID",
        "Total Geographical Area (ha)",
        "Total Agriculture Area (ha)",
        "Sowing 1 Area (ha)",
        "Sowing 1 Percentage",
        "Sowing2 Area (ha)",
        "Sowing 2 Percentage",
        "Sowing 2 ACR",
        "Sowing 3 Area (ha)",
        "Sowing 3 Percentage",
        "Major crops",
        "Crop  Area (ha) K025",
        "Crop  Area Percentage K025",
        "Crop Area Risk",
        "Harvest 1 Area(ha)",
        "Harvest 1 Area Percentage",
        "Harvest 2 Area(ha)",
        "Harvest 2 Area Percentage",
        "Harvest 2 Area Risk",
        "Harvest 3 Area (ha)",
        "Harvest 3 Area Percentage",
        "Harvest 4 Area (ha)",
        "Harvest 4 ACR",
        "Harvest 4 Area Percentage"
    ];

    const HEADER_REFERENCE_URL = "https://docs.google.com/spreadsheets/d/1rhZcuTNs4p2Q0G8seH3A0ArRkRMciFU7rih948HJmzs/edit?usp=sharing";

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
                reason: `Header Count Mismatch: Expected ${MANDATORY_HEADERS.length} columns, found ${uploadedHeaders.length}.`,
                referenceUrl: HEADER_REFERENCE_URL
            };
        }

        const mismatches = [];
        for (let i = 0; i < MANDATORY_HEADERS.length; i++) {
            if (uploadedHeaders[i] !== MANDATORY_HEADERS[i]) {
                mismatches.push({
                    index: i + 1,
                    expected: MANDATORY_HEADERS[i],
                    found: uploadedHeaders[i]
                });
            }
        }

        if (mismatches.length > 0) {
            const mismatchDetails = mismatches.slice(0, 5).map(m =>
                `  • Column ${m.index}: Expected "${m.expected}", found "${m.found}"`
            ).join('\n');
            const moreText = mismatches.length > 5 ? `\n  ... and ${mismatches.length - 5} more mismatches` : '';

            return {
                valid: false,
                reason: `Column name mismatch detected:\n${mismatchDetails}${moreText}`,
                referenceUrl: HEADER_REFERENCE_URL,
                mismatches: mismatches
            };
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
        'lte': (a, b) => a <= b,
        '>=': (a, b) => a >= b,
        'gte': (a, b) => a >= b,
        '!=': (a, b) => a !== b,
        'neq': (a, b) => a !== b,
        '==': (a, b) => a === b,
        '=': (a, b) => a === b,
        'eq': (a, b) => a === b,
        '<': (a, b) => a < b,
        'lt': (a, b) => a < b,
        '>': (a, b) => a > b,
        'gt': (a, b) => a > b,
        'consistency': (a, b) => {
            const s2 = Number(a) || 0;
            const acr = String(b || "").trim();
            if (s2 !== 0) return acr !== "" && acr.toLowerCase() !== 'nan';
            return acr === "" || acr.toLowerCase() === 'nan';
        }
    };

    /**
     * Helper: Aggregations (Supports comma-separated columns for multi-sum)
     */
    /**
     * Helper: Aggregations (Supports comma-separated columns for multi-sum)
     * Updated to support Group By and Distinct/Representative logic.
     */
    const calculateAgg = (data, colStr, type, groupByCol = null, useDistinct = false) => {
        const cols = String(colStr).split(',').map(c => c.trim()).filter(c => c !== "");
        if (cols.length === 0) return 0;

        let validData = data;

        // If Group By is specified (e.g., "RID"), we first group rows and pick a representative value per group
        if (groupByCol && data.length > 0 && data[0][groupByCol] !== undefined) {
            const groups = {};
            data.forEach(row => {
                const key = row[groupByCol];
                if (!groups[key]) groups[key] = [];
                groups[key].push(row);
            });

            // Flatten back to a list of representative rows (or just values)
            // If useDistinct is true (or implied by grouping for "totals"), we take the first value 
            // assuming the column (e.g. Agri Area) is constant for that ID.
            validData = Object.values(groups).map(groupRows => {
                // For now, simplistically take the first row as the representative for the group
                return groupRows[0];
            });
        }

        let totalVal = 0;
        cols.forEach(col => {
            let values = validData.map(r => Number(r[col])).filter(v => !isNaN(v));

            if (values.length === 0) return;

            // If explicit "Distinct" flag is on WITHOUT Group By, we just take unique values locally
            // (Note: This is rarely used if Group By is present, as Group By handles the uniqueness of the entity)
            if (useDistinct && !groupByCol) {
                values = [...new Set(values)];
            }

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

            // New Fields support
            const groupBy = r["Group_By"] || null;
            const distinct = String(r["Distinct"] || "").toLowerCase() === 'true' || String(r["Distinct"] || "").toLowerCase() === 'yes';

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
                    // Pass GroupBy and Distinct params to calculateAgg
                    const actualTargetVal = calculateAgg(dataContext || [], targetCol, aggType, groupBy, distinct);

                    // For reference column, we usually assume SAME Group By logic if it's a comparison of "Total X vs Total Y"
                    // E.g. Sum(Agri) by RID vs Sum(Geo) by RID.
                    const actualCompareVal = isCompareCol
                        ? calculateAgg(dataContext || [], compareAgainst, aggType, groupBy, distinct)
                        : Number(compareAgainst);

                    const passed = OP_MAP[condition] ? OP_MAP[condition](actualTargetVal, actualCompareVal) : true;
                    if (!passed) {
                        const aggLabel = aggType + (groupBy ? `[by ${groupBy}]` : '');
                        const targetLabel = `${aggLabel}(${targetCol})`;
                        const compareLabel = isCompareCol ? `${aggLabel}(${compareAgainst})` : compareAgainst;
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
                message: message,
                groupBy: groupBy, // Store for UI if needed
                distinctPerGroup: distinct
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

        // Global Duplicate Count
        let duplicateRowsCount = 0;
        const seenRows = new Set();
        data.forEach(row => {
            const sig = JSON.stringify(row);
            if (seenRows.has(sig)) duplicateRowsCount++;
            else seenRows.add(sig);
        });

        // Convert Sets to counts
        columns.forEach(col => {
            profile[col].uniqueCount = profile[col].uniqueSet.size;
            delete profile[col].uniqueSet;
        });

        profile.metadata = {
            totalRows: data.length,
            duplicateRows: duplicateRowsCount
        };

        return profile;
    };

    const STANDARD_RULES = [
        // Percentage Checks (0-100)
        {
            id: 1, name: "Sowing 1 % Range", column: "Sowing 1 Percentage", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Sowing 1 Percentage"]); return val >= 0 && val <= 100; },
            message: "Sowing 1 % outside [0, 100]"
        },
        {
            id: 2, name: "Sowing 2 % Range", column: "Sowing 2 Percentage", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Sowing 2 Percentage"]); return val >= 0 && val <= 100; },
            message: "Sowing 2 % outside [0, 100]"
        },
        {
            id: 3, name: "Sowing 3 % Range", column: "Sowing 3 Percentage", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Sowing 3 Percentage"]); return val >= 0 && val <= 100; },
            message: "Sowing 3 % outside [0, 100]"
        },
        {
            id: 4, name: "Crop Area % Range", column: "Crop  Area Percentage K025", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Crop  Area Percentage K025"]); return val >= 0 && val <= 100; },
            message: "Crop Area % outside [0, 100]"
        },
        {
            id: 5, name: "Harvest 1 % Range", column: "Harvest 1 Area Percentage", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Harvest 1 Area Percentage"]); return val >= 0 && val <= 100; },
            message: "Harvest 1 % outside [0, 100]"
        },
        {
            id: 6, name: "Harvest 2 % Range", column: "Harvest 2 Area Percentage", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Harvest 2 Area Percentage"]); return val >= 0 && val <= 100; },
            message: "Harvest 2 % outside [0, 100]"
        },
        {
            id: 7, name: "Harvest 3 % Range", column: "Harvest 3 Area Percentage", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Harvest 3 Area Percentage"]); return val >= 0 && val <= 100; },
            message: "Harvest 3 % outside [0, 100]"
        },
        {
            id: 8, name: "Harvest 4 % Range", column: "Harvest 4 Area Percentage", level: 'row', category: "Range Checks",
            fn: r => { const val = Number(r["Harvest 4 Area Percentage"]); return val >= 0 && val <= 100; },
            message: "Harvest 4 % outside [0, 100]"
        },

        // Progressive Checks (Current >= Previous)
        {
            id: 9, name: "Sowing 2 >= Sowing 1", column: "Sowing2 Area (ha)", level: 'row', category: "Progressive Checks",
            fn: r => {
                if (r["Sowing 1 Area (ha)"] === undefined || r["Sowing2 Area (ha)"] === undefined) return true;
                const s1 = Number(r["Sowing 1 Area (ha)"] || 0);
                const s2 = Number(r["Sowing2 Area (ha)"] || 0);
                if (s2 === 0) return true; // Skip if no data for S2
                return s2 >= s1;
            },
            message: "Sowing 2 < Sowing 1"
        },
        {
            id: 10, name: "Sowing 3 >= Sowing 2", column: "Sowing 3 Area (ha)", level: 'row', category: "Progressive Checks",
            fn: r => {
                if (r["Sowing2 Area (ha)"] === undefined || r["Sowing 3 Area (ha)"] === undefined) return true;
                const s2 = Number(r["Sowing2 Area (ha)"] || 0);
                const s3 = Number(r["Sowing 3 Area (ha)"] || 0);
                if (s3 === 0) return true; // Skip if no data for S3
                return s3 >= s2;
            },
            message: "Sowing 3 < Sowing 2"
        },
        {
            id: 11, name: "Harvest 2 >= Harvest 1", column: "Harvest 2 Area(ha)", level: 'row', category: "Progressive Checks",
            fn: r => {
                if (r["Harvest 1 Area(ha)"] === undefined || r["Harvest 2 Area(ha)"] === undefined) return true;
                const h1 = Number(r["Harvest 1 Area(ha)"] || 0);
                const h2 = Number(r["Harvest 2 Area(ha)"] || 0);
                if (h2 === 0) return true;
                return h2 >= h1;
            },
            message: "Harvest 2 < Harvest 1"
        },
        {
            id: 12, name: "Harvest 3 >= Harvest 2", column: "Harvest 3 Area (ha)", level: 'row', category: "Progressive Checks",
            fn: r => {
                if (r["Harvest 2 Area(ha)"] === undefined || r["Harvest 3 Area (ha)"] === undefined) return true;
                const h2 = Number(r["Harvest 2 Area(ha)"] || 0);
                const h3 = Number(r["Harvest 3 Area (ha)"] || 0);
                if (h3 === 0) return true;
                return h3 >= h2;
            },
            message: "Harvest 3 < Harvest 2"
        },
        {
            id: 13, name: "Harvest 4 >= Harvest 3", column: "Harvest 4 Area (ha)", level: 'row', category: "Progressive Checks",
            fn: r => {
                if (r["Harvest 3 Area (ha)"] === undefined || r["Harvest 4 Area (ha)"] === undefined) return true;
                const h3 = Number(r["Harvest 3 Area (ha)"] || 0);
                const h4 = Number(r["Harvest 4 Area (ha)"] || 0);
                if (h4 === 0) return true;
                return h4 >= h3;
            },
            message: "Harvest 4 < Harvest 3"
        },
        // Agri Area Limits
        {
            id: 14, name: "Agri Area >= Latest Sowing", column: "Total Agriculture Area (ha)", level: 'row', category: "Limit Checks",
            fn: r => {
                const agri = Number(r["Total Agriculture Area (ha)"] || 0);
                // Get latest non-zero sowing
                const s3 = r["Sowing 3 Area (ha)"] !== undefined ? Number(r["Sowing 3 Area (ha)"] || 0) : 0;
                const s2 = r["Sowing2 Area (ha)"] !== undefined ? Number(r["Sowing2 Area (ha)"] || 0) : 0;
                const s1 = r["Sowing 1 Area (ha)"] !== undefined ? Number(r["Sowing 1 Area (ha)"] || 0) : 0;
                const latestSowing = s3 > 0 ? s3 : (s2 > 0 ? s2 : s1);

                // If no sowing data at all, skip
                if (latestSowing === 0) return true;

                return agri >= latestSowing;
            },
            message: "Agri Area < Latest Sowing Area"
        },
        {
            id: 15, name: "Sowing 2 Consistency", column: "Sowing2 Area (ha)", level: 'row', category: "Consistency Checks",
            fn: r => {
                if (r["Sowing2 Area (ha)"] === undefined || r["Sowing 2 ACR"] === undefined) return true;
                const s2 = Number(r["Sowing2 Area (ha)"] || 0);
                const acr = String(r["Sowing 2 ACR"] || "").trim();
                if (s2 !== 0) return acr !== "" && acr.toLowerCase() !== 'nan';
                return acr === "" || acr.toLowerCase() === 'nan';
            },
            message: "Sowing 2/ACR Mismatch: If Sowing 2 != 0, ACR must exist. If Sowing 2 == 0, ACR must be blank."
        }
    ];

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

        const activeRules = (externalRules && externalRules.length > 0) ? externalRules : STANDARD_RULES;

        console.log(`CollectionsEngine: Running QC with ${activeRules.length} rules.`);
        const dataProfile = generateDataProfile(data);

        // ... (Aggregate Rule Execution) ...
        const rowRules = activeRules.filter(r => r.level === 'row');
        const aggRules = activeRules.filter(r => r.level === 'agg');

        aggRules.forEach(rule => {
            const passed = rule.fn(null, data);
            if (!passed) globalFailures.push(`[AGGREGATE FAIL] ${rule.name}: ${rule.message}`);
        });

        // Duplicate Detection
        const seenRows = new Map();

        // ... (Row Rule Execution) ...
        data.forEach((row, index) => {
            const rowFailures = [];
            const evaluations = [];

            // 1. Check for Full Row Duplicate
            const rowSignature = JSON.stringify(row);
            if (seenRows.has(rowSignature)) {
                const originalRow = seenRows.get(rowSignature);
                rowFailures.push({
                    column: "ALL",
                    rule: "Duplicate Row Check",
                    message: `Duplicate of Row ${originalRow}`
                });
                evaluations.push({
                    ruleId: 9999,
                    ruleDesc: "Duplicate Row",
                    passed: false,
                    value: `Ref: Row ${originalRow}`
                });
            } else {
                seenRows.set(rowSignature, index + 1);
            }

            const isDuplicate = rowFailures.length > 0 && rowFailures[0].rule === "Duplicate Row Check";

            rowRules.forEach(rule => {
                // Check if target column exists
                if (row[rule.column] === undefined) {
                    // IF it's an external (custom) rule or the user is in customized mode, 
                    // we skip checks for missing columns rather than failing them.
                    // Strictly speaking, if the column is missing, the check cannot be performed.
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

            rowResults.push({
                row: index + 1,
                passed: rowPassed,
                failures: rowFailures,
                evaluations: evaluations,
                isDuplicate: isDuplicate
            });
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

    const engineInstance = {
        MANDATORY_HEADERS,
        validateHeaders,
        parseRules,
        runQC,
        getStandardRules: () => STANDARD_RULES.map(r => ({ ...r }))
    };

    if (typeof window !== 'undefined') {
        window.CollectionsEngine = engineInstance;
    }

    return engineInstance;

})();

// Export for module use if in Node, else it's global in browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollectionsEngine;
}
