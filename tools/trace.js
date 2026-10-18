const E=require('../src/engine'),G=require('../src/game'),{evalHand}=require('../src/hand');
const n=+process.argv[2]||1, seed=+process.argv[3]||3;
let x=seed; const rng=()=>{x=(x*1103515245+12345)%2147483648; return x/2147483648;};
for(let k=1;k<=n;k++){const b=G.newBoard(k,rng);
while(b.phase!=='done'){if(b.trickComplete){G.collectTrick(b);continue}const a=G.botAction(b);a.type==='call'?G.applyCall(b,a.actor,a.value):G.applyCard(b,a.actor,a.value);}
const h=b.original;const fmt=s=>s+'('+evalHand(h[s]).hcp+') '+['S','H','D','C'].map(t=>h[s].filter(q=>q[0]===t).map(q=>q[1]).join('')||'-').join('.');
console.log('=== board',k);E.SEATS.forEach(s=>console.log('  '+fmt(s)));
console.log('  '+b.auction.map(a=>a.seat+':'+a.call).join(' '));
if(b.contract){b.tricks.forEach((t,i)=>console.log('  T'+(i+1)+' '+t.cards.map(c=>c.seat+c.card).join(' ')+' -> '+t.winner));}
console.log('  RESULT '+G.resultText(b)+' score NS '+b.result.nsScore);}
