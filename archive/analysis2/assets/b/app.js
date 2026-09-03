
"use strict";
/* ================= STORE ================= */
const KEY='evprod.db.v1', LS_THEME='evprod.theme', LS_CHAN='evprod.chan';
const IS_BOOKINGS_PAGE=location.pathname.endsWith('/bookings.html');
const MAIN_PAGE=IS_BOOKINGS_PAGE?'evprod.html':'#';
const CATS=['PO','Gacha','Dono goal','OTS','Auction','Freebie'];
const CHANS=['OTS','Gacha','PO','Staff','Auction'];
const PAYSTAGES=['pending','paid','fulfilled','shipped','cancelled'];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const nowISO=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp'+(Math.round(n)||0).toLocaleString('id-ID');
const num=n=>(Math.round(n*100)/100).toLocaleString('id-ID');
function freshDB(){return{schema:1,activeEvent:null,events:[],products:[],variants:[],vendors:[],lots:[],sales:[],pools:[],bookings:[],todos:[],expenses:[],log:[]};}
let DB=null;
function load(){
  try{const raw=localStorage.getItem(KEY); if(raw){DB=JSON.parse(raw); migrate(); return;}}catch(e){}
  DB=freshDB(); seedDemo(); save();
}
function migrate(){const f=freshDB(); for(const k of Object.keys(f)) if(DB[k]===undefined) DB[k]=f[k];}
function save(){try{localStorage.setItem(KEY,JSON.stringify(DB));}catch(e){toast('SAVE FAILED: storage full');}}
function logAct(type,detail,outcome='ok'){
  DB.log.unshift({id:uid(),type,detail:detail.slice(0,140),ts:nowISO(),
    counts:{products:DB.products.length,variants:DB.variants.length,sales:DB.sales.length,bookings:DB.bookings.length,lots:DB.lots.length},outcome});
  if(DB.log.length>600) DB.log.length=600; save();
}
/* ---- event scoping ---- */
const ev=()=>DB.events.find(e=>e.id===DB.activeEvent);
function evList(coll){const e=ev(); return e? coll.filter(x=>x.eventId===e.id):[];}
function pid2prod(){const m={};DB.products.forEach(p=>m[p.id]=p);return m;}
function vid2var(){const m={};DB.variants.forEach(v=>m[v.id]=v);return m;}

/* ================= SEED (sample CF-21-flavoured demo, clearly marked) ================= */
function seedDemo(){
  const e={id:uid(),name:'CF-21',status:'active',created:nowISO(),playPrice:25000,archived:false};
  DB.activeEvent=e.id; DB.events=[e];
  const v1={id:uid(),name:'Dreamer Studio',url:'https://dreamer-studio.example',notes:'Acrylic + standee vendor'};
  const v2={id:uid(),name:'PrintKita',url:'',notes:'Sticker & keychain'}; DB.vendors=[v1,v2];
  const p1={id:uid(),eventId:e.id,name:'Acrylic Charm',vendorId:v1.id,cats:['PO','OTS'],unitCost:12000,packCost:1500,price:35000,artStatus:'Art ready',prodStatus:'In production',pic:'Toyo',notes:'',created:nowISO()};
  const p2={id:uid(),eventId:e.id,name:'Standee',vendorId:v1.id,cats:['PO'],unitCost:28000,packCost:2500,price:75000,artStatus:'Commission in progress',prodStatus:'Production test',pic:'',notes:'15cm',created:nowISO()};
  const p3={id:uid(),eventId:e.id,name:'Sticker Pack',vendorId:v2.id,cats:['OTS','Freebie'],unitCost:3000,packCost:500,price:12000,artStatus:'Art ready',prodStatus:'In production',pic:'',notes:'Shared item — product-level stock',created:nowISO()};
  DB.products=[p1,p2,p3];
  const tal=['Nana','Kira','Momo'];
  let vs=[]; tal.forEach(t=>{vs.push({id:uid(),productId:p1.id,talent:t,unitCostOverride:null,priceOverride:null,notes:'',created:nowISO()});});
  vs.push({id:uid(),productId:p2.id,talent:'Nana',unitCostOverride:30000,priceOverride:null,notes:'',created:nowISO()});
  vs.push({id:uid(),productId:p3.id,talent:null,unitCostOverride:null,priceOverride:null,notes:'Product-level (shared)',created:nowISO()});
  DB.variants=vs;
  DB.lots=[{id:uid(),eventId:e.id,variantId:vs[0].id,qtyOrdered:50,qtyDelivered:50,source:'PO',unitCost:12000,pic:'Toyo',batch:'B1',status:'delivered',created:nowISO()},
           {id:uid(),eventId:e.id,variantId:vs[3].id,qtyOrdered:20,qtyDelivered:3,source:'PO',unitCost:30000,pic:'Toyo',batch:'B1',status:'ordered',created:nowISO()}];
  DB.todos=[{id:uid(),eventId:e.id,title:'Confirm standee vendor quote',assignee:'Toyo',due:'2026-09-05',done:false,notes:''},
            {id:uid(),eventId:e.id,title:'Print booth banner',assignee:'',due:'2026-09-10',done:false,notes:''}];
  logAct('SEED_DEMO','sample data generated on first run');
}

/* ================= COMPUTED ================= */
function costOf(v){const p=pid2prod()[v.productId]; if(!p)return 0; return (v.unitCostOverride??p.unitCost)+(p.packCost||0);}
function priceOf(v){const p=pid2prod()[v.productId]; if(!p)return 0; return (v.priceOverride??p.price)||0;}
function stockOf(variantId){ // delivered lots, minus fulfilled booking & gacha allocation consumption at sale time
  let s=0; evList(DB.lots).forEach(l=>{if(l.variantId===variantId)s+=(l.qtyDelivered||0);});
  evList(DB.sales).forEach(r=>{if(r.variantId===variantId)s-=(r.qty||0);}); // sold out of stock (OTS/Staff; PO sales come from bookings fulfilment)
  return s;
}
function variantLabel(v){const p=pid2prod()[v.productId]; if(!p)return'?'; return v.talent? p.name+' — '+v.talent : p.name+' (shared)';}
function salesOf(variantId,chan){return evList(DB.sales).filter(r=>r.variantId===variantId&&(!chan||r.channel===chan));}
function poolOf(variantId){const e=ev(); if(!e)return null; return DB.pools.find(p=>p.eventId===e.id&&p.variants.some(x=>x.variantId===variantId))||null;}
function chanStock(variantId,chan){ // how many units remain sellable in this channel
  if(chan==='OTS'||chan==='Staff') return stockOf(variantId);
  if(chan==='Gacha'){const pl=poolOf(variantId); if(!pl)return 0; const a=pl.variants.find(x=>x.variantId===variantId); return a?Math.max(0,(a.qty||0)-salesOf(variantId,'Gacha').reduce((s,r)=>s+r.qty,0)):0;}
  return 9999; // PO: made to demand
}
function demandOf(variantId){ // print demand = PO bookings qty, fulfilled subtracted
  let d=0; evList(DB.bookings).forEach(b=>{if(b.status==='cancelled')return;
    (b.items||[]).forEach(i=>{if(i.variantId===variantId)d+=i.qty;});});
  evList(DB.sales).forEach(r=>{if(r.variantId===variantId&&r.channel==='PO')d-=(r.qty||0);}); // fulfilled PO already decremented demand via sale
  return d;
}
function producedOf(variantId){let s=0;evList(DB.lots).forEach(l=>{if(l.variantId===variantId)s+=(l.qtyDelivered||0);});return s;}
function evSummary(){ // pool-level EV
  const out={revenue:0,profit:0,expenses:0,stock:0,demand:0};
  evList(DB.sales).forEach(r=>{const v=vid2var()[r.variantId]; if(!v)return; out.revenue+=(r.price||0)*(r.qty||0); out.profit+=((r.price||0)-costOf(v))*(r.qty||0);});
  evList(DB.expenses).forEach(x=>out.expenses+=(x.amount||0));
  const seen={}; DB.variants.forEach(v=>{if(seen[v.id]||!evList(DB.lots).some(l=>l.variantId===v.id)&&!evList(DB.sales).some(r=>r.variantId===v.id))return; seen[v.id]=1; out.stock+=stockOf(v.id); out.demand+=demandOf(v.id);});
  return out;
}

/* ================= MODAL / TOAST ================= */
let toastT; function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600);}
function openModal(html){document.getElementById('modal').innerHTML=html;document.getElementById('overlay').classList.add('on');}
function closeModal(){document.getElementById('overlay').classList.remove('on');}
document.getElementById('overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeModal();});
function fld(label,inner){return `<div style="margin-bottom:12px"><label>${label}</label>${inner}</div>`;}
function fmtDT(iso){try{return new Date(iso).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch(e){return iso;}}

/* ================= UI ================= */
const UI={
 view:'dashboard', chan:localStorage.getItem(LS_CHAN)||'OTS', itemCat:'', bookStage:'',
 calc:{lines:[{label:'Acrylic 5cm',tier:[[50,12000],[100,11000]],qty:100,pack:1500}]},

 goto(v){
  if(v==='bookings'&&!IS_BOOKINGS_PAGE){location.href='bookings.html';return;}
 if(IS_BOOKINGS_PAGE&&v!=='bookings'){location.href=MAIN_PAGE+'#/'+v;return;}
  this.view=v;location.hash='#/'+v;render();
 },
 setChan(c){this.chan=c;localStorage.setItem(LS_CHAN,c);render();},

 /* ---- dashboard ---- */
 dashStats(){
  const s=evSummary(), todos=evList(DB.todos).filter(t=>!t.done);
  return `<div class="stat"><div class="k">Items / Variants</div><div class="v">${DB.products.filter(p=>p.eventId===ev()?.id).length}<span class="mut" style="font-size:1rem"> / ${DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===ev()?.id).length}</span></div></div>
  <div class="stat"><div class="k">Open to-dos</div><div class="v">${todos.length}</div></div>
  <div class="stat"><div class="k">Production cost</div><div class="v">${rp(this.totalProdCost())}</div><div class="d">lots delivered × unit cost</div></div>
  <div class="stat"><div class="k">Net profit (est.)</div><div class="v ${s.profit>=0?'pos':'neg'}">${rp(s.profit)}</div><div class="d">sales profit − ${rp(s.expenses)} expenses</div></div>
  <div class="stat"><div class="k">Stock on hand</div><div class="v">${num(s.stock)}</div></div>
  <div class="stat"><div class="k">Print demand</div><div class="v">${num(s.demand)}</div><div class="d">unfulfilled PO units</div></div>`;
 },
 totalProdCost(){let s=0;evList(DB.lots).forEach(l=>s+=(l.qtyDelivered||0)*(l.unitCost||0));return s;},
 dashDemand(){
  const rows=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===ev()?.id).map(v=>({v,d:demandOf(v.id),p:producedOf(v.id)})).filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,8);
  if(!rows.length)return `<div class="empty"><div class="big">✓</div>Nothing owed to vendors. Add PO bookings to build demand.</div>`;
  return `<table><thead><tr><th>Variant</th><th style="text-align:right">Demand</th><th style="text-align:right">Produced</th><th style="text-align:right">Remaining</th></tr></thead><tbody>${
   rows.map(x=>`<tr><td>${esc(variantLabel(x.v))}</td><td class="num" style="text-align:right">${x.d}</td><td class="num" style="text-align:right">${x.p}</td><td class="num" style="text-align:right;font-weight:700">${x.d-x.p>0?x.d-x.p:'✓'}</td></tr>`).join('')}</tbody></table>`;
 },
 dashTodos(){
  const t=evList(DB.todos).filter(t=>!t.done).sort((a,b)=>(a.due||'zz').localeCompare(b.due||'zz')).slice(0,6);
  if(!t.length)return `<div class="empty"><div class="big">☑</div>All clear. <button class="btn sm subtle" onclick="UI.openTodo()">Add a task</button></div>`;
  return t.map(x=>`<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)"><span class="chip ${x.due&&x.due<'2026-08-28'?'bad':'acc'}">${x.due||'—'}</span><span style="flex:1">${esc(x.title)}</span><span class="mut" style="font-size:.8rem">${esc(x.assignee||'')}</span></div>`).join('');
 },
 dashLow(){
  const rows=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===ev()?.id&&chanStock(v.id,'OTS')<=3).map(v=>({v,s:chanStock(v.id,'OTS')}));
  if(!rows.length)return `<div class="empty">No low-stock variants.</div>`;
  return rows.map(x=>`<span class="chip warn" style="margin:2px">${esc(variantLabel(x.v))} · ${x.s} left</span>`).join(' ');
 },

 /* ---- items ---- */
 itemRow(v){
  const stock=stockOf(v.id), d=demandOf(v.id), rem=d-producedOf(v.id);
  const lots=evList(DB.lots).filter(l=>l.variantId===v.id);
  return `<tr><td><b>${esc(variantLabel(v))}</b>${lots.length?`<br><small class="mut">${lots.length} lot${lots.length>1?'s':''} · ${lots.map(l=>l.batch).join(', ')}</small>`:''}</td>
  <td class="num">${rp(costOf(v))}</td><td class="num">${rp(priceOf(v))}</td>
  <td class="num" style="font-weight:700">${stock}</td>
  <td class="num">${d}</td><td class="num ${rem>0?'neg':''}">${rem>0?rem:'✓'}</td>
  <td style="white-space:nowrap"><button class="btn sm ghost" onclick="UI.openLot('${v.id}')">+ Lot</button> <button class="btn sm ghost" onclick="UI.cloneVariant('${v.id}')">Clone</button></td></tr>`;
 },
 renderItems(){
  const e=ev(); if(!e){document.getElementById('itemsList').innerHTML=`<div class="card empty">No active event — create one in <b>Sync &amp; Log → Events</b>.</div>`;return;}
  const prod=DB.products.filter(p=>p.eventId===e.id&&( !UI.itemCat||p.cats.includes(UI.itemCat)))
    .filter(p=>{const q=document.getElementById('itemSearch').value.toLowerCase(); return !q||p.name.toLowerCase().includes(q)||DB.variants.some(v=>v.productId===p.id&&(v.talent||'').toLowerCase().includes(q));});
  const wrap=document.getElementById('itemsList');
  if(!prod.length){wrap.innerHTML=`<div class="card empty"><div class="big">▦</div>No products${UI.itemCat?' in '+esc(UI.itemCat):''} yet.<br><button class="btn" style="margin-top:10px" onclick="UI.openProduct()">+ Add first product</button></div>`;return;}
  wrap.innerHTML=prod.map(p=>{
   const vs=DB.variants.filter(v=>v.productId===p.id);
   const vendor=DB.vendors.find(v=>v.id===p.vendorId);
   return `<div class="card" style="margin-bottom:12px">
   <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
     <div><b style="font-size:1.02rem">${esc(p.name)}</b>
       <div style="margin-top:4px">${p.cats.map(c=>`<span class="chip acc">${esc(c)}</span>`).join(' ')}
       ${p.artStatus?`<span class="chip ${p.artStatus==='Art ready'?'ok':'warn'}">${esc(p.artStatus)}</span>`:''}
       ${p.prodStatus?`<span class="chip ${p.prodStatus==='In production'?'ok':''}">${esc(p.prodStatus)}</span>`:''}</div>
       <div class="mut" style="font-size:.82rem;margin-top:4px">${vendor?'◈ '+esc(vendor.name)+' · ':''}unit ${rp(p.unitCost)} + pack ${rp(p.packCost)} → price ${rp(p.price)}${p.pic?' · PIC '+esc(p.pic):''}</div>
       ${p.notes?`<div class="mut" style="font-size:.82rem">${esc(p.notes)}</div>`:''}</div>
     <div style="white-space:nowrap"><button class="btn sm ghost" onclick="UI.openProduct('${p.id}')">Edit</button> <button class="btn sm ghost" onclick="UI.openVariant('${p.id}')">+ Variant</button> <button class="btn sm subtle" onclick="UI.cloneProduct('${p.id}')">Clone→event</button> <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('product','${p.id}')">✕</button></div>
   </div>
   ${vs.length?`<div class="twrap" style="margin-top:10px;border:none"><table><thead><tr><th>Variant</th><th>Unit cost</th><th>Price</th><th>Stock</th><th>Demand</th><th>To print</th><th></th></tr></thead><tbody>${vs.map(v=>UI.itemRow(v)).join('')}</tbody></table></div>`
   :`<div class="empty" style="padding:14px">No talent variants — shared item, stock tracked at product level. <button class="btn sm ghost" onclick="UI.openVariant('${p.id}')">+ Add variant</button></div>`}
   </div>`;}).join('');
 },

 /* ---- event mode ---- */
 renderEvent(){
  const bar=document.getElementById('chanBar');
  bar.innerHTML=CHANS.slice(0,4).map(c=>`<button class="fbtn ${UI.chan===c?'on':''}" style="min-height:44px" onclick="UI.setChan('${c}')">${c}</button>`).join('');
  const e=ev(); if(!e){document.getElementById('tallyGrid').innerHTML=`<div class="card empty">No active event.</div>`;return;}
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===e.id);
  const sess=evList(DB.sales).reduce((s,r)=>s+(r.qty||0),0);
  const sessRev=evList(DB.sales).reduce((s,r)=>s+(r.qty||0)*(r.price||0),0);
  document.getElementById('sessionLine').innerHTML=`Session: <b class="num">${sess}</b> units · <b class="num">${rp(sessRev)}</b> — channel <b>${UI.chan}</b>. Saving continuously.`;
  document.getElementById('tallyGrid').innerHTML=vs.length?vs.map(v=>{
    const st=chanStock(v.id,UI.chan);
    return `<button class="tile ${st<=3&&st<9999?'low':''}" onclick="UI.tally('${v.id}',1)">
      <span class="nm">${esc(variantLabel(v))}</span><span class="pr num">${rp(priceOf(v))}</span>
      <span class="stock">${st<9999?st:'∞'}</span>
      ${st<9999?`<span class="l5" onclick="event.stopPropagation();UI.tally('${v.id}',5)">+5</span>`:''}</button>`;}).join('')
   :`<div class="card empty"><div class="big">⚡</div>No variants in this event. Add products in <b>Items</b>.</div>`;
 },
 tally(vid,n){
  const st=chanStock(vid,UI.chan);
  if(UI.chan!=='PO'&&st<n){toast('Not enough '+UI.chan+' stock for '+variantLabel(vid2var()[vid]));return;}
  const v=vid2var()[vid];
  DB.sales.push({id:uid(),eventId:DB.activeEvent,variantId:vid,channel:UI.chan,qty:n,price:priceOf(v),ts:nowISO(),createdBy:null});
  logAct('LIVE_TALLY_SALE',variantLabel(v)+' ×'+n+' via '+UI.chan);
  toast('+'+n+' '+variantLabel(v));
  render();
 },

 /* ---- vendors ---- */
 renderVendors(){
  const list=document.getElementById('vendorsList');
  if(!DB.vendors.length){list.innerHTML=`<div class="card empty"><div class="big">◈</div>No vendors yet — add one.</div>`;return;}
  list.innerHTML=`<div class="twrap"><table><thead><tr><th>Vendor</th><th>Contact</th><th>Makes</th><th></th></tr></thead><tbody>${
   DB.vendors.map(v=>{const n=DB.products.filter(p=>p.vendorId===v.id).length;
   return `<tr><td><b>${esc(v.name)}</b>${v.notes?`<br><small class="mut">${esc(v.notes)}</small>`:''}</td>
   <td>${[v.url&&`<a href="${esc(v.url)}" target="_blank" rel="noopener">🌐 site</a>`,v.social&&`<a href="${esc(v.social)}" target="_blank" rel="noopener">💬 social</a>`,v.market&&`<a href="${esc(v.market)}" target="_blank" rel="noopener">🛒 shop</a>`,v.wa&&`<a href="https://wa.me/${esc(String(v.wa).replace(/^0/,'62').replace(/\D/g,''))}" target="_blank" rel="noopener">📱 WA</a>`].filter(Boolean).join(' · ')||'<span class="mut">—</span>'}</td>
   <td class="num">${n} product${n===1?'':'s'}</td>
   <td style="white-space:nowrap"><button class="btn sm ghost" onclick="UI.openVendor('${v.id}')">Edit</button> <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('vendor','${v.id}')">✕</button></td></tr>`;}).join('')}</tbody></table></div>`;
 },

 /* ---- gacha ---- */
 renderPools(){
  const e=ev(); const wrap=document.getElementById('poolsList');
  const pools=e?DB.pools.filter(p=>p.eventId===e.id):[];
  if(!pools.length){wrap.innerHTML=`<div class="card empty"><div class="big">🎰</div>No gacha pools. Create one, then add prize allocations from your variants.</div>`;return;}
  const play=e.playPrice||25000;
  wrap.innerHTML=pools.map(pl=>{
    const rows=pl.variants.map(a=>{const v=vid2var()[a.variantId];if(!v)return null;const c=costOf(v);
      return{a,v,c,margin:play-c};}).filter(Boolean);
    const totRate=pl.variants.reduce((s,a)=>s+(a.rate||0),0);
    const EV=pl.variants.reduce((s,a)=>{const v=vid2var()[a.variantId];return s+(a.rate||0)*(v?costOf(v):0);},0);
    const solvent=EV<play;
    return `<div class="card" style="margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
      <div><b style="font-size:1.02rem">${esc(pl.name)}</b> <span class="chip ${totRate>1.001?'bad':'ok'}">Σ rates ${(totRate*100).toFixed(1)}%</span></div>
      <div><button class="btn sm ghost" onclick="UI.openPoolAlloc('${pl.id}')">+ Prize</button> <button class="btn sm ghost" onclick="UI.openPool('${pl.id}')">Edit</button> <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('pool','${pl.id}')">✕</button></div>
    </div>
    <div class="grid g4" style="margin:10px 0">
      <div class="stat"><div class="k">Play price</div><div class="v">${rp(play)}</div></div>
      <div class="stat"><div class="k">EV / pull</div><div class="v ${solvent?'pos':'neg'}">${rp(EV)}</div><div class="d">Σ rate × unit cost</div></div>
      <div class="stat"><div class="k">Margin / pull</div><div class="v ${play-EV>=0?'pos':'neg'}">${rp(play-EV)}</div></div>
      <div class="stat"><div class="k">Verdict</div><div class="v" style="font-size:1rem">${solvent?'✅ Solvent':'⚠️ LOSING'}</div><div class="d">${solvent?'':'prize allocation too generous'}</div></div>
    </div>
    ${!solvent?`<div class="chip bad">EV ≥ play price — reduce top-tier qty/rate or raise play price before printing.</div>`:''}
    <div class="twrap" style="margin-top:8px;border:none"><table><thead><tr><th>Prize (variant)</th><th>Qty</th><th>Drop rate</th><th>Unit cost</th><th>Margin @ play</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${esc(variantLabel(r.v))}</td><td class="num">${r.a.qty}</td><td class="num">${((r.a.rate||0)*100).toFixed(1)}%</td><td class="num">${rp(r.c)}</td><td class="num ${r.margin<0?'neg':'pos'}">${rp(r.margin)} ${r.margin<0?'<small class="mut">(filler funds this)</small>':''}</td></tr>`).join('')}
    </tbody></table></div></div>`;}).join('');
 },

 /* ---- bookings ---- */
 renderBookings(){
  const stage=UI.bookStage;
  const rows=evList(DB.bookings).filter(b=>!stage||b.status===stage).sort((a,b)=>(b.created||'').localeCompare(a.created||''));
  const sel=window.__bookSel=window.__bookSel||new Set();
  const view=UI.bookView=UI.bookView||'sheet';
  document.getElementById('bookFilters').innerHTML=`<div class="filters"><button class="fbtn ${!stage?'on':''}" onclick="UI.bookStage='';render()">All</button>${
   PAYSTAGES.map(s=>`<button class="fbtn ${stage===s?'on':''}" onclick="UI.bookStage='${s}';render()">${s}</button>`).join('')}</div>
   <div class="viewswitch"><button class="${view==='sheet'?'on':''}" onclick="UI.bookView='sheet';render()">▤ Sheet</button><button class="${view==='orders'?'on':''}" onclick="UI.bookView='orders';render()">☰ Orders</button></div>
   <span style="flex:1"></span>
   <button class="btn sm danger ${sel.size?'':'ghost'}" ${sel.size?'':'disabled'} onclick="UI.bulkDeleteBookings()">🗑 Delete selected (${sel.size})</button>`;
  const wrap=document.getElementById('bookingsList');
  if(!rows.length){wrap.innerHTML=`<div class="card empty"><div class="big">✉</div>No bookings${stage?' in '+stage:''}. Add manually or import a Google Form CSV/XLSX.</div>`;return;}
  if(view==='orders')return this.renderBookingsOrders(wrap,rows,sel);
  UI.bookPage=UI.bookPage||1;UI.bookPerPage=UI.bookPerPage||20;
  const perPage=UI.bookPerPage,pages=Math.max(1,Math.ceil(rows.length/perPage));
  if(UI.bookPage>pages)UI.bookPage=pages;
  const pageRows=rows.slice((UI.bookPage-1)*perPage,UI.bookPage*perPage);
  const money=s=>{s=String(s||'');if(/\.\d{2}\s*$/.test(s))s=s.slice(0,-3);const m=s.replace(/[^\d]/g,'');return m?+m:0;};
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  const txtEdit=(id,field,val,extra)=>`<input class="cellinp" value="${esc(val??'')}" onchange="UI.editBooking('${id}','${field}',this.value)" ${extra||''}>`;
  let html=`<div class="twrap"><table class="sheet"><colgroup>
   <col style="width:36px"><col style="width:34px"><col style="width:13%"><col style="width:11%"><col style="width:14%"><col style="width:17%"><col style="width:5%"><col style="width:8%"><col style="width:7%"><col style="width:6%"><col style="width:5%"><col style="width:8%"><col style="width:12%"><col style="width:70px">
  </colgroup><thead><tr>
   <th style="width:34px"><label class="custom-checkbox"><input type="checkbox" class="checkbox-input" onchange="UI.selAllBookings(this.checked)" ${sel.size&&sel.size===rows.length?'checked':''}><span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></label></th>
   <th style="width:30px">#</th><th>Customer</th><th>Contact / WA</th><th>Address</th><th>Item</th><th style="width:56px;text-align:right">Qty</th><th style="text-align:right">Line total</th>
   <th>Order total</th><th style="width:110px">Ship</th><th style="width:90px">Fulfil</th><th>Status</th><th>Notes</th><th style="width:60px"></th></tr></thead><tbody>`;
  pageRows.forEach((b,bi)=>{
    const selCls=sel.has(b.id)?' style="background:var(--accent-soft)"':'';
    const lineTotal=i=>i.price??(i.qty*(vid2var()[i.variantId]?priceOf(vid2var()[i.variantId]):0));
    const total=(b.items||[]).reduce((s,i)=>s+lineTotal(i),0)+(b.shipFee||0);
    const n=(b.items||[]).length;
    const stSel=`<select class="cellinp" onchange="UI.setBookStage('${b.id}',this.value)">${PAYSTAGES.map(s=>`<option ${b.status===s?'selected':''}>${s}</option>`).join('')}</select>`;
    const fulSel=`<select class="cellinp" onchange="UI.editBooking('${b.id}','fulfil',this.value)"><option value="pickup" ${b.fulfil!=='mail'?'selected':''}>pickup</option><option value="mail" ${b.fulfil==='mail'?'selected':''}>mail</option></select>`;
    // flat spreadsheet: ONE <tr> PER ITEM LINE. No rowspans. Order fields repeat via rowSpan-free classes.
    const itemRows=(b.items&&b.items.length?b.items:[{}]).map((i,ix)=>{
      const v=vid2var()[i.variantId];
      const first=ix===0;
      return `<tr class="${first?'ordfirst':''}"${first?selCls:''}>
      <td>${first?`<label class="custom-checkbox"><input type="checkbox" class="checkbox-input" ${sel.has(b.id)?'checked':''} onchange="UI.selBooking('${b.id}')"><span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></label>`:''}</td>
      <td class="mut num">${bi+1}.${ix+1}</td>
      <td>${first?txtEdit(b.id,'customer',b.customer):'<span class="mut" style="font-size:.75rem">″</span>'}</td>
      <td>${first?txtEdit(b.id,'contact',b.contact):''}</td>
      <td class="celladdr">${first?txtEdit(b.id,'address',b.address):''}</td>
      <td><select class="cellinp" onchange="UI.editBookItem('${b.id}',${ix},'variantId',this.value)">${vs.map(v2=>`<option value="${v2.id}" ${v&&v.id===v2.id?'selected':''}>${esc(variantLabel(v2))}</option>`).join('')}</select> <input class="cellinp cellpack" placeholder="+ pkg" value="${esc(i.pack||'')}" onchange="UI.editBookItem('${b.id}',${ix},'pack',this.value)">${i.lineNotes?` <small class="mut" title="${esc(i.lineNotes)}">📝</small>`:''}</td>
      <td>${i.qty!==undefined?`<input class="cellinp num" style="width:100%;text-align:right" type="number" min="1" value="${i.qty}" onchange="UI.editBookItem('${b.id}',${ix},'qty',this.value)">`:''}</td>
      <td class="num" style="text-align:right">${i.qty?rp(lineTotal(i)):''}</td>
      ${first?`<td class="num" style="text-align:right;font-weight:700">${rp(total)}${b.declaredTotal&&b.declaredTotal!==total?`<br><small class="neg">⚠ ${rp(b.declaredTotal)}</small>`:''}</td>
      <td><input class="cellinp num" style="width:100%;text-align:right" type="number" min="0" value="${b.shipFee||0}" onchange="UI.editBooking('${b.id}','shipFee',this.value)"></td>
      <td>${fulSel}</td>
      <td><span class="status-pill ${b.status==='paid'||b.status==='fulfilled'||b.status==='shipped'?'ok':b.status==='cancelled'?'bad':'warn'}" onclick="UI.cycleBookStage('${b.id}')">${esc(b.status)}</span></td>
      <td class="cellnotes">${b.source?`<small class="mut" style="display:block;font-size:.68rem">📄 ${esc(b.source)}</small>`:''}<textarea class="cellinp" rows="4" style="resize:vertical;min-height:72px" placeholder="notes…" onchange="UI.editBooking('${b.id}','notes',this.value)">${esc(b.notes||'')}</textarea></td>
      <td style="white-space:nowrap">
        ${b.status==='paid'?`<button class="btn sm" onclick="UI.fulfilBooking('${b.id}')">Fulfil</button>`:''}
        <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('booking','${b.id}')">✕</button></td>`:''}
      </tr>`;}).join('');
    html+=itemRows;
  });
  const pageOf=(i)=>{const p=[];let s=Math.max(1,i-2),e=Math.min(pages,s+4);s=Math.max(1,e-4);
   for(let k=s;k<=e;k++)p.push(`<button class="fbtn ${k===i?'on':''}" style="min-width:34px;justify-content:center" onclick="UI.bookPage=${k};render()">${k}</button>`);return p.join('');};
  html+=`</tbody></table></div>
  <div style="display:flex;align-items:center;gap:14px;padding:12px 6px;flex-wrap:wrap">
   <span class="mut" style="font-size:.85rem">Page</span>
   <span class="num" style="font-weight:700;background:var(--accent);color:#fff;border-radius:8px;padding:4px 10px">${UI.bookPage}</span>
   <span class="mut" style="font-size:.85rem">of ${pages} · ${rows.length} orders</span>
   <span class="mut" style="font-size:.85rem;margin-left:10px">Rows per page</span>
   <select style="width:auto" onchange="UI.bookPerPage=+this.value;UI.bookPage=1;render()">${[10,20,50,100].map(x=>`<option ${x===perPage?'selected':''}>${x}</option>`).join('')}</select>
   <span style="flex:1"></span>
   <button class="fbtn" ${UI.bookPage<=1?'disabled style="opacity:.4"':''} onclick="if(UI.bookPage>1){UI.bookPage--;render()}">‹</button>
   ${pageOf(UI.bookPage)}
   <button class="fbtn" ${UI.bookPage>=pages?'disabled style="opacity:.4"':''} onclick="if(UI.bookPage<${pages}){UI.bookPage++;render()}">›</button>
  </div>`;
  wrap.innerHTML=html;
 },
 editBooking(id,field,val){
  const b=DB.bookings.find(x=>x.id===id);if(!b)return;
  if(field==='shipFee'||field==='declaredTotal')val=+val||0;
  b[field]=val;logAct('UPDATE_BOOKING',field+' → '+String(val).slice(0,40));save();
  // refresh totals cells without full re-render (keeps focus/scroll)
  render();
 },
 editBookItem(id,ix,field,val){
  const b=DB.bookings.find(x=>x.id===id);if(!b||!b.items[ix])return;
  const i=b.items[ix];
  if(field==='qty'){
    val=Math.max(1,+val||1);
    // keep unit price stable: line total scales with qty
    if(i.price!=null&&i.qty)i.price=Math.round(i.price/i.qty*val);
    i.qty=val;
  }
  if(field==='variantId'){
    i.variantId=val;
    delete i.price; // follow new product price (unit) — line total computes from catalog
  }
  logAct('UPDATE_BOOKING','item['+ix+'].'+field+' → '+String(val).slice(0,40));save();render();
 },
 selBooking(id){const s=window.__bookSel;s.has(id)?s.delete(id):s.add(id);render();},
 selAllBookings(on){const s=window.__bookSel;evList(DB.bookings).filter(b=>!UI.bookStage||b.status===UI.bookStage).forEach(b=>on?s.add(b.id):s.delete(b.id));render();},
 renderBookingsOrders(wrap,rows,sel){
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  const OCOLORS=['#94a3b8','#7c8aa0','#8a94a6','#75808f','#9aa5b1','#8494a5'];
  const lineTotal=i=>i.price??(i.qty*(vid2var()[i.variantId]?priceOf(vid2var()[i.variantId]):0));
  const waLink=c=>{const d=String(c||'').replace(/\D/g,'');if(!d)return'';return 'https://wa.me/'+(d.startsWith('62')?d:'62'+d.replace(/^0/,''));};
  const collapsed=window.__ordCollapsed=window.__ordCollapsed||new Set();
  wrap.innerHTML=`<div class="ordwrap">${rows.map((b,bi)=>{
    const oc=OCOLORS[bi%OCOLORS.length];
    const total=(b.items||[]).reduce((s,i)=>s+lineTotal(i),0)+(b.shipFee||0);
    const open=!collapsed.has(b.id);
    const stCls=b.status==='paid'||b.status==='fulfilled'||b.status==='shipped'?'ok':b.status==='cancelled'?'bad':'warn';
    const packs=[...new Set((b.items||[]).map(i=>i.pack).filter(Boolean))];
    const notes=[...(b.items||[]).map(i=>i.lineNotes).filter(Boolean),...(b.notes?[b.notes]:[])].slice(0,3);
    return `
    <div class="ordhead ${open?'open':''}" style="--oc:${oc}" onclick="UI.toggleOrder('${b.id}')">
      <span onclick="event.stopPropagation()"><label class="custom-checkbox"><input type="checkbox" class="checkbox-input" ${sel.has(b.id)?'checked':''} onchange="UI.selBooking('${b.id}')"><span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></label></span>
      <span class="onum">#${bi+1}</span>
      <span><input class="cellinp" style="font-weight:800;font-size:.95rem;margin-bottom:3px" value="${esc(b.customer||'')}" onchange="UI.editBooking('${b.id}','customer',this.value)" onclick="event.stopPropagation()"><span class="ordbadge dim" onclick="event.stopPropagation();UI.editOrderLabel('${b.id}')">🏷 ${esc(b.label||'')}</span><span class="status-pill ${stCls}" style="margin-top:4px;font-size:.68rem;padding:3px 10px;min-width:0" onclick="event.stopPropagation();UI.cycleBookStage('${b.id}')">${esc(b.status)}</span></span>
      <span>${b.contact?`<a class="wa" href="${waLink(b.contact)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬 ${esc(b.contact)}</a>`:'<span class="mut" style="font-size:.78rem">no contact</span>'}</span>
      <span class="addr">📍 ${esc(b.address||(b.fulfil==='pickup'?'pickup':'—'))}</span>
      <span class="meta">
        <span class="ordbadges">${packs.slice(0,2).map(p=>`<span class="ordbadge">📦 ${esc(p)}</span>`).join('')}${b.shipFee?`<span class="ordbadge dim">🚚 ${rp(b.shipFee)}</span>`:''}${b.fulfil==='pickup'?'<span class="ordbadge dim">pickup</span>':''}</span>
        ${notes.length?`<span style="font-size:.72rem;color:var(--muted)">📝 ${esc(notes.join(' · ').slice(0,80))}</span>`:''}
      </span>
      <span class="mut" style="font-family:var(--mono);font-size:.75rem;font-weight:700;text-align:center">${(b.items||[]).reduce((s,i)=>s+(i.qty||0),0)} pcs</span>
      <span class="tot">${rp(total)}${b.declaredTotal&&b.declaredTotal!==total?' ⚠':''}</span>
      <span class="chev">⌄</span>
    </div>
    <div class="orditems ${open?'':'hidden'}">
      ${(b.items||[]).map((i,ix)=>{const v=vid2var()[i.variantId];
      return `<div class="orditem" style="--oc:${oc}">
        <span class="inum">${bi+1}.${ix+1}</span>
        <span><select class="cellinp" onchange="UI.editBookItem('${b.id}',${ix},'variantId',this.value)">${vs.map(v2=>`<option value="${v2.id}" ${v&&v.id===v2.id?'selected':''}>${esc(variantLabel(v2))}</option>`).join('')}</select> <input class="cellinp" style="width:110px;display:inline-block;font-size:.75rem" placeholder="+ packaging" value="${esc(i.pack||'')}" onchange="UI.editBookItem('${b.id}',${ix},'pack',this.value)" onclick="event.stopPropagation()">${i.lineNotes?` <small class="mut">📝 ${esc(i.lineNotes)}</small>`:''}</span>
        <span class="mut" style="font-size:.78rem">${b.source?'📄 '+esc(b.source.split(' · ')[1]||''):'<span class="chip">${esc(b.status)}</span>'}</span>
        <span style="text-align:center"><span class="qty-stepper"><button class="qty-btn" onclick="UI.stepQty('${b.id}',${ix},-1)">−</button><input class="qty-input-field" type="number" min="1" value="${i.qty??1}" onchange="UI.editBookItem('${b.id}',${ix},'qty',this.value)"><button class="qty-btn" onclick="UI.stepQty('${b.id}',${ix},1)">+</button></span></span>
        <span class="num" style="text-align:right;font-weight:600">${rp(lineTotal(i))}</span>
        <span><button class="btn sm ghost" style="color:var(--danger)" onclick="UI.delBookingItem('${b.id}',${ix})">✕</button></span>
      </div>`;}).join('')}
      ${b.source?`<div class="ordend">order source: ${esc(b.source)}</div>`:''}
    </div>`;}).join('')}</div>`;
 },
 toggleOrder(id){const c=window.__ordCollapsed=window.__ordCollapsed||new Set();c.has(id)?c.delete(id):c.add(id);render();},
 stepQty(id,ix,d){const b=DB.bookings.find(x=>x.id===id);if(!b||!b.items[ix])return;const i=b.items[ix];this.editBookItem(id,ix,'qty',(i.qty||1)+d);},
 delBookingItem(id,ix){const b=DB.bookings.find(x=>x.id===id);if(!b)return;if(!confirm('Remove this item line?'))return;b.items.splice(ix,1);logAct('UPDATE_BOOKING','item['+ix+'] removed');save();render();},
 bulkDeleteBookings(){
  const s=window.__bookSel;if(!s.size)return;
  if(!confirm('Delete '+s.size+' booking(s)? This cannot be undone.'))return;
  DB.bookings=DB.bookings.filter(b=>!s.has(b.id));
  logAct('DELETE_BOOKING','bulk delete '+s.size+' bookings');s.clear();save();render();
 },
 setBookStage(id,st){const b=DB.bookings.find(x=>x.id===id);if(!b)return;b.status=st;logAct('UPDATE_BOOKING','status → '+st);save();render();},
 editOrderLabel(id){const b=DB.bookings.find(x=>x.id===id);if(!b)return;
  const v=prompt('Order label (e.g. "dus besar batch", "staff order", customer nickname):',b.label||'');
  if(v===null)return;b.label=v.trim();logAct('UPDATE_BOOKING','label → '+b.label);save();render();},
 cycleBookStage(id){const b=DB.bookings.find(x=>x.id===id);if(!b)return;
  const next=PAYSTAGES[(PAYSTAGES.indexOf(b.status)+1)%PAYSTAGES.length];
  b.status=next;logAct('UPDATE_BOOKING','status → '+next);save();render();},
 fulfilBooking(id){ // converts demand → stock movement: writes PO sale records
  const b=DB.bookings.find(x=>x.id===id); if(!b)return;
  (b.items||[]).forEach(i=>{const v=vid2var()[i.variantId];if(!v)return;
    const unit=i.price!=null?(i.qty?i.price/i.qty:i.price):priceOf(v);
    DB.sales.push({id:uid(),eventId:b.eventId,variantId:i.variantId,channel:'PO',qty:i.qty,price:unit,ts:nowISO(),bookingId:b.id,createdBy:null});});
  b.status='fulfilled'; logAct('FULFIL_BOOKING',(b.customer||'')+' — '+(b.items||[]).length+' lines → SaleRecords'); save(); render();
 },

 /* ---- sales ---- */
 renderSales(){
  const s=evSummary();
  document.getElementById('salesStats').innerHTML=`
   <div class="stat"><div class="k">Revenue</div><div class="v num">${rp(s.revenue)}</div></div>
   <div class="stat"><div class="k">Gross profit</div><div class="v num pos">${rp(s.profit+s.expenses)}</div><div class="d">before expenses</div></div>
   <div class="stat"><div class="k">Expenses</div><div class="v num neg">${rp(s.expenses)}</div></div>
   <div class="stat"><div class="k">Net</div><div class="v num ${s.profit>=0?'pos':'neg'}">${rp(s.profit)}</div></div>`;
  const byC={}; evList(DB.sales).forEach(r=>{byC[r.channel]=byC[r.channel]||{q:0,rev:0,pr:0};const v=vid2var()[r.variantId];byC[r.channel].q+=r.qty;byC[r.channel].rev+=r.qty*r.price;byC[r.channel].pr+=r.qty*(r.price-costOf(v||{}));});
  const byI={}; evList(DB.sales).forEach(r=>{const v=vid2var()[r.variantId];if(!v)return;const k=variantLabel(v);byI[k]=byI[k]||{q:0,rev:0,pr:0};byI[k].q+=r.qty;byI[k].rev+=r.qty*r.price;byI[k].pr+=r.qty*(r.price-costOf(v));});
  const tbl=o=>`<table><thead><tr><th></th><th style="text-align:right">Qty</th><th style="text-align:right">Revenue</th><th style="text-align:right">Profit</th></tr></thead><tbody>${
   Object.entries(o).map(([k,x])=>`<tr><td>${esc(k)}</td><td class="num" style="text-align:right">${x.q}</td><td class="num" style="text-align:right">${rp(x.rev)}</td><td class="num ${x.pr>=0?'pos':'neg'}" style="text-align:right">${rp(x.pr)}</td></tr>`).join('')||'<tr><td colspan=4 class="empty">No sales yet.</td></tr>'}</tbody></table>`;
  document.getElementById('salesByChan').innerHTML=tbl(byC);
  document.getElementById('salesByItem').innerHTML=tbl(Object.fromEntries(Object.entries(byI).sort((a,b)=>b[1].pr-a[1].pr).slice(0,10)));
  document.getElementById('salesTable').innerHTML=`<thead><tr><th>When</th><th>Item</th><th>Channel</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Profit</th></tr></thead><tbody>${
   evList(DB.sales).slice().sort((a,b)=>(b.ts||'').localeCompare(a.ts||'')).slice(0,80).map(r=>{const v=vid2var()[r.variantId];
   return `<tr><td class="mut">${fmtDT(r.ts)}</td><td>${esc(v?variantLabel(v):'?')}</td><td><span class="chip acc">${esc(r.channel)}</span></td><td class="num" style="text-align:right">${r.qty}</td><td class="num" style="text-align:right">${rp(r.price)}</td><td class="num ${r.qty*(r.price-costOf(v||{}))>=0?'pos':'neg'}" style="text-align:right">${rp(r.qty*(r.price-costOf(v||{})))}</td></tr>`;}).join('')||'<tr><td colspan=6 class="empty">No sale records. Tally in Event Mode or add one manually.</td></tr>'}</tbody>`;
 },

 /* ---- todo ---- */
 renderTodo(){
  const rows=evList(DB.todos).sort((a,b)=>(a.done?1:0)-(b.done?1:0)||(a.due||'zz').localeCompare(b.due||'zz'));
  const wrap=document.getElementById('todoList');
  if(!rows.length){wrap.innerHTML=`<div class="card empty"><div class="big">☑</div>No tasks yet — add the first one.</div>`;return;}
  wrap.innerHTML=`<div class="card">${rows.map(t=>`
   <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border)">
     <label class="custom-checkbox"><input type="checkbox" class="checkbox-input" ${t.done?'checked':''} onchange="UI.toggleTodo('${t.id}')"><span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></label>
     <div style="flex:1"><div style="${t.done?'text-decoration:line-through;color:var(--muted)':''}">${esc(t.title)}</div>
     <div class="mut" style="font-size:.8rem">${t.due?'due '+t.due:''} ${t.assignee?'· '+esc(t.assignee):''} ${t.notes?'· '+esc(t.notes):''}</div></div>
     <button class="btn sm ghost" onclick="UI.openTodo('${t.id}')">Edit</button>
     <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('todo','${t.id}')">✕</button>
   </div>`).join('')}</div>`;
 },
 toggleTodo(id){const t=DB.todos.find(x=>x.id===id);t.done=!t.done;save();render();},

 /* ---- calculator ---- */
 renderCalc(){
  const c=UI.calc;
  document.getElementById('calcLines').innerHTML=c.lines.map((l,i)=>`
   <div style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px">
     <div class="row"><div style="flex:2"><label>Label</label><input value="${esc(l.label)}" oninput="UI.calc.lines[${i}].label=this.value;UI.calcOut()"></div>
     <div><label>Qty</label><input type="number" min="0" value="${l.qty}" oninput="UI.calc.lines[${i}].qty=+this.value;UI.calcOut()"></div></div>
     <div class="row" style="margin-top:8px"><div style="flex:2"><label>Tiers (qty:price, comma-sep)</label><input value="${l.tier.map(t=>t[0]+':'+t[1]).join(', ')}" oninput="UI.setTier(${i},this.value)"></div>
     <div><label>Pack/pc</label><input type="number" min="0" value="${l.pack}" oninput="UI.calc.lines[${i}].pack=+this.value;UI.calcOut()"></div>
     <div class="w0"><button class="btn sm ghost" style="color:var(--danger)" onclick="UI.calc.lines.splice(${i},1);renderCalc()">✕</button></div></div>
   </div>`).join('');
  document.getElementById('calcAttach').innerHTML=DB.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  UI.calcOut();
 },
 setTier(i,s){UI.calc.lines[i].tier=s.split(',').map(x=>{const[a,b]=x.split(':');return[+a||0,+b||0];}).filter(t=>t[0]);UI.calcOut();},
 calcOut(){
  let unit=0,pack=0;const rows=UI.calc.lines.map(l=>{
    const tier=l.tier.filter(t=>l.qty>=t[0]).sort((a,b)=>b[0]-a[0])[0];
    const pc=tier?tier[1]:(l.tier[0]?l.tier[0][1]:0); unit+=pc;pack+=l.pack||0;
    return`<tr><td>${esc(l.label||'—')}</td><td class="num">${l.qty}</td><td class="num">${rp(pc)}</td><td class="num">${rp(pc*l.qty)}</td></tr>`;});
  const total=unit*1+pack*1; // per-unit totals; grand total below
  const grand=(unit+pack)*Math.max(1,UI.calc.lines.reduce((m,l)=>Math.max(m,l.qty),0));
  document.getElementById('calcResult').innerHTML=`<table><thead><tr><th>Line</th><th>Qty</th><th>Unit</th><th>Line total</th></tr></thead><tbody>${rows.join('')}</tbody></table>
   <div class="grid g4" style="margin-top:12px"><div class="stat"><div class="k">Base unit cost</div><div class="v num">${rp(unit)}</div></div>
   <div class="stat"><div class="k">Packaging</div><div class="v num">${rp(pack)}</div></div>
   <div class="stat"><div class="k">All-in unit</div><div class="v num">${rp(unit+pack)}</div></div>
   <div class="stat"><div class="k">Grand total</div><div class="v num">${rp(grand)}</div></div></div>`;
 },
 attachCalc(){
  const p=DB.products.find(x=>x.id===document.getElementById('calcAttach').value); if(!p)return;
  let unit=0,pack=0;UI.calc.lines.forEach(l=>{const t=l.tier.filter(t=>l.qty>=t[0]).sort((a,b)=>b[0]-a[0])[0];unit+=t?t[1]:0;pack+=l.pack||0;});
  p.unitCost=unit;p.packCost=pack;logAct('ATTACH_COST','calculator → '+p.name+' (unit '+unit+' + pack '+pack+')');
  toast('Attached to '+p.name); save();
 },

 /* ---- sync ---- */
 renderSync(){
  const ea=document.getElementById('eventAdmin');
  ea.innerHTML=DB.events.map(e=>`<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
   <span style="flex:1"><b>${esc(e.name)}</b> <span class="chip ${e.id===DB.activeEvent?'acc':''}">${e.id===DB.activeEvent?'active':e.archived?'archived':'past'}</span></span>
   ${e.id!==DB.activeEvent?`<button class="btn sm ghost" onclick="UI.switchEvent('${e.id}')">Switch</button>`:''}
   ${!e.archived?`<button class="btn sm ghost" onclick="UI.archiveEvent('${e.id}')">Archive</button>`:''}</div>`).join('')
   +`<div style="margin-top:10px"><button class="btn ghost sm" onclick="UI.openNewEvent()">+ New event</button></div>`;
  document.getElementById('logTable').innerHTML=`<thead><tr><th>When</th><th>Action</th><th>Details</th><th>Entities</th><th>Outcome</th></tr></thead><tbody>${
   DB.log.slice(0,120).map(l=>`<tr><td class="mut" style="white-space:nowrap">${fmtDT(l.ts)}</td><td><span class="chip acc">${esc(l.type)}</span></td><td>${esc(l.detail)}</td><td class="mut" style="font-size:.78rem">${Object.entries(l.counts||{}).map(([k,v])=>k+':'+v).join(' · ')}</td><td>${l.outcome==='ok'?'<span class="chip ok">ok</span>':'<span class="chip bad">'+esc(l.outcome)+'</span>'}</td></tr>`).join('')||'<tr><td colspan=5 class="empty">No entries.</td></tr>'}</tbody>`;
 },
 exportDB(){
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  const name=`evprod-backup-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
  logAct('EXPORT_DATABASE',name);toast('Exported '+name);render();
 },
 pickFile(mode){ // mode: 'db' | 'bookings'
  const f=document.getElementById('filePick');f.onchange=()=>{const file=f.files[0];f.value='';if(!file)return;
    const r=new FileReader();r.onload=()=>{try{mode==='db'?UI.readDBImport(JSON.parse(r.result),file.name):UI.readBookingImport(r.result,file.name);}catch(e){toast('Could not parse file: '+e.message);}};
    if(mode==='db'||/\.(json|csv|txt)$/.test(file.name.toLowerCase()))r.readAsText(file);else r.readAsArrayBuffer(file);};
  f.click();
 },
 readDBImport(data,fname){
  if(!data||typeof data!=='object'||!('schema' in data)){toast('Not an EV-Prod export.');return;}
  const counts=k=>(data[k]||[]).length;
  const diff=Object.entries({events:'events',products:'products',variants:'variants',vendors:'vendors',lots:'lots',sales:'sales',pools:'pools',bookings:'bookings',todos:'todos',expenses:'expenses'})
   .map(([k])=>`<tr><td>${k}</td><td class="num">${DB[k].length}</td><td class="num">${counts(k)}</td><td class="num">${counts(k)-DB[k].length>=0?'+':''}${counts(k)-DB[k].length}</td></tr>`).join('');
  // auto-backup first
  const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='evprod-backup-PRE-IMPORT.json';a.click();
  openModal(`<h2>Import preview — ${esc(fname)}</h2>
   <p class="sub" style="margin-bottom:10px">A pre-import backup was auto-downloaded. Default is <b>merge/append</b> — nothing is dropped.</p>
   <div class="twrap"><table><thead><tr><th>Entity</th><th>Current</th><th>File</th><th>Δ</th></tr></thead><tbody>${diff}</tbody></table></div>
   <div class="actions">
     <button class="btn ghost" onclick="closeModal()">Cancel</button>
     <button class="btn" onclick="UI.doMerge(window.__imp)">Merge / append</button>
     <button class="btn danger" onclick="UI.askReplace()">Replace all…</button>
   </div>`);
  window.__imp=data;
 },
 doMerge(data){
  let added=0;for(const k of['events','products','variants','vendors','lots','sales','pools','bookings','todos','expenses','log']){
    const have=new Set(DB[k].map(x=>x.id||JSON.stringify(x).slice(0,60)));
    (data[k]||[]).forEach(x=>{const key=x.id||JSON.stringify(x).slice(0,60);if(!have.has(key)){DB[k].push(x);added++;}});}
  logAct('IMPORT_DATABASE','merged '+added+' records from file');closeModal();toast('Merged '+added+' records');render();
 },
 askReplace(){
  openModal(`<h2>Full replace — are you sure?</h2><p class="sub">This wipes the current database and replaces it with the file. Current data was backed up (downloaded just now).</p>
   <div style="margin-top:12px"><label>Type REPLACE to confirm</label><input id="replConfirm" autocomplete="off"></div>
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button>
   <button class="btn danger" onclick="UI.doReplace()">Replace</button></div>`);
 },
 doReplace(){
  if(document.getElementById('replConfirm').value.trim()!=='REPLACE'){toast('Type REPLACE exactly to confirm.');return;}
  const data=window.__imp;const fresh=freshDB();for(const k of Object.keys(fresh))if(data[k]!==undefined)fresh[k]=data[k];
  DB=fresh;logAct('IMPORT_DATABASE','FULL REPLACE — '+Object.values(DB).filter(Array.isArray).reduce((s,a)=>s+a.length,0)+' records');closeModal();toast('Database replaced');render();
 },
 restoreBackup(){
  openModal(`<h2>Restore last backup</h2><p class="sub">Pick the auto-downloaded pre-import backup (or any export JSON).</p>
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.pickFile('db')">Choose JSON…</button></div>`);
 },
 readBookingImport(raw,fname){
  let rows=[];
  try{
    if(fname.toLowerCase().endsWith('.csv')){rows=parseCSV(raw);}
    else{const wb=XLSX.read(raw,{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});}
  }catch(e){toast('Parse failed: '+e.message);return;}
  if(!rows.length){toast('No rows found.');return;}
  const cols=Object.keys(rows[0]);
  const guess=k=>cols.find(c=>c.toLowerCase().includes(k));
  const cName=guess('nama')||guess('name')||cols[0], cContact=guess('kontak')||guess('contact')||guess('wa')||guess('whatsapp')||guess('email');
  const cItem=guess('merch')||guess('item')||guess('produk'), cQty=guess('jumlah')||guess('qty')||guess('quantity');
  const cAddr=guess('alamat')||guess('address'), cPay=guess('status')||guess('pembayaran');
  const cOrder=guess('pesanan')||guess('order'), cPack=guess('packag'), cNotes=guess('keterangan')||guess('ket')||guess('note'), cPrice=guess('harga')&&!guess('total')?guess('harga'):(guess('harga')||'');
  openModal(`<h2>Map columns — ${esc(fname)}</h2><p class="sub">${rows.length} rows detected. Orders with the same ${cOrder?'<b>'+esc(cOrder)+'</b> (order no.)':'customer'} are grouped automatically; shipping lines (JNE/GoSend) become the shipping fee; declared-total rows are used for validation.</p>
   ${[['Customer',cName],['Contact',cContact],['Item name',cItem],['Qty',cQty],['Unit price',cPrice],['Address',cAddr],['Payment status',cPay],['Order no.',cOrder],['Packaging',cPack],['Notes',cNotes]].map(([l,v])=>
   `<div style="margin-bottom:10px"><label>${l}</label><select id="mc_${l.replace(' ','')}"><option value="">— skip —</option>${cols.map(c=>`<option ${c===v?'selected':''}>${esc(c)}</option>`).join('')}</select></div>`).join('')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.mapBookingDone('${esc(fname)}')">Preview matches</button></div>`);
  window.__bookRows=rows;
 },
 mapBookingDone(fname){
  const g=id=>document.getElementById('mc_'+id)?.value;
  // snapshot resolved column names NOW (mapping modal still in DOM) — commitBookings needs them after modal is replaced
  window.__mapCols={Customer:g('Customer'),Contact:g('Contact'),Itemname:g('Itemname'),Qty:g('Qty'),Unitprice:g('Unitprice'),Address:g('Address'),Paymentstatus:g('Paymentstatus'),'Order no.':g('Orderno.'),Packaging:g('Packaging'),Notes:g('Notes'),Totalharga:g('Totalharga')};
  const rows=window.__bookRows;
  const SHIP_RE=/^(jne|gosend|jnt|sicepat|anteraja|shipping|ongkir|pos)/i;
  const money=s=>{s=String(s||'');if(/\.\d{2}\s*$/.test(s))s=s.slice(0,-3);const m=s.replace(/[^\d]/g,'');return m?+m:0;};
  const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
  // group rows into orders
  const orders=[];let cur=null;
  rows.forEach((r,i)=>{
    const item=String(r[g('Itemname')]||'').trim();
    const ordNo=String(r[g('Orderno.')]||'').trim();
    const cust=String(r[g('Customer')]||'').trim();
    if(ordNo||cust){cur={rows:[],cust,ordNo};orders.push(cur);}
    if(!cur||!item)return;
    cur.rows.push({r,i,item});
  });
  const aliases=DB.aliases=DB.aliases||{}; // aliasMap: normalized sheet name -> variantId (remembered across imports)
  const variants=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  const isStaffName=c=>/staff/i.test(c||'');
  let autoMatched=0,aliasMatched=0,created=0,flagged=0,shipTotal=0;
  const flagQueue=[];
  const resolveItem=(x,cust)=>{
    const n=norm(x.item);
    // 1. remembered alias
    if(aliases[n]){const v=vid2var()[aliases[n]];if(v){aliasMatched++;return{vid:aliases[n],how:'alias'};}}
    // 2. exact normalized match (product+talent label or product name)
    let exact=variants.find(v=>{const p=pid2prod()[v.productId];return norm(p.name+' '+(v.talent||''))===n||norm(p.name)===n;});
    if(exact){autoMatched++;aliases[n]=exact.id;return{vid:exact.id,how:'exact'};}
    // 3. fuzzy product-level match — talent variant only if talent name present in sheet name
    let best=null,bestScore=0;
    variants.forEach(v=>{const p=pid2prod()[v.productId];const pn=norm(p.name);
      let sc=0;
      if(pn===n)sc=1;
      else if(pn.length>5&&(pn.includes(n)||n.includes(pn)))sc=.95;
      else{const toks=n.split(/\s+/).filter(t=>t.length>3);if(toks.length){const hit=toks.filter(t=>pn.includes(t)).length;sc=toks.length?hit/toks.length*.85:0;}}
      if(sc>bestScore){bestScore=sc;best=v;}});
    if(best&&bestScore>=.9){const p=pid2prod()[best.productId];
      if(best.talent&&!norm(x.item).includes(norm(best.talent)))best=null; // never guess talent variant w/o talent name
      else{autoMatched++;return{vid:best.id,how:'fuzzy'+Math.round(bestScore*100)+'%'};}}
    // 4. low-confidence guess (≥.75) → flag for review queue, still map provisionally
    if(best&&bestScore>=.75){flagged++;flagQueue.push({alias:x.item,variantId:best.id,score:bestScore,order:o_idx,cust});
      return{vid:best.id,how:'guess'+Math.round(bestScore*100)+'%'};}
    return null;
  };
  let o_idx=0;
  orders.forEach((o,oi)=>{o_idx=oi;
    let ship=0;const items=[];
    o.rows.forEach(x=>{
      const price=money(x.r[g('Unitprice')]);
      if(SHIP_RE.test(x.item)){ship+=price;return;}
      const qty=+String(x.r[g('Qty')]||'1').replace(/\D/g,'')||1;
      const res=resolveItem(x,o.cust);
      let vid=res?res.vid:null,how=res?res.how:null;
      if(!vid){ // auto-create product+variant from sheet data
        const np={id:uid(),eventId:DB.activeEvent,name:x.item,vendorId:null,cats:['PO'],unitCost:0,packCost:0,price:price||0,artStatus:'',prodStatus:'',pic:'',notes:'created by booking import — needs cost & vendor',created:nowISO()};
        DB.products.push(np);const nv={id:uid(),productId:np.id,talent:null,unitCostOverride:null,priceOverride:null,notes:'',created:nowISO()};
        DB.variants.push(nv);variants.push(nv);vid=nv.id;how='created';created++;
        aliases[norm(x.item)]=nv.id; // remember: this sheet name now owns this item
        logAct('CREATE_ITEM','import auto-create: '+x.item);}
      items.push({variantId:vid,qty,price:price||undefined,pack:String(x.r[g('Packaging')]||'')||undefined,lineNotes:String(x.r[g('Notes')]||'')||undefined,_how:how,_sheetName:x.item});
    });
    // declared total check
    const totCol=g('Totalharga');
    let declaredTotal=0;o.rows.forEach(x=>{const t=money(x.r[totCol||'TOTAL HARGA']);if(t>declaredTotal)declaredTotal=t;});
    const calc=items.reduce((s,x)=>s+(x.price||0),0)+ship;
    o._parsed={items,ship,declaredTotal,calc,staff:isStaffName(o.cust),mismatch:declaredTotal&&declaredTotal!==calc};
    shipTotal+=ship;
  });
  window.__importResult={orders,created,autoMatched,aliasMatched,flagged,fname};
  // single summary confirm — counts + mismatches only
  const mismatches=orders.filter(o=>o._parsed.mismatch);
  openModal(`<h2>Import summary — ${esc(fname)}</h2>
   <div class="grid g4" style="margin:12px 0">
    <div class="stat"><div class="k">Orders</div><div class="v">${orders.length}</div></div>
    <div class="stat"><div class="k">Lines matched</div><div class="v">${autoMatched+aliasMatched}</div><div class="d">${aliasMatched} via saved aliases</div></div>
    <div class="stat"><div class="k">New items created</div><div class="v">${created}</div><div class="d">from sheet, needs cost/vendor</div></div>
    <div class="stat"><div class="k">Provisional guesses</div><div class="v ${flagged?'neg':''}">${flagged}</div><div class="d">in review queue</div></div>
   </div>
   ${mismatches.length?`<div class="card" style="margin-bottom:10px"><h2>⚠ Total mismatches (${mismatches.length})</h2>${mismatches.slice(0,8).map(o=>`<div style="font-size:.85rem;padding:2px 0"><b>#${esc(o.ordNo||'?')} ${esc(o.cust)}</b> — calc <span class="num">${rp(o._parsed.calc)}</span> vs sheet <span class="num">${rp(o._parsed.declaredTotal)}</span></div>`).join('')}${mismatches.length>8?`<small class="mut">…${mismatches.length-8} more</small>`:''}</div>`
   :`<p class="sub" style="margin-bottom:10px">All order totals match the sheet. ✓</p>`}
   <p class="sub">Staff-prefixed customers get channel Staff on fulfil. Mismatched totals are imported as-is — fix later if real.</p>
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.commitBookings('${esc(fname)}')">Import ${orders.length} orders</button></div>`);
 },
 commitBookings(fname){
  const orders=window.__importResult.orders;
  let n=0;
  orders.forEach(o=>{
    const p=o._parsed;if(!p)return;
    if(!p.items.length&&!p.ship)return;
    const r0=window.__bookRows[o.rows[0]?.i]||{};
    const MC=window.__mapCols||{};
    const addr=String(r0[MC.Address]||'').trim();
    const statusRaw=String(r0[MC.Paymentstatus]||'pending').toLowerCase();
    const status=statusRaw.includes('cancel')?'cancelled':statusRaw.includes('invoice')?'paid':'pending';
    DB.bookings.push({id:uid(),eventId:DB.activeEvent,customer:o.cust||'(unnamed)',contact:String(r0[MC.Contact]||''),
      items:p.items.map(x=>({variantId:x.variantId,qty:x.qty,price:x.price,pack:x.pack,lineNotes:x.lineNotes,channel:p.staff?'Staff':'PO'})),
      status,fulfil:addr&&!/pickup/i.test(addr)?'mail':'pickup',address:addr,shipFee:p.ship,
      declaredTotal:p.declaredTotal||undefined,notes:'',label:(o.cust||'').slice(0,40),source:'order #'+(o.ordNo||'?')+' · '+fname,created:nowISO()});
    n++;});
  logAct('IMPORT_BOOKINGS',n+' orders imported (v2 auto-create) from '+fname);
  closeModal();save();render();
  toast('Imported '+n+' orders — '+(window.__importResult.flagged?window.__importResult.flagged+' lines in review queue':'all lines matched'));
 },
 openImport(){UI.pickFile('bookings');},

 /* ---- events ---- */
 switchEvent(id){DB.activeEvent=id;logAct('SWITCH_EVENT','→ '+DB.events.find(e=>e.id===id)?.name);save();render();toast('Switched event');},
 archiveEvent(id){const e=DB.events.find(x=>x.id===id);if(confirm('Archive "'+e.name+'"? Past events become read-only archives.')){e.archived=true;logAct('ARCHIVE_EVENT',e.name);save();render();}},
 openNewEvent(){openModal(`<h2>New event</h2>${fld('Event name','<input id="neName" placeholder="CF-23">')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.createEvent()">Create</button></div>`);},
 createEvent(){
  const name=document.getElementById('neName').value.trim();if(!name){toast('Name required');return;}
  const e={id:uid(),name,status:'active',created:nowISO(),playPrice:25000,archived:false};
  DB.events.push(e);DB.activeEvent=e.id;logAct('CREATE_EVENT',name);closeModal();toast('Created '+name+' (empty — clone products from Items)');render();
 },
 cloneProduct(pid){
  const target=DB.events.filter(e=>!e.archived);
  openModal(`<h2>Clone product into event</h2><p class="sub">Carries cost/vendor/settings; stock resets. Variants come along.</p>
   ${fld('Target event',`<select id="cpEv">${target.map(e=>`<option value="${e.id}" ${e.id!==DB.activeEvent?'':''}>${esc(e.name)}</option>`).join('')}</select>`)}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.doCloneProduct('${pid}')">Clone</button></div>`);
 },
 doCloneProduct(pid){
  const tev=document.getElementById('cpEv').value;const p=DB.products.find(x=>x.id===pid);if(!p)return;
  const np={...JSON.parse(JSON.stringify(p)),id:uid(),eventId:tev,created:nowISO()};
  DB.products.push(np);
  DB.variants.filter(v=>v.productId===pid).forEach(v=>DB.variants.push({...JSON.parse(JSON.stringify(v)),id:uid(),productId:np.id,created:nowISO()}));
  logAct('CLONE_PRODUCT',p.name+' → event');closeModal();toast('Cloned');render();
 },
 cloneVariant(vid){const v=vid2var()[vid];if(!v)return;
  DB.variants.push({...JSON.parse(JSON.stringify(v)),id:uid(),created:nowISO()});logAct('CLONE_VARIANT',variantLabel(v));toast('Variant cloned');render();},

 /* ---- generic delete ---- */
 del(kind,id){
  const names={product:'product (and its variants)',vendor:'vendor',pool:'gacha pool',booking:'booking',todo:'task',lot:'stock lot'};
  if(!confirm('Delete this '+names[kind]+'?'))return;
  if(kind==='product'){DB.variants=DB.variants.filter(v=>v.productId!==id);DB.products=DB.products.filter(x=>x.id!==id);}
  if(kind==='vendor')DB.vendors=DB.vendors.filter(x=>x.id!==id);
  if(kind==='pool')DB.pools=DB.pools.filter(x=>x.id!==id);
  if(kind==='booking')DB.bookings=DB.bookings.filter(x=>x.id!==id);
  if(kind==='todo')DB.todos=DB.todos.filter(x=>x.id!==id);
  if(kind==='lot')DB.lots=DB.lots.filter(x=>x.id!==id);
  logAct('DELETE_'+kind.toUpperCase(),'id '+id);save();render();
 },

 /* ---- modals: product / variant / vendor / lot / todo / booking / sale / pool ---- */
 opt(sel,val){return sel===val?'selected':'';},
 newVendorInline(){
  const prev=document.getElementById('f_vendor')?.value;
  window.__vendorCB=(newId)=>{ // reopen product modal with new vendor selected (form values restored from draft)
    UI.openProduct();document.getElementById('f_vendor').value=newId;
    ['f_name','f_unit','f_pack','f_price','f_pic','f_notes'].forEach(i=>{const el=document.getElementById(i);const d=window.__prodDraft?.[i];if(el&&d!==undefined)el.value=d;});
    (window.__prodDraft?.cats||[]).forEach(c=>{const el=document.querySelector(`.f_cat[value="${c}"]`);if(el)el.checked=true;});
    ['f_art','f_prod'].forEach(i=>{const el=document.getElementById(i);const d=window.__prodDraft?.[i];if(el&&d)el.value=d;});
  };
  const g=i=>document.getElementById(i)?.value;
  window.__prodDraft={f_name:g('f_name'),f_unit:g('f_unit'),f_pack:g('f_pack'),f_price:g('f_price'),f_pic:g('f_pic'),f_notes:g('f_notes'),f_art:g('f_art'),f_prod:g('f_prod'),cats:[...document.querySelectorAll('.f_cat:checked')].map(x=>x.value)};
  UI.openVendor();
 },
 openProduct(id){
  const p=DB.products.find(x=>x.id===id)||{name:'',vendorId:'',cats:[],unitCost:0,packCost:0,price:0,artStatus:'Art ready',prodStatus:'Production test',pic:'',notes:''};
  openModal(`<h2>${id?'Edit':'New'} product</h2>
   ${fld('Name','<input id="f_name" value="'+esc(p.name)+'">')}
   ${fld('Vendor',`<div style="display:flex;gap:6px"><select id="f_vendor" style="flex:1"><option value="">— none —</option>${DB.vendors.map(v=>`<option value="${v.id}" ${UI.opt(v.id,p.vendorId)}>${esc(v.name)}</option>`).join('')}</select><button type="button" class="btn ghost w0" onclick="UI.newVendorInline()">+ New</button></div>`)}
   ${fld('Categories (multi)',`<div style="display:flex;gap:14px;flex-wrap:wrap;padding:4px 0">${CATS.map(c=>`<label class="custom-checkbox"><input type="checkbox" class="checkbox-input f_cat" value="${c}" ${p.cats.includes(c)?'checked':''}><span class="checkbox-box"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span><span class="checkbox-text">${c}</span></label>`).join('')}</div>`)}
   <div class="row">
    <div><label>Unit cost (Rp)</label><input id="f_unit" type="number" min="0" value="${p.unitCost}"></div>
    <div><label>Packaging/pc</label><input id="f_pack" type="number" min="0" value="${p.packCost}"></div>
    <div><label>Sell price</label><input id="f_price" type="number" min="0" value="${p.price}"></div></div>
   <div class="row" style="margin-top:10px">
    <div><label>Art status</label><select id="f_art">${['Art ready','Commission in progress','Not commissioned'].map(s=>`<option ${UI.opt(s,p.artStatus)}>${s}</option>`).join('')}</select></div>
    <div><label>Production status</label><select id="f_prod">${['Production test','In production'].map(s=>`<option ${UI.opt(s,p.prodStatus)}>${s}</option>`).join('')}</select></div>
    <div><label>Artist / PIC</label><input id="f_pic" value="${esc(p.pic)}"></div></div>
   ${fld('Notes','<textarea id="f_notes" rows="2">'+esc(p.notes)+'</textarea>')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveProduct('${id||''}')">Save</button></div>`);
 },
 saveProduct(id){
  const g=i=>document.getElementById(i).value;
  const cats=[...document.querySelectorAll('.f_cat:checked')].map(x=>x.value);
  const data={name:g('f_name').trim(),vendorId:g('f_vendor')||null,cats,unitCost:+g('f_unit')||0,packCost:+g('f_pack')||0,price:+g('f_price')||0,artStatus:g('f_art'),prodStatus:g('f_prod'),pic:g('f_pic'),notes:g('f_notes')};
  if(!data.name){toast('Name required');return;}
  if(id){Object.assign(DB.products.find(x=>x.id===id),data);logAct('UPDATE_ITEM',data.name);}
  else{DB.products.push({id:uid(),eventId:DB.activeEvent,...data,created:nowISO()});logAct('CREATE_ITEM',data.name);}
  closeModal();save();render();
 },
 openVariant(pid,vid){
  const v=DB.variants.find(x=>x.id===vid)||{productId:pid,talent:'',unitCostOverride:null,priceOverride:null,notes:''};
  openModal(`<h2>${vid?'Edit':'New'} talent variant</h2>
   ${fld('Talent name (blank = shared/product-level)','<input id="f_tal" value="'+esc(v.talent||'')+'">')}
   <div class="row"><div><label>Unit cost override (blank = product default)</label><input id="f_uco" type="number" min="0" value="${v.unitCostOverride??''}" placeholder="default"></div>
   <div><label>Price override</label><input id="f_po" type="number" min="0" value="${v.priceOverride??''}" placeholder="default"></div></div>
   ${fld('Notes','<input id="f_vn" value="'+esc(v.notes||'')+'">')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveVariant('${vid||''}','${v.productId}')">Save</button></div>`);
 },
 saveVariant(vid,pid){
  const g=i=>document.getElementById(i).value;
  const data={talent:g('f_tal').trim()||null,unitCostOverride:g('f_uco')===''?null:+g('f_uco'),priceOverride:g('f_po')===''?null:+g('f_po'),notes:g('f_vn')};
  if(vid)Object.assign(DB.variants.find(x=>x.id===vid),data);
  else DB.variants.push({id:uid(),productId:pid,...data,created:nowISO()});
  logAct(vid?'UPDATE_ITEM':'CREATE_ITEM','variant '+(data.talent||'shared'));closeModal();save();render();
 },
 openVendor(id){
  const v=DB.vendors.find(x=>x.id===id)||{name:'',url:'',notes:'',social:'',market:'',wa:''};
  openModal(`<h2>${id?'Edit':'New'} vendor</h2>${fld('Name','<input id="f_name" value="'+esc(v.name)+'">')}
   ${fld('Website link','<input id="f_url" placeholder="https://" value="'+esc(v.url||'')+'">')}
   ${fld('Social media link (IG/Twitter)','<input id="f_soc" placeholder="https://instagram.com/…" value="'+esc(v.social||'')+'">')}
   ${fld('Marketplace link (Tokopedia/Shopee)','<input id="f_mkt" placeholder="https://tokopedia.com/…" value="'+esc(v.market||'')+'">')}
   ${fld('WhatsApp number','<input id="f_wa" placeholder="0812…" value="'+esc(v.wa||'')+'">')}
   ${fld('Notes','<textarea id="f_notes" rows="2">'+esc(v.notes||'')+'</textarea>')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveVendor('${id||''}')">Save</button></div>`);
 },
 saveVendor(id){const g=i=>document.getElementById(i).value;const data={name:g('f_name').trim(),url:g('f_url'),social:g('f_soc'),market:g('f_mkt'),wa:g('f_wa'),notes:g('f_notes')};
  if(!data.name){toast('Name required');return;}
  if(id)Object.assign(DB.vendors.find(x=>x.id===id),data);else DB.vendors.push({id:uid(),...data});
  logAct(id?'UPDATE_VENDOR':'CREATE_VENDOR',data.name);closeModal();save();render();
  if(window.__vendorCB){window.__vendorCB(DB.vendors[DB.vendors.length-1].id);window.__vendorCB=null;}
  return id?null:DB.vendors[DB.vendors.length-1].id;
 },
 openLot(vid){
  const v=vid2var()[vid];
  openModal(`<h2>Stock lot — ${esc(variantLabel(v))}</h2><p class="sub">Multi-batch production: ordered vs delivered tells you what you still owe the vendor.</p>
   <div class="row"><div><label>Qty ordered</label><input id="f_ord" type="number" min="0" value="50"></div>
   <div><label>Qty delivered</label><input id="f_del" type="number" min="0" value="0"></div>
   <div><label>Batch #</label><input id="f_b" value="B${evList(DB.lots).length+1}"></div></div>
   <div class="row" style="margin-top:10px"><div><label>Source</label><select id="f_src">${['PO','OTS','Gacha','Giveaway'].map(s=>`<option>${s}</option>`).join('')}</select></div>
   <div><label>Unit cost snapshot</label><input id="f_uc" type="number" min="0" value="${costOf(v)-0}"></div>
   <div><label>PIC</label><input id="f_pic" value="Toyo"></div></div>
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveLot('${vid}')">Save lot</button></div>`);
 },
 saveLot(vid){
  const g=i=>document.getElementById(i).value;
  const lot={id:uid(),eventId:DB.activeEvent,variantId:vid,qtyOrdered:+g('f_ord')||0,qtyDelivered:+g('f_del')||0,source:g('f_src'),unitCost:+g('f_uc')||0,pic:g('f_pic'),batch:g('f_b'),status:+g('f_del')>=+g('f_ord')?'delivered':'ordered',created:nowISO()};
  DB.lots.push(lot);logAct('CREATE_LOT',variantLabel(vid2var()[vid])+' '+lot.batch+' ('+lot.qtyDelivered+'/'+lot.qtyOrdered+')');closeModal();save();render();
 },
 openTodo(id){
  const t=DB.todos.find(x=>x.id===id)||{title:'',assignee:'',due:'',notes:'',done:false};
  openModal(`<h2>${id?'Edit':'New'} task</h2>${fld('Title','<input id="f_name" value="'+esc(t.title)+'">')}
   <div class="row"><div><label>Assignee</label><input id="f_as" value="${esc(t.assignee)}"></div><div><label>Due</label><input id="f_due" type="date" value="${t.due||''}"></div></div>
   ${fld('Notes','<input id="f_notes" value="'+esc(t.notes||'')+'">')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveTodo('${id||''}')">Save</button></div>`);
 },
 saveTodo(id){const g=i=>document.getElementById(i).value;const data={title:g('f_name').trim(),assignee:g('f_as'),due:g('f_due'),notes:g('f_notes')};
  if(!data.title){toast('Title required');return;}
  if(id)Object.assign(DB.todos.find(x=>x.id===id),data);else DB.todos.push({id:uid(),eventId:DB.activeEvent,...data,done:false});
  logAct(id?'UPDATE_TODO':'CREATE_TODO',data.title);closeModal();save();render();},
 openBooking(id){
  const b=DB.bookings.find(x=>x.id===id)||{customer:'',contact:'',items:[],status:'pending',fulfil:'pickup',address:'',shipFee:0,notes:''};
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  openModal(`<h2>${id?'Edit':'New'} booking</h2>
   <div class="row"><div style="flex:2"><label>Customer</label><input id="f_name" value="${esc(b.customer)}"></div><div><label>Contact</label><input id="f_ct" value="${esc(b.contact)}"></div></div>
   ${fld('Items',`<select id="f_bi">${vs.map(v=>`<option value="${v.id}">${esc(variantLabel(v))} — ${rp(priceOf(v))}</option>`).join('')}</select>
   <div class="row" style="margin-top:6px"><div><label>Qty</label><input id="f_bq" type="number" min="1" value="1"></div><div class="w0"><button class="btn sm ghost" onclick="UI.addBookItem()">+ Add line</button></div></div>
   <div id="f_bitems" style="margin-top:8px"></div>`)}
   <div class="row"><div><label>Payment status</label><select id="f_st">${PAYSTAGES.map(s=>`<option ${UI.opt(s,b.status)}>${s}</option>`).join('')}</select></div>
   <div><label>Fulfilment</label><select id="f_fu" onchange="document.getElementById('f_mailbox').style.display=this.value==='mail'?'block':'none'">
   <option value="pickup" ${UI.opt('pickup',b.fulfil)}>Booth pickup</option><option value="mail" ${UI.opt('mail',b.fulfil)}>Mail order</option></select></div>
   <div><label>Shipping fee</label><input id="f_sf" type="number" min="0" value="${b.shipFee||0}"></div></div>
   <div id="f_mailbox" style="display:${b.fulfil==='mail'?'block':'none'};margin-top:10px">${fld('Shipping address','<textarea id="f_addr" rows="2">'+esc(b.address||'')+'</textarea>')}</div>
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveBooking('${id||''}')">Save</button></div>`);
  window.__bitems=JSON.parse(JSON.stringify(b.items||[]));UI.drawBookItems();
 },
 drawBookItems(){document.getElementById('f_bitems').innerHTML=(window.__bitems||[]).map((i,ix)=>{const v=vid2var()[i.variantId];
  return `<div style="display:flex;gap:8px;align-items:center;padding:3px 0"><span style="flex:1">${esc(v?variantLabel(v):'?')} ×${i.qty}</span><button class="btn sm ghost" onclick="window.__bitems.splice(${ix},1);UI.drawBookItems()">✕</button></div>`;}).join('')||'<small class="mut">No lines yet.</small>';},
 addBookItem(){const vid=document.getElementById('f_bi').value;const q=+document.getElementById('f_bq').value||1;
  window.__bitems.push({variantId:vid,qty:q});UI.drawBookItems();},
 saveBooking(id){
  const g=i=>document.getElementById(i).value;
  const data={customer:g('f_name').trim(),contact:g('f_ct'),items:window.__bitems||[],status:g('f_st'),fulfil:g('f_fu'),address:document.getElementById('f_addr')?document.getElementById('f_addr').value:'',shipFee:+g('f_sf')||0};
  if(!data.customer){toast('Customer required');return;}
  if(id)Object.assign(DB.bookings.find(x=>x.id===id),data);else DB.bookings.push({id:uid(),eventId:DB.activeEvent,...data,created:nowISO()});
  logAct(id?'UPDATE_BOOKING':'CREATE_BOOKING',data.customer+' — '+data.items.length+' lines');closeModal();save();render();
 },
 openSale(){
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  openModal(`<h2>Manual sale record</h2><p class="sub">For post-event data entry from the spreadsheet.</p>
   ${fld('Item',`<select id="f_bi">${vs.map(v=>`<option value="${v.id}">${esc(variantLabel(v))}</option>`).join('')}</select>`)}
   <div class="row"><div><label>Channel</label><select id="f_ch">${CHANS.map(c=>`<option>${c}</option>`).join('')}</select></div>
   <div><label>Qty</label><input id="f_q" type="number" min="1" value="1"></div>
   <div><label>Unit price</label><input id="f_pr" type="number" min="0"></div></div>
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveSale()">Save</button></div>`);
 },
 saveSale(){
  const g=i=>document.getElementById(i).value;const vid=g('f_bi');const v=vid2var()[vid];
  DB.sales.push({id:uid(),eventId:DB.activeEvent,variantId:vid,channel:g('f_ch'),qty:+g('f_q')||1,price:+g('f_pr')||priceOf(v),ts:nowISO(),createdBy:null});
  logAct('CREATE_SALE','manual: '+variantLabel(v)+' ×'+g('f_q')+' via '+g('f_ch'));closeModal();save();render();
 },
 openPool(id){
  const p=DB.pools.find(x=>x.id===id)||{name:''};
  openModal(`<h2>${id?'Edit':'New'} gacha pool</h2>${fld('Pool name','<input id="f_name" value="'+esc(p.name)+'" placeholder="CF-21 Gacha">')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.savePool('${id||''}')">Save</button></div>`);
 },
 savePool(id){const name=document.getElementById('f_name').value.trim();if(!name){toast('Name required');return;}
  if(id)Object.assign(DB.pools.find(x=>x.id===id),{name});else DB.pools.push({id:uid(),eventId:DB.activeEvent,name,variants:[],created:nowISO()});
  logAct(id?'UPDATE_POOL':'CREATE_POOL',name);closeModal();save();render();},
 openPoolAlloc(pid){
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  openModal(`<h2>Add prize allocation</h2><p class="sub">Qty entered here flows into the variant's gacha source. Unit cost is pulled from the variant — never retyped.</p>
   ${fld('Prize (variant)',`<select id="f_bi">${vs.map(v=>`<option value="${v.id}">${esc(variantLabel(v))} — cost ${rp(costOf(v))}</option>`).join('')}</select>`)}
   <div class="row"><div><label>Qty</label><input id="f_q" type="number" min="1" value="5"></div><div><label>Drop rate %</label><input id="f_r" type="number" min="0" step="0.1" value="10"></div></div>
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveAlloc('${pid}')">Add</button></div>`);
 },
 saveAlloc(pid){const g=i=>document.getElementById(i).value;const p=DB.pools.find(x=>x.id===pid);
  const a={variantId:g('f_bi'),qty:+g('f_q')||1,rate:(+g('f_r')||0)/100};
  p.variants.push(a);logAct('SYNC_GACHA_TO_MASTER',variantLabel(vid2var()[a.variantId])+' ×'+a.qty+' @'+(a.rate*100)+'%');
  closeModal();save();render();},
};

/* ================= CSV ================= */
function parseCSV(text){
  // strip BOM; sniff delimiter , or ; (Excel-ID)
  text=String(text).replace(/^\uFEFF/,'');
  const firstLine=text.slice(0,text.indexOf('\n')>0?text.indexOf('\n'):text.length);
  const delim=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;}
    else if(c==='"')q=true;
    else if(c===delim){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x!==''))rows.push(row);row=[];}
    else cell+=c;}
  if(cell!==''||row.length){row.push(cell);if(row.some(x=>x!==''))rows.push(row);}
  if(!rows.length)return[];
  const head=rows[0];return rows.slice(1).map(r=>Object.fromEntries(head.map((h,i)=>[h.trim(),r[i]??''])));
}

/* ================= THEME / NAV / BOOT ================= */
function applyTheme(){const t=localStorage.getItem(LS_THEME)||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
 document.documentElement.setAttribute('data-theme',t);}
function toggleTheme(){const t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
 localStorage.setItem(LS_THEME,t);applyTheme();}
const $id=id=>document.getElementById(id);
if($id('themeBtn'))$id('themeBtn').onclick=toggleTheme;
if($id('onlineStub'))$id('onlineStub').onclick=()=>toast('Online mode is coming in v2 — export/import JSON is the bridge for now.');
if($id('exportBtn'))$id('exportBtn').onclick=()=>UI.exportDB();
if($id('importBtn'))$id('importBtn').onclick=()=>UI.pickFile('db');
if($id('restoreBtn'))$id('restoreBtn').onclick=()=>UI.restoreBackup();
if($id('calcAddLine'))$id('calcAddLine').onclick=()=>{UI.calc.lines.push({label:'New line',tier:[[10,10000]],qty:10,pack:0});UI.renderCalc();};
if($id('calcAttachBtn'))$id('calcAttachBtn').onclick=()=>UI.attachCalc();
if($id('itemSearch'))$id('itemSearch').addEventListener('input',()=>UI.renderItems());
if($id('cloneEventBtn'))$id('cloneEventBtn').onclick=()=>{const p=DB.products.filter(x=>x.eventId===DB.activeEvent);
 if(!p.length){toast('No products to clone');return;}
 openModal(`<h2>Clone to new event</h2><p class="sub">Pick a product to clone (creates a new event first if needed). For whole-event cloning, clone products one by one after creating the event in Sync &amp; Log.</p>
  <select id="cpEv0">${p.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
  <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.openNewEventFromClone(document.getElementById('cpEv0').value)">Next…</button></div>`);};
UI.openNewEventFromClone=function(pid){
  const name=prompt('New event name:','CF-23');if(!name)return;
  const e={id:uid(),name:name.trim(),status:'active',created:nowISO(),playPrice:25000,archived:false};
  DB.events.push(e);
  const p=DB.products.find(x=>x.id===pid);
  const np={...JSON.parse(JSON.stringify(p)),id:uid(),eventId:e.id,created:nowISO()};DB.products.push(np);
  DB.variants.filter(v=>v.productId===pid).forEach(v=>DB.variants.push({...JSON.parse(JSON.stringify(v)),id:uid(),productId:np.id,created:nowISO()}));
  DB.activeEvent=e.id;logAct('CLONE_PRODUCT',p.name+' → new event '+name);closeModal();toast('Event '+name+' created with '+p.name);render();};
document.addEventListener('click',e=>{const n=e.target.closest('[data-nav]');if(n)UI.goto(n.dataset.nav);
  const g=e.target.closest('[data-goto]');if(g)UI.goto(g.dataset.goto);});
window.addEventListener('hashchange',()=>{const v=location.hash.replace('#/','');if(['dashboard','event','items','vendors','gacha','bookings','sales','todo','calculator','sync'].includes(v)&&v!==UI.view){UI.view=v;render();}});

function render(){
  document.querySelectorAll('.navlink[data-nav]').forEach(n=>n.classList.toggle('on',n.dataset.nav===UI.view));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on',v.id==='v-'+UI.view));
  const e=ev();
  const $=id=>document.getElementById(id);
  if($('dashEvent'))$('dashEvent').textContent=e?(e.name+(e.archived?' — ARCHIVED (read-only)':'')):'No active event';
  if($('catFilters'))$('catFilters').innerHTML=['',...CATS].map(c=>`<button class="fbtn ${UI.itemCat===c?'on':''}" onclick="UI.itemCat='${c}';render()">${c||'All'}</button>`).join('');
  if($('itemsList'))UI.renderItems();
  if($('vendorsList'))UI.renderVendors();
  if($('poolsList'))UI.renderPools();
  if($('bookingsList'))UI.renderBookings();
  if($('salesStats'))UI.renderSales();
  if($('todoList'))UI.renderTodo();
  if(UI.view==='calculator'&&$('calcLines'))UI.renderCalc();
  if($('logTable'))UI.renderSync();
  if($('tallyGrid'))UI.renderEvent();
  if($('dashStats')){$('dashStats').innerHTML=UI.dashStats();$('dashDemand').innerHTML=UI.dashDemand();$('dashTodos').innerHTML=UI.dashTodos();$('dashLow').innerHTML=UI.dashLow();}
  const sb=document.getElementById('sidebar');if(sb)sb.classList.remove('open');
}
applyTheme();load();
if(IS_BOOKINGS_PAGE){UI.view='bookings';window.__bkBoot=true;}
render();
if(!IS_BOOKINGS_PAGE&&location.hash){const v=location.hash.replace('#/','');if(['dashboard','event','items','vendors','gacha','bookings','sales','todo','calculator','sync'].includes(v))UI.goto(v);}
else if(IS_BOOKINGS_PAGE){document.querySelectorAll('.navlink[data-nav]').forEach(n=>{if(n.dataset.nav!=='bookings'&&n.dataset.nav!=='theme')n.dataset.exit='1';});}
