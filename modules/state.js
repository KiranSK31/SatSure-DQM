
window.DQMState = {
    rawData: [],      // Array of objects
    columns: [],      // Array of {name, type}
    rules: [],        // Array of rule objects
    results: null,    // Array of result objects
    summaryStats: null,
    globalErrors: [],
    qcData: null,      // Raw Sheet data from "QC" sheet
    collectionsRules: [], // Parsed rules from "QC" sheet
    filename: '',
    scope: 'row',     // 'row' or 'agg'
    healthScan: null, // Stores {duplicates, nulls, stats}

    setRawData(data) {
        console.log('DQMState: Setting raw data, rows:', data.length);
        this.rawData = data;
    },
    setColumns(cols) {
        console.log('DQMState: Setting columns:', cols.map(c => c.name));
        this.columns = cols;
    },
    setQCData(data, rules) {
        console.log('DQMState: Setting QC Data and Rules', rules.length);
        this.qcData = data;
        this.collectionsRules = rules;
    },
    setFilename(name) { this.filename = name; },

    addRule(rule) {
        this.rules.push(rule);
    },

    removeRule(id) {
        this.rules = this.rules.filter(r => r.id !== id);
    },
    updateRule(id, ruleData) {
        const index = this.rules.findIndex(r => r.id === id);
        if (index !== -1) {
            this.rules[index] = { ...this.rules[index], ...ruleData };
        }
    },

    setResults(results, summary, globalErrors) {
        this.results = results;
        this.summaryStats = summary;
        this.globalErrors = globalErrors || [];
    },

    reset() {
        this.rawData = [];
        this.columns = [];
        this.rules = [];
        this.results = null;
        this.summaryStats = null;
        this.globalErrors = [];
        this.qcData = null;
        this.collectionsRules = [];
        this.filename = '';
        this.scope = 'row';
        this.healthScan = null;
    }
};

