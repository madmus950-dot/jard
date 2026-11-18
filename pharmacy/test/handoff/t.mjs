import { build, trialBalance, profitLoss, accBalance, A, DEFAULT_ACCOUNTS } from './engine.js';
const items=new Map([['a',{id:'a',n:'A',u:[{n:'علبة',s:1,p:100}],c0:50}],['b',{id:'b',n:'B',u:[{n:'علبة',s:1,p:20},{n:'باكت',s:10,p:200}],c0:5}]]);
const parties=new Map([['c1',{id:'c1',n:'عميل',t:'c'}],['s1',{id:'s1',n:'مورد',t:'s'}]]);
const accounts=new Map(DEFAULT_ACCOUNTS.map(a=>[a.id,a]));
const ln=(i,q,o={})=>Object.assign({i,n:i,u:0,z:1,q,s:1},o);
const vs=[
 {id:'v1',t:'pur',d:'2026-01-05',pt:'s1',pd:0,ln:[ln('a',10,{c:50}),ln('b',20,{c:5,f:2,x:'03/2028'})]},
 {id:'v2',t:'sale',d:'2026-01-06',pd:500,ln:[ln('a',4,{p:100})]},
 {id:'v3',t:'xfer',d:'2026-01-07',ln:[ln('a',3,{s:1,s2:2})]},
 {id:'v4',t:'sale',d:'2026-01-08',pd:100,pt:'c1',ln:[ln('a',1,{p:100,s:2})]},
 {id:'v5',t:'sret',d:'2026-01-09',pd:100,ln:[ln('a',1,{p:100,s:2})]},
 {id:'v6',t:'pret',d:'2026-01-10',pt:'s1',pd:0,ln:[ln('b',5,{c:5})]},
 {id:'v7',t:'exp',d:'2026-01-11',a:30,ac:'6900',ca:'1101'},
 {id:'v8',t:'adj',d:'2026-01-12',r:'dmg',ln:[ln('b',-2)]},
 {id:'v9',t:'sale',d:'2026-01-13',pd:100,ln:[ln('a',1,{p:100,s:1})]},
];
const L=build({items,parties,accounts,vouchers:vs});
let V=0; for(const s of L.itm.values()) V+=s.V;
console.log('tb',L.dr,L.cr,'issues',L.issues.map(i=>i.k),'stockV',V,'invGL',accBalance(L,A.INV,'','2026-12-31'));
for(const [id,s] of L.itm) console.log(id,s.Q,s.st);
