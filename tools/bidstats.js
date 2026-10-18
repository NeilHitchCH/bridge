const E=require('../src/engine'),B=require('../src/bidding'),{evalHand}=require('../src/hand');
const n=+process.argv[2]||2000; const st={passout:0,levels:{},strains:{},doubled:0,games:0,slams:0,maxLen:0}; let t=Date.now();
for(let k=0;k<n;k++){const h=E.deal();const d=E.SEATS[k%4];const a=[];
while(!E.auctionComplete(a)){const s=E.auctionTurn(d,a);const c=B.chooseCall(h[s],s,d,a,{debug:true});if(!E.isLegalCall(d,a,c))throw new Error('illegal '+c);a.push({seat:s,call:c});if(a.length>80)throw new Error('long')}
st.maxLen=Math.max(st.maxLen,a.length);
const c=E.contractOf(d,a); if(!c){st.passout++;continue}
st.levels[c.level]=(st.levels[c.level]||0)+1; st.strains[c.strain]=(st.strains[c.strain]||0)+1; if(c.doubled)st.doubled++;}
console.log(JSON.stringify(st), (Date.now()-t)+'ms');
