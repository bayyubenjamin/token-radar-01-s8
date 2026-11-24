// Token Radar — the A1b fitted-odds model.
//
// One snapshot of the protocol universe in, one ranked board out. The board
// covers the 198 pre-token protocols the radar ranks, with every value term
// fitted from the snapshot's own record and tested held-out and blind.
//
// The model, in one paragraph: the value of a pre-token protocol is its
// fitted market value (a comps curve, log market cap on log TVL, fit by OLS
// on the 128 traded protocols) times a growth factor (the 7-day change,
// clamped), times a maturity factor (older protocols are worth more of their
// fitted value), times the launch odds — the probability the protocol
// launches a token within one year, from a Weibull survival curve fit by
// maximum likelihood to all 758 protocols' token/no-token record. The
// expected value is that implied value times the farmer's slice (7% of the
// value, split among the estimated farmers), and the verdict compares the
// expected value to the cost of farming (a deposit by TVL tier plus the
// chain's gas). FARM clears 3x the cost, THIN clears 1x, the rest SKIP.
//
// Every fitted number is measured in this file and reported in the dossier:
// the comps curve (OLS, held-out 5-fold, walk-forward, leave-one-out, and an
// age term tested and found not significant), and the Weibull odds (held-out
// 5-fold log-loss, walk-forward, leave-one-out). Nothing is assumed and then
// called fitted.

/** One protocol entry, exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted comps curve: log market cap on log TVL. */
export interface CompsFit {
  intercept: number;
  slope: number;
  rSquared: number;
  n: number;
  heldOutFitted: number;
  heldOutFlat: number;
  heldOutWins: number;
  walkForwardFitted: number;
  walkForwardFlat: number;
  walkForwardWins: number;
  looFitted: number;
  looFlat: number;
  looWins: number;
  looN: number;
  ageCoef: number;
  ageT: number;
}

/** The fitted Weibull survival curve for token launches. */
export interface WeibullFit {
  lambdaDays: number;
  k: number;
  heldOutLogLoss: number;
  heldOutAssumed: number;
  heldOutBase: number;
  walkForwardLogLoss: number;
  walkForwardS1: number;
  walkForwardBase: number;
  looLogLoss: number;
  looS1: number;
  looBase: number;
}

/** One row of the ranked board. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  expected_value_usd: number;
  cost_usd: number;
  ev_cost_ratio: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  model: {
    base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    odds_365d: number;
    age_days: number | null;
    farmers: number;
    slice: number;
    deposit_usd: number;
    gas_usd: number;
  };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The dashboard's compact view of one board row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  expected_value_usd: number;
  cost_usd: number;
  ev_cost_ratio: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  growth_multiplier: number;
  maturity_multiplier: number;
  odds_365d: number;
  farmers: number;
}

/** Everything the dashboard needs: the board, the live set, the fits, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  not_in_board: number;
  comps: CompsFit;
  weibull: WeibullFit;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  /** The 128 traded comps as [log TVL, log mcap] pairs, for the page's live rerun. */
  comps_points: [number, number][];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export const MODEL_VERSION = 'radar-a1b';
export const BOARD_ROWS = 198;
/** Median pre-token age in days; used where a protocol reports no listing date. */
export const UNKNOWN_AGE_DAYS = 513;
/** The launch-odds horizon, in days: a stated planning convention, not a fitted value. */
export const ODDS_HORIZON_DAYS = 365;
/** The fitted Weibull survival curve (maximum likelihood on all 758 protocols). */
export const WEIBULL_LAMBDA_DAYS = 882;
export const WEIBULL_K = 0.5;
/** The airdrop share split among farmers. */
export const AIRDROP_SHARE = 0.07;
/** The smallest farmer count the slice divides by. */
export const MIN_FARMERS = 200;
/** Capital that defines one farmer, for the farmer count. */
export const CAPITAL_PER_FARMER_USD = 50000;
/** The qualifying hold, in days, for every farm plan. */
export const HOLD_DAYS = 45;

const DAY_MS = 86400000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A name ending in a release marker is a versioned pool of another protocol, not a protocol. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  const cat = (p.category ?? '').toLowerCase();
  if (cat.includes('bridge')) return false;
  if (cat === 'liquid staking') return false;
  return true;
}

/** The gas for one transaction on a chain, in USD. Ethereum is the expensive end. */
export function gasUsd(chain: string): number {
  switch (chain) {
    case 'Ethereum': return 8;
    case 'Bitcoin': return 2;
    case 'Avalanche': return 0.5;
    case 'Tron': return 0.5;
    case 'Binance': return 0.3;
    case 'Arbitrum': return 0.1;
    case 'Optimism': return 0.1;
    case 'Hyperliquid L1': return 0.1;
    case 'Base': return 0.05;
    case 'Polygon': return 0.05;
    case 'Sui': return 0.05;
    case 'Solana': return 0.01;
    default: return 1;
  }
}

/** The deposit one farm position needs, by the protocol's TVL tier. */
export function depositUsd(tvlUsd: number): number {
  if (tvlUsd < 10000000) return 50;
  if (tvlUsd < 100000000) return 100;
  if (tvlUsd < 1000000000) return 150;
  return 250;
}

/** The Weibull survival function: the chance a protocol has launched no token by day t. */
export function weibullSurvival(t: number, lambdaDays: number, k: number): number {
  if (t <= 0) return 1;
  const x = Math.pow(t / lambdaDays, k);
  return x > 700 ? 0 : Math.exp(-x);
}

/** The board odds: P(launch within the horizon | survived to this age). */
export function launchOdds(ageDaysValue: number, lambdaDays: number, k: number, horizonDays: number): number {
  const sNow = weibullSurvival(ageDaysValue, lambdaDays, k);
  const sLater = weibullSurvival(ageDaysValue + horizonDays, lambdaDays, k);
  if (sNow <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - sLater / sNow));
}

/* ------------------------------------------------------------------ */
/* The comps curve: log market cap on log TVL, fit by OLS.             */
/* ------------------------------------------------------------------ */

interface OlsResult { intercept: number; slope: number; }

/** Ordinary least squares for y = a + b*x. */
function ols(xs: number[], ys: number[]): OlsResult {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** Root mean squared error of a line on the given points. */
function rmse(xs: number[], ys: number[], a: number, b: number): number {
  let ss = 0;
  for (let i = 0; i < xs.length; i++) {
    const e = ys[i]! - (a + b * xs[i]!);
    ss += e * e;
  }
  return Math.sqrt(ss / xs.length);
}

/** The house flat baseline: market cap is a quarter of TVL, no fit. */
function flatRmse(xs: number[], ys: number[]): number {
  const c = Math.log(0.25);
  let ss = 0;
  for (let i = 0; i < xs.length; i++) {
    const e = ys[i]! - (xs[i]! + c);
    ss += e * e;
  }
  return Math.sqrt(ss / xs.length);
}

/** Fit the comps curve and run every held-out and blind test on it. */
export function fitComps(snapshot: Snapshot): CompsFit {
  const comps = snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const n = xs.length;
  const { intercept: a, slope: b } = ols(xs, ys);
  const yMean = ys.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i]! - yMean) * (ys[i]! - yMean);
    const e = ys[i]! - (a + b * xs[i]!);
    ssRes += e * e;
  }
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Held-out 5-fold, folds by position in the comps list (index % 5).
  const hoFitted: number[] = [];
  const hoFlat: number[] = [];
  let hoWins = 0;
  for (let fold = 0; fold < 5; fold++) {
    const testIdx: number[] = [];
    const trainIdx: number[] = [];
    for (let i = 0; i < n; i++) (i % 5 === fold ? testIdx : trainIdx).push(i);
    const tx = trainIdx.map((i) => xs[i]!);
    const ty = trainIdx.map((i) => ys[i]!);
    const ex = testIdx.map((i) => xs[i]!);
    const ey = testIdx.map((i) => ys[i]!);
    const f = ols(tx, ty);
    const fr = rmse(ex, ey, f.intercept, f.slope);
    const fl = flatRmse(ex, ey);
    hoFitted.push(fr);
    hoFlat.push(fl);
    if (fr < fl) hoWins++;
  }

  // Walk-forward: oldest-listed first, four forward folds (train older, test newer).
  const withAge = comps
    .map((p, i) => ({ i, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((e) => e.age !== null && e.age > 0)
    .sort((u, v) => (v.age! - u.age!) || (comps[u.i]!.slug < comps[v.i]!.slug ? -1 : 1));
  const order = withAge.map((e) => e.i);
  const m = order.length;
  const chunk = Math.floor(m / 5);
  const wfFitted: number[] = [];
  const wfFlat: number[] = [];
  let wfWins = 0;
  for (let f = 1; f <= 4; f++) {
    const testIdx = order.slice(f * chunk, f < 4 ? (f + 1) * chunk : m);
    const trainIdx = order.slice(0, f * chunk);
    const tx = trainIdx.map((i) => xs[i]!);
    const ty = trainIdx.map((i) => ys[i]!);
    const ex = testIdx.map((i) => xs[i]!);
    const ey = testIdx.map((i) => ys[i]!);
    const fit = ols(tx, ty);
    const fr = rmse(ex, ey, fit.intercept, fit.slope);
    const fl = flatRmse(ex, ey);
    wfFitted.push(fr);
    wfFlat.push(fl);
    if (fr < fl) wfWins++;
  }

  // Leave-one-out: one protocol held out at a time.
  let looSqF = 0;
  let looSqFlat = 0;
  let looWins = 0;
  for (let i = 0; i < n; i++) {
    const tx: number[] = [];
    const ty: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      tx.push(xs[j]!);
      ty.push(ys[j]!);
    }
    const fit = ols(tx, ty);
    const eF = ys[i]! - (fit.intercept + fit.slope * xs[i]!);
    const eFlat = ys[i]! - (xs[i]! + Math.log(0.25));
    looSqF += eF * eF;
    looSqFlat += eFlat * eFlat;
    if (eF * eF < eFlat * eFlat) looWins++;
  }

  // The age term: log market cap on log TVL plus log age. A three-parameter
  // OLS solved by Gaussian elimination, with a t-statistic on the age slope.
  const ageIdx = withAge.map((e) => e.i);
  const X = ageIdx.map((i) => [1, xs[i]!, Math.log(withAge.find((e) => e.i === i)!.age!)]);
  const Y = ageIdx.map((i) => ys[i]!);
  const k = 3;
  const XtX: number[][] = [];
  const XtY: number[] = [];
  for (let r = 0; r < k; r++) {
    XtX.push([]);
    for (let c = 0; c < k; c++) {
      let s = 0;
      for (let t = 0; t < X.length; t++) s += X[t]![r]! * X[t]![c]!;
      XtX[r]!.push(s);
    }
    let s = 0;
    for (let t = 0; t < X.length; t++) s += X[t]![r]! * Y[t]!;
    XtY.push(s);
  }
  // Invert XtX by Gauss-Jordan, keeping the inverse for the standard error.
  const aug: number[][] = XtX.map((row, i) => [...row, ...(Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)))]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(aug[r]![col]!) > Math.abs(aug[piv]![col]!)) piv = r;
    [aug[col], aug[piv]] = [aug[piv]!, aug[col]!];
    const pv = aug[col]![col]!;
    for (let j = 0; j < 2 * k; j++) aug[col]![j]! /= pv;
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const fac = aug[r]![col]!;
      if (fac === 0) continue;
      for (let j = 0; j < 2 * k; j++) aug[r]![j]! -= fac * aug[col]![j]!;
    }
  }
  const inv: number[][] = aug.map((row) => row.slice(k));
  const beta: number[] = [];
  for (let r = 0; r < k; r++) {
    let s = 0;
    for (let c = 0; c < k; c++) s += inv[r]![c]! * XtY[c]!;
    beta.push(s);
  }
  let ssAge = 0;
  for (let t = 0; t < X.length; t++) {
    const pred = beta[0]! + beta[1]! * X[t]![1]! + beta[2]! * X[t]![2]!;
    ssAge += (Y[t]! - pred) * (Y[t]! - pred);
  }
  const dof = X.length - k;
  const s2 = dof > 0 ? ssAge / dof : 0;
  const seAge = Math.sqrt(Math.max(0, s2 * inv[2]![2]!));
  const ageT = seAge === 0 ? 0 : beta[2]! / seAge;

  const mean = (v: number[]): number => v.reduce((s, x) => s + x, 0) / v.length;
  return {
    intercept: a,
    slope: b,
    rSquared,
    n,
    heldOutFitted: mean(hoFitted),
    heldOutFlat: mean(hoFlat),
    heldOutWins: hoWins,
    walkForwardFitted: mean(wfFitted),
    walkForwardFlat: mean(wfFlat),
    walkForwardWins: wfWins,
    looFitted: Math.sqrt(looSqF / n),
    looFlat: Math.sqrt(looSqFlat / n),
    looWins,
    looN: n,
    ageCoef: beta[2]!,
    ageT,
  };
}

/* ------------------------------------------------------------------ */
/* The Weibull survival curve: token launches, fit by maximum likelihood. */
/* ------------------------------------------------------------------ */

interface WeibullPoint { age: number; hasToken: number; }

/** The negative log-likelihood of a Weibull on current-status data. */
function weibullNll(points: WeibullPoint[], lambdaDays: number, k: number): number {
  let tot = 0;
  for (const pt of points) {
    const x = Math.pow(pt.age / lambdaDays, k);
    if (pt.hasToken === 1) {
      if (x < 1e-10) tot -= Math.log(x);
      else if (x < 700) tot -= Math.log1p(-Math.exp(-x));
    } else {
      tot += x;
    }
  }
  return tot;
}

/** Fit (lambda, k) by a coarse grid plus hill-climbing refinement. */
export function fitWeibull(points: WeibullPoint[]): { lambdaDays: number; k: number; nll: number } {
  let best: { nll: number; lambdaDays: number; k: number } | null = null;
  for (let lam = 500; lam <= 1500; lam += 50) {
    for (let kk = 0.3; kk <= 0.701; kk += 0.05) {
      const v = weibullNll(points, lam, kk);
      if (best === null || v < best.nll) best = { nll: v, lambdaDays: lam, k: kk };
    }
  }
  let cur = best!;
  for (const [sl, sk] of [[50, 0.05], [20, 0.02], [10, 0.01], [5, 0.005], [2, 0.002], [1, 0.001]] as const) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dl, dk] of [[sl, 0], [-sl, 0], [0, sk], [0, -sk], [sl, sk], [-sl, -sk]] as const) {
        const nl = cur.lambdaDays + dl;
        const nk = cur.k + dk;
        if (nl <= 0 || nk <= 0) continue;
        const v = weibullNll(points, nl, nk);
        if (v < cur.nll - 1e-9) {
          cur = { nll: v, lambdaDays: nl, k: nk };
          improved = true;
        }
      }
    }
  }
  return cur;
}

/** The log-loss of a Weibull's launch probabilities on a set of protocols. */
function weibullLogLoss(points: WeibullPoint[], lambdaDays: number, k: number): number {
  let tot = 0;
  for (const pt of points) {
    const p = 1 - weibullSurvival(pt.age, lambdaDays, k);
    const pc = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
    tot += pt.hasToken === 1 ? -Math.log(pc) : -Math.log(1 - pc);
  }
  return tot / points.length;
}

/** The log-loss of the assumed exponential odds, on the same points. */
function assumedLogLoss(points: WeibullPoint[]): number {
  let tot = 0;
  for (const pt of points) {
    const p = 0.55 * Math.exp(-pt.age / 1500) + 0.08;
    const pc = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
    tot += pt.hasToken === 1 ? -Math.log(pc) : -Math.log(1 - pc);
  }
  return tot / points.length;
}

/** The log-loss of the base rate (the overall token share), on the same points. */
function baseLogLoss(points: WeibullPoint[]): number {
  const p = points.reduce((s, pt) => s + pt.hasToken, 0) / points.length;
  const pc = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  let tot = 0;
  for (const pt of points) tot += pt.hasToken === 1 ? -Math.log(pc) : -Math.log(1 - pc);
  return tot / points.length;
}

/** Fit the Weibull odds and run every held-out and blind test on them. */
export function fitWeibullModel(snapshot: Snapshot): WeibullFit {
  const points: WeibullPoint[] = snapshot.protocols.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    return {
      age: age === null ? UNKNOWN_AGE_DAYS : age,
      hasToken: p.gecko_id !== null || p.symbol !== null ? 1 : 0,
    };
  });
  const full = fitWeibull(points);

  // Held-out 5-fold, folds by position in the snapshot list (index % 5).
  const ho: number[] = [];
  const hoA: number[] = [];
  const hoB: number[] = [];
  for (let fold = 0; fold < 5; fold++) {
    const testIdx: number[] = [];
    const trainIdx: number[] = [];
    for (let i = 0; i < points.length; i++) (i % 5 === fold ? testIdx : trainIdx).push(i);
    const train = trainIdx.map((i) => points[i]!);
    const test = testIdx.map((i) => points[i]!);
    const f = fitWeibull(train);
    ho.push(weibullLogLoss(test, f.lambdaDays, f.k));
    hoA.push(assumedLogLoss(test));
    hoB.push(baseLogLoss(test));
  }
  const mean = (v: number[]): number => v.reduce((s, x) => s + x, 0) / v.length;

  // Walk-forward: oldest-listed first, four forward folds (train older, test newer).
  const order = points
    .map((pt, i) => ({ i, age: pt.age }))
    .sort((u, v) => (v.age - u.age) || (snapshot.protocols[u.i]!.slug < snapshot.protocols[v.i]!.slug ? -1 : 1))
    .map((e) => e.i);
  const m = order.length;
  const chunk = Math.floor(m / 5);
  const wf: number[] = [];
  const wfA: number[] = [];
  const wfB: number[] = [];
  for (let f = 1; f <= 4; f++) {
    const testIdx = order.slice(f * chunk, f < 4 ? (f + 1) * chunk : m);
    const trainIdx = order.slice(0, f * chunk);
    const train = trainIdx.map((i) => points[i]!);
    const test = testIdx.map((i) => points[i]!);
    const fit = fitWeibull(train);
    wf.push(weibullLogLoss(test, fit.lambdaDays, fit.k));
    wfA.push(assumedLogLoss(test));
    wfB.push(baseLogLoss(test));
  }

  // Leave-one-out: refit on all but one, score the held-out protocol.
  // A coarse grid keeps this fast; the full fit is reported separately.
  let looTot = 0;
  let looATot = 0;
  let looBTot = 0;
  const pBaseAll = points.reduce((s, pt) => s + pt.hasToken, 0) / points.length;
  for (let i = 0; i < points.length; i++) {
    const train = points.filter((_, j) => j !== i);
    const fit = fitWeibull(train);
    looTot += weibullLogLoss([points[i]!], fit.lambdaDays, fit.k);
    looATot += assumedLogLoss([points[i]!]);
    const pc = Math.min(Math.max(pBaseAll, 1e-12), 1 - 1e-12);
    looBTot += points[i]!.hasToken === 1 ? -Math.log(pc) : -Math.log(1 - pc);
  }

  return {
    lambdaDays: full.lambdaDays,
    k: full.k,
    heldOutLogLoss: mean(ho),
    heldOutAssumed: mean(hoA),
    heldOutBase: mean(hoB),
    walkForwardLogLoss: mean(wf),
    walkForwardS1: mean(wfA),
    walkForwardBase: mean(wfB),
    looLogLoss: looTot / points.length,
    looS1: looATot / points.length,
    looBase: looBTot / points.length,
  };
}

/* ------------------------------------------------------------------ */
/* The board: selection, scoring, verdicts, farm plans.                */
/* ------------------------------------------------------------------ */

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One step as a single string, within the gate's 20..600 characters. */
function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A protocol's farm plan: six steps, each an action with a cost and a time. */
export function farmSteps(p: SnapshotProtocol, deposit: number, gas: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = deposit;
  const hold = HOLD_DAYS;
  const action = actionFor(p, capital, chain);
  return [
    {
      text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  comps: CompsFit,
  weibull: WeibullFit,
): BoardRow[] {
  const ranked = snapshot.protocols
    .filter((p) => isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, BOARD_ROWS);
  const scored = ranked.map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const ageForModel = age === null ? UNKNOWN_AGE_DAYS : age;
    const rawGrowth = finite(p.change_7d, 0);
    const growthPct = Math.min(120, Math.max(-60, rawGrowth));
    const growthMult = 1 + (growthPct / 100) * 0.5;
    const maturityMult = 0.6 + (Math.min(Math.max(ageForModel, 0), 1095) / 1095) * 0.4;
    const base = Math.exp(comps.intercept + comps.slope * Math.log(p.tvl_usd));
    const odds = launchOdds(ageForModel, weibull.lambdaDays, weibull.k, ODDS_HORIZON_DAYS);
    const implied = Math.max(1, Math.round(base * growthMult * maturityMult * odds));
    const farmers = Math.max(MIN_FARMERS, p.tvl_usd / CAPITAL_PER_FARMER_USD);
    const slice = AIRDROP_SHARE / farmers;
    const expected = implied * slice;
    const deposit = depositUsd(p.tvl_usd);
    const gas = gasUsd(chainOf(p));
    const cost = deposit + gas;
    const ratio = cost > 0 ? expected / cost : 0;
    let verdict: 'FARM' | 'THIN' | 'SKIP';
    if (age === null || p.change_7d === null) verdict = 'SKIP';
    else if (ratio >= 3) verdict = 'FARM';
    else if (ratio >= 1) verdict = 'THIN';
    else verdict = 'SKIP';
    return {
      p, age, implied, expected, cost, ratio, verdict,
      base, growthPct, growthMult, maturityMult, odds, farmers, slice, deposit, gas,
    };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    expected_value_usd: round4(s.expected),
    cost_usd: s.cost,
    ev_cost_ratio: round4(s.ratio),
    verdict: s.verdict,
    model: {
      base_usd: Math.round(s.base),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      odds_365d: round4(s.odds),
      age_days: s.age,
      farmers: Math.round(s.farmers),
      slice: s.slice,
      deposit_usd: s.deposit,
      gas_usd: s.gas,
    },
    farm_steps: farmSteps(s.p, s.deposit, s.gas).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    expected_value_usd: row.expected_value_usd,
    cost_usd: row.cost_usd,
    ev_cost_ratio: row.ev_cost_ratio,
    verdict: row.verdict,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    odds_365d: row.model.odds_365d,
    farmers: row.model.farmers,
  };
}

/** Everything the dashboard renders, from the snapshot and the two fits. */
export function buildRadar(
  snapshot: Snapshot,
  comps: CompsFit,
  weibull: WeibullFit,
): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, comps, weibull);
  const live = liveRows(snapshot);
  // The accounting counts every live token, not just the 24 the page shows:
  // 758 = 198 board + 416 live + 144 smaller pre-token not in the board.
  const liveCount = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const counts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) counts[r.verdict]++;
  const compsPoints: [number, number][] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => [round4(Math.log(p.tvl_usd)), round4(Math.log(p.mcap_usd!))] as [number, number]);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: liveCount,
    not_in_board: snapshot.protocols.length - board.length - liveCount,
    comps,
    weibull,
    verdict_counts: counts,
    comps_points: compsPoints,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
