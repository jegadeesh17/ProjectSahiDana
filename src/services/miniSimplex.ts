// A tiny dense two-phase simplex for the prototype's mock solver (<= 40 variables, <= 60 rows).
// PROTOTYPE STAND-IN: the live adapter replaces it with javascript-lp-solver in M1.
// Maximise c.x subject to rows (<= or >=) with x >= 0. Bland's rule keeps it from cycling.

export interface LpRow {
  coef: number[];
  sense: '<=' | '>=';
  rhs: number;
}

export type LpResult = { status: 'optimal'; x: number[]; value: number } | { status: 'infeasible' | 'unbounded' };

const EPS = 1e-9;
const MAX_ITERATIONS = 20000;

export function maximize(c: number[], rows: LpRow[]): LpResult {
  const n = c.length;
  const m = rows.length;

  // Make every right-hand side non-negative.
  const norm: LpRow[] = rows.map((r) =>
    r.rhs < 0 ? { coef: r.coef.map((v) => -v), sense: r.sense === '<=' ? '>=' : '<=', rhs: -r.rhs } : r,
  );
  const nArt = norm.filter((r) => r.sense === '>=').length;
  const cols = n + m + nArt; // x | one slack or surplus per row | artificials
  const art0 = n + m;
  const T: number[][] = [];
  const basis: number[] = [];
  let art = 0;
  norm.forEach((r, i) => {
    const row = new Array<number>(cols + 1).fill(0);
    r.coef.forEach((v, j) => {
      row[j] = v;
    });
    row[n + i] = r.sense === '<=' ? 1 : -1;
    row[cols] = r.rhs;
    if (r.sense === '>=') {
      row[art0 + art] = 1;
      basis.push(art0 + art);
      art += 1;
    } else {
      basis.push(n + i);
    }
    T.push(row);
  });

  const pivot = (r: number, e: number, obj: number[]) => {
    const pr = T[r];
    const p = pr[e];
    for (let j = 0; j <= cols; j++) pr[j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = T[i][e];
      if (f === 0) continue;
      const row = T[i];
      for (let j = 0; j <= cols; j++) row[j] -= f * pr[j];
    }
    const fo = obj[e];
    if (fo !== 0) for (let j = 0; j <= cols; j++) obj[j] -= fo * pr[j];
    basis[r] = e;
  };

  const run = (cost: number[], allowed: (j: number) => boolean): 'optimal' | 'unbounded' => {
    const obj = new Array<number>(cols + 1).fill(0);
    for (let j = 0; j < cols; j++) obj[j] = cost[j];
    for (let i = 0; i < m; i++) {
      const cb = cost[basis[i]];
      if (cb === 0) continue;
      for (let j = 0; j <= cols; j++) obj[j] -= cb * T[i][j];
    }
    for (let it = 0; it < MAX_ITERATIONS; it++) {
      let e = -1;
      for (let j = 0; j < cols; j++) {
        if (allowed(j) && obj[j] > EPS) {
          e = j;
          break;
        }
      }
      if (e < 0) return 'optimal';
      let r = -1;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][e];
        if (a > EPS) {
          const ratio = T[i][cols] / a;
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && r >= 0 && basis[i] < basis[r])) {
            best = ratio;
            r = i;
          }
        }
      }
      if (r < 0) return 'unbounded';
      pivot(r, e, obj);
    }
    return 'optimal';
  };

  if (nArt > 0) {
    const cost1 = new Array<number>(cols).fill(0);
    for (let j = art0; j < cols; j++) cost1[j] = -1;
    run(cost1, () => true);
    let residual = 0;
    for (let i = 0; i < m; i++) if (basis[i] >= art0) residual += T[i][cols];
    if (residual > 1e-7) return { status: 'infeasible' };
    // Move any artificial that is still basic (at zero) out of the basis.
    const dummy = new Array<number>(cols + 1).fill(0);
    for (let i = 0; i < m; i++) {
      if (basis[i] < art0) continue;
      for (let j = 0; j < art0; j++) {
        if (Math.abs(T[i][j]) > 1e-7) {
          pivot(i, j, dummy);
          break;
        }
      }
    }
  }

  const cost2 = new Array<number>(cols).fill(0);
  c.forEach((v, j) => {
    cost2[j] = v;
  });
  const status = run(cost2, (j) => j < art0);
  if (status === 'unbounded') return { status: 'unbounded' };

  const x = new Array<number>(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = Math.max(0, T[i][cols]);
  let value = 0;
  for (let j = 0; j < n; j++) value += c[j] * x[j];
  return { status: 'optimal', x, value };
}
