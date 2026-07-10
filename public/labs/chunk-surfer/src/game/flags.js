// Story flags. Dialogue nodes gate on these (`if`) and set them (`set`).
//
// Condition grammar, kept small enough to write in prose data files:
//   'sawUsher'              flag is truthy
//   '!sawUsher'             flag is falsy
//   'keys>=3'               numeric compare (> >= < <= == !=)
//   'sawUsher && keys>=3'   conjunction
//   'a || b'                disjunction (binds looser than &&)

import { getSave, saveCommit } from './save.js';

export function flagGet(name) { return getSave().flags[name]; }
export function flagSet(name, value = true) {
  const flags = getSave().flags;
  flags[name] = value;
  saveCommit({ flags });
}
export function flagClear(name) { flagSet(name, false); }
export function flagBump(name, by = 1) { flagSet(name, (Number(flagGet(name)) || 0) + by); }

const CMP = /^([A-Za-z_][\w.]*)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/;

function atom(expr) {
  const s = expr.trim();
  if (!s) return true;
  if (s.startsWith('!')) return !atom(s.slice(1));
  const m = CMP.exec(s);
  if (m) {
    const left = Number(flagGet(m[1])) || 0;
    const right = Number(m[3]);
    switch (m[2]) {
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return left > right;
      case '<': return left < right;
    }
  }
  return !!flagGet(s);
}

export function flagTest(expr) {
  if (expr == null || expr === '') return true;
  if (typeof expr === 'function') return !!expr(flagGet);
  return String(expr).split('||').some((clause) =>
    clause.split('&&').every((a) => atom(a)));
}

// Apply a node's effects: set:['a','b=2'], clear:['c']
export function flagApply(list = [], clear = []) {
  for (const entry of list) {
    const [name, value] = String(entry).split('=');
    flagSet(name.trim(), value === undefined ? true : (isNaN(+value) ? value.trim() : +value));
  }
  for (const name of clear) flagClear(String(name).trim());
}
