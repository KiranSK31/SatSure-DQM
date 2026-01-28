
import { DQMEngine } from '../modules/dqm-engine.js';
import assert from 'assert';

console.log('--- STARTING ADVANCED DQM ENGINE TESTS ---');

const mockData = [
    { name: 'A', value: 10, target: 5 },
    { name: 'B', value: 20, target: 25 },
    { name: 'C', value: 30, target: 15 },
    { name: 'D', value: 40, target: 45 }
];

// Test 1: Row Level Column Comparison
const rowRules = [
    { id: 1, column: 'value', operator: 'gt', value: 'target', isColumnComparison: true, type: 'number', isAgg: false }
];
const res1 = DQMEngine.execute(mockData, rowRules);
console.log('Test 1: Row Column Comparison');
console.assert(res1.summary.passed === 2, `Expected 2 passed, got ${res1.summary.passed}`);
console.assert(res1.results[0].passed === true, 'Row 0 should pass (10 > 5)');
console.assert(res1.results[1].passed === false, 'Row 1 should fail (20 < 25)');


// Test 2: Aggregate Rules (Sum)
const aggRules = [
    { id: 2, column: 'value', operator: 'sum_gt', value: 90, isColumnComparison: false, type: 'number', isAgg: true }
];
const res2 = DQMEngine.execute(mockData, aggRules);
console.log('Test 2: Aggregate Sum');
console.assert(res2.globalErrors.length === 0, 'Should pass: sum(10,20,30,40) = 100 > 90');

const aggRulesFail = [
    { id: 3, column: 'value', operator: 'sum_gt', value: 110, isColumnComparison: false, type: 'number', isAgg: true }
];
const res3 = DQMEngine.execute(mockData, aggRulesFail);
console.log('Test 3: Aggregate Sum Failure');
console.assert(res3.globalErrors.length === 1, 'Should fail: 100 is not > 110');
console.log('Global Error:', res3.globalErrors[0]);



// Test 4: Aggregate Column Comparison
const aggCompRules = [
    { id: 4, column: 'value', operator: 'sum_gt', value: 'target', isColumnComparison: true, type: 'number', isAgg: true, refAggType: 'sum' }
];
// sum(value) = 100, sum(target) = 90 -> passed
const res4 = DQMEngine.execute(mockData, aggCompRules);
console.log('Test 4: Aggregate Column Comparison');
console.assert(res4.globalErrors.length === 0, 'Should pass: Sum(value)=100 > Sum(target)=90');

// Test 6: New Aggregate Operators (GTE, LTE, EQ, NEQ)
const aggNewOps = [
    { id: 6, column: 'value', operator: 'sum_gte', value: 100, isAgg: true },
    { id: 7, column: 'value', operator: 'sum_lte', value: 100, isAgg: true },
    { id: 8, column: 'value', operator: 'sum_eq', value: 100, isAgg: true },
    { id: 9, column: 'value', operator: 'sum_neq', value: 99, isAgg: true }
];
const res6 = DQMEngine.execute(mockData, aggNewOps);
console.log('Test 6: Advanced Aggregate Operators');
console.assert(res6.globalErrors.length === 0, 'All new operator tests should pass for sum=100');

// Test 7: Multi-Rule Stress (Many rules)
const manyRules = Array.from({ length: 50 }, (_, i) => ({
    id: i + 100,
    column: 'value',
    operator: 'gt',
    value: 0,
    type: 'number',
    isAgg: false
}));
const res7 = DQMEngine.execute(mockData, manyRules);
console.log('Test 7: Multi-Rule Logic');
console.assert(res7.summary.total === 4, 'Should process all rows');
console.assert(res7.results[0].reasons.length === 0, 'Should have no failures');

console.log('--- ALL ADVANCED TESTS COMPLETED ---');

