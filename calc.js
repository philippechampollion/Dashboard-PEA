// Calculs financiers purs (testables sous Node et utilisables en module ES dans le navigateur).
export const num = v => Number(v) || 0;

// PRU = coût moyen pondéré frais inclus : un achat le met à jour, une vente ne le modifie pas.
export function computePositions(txs) {
  const m = {}; let cash = 0, deposits = 0, fees = 0, divs = 0;
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    const q = num(t.quantite), p = num(t.prix_unitaire), f = num(t.frais);
    fees += f;
    if (t.type === 'Versement') { cash += q * p; deposits += q * p; continue; }
    if (t.type === 'Retrait') { cash -= q * p; deposits -= q * p; continue; }
    const x = (m[t.ticker] ??= { ticker: t.ticker, qty: 0, cost: 0, divs: 0, realized: 0 });
    if (t.type === 'Achat') { x.qty += q; x.cost += q * p + f; cash -= q * p + f; }
    else if (t.type === 'Vente') {
      const pru = x.qty ? x.cost / x.qty : 0;
      x.realized += q * p - f - pru * q; x.cost -= pru * q; x.qty -= q; cash += q * p - f;
    } else if (t.type === 'Dividende') { x.divs += q * p; divs += q * p; cash += q * p; }
    if (x.qty < 1e-9) { x.qty = 0; x.cost = 0; }
  }
  const positions = Object.values(m).map(x => ({ ...x, pru: x.qty ? x.cost / x.qty : 0 }));
  return { positions, cash, deposits, fees, divs };
}

// Valorisation : plus-value latente = (cours - PRU) x quantité.
export function valuePortfolio(pf, cours = {}, titres = []) {
  const meta = Object.fromEntries(titres.map(t => [t.ticker, t]));
  const rows = pf.positions.filter(p => p.qty > 0).map(p => {
    const c = cours[p.ticker], px = c ? c.cours : p.pru, dv = c ? c.variation_jour : 0;
    return { ...p, ...(meta[p.ticker] || {}), cours: px, jourEur: dv * p.qty,
      jourPct: px - dv ? dv / (px - dv) : 0, stale: !c || !!c.stale,
      valeur: p.qty * px, pv: (px - p.pru) * p.qty, pvPct: p.pru ? px / p.pru - 1 : 0 };
  });
  const hold = rows.reduce((s, r) => s + r.valeur, 0);
  rows.forEach(r => r.poids = hold ? r.valeur / hold : 0);
  return { rows, hold, total: hold + pf.cash, cash: pf.cash, day: rows.reduce((s, r) => s + r.jourEur, 0) };
}

// TRI (XIRR) par bissection : flux = [{date: Date, amount}], versements négatifs, valeur finale positive.
export function xirr(flows) {
  if (flows.length < 2) return null;
  const t0 = flows[0].date.getTime();
  const f = r => flows.reduce((s, c) => s + c.amount / Math.pow(1 + r, (c.date - t0) / 864e5 / 365), 0);
  let lo = -0.99, hi = 10;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; (f(lo) * f(mid) <= 0) ? hi = mid : lo = mid; }
  return (lo + hi) / 2;
}

export function maxDrawdown(vals) {
  let peak = -Infinity, mdd = 0;
  for (const v of vals) { peak = Math.max(peak, v); if (peak > 0) mdd = Math.min(mdd, v / peak - 1); }
  return mdd;
}

export function volatility(vals) { // annualisée, sur rendements quotidiens
  const r = vals.slice(1).map((v, i) => v / vals[i] - 1);
  if (r.length < 2) return null;
  const mu = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - mu) ** 2, 0) / (r.length - 1)) * Math.sqrt(252);
}
