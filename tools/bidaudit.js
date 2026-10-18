// Audit suggested bids against textbook rules for every system over random hands.
const E = require('../src/engine'), B = require('../src/bidding'), { evalHand } = require('../src/hand'), { SYSTEMS, resolveSystem } = require('../src/systems');
const N = +process.argv[2] || 400, V = +process.argv[3] || 0;
let x = 11; const rng = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
const issues = {}; const flag = (k, s) => (issues[k] = issues[k] || []).push(s);
const fmt = (h) => ['S', 'H', 'D', 'C'].map((t) => h.filter((q) => q[0] === t).map((q) => q[1]).join('') || '-').join('.');
for (const id of Object.keys(SYSTEMS)) {
  const sys = { NS: { id }, EW: { id } }; const S = resolveSystem(id);
  for (let i = 0; i < N; i++) {
    const hands = E.deal(rng);
    // opening as dealer N
    const h = hands.N, ev = evalHand(h);
    const sg = B.suggest(h, 'N', 'N', [], sys); const c = sg.call;
    const tag = `${id} ${fmt(h)} hcp${ev.hcp} -> ${c}`;
    if (!E.isLegalCall('N', [], c)) flag('illegal', tag);
    if (c === 'P' && ev.hcp >= 12 && !(S.precision && ev.hcp < 11)) flag('pass-with-opening', tag);
    if (/^1[CDHS]$/.test(c) && ev.hcp < 10) flag('open-too-weak', tag);
    if (c === '1N' && (!ev.balanced || ev.hcp < S.nt[0] || ev.hcp > S.nt[1])) flag('1NT-range', tag);
    if (/^1[HS]$/.test(c) && ev.len[c[1]] < S.majorLen) flag('major-length', tag);
    if (/^2[DHS]$/.test(c) && !S.precision && !(S.sef && c === '2D') && (ev.hcp > 11 || ev.len[c[1]] < 6)) flag('weak-two', tag);
    if (ev.balanced && ev.hcp >= S.nt[0] && ev.hcp <= S.nt[1] && c !== '1N' && !(ev.len.S >= 5 || ev.len.H >= 5)) flag('missed-1NT', tag);
    if (!sg.text.startsWith(B.callText(c))) flag('text', tag + ' ' + sg.text);
    // responses to partner's 1NT (S opened 1NT, W passed, N to bid)
    const auc = [{ seat: 'S', call: '1N' }, { seat: 'W', call: 'P' }];
    const r = B.suggest(h, 'N', 'S', auc, sys).call;
    const conv = { ...S.conv };
    const rt = `${id} over 1NT ${fmt(h)} hcp${ev.hcp} -> ${r}`;
    if (!E.isLegalCall('S', auc, r)) flag('illegal', rt);
    if (r === '2C' && conv.stayman && ev.len.H < 4 && ev.len.S < 4) flag('stayman-no-major', rt);
    if (r === '2D' && conv.transfers && ev.len.H < 5) flag('transfer-H-short', rt);
    if (r === '2H' && conv.transfers && ev.len.S < 5) flag('transfer-S-short', rt);
    if (r === '3N' && ev.hcp + S.nt[0] < 25) flag('3NT-too-weak', rt);
    if (r === 'P' && ev.hcp + S.nt[1] >= 26 && !(ev.len.S >= 5 || ev.len.H >= 5)) flag('pass-with-game', rt);
    // responses to partner's 1H
    const a2 = [{ seat: 'S', call: '1H' }, { seat: 'W', call: 'P' }];
    const r2 = B.suggest(h, 'N', 'S', a2, sys).call;
    const t2 = `${id} over 1H ${fmt(h)} hcp${ev.hcp} -> ${r2}`;
    if (!E.isLegalCall('S', a2, r2)) flag('illegal', t2);
    if (r2 === 'P' && ev.hcp >= 6 && !(S.precision && false)) flag('pass-1H-with-6', t2);
    if (r2 === '2H' && (ev.len.H < (S.majorLen === 4 ? 4 : 3) || ev.hcp > 10)) flag('raise-1H', t2);
    if (r2 === '1S' && ev.len.S < 4) flag('1S-short', t2);
    if (/^2[CD]$/.test(r2) && ev.hcp < 10) flag('2-level-too-weak', t2);
    if (r2 === '1N' && (ev.hcp < 6 || ev.hcp > S.resp1NT[1] + 2)) flag('1NT-resp-range', t2);
  }
}
for (const [k, v] of Object.entries(issues)) { console.log(k, v.length); for (const s of v.slice(0, V)) console.log('   ', s); }
