import assert from 'node:assert/strict';
import test from 'node:test';
import { expenseAccountKey, expensePaymentPaise } from '../src/lib/expense-money-flow.ts';

const banks = new Map([[1, 'BUSINESS'], [2, 'INVESTOR']]);
const cash = new Set([3]);
const classify = (source, bank = null, cashId = null) => expenseAccountKey({
  payment_source: source, bank_account_id: bank, cash_account_id: cashId,
}, banks, cash);

test('business bank and cash expenses reduce their selected accounts', () => {
  assert.equal(classify('BUSINESS_BANK', 1), 'BANK:1');
  assert.equal(classify('BUSINESS_CASH', null, 3), 'CASH:3');
});
test('investor bank expense remains separate from business cash', () => {
  assert.equal(classify('INVESTOR_BANK', 2), 'BANK:2');
  assert.equal(classify('BUSINESS_BANK', 2), 'UNALLOCATED');
  assert.equal(classify('INVESTOR_BANK', 1), 'UNALLOCATED');
});
test('personal and investor cash payments have an external funding bucket', () => {
  assert.equal(classify('OWNER_PERSONAL'), 'EXTERNAL');
  assert.equal(classify('INVESTOR_CASH'), 'EXTERNAL');
});
test('missing, unknown and ambiguous account allocations require reconciliation', () => {
  for (const [source, bank, cashId] of [
    ['BUSINESS_BANK', null, null], ['BUSINESS_BANK', 99, null],
    ['BUSINESS_CASH', null, 99], ['BUSINESS_BANK', 1, 3],
    ['BUSINESS_CASH', 1, 3], ['OWNER_PERSONAL', 1, null],
    ['INVESTOR_CASH', null, 3], ['UNKNOWN', null, null],
  ]) assert.equal(classify(source, bank, cashId), 'UNALLOCATED');
});
test('paise stay exact for decimals and large database amounts', () => {
  assert.equal(expensePaymentPaise('0.10') + expensePaymentPaise('0.20'), 30n);
  assert.equal(expensePaymentPaise('123.4'), 12340n);
  assert.equal(expensePaymentPaise('9999999999999999.99'), 999999999999999999n);
  for (const value of ['-1', 'NaN', '1.001', '1e3', '']) {
    assert.throws(() => expensePaymentPaise(value));
  }
});
test('mixed payment fixture debits only business-funded expenses from Group funds', () => {
  const payments = [
    ['BUSINESS_BANK', 1, null, '14000.00'],
    ['BUSINESS_CASH', null, 3, '125.25'],
    ['INVESTOR_BANK', 2, null, '500.00'],
    ['OWNER_PERSONAL', null, null, '1000.00'],
    ['INVESTOR_CASH', null, null, '800.00'],
    ['BUSINESS_BANK', 99, null, '10.00'],
  ];
  const totals = new Map();
  for (const [source, bank, cashId, amount] of payments) {
    const key = classify(source, bank, cashId);
    totals.set(key, (totals.get(key) ?? 0n) - expensePaymentPaise(amount));
  }
  assert.equal(totals.get('BANK:1') + totals.get('CASH:3'), -1412525n);
  assert.equal(totals.get('BANK:2'), -50000n);
  assert.equal(totals.get('EXTERNAL'), -180000n);
  assert.equal(totals.get('UNALLOCATED'), -1000n);
});
