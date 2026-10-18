const E=require('../src/engine'),B=require('../src/bidding'),{evalHand}=require('../src/hand');
const n=+process.argv[2]||10; const seed=+process.argv[3]||1;
let x=seed; const rng=()=>{x=(x*1103515245+12345)%2147483648; return x/2147483648;};
for(let k=0;k<n;k++){const h=E.deal(rng);const d=E.SEATS[k%4];const a=[];
while(!E.auctionComplete(a)){const s=E.auctionTurn(d,a);a.push({seat:s,call:B.chooseCall(h[s],s,d,a,{debug:true})});}
const c=E.contractOf(d,a);
const fmt=s=>{const ev=evalHand(h[s]);return s+'('+ev.hcp+') '+['S','H','D','C'].map(t=>h[s].filter(q=>q[0]===t).map(q=>q[1]).join('')||'-').join('.')};
console.log('---');E.SEATS.forEach(s=>console.log('  '+fmt(s)));
console.log('  dealer '+d+': '+a.map(x=>x.seat+':'+x.call).join(' ')+' => '+E.contractStr(c)+(c?' '+c.declarer:''));}
