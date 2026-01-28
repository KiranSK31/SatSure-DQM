
document.addEventListener('DOMContentLoaded', () => {
    console.log('--- System Initialization ---');
    console.log('XLSX Available:', typeof window.XLSX !== 'undefined');
    console.log('DQMState Available:', typeof window.DQMState !== 'undefined');
    console.log('ExcelParser Available:', typeof window.ExcelParser !== 'undefined');
    console.log('UIRenderer Available:', typeof window.UIRenderer !== 'undefined');
    console.log('DQMEngine Available:', typeof window.DQMEngine !== 'undefined');
    console.log('CollectionsEngine Available:', typeof window.CollectionsEngine !== 'undefined');

    if (!window.UIRenderer || !window.ExcelParser || !window.DQMState || !window.XLSX) {
        console.error('CRITICAL: One or more systems failed to initialize. Please check script order or CDN connectivity.');
        alert('Internal Error: Application failed to initialize modules. Please refresh or check console (F12).');
    }

    // Initialize Icons
    if (window.lucide) lucide.createIcons();

    const { DQMState: state, ExcelParser, UIRenderer, DQMEngine, CollectionsEngine } = window;
    const { updateFileInfo, renderColumns, renderRuleList, renderDashboard } = UIRenderer;

    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const ruleSection = document.getElementById('section-rules');
    const ruleColumnSelect = document.getElementById('rule-column');
    const ruleOperatorSelect = document.getElementById('rule-operator');
    const ruleValueInput = document.getElementById('rule-value');
    const ruleCompareColSelect = document.getElementById('rule-compare-col');
    const ruleCompareAggSelect = document.getElementById('rule-compare-agg-type');
    const useColCompareCheckbox = document.getElementById('use-col-compare');
    const ruleGroupBySelect = document.getElementById('rule-group-by');
    const useDistinctCheckbox = document.getElementById('use-distinct-per-group');
    const btnAddRule = document.getElementById('btn-add-rule');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnRun = document.getElementById('btn-run-dqm');
    const btnExport = document.getElementById('btn-export');
    const btnQuickScan = document.getElementById('btn-quick-scan');
    const btnRemoveFile = document.getElementById('btn-remove-file');
    const btnCollections = document.getElementById('btn-collections-qc');
    const collectionsActions = document.getElementById('collections-actions');
    const btnColSummary = document.getElementById('btn-col-summary');
    const btnColDetailed = document.getElementById('btn-col-detailed');
    const btnColFailed = document.getElementById('btn-col-failed');
    const scopeRowBtn = document.getElementById('scope-row');
    const scopeAggBtn = document.getElementById('scope-agg');

    // --- Modal Elements ---
    const qcChoiceModal = document.getElementById('qc-choice-modal');
    const modalBtnDefault = document.getElementById('modal-btn-default');
    const modalBtnUpload = document.getElementById('modal-btn-upload');
    const modalClose = document.getElementById('modal-close');
    const qcRulesInput = document.getElementById('qc-rules-input');

    // --- Modal Logic ---
    const showModal = () => {
        if (qcChoiceModal) {
            qcChoiceModal.classList.remove('hidden');
            document.body.classList.add('modal-active');
        }
    };
    const hideModal = () => {
        if (qcChoiceModal) {
            qcChoiceModal.classList.add('hidden');
            document.body.classList.remove('modal-active');
        }
    };

    if (modalClose) modalClose.addEventListener('click', hideModal);

    // --- Header Error Modal Logic ---
    const headerErrorModal = document.getElementById('header-error-modal');
    const headerErrorMessage = document.getElementById('header-error-message');
    const headerReferenceLink = document.getElementById('header-reference-link');
    const headerErrorClose = document.getElementById('header-error-close');

    const showHeaderErrorModal = (errorMessage, referenceUrl) => {
        if (headerErrorModal && headerErrorMessage && headerReferenceLink) {
            headerErrorMessage.textContent = errorMessage;
            headerReferenceLink.href = referenceUrl || '#';
            headerErrorModal.classList.remove('hidden');
            document.body.classList.add('modal-active');
            if (window.lucide) lucide.createIcons();
        }
    };

    const hideHeaderErrorModal = () => {
        if (headerErrorModal) {
            headerErrorModal.classList.add('hidden');
            document.body.classList.remove('modal-active');
        }
    };

    if (headerErrorClose) headerErrorClose.addEventListener('click', hideHeaderErrorModal);


    // --- 1. File Upload Handling ---

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-accent', 'bg-blue-50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-accent', 'bg-blue-50');
    });

    dropZone.addEventListener('drop', handleFileSelect);
    fileInput.addEventListener('change', handleFileSelect);

    async function handleFileSelect(e) {
        e.preventDefault();
        dropZone.classList.remove('border-accent', 'bg-blue-50');

        const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
        console.log('handleFileSelect triggered. File:', file ? file.name : 'No file');
        if (!file) return;

        try {
            const results = await ExcelParser.parse(file);
            const { data, columns, qcData } = results;

            state.reset();
            state.setRawData(data);
            state.setColumns(columns);
            state.setFilename(file.name);
            updateFileInfo(file.name);
            renderColumns(columns);
            if (btnQuickScan) btnQuickScan.classList.remove('hidden');
            if (btnRun) btnRun.classList.remove('hidden');
            if (btnCollections) btnCollections.classList.remove('hidden');

            // Also populate group-by
            if (ruleGroupBySelect) {
                ruleGroupBySelect.innerHTML = '<option value="">Select Grouping Column...</option>' +
                    columns.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
            }

            if (useDistinctCheckbox) useDistinctCheckbox.checked = false;
            console.log('File loaded successfully:', file.name);
            if (ruleSection) {
                ruleSection.classList.remove('opacity-30', 'pointer-events-none');
                ruleSection.classList.add('animate-fade-in');
            }
        } catch (err) {
            alert('Error parsing Excel: ' + err.message);
        }
    }

    btnRemoveFile.addEventListener('click', () => {
        state.reset();
        window.location.reload();
    });


    // --- 2. Rule Building Logic ---

    const setScope = (scope) => {
        state.scope = scope;
        const compareOptions = document.getElementById('compare-options-container');
        const aggOptions = document.getElementById('agg-options-container');

        if (scope === 'row') {
            if (scopeRowBtn) scopeRowBtn.className = "flex-1 py-2 text-[11px] font-extrabold rounded-xl bg-white text-slate-900 shadow-sm transition-all uppercase tracking-wide";
            if (scopeAggBtn) scopeAggBtn.className = "flex-1 py-2 text-[11px] font-extrabold rounded-xl text-slate-400 hover:text-slate-600 transition-all uppercase tracking-wide";
            if (compareOptions) compareOptions.classList.remove('hidden');
            if (aggOptions) aggOptions.classList.add('hidden');
        } else {
            if (scopeAggBtn) scopeAggBtn.className = "flex-1 py-2 text-[11px] font-extrabold rounded-xl bg-white text-slate-900 shadow-sm transition-all uppercase tracking-wide";
            if (scopeRowBtn) scopeRowBtn.className = "flex-1 py-2 text-[11px] font-extrabold rounded-xl text-slate-400 hover:text-slate-600 transition-all uppercase tracking-wide";
            if (compareOptions) compareOptions.classList.remove('hidden');
            if (aggOptions) aggOptions.classList.remove('hidden');

            const aggRefWrapper = document.getElementById('agg-ref-type-wrapper');
            if (aggRefWrapper) {
                aggRefWrapper.classList.toggle('hidden', !useColCompareCheckbox.checked);
            }
        }
        if (ruleColumnSelect) ruleColumnSelect.dispatchEvent(new Event('change'));
    };

    if (scopeRowBtn) scopeRowBtn.addEventListener('click', () => setScope('row'));
    if (scopeAggBtn) scopeAggBtn.addEventListener('click', () => setScope('agg'));

    if (ruleColumnSelect) {
        ruleColumnSelect.addEventListener('change', (e) => {
            const colName = e.target.value;
            if (!colName) {
                ruleOperatorSelect.innerHTML = '<option value="">...</option>';
                ruleOperatorSelect.disabled = true;
                return;
            }

            const colType = state.columns.find(c => c.name === colName)?.type || 'string';
            const ops = DQMEngine.getOperators(colType, state.scope === 'agg');
            ruleOperatorSelect.innerHTML = ops.map(op => `<option value="${op.id}">${op.label}</option>`).join('');
            ruleOperatorSelect.disabled = false;
        });
    }

    if (useColCompareCheckbox) {
        useColCompareCheckbox.addEventListener('change', (e) => {
            const wrapper = document.getElementById('col-compare-wrapper');
            const aggRefWrapper = document.getElementById('agg-ref-type-wrapper');

            if (e.target.checked) {
                if (wrapper) wrapper.classList.remove('hidden');
                if (ruleValueInput) ruleValueInput.classList.add('hidden');
                const cols = state.columns.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
                if (ruleCompareColSelect) ruleCompareColSelect.innerHTML = '<option value="">Select Reference Column...</option>' + cols;

                if (state.scope === 'agg') {
                    if (aggRefWrapper) aggRefWrapper.classList.remove('hidden');
                } else {
                    if (aggRefWrapper) aggRefWrapper.classList.add('hidden');
                }
            } else {
                if (wrapper) wrapper.classList.add('hidden');
                if (ruleValueInput) ruleValueInput.classList.remove('hidden');
            }
        });
    }


    let editingRuleId = null;

    const handleEditRule = (id) => {
        const rule = state.rules.find(r => r.id === id);
        if (!rule) return;

        editingRuleId = id;

        // Populate Form
        if (ruleColumnSelect) {
            ruleColumnSelect.value = rule.column;
            ruleColumnSelect.dispatchEvent(new Event('change'));
        }

        if (ruleOperatorSelect) ruleOperatorSelect.value = rule.operator;

        if (rule.isColumnComparison) {
            if (useColCompareCheckbox) {
                useColCompareCheckbox.checked = true;
                useColCompareCheckbox.dispatchEvent(new Event('change'));
            }
            if (ruleCompareColSelect) ruleCompareColSelect.value = rule.value;
            if (rule.isAgg && ruleCompareAggSelect) {
                ruleCompareAggSelect.value = rule.refAggType;
            }
        } else {
            if (useColCompareCheckbox) {
                useColCompareCheckbox.checked = false;
                useColCompareCheckbox.dispatchEvent(new Event('change'));
            }
            if (ruleValueInput) ruleValueInput.value = rule.value;
        }

        if (rule.isAgg) {
            setScope('agg');
            if (ruleGroupBySelect) ruleGroupBySelect.value = rule.groupBy || '';
            if (useDistinctCheckbox) useDistinctCheckbox.checked = !!rule.distinctPerGroup;
        } else {
            setScope('row');
        }

        // Change UI state
        if (btnAddRule) btnAddRule.innerHTML = '<i data-lucide="save" class="w-4 h-4 mr-2"></i> Update Rule';
        if (btnCancelEdit) btnCancelEdit.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();

        // Scroll to form
        const builder = document.getElementById('rule-builder-card');
        if (builder) {
            builder.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const resetRuleForm = () => {
        editingRuleId = null;
        if (ruleValueInput) ruleValueInput.value = '';
        if (ruleCompareColSelect) ruleCompareColSelect.value = '';
        if (useColCompareCheckbox) {
            useColCompareCheckbox.checked = false;
            const wrap = document.getElementById('col-compare-wrapper');
            if (wrap) wrap.classList.add('hidden');
            if (ruleValueInput) ruleValueInput.classList.remove('hidden');
        }

        if (ruleGroupBySelect) ruleGroupBySelect.value = '';
        if (useDistinctCheckbox) useDistinctCheckbox.checked = false;

        if (btnAddRule) btnAddRule.innerHTML = '<i data-lucide="plus" class="w-4 h-4 mr-2"></i> Append Rule';
        if (btnCancelEdit) btnCancelEdit.classList.add('hidden');
        if (window.lucide) lucide.createIcons();
    };


    if (btnCancelEdit) btnCancelEdit.addEventListener('click', resetRuleForm);

    if (btnAddRule) {
        btnAddRule.addEventListener('click', () => {
            const col = ruleColumnSelect.value;
            const op = ruleOperatorSelect.value;
            const isColCompare = useColCompareCheckbox.checked;
            const value = isColCompare ? ruleCompareColSelect.value : ruleValueInput.value;
            const refAggType = isColCompare && state.scope === 'agg' ? ruleCompareAggSelect.value : null;

            const errorMsg = document.getElementById('rule-error-msg');
            if (errorMsg) errorMsg.classList.add('hidden');

            if (!col || !op || (value === '' || value === null)) {
                if (errorMsg) {
                    errorMsg.textContent = "Please fill all fields.";
                    errorMsg.classList.remove('hidden');
                }
                return;
            }

            if (state.scope === 'agg' && isColCompare && !refAggType) {
                if (errorMsg) {
                    errorMsg.textContent = "Please select reference aggregate type.";
                    errorMsg.classList.remove('hidden');
                }
                return;
            }

            const ruleData = {
                column: col,
                operator: op,
                type: state.columns.find(c => c.name === col)?.type,
                value: value,
                isColumnComparison: isColCompare,
                isAgg: state.scope === 'agg',
                refAggType: refAggType,
                groupBy: state.scope === 'agg' ? ruleGroupBySelect.value : null,
                distinctPerGroup: state.scope === 'agg' ? useDistinctCheckbox.checked : false
            };

            if (editingRuleId) {
                state.updateRule(editingRuleId, ruleData);
            } else {
                state.addRule({ id: Date.now(), ...ruleData });
            }

            renderRuleList(state.rules,
                (id) => { state.removeRule(id); renderRuleList(state.rules, (rid) => state.removeRule(rid), handleEditRule); },
                handleEditRule
            );

            resetRuleForm();
        });
    }


    // --- 3. Execution ---

    if (btnRun) {
        btnRun.addEventListener('click', () => {
            if (state.rules.length === 0) {
                alert('Please add at least one rule.');
                return;
            }

            const { results, summary, globalErrors } = DQMEngine.execute(state.rawData, state.rules);
            state.setResults(results, summary, globalErrors);

            renderDashboard(summary, globalErrors, state.rawData.slice(0, 100), results.slice(0, 100), state.columns);
            btnExport.classList.remove('hidden');
            if (collectionsActions) collectionsActions.classList.add('hidden');
        });
    }

    function execCollectionsFlow(rules = null) {
        console.log('execCollectionsFlow triggered. Rules:', rules ? 'Custom' : 'Default');
        try {
            // Validate headers only for default flow (Step 3.1)
            if (!rules) {
                const columnNames = state.columns.map(c => c.name);
                const validation = CollectionsEngine.validateHeaders(columnNames);
                if (!validation.valid) {
                    console.error('Header validation failed:', validation.reason);
                    hideModal(); // Hide the configuration modal
                    showHeaderErrorModal(validation.reason, validation.referenceUrl);
                    return;
                }
            }

            const results = CollectionsEngine.runQC(state.rawData, rules);
            // Append data profile to state for export
            state.dataProfile = results.dataProfile;
            state.setResults(results.results, results.summary, results.globalErrors || []);
            renderDashboard(results.summary, results.globalErrors || [], state.rawData.slice(0, 100), results.results.slice(0, 100), state.columns);
            if (btnExport) btnExport.classList.add('hidden');
            if (collectionsActions) collectionsActions.classList.remove('hidden');
            hideModal();
        } catch (err) {
            console.error('Collections Error:', err);
            alert('Error running Collections QC: ' + err.message);
        }
    }

    if (modalBtnDefault) {
        modalBtnDefault.addEventListener('click', () => {
            // Run with default rules (no header validation needed)
            execCollectionsFlow(null);
        });
    }

    if (modalBtnUpload) {
        modalBtnUpload.addEventListener('click', () => {
            if (qcRulesInput) qcRulesInput.click();
        });
    }

    if (qcRulesInput) {
        qcRulesInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const results = await ExcelParser.parse(file);
                if (results.qcData) {
                    const rules = CollectionsEngine.parseRules(results.qcData);
                    execCollectionsFlow(rules);
                } else {
                    alert('Error: No "QC" sheet found in file.');
                }
            } catch (err) {
                alert('Error parsing QC: ' + err.message);
            } finally {
                e.target.value = '';
            }
        });
    }

    if (btnCollections) {
        btnCollections.addEventListener('click', () => {
            console.log('--- Collections DQM Button Clicked ---');
            if (!state.rawData || state.rawData.length === 0) {
                alert('Please upload a file first.');
                return;
            }
            showModal();
        });
    }

    // --- 4. Export & Specialized Collections Downloads ---

    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (!state.rawData || state.rawData.length === 0) return;

            const summary = state.summaryStats || {
                total: state.rawData.length,
                passed: 0,
                failed: 0,
                passPercentage: "0.0",
                score: "0.0"
            };

            ExcelParser.exportReport(
                state.rawData,
                state.results,
                state.rules,
                summary,
                state.globalErrors,
                `DQM_Report_${state.filename}`,
                state.healthScan
            );
        });
    }

    if (btnColSummary) {
        btnColSummary.addEventListener('click', () => {
            const summaryData = [
                { Metric: 'Total Rows', Value: state.summaryStats.total },
                { Metric: 'Total Duplicate Rows', Value: state.dataProfile && state.dataProfile.metadata ? state.dataProfile.metadata.duplicateRows : '0' },
                { Metric: 'Passed Checks', Value: state.summaryStats.passed },
                { Metric: 'Failed Checks', Value: state.summaryStats.failed },
                { Metric: 'Compliance Rate', Value: state.summaryStats.passPercentage + '%' }
            ];

            if (state.dataProfile) {
                // Add Unique Counts section
                summaryData.push({ Metric: '', Value: '' }); // Spacer
                summaryData.push({ Metric: '--- Unique Counts per Column ---', Value: '' });
                Object.entries(state.dataProfile).forEach(([col, stats]) => {
                    summaryData.push({ Metric: `Unique Count (${col})`, Value: stats.uniqueCount });
                });
            }

            ExcelParser.exportCSV(summaryData, `Collections_QC_Summary_${state.filename}.csv`);
        });
    }

    if (btnColDetailed) {
        btnColDetailed.addEventListener('click', () => {
            ExcelParser.exportCollectionsDetailed(state.rawData, state.results, `Collections_Detailed_QC_${state.filename}`, state.dataProfile);
        });
    }

    if (btnColFailed) {
        btnColFailed.addEventListener('click', () => {
            const failedRowIndices = new Set(state.results.map(r => r.row));
            const failedRows = state.rawData.filter((_, idx) => failedRowIndices.has(idx + 1));
            ExcelParser.exportCSV(failedRows, `Collections_Failed_Rows_${state.filename}.csv`);
        });
    }

    if (btnQuickScan) btnQuickScan.addEventListener('click', () => {
        if (btnExport) btnExport.classList.remove('hidden');

        const findings = DQMEngine.runQuickScan(state.rawData);
        state.healthScan = findings;

        const scanAlerts = [];

        // 1. Duplicates
        if (findings.duplicates.length > 0) {
            scanAlerts.push(`ALGO: Found ${findings.duplicates.length} duplicate records. Row IDs: ${findings.duplicates.join(', ')}`);
        }

        // 2. Analyst Profiling Insights
        Object.entries(findings.columnMetrics).forEach(([col, m]) => {
            if (m.isPrimaryKey) {
                scanAlerts.push(`INSIGHT: Column "${col}" is a perfect Primary Key candidate (100% Unique, No Nulls).`);
            }
            if (Number(m.nullRate) > 0.3) {
                scanAlerts.push(`WARNING: Column "${col}" has a high null/missing rate (${(m.nullRate * 100).toFixed(1)}%).`);
            }
        });

        if (scanAlerts.length === 0) {
            scanAlerts.push('SUCCESS: Dataset health looks good! No obvious duplicates or large gaps.');
        }

        const existingErrors = (state.globalErrors || []).filter(err =>
            !err.startsWith('ALGO:') && !err.startsWith('INSIGHT:') &&
            !err.startsWith('WARNING:') && !err.startsWith('SUCCESS:')
        );
        const mergedErrors = [...existingErrors, ...scanAlerts];
        state.globalErrors = mergedErrors;

        const mockSummary = state.summaryStats || {
            total: state.rawData.length,
            passed: 0,
            failed: 0,
            passPercentage: "0.0",
            score: "0.0"
        };

        renderDashboard(mockSummary, mergedErrors, state.rawData.slice(0, 50), state.results ? state.results.slice(0, 50) : [], state.columns);
        if (btnExport) btnExport.classList.remove('hidden');

        // Visual feedback
        btnQuickScan.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-blue-400"></i> Scanning...`;
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            btnQuickScan.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-emerald-400"></i> Scan Complete`;
            if (window.lucide) lucide.createIcons();
            setTimeout(() => {
                btnQuickScan.innerHTML = `<i data-lucide="shield-alert" class="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform"></i> Health Check`;
                if (window.lucide) lucide.createIcons();
            }, 2000);
        }, 1000);
    });

});
