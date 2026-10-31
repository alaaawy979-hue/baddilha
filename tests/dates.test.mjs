import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/dates.js';

test('addInterval years/months with month-end clamping', () => {
  assert.equal(D.addInterval('2026-10-31', { n: 2, unit: 'y' }), '2028-10-31');
  assert.equal(D.addInterval('2024-02-29', { n: 1, unit: 'y' }), '2025-02-28');
  assert.equal(D.addInterval('2024-02-29', { n: 4, unit: 'y' }), '2028-02-29');
  assert.equal(D.addInterval('2026-01-31', { n: 1, unit: 'm' }), '2026-02-28');
  assert.equal(D.addInterval('2026-11-15', { n: 3, unit: 'm' }), '2027-02-15');
  assert.equal(D.addInterval('2026-12-25', { n: 2, unit: 'w' }), '2027-01-08');
  assert.equal(D.addInterval('2026-12-31', { n: 1, unit: 'd' }), '2027-01-01');
});

test('diffDays across DST/leap years', () => {
  assert.equal(D.diffDays('2026-10-31', '2028-10-31'), 731);
  assert.equal(D.diffDays('2026-03-01', '2026-02-28'), -1);
});

test('breakdown months and days', () => {
  assert.deepEqual(D.breakdown('2026-10-31', '2028-10-31'), { sign: 1, y: 2, m: 0, months: 24, d: 0, total: 731 });
  const b = D.breakdown('2026-10-31', '2027-02-05');
  assert.equal(b.months, 3); assert.equal(b.d, 5); assert.equal(b.total, 97);
  const o = D.breakdown('2026-10-31', '2026-10-20');
  assert.equal(o.sign, -1); assert.equal(o.d, 11); assert.equal(o.total, -11);
  const e = D.breakdown('2026-01-31', '2026-03-01');
  assert.equal(e.months, 1); assert.equal(e.d, 1);
});

test('arabic wording', () => {
  assert.equal(D.count(1, 'y'), 'سنة');
  assert.equal(D.count(2, 'y'), 'سنتين');
  assert.equal(D.count(3, 'y'), '3 سنوات');
  assert.equal(D.count(11, 'd'), '11 يومًا');
  assert.equal(D.relText('2027-02-05', '2026-10-31'), 'بعد 3 أشهر و5 أيام');
  assert.equal(D.relText('2026-11-01', '2026-10-31'), 'غدًا');
  assert.equal(D.relText('2026-10-29', '2026-10-31'), 'متأخر يومين');
  assert.equal(D.everyText({ n: 24, unit: 'm' }), 'كل سنتين');
  assert.equal(D.everyText({ n: 6, unit: 'm' }), 'كل 6 أشهر');
});

test('urgency & progress', () => {
  assert.equal(D.urgency(-1), 'overdue');
  assert.equal(D.urgency(0), 'today');
  assert.equal(D.urgency(5), 'soon');
  assert.equal(D.urgency(20), 'near');
  assert.equal(D.urgency(90), 'ok');
  assert.equal(D.progress('2026-01-01', '2027-01-01', '2026-07-02'), 182 / 365);
});

test('hijri formatting works', () => {
  const h = D.hijri('2026-10-31');
  assert.match(h, /14\d\d/);
});
