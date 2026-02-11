
window.DQMEngine = {


    getOperators(type, isAgg) {
        if (isAgg) {
            if (type === 'number') {
                return [
                    { id: 'sum_gt', label: 'Sum >' }, { id: 'sum_lt', label: 'Sum <' },
                    { id: 'sum_gte', label: 'Sum >=' }, { id: 'sum_lte', label: 'Sum <=' },
                    { id: 'sum_eq', label: 'Sum =' }, { id: 'sum_neq', label: 'Sum !=' },
                    { id: 'avg_gt', label: 'Average >' }, { id: 'avg_lt', label: 'Average <' },
                    { id: 'avg_gte', label: 'Average >=' }, { id: 'avg_lte', label: 'Average <=' },
                    { id: 'min_gt', label: 'Min >' }, { id: 'min_lt', label: 'Min <' },
                    { id: 'max_gt', label: 'Max >' }, { id: 'max_lt', label: 'Max <' }
                ];
            }
            return [];
        }

        if (type === 'number') {
            return [
                { id: 'gt', label: '>' }, { id: 'lt', label: '<' }, { id: 'gte', label: '>=' },
                { id: 'lte', label: '<=' }, { id: 'eq', label: '=' }, { id: 'neq', label: '!=' },
                { id: 'consistency', label: 'Consistency (0 ↔ Blank)' }
            ];
        }
        if (type === 'string') {
            return [
                { id: 'eq', label: 'Equals' }, { id: 'neq', label: 'Not Equals' },
                { id: 'contains', label: 'Contains' }, { id: 'not_contains', label: 'Does Not Contain' },
                { id: 'starts_with', label: 'Starts With' },
                { id: 'is_blank', label: 'Is Blank' }, { id: 'not_blank', label: 'Is Not Blank' }
            ];
        }
        return [
            { id: 'eq', label: '=' }, { id: 'neq', label: '!=' },
            { id: 'is_blank', label: 'Is Blank' }, { id: 'not_blank', label: 'Is Not Blank' }
        ];
    },

    execute(dataset, rules) {
        const rowRules = rules.filter(r => !r.isAgg);
        const aggRules = rules.filter(r => r.isAgg);

        const aggregates = this.computeAggregates(dataset);
        const globalErrors = [];

        // Execute Aggregate Rules
        // Execute Aggregate Rules (GROUP-AWARE + DISTINCT SAFE)
        aggRules.forEach(rule => {

            const { op, aggType } = this.parseAggOp(rule.operator);

            // GROUP BY = rule.column (RID in your case)
            const grouped = {};

            dataset.forEach(row => {
                const key = rule.groupBy ? row[rule.groupBy] : 'GLOBAL';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(row);
            });

            for (const [groupKey, rows] of Object.entries(grouped)) {

                // TARGET aggregation (DISTINCT if enabled)
                const targetVals = this.extractGroupValues(
                    rows,
                    rule.column,
                    rule.distinctPerGroup
                );

                if (targetVals.length === 0) continue;

                const targetAgg = (() => {
                    switch (aggType) {
                        case 'sum': return targetVals.reduce((a, b) => a + b, 0);
                        case 'avg': return targetVals.reduce((a, b) => a + b, 0) / targetVals.length;
                        case 'min': return Math.min(...targetVals);
                        case 'max': return Math.max(...targetVals);
                        default: return 0;
                    }
                })();

                // COMPARE aggregation
                let compareAgg;
                let targetDesc;

                if (rule.isColumnComparison) {
                    const compareVals = this.extractGroupValues(
                        rows,
                        rule.value,
                        rule.distinctPerGroup
                    );

                    const refAgg = rule.refAggType || aggType;
                    compareAgg = (() => {
                        switch (refAgg) {
                            case 'sum': return compareVals.reduce((a, b) => a + b, 0);
                            case 'avg': return compareVals.reduce((a, b) => a + b, 0) / (compareVals.length || 1);
                            case 'min': return Math.min(...compareVals);
                            case 'max': return Math.max(...compareVals);
                            default: return 0;
                        }
                    })();
                    targetDesc = `${refAgg.toUpperCase()}(${rule.value})`;
                } else {
                    compareAgg = Number(rule.value);
                    targetDesc = rule.value;
                }

                const passed = this.compareValues(targetAgg, compareAgg, op);

                if (!passed) {
                    const groupInfo = rule.groupBy ? `${rule.groupBy}=${groupKey}` : 'Global';
                    globalErrors.push(
                        `FAIL [${groupInfo}]: `
                        + `${aggType.toUpperCase()}(${rule.column}${rule.distinctPerGroup ? ' [DISTINCT]' : ''}) `
                        + `is ${targetAgg.toFixed(2)}, expected ${op} ${targetDesc} (${Number(compareAgg).toFixed(2)})`
                    );
                }
            }
        });


        // Execute Row Rules
        let passedCount = 0;
        const results = [];
        dataset.forEach(row => {
            const reasons = [];
            const evaluations = [];
            let rowPassed = true;

            for (const rule of rowRules) {
                const val = row[rule.column];
                let target = rule.value;
                if (rule.isColumnComparison) target = row[rule.value];

                const passed = this.evaluateSingle(val, rule.operator, target, rule.type);

                const cleanTarget = rule.isColumnComparison ? `Col(${rule.value})` : rule.value;
                evaluations.push({
                    ruleId: rule.id,
                    ruleDesc: `${rule.column} ${rule.operator} ${cleanTarget}`,
                    passed: passed,
                    value: val
                });

                if (!passed) {
                    rowPassed = false;
                    reasons.push(`${rule.column} ${rule.operator} ${cleanTarget}`);
                }
            }
            if (rowPassed) passedCount++;
            results.push({
                passed: rowPassed,
                reasons: reasons,
                evaluations: evaluations
            });
        });

        const total = dataset.length;
        return {
            results,
            globalErrors,
            summary: {
                total, passed: passedCount, failed: total - passedCount,
                passPercentage: total > 0 ? ((passedCount / total) * 100).toFixed(1) : 0,
                score: total > 0 ? ((passedCount / total) * 10).toFixed(1) : 0
            }
        };
    },

    runQuickScan(dataset) {
        const seen = new Set();
        const findings = {
            duplicates: [],
            nulls: {}, // {col: count}
            profiling: {}, // Temporary storage for profiling data
            stats: {
                totalRows: dataset.length,
                totalCols: dataset.length > 0 ? Object.keys(dataset[0]).length : 0,
                nullCount: 0
            }
        };

        if (findings.stats.totalRows > 0) {
            Object.keys(dataset[0]).forEach(col => {
                findings.profiling[col] = {
                    uniqueValues: new Set(),
                    numericValues: [],
                    stringValues: [],
                    typeCounts: { number: 0, string: 0, empty: 0 }
                };
            });
        }

        dataset.forEach((row, i) => {
            // Check Duplicates
            const rowStr = JSON.stringify(row);
            if (seen.has(rowStr)) {
                findings.duplicates.push(i + 1);
            } else {
                seen.add(rowStr);
            }

            // Check Values and Profile
            Object.entries(row).forEach(([col, val]) => {
                const isNull = val === null || val === undefined || val === '' ||
                    String(val).trim().toUpperCase() === '#N/A' ||
                    String(val).trim().toUpperCase() === 'NA';

                const profile = findings.profiling[col];
                if (!profile) return;

                if (isNull) {
                    findings.stats.nullCount++;
                    findings.nulls[col] = (findings.nulls[col] || 0) + 1;
                    profile.typeCounts.empty++;
                } else {
                    profile.uniqueValues.add(val);
                    if (!isNaN(Number(val)) && String(val).trim() !== '') {
                        profile.numericValues.push(Number(val));
                        profile.typeCounts.number++;
                    } else {
                        profile.stringValues.push(String(val));
                        profile.typeCounts.string++;
                    }
                }
            });
        });

        // Compute Final Column Metrics
        const columnMetrics = {};
        Object.entries(findings.profiling).forEach(([col, p]) => {
            const count = p.numericValues.length + p.stringValues.length;
            const uniqueCount = p.uniqueValues.size;

            const metrics = {
                uniqueCount,
                uniquenessRatio: count > 0 ? (uniqueCount / count).toFixed(4) : 0,
                nullRate: findings.stats.totalRows > 0 ? ((findings.nulls[col] || 0) / findings.stats.totalRows).toFixed(4) : 0,
                inferredType: p.typeCounts.number > p.typeCounts.string ? 'Number' : 'String',
                isPrimaryKey: uniqueCount === findings.stats.totalRows && (findings.nulls[col] || 0) === 0
            };

            if (p.numericValues.length > 0) {
                metrics.min = Math.min(...p.numericValues);
                metrics.max = Math.max(...p.numericValues);
                metrics.avg = (p.numericValues.reduce((a, b) => a + b, 0) / p.numericValues.length).toFixed(2);
            }

            if (p.stringValues.length > 0) {
                const lengths = p.stringValues.map(s => s.length);
                metrics.minLength = Math.min(...lengths);
                metrics.maxLength = Math.max(...lengths);
            }

            columnMetrics[col] = metrics;
        });

        findings.columnMetrics = columnMetrics;
        delete findings.profiling; // Remove temp storage
        return findings;
    },

    computeAggregates(dataset) {
        const stats = {};
        if (dataset.length === 0) return stats;

        const keys = Object.keys(dataset[0]);
        keys.forEach(key => {
            const isNum = !isNaN(Number(dataset[0][key]));
            if (isNum) {
                const values = dataset.map(r => Number(r[key] || 0));
                const sum = values.reduce((a, b) => a + b, 0);
                const min = Math.min(...values);
                const max = Math.max(...values);
                const avg = sum / values.length;
                stats[key] = { sum, min, max, avg };
            }
        });
        return stats;
    },

    parseAggOp(fullOp) {
        const parts = fullOp.split('_');
        return { aggType: parts[0], op: parts[1] };
    },

    compareValues(a, b, op) {
        const eps = 1e-6;
        switch (op) {
            case 'gt': return a > b + eps;
            case 'lt': return a < b - eps;
            case 'gte': return a >= b - eps;
            case 'lte': return a <= b + eps;
            case 'eq': return Math.abs(a - b) < eps;
            case 'neq': return Math.abs(a - b) >= eps;
            default: return false;
        }
    },

    // 👇👇 PASTE EXACTLY HERE 👇👇
    extractGroupValues(rows, column, distinct) {
        const values = rows
            .map(r => Number(r[column]))
            .filter(v => !isNaN(v));

        return distinct ? [...new Set(values)] : values;
    },

    evaluateSingle(value, operator, target, type) {
        const isBlank = value === null || value === undefined || String(value).trim() === '' ||
            String(value).trim().toUpperCase() === '#N/A' ||
            String(value).trim().toUpperCase() === 'NA';

        if (operator === 'is_blank') return isBlank;
        if (operator === 'not_blank') return !isBlank;

        if (operator === 'consistency') {
            const nVal = Number(value) || 0;
            const sTarget = String(target || "").trim().toUpperCase();
            const targetIsBlank = sTarget === "" || sTarget === "NA" || sTarget === "#N/A" || sTarget === "NAN";
            return nVal !== 0 ? !targetIsBlank : targetIsBlank;
        }

        if (isBlank) return false;
        if (type === 'number') {
            const nVal = Number(value);
            const nTarget = Number(target);
            if (isNaN(nVal) || isNaN(nTarget)) return false;
            switch (operator) {
                case 'gt': return nVal > nTarget; case 'lt': return nVal < nTarget;
                case 'gte': return nVal >= nTarget; case 'lte': return nVal <= nTarget;
                case 'eq': return nVal === nTarget; case 'neq': return nVal !== nTarget;
                default: return false;
            }
        }
        const sVal = String(value).toLowerCase();
        const sTarget = String(target).toLowerCase();
        switch (operator) {
            case 'eq': return sVal === sTarget; case 'neq': return sVal !== sTarget;
            case 'contains': return sVal.includes(sTarget); case 'not_contains': return !sVal.includes(sTarget);
            case 'starts_with': return sVal.startsWith(sTarget); default: return false;
        }
    }

};
