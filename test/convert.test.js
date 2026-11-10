import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConvert } from '../src/convert.js';
import { money, smartMoney, boldSans, uzDate, esc } from '../src/format.js';

test('konvertatsiya matnini tushunadi', () => {
  assert.deepEqual(parseConvert('100 usd'), { amount: 100, from: 'USD' });
  assert.deepEqual(parseConvert('100$'), { amount: 100, from: 'USD' });
  assert.deepEqual(parseConvert('$250'), { amount: 250, from: 'USD' });
  assert.deepEqual(parseConvert('50 EUR'), { amount: 50, from: 'EUR' });
  assert.deepEqual(parseConvert('1000 rubl'), { amount: 1000, from: 'RUB' });
  assert.deepEqual(parseConvert("1 000 000 so'm"), { amount: 1000000, from: 'UZS' });
  assert.deepEqual(parseConvert('500000 sum'), { amount: 500000, from: 'UZS' });
  assert.deepEqual(parseConvert('12,5 dollar'), { amount: 12.5, from: 'USD' });
  assert.deepEqual(parseConvert('100'), { amount: 100, from: 'USD' });
  assert.deepEqual(parseConvert('12dolar'), { amount: 12, from: 'USD' });
  assert.deepEqual(parseConvert('12 dolar'), { amount: 12, from: 'USD' });
  assert.deepEqual(parseConvert('50 долар'), { amount: 50, from: 'USD' });
  assert.deepEqual(parseConvert('200 Dollar.'), { amount: 200, from: 'USD' });
  assert.deepEqual(parseConvert('100000 so’m'), { amount: 100000, from: 'UZS' });
  assert.deepEqual(parseConvert('100000 soʻm'), { amount: 100000, from: 'UZS' });
  assert.deepEqual(parseConvert('500 rubel'), { amount: 500, from: 'RUB' });
  assert.deepEqual(parseConvert('30 evro'), { amount: 30, from: 'EUR' });
  assert.equal(parseConvert('salom'), null);
  assert.equal(parseConvert('2 marta'), null);
  assert.equal(parseConvert('0 usd'), null);
});

test('raqam va sana formatlash', () => {
  assert.equal(money(1199410.5), '1 199 410.50');
  assert.equal(money(-12.3), '-12.30');
  assert.equal(smartMoney(1199410.5), '1 199 411');
  assert.equal(smartMoney(83.37), '83.37');
  assert.equal(smartMoney(100), '100');
  assert.equal(uzDate('10.11.2026'), '10-noyabr, 2026');
  assert.equal(uzDate('10.11.2026', true), '10-noyabr, seshanba');
  assert.equal(boldSans('Kurs 1'), '𝗞𝘂𝗿𝘀 𝟭');
  assert.equal(esc('<b>&'), '&lt;b&gt;&amp;');
});
