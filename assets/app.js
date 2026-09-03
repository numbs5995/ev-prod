
"use strict";
/* ================= STORE ================= */
const KEY='evprod.db.v1', LS_THEME='evprod.theme', LS_CHAN='evprod.chan';
const IS_BOOKINGS_PAGE=location.pathname.endsWith('/bookings.html');
const IS_PACKAGING_PAGE=location.pathname.endsWith('/packaging.html');
const IS_ITEMS_PAGE=location.pathname.endsWith('/items.html');
const IS_TALENTS_PAGE=location.pathname.endsWith('/talents.html');
const MAIN_PAGE=(IS_BOOKINGS_PAGE||IS_PACKAGING_PAGE||IS_ITEMS_PAGE||IS_TALENTS_PAGE)?'evprod.html':'#';
const CATS=['PO','Gacha','Dono goal','OTS','Auction','Freebie'];
const CHANS=['OTS','Gacha','PO','Staff','Auction'];
const LOT_SOURCES=['PO','OTS','Gacha','Giveaway','Auction','Freebie','Dono Goal','Custom'];
const LOT_STATUSES=['todo','ordered','on-delivery','arrived'];
const PAYSTAGES=['pending','paid','fulfilled','shipped','cancelled'];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const nowISO=()=>new Date().toISOString();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp'+(Math.round(n)||0).toLocaleString('id-ID');
const num=n=>(Math.round(n*100)/100).toLocaleString('id-ID');
function freshDB(){return{schema:1,activeEvent:null,events:[],products:[],variants:[],talents:[],vendors:[],lots:[],sales:[],pools:[],bookings:[],bundles:[],packs:[],todos:[],expenses:[],log:[]};}
const API_URL = (location.origin && location.origin.startsWith('http')) ? location.origin : 'http://localhost:5000';
let _saveTimer = null;
let _isSaving = false;

function showServerOfflineError(detail = '') {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box;">
      <div style="max-width:540px;width:100%;background:#1e293b;border:1px solid #ef4444;border-radius:12px;padding:32px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <span style="font-size:32px;">⚠️</span>
          <h1 style="margin:0;font-size:22px;color:#f87171;font-weight:700;">EV-Prod Server Not Found</h1>
        </div>
        <p style="margin:0 0 16px 0;line-height:1.6;color:#cbd5e1;font-size:14px;">
          EV-Prod requires the local Python server to be running so all your event data stays safely stored in <code style="background:#0f172a;padding:2px 6px;border-radius:4px;color:#38bdf8;">db.json</code> on disk.
        </p>
        <div style="background:#0f172a;border-radius:8px;padding:16px;margin-bottom:20px;font-family:monospace;font-size:13px;color:#94a3b8;line-height:1.7;">
          <b style="color:#e2e8f0;">How to start the server:</b><br/>
          <b>Windows:</b> Run <span style="color:#4ade80;">start.bat</span> in project folder<br/>
          <b>Mac / Linux:</b> Run <span style="color:#4ade80;">./start.sh</span> in project folder<br/>
          <b>Manual:</b> <span style="color:#38bdf8;">python server.py</span>
        </div>
        ${detail ? `<div style="margin-bottom:16px;font-size:12px;color:#ef4444;font-family:monospace;word-break:break-all;">Error: ${esc(detail)}</div>` : ''}
        <button onclick="location.reload()" style="width:100%;background:#ef4444;color:#fff;border:none;padding:12px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
          🔄 Retry Connection
        </button>
      </div>
    </div>
  `;
}

let DB = null;

async function load() {
  try {
    const res = await fetch(`${API_URL}/db`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data && data.empty) {
      // First run: fresh DB with demo seed
      DB = freshDB();
      seedDemo();
      await flushSave();
    } else {
      DB = data;
      migrate();
    }
    return true;
  } catch (err) {
    console.error('Failed to connect to EV-Prod server:', err);
    showServerOfflineError(err.message || 'Cannot fetch from ' + API_URL);
    return false;
  }
}

async function flushSave() {
  if (!DB) return;
  _isSaving = true;
  try {
    const res = await fetch(`${API_URL}/db`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DB)
    });
    if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
  } catch (e) {
    console.error('Save failed:', e);
    toast('⚠️ Server save failed: ' + (e.message || 'Server error'));
  } finally {
    _isSaving = false;
  }
}

function save() {
  if (!DB) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    flushSave();
  }, 50);
}

function migrate(){const f=freshDB(); for(const k of Object.keys(f)) if(DB[k]===undefined) DB[k]=f[k];
  // legacy variants used free-text .talent; migrate to DB.talents once
  if(!DB.migratedTalentId && DB.variants){
    const name2id={};
    DB.variants.forEach(v=>{
      if(v.talentId || !v.talent) return;
      const name=v.talent.trim();
      let tid=name2id[name];
      if(!tid){const t={id:uid(),name,handle:'',avatar:'',notes:'',active:true,created:nowISO()}; DB.talents.push(t); tid=t.id; name2id[name]=tid;}
      v.talentId=tid; delete v.talent;
    });
    DB.migratedTalentId=true; save();
  }
  // migrate lot statuses & backfill vendorId
  if(DB.lots){
    let changed=false;
    DB.lots.forEach(l=>{
      if(l.status==='ordered'){l.status='todo';changed=true;}
      else if(l.status==='delivered'){l.status='arrived';changed=true;}
      if(l.vendorId===undefined){
        const v=vid2var()[l.variantId];
        const p=v?pid2prod()[v.productId]:null;
        l.vendorId=p?p.vendorId||null:null;
        changed=true;
      }
    });
    if(changed) save();
  }
}
function logAct(type,detail,outcome='ok'){
  DB.log.unshift({id:uid(),type,detail:detail.slice(0,140),ts:nowISO(),
    counts:{products:DB.products.length,variants:DB.variants.length,sales:DB.sales.length,bookings:DB.bookings.length,lots:DB.lots.length},outcome});
  if(DB.log.length>600) DB.log.length=600; save();
}
/* ---- event scoping ---- */
const ev=()=>DB.events.find(e=>e.id===DB.activeEvent);
function evList(coll){const e=ev(); return e? (coll||[]).filter(x=>x.eventId===e.id):[];}
function pid2prod(){const m={};(DB?.products||[]).forEach(p=>m[p.id]=p);return m;}
function vid2var(){const m={};(DB?.variants||[]).forEach(v=>m[v.id]=v);return m;}

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
  const talentMap={};
  tal.forEach(name=>{talentMap[name]={id:uid(),name,handle:'',avatar:'',notes:'',active:true,created:nowISO()}; DB.talents.push(talentMap[name]);});
  let vs=[]; tal.forEach(t=>{vs.push({id:uid(),productId:p1.id,talentId:talentMap[t].id,unitCostOverride:null,priceOverride:null,notes:'',created:nowISO()});});
  vs.push({id:uid(),productId:p2.id,talentId:talentMap['Nana'].id,unitCostOverride:30000,priceOverride:null,notes:'',created:nowISO()});
  vs.push({id:uid(),productId:p3.id,talentId:null,unitCostOverride:null,priceOverride:null,notes:'Product-level (shared)',created:nowISO()});
  DB.variants=vs;
  DB.lots=[{id:uid(),eventId:e.id,variantId:vs[0].id,qtyOrdered:50,qtyDelivered:50,source:'PO',unitCost:12000,pic:'Toyo',batch:'B1',status:'arrived',created:nowISO()},
           {id:uid(),eventId:e.id,variantId:vs[3].id,qtyOrdered:20,qtyDelivered:3,source:'PO',unitCost:30000,pic:'Toyo',batch:'B1',status:'todo',created:nowISO()}];
  DB.todos=[{id:uid(),eventId:e.id,title:'Confirm standee vendor quote',assignee:'Toyo',due:'2026-09-05',done:false,notes:''},
            {id:uid(),eventId:e.id,title:'Print booth banner',assignee:'',due:'2026-09-10',done:false,notes:''}];
  logAct('SEED_DEMO','sample data generated on first run');
}

/* ================= COMPUTED ================= */
function costOf(v){const p=pid2prod()[v.productId]; if(!p)return 0; return (v.unitCostOverride??p.unitCost)+(p.packCost||0);}
function priceOf(v){const p=pid2prod()[v.productId]; if(!p)return 0; return (v.priceOverride??p.price)||0;}
function stockOf(variantId, eventId = null){ // delivered lots (arrived), minus sales (OTS, Staff, Auction, Gacha, PO)
  const lots = eventId ? DB.lots.filter(l => l.eventId === eventId) : evList(DB.lots);
  const sales = eventId ? DB.sales.filter(s => s.eventId === eventId) : evList(DB.sales);
  let s=0; lots.forEach(l=>{if(l.variantId===variantId && (l.status==='arrived'||!l.status) && !l.isDeadstock) s+=(l.qtyDelivered||0);});
  sales.forEach(r=>{if(r.variantId===variantId) s-=(r.qty||0);});
  return s;
}
function stockByChannel(variantId, eventId = null){
  const res={PO:0,OTS:0,Gacha:0,Giveaway:0,Auction:0,Freebie:0,'Dono Goal':0,Custom:0,Total:0};
  const lots = eventId ? DB.lots.filter(l => l.eventId === eventId) : evList(DB.lots);
  const sales = eventId ? DB.sales.filter(s => s.eventId === eventId) : evList(DB.sales);
  lots.forEach(l=>{
    if(l.variantId===variantId && (l.status==='arrived'||!l.status) && !l.isDeadstock){
      const src=l.source||'OTS';
      if(res[src]!==undefined) res[src]+=(l.qtyDelivered||0);
      else res[src]=(res[src]||0)+(l.qtyDelivered||0);
    }
  });
  // subtract sales per channel
  sales.forEach(r=>{
    if(r.variantId===variantId){
      const ch=r.channel;
      if(ch==='OTS'||ch==='Staff'){
        if(res.OTS!==undefined) res.OTS-=(r.qty||0);
      } else if(ch==='PO'){
        if(res.PO!==undefined) res.PO-=(r.qty||0);
      } else if(ch==='Gacha'){
        if(res.Gacha!==undefined) res.Gacha-=(r.qty||0);
      } else if(ch==='Auction'){
        if(res.Auction!==undefined) res.Auction-=(r.qty||0);
      }
    }
  });
  res.Total=stockOf(variantId, eventId);
  return res;
}
function variantLabel(v){const p=pid2prod()[v.productId]; const t=v.talentId && DB.talents ? DB.talents.find(t=>t.id===v.talentId) : null; if(!p)return'?'; return t? p.name+' — '+t.name : p.name+' (shared)';}
function talentName(v){const t=v.talentId && DB.talents ? DB.talents.find(t=>t.id===v.talentId) : null; return t?t.name:'Shared';}
function salesOf(variantId,chan){return evList(DB.sales).filter(r=>r.variantId===variantId&&(!chan||r.channel===chan));}
function poolOf(variantId){const e=ev(); if(!e)return null; return DB.pools.find(p=>p.eventId===e.id&&p.variants.some(x=>x.variantId===variantId))||null;}
function chanStock(variantId,chan){ // how many units remain sellable in this channel
  if(chan==='OTS'||chan==='Staff') return Math.max(0, stockByChannel(variantId).OTS);
  if(chan==='Auction') return Math.max(0, stockByChannel(variantId).Auction);
  if(chan==='Gacha'){
    const pl=poolOf(variantId);
    if(!pl) return Math.max(0, stockByChannel(variantId).Gacha);
    const a=pl.variants.find(x=>x.variantId===variantId);
    return a?Math.max(0,(a.qty||0)-salesOf(variantId,'Gacha').reduce((s,r)=>s+r.qty,0)):0;
  }
  if(chan==='PO') return Math.max(0, stockByChannel(variantId).PO);
  return stockOf(variantId);
}
function demandOf(variantId){ // print demand = PO bookings qty, fulfilled subtracted
  let d=0; evList(DB.bookings).forEach(b=>{if(b.status==='cancelled')return;
    (b.items||[]).forEach(i=>{
      if(i.variantId===variantId) d+=i.qty;
      if(i.bundleId){
        const bundle=(DB.bundles||[]).find(bd=>bd.id===i.bundleId);
        if(bundle){
          const bi=(bundle.items||[]).find(x=>x.variantId===variantId);
          if(bi) d+=bi.qty*i.qty;
        }
      }
    });
  });
  evList(DB.sales).forEach(r=>{if(r.variantId===variantId&&r.channel==='PO')d-=(r.qty||0);});
  return d;
}
function producedOf(variantId){let s=0;evList(DB.lots).forEach(l=>{if(l.variantId===variantId&&(l.status==='arrived'||!l.status))s+=(l.qtyDelivered||0);});return s;}
function evSummary(){ // pool-level EV
  const out={revenue:0,profit:0,expenses:0,stock:0,demand:0};
  evList(DB.sales).forEach(r=>{const v=vid2var()[r.variantId]; if(!v)return; out.revenue+=(r.price||0)*(r.qty||0); out.profit+=((r.price||0)-costOf(v))*(r.qty||0);});
  evList(DB.expenses).forEach(x=>out.expenses+=(x.amount||0));
  const seen={}; DB.variants.forEach(v=>{if(seen[v.id]||!evList(DB.lots).some(l=>l.variantId===v.id)&&!evList(DB.sales).some(r=>r.variantId===v.id))return; seen[v.id]=1; out.stock+=stockOf(v.id); out.demand+=demandOf(v.id);});
  return out;
}

/* ---- bundle helpers ---- */
function bundleBasePrice(bundle){
  if(!bundle || !bundle.items) return 0;
  return bundle.items.reduce((s,i)=>{
    const v=vid2var()[i.variantId];
    return s + (v? priceOf(v)*(i.qty||1) : 0);
  }, 0);
}
function bundlePrice(bundle){
  if(!bundle || !bundle.items) return 0;
  if(bundle.discountMode==='free_items'){
    return bundle.items.reduce((s,i)=>{
      if(i.isFree) return s;
      const v=vid2var()[i.variantId];
      return s + (v? priceOf(v)*(i.qty||1) : 0);
    }, 0);
  } else if(bundle.discountMode==='discount'){
    const base = bundleBasePrice(bundle);
    if(bundle.discountType==='percent'){
      return Math.round(base * (1 - (bundle.discountValue||0)/100));
    } else { // fixed
      return Math.max(0, base - (bundle.discountValue||0));
    }
  }
  return bundleBasePrice(bundle);
}
function bundleStock(bundle){
  if(!bundle || !bundle.items || !bundle.items.length) return 0;
  let minAvail=999999;
  bundle.items.forEach(i=>{
    const v=vid2var()[i.variantId];
    if(!v){minAvail=0; return;}
    const st = chanStock(v.id, 'PO') || stockOf(v.id);
    const possible = Math.floor(st / (i.qty||1));
    if(possible < minAvail) minAvail = possible;
  });
  return minAvail === 999999 ? 0 : Math.max(0, minAvail);
}

/* ---- stock transfer & deadstock ---- */
function transferStock(fromLotId, qty, targetSource, notes=''){
  const lot = DB.lots.find(l=>l.id===fromLotId);
  if(!lot || (lot.qtyDelivered||0) < qty){ toast('Invalid transfer qty'); return false; }
  lot.qtyDelivered -= qty;
  lot.qtyOrdered = Math.max(0, (lot.qtyOrdered||lot.qtyDelivered) - qty);
  const newLot = {
    id: uid(),
    eventId: lot.eventId,
    variantId: lot.variantId,
    vendorId: lot.vendorId || null,
    qtyOrdered: qty,
    qtyDelivered: qty,
    source: targetSource,
    unitCost: lot.unitCost,
    pic: lot.pic,
    batch: (lot.batch||'B') + '-TR',
    status: 'arrived',
    purposeNotes: targetSource==='Custom'? notes : (notes? 'Transfer: '+notes : ''),
    transferredFromLotId: lot.id,
    created: nowISO()
  };
  DB.lots.push(newLot);
  const v = vid2var()[lot.variantId];
  logAct('TRANSFER_STOCK', `${variantLabel(v)} ${qty}pcs: ${lot.source} → ${targetSource}`);
  save(); render();
  toast(`Transferred ${qty}pcs to ${targetSource}`);
  return true;
}
function carryOverDeadstock(lotId, targetEventId, newSource='Gacha'){
  const lot = DB.lots.find(l=>l.id===lotId);
  if(!lot || !lot.isDeadstock) return false;
  const targetEv = DB.events.find(e=>e.id===targetEventId);
  if(!targetEv) return false;
  // find matching product & variant in target event
  const v = vid2var()[lot.variantId];
  const p = v ? pid2prod()[v.productId] : null;
  if(!p) return false;
  let targetP = DB.products.find(tp=>tp.eventId===targetEventId && tp.name===p.name);
  if(!targetP){
    targetP = {...JSON.parse(JSON.stringify(p)), id:uid(), eventId:targetEventId, created:nowISO()};
    DB.products.push(targetP);
  }
  let targetV = DB.variants.find(tv=>tv.productId===targetP.id && tv.talentId===v.talentId);
  if(!targetV){
    targetV = {...JSON.parse(JSON.stringify(v)), id:uid(), productId:targetP.id, created:nowISO()};
    DB.variants.push(targetV);
  }
  const qty = lot.qtyDelivered || 0;
  const newLot = {
    id: uid(),
    eventId: targetEventId,
    variantId: targetV.id,
    vendorId: lot.vendorId || targetP.vendorId || null,
    qtyOrdered: qty,
    qtyDelivered: qty,
    source: newSource,
    unitCost: lot.unitCost,
    pic: lot.pic,
    batch: 'DEADSTOCK',
    status: 'arrived',
    purposeNotes: 'Carried over from '+ (ev()?.name||'previous event'),
    created: nowISO()
  };
  DB.lots.push(newLot);
  lot.deadstockCarriedTo = targetEventId;
  logAct('CARRY_OVER_DEADSTOCK', `${variantLabel(v)} ${qty}pcs → ${targetEv.name} (${newSource})`);
  save(); render();
  toast(`Carried over ${qty}pcs into ${targetEv.name}`);
  return true;
}

/* ================= MODAL / TOAST ================= */
let toastT; function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2600);}
function openModal(html, size=''){
  const m = document.getElementById('modal');
  m.className = 'modal' + (size ? ' ' + size : '');
  m.innerHTML = html;
  document.getElementById('overlay').classList.add('on');
  enhanceNumberInputs(m);
}
function enhanceNumberInputs(container){
  if(!container) return;
  const numInputs = container.querySelectorAll('input[type="number"]:not(.enhanced-stepper)');
  numInputs.forEach(inp => {
    inp.classList.add('enhanced-stepper');
    const wrap = document.createElement('div');
    wrap.className = 'num-stepper';
    
    // Transfer inline width or flex from input to the wrapper so layout preserves
    if(inp.style.width && inp.style.width !== '100%'){
      wrap.style.width = inp.style.width;
      inp.style.width = '100%';
    }
    if(inp.style.flex){
      wrap.style.flex = inp.style.flex;
      inp.style.flex = '1';
    }

    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);

    const btns = document.createElement('div');
    btns.className = 'num-stepper-btns';
    btns.innerHTML = `
      <button type="button" class="num-step-btn" title="Increase" tabindex="-1">▲</button>
      <button type="button" class="num-step-btn" title="Decrease" tabindex="-1">▼</button>
    `;
    wrap.appendChild(btns);

    const [btnUp, btnDown] = btns.querySelectorAll('.num-step-btn');
    const stepVal = () => {
      const step = inp.step ? parseFloat(inp.step) : 1;
      return isNaN(step) || step <= 0 ? 1 : step;
    };
    btnUp.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = parseFloat(inp.value) || 0;
      const step = stepVal();
      const max = inp.max !== '' ? parseFloat(inp.max) : Infinity;
      const next = Math.min(max, +(cur + step).toFixed(4));
      inp.value = next;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    };
    btnDown.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = parseFloat(inp.value) || 0;
      const step = stepVal();
      const min = inp.min !== '' ? parseFloat(inp.min) : -Infinity;
      const next = Math.max(min, +(cur - step).toFixed(4));
      inp.value = next;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });
}
function closeModal(){
  document.getElementById('overlay').classList.remove('on');
  const m = document.getElementById('modal');
  if(m) m.className = 'modal';
}
document.getElementById('overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeModal();});
function fld(label,inner){return `<div style="margin-bottom:12px"><label>${label}</label>${inner}</div>`;}
function fmtDT(iso){try{return new Date(iso).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch(e){return iso;}}

/* ================= UI ================= */
const UI={
 view:'dashboard', chan:localStorage.getItem(LS_CHAN)||'OTS', itemCat:'', bookStage:'',
 calc:{lines:[{label:'Acrylic 5cm',tier:[[50,12000],[100,11000]],qty:100,pack:1500}]},

 // Table pagination & search/filter state (default max 10, options 10, 50, 100)
 itemQ:'', itemPage:1, itemPerPage:10,
 venQ:'', venFilter:'', venPage:1, venPerPage:10,
 venOrdQ:'', venOrdFilter:'', venOrdPage:1, venOrdPerPage:10,
 dashVenQ:'', dashVenFilter:'', dashVenPage:1, dashVenPerPage:10,
 salesQ:'', salesChanFilter:'', salesPage:1, salesPerPage:10,
 logQ:'', logOutcomeFilter:'', logPage:1, logPerPage:10,
 talentQ:'', talentPage:1, talentPerPage:10,

 buildPager(curPage, totalItems, perPage, onPageChange, onPerPageChange){
   const pages = Math.max(1, Math.ceil(totalItems / perPage));
   const startIdx = totalItems ? (curPage - 1) * perPage + 1 : 0;
   const endIdx = Math.min(curPage * perPage, totalItems);

   const pageBtns = [];
   let s = Math.max(1, curPage - 2), e = Math.min(pages, s + 4);
   s = Math.max(1, e - 4);
   for(let k = s; k <= e; k++){
     pageBtns.push(`<button class="fbtn ${k===curPage?'on':''}" style="min-width:32px;justify-content:center" onclick="${onPageChange}(${k})">${k}</button>`);
   }

   return `<div class="table-pager" style="display:flex;align-items:center;gap:12px;padding:12px 6px;flex-wrap:wrap;border-top:1px solid var(--border)">
     <span class="mut" style="font-size:.85rem">Showing <b>${startIdx}–${endIdx}</b> of <b>${totalItems}</b></span>
     <span class="mut" style="font-size:.85rem;margin-left:8px">Rows per page:</span>
     <select style="width:auto;padding:3px 8px;font-size:.85rem" onchange="${onPerPageChange}(+this.value)">
       ${[10, 50, 100].map(x=>`<option value="${x}" ${x===perPage?'selected':''}>${x}</option>`).join('')}
     </select>
     <span style="flex:1"></span>
     <button class="fbtn" ${curPage<=1?'disabled style="opacity:.4"':''} title="First" onclick="${onPageChange}(1)">⏮</button>
     <button class="fbtn" ${curPage<=1?'disabled style="opacity:.4"':''} title="Prev" onclick="${onPageChange}(${Math.max(1, curPage-1)})">‹</button>
     ${pageBtns.join('')}
     <button class="fbtn" ${curPage>=pages?'disabled style="opacity:.4"':''} title="Next" onclick="${onPageChange}(${Math.min(pages, curPage+1)})">›</button>
     <button class="fbtn" ${curPage>=pages?'disabled style="opacity:.4"':''} title="Last" onclick="${onPageChange}(${pages})">⏭</button>
   </div>`;
 },

 goto(v){
    if(v==='bookings'&&!IS_BOOKINGS_PAGE){location.href='bookings.html';return;}
     if(v==='packaging'&&!IS_PACKAGING_PAGE){location.href='packaging.html';return;}
     if(v==='items'&&!IS_ITEMS_PAGE){location.href='items.html';return;}
     if(v==='talents'&&!IS_TALENTS_PAGE){location.href='talents.html';return;}
     if(IS_BOOKINGS_PAGE&&v==='bookings'){this.view=v;render();return;}
     if(IS_PACKAGING_PAGE&&v==='packaging'){this.view=v;render();return;}
     if(IS_ITEMS_PAGE&&v==='items'){this.view=v;render();return;}
     if(IS_TALENTS_PAGE&&v==='talents'){this.view=v;render();return;}
     if(IS_BOOKINGS_PAGE||IS_PACKAGING_PAGE||IS_ITEMS_PAGE||IS_TALENTS_PAGE){location.href=MAIN_PAGE+'#/'+v;return;}
    this.view=v;location.hash='#/'+v;render();
   },
 setChan(c){this.chan=c;localStorage.setItem(LS_CHAN,c);render();},

 /* ---- dashboard ---- */
 dashStats(){
  const s=evSummary(), todos=evList(DB.todos).filter(t=>!t.done);
  const freeRemain = DB.variants
    .filter(v => pid2prod()[v.productId]?.eventId === ev()?.id)
    .reduce((tot, v) => {
      const ch = stockByChannel(v.id);
      return tot + (ch.Freebie || 0) + (ch.Giveaway || 0) + (ch['Dono Goal'] || 0);
    }, 0);

  return `<div class="stat"><div class="k">Items / Variants</div><div class="v">${DB.products.filter(p=>p.eventId===ev()?.id).length}<span class="mut" style="font-size:1rem"> / ${DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===ev()?.id).length}</span></div></div>
  <div class="stat"><div class="k">Open to-dos</div><div class="v">${todos.length}</div></div>
  <div class="stat"><div class="k">Production cost</div><div class="v">${rp(this.totalProdCost())}</div><div class="d">lots delivered × unit cost</div></div>
  <div class="stat"><div class="k">Net profit (est.)</div><div class="v ${s.profit>=0?'pos':'neg'}">${rp(s.profit)}</div><div class="d">sales profit − ${rp(s.expenses)} expenses</div></div>
  <div class="stat"><div class="k">Stock on hand</div><div class="v">${num(s.stock)}</div></div>
  <div class="stat"><div class="k">Print demand</div><div class="v">${num(s.demand)}</div><div class="d">unfulfilled PO units</div></div>
  ${freeRemain>0?`<div class="stat" style="border-left:4px solid var(--warn)"><div class="k" style="color:var(--warn)">Freebie / Giveaway Left</div><div class="v num" style="color:var(--warn)">${freeRemain}</div><div class="d">Units remaining to distribute</div></div>`:''}`;
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
 dashVendorOrders(){
   const e = ev();
   if(!e) return `<div class="empty">No active event.</div>`;
   let activeLots = evList(DB.lots).filter(l => ['todo', 'ordered', 'on-delivery'].includes(l.status||'todo'));
   if(!activeLots.length && !UI.dashVenQ && !UI.dashVenFilter){
     return `<div class="empty"><div class="big">✓</div>All vendor orders are completed &amp; arrived in warehouse.</div>`;
   }

   const q = (UI.dashVenQ||'').toLowerCase().trim();
   const stFilter = UI.dashVenFilter||'';

   if(q){
     activeLots = activeLots.filter(l => {
       const v = vid2var()[l.variantId];
       const p = pid2prod()[v?.productId];
       const effVId = l.vendorId || p?.vendorId;
       const vendor = DB.vendors.find(vn => vn.id === effVId);
       const text = (variantLabel(v||{}) + ' ' + (vendor?.name||'') + ' ' + (l.batch||'') + ' ' + (l.purposeNotes||'')).toLowerCase();
       return text.includes(q);
     });
   }

   if(stFilter){
     activeLots = activeLots.filter(l => (l.status||'todo') === stFilter);
   }

   const perPage = UI.dashVenPerPage || 10;
   const pages = Math.max(1, Math.ceil(activeLots.length / perPage));
   if(UI.dashVenPage > pages) UI.dashVenPage = pages;
   const paged = activeLots.slice((UI.dashVenPage-1)*perPage, UI.dashVenPage*perPage);

   const statusBadge = st => {
     if(st==='todo') return `<span class="status-pill stage-dim">TO DO</span>`;
     if(st==='ordered') return `<span class="status-pill stage-ordered">ORDERED</span>`;
     if(st==='on-delivery') return `<span class="status-pill stage-delivery">ON DELIVERY</span>`;
     return `<span class="status-pill">${esc(st)}</span>`;
   };

   const filterBar = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
     <input type="search" placeholder="Search active orders &amp; vendors…" style="max-width:250px" value="${esc(UI.dashVenQ||'')}" oninput="UI.dashVenQ=this.value;UI.dashVenPage=1;render()">
     <div class="filters">
       <button class="fbtn ${!stFilter?'on':''}" onclick="UI.dashVenFilter='';UI.dashVenPage=1;render()">All Active</button>
       <button class="fbtn ${stFilter==='todo'?'on':''}" onclick="UI.dashVenFilter='todo';UI.dashVenPage=1;render()">To Do</button>
       <button class="fbtn ${stFilter==='ordered'?'on':''}" onclick="UI.dashVenFilter='ordered';UI.dashVenPage=1;render()">Ordered</button>
       <button class="fbtn ${stFilter==='on-delivery'?'on':''}" onclick="UI.dashVenFilter='on-delivery';UI.dashVenPage=1;render()">On Delivery</button>
     </div>
   </div>`;

   const pagerHtml = UI.buildPager(UI.dashVenPage, activeLots.length, perPage, 'UI.setDashVenPage', 'UI.setDashVenPerPage');

   return `${filterBar}
   <div class="twrap" style="border:none"><table>
     <thead><tr>
       <th>Item</th>
       <th>Vendor</th>
       <th>Batch / Notes</th>
       <th style="text-align:right">Ordered</th>
       <th>Status</th>
       <th>Action</th>
     </tr></thead>
     <tbody>${paged.map(l => {
       const v = vid2var()[l.variantId];
       const p = pid2prod()[v?.productId];
       const effVId = l.vendorId || p?.vendorId;
       const vendor = DB.vendors.find(vn => vn.id === effVId);
       const st = l.status || 'todo';
       const nextMap = { 'todo': 'ordered', 'ordered': 'on-delivery', 'on-delivery': 'arrived' };
       const nextSt = nextMap[st];

       return `<tr>
         <td>
           <b>${esc(v ? variantLabel(v) : '?')}</b>
           <span class="chip" style="font-size:.7rem;margin-left:4px">${esc(l.source)}</span>
         </td>
         <td>
           ${vendor ? `<button class="btn sm ghost" style="padding:2px 8px;min-height:26px" onclick="UI.openVendorDetail('${vendor.id}')">◈ ${esc(vendor.name)}</button>` : '<span class="mut">— none —</span>'}
         </td>
         <td>
           <span class="mut" style="font-size:.82rem">${esc(l.batch || 'B1')}</span>
           ${l.pic ? `<small class="mut"> · PIC: ${esc(l.pic)}</small>` : ''}
           ${l.purposeNotes ? `<small class="mut"> · ${esc(l.purposeNotes)}</small>` : ''}
         </td>
         <td class="num" style="text-align:right;font-weight:700">${l.qtyOrdered || 0} pcs</td>
         <td>${statusBadge(st)}</td>
         <td style="white-space:nowrap">
           ${nextSt ? `<button class="btn sm" onclick="UI.advanceLotStatus('${l.id}')">Advance ➔ ${nextSt.toUpperCase()}</button>` : ''}
           <button class="btn sm ghost" onclick="UI.openLot('${l.variantId}','${l.id}')">Edit</button>
         </td>
       </tr>`;
     }).join('') || '<tr><td colspan="6" class="empty">No matching active vendor orders.</td></tr>'}</tbody>
   </table>
   ${pagerHtml}
   </div>`;
  },
  setDashVenPage(p){ UI.dashVenPage = p; render(); },
  setDashVenPerPage(n){ UI.dashVenPerPage = n; UI.dashVenPage = 1; render(); },

 /* ---- items (talent-centric) ---- */
  itemRow(v){
    const ch = stockByChannel(v.id);
    const d = demandOf(v.id);
    const rem = d - producedOf(v.id);
    const p = pid2prod()[v.productId] || {};
    const lots = evList(DB.lots).filter(l=>l.variantId===v.id);
    const otherStock = (ch.Giveaway||0) + (ch.Freebie||0) + (ch['Dono Goal']||0) + (ch.Custom||0);
    const popoverId = 'stock_pop_' + v.id;
    const menuId = 'item_menu_' + v.id;

    return `<tr>
      <td>
        <b>${esc(p.name||variantLabel(v))}</b>
        <div style="margin-top:2px;font-size:.78rem" class="mut">
          ${p.cats? p.cats.map(c=>`<span class="chip acc" style="font-size:.7rem;padding:1px 6px">${esc(c)}</span>`).join(' ') : ''}
          ${p.artStatus?`<span class="chip ${p.artStatus==='Art ready'?'ok':'warn'}" style="font-size:.7rem;padding:1px 6px">${esc(p.artStatus)}</span>`:''}
          ${p.prodStatus?`<span class="chip ${p.prodStatus==='In production'?'ok':''}" style="font-size:.7rem;padding:1px 6px">${esc(p.prodStatus)}</span>`:''}
          ${p.artist?`<span> · 🎨 Artist: <b>${esc(p.artist)}</b></span>`:''}
          ${p.pic?`<span> · 👤 PIC: <b>${esc(p.pic)}</b></span>`:''}
          ${v.notes?`<span> · ${esc(v.notes)}</span>`:''}
        </div>
        ${lots.length?`<small class="mut" style="font-size:.74rem">${lots.length} lot${lots.length>1?'s':''} · ${lots.map(l=>(l.batch||'B')+' ('+l.status+')').join(', ')}</small>`:''}
      </td>
      <td class="num">${rp(costOf(v))}</td>
      <td class="num">${rp(priceOf(v))}</td>
      <td class="num" style="position:relative;text-align:center">
        <span class="stock-total-badge" onclick="event.stopPropagation();UI.toggleStockPopover('${popoverId}')" title="Click to view/hide stock per category">
          ${ch.Total||0} <span style="font-size:.7rem;opacity:.7">▾</span>
        </span>
        <div class="stock-channel-popover" id="${popoverId}">
          <div style="font-weight:700;font-size:.82rem;margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:4px;display:flex;justify-content:space-between;align-items:center">
            <span>📦 Stock by Channel</span>
            <button style="border:none;background:none;cursor:pointer;color:var(--muted);font-size:14px" onclick="event.stopPropagation();UI.closeAllPopovers()">✕</button>
          </div>
          <table>
            <tr><td class="lbl" style="color:var(--accent)">OTS (On-the-spot)</td><td class="val">${ch.OTS||0}</td></tr>
            <tr><td class="lbl">PO (Pre-orders)</td><td class="val">${ch.PO||0}</td></tr>
            <tr><td class="lbl">Gacha Pools</td><td class="val">${ch.Gacha||0}</td></tr>
            <tr><td class="lbl">Auction</td><td class="val">${ch.Auction||0}</td></tr>
            <tr><td class="lbl">Giveaway</td><td class="val">${ch.Giveaway||0}</td></tr>
            <tr><td class="lbl">Freebie</td><td class="val">${ch.Freebie||0}</td></tr>
            <tr><td class="lbl">Dono Goal</td><td class="val">${ch['Dono Goal']||0}</td></tr>
            <tr><td class="lbl">Custom / Reserved</td><td class="val">${ch.Custom||0}</td></tr>
            <tr style="font-weight:800"><td class="lbl" style="color:var(--fg);font-weight:800">Total Stock</td><td class="val" style="color:var(--accent);font-size:.95rem">${ch.Total||0}</td></tr>
          </table>
        </div>
      </td>
      <td class="num">${d}</td>
      <td class="num ${rem>0?'neg':''}">${rem>0?rem:'✓'}</td>
      <td style="text-align:center;width:48px">
        <div class="action-dropdown" id="act_wrap_${v.id}">
          <button class="action-burger-btn" onclick="event.stopPropagation();UI.toggleActionMenu('${menuId}')" title="Actions">
            ☰
          </button>
          <div class="action-dropdown-menu" id="${menuId}">
            <button class="action-dropdown-item" onclick="UI.openProduct('${p.id}');UI.closeAllMenus()">
              <span>✏</span> Edit Product
            </button>
            <button class="action-dropdown-item" onclick="UI.openVariant('${v.productId}','${v.id}');UI.closeAllMenus()">
              <span>✎</span> Edit Variant
            </button>
            <button class="action-dropdown-item" onclick="UI.openLot('${v.id}');UI.closeAllMenus()">
              <span>+</span> Add Stock Lot
            </button>
            <button class="action-dropdown-item" onclick="UI.openTransfer('${v.id}');UI.closeAllMenus()">
              <span>⇄</span> Transfer Stock
            </button>
            <button class="action-dropdown-item" onclick="UI.cloneVariant('${v.id}');UI.closeAllMenus()">
              <span>⎘</span> Clone Variant
            </button>
            <div style="border-top:1px solid var(--border);margin:3px 0"></div>
            <button class="action-dropdown-item danger" onclick="UI.del('variant','${v.id}');UI.closeAllMenus()">
              <span>✕</span> Delete Variant
            </button>
          </div>
        </div>
      </td>
    </tr>`;
  },
  toggleActionMenu(id){
    const menu = document.getElementById(id);
    const isOpen = menu && menu.classList.contains('show');
    UI.closeAllMenus();
    if(menu && !isOpen){
      menu.classList.add('show');
    }
  },
  closeAllMenus(){
    document.querySelectorAll('.action-dropdown-menu.show').forEach(m => m.classList.remove('show'));
  },
  toggleStockPopover(id){
    const pop = document.getElementById(id);
    const isOpen = pop && pop.classList.contains('show');
    UI.closeAllPopovers();
    if(pop && !isOpen){
      pop.classList.add('show');
    }
  },
  closeAllPopovers(){
    document.querySelectorAll('.stock-channel-popover.show').forEach(p => p.classList.remove('show'));
  },
  renderItems(){
    const e=ev(); if(!e){document.getElementById('itemsList').innerHTML=`<div class="card empty">No active event — create one in <b>Sync &amp; Log → Events</b>.</div>`;return;}
    const q=(document.getElementById('itemSearch')?.value||'').toLowerCase().trim();
    const cat=UI.itemCat;

    // Filter variants in active event
    const allVars = DB.variants.filter(v => {
      const p = pid2prod()[v.productId];
      if(!p || p.eventId !== e.id) return false;
      if(cat && !p.cats.includes(cat)) return false;
      if(q){
        const t = v.talentId ? DB.talents.find(x=>x.id===v.talentId) : null;
        const matchT = t && t.name.toLowerCase().includes(q);
        const matchP = p.name.toLowerCase().includes(q);
        const matchV = (v.notes||'').toLowerCase().includes(q);
        if(!matchT && !matchP && !matchV) return false;
      }
      return true;
    });

    const wrap=document.getElementById('itemsList');
    if(!allVars.length){
      wrap.innerHTML=`<div class="card empty"><div class="big">▦</div>No items matching criteria.<br><button class="btn" style="margin-top:10px" onclick="UI.openProduct()">+ Add product</button></div>`;
      return;
    }

    // Group by talent (talentId !== null), plus shared items (talentId === null)
    const talentsMap = {};
    (DB.talents||[]).forEach(t => { talentsMap[t.id] = { talent: t, variants: [] }; });
    const sharedVars = [];

    allVars.forEach(v => {
      if(v.talentId && talentsMap[v.talentId]){
        talentsMap[v.talentId].variants.push(v);
      } else if(v.talentId) {
        // talent id exists but not in DB.talents (fallback)
        talentsMap[v.talentId] = { talent: { id: v.talentId, name: 'Talent #'+v.talentId.slice(0,4) }, variants: [v] };
      } else {
        sharedVars.push(v);
      }
    });

    const talentGroups = Object.values(talentsMap).filter(g => g.variants.length > 0);

    let html = '';

    // Render Talent Cards
    talentGroups.forEach(g => {
      const t = g.talent;
      const totStock = g.variants.reduce((s,v)=>s+stockOf(v.id), 0);
      const totDemand = g.variants.reduce((s,v)=>s+demandOf(v.id), 0);
      html += `<div class="card" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <div>
            <b style="font-size:1.15rem">${esc(t.name)}</b>
            ${t.avatar?`<span style="margin-left:4px">${esc(t.avatar)}</span>`:''}
            ${t.handle?`<span class="mut" style="font-size:.85rem;margin-left:6px">${esc(t.handle)}</span>`:''}
            <span class="chip acc" style="margin-left:8px">${g.variants.length} SKU${g.variants.length===1?'':'s'}</span>
            <span class="mut" style="font-size:.82rem;margin-left:8px">Total stock: <b class="num">${totStock}</b> · Demand: <b class="num">${totDemand}</b></span>
          </div>
          <div style="white-space:nowrap">
            <button class="btn sm ghost" onclick="UI.openTalent('${t.id}')">Edit Talent</button>
            <button class="btn sm ghost" onclick="UI.openProduct()">+ Product</button>
          </div>
        </div>
        <div class="twrap" style="border:none">
          <table>
            <thead><tr>
              <th>Item (Product)</th>
              <th>Unit cost</th>
              <th>Price</th>
              <th style="text-align:center" title="Click on total below to view breakdown by channel">Total Stock (by channel ▾)</th>
              <th>Demand</th>
              <th>To print</th>
              <th style="text-align:center">Action</th>
            </tr></thead>
            <tbody>${g.variants.map(v=>UI.itemRow(v)).join('')}</tbody>
          </table>
        </div>
      </div>`;
    });

    // Render Shared / Group Items section at bottom
    if(sharedVars.length){
      const totStock = sharedVars.reduce((s,v)=>s+stockOf(v.id), 0);
      const totDemand = sharedVars.reduce((s,v)=>s+demandOf(v.id), 0);
      html += `<div class="card" style="margin-bottom:14px;border-top:3px solid var(--accent)">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <div>
            <b style="font-size:1.15rem">📦 Shared / Group Items</b>
            <span class="chip" style="margin-left:8px">${sharedVars.length} SKU${sharedVars.length===1?'':'s'}</span>
            <span class="mut" style="font-size:.82rem;margin-left:8px">Stock tracked at product level · Total stock: <b class="num">${totStock}</b> · Demand: <b class="num">${totDemand}</b></span>
          </div>
          <button class="btn sm ghost" onclick="UI.openProduct()">+ Shared Product</button>
        </div>
        <div class="twrap" style="border:none">
          <table>
            <thead><tr>
              <th>Item (Product)</th>
              <th>Unit cost</th>
              <th>Price</th>
              <th style="text-align:center" title="Click on total below to view breakdown by channel">Total Stock (by channel ▾)</th>
              <th>Demand</th>
              <th>To print</th>
              <th style="text-align:center">Action</th>
            </tr></thead>
            <tbody>${sharedVars.map(v=>UI.itemRow(v)).join('')}</tbody>
          </table>
        </div>
      </div>`;
    }

    wrap.innerHTML = html;
  },

 /* ---- event mode ---- */
 renderEvent(){
  const bar=document.getElementById('chanBar');
  bar.innerHTML=CHANS.slice(0,4).map(c=>`<button class="fbtn ${UI.chan===c?'on':''}" style="min-height:44px" onclick="UI.setChan('${c}')">${c}</button>`).join('');
  const e=ev(); if(!e){document.getElementById('tallyGrid').innerHTML=`<div class="card empty">No active event.</div>`;return;}
  
  const pools = DB.pools ? DB.pools.filter(p=>p.eventId===e.id) : [];

  let vs = [];
  let poolNotice = '';

  if(UI.chan === 'Gacha'){
    // Only show variants that belong to gacha pools in this event
    const poolVarIds = new Set();
    pools.forEach(p => (p.variants||[]).forEach(pv => poolVarIds.add(pv.variantId)));
    vs = DB.variants.filter(v => poolVarIds.has(v.id) && pid2prod()[v.productId]?.eventId === e.id);
    
    if(pools.length > 1){
      poolNotice = `<div style="margin-bottom:10px;font-size:.85rem;display:flex;align-items:center;gap:8px">
        <span class="mut">Pools active:</span> ${pools.map(p=>`<span class="chip acc">${esc(p.name)}</span>`).join(' ')}
      </div>`;
    }
  } else {
    vs = DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===e.id);
  }

  const sess=evList(DB.sales).reduce((s,r)=>s+(r.qty||0),0);
  const sessRev=evList(DB.sales).reduce((s,r)=>s+(r.qty||0)*(r.price||0),0);
  document.getElementById('sessionLine').innerHTML=`${poolNotice}Session: <b class="num">${sess}</b> units · <b class="num">${rp(sessRev)}</b> — channel <b>${UI.chan}</b>. Saving continuously.`;
  
  if(UI.chan === 'Gacha' && !pools.length){
    document.getElementById('tallyGrid').innerHTML = `<div class="card empty" style="grid-column:1/-1"><div class="big">🎰</div>No gacha pools created yet for this event.<br><button class="btn" style="margin-top:10px" onclick="UI.goto('gacha')">Go to Gacha Pools</button></div>`;
    return;
  }

  if(UI.chan === 'Gacha' && !vs.length){
    document.getElementById('tallyGrid').innerHTML = `<div class="card empty" style="grid-column:1/-1"><div class="big">🎰</div>Gacha pools exist, but no prize variants have been allocated to them.<br><button class="btn" style="margin-top:10px" onclick="UI.goto('gacha')">Add Prize Allocations in Gacha</button></div>`;
    return;
  }

  document.getElementById('tallyGrid').innerHTML=vs.length?vs.map(v=>{
    const st=chanStock(v.id,UI.chan);
    const pl=UI.chan==='Gacha'?poolOf(v.id):null;
    const playPr = e?.playPrice || 25000;
    const priceDisplay = UI.chan==='Gacha' ? rp(playPr)+' <small class="mut">play</small>' : rp(priceOf(v));
    const poolBadge = pl ? `<div style="font-size:.7rem;color:var(--accent);margin-top:2px">🎰 ${esc(pl.name)}</div>` : '';

    return `<button class="tile ${st<=3&&st<9999?'low':''}" onclick="UI.tally('${v.id}',1)">
      <span class="nm">${esc(variantLabel(v))}${poolBadge}</span><span class="pr num">${priceDisplay}</span>
      <span class="stock">${st<9999?st:'∞'}</span>
      ${st<9999?`<span class="l5" onclick="event.stopPropagation();UI.tally('${v.id}',5)">+5</span>`:''}</button>`;}).join('')
   :`<div class="card empty"><div class="big">⚡</div>No variants in this event. Add products in <b>Items</b>.</div>`;
 },
 tally(vid,n){
  if(UI.chan==='Gacha'){
    const pl = poolOf(vid);
    if(!pl){
      toast('Item is not in any Gacha pool');
      return;
    }
  }
  const st=chanStock(vid,UI.chan);
  if(UI.chan!=='PO'&&st<n){toast('Not enough '+UI.chan+' stock for '+variantLabel(vid2var()[vid]));return;}
  const v=vid2var()[vid];
  const e=ev();
  const playPrice = (UI.chan==='Gacha' && e?.playPrice) ? e.playPrice : priceOf(v);
  DB.sales.push({id:uid(),eventId:DB.activeEvent,variantId:vid,channel:UI.chan,qty:n,price:playPrice,ts:nowISO(),createdBy:null});
  logAct('LIVE_TALLY_SALE',variantLabel(v)+' ×'+n+' via '+UI.chan);
  toast('+'+n+' '+variantLabel(v));
  render();
 },

 /* ---- vendors ---- */
  renderVendors(){
    const list=document.getElementById('vendorsList');
    if(!DB.vendors.length){list.innerHTML=`<div class="card empty"><div class="big">◈</div>No vendors yet — add one.</div>`;return;}
    const e = ev();
    
    // Filtering and search
    const q = (UI.venQ||'').toLowerCase().trim();
    const filter = UI.venFilter||'';

    let allVendors = DB.vendors.map(v=>{
      const prods=DB.products.filter(p=>p.vendorId===v.id && (!e||p.eventId===e.id));
      const lots=evList(DB.lots).filter(l=>{
        const effV = l.vendorId || pid2prod()[vid2var()[l.variantId]?.productId]?.vendorId;
        return effV === v.id;
      });
      const activeLots = lots.filter(l=>l.status!=='arrived');
      return { v, prods, lots, activeLots };
    });

    if(q){
      allVendors = allVendors.filter(item => {
        const text = (item.v.name + ' ' + (item.v.notes||'') + ' ' + (item.v.contact||'')).toLowerCase();
        return text.includes(q);
      });
    }

    if(filter === 'active'){
      allVendors = allVendors.filter(item => item.activeLots.length > 0);
    } else if(filter === 'none'){
      allVendors = allVendors.filter(item => item.lots.length === 0);
    }

    const perPage = UI.venPerPage || 10;
    const pages = Math.max(1, Math.ceil(allVendors.length / perPage));
    if(UI.venPage > pages) UI.venPage = pages;
    const paged = allVendors.slice((UI.venPage-1)*perPage, UI.venPage*perPage);

    const filterBar = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
      <input type="search" placeholder="Search vendors…" style="max-width:260px" value="${esc(UI.venQ||'')}" oninput="UI.venQ=this.value;UI.venPage=1;UI.renderVendors()">
      <div class="filters">
        <button class="fbtn ${!filter?'on':''}" onclick="UI.venFilter='';UI.venPage=1;UI.renderVendors()">All <b>${DB.vendors.length}</b></button>
        <button class="fbtn ${filter==='active'?'on':''}" onclick="UI.venFilter='active';UI.venPage=1;UI.renderVendors()">Active orders</button>
        <button class="fbtn ${filter==='none'?'on':''}" onclick="UI.venFilter='none';UI.venPage=1;UI.renderVendors()">No orders</button>
      </div>
      <span style="flex:1"></span>
    </div>`;

    const pagerHtml = UI.buildPager(UI.venPage, allVendors.length, perPage, 'UI.setVenPage', 'UI.setVenPerPage');

    list.innerHTML = `${filterBar}
      <div class="twrap"><table><thead><tr><th>Vendor</th><th>Contact</th><th>Products</th><th>Active Orders</th><th></th></tr></thead><tbody>${
      paged.map(item=>{
        const v = item.v;
        return `<tr>
          <td><b>${esc(v.name)}</b>${v.notes?`<br><small class="mut">${esc(v.notes)}</small>`:''}</td>
          <td>${[v.url&&`<a href="${esc(v.url)}" target="_blank" rel="noopener">🌐 site</a>`,v.social&&`<a href="${esc(v.social)}" target="_blank" rel="noopener">💬 social</a>`,v.market&&`<a href="${esc(v.market)}" target="_blank" rel="noopener">🛒 shop</a>`,v.wa&&`<a href="https://wa.me/${esc(String(v.wa).replace(/^0/,'62').replace(/\D/g,''))}" target="_blank" rel="noopener">📱 WA</a>`].filter(Boolean).join(' · ')||'<span class="mut">—</span>'}</td>
          <td class="num">${item.prods.length} product${item.prods.length===1?'':'s'}</td>
          <td class="num"><span class="chip ${item.activeLots.length?'acc':'ok'}">${item.lots.length} lot${item.lots.length===1?'':'s'} (${item.activeLots.length} active)</span></td>
          <td style="white-space:nowrap">
            <button class="btn sm" onclick="UI.openVendorDetail('${v.id}')">Orders (${item.lots.length})</button>
            <button class="btn sm ghost" onclick="UI.openNewOrder('${v.id}')">+ Order</button>
            <button class="btn sm ghost" onclick="UI.openVendor('${v.id}')">Edit</button>
            <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('vendor','${v.id}')">✕</button>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="empty">No matching vendors found.</td></tr>'}</tbody></table>
      ${pagerHtml}
      </div>`;
  },
  setVenPage(p){ UI.venPage = p; UI.renderVendors(); },
  setVenPerPage(n){ UI.venPerPage = n; UI.venPage = 1; UI.renderVendors(); },

  openVendorDetail(vendorId){
    const v=DB.vendors.find(x=>x.id===vendorId);
    if(!v) return;
    const e=ev();
    let lots=evList(DB.lots).filter(l=>{
      const effV = l.vendorId || pid2prod()[vid2var()[l.variantId]?.productId]?.vendorId;
      return effV === vendorId;
    });

    const q = (UI.venOrdQ||'').toLowerCase().trim();
    const stFilter = UI.venOrdFilter||'';

    if(q){
      lots = lots.filter(l => {
        const va = vid2var()[l.variantId];
        const text = (variantLabel(va||{}) + ' ' + (l.batch||'') + ' ' + (l.purposeNotes||'') + ' ' + (l.defectNotes||'')).toLowerCase();
        return text.includes(q);
      });
    }

    if(stFilter){
      lots = lots.filter(l => (l.status||'todo') === stFilter);
    }

    const perPage = UI.venOrdPerPage || 10;
    const pages = Math.max(1, Math.ceil(lots.length / perPage));
    if(UI.venOrdPage > pages) UI.venOrdPage = pages;
    const paged = lots.slice((UI.venOrdPage-1)*perPage, UI.venOrdPage*perPage);

    const rows = paged.map(l => {
      const va = vid2var()[l.variantId];
      const p = va ? pid2prod()[va.productId] : null;
      const nextMap = { 'todo': 'ordered', 'ordered': 'on-delivery', 'on-delivery': 'arrived' };
      const nextSt = nextMap[l.status||'todo'];
      const stBadge = (l.status==='arrived') ? '<span class="status-pill ok">ARRIVED</span>' :
                      (l.status==='on-delivery') ? '<span class="status-pill warn">ON DELIVERY</span>' :
                      (l.status==='ordered') ? '<span class="status-pill acc">ORDERED</span>' :
                      '<span class="status-pill">TO DO</span>';

      return `<tr>
        <td>
          <b>${esc(va? variantLabel(va) : 'Unknown item')}</b>
          ${l.batch?`<br><small class="mut">Batch ${esc(l.batch)} · PIC: ${esc(l.pic||'—')}</small>`:''}
          ${l.purposeNotes?`<br><small class="mut" style="color:var(--accent)">📝 ${esc(l.purposeNotes)}</small>`:''}
          ${l.defectNotes?`<br><small class="mut" style="color:var(--danger)">⚠️ Defect: ${esc(l.defectNotes)}</small>`:''}
        </td>
        <td><span class="chip">${esc(l.source)}</span></td>
        <td class="num">${l.qtyOrdered||0}</td>
        <td class="num" style="font-weight:700">${l.status==='arrived'? (l.qtyDelivered||0) : '—'}</td>
        <td>${stBadge}</td>
        <td style="white-space:nowrap">
          ${nextSt? `<button class="btn sm" onclick="UI.advanceLotStatus('${l.id}')">Advance ➔ ${nextSt.toUpperCase()}</button>` : '<span class="chip ok">Done</span>'}
          <button class="btn sm ghost" onclick="UI.openLot('${l.variantId}','${l.id}')">Edit</button>
          <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('lot','${l.id}')">✕</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="empty">No matching orders found for this vendor.</td></tr>`;

    const pagerHtml = UI.buildPager(UI.venOrdPage, lots.length, perPage, `UI.setVenOrdPage.bind(null, '${vendorId}')`, `UI.setVenOrdPerPage.bind(null, '${vendorId}')`);

    openModal(`<h2>◈ ${esc(v.name)} — Orders</h2>
      <div class="sub" style="margin-bottom:12px">
        ${[v.url&&`<a href="${esc(v.url)}" target="_blank">Site</a>`, v.wa&&`<a href="https://wa.me/${esc(String(v.wa).replace(/\D/g,''))}" target="_blank">WhatsApp</a>`, v.social, v.market].filter(Boolean).join(' · ')||'No contact links'}
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn sm" onclick="UI.openNewOrder('${v.id}')">+ New Order / Lot</button>
        <input type="search" placeholder="Search orders…" style="max-width:220px" value="${esc(UI.venOrdQ||'')}" oninput="UI.venOrdQ=this.value;UI.venOrdPage=1;UI.openVendorDetail('${vendorId}')">
        <div class="filters">
          <button class="fbtn ${!stFilter?'on':''}" onclick="UI.venOrdFilter='';UI.venOrdPage=1;UI.openVendorDetail('${vendorId}')">All</button>
          <button class="fbtn ${stFilter==='todo'?'on':''}" onclick="UI.venOrdFilter='todo';UI.venOrdPage=1;UI.openVendorDetail('${vendorId}')">To Do</button>
          <button class="fbtn ${stFilter==='ordered'?'on':''}" onclick="UI.venOrdFilter='ordered';UI.venOrdPage=1;UI.openVendorDetail('${vendorId}')">Ordered</button>
          <button class="fbtn ${stFilter==='on-delivery'?'on':''}" onclick="UI.venOrdFilter='on-delivery';UI.venOrdPage=1;UI.openVendorDetail('${vendorId}')">On Delivery</button>
          <button class="fbtn ${stFilter==='arrived'?'on':''}" onclick="UI.venOrdFilter='arrived';UI.venOrdPage=1;UI.openVendorDetail('${vendorId}')">Arrived</button>
        </div>
      </div>
      <div class="twrap" style="max-height:55vh;overflow-y:auto">
        <table>
          <thead><tr><th>Item</th><th>Source</th><th>Ordered</th><th>Delivered</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${pagerHtml}
      </div>
      <div class="actions">
        <button class="btn ghost" onclick="closeModal()">Close</button>
      </div>`, 'lg');
  },
  setVenOrdPage(vendorId, p){ UI.venOrdPage = p; UI.openVendorDetail(vendorId); },
  setVenOrdPerPage(vendorId, n){ UI.venOrdPerPage = n; UI.venOrdPage = 1; UI.openVendorDetail(vendorId); },
  advanceLotStatus(lotId){
    const lot=DB.lots.find(l=>l.id===lotId);
    if(!lot) return;
    const nextMap = { 'todo': 'ordered', 'ordered': 'on-delivery', 'on-delivery': 'arrived' };
    const next = nextMap[lot.status||'todo'];
    if(!next) return;

    if(next==='arrived'){
      // Show inspect / check-in modal
      const v = vid2var()[lot.variantId];
      openModal(`<h2>📦 Confirm Arrival — ${esc(variantLabel(v))}</h2>
        <p class="sub">Verify delivered quantity received from vendor. Enter defect notes if any units are missing or damaged.</p>
        <div class="row">
          <div><label>Qty Ordered</label><input value="${lot.qtyOrdered||0}" disabled style="opacity:.6"></div>
          <div><label>Qty Delivered / Usable</label><input id="f_adv_del" type="number" min="0" value="${lot.qtyOrdered||0}" oninput="document.getElementById('f_adv_def_wrap').style.display = (+this.value < ${lot.qtyOrdered||0}) ? 'block' : 'none'"></div>
        </div>
        <div id="f_adv_def_wrap" style="display:none;margin-top:10px">
          ${fld('Defect / Missing Notes','<input id="f_adv_defect" placeholder="e.g. 3 scratched / misaligned printing">')}
        </div>
        <div class="actions">
          <button class="btn ghost" onclick="closeModal()">Cancel</button>
          <button class="btn" onclick="UI.confirmArrival('${lot.id}')">Confirm Arrival</button>
        </div>`);
      return;
    }

    lot.status = next;
    const v = vid2var()[lot.variantId];
    logAct('ADVANCE_LOT', `${variantLabel(v)} ${lot.batch||'Lot'}: → ${next.toUpperCase()}`);
    save(); render();
    const effV = lot.vendorId || pid2prod()[vid2var()[lot.variantId]?.productId]?.vendorId;
    if(effV) UI.openVendorDetail(effV);
    else toast('Advanced status to ' + next.toUpperCase());
  },
  confirmArrival(lotId){
    const lot=DB.lots.find(l=>l.id===lotId);
    if(!lot) return;
    const del = +document.getElementById('f_adv_del')?.value || 0;
    const defect = document.getElementById('f_adv_defect')?.value || '';
    lot.qtyDelivered = del;
    lot.defectNotes = defect.trim();
    lot.status = 'arrived';
    const v = vid2var()[lot.variantId];
    logAct('ARRIVE_LOT', `${variantLabel(v)} delivered ${del}/${lot.qtyOrdered}${defect?' ('+defect+')':''}`);
    save(); render();
    closeModal();
    const effV = lot.vendorId || pid2prod()[vid2var()[lot.variantId]?.productId]?.vendorId;
    if(effV) UI.openVendorDetail(effV);
    toast('Stock marked arrived: +' + del + ' pcs');
  },
  openNewOrder(vendorId){
    const e = ev();
    const vs = DB.variants.filter(v => pid2prod()[v.productId]?.eventId === e?.id);
    if(!vs.length){ toast('No variants in active event. Add items first.'); return; }
    vs.sort((a,b)=>{
      const pa = pid2prod()[a.productId]?.vendorId === vendorId ? -1 : 1;
      const pb = pid2prod()[b.productId]?.vendorId === vendorId ? -1 : 1;
      return pa - pb;
    });
    const vid = vs[0].id;
    UI.openLot(vid);
    setTimeout(()=>{
      const vSel = document.getElementById('f_lot_vendor');
      if(vSel) vSel.value = vendorId;
      const stSel = document.getElementById('f_lot_status');
      if(stSel){ stSel.value = 'todo'; UI.onLotStatusChange(); }
    }, 10);
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
      <div><button class="btn sm ghost" onclick="UI.openPoolAlloc('${pl.id}')">+ Prize</button> <button class="btn sm ghost" onclick="UI.openPool('${pl.id}')">Edit Pool</button> <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('pool','${pl.id}')">✕</button></div>
    </div>
    <div class="grid g4" style="margin:10px 0">
      <div class="stat"><div class="k">Play price</div><div class="v">${rp(play)}</div></div>
      <div class="stat"><div class="k">EV / pull</div><div class="v ${solvent?'pos':'neg'}">${rp(EV)}</div><div class="d">Σ rate × unit cost</div></div>
      <div class="stat"><div class="k">Margin / pull</div><div class="v ${play-EV>=0?'pos':'neg'}">${rp(play-EV)}</div></div>
      <div class="stat"><div class="k">Verdict</div><div class="v" style="font-size:1rem">${solvent?'✅ Solvent':'⚠️ LOSING'}</div><div class="d">${solvent?'':'prize allocation too generous'}</div></div>
    </div>
    ${!solvent?`<div class="chip bad">EV ≥ play price — reduce top-tier qty/rate or raise play price before printing.</div>`:''}
    <div class="twrap" style="margin-top:8px;border:none"><table><thead><tr><th title="Double-click to change variant" style="cursor:help">Prize (variant) ✎</th><th title="Double-click to edit" style="cursor:help">Qty ✎</th><th title="Double-click to edit" style="cursor:help">Drop rate % ✎</th><th>Unit cost</th><th>Margin @ play</th><th></th></tr></thead><tbody>
    ${rows.map(r=>{
      const aIdx = pl.variants.indexOf(r.a);
      const ratePct = ((r.a.rate||0)*100).toFixed(1);
      return `<tr>
        <td class="editable-cell" style="cursor:pointer" title="Double click to change prize variant" ondblclick="UI.editPoolVariantCell(this, '${pl.id}', ${aIdx}, '${r.v.id}')"><b>${esc(variantLabel(r.v))}</b></td>
        <td class="num editable-cell" style="cursor:pointer" title="Double click to edit Qty" ondblclick="UI.editPoolCell(this, '${pl.id}', ${aIdx}, 'qty', ${r.a.qty})">${r.a.qty}</td>
        <td class="num editable-cell" style="cursor:pointer" title="Double click to edit Drop rate %" ondblclick="UI.editPoolCell(this, '${pl.id}', ${aIdx}, 'rate', ${ratePct})">${ratePct}%</td>
        <td class="num">${rp(r.c)}</td>
        <td class="num ${r.margin<0?'neg':'pos'}">${rp(r.margin)} ${r.margin<0?'<small class="mut">(filler funds this)</small>':''}</td>
        <td style="white-space:nowrap;text-align:right">
          <button class="btn sm ghost" onclick="UI.openEditPoolAlloc('${pl.id}', ${aIdx})" title="Edit prize allocation">Edit</button>
          <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.delPoolAlloc('${pl.id}', ${aIdx})" title="Remove prize from pool">✕</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody></table></div></div>`;}).join('');
 },
 editPoolVariantCell(td, poolId, aIdx, currentVid){
   if(td.querySelector('select')) return; // already editing
   const vs = DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
   const select = document.createElement('select');
   select.className = 'cellinp';
   select.style.cssText = 'font-weight:700;padding:2px 4px;max-width:280px';
   select.innerHTML = vs.map(v=>`<option value="${v.id}" ${v.id===currentVid?'selected':''}>${esc(variantLabel(v))} — ${rp(costOf(v))}</option>`).join('');

   let committed = false;
   const commitChange = () => {
     if(committed) return;
     committed = true;
     const newVid = select.value;
     const pool = DB.pools.find(p=>p.id===poolId);
     if(!pool || !pool.variants[aIdx]){ render(); return; }
     if(newVid && newVid !== currentVid){
       pool.variants[aIdx].variantId = newVid;
       const v = vid2var()[newVid];
       logAct('UPDATE_POOL_ALLOC', `${pool.name}: prize changed → ${v ? variantLabel(v) : newVid}`);
       save();
     }
     render();
   };

   select.onchange = commitChange;
   select.onblur = commitChange;
   select.onkeydown = e => {
     if(e.key === 'Enter'){ commitChange(); }
     if(e.key === 'Escape'){ committed = true; render(); }
   };

   td.textContent = '';
   td.appendChild(select);
   select.focus();
 },
 editPoolCell(td, poolId, aIdx, field, curVal){
   if(td.querySelector('input')) return; // already editing
   const input = document.createElement('input');
   input.type = 'number';
   input.className = 'cellinp num';
   input.style.cssText = 'width:70px;text-align:right;font-weight:700;padding:2px 4px';
   input.value = curVal;
   if(field === 'qty'){
     input.min = '1';
     input.step = '1';
   } else {
     input.min = '0';
     input.step = '0.1';
     input.max = '100';
   }

   const saveChange = () => {
     const pool = DB.pools.find(p=>p.id===poolId);
     if(!pool || !pool.variants[aIdx]) return;
     if(field === 'qty'){
       const newQ = Math.max(1, +input.value || 1);
       pool.variants[aIdx].qty = newQ;
       logAct('UPDATE_POOL_ALLOC', `${pool.name}: ${field} → ${newQ}`);
     } else if(field === 'rate'){
       const newR = Math.max(0, (+input.value || 0)) / 100;
       pool.variants[aIdx].rate = newR;
       logAct('UPDATE_POOL_ALLOC', `${pool.name}: rate → ${(newR*100).toFixed(1)}%`);
     }
     save();
     render();
   };

   input.onblur = saveChange;
   input.onkeydown = e => {
     if(e.key === 'Enter'){ input.blur(); }
     if(e.key === 'Escape'){ td.textContent = field === 'rate' ? curVal + '%' : curVal; }
   };

   td.textContent = '';
   td.appendChild(input);
   input.focus();
   input.select();
 },
 delPoolAlloc(poolId, aIdx){
   const pool = DB.pools.find(p=>p.id===poolId);
   if(!pool || !pool.variants[aIdx]) return;
   const v = vid2var()[pool.variants[aIdx].variantId];
   if(!confirm(`Remove ${v ? variantLabel(v) : 'prize'} from ${pool.name}?`)) return;
   pool.variants.splice(aIdx, 1);
   logAct('DELETE_POOL_ALLOC', `${pool.name}: removed prize`);
   save();
   render();
 },
 openEditPoolAlloc(poolId, aIdx){
   const pool = DB.pools.find(p=>p.id===poolId);
   if(!pool || !pool.variants[aIdx]) return;
   const alloc = pool.variants[aIdx];
   const vs = DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
   openModal(`<h2>Edit Prize Allocation</h2>
     <p class="sub">Update the variant, quantity, or drop probability rate inside <b>${esc(pool.name)}</b>.</p>
     ${fld('Prize (variant)', `<select id="f_bi">${vs.map(v=>`<option value="${v.id}" ${v.id===alloc.variantId?'selected':''}>${esc(variantLabel(v))} — cost ${rp(costOf(v))}</option>`).join('')}</select>`)}
     <div class="row">
       <div><label>Qty</label><input id="f_q" type="number" min="1" value="${alloc.qty||1}"></div>
       <div><label>Drop rate %</label><input id="f_r" type="number" min="0" step="0.1" value="${((alloc.rate||0)*100).toFixed(1)}"></div>
     </div>
     <div class="actions">
       <button class="btn ghost" onclick="closeModal()">Cancel</button>
       <button class="btn" onclick="UI.saveEditAlloc('${poolId}', ${aIdx})">Save Changes</button>
     </div>`);
 },
 saveEditAlloc(poolId, aIdx){
   const pool = DB.pools.find(p=>p.id===poolId);
   if(!pool || !pool.variants[aIdx]) return;
   const g = id => document.getElementById(id).value;
   const vid = g('f_bi');
   const qty = Math.max(1, +g('f_q') || 1);
   const rate = Math.max(0, +g('f_r') || 0) / 100;
   pool.variants[aIdx] = { variantId: vid, qty, rate };
   logAct('UPDATE_POOL_ALLOC', `${pool.name}: updated prize allocation`);
   closeModal();
   save();
   render();
 },

 /* ---- packaging ---- */
packTotalOf(p){return (p.parts||[]).reduce((a,x)=>a+(x.cost||0)*(x.qty||1),0);},
renderPacks(){
  const e=ev();const wrap=document.getElementById('packsList');
  const packs=e?DB.packs.filter(p=>p.eventId===e.id):[];
  if(!packs.length){wrap.innerHTML=`<div class="card empty"><div class="big">📦</div>No pack kits yet. Create one, then add its components (polybag, backing card, bubble…).<br><button class="btn" style="margin-top:10px" onclick="UI.openPack()">+ New pack kit</button></div>`;return;}
  const grand=packs.reduce((s,p)=>s+this.packTotalOf(p),0);
  wrap.innerHTML=`<div class="grid g4" style="margin-bottom:12px">
   <div class="stat"><div class="k">Pack kits</div><div class="v">${packs.length}</div></div>
   <div class="stat"><div class="k">Components</div><div class="v">${packs.reduce((s,p)=>s+(p.parts||[]).length,0)}</div></div>
   <div class="stat"><div class="k">Avg kit cost</div><div class="v num">${rp(Math.round(grand/packs.length))}</div></div>
   <div class="stat"><div class="k">Grand total (1× each)</div><div class="v num">${rp(grand)}</div></div></div>
  `+packs.map(p=>{
    const tot=this.packTotalOf(p);
    return `<div class="card" style="margin-bottom:12px">
     <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
       <div><b style="font-size:1.02rem">${esc(p.name)}</b> <span class="chip acc">${(p.parts||[]).length} component${(p.parts||[]).length===1?'':'s'}</span>${p.notes?` <small class="mut">${esc(p.notes)}</small>`:''}</div>
       <div class="num" style="font-weight:800;font-size:1.2rem;color:var(--accent)">${rp(tot)}</div>
     </div>
     ${(p.parts||[]).length?`<div class="twrap" style="margin-top:10px;border:none"><table><thead><tr><th>Component</th><th style="text-align:center;width:80px">Qty</th><th style="text-align:right;width:140px">Unit</th><th style="text-align:right;width:150px">Line total</th></tr></thead><tbody>${
       p.parts.map(x=>`<tr><td>${esc(x.name)}</td><td class="num" style="text-align:center">${x.qty||1}</td><td class="num" style="text-align:right">${rp(x.cost||0)}</td><td class="num" style="text-align:right">${rp((x.cost||0)*(x.qty||1))}</td></tr>`).join('')
     }</tbody><tfoot><tr><th colspan="3" style="text-align:right">Pack total (× qty)</th><th class="num" style="text-align:right;font-size:.95rem;font-weight:800">${rp(tot)}</th></tr></tfoot></table></div>`
     :`<div class="empty" style="padding:14px">No components yet — add them via Edit.</div>`}
     <div style="margin-top:10px"><button class="btn sm ghost" onclick="UI.openPack('${p.id}')">Edit</button> <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('pack','${p.id}')">✕</button></div>
    </div>`;}).join('');
},
openPack(id){
  const p=DB.packs.find(x=>x.id===id)||{name:'',notes:'',parts:[]};
  openModal(`<h2>${id?'Edit':'New'} pack kit</h2>
   ${fld('Kit name','<input id="f_pname" value="'+esc(p.name)+'" placeholder="Standard merch pack">')}
   <label>Components — what goes inside one unit of packaging</label>
   <div id="f_pparts" style="margin:8px 0"></div>
   <div class="row"><button class="btn sm ghost w0" onclick="UI.addPackPart()">+ Component</button><div style="flex:1"></div><div class="w0" style="font-weight:700">Kit total: <span id="f_ptotal" class="num"></span></div></div>
   ${fld('Notes','<input id="f_pnotes" value="'+esc(p.notes||'')+'">')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.savePack('${id||''}')">Save kit</button></div>`);
  window.__packParts=JSON.parse(JSON.stringify(p.parts||[]));
  UI.drawPackParts();
  UI.packTotal();
},
addPackPart(){window.__packParts.push({name:'',qty:1,cost:0});UI.drawPackParts();UI.packTotal();},
drawPackParts(){
  document.getElementById('f_pparts').innerHTML=(window.__packParts||[]).map((pt,ix)=>`
   <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
     <input style="flex:3;min-width:0" id="f_pp_${ix}_name" placeholder="Component (polybag, card…)" value="${esc(pt.name)}" oninput="window.__packParts[${ix}].name=this.value;UI.packTotal()">
     <input type="number" style="flex:.4;min-width:56px" id="f_pp_${ix}_qty" min="1" value="${pt.qty||1}" title="Qty per pack" oninput="window.__packParts[${ix}].qty=+this.value||1;UI.packTotal()">
     <input type="number" style="flex:.8;min-width:90px" id="f_pp_${ix}_cost" min="0" placeholder="Rp" value="${pt.cost||0}" title="Unit price" oninput="window.__packParts[${ix}].cost=+this.value||0;UI.packTotal()">
     <button class="btn sm ghost w0" onclick="window.__packParts.splice(${ix},1);UI.drawPackParts();UI.packTotal()">✕</button>
   </div>`).join('')||'<small class="mut">No components yet — add one.</small>';
},
packTotal(){const s=(window.__packParts||[]).reduce((a,p)=>a+(p.cost||0)*(p.qty||1),0);const el=document.getElementById('f_ptotal');if(el)el.textContent=rp(s);},
savePack(id){
  const name=document.getElementById('f_pname').value.trim();if(!name){toast('Name required');return;}
  const parts=(window.__packParts||[]).filter(p=>p.name.trim()).map(p=>({name:p.name.trim(),qty:p.qty||1,cost:p.cost||0}));
  const data={name,notes:document.getElementById('f_pnotes').value,parts};
  if(id)Object.assign(DB.packs.find(x=>x.id===id),data);else DB.packs.push({id:uid(),eventId:DB.activeEvent,...data,created:nowISO()});
  logAct(id?'UPDATE_PACK':'CREATE_PACK',name);closeModal();save();render();
},

/* ---- bookings ---- */
 renderBookings(){
  const stage=UI.bookStage;
  const q=(UI.bookQ||'').toLowerCase().trim();
  const all=evList(DB.bookings);
  const matchQ=b=>{if(!q)return true;const hay=[b.customer,b.label,b.address,b.contact,b.notes,(b.items||[]).map(i=>{const v=vid2var()[i.variantId];return (v?variantLabel(v):'')+' '+(i.pack||'')+' '+(i.lineNotes||'');}).join(' ')].filter(Boolean).join(' ').toLowerCase();return hay.includes(q);};
  const rows=all.filter(b=>(!stage||b.status===stage)&&matchQ(b)).sort((a,b)=>(b.created||'').localeCompare(a.created||''));
  UI.__rows=rows;
  const sel=window.__bookSel=window.__bookSel||new Set();
  const view=UI.bookView=UI.bookView||'sheet';
  const cnt=s=>all.filter(b=>(!s||b.status===s)).length;
  document.getElementById('bookFilters').innerHTML=`<div class="filters"><button class="fbtn ${!stage?'on':''}" onclick="UI.bookStage='';render()">All <b>${cnt('')}</b></button>${
   PAYSTAGES.map(s=>`<button class="fbtn ${stage===s?'on':''}" onclick="UI.bookStage='${s}';render()">${s} <b>${cnt(s)}</b></button>`).join('')}</div>
   <div class="viewswitch"><button class="${view==='sheet'?'on':''}" onclick="UI.bookView='sheet';render()">▤ Sheet</button><button class="${view==='orders'?'on':''}" onclick="UI.bookView='orders';render()">☰ Orders</button></div>
   <input type="search" id="bookQ" class="book-search" placeholder="Search orders…" value="${esc(UI.bookQ||'')}" oninput="UI.bookQ=this.value;UI.bookPage=1;render()">
   <span style="flex:1"></span>
   <button class="btn sm danger ${sel.size?'':'ghost'}" ${sel.size?'':'disabled'} onclick="UI.bulkDeleteBookings()">🗑 Delete selected (${sel.size})</button>`;
  const wrap=document.getElementById('bookingsList');
  if(!rows.length){wrap.innerHTML=`<div class="card empty"><div class="big">✉</div>No bookings${stage?' in '+stage:''}${q?' matching “'+esc(q)+'”':''}. Add manually or import a Google Form CSV/XLSX.</div>`;return;}
  if(view==='orders')return this.renderBookingsOrders(wrap,rows,sel);
  UI.bookPage=UI.bookPage||1;UI.bookPerPage=UI.bookPerPage||10;
  const perPage=UI.bookPerPage,pages=Math.max(1,Math.ceil(rows.length/perPage));
  if(UI.bookPage>pages)UI.bookPage=pages;
  const pageRows=rows.slice((UI.bookPage-1)*perPage,UI.bookPage*perPage);
  const money=s=>{s=String(s||'');if(/\.\d{2}\s*$/.test(s))s=s.slice(0,-3);const m=s.replace(/[^\d]/g,'');return m?+m:0;};
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  const txtEdit=(id,field,val,extra)=>`<input class="cellinp" value="${esc(val??'')}" onchange="UI.editBooking('${id}','${field}',this.value)" ${extra||''}>`;
  let html=`<div class="twrap"><table class="sheet"><colgroup>
   <col style="width:36px"><col style="width:44px"><col style="width:10%"><col style="width:8%"><col style="width:8%"><col style="width:17%"><col style="width:8%"><col style="width:6%"><col style="width:9%"><col style="width:9%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:80px">
  </colgroup><thead><tr>
   <th style="width:36px"><label class="custom-checkbox"><input type="checkbox" class="checkbox-input" onchange="UI.selAllBookings(this.checked)" ${sel.size&&sel.size===rows.length?'checked':''}><span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></label></th>
   <th style="width:44px">#</th><th>Customer</th><th>Contact / WA</th><th>Address</th><th>Item</th><th style="width:70px">Packaging</th><th style="width:56px;text-align:center">Qty</th><th style="text-align:right">Line total</th>
   <th>Order total</th><th style="width:80px">Ship</th><th style="width:86px">Fulfil</th><th style="width:96px">Status</th><th style="width:80px;text-align:center">Action</th></tr></thead><tbody>`;
  pageRows.forEach((b,bi)=>{
    const selCls=sel.has(b.id)?' style="background:var(--accent-soft)"':'';
    const lineTotal=i=>i.price??(i.qty*(vid2var()[i.variantId]?priceOf(vid2var()[i.variantId]):0));
    const total=(b.items||[]).reduce((s,i)=>s+lineTotal(i),0)+(b.shipFee||0);
    const stCls=b.status==='paid'||b.status==='fulfilled'||b.status==='shipped'?'ok':b.status==='cancelled'?'bad':'warn';
    const fulSel=`<select class="cellinp" onchange="UI.editBooking('${b.id}','fulfil',this.value)"><option value="pickup" ${b.fulfil!=='mail'?'selected':''}>pickup</option><option value="mail" ${b.fulfil==='mail'?'selected':''}>mail</option></select>`;
    // header band row (order summary) + item sub-rows, like the mock: band = customer/contact/address/#items/order total/ship/fulfil/status
    const n=(b.items||[]).length;
    const oc=['#e5794f','#4d9fff','#4cd98a','#c084fc'][bi%4];
    html+=`<tr class="ordband" style="--oc:${oc}"${selCls?selCls:''} data-oc>
      <td><label class="custom-checkbox"><input type="checkbox" class="checkbox-input" ${sel.has(b.id)?'checked':''} onchange="UI.selBooking('${b.id}')"><span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></label></td>
      <td class="ordnum">${bi+1}</td>
      <td>${txtEdit(b.id,'customer',b.customer)}</td>
      <td>${b.contact?`<a class="walink" href="https://wa.me/${esc(String(b.contact).replace(/\D/g,'').replace(/^0/,'62'))}" target="_blank" rel="noopener">${esc(b.contact)}</a>`:txtEdit(b.id,'contact','')}</td>
      <td>${txtEdit(b.id,'address',b.address)}</td>
      <td class="ordmeta"><span class="ordcount">${n} Item${n===1?'':'s'} in this order</span> <button class="additem" onclick="UI.addItemToBooking('${b.id}')">+ Add Item</button>${b.source?`<small class="ordsrc">📄 ${esc(b.source)}</small>`:''}${b.notes?`<small class="ordsrc">📝 ${esc(b.notes.slice(0,60))}</small>`:''}</td>
      <td></td><td></td><td></td>
      <td class="num ordtotal">${rp(total)}${b.declaredTotal&&b.declaredTotal!==total?`<br><small class="neg">⚠ ${rp(b.declaredTotal)}</small>`:''}</td>
      <td><input class="cellinp num" style="width:100%;text-align:right" type="number" min="0" value="${b.shipFee||0}" onchange="UI.editBooking('${b.id}','shipFee',this.value)"></td>
      <td>${fulSel}</td>
      <td><span class="status-pill ${stCls}" onclick="UI.cycleBookStage('${b.id}')">${esc(b.status)}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:5px;justify-content:center">
          ${b.status==='paid'?`<button class="btn sm" style="padding:4px 8px;min-height:28px" onclick="UI.fulfilBooking('${b.id}')" title="Fulfill order">✓</button>`:''}
          <button class="btn sm ghost" style="color:var(--danger);padding:4px 8px;min-height:28px" onclick="UI.del('booking','${b.id}')" title="Delete order">✕</button>
        </div>
      </td>
    </tr>`;
    (b.items&&b.items.length?b.items:[{}]).forEach((i,ix)=>{
      const isBundle = !!i.bundleId;
      const bundle = isBundle ? (DB.bundles||[]).find(bd=>bd.id===i.bundleId) : null;
      const v = vid2var()[i.variantId];
      const itemCell = isBundle
        ? `<span>🎁 <b style="color:var(--accent)">Bundle: ${esc(bundle?bundle.name:'Unknown')}</b> <small class="mut">(${bundle?(bundle.items||[]).length:0} items)</small></span>`
        : `<select class="cellinp" onchange="UI.editBookItem('${b.id}',${ix},'variantId',this.value)">${vs.map(v2=>`<option value="${v2.id}" ${v&&v.id===v2.id?'selected':''}>${esc(variantLabel(v2))}</option>`).join('')}</select>${i.lineNotes?`<small class="mut" style="display:block;font-size:.7rem" title="${esc(i.lineNotes)}">📝 ${esc(i.lineNotes.slice(0,40))}</small>`:''}`;

      html+=`<tr class="ordsub">
      <td></td>
      <td class="mut num subnum">${bi+1}.${ix+1}</td>
      <td><span class="mut">″</span></td><td></td><td></td>
      <td>${itemCell}</td>
      <td>${isBundle?'<span class="mut">—</span>':`<input class="cellinp cellpack" placeholder="+ pkg" value="${esc(i.pack||'')}" onchange="UI.editBookItem('${b.id}',${ix},'pack',this.value)">`}</td>
      <td>${i.qty!==undefined?`<input class="cellinp num" style="width:100%;text-align:center" type="number" min="1" value="${i.qty}" onchange="UI.editBookItem('${b.id}',${ix},'qty',this.value)">`:''}</td>
      <td class="num" style="text-align:right">${i.qty?rp(lineTotal(i)):''}</td>
      <td></td><td></td><td></td><td></td><td></td>
      </tr>`;});
   });
  const pageOf=(i)=>{const p=[];let s=Math.max(1,i-2),e=Math.min(pages,s+4);s=Math.max(1,e-4);
   for(let k=s;k<=e;k++)p.push(`<button class="fbtn ${k===i?'on':''}" style="min-width:34px;justify-content:center" onclick="UI.bookPage=${k};render()">${k}</button>`);return p.join('');};
  html+=`</tbody></table></div>
  <div style="display:flex;align-items:center;gap:14px;padding:12px 6px;flex-wrap:wrap">
   <span class="mut" style="font-size:.85rem">Page</span>
   <span class="num" style="font-weight:700;background:var(--accent);color:#fff;border-radius:8px;padding:4px 10px">${UI.bookPage}</span>
   <span class="mut" style="font-size:.85rem">of ${pages} · ${rows.length} orders</span>
   <span class="mut" style="font-size:.85rem;margin-left:10px">Rows per page</span>
   <select style="width:auto" onchange="UI.bookPerPage=+this.value;UI.bookPage=1;render()">${[10,50,100].map(x=>`<option ${x===perPage?'selected':''}>${x}</option>`).join('')}</select>
   <span style="flex:1"></span>
   <button class="fbtn" ${UI.bookPage<=1?'disabled style="opacity:.4"':''} title="First page" onclick="UI.bookPage=1;render()">⏮</button>
   <button class="fbtn" ${UI.bookPage<=1?'disabled style="opacity:.4"':''} onclick="if(UI.bookPage>1){UI.bookPage--;render()}">‹</button>
   ${pageOf(UI.bookPage)}
   <button class="fbtn" ${UI.bookPage>=pages?'disabled style="opacity:.4"':''} onclick="if(UI.bookPage<${pages}){UI.bookPage++;render()}">›</button>
   <button class="fbtn" ${UI.bookPage>=pages?'disabled style="opacity:.4"':''} title="Last page (${pages})" onclick="UI.bookPage=${pages};render()">⏭</button>
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
  selAllBookings(on){const s=window.__bookSel;(UI.__rows||[]).forEach(b=>on?s.add(b.id):s.delete(b.id));render();},

  renderBookingsOrders(wrap,rows,sel){
   const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
   const OCOLORS=['#94a3b8','#7c8aa0','#8a94a6','#75808f','#9aa5b1','#8494a5'];
   const lineTotal=i=>i.price??(i.qty*(vid2var()[i.variantId]?priceOf(vid2var()[i.variantId]):0));
   const waLink=c=>{const d=String(c||'').replace(/\D/g,'');if(!d)return'';return 'https://wa.me/'+(d.startsWith('62')?d:'62'+d.replace(/^0/,''));};
   const collapsed=window.__ordCollapsed=window.__ordCollapsed||new Set();
   UI.ordPage=UI.ordPage||1;UI.ordPerPage=UI.ordPerPage||10;
   const pages=Math.max(1,Math.ceil(rows.length/UI.ordPerPage));
   if(UI.ordPage>pages)UI.ordPage=pages;
   const pageRows=rows.slice((UI.ordPage-1)*UI.ordPerPage,UI.ordPage*UI.ordPerPage);
   const allOpen=window.__ordAllOpen===true;
   const isOpen=b=>allOpen?true:!collapsed.has(b.id);
   const pageOf=(i)=>{const p=[];let s=Math.max(1,i-2),e=Math.min(pages,s+4);s=Math.max(1,e-4);
    for(let k=s;k<=e;k++)p.push(`<button class="fbtn ${k===i?'on':''}" style="min-width:34px;justify-content:center" onclick="UI.ordPage=${k};render()">${k}</button>`);return p.join('');};
   wrap.innerHTML=`<div class="ordbar">
     <span class="mut" style="font-size:.82rem">${rows.length} order${rows.length===1?'':'s'}${rows.length?` · showing ${(UI.ordPage-1)*UI.ordPerPage+1}–${Math.min(UI.ordPage*UI.ordPerPage,rows.length)}`:''}</span>
     <span style="flex:1"></span>
     <button class="fbtn" onclick="UI.expandAllOrders(true)">⤢ Expand all</button>
     <button class="fbtn" onclick="UI.expandAllOrders(false)">⤡ Collapse all</button>
    </div>
    <div class="ordwrap ordwrap-air">${pageRows.map((b,bi)=>{
    const oc=OCOLORS[bi%OCOLORS.length];
     const total=(b.items||[]).reduce((s,i)=>s+lineTotal(i),0)+(b.shipFee||0);
     const open=isOpen(b);
     const onum=(UI.ordPage-1)*UI.ordPerPage+bi+1;
    const stCls=b.status==='paid'||b.status==='fulfilled'||b.status==='shipped'?'ok':b.status==='cancelled'?'bad':'warn';
    const packs=[...new Set((b.items||[]).map(i=>i.pack).filter(Boolean))];
    const notes=[...(b.items||[]).map(i=>i.lineNotes).filter(Boolean),...(b.notes?[b.notes]:[])].slice(0,3);
    return `
    <div class="ordhead ${open?'open':''}" style="--oc:${oc}" onclick="UI.toggleOrder('${b.id}')">
      <span onclick="event.stopPropagation()"><label class="custom-checkbox"><input type="checkbox" class="checkbox-input" ${sel.has(b.id)?'checked':''} onchange="UI.selBooking('${b.id}')"><span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span></label></span>
      <span class="onum">#${onum}</span>
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
      ${(b.items||[]).map((i,ix)=>{
        const isBundle = !!i.bundleId;
        const bundle = isBundle ? (DB.bundles||[]).find(bd=>bd.id===i.bundleId) : null;
        const v = vid2var()[i.variantId];
        const itemContent = isBundle
          ? `<span>🎁 <b style="color:var(--accent)">Bundle: ${esc(bundle?bundle.name:'Unknown')}</b> <small class="mut">(${(bundle?.items||[]).length} items)</small></span>`
          : `<select class="cellinp" onchange="UI.editBookItem('${b.id}',${ix},'variantId',this.value)">${vs.map(v2=>`<option value="${v2.id}" ${v&&v.id===v2.id?'selected':''}>${esc(variantLabel(v2))}</option>`).join('')}</select> <input class="cellinp" style="width:110px;display:inline-block;font-size:.75rem" placeholder="+ packaging" value="${esc(i.pack||'')}" onchange="UI.editBookItem('${b.id}',${ix},'pack',this.value)" onclick="event.stopPropagation()">${i.lineNotes?` <small class="mut">📝 ${esc(i.lineNotes)}</small>`:''}`;

        return `<div class="orditem" style="--oc:${oc}">
        <span class="inum">${onum}.${ix+1}</span>
        <span>${itemContent}</span>
        <span class="mut" style="font-size:.78rem">${b.source?'📄 '+esc(b.source.split(' · ')[1]||''):'<span class="chip">'+esc(b.status)+'</span>'}</span>
        <span style="text-align:center"><span class="qty-stepper"><button class="qty-btn" onclick="UI.stepQty('${b.id}',${ix},-1)">−</button><input class="qty-input-field" type="number" min="1" value="${i.qty??1}" onchange="UI.editBookItem('${b.id}',${ix},'qty',this.value)"><button class="qty-btn" onclick="UI.stepQty('${b.id}',${ix},1)">+</button></span></span>
        <span class="num" style="text-align:right;font-weight:600">${rp(lineTotal(i))}</span>
        <span><button class="btn sm ghost" style="color:var(--danger)" onclick="UI.delBookingItem('${b.id}',${ix})">✕</button></span>
      </div>`;}).join('')}
      ${b.source?`<div class="ordend">order source: ${esc(b.source)}</div>`:''}
    </div>`;}).join('')}</div>
   <div style="display:flex;align-items:center;gap:14px;padding:14px 6px;flex-wrap:wrap">
    <span class="mut" style="font-size:.85rem">Page</span>
    <span class="num" style="font-weight:700;background:var(--accent);color:#fff;border-radius:8px;padding:4px 10px">${UI.ordPage}</span>
    <span class="mut" style="font-size:.85rem">of ${pages}</span>
    <span class="mut" style="font-size:.85rem;margin-left:10px">Per page</span>
    <select style="width:auto" onchange="UI.ordPerPage=+this.value;UI.ordPage=1;render()">${[10,50,100].map(x=>`<option ${x===UI.ordPerPage?'selected':''}>${x}</option>`).join('')}</select>
    <span style="flex:1"></span>
    <button class="fbtn" ${UI.ordPage<=1?'disabled style="opacity:.4"':''} title="First page" onclick="UI.ordPage=1;render()">⏮</button>
    <button class="fbtn" ${UI.ordPage<=1?'disabled style="opacity:.4"':''} onclick="if(UI.ordPage>1){UI.ordPage--;render()}">‹</button>
    ${pageOf(UI.ordPage)}
    <button class="fbtn" ${UI.ordPage>=pages?'disabled style="opacity:.4"':''} onclick="if(UI.ordPage<${pages}){UI.ordPage++;render()}">›</button>
    <button class="fbtn" ${UI.ordPage>=pages?'disabled style="opacity:.4"':''} title="Last page (${pages})" onclick="UI.ordPage=${pages};render()">⏭</button>
   </div>`;
 },
 expandAllOrders(open){window.__ordAllOpen=!!open;render();},
 toggleOrder(id){const c=window.__ordCollapsed=window.__ordCollapsed||new Set();c.has(id)?c.delete(id):c.add(id);window.__ordAllOpen=false;render();},
 stepQty(id,ix,d){const b=DB.bookings.find(x=>x.id===id);if(!b||!b.items[ix])return;const i=b.items[ix];this.editBookItem(id,ix,'qty',(i.qty||1)+d);},
 delBookingItem(id,ix){const b=DB.bookings.find(x=>x.id===id);if(!b)return;if(!confirm('Remove this item line?'))return;b.items.splice(ix,1);logAct('UPDATE_BOOKING','item['+ix+'] removed');save();render();},
 bulkDeleteBookings(){
  const s=window.__bookSel;if(!s.size)return;
  if(!confirm('Delete '+s.size+' booking(s)? This cannot be undone.'))return;
  DB.bookings=DB.bookings.filter(b=>!s.has(b.id));
  logAct('DELETE_BOOKING','bulk delete '+s.size+' bookings');s.clear();save();render();
 },
 setBookStage(id,st){const b=DB.bookings.find(x=>x.id===id);if(!b)return;b.status=st;logAct('UPDATE_BOOKING','status → '+st);save();render();},
 addItemToBooking(id){const b=DB.bookings.find(x=>x.id===id);if(!b)return;
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  if(!vs.length){toast('No items in catalog');return;}
  b.items.push({variantId:vs[0].id,qty:1});logAct('UPDATE_BOOKING','item added');save();render();},
 editOrderLabel(id){const b=DB.bookings.find(x=>x.id===id);if(!b)return;
  const v=prompt('Order label (e.g. "dus besar batch", "staff order", customer nickname):',b.label||'');
  if(v===null)return;b.label=v.trim();logAct('UPDATE_BOOKING','label → '+b.label);save();render();},
 cycleBookStage(id){const b=DB.bookings.find(x=>x.id===id);if(!b)return;
  const next=PAYSTAGES[(PAYSTAGES.indexOf(b.status)+1)%PAYSTAGES.length];
  b.status=next;logAct('UPDATE_BOOKING','status → '+next);save();render();},
 fulfilBooking(id){ // converts demand → stock movement: writes PO sale records
  const b=DB.bookings.find(x=>x.id===id); if(!b)return;
  (b.items||[]).forEach(i=>{
    if(i.bundleId){
      const bundle=(DB.bundles||[]).find(bd=>bd.id===i.bundleId);
      if(bundle){
        const base = bundleBasePrice(bundle);
        const finalPerUnit = bundlePrice(bundle);
        (bundle.items||[]).forEach(bi=>{
          const v=vid2var()[bi.variantId]; if(!v) return;
          let unitPrice = 0;
          if(!bi.isFree && base > 0){
            unitPrice = Math.round((priceOf(v)*(bi.qty||1)/base) * finalPerUnit / (bi.qty||1));
          }
          DB.sales.push({
            id: uid(), eventId: b.eventId, variantId: bi.variantId,
            channel: i.channel||'PO', qty: (bi.qty||1) * (i.qty||1), price: unitPrice,
            bundleId: bundle.id, bookingId: b.id, ts: nowISO(), createdBy: null
          });
        });
      }
    } else {
      const v=vid2var()[i.variantId];if(!v)return;
      const unit=i.price!=null?(i.qty?i.price/i.qty:i.price):priceOf(v);
      DB.sales.push({id:uid(),eventId:b.eventId,variantId:i.variantId,channel:i.channel||'PO',qty:i.qty,price:unit,ts:nowISO(),bookingId:b.id,createdBy:null});
    }
  });
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

    /* Group bundle sales together vs standalone sales */
    const allSales = evList(DB.sales).slice().sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));
    let groups = [];
    const bundleMap = {};
    allSales.forEach(r=>{
      if(r.bundleId && r.bookingId){
        const key = r.bookingId + '_' + r.bundleId;
        if(!bundleMap[key]){
          bundleMap[key] = { type: 'bundle', bundleId: r.bundleId, bookingId: r.bookingId, ts: r.ts, channel: r.channel, items: [] };
          groups.push(bundleMap[key]);
        }
        bundleMap[key].items.push(r);
      } else {
        groups.push({ type: 'single', record: r });
      }
    });

    // Search and Filter
    const q = (UI.salesQ||'').toLowerCase().trim();
    const chFilter = UI.salesChanFilter||'';

    if(q){
      groups = groups.filter(g=>{
        if(g.type==='bundle'){
          const b = (DB.bundles||[]).find(bd=>bd.id===g.bundleId);
          const bName = b ? b.name : '';
          const itemsText = g.items.map(i=>variantLabel(vid2var()[i.variantId]||{})).join(' ');
          return (bName + ' ' + itemsText + ' ' + g.channel).toLowerCase().includes(q);
        } else {
          const v = vid2var()[g.record.variantId];
          return (variantLabel(v||{}) + ' ' + g.record.channel).toLowerCase().includes(q);
        }
      });
    }

    if(chFilter){
      groups = groups.filter(g => g.channel === chFilter);
    }

    const perPage = UI.salesPerPage || 10;
    const pages = Math.max(1, Math.ceil(groups.length / perPage));
    if(UI.salesPage > pages) UI.salesPage = pages;
    const paged = groups.slice((UI.salesPage-1)*perPage, UI.salesPage*perPage);

    const salesHtml = paged.map((g, gix)=>{
      if(g.type==='bundle'){
        const bundle = (DB.bundles||[]).find(b=>b.id===g.bundleId);
        const bName = bundle ? bundle.name : 'Bundle';
        const totalQty = g.items.reduce((s,x)=>s+(x.qty||0), 0);
        const totalRev = g.items.reduce((s,x)=>s+(x.qty||0)*(x.price||0), 0);
        const totalProfit = g.items.reduce((s,x)=>{
          const v = vid2var()[x.variantId];
          return s + (x.qty||0)*((x.price||0) - costOf(v||{}));
        }, 0);
        const gid = 'bg_' + gix;

        const subrows = g.items.map(r=>{
          const v = vid2var()[r.variantId];
          const profit = (r.qty||0)*((r.price||0) - costOf(v||{}));
          return `<tr class="ordsub" style="background:var(--bg)">
            <td style="padding-left:24px"><span class="mut">↳</span></td>
            <td>${esc(v? variantLabel(v) : '?')}</td>
            <td><span class="chip">${esc(r.channel)}</span></td>
            <td class="num" style="text-align:right">${r.qty}</td>
            <td class="num" style="text-align:right">${rp(r.price)}</td>
            <td class="num ${profit>=0?'pos':'neg'}" style="text-align:right">${rp(profit)}</td>
          </tr>`;
        }).join('');

        return `<tr style="cursor:pointer;background:color-mix(in srgb,var(--accent) 5%,var(--card))" onclick="const el=document.getElementById('${gid}');if(el)el.style.display=el.style.display==='none'?'':'none';this.querySelector('.chev-b').textContent=el.style.display==='none'?'▸':'▾'">
          <td class="mut">${fmtDT(g.ts)}</td>
          <td><b>🎁 Bundle: ${esc(bName)}</b> <span class="chev-b mut" style="font-size:.8rem;margin-left:4px">▾</span></td>
          <td><span class="chip acc">${esc(g.channel)}</span></td>
          <td class="num" style="text-align:right">${totalQty}</td>
          <td class="num" style="text-align:right;font-weight:700">${rp(totalRev)}</td>
          <td class="num ${totalProfit>=0?'pos':'neg'}" style="text-align:right;font-weight:700">${rp(totalProfit)}</td>
        </tr>
        <tbody id="${gid}">${subrows}</tbody>`;
      } else {
        const r = g.record;
        const v = vid2var()[r.variantId];
        const profit = (r.qty||0)*((r.price||0) - costOf(v||{}));
        return `<tr>
          <td class="mut">${fmtDT(r.ts)}</td>
          <td>${esc(v? variantLabel(v) : '?')}</td>
          <td><span class="chip acc">${esc(r.channel)}</span></td>
          <td class="num" style="text-align:right">${r.qty}</td>
          <td class="num" style="text-align:right">${rp(r.price)}</td>
          <td class="num ${profit>=0?'pos':'neg'}" style="text-align:right">${rp(profit)}</td>
        </tr>`;
      }
    }).join('') || '<tr><td colspan="6" class="empty">No sale records match filters.</td></tr>';

    const pagerHtml = UI.buildPager(UI.salesPage, groups.length, perPage, 'UI.setSalesPage', 'UI.setSalesPerPage');

    document.getElementById('salesTable').innerHTML=`<thead><tr><th>When</th><th>Item</th><th>Channel</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Profit</th></tr></thead><tbody>${salesHtml}</tbody>`;
    
    // Add or update sales filter bar above salesTable
    let barEl = document.getElementById('salesFilterBar');
    if(!barEl){
      barEl = document.createElement('div');
      barEl.id = 'salesFilterBar';
      barEl.style.cssText = 'display:flex;gap:10px;align-items:center;margin-top:14px;margin-bottom:10px;flex-wrap:wrap';
      document.getElementById('salesTable').parentElement.before(barEl);
    }
    barEl.innerHTML = `<input type="search" placeholder="Search sales &amp; items…" style="max-width:260px" value="${esc(UI.salesQ||'')}" oninput="UI.salesQ=this.value;UI.salesPage=1;UI.renderSales()">
      <div class="filters">
        <button class="fbtn ${!chFilter?'on':''}" onclick="UI.salesChanFilter='';UI.salesPage=1;UI.renderSales()">All Channels</button>
        ${CHANS.map(c=>`<button class="fbtn ${chFilter===c?'on':''}" onclick="UI.salesChanFilter='${c}';UI.salesPage=1;UI.renderSales()">${c}</button>`).join('')}
      </div>`;

    let pagerWrap = document.getElementById('salesPagerWrap');
    if(!pagerWrap){
      pagerWrap = document.createElement('div');
      pagerWrap.id = 'salesPagerWrap';
      document.getElementById('salesTable').parentElement.after(pagerWrap);
    }
    pagerWrap.innerHTML = pagerHtml;
  },
  setSalesPage(p){ UI.salesPage = p; UI.renderSales(); },
  setSalesPerPage(n){ UI.salesPerPage = n; UI.salesPage = 1; UI.renderSales(); },

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
  const p=DB.products.find(x=>x.id==document.getElementById('calcAttach').value); if(!p)return;
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
   ${!e.archived?`<button class="btn sm ghost" onclick="UI.archiveEvent('${e.id}')">Archive</button>`:`<button class="btn sm ghost" onclick="UI.openDeadstockModal('${e.id}')" title="View deadstock & carry over">Deadstock</button>`}</div>`).join('')
   +`<div style="margin-top:10px"><button class="btn ghost sm" onclick="UI.openNewEvent()">+ New event</button></div>`;

  let logs = DB.log || [];
  const q = (UI.logQ||'').toLowerCase().trim();
  const filter = UI.logOutcomeFilter||'';

  if(q){
    logs = logs.filter(l => (l.type + ' ' + (l.detail||'') + ' ' + (l.outcome||'')).toLowerCase().includes(q));
  }
  if(filter){
    logs = logs.filter(l => l.outcome === filter);
  }

  const perPage = UI.logPerPage || 10;
  const pages = Math.max(1, Math.ceil(logs.length / perPage));
  if(UI.logPage > pages) UI.logPage = pages;
  const paged = logs.slice((UI.logPage-1)*perPage, UI.logPage*perPage);

  const filterBar = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
    <input type="search" placeholder="Search audit log…" style="max-width:240px" value="${esc(UI.logQ||'')}" oninput="UI.logQ=this.value;UI.logPage=1;UI.renderSync()">
    <div class="filters">
      <button class="fbtn ${!filter?'on':''}" onclick="UI.logOutcomeFilter='';UI.logPage=1;UI.renderSync()">All <b>${DB.log.length}</b></button>
      <button class="fbtn ${filter==='ok'?'on':''}" onclick="UI.logOutcomeFilter='ok';UI.logPage=1;UI.renderSync()">OK only</button>
      <button class="fbtn ${filter==='error'?'on':''}" onclick="UI.logOutcomeFilter='error';UI.logPage=1;UI.renderSync()">Errors</button>
    </div>
  </div>`;

  const pagerHtml = UI.buildPager(UI.logPage, logs.length, perPage, 'UI.setLogPage', 'UI.setLogPerPage');

  const wrap = document.getElementById('logTable').parentElement;
  let topBar = document.getElementById('logFilterBar');
  if(!topBar){
    topBar = document.createElement('div');
    topBar.id = 'logFilterBar';
    wrap.before(topBar);
  }
  topBar.innerHTML = filterBar;

  let pagerWrap = document.getElementById('logPagerWrap');
  if(!pagerWrap){
    pagerWrap = document.createElement('div');
    pagerWrap.id = 'logPagerWrap';
    wrap.after(pagerWrap);
  }
  pagerWrap.innerHTML = pagerHtml;

  document.getElementById('logTable').innerHTML=`<thead><tr><th>When</th><th>Action</th><th>Details</th><th>Entities</th><th>Outcome</th></tr></thead><tbody>${
   paged.map(l=>`<tr><td class="mut" style="white-space:nowrap">${fmtDT(l.ts)}</td><td><span class="chip acc">${esc(l.type)}</span></td><td>${esc(l.detail)}</td><td class="mut" style="font-size:.78rem">${Object.entries(l.counts||{}).map(([k,v])=>k+':'+v).join(' · ')}</td><td>${l.outcome==='ok'?'<span class="chip ok">ok</span>':'<span class="chip bad">'+esc(l.outcome)+'</span>'}</td></tr>`).join('')||'<tr><td colspan=5 class="empty">No log entries match.</td></tr>'}</tbody>`;
 },
 setLogPage(p){ UI.logPage = p; UI.renderSync(); },
 setLogPerPage(n){ UI.logPerPage = n; UI.logPage = 1; UI.renderSync(); },
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
  const diff=Object.entries({events:'events',products:'products',variants:'variants',vendors:'vendors',lots:'lots',sales:'sales',pools:'pools',bookings:'bookings',packs:'packs',todos:'todos',expenses:'expenses'})
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
  let added=0;for(const k of['events','products','variants','vendors','lots','sales','pools','bookings','packs','todos','expenses','log']){
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
 archiveEvent(id){
    const e=DB.events.find(x=>x.id===id);
    if(!e) return;

    // Calculate remaining stock across all active variants in this event
    const varsWithStock = DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===id)
      .map(v=>({ v, stock: stockOf(v.id, id) }))
      .filter(x=>x.stock > 0);

    const rows = varsWithStock.map(x=>`
      <tr>
        <td><b>${esc(variantLabel(x.v))}</b></td>
        <td class="num" style="text-align:right">
          <input type="number" min="0" id="opname_${x.v.id}" data-vid="${x.v.id}" data-unitcost="${costOf(x.v)}" value="${x.stock}" style="width:75px;text-align:right;font-weight:700;display:inline-block" oninput="UI.calcOpnameTotal()"> pcs
        </td>
        <td class="num" id="opname_loss_${x.v.id}" style="text-align:right;color:var(--danger)">${rp(x.stock * costOf(x.v))}</td>
      </tr>
    `).join('') || `<tr><td colspan="3" class="empty">No remaining stock detected. Clean close!</td></tr>`;

    const totalLoss = varsWithStock.reduce((s,x)=>s + (x.stock * costOf(x.v)), 0);

    openModal(`<h2>📦 Archive Event &amp; Stock Opname — ${esc(e.name)}</h2>
      <p class="sub">Past events become read-only archives. Verify or adjust the actual remaining units below. Confirmed units will be recorded as <b>Deadstock (Written-off Loss)</b> in history, and can be carried over into other events.</p>
      <div class="twrap" style="max-height:45vh;overflow-y:auto;margin:12px 0">
        <table>
          <thead><tr><th>Variant</th><th style="text-align:right">Remaining Stock (Opname)</th><th style="text-align:right">Loss Value</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><th colspan="2">Total Write-off Loss</th><th id="opname_total_loss" style="text-align:right;color:var(--danger)">${rp(totalLoss)}</th></tr></tfoot>
        </table>
      </div>
      <div class="actions">
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn danger" onclick="UI.doArchiveEvent('${id}')">Confirm Archive &amp; Write-off</button>
      </div>`);
  },
  calcOpnameTotal(){
    let total = 0;
    document.querySelectorAll('input[id^="opname_"]').forEach(inp => {
      const vid = inp.dataset.vid;
      const cost = parseFloat(inp.dataset.unitcost) || 0;
      const qty = Math.max(0, parseInt(inp.value, 10) || 0);
      const loss = qty * cost;
      total += loss;
      const lossEl = document.getElementById('opname_loss_' + vid);
      if(lossEl) lossEl.textContent = rp(loss);
    });
    const totEl = document.getElementById('opname_total_loss');
    if(totEl) totEl.textContent = rp(total);
  },
  doArchiveEvent(id){
    const e=DB.events.find(x=>x.id===id);
    if(!e) return;
    e.archived = true;

    // Flag confirmed remaining lots as deadstock
    let deadstockCount = 0;
    DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===id).forEach(v=>{
      const inp = document.getElementById('opname_' + v.id);
      const st = inp ? Math.max(0, parseInt(inp.value, 10) || 0) : stockOf(v.id, id);
      if(st > 0){
        deadstockCount += st;
        // Mark or create a deadstock lot record for carry-over
        const existingDeadstock = DB.lots.find(l=>l.eventId===id && l.variantId===v.id && l.isDeadstock);
        if(existingDeadstock){
          existingDeadstock.qtyDelivered = st;
          existingDeadstock.qtyOrdered = st;
        } else {
          DB.lots.push({
            id: uid(), eventId: id, variantId: v.id,
            vendorId: pid2prod()[v.productId]?.vendorId || null,
            qtyOrdered: st, qtyDelivered: st, source: 'Custom',
            purposeNotes: 'Deadstock opname from ' + e.name,
            batch: 'DEADSTOCK', status: 'arrived', isDeadstock: true,
            unitCost: costOf(v), pic: 'Opname', created: nowISO()
          });
        }
        logAct('DEADSTOCK_WRITEOFF', `${variantLabel(v)}: ${st} pcs write-off (cost ${rp(st * costOf(v))})`);
      }
    });

    logAct('ARCHIVE_EVENT', `${e.name} archived · ${deadstockCount} deadstock units logged`);
    closeModal(); save(); render();
    toast(`Archived "${e.name}" — ${deadstockCount} units marked deadstock`);
  },
  openDeadstockModal(eventId){
    const evObj = DB.events.find(e=>e.id===eventId);
    if(!evObj) return;
    const deadLots = DB.lots.filter(l=>l.eventId===eventId && l.isDeadstock);
    const targetEvents = DB.events.filter(e=>!e.archived && e.id!==eventId);

    const rows = deadLots.map(l=>{
      const v = vid2var()[l.variantId];
      const carried = !!l.deadstockCarriedTo;
      const carriedEv = carried ? DB.events.find(e=>e.id===l.deadstockCarriedTo) : null;
      return `<tr>
        <td><b>${esc(v ? variantLabel(v) : '?')}</b></td>
        <td class="num" style="text-align:right;font-weight:700">${l.qtyDelivered} pcs</td>
        <td class="num" style="text-align:right">${rp(l.qtyDelivered * (l.unitCost||0))}</td>
        <td style="text-align:center">
          ${carried ? `<span class="chip ok">Carried to ${esc(carriedEv?.name || 'event')}</span>` : `<span class="chip dim">Available</span>`}
        </td>
        <td style="text-align:right">
          ${!carried && targetEvents.length ? `<button class="btn sm ghost" onclick="UI.openCarryOverPrompt('${l.id}')">Carry over →</button>` : (!targetEvents.length && !carried ? '<span class="mut" style="font-size:.78rem">Create active event first</span>' : '')}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">No deadstock units recorded for this event.</td></tr>';

    openModal(`<h2>📦 Deadstock Records — ${esc(evObj.name)}</h2>
      <p class="sub">Leftover units recorded at event close. You can carry over remaining units into an active target event as a new stock lot.</p>
      <div class="twrap" style="max-height:45vh;overflow-y:auto;margin:12px 0">
        <table>
          <thead><tr><th>Variant</th><th style="text-align:right">Units</th><th style="text-align:right">Value</th><th style="text-align:center">Status</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="actions">
        <button class="btn ghost" onclick="closeModal()">Close</button>
      </div>`);
  },
  openCarryOverPrompt(lotId){
    const lot = DB.lots.find(l=>l.id===lotId);
    if(!lot) return;
    const v = vid2var()[lot.variantId];
    const targetEvents = DB.events.filter(e=>!e.archived);
    if(!targetEvents.length){ toast('No active target events available.'); return; }

    openModal(`<h2>Carry over deadstock lot</h2>
      <p class="sub">${esc(v ? variantLabel(v) : '?')} · <b>${lot.qtyDelivered} pcs</b> (unit cost: ${rp(lot.unitCost||0)})</p>
      ${fld('Target Event', `<select id="f_co_event">${targetEvents.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>`)}
      ${fld('New Channel / Source', `<select id="f_co_source">${LOT_SOURCES.map(s=>`<option value="${s}" ${s==='Gacha'?'selected':''}>${s}</option>`).join('')}</select>`)}
      <div class="actions">
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn" onclick="UI.doCarryOverDeadstock('${lotId}')">Create Lot in Target Event</button>
      </div>`);
  },
  doCarryOverDeadstock(lotId){
    const targetEvId = document.getElementById('f_co_event')?.value;
    const newSource = document.getElementById('f_co_source')?.value || 'Gacha';
    if(!targetEvId){ toast('Target event required.'); return; }
    const success = carryOverDeadstock(lotId, targetEvId, newSource);
    if(success){
      closeModal();
      toast('Deadstock carried over to new event');
      render();
    } else {
      toast('Failed to carry over deadstock');
    }
  },
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
   const names={product:'product (and its variants)',variant:'variant',vendor:'vendor',pool:'gacha pool',booking:'booking',todo:'task',lot:'stock lot',pack:'pack kit'};
   if(!confirm('Delete this '+names[kind]+'?'))return;
   if(kind==='product'){DB.variants=DB.variants.filter(v=>v.productId!==id);DB.products=DB.products.filter(x=>x.id!==id);}
   if(kind==='variant')DB.variants=DB.variants.filter(v=>v.id!==id);
   if(kind==='vendor')DB.vendors=DB.vendors.filter(x=>x.id!==id);
  if(kind==='pool')DB.pools=DB.pools.filter(x=>x.id!==id);
  if(kind==='pack')DB.packs=DB.packs.filter(x=>x.id!==id);
  if(kind==='booking')DB.bookings=DB.bookings.filter(x=>x.id!==id);
  if(kind==='todo')DB.todos=DB.todos.filter(x=>x.id!==id);
  if(kind==='lot')DB.lots=DB.lots.filter(x=>x.id!==id);
  logAct('DELETE_'+kind.toUpperCase(),'id '+id);save();render();
 },

  /* ---- talent modals ---- */
  openTalent(id=null){
    const t = id ? DB.talents.find(x => x.id === id) : { name:'', handle:'', avatar:'', notes:'', active:true };
    openModal(`<h2>${id?'Edit':'New'} Talent</h2>
      <div class="row">
        <div style="flex:2.2">${fld('Display name','<input id="f_tname" value="'+esc(t.name)+'" placeholder="e.g. Nana">')}</div>
        <div style="flex:1">${fld('Avatar emoji','<input id="f_tavatar" value="'+esc(t.avatar||'')+'" placeholder="⭐" style="text-align:center">')}</div>
      </div>
      ${fld('Handle / Social','<input id="f_thandle" value="'+esc(t.handle||'')+'" placeholder="@twitter_or_ig">')}
      ${fld('Notes','<textarea id="f_tnotes" rows="3" placeholder="Optional notes or bio">'+esc(t.notes||'')+'</textarea>')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">
        <label class="custom-checkbox">
          <input type="checkbox" class="checkbox-input" id="f_tactive" ${t.active!==false?'checked':''}>
          <span class="checkbox-box sm"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>
          <span class="checkbox-text">Active Talent</span>
        </label>
        <div class="actions" style="margin-top:0">
          <button class="btn ghost" onclick="closeModal()">Cancel</button>
          <button class="btn" onclick="UI.saveTalent('${id||''}')">Save Talent</button>
        </div>
      </div>`, 'sm');
  },
  saveTalent(id){
    const name = document.getElementById('f_tname')?.value.trim();
    if(!name){toast('Talent name required');return;}
    const data = {
      name,
      handle: (document.getElementById('f_thandle')?.value||'').trim(),
      avatar: (document.getElementById('f_tavatar')?.value||'').trim(),
      notes: (document.getElementById('f_tnotes')?.value||'').trim(),
      active: document.getElementById('f_tactive')?.checked ?? true
    };
    if(id){Object.assign(DB.talents.find(x=>x.id===id), data); logAct('UPDATE_TALENT', name);}
    else {DB.talents.push({id:uid(), ...data, created: nowISO()}); logAct('CREATE_TALENT', name);}
    closeModal(); save(); render();
  },
  delTalent(id){
    if(!confirm('Delete this talent? Variants will become shared/group items.'))return;
    DB.variants.forEach(v => { if(v.talentId === id) v.talentId = null; });
    DB.talents = DB.talents.filter(t => t.id !== id);
    logAct('DELETE_TALENT', id); save(); render();
  },

 /* ---- modals: product / variant / vendor / lot / todo / booking / sale / pool ---- */
 opt(sel,val){return sel===val?'selected':'';},
 newTalentInline(pid,vid){
  const name=prompt('New talent name:','');if(!name)return;
  const t={id:uid(),name:name.trim(),handle:'',avatar:'',notes:'',active:true,created:nowISO()};
  DB.talents.push(t);save();render();
  setTimeout(()=>{
    const sel=document.getElementById('f_tal');if(sel){sel.insertAdjacentHTML('beforeend',`<option value="${t.id}" selected>${esc(t.name)}</option>`);}
  },0);
 },
 newVendorInline(){
  const prev=document.getElementById('f_vendor')?.value;
  window.__vendorCB=(newId)=>{ // reopen product modal with new vendor selected (form values restored from draft)
    UI.openProduct();document.getElementById('f_vendor').value=newId;
    ['f_name','f_unit','f_pack','f_price','f_pic','f_artist','f_notes'].forEach(i=>{const el=document.getElementById(i);const d=window.__prodDraft?.[i];if(el&&d!==undefined)el.value=d;});
    (window.__prodDraft?.cats||[]).forEach(c=>{const el=document.querySelector(`.f_cat[value="${c}"]`);if(el)el.checked=true;});
    ['f_art','f_prod'].forEach(i=>{const el=document.getElementById(i);const d=window.__prodDraft?.[i];if(el&&d)el.value=d;});
  };
  const g=i=>document.getElementById(i)?.value;
  window.__prodDraft={f_name:g('f_name'),f_unit:g('f_unit'),f_pack:g('f_pack'),f_price:g('f_price'),f_pic:g('f_pic'),f_artist:g('f_artist'),f_notes:g('f_notes'),f_art:g('f_art'),f_prod:g('f_prod'),cats:[...document.querySelectorAll('.f_cat:checked')].map(x=>x.value)};
  UI.openVendor();
 },
 openProduct(id){
  const p=DB.products.find(x=>x.id===id)||{name:'',vendorId:'',cats:[],unitCost:0,packCost:0,price:0,artStatus:'Art ready',prodStatus:'Production test',pic:'',artist:'',notes:''};
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
   </div>
   <div class="row" style="margin-top:10px">
    <div><label>Artist (Illustrator)</label><input id="f_artist" value="${esc(p.artist||'')}" placeholder="e.g. @artist_handle"></div>
    <div><label>PIC (Production In-Charge)</label><input id="f_pic" value="${esc(p.pic||'')}" placeholder="e.g. Toyo"></div>
   </div>
   ${fld('Notes','<textarea id="f_notes" rows="2">'+esc(p.notes)+'</textarea>')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveProduct('${id||''}')">Save</button></div>`);
 },
 saveProduct(id){
  const g=i=>document.getElementById(i).value;
  const cats=[...document.querySelectorAll('.f_cat:checked')].map(x=>x.value);
  const data={name:g('f_name').trim(),vendorId:g('f_vendor')||null,cats,unitCost:+g('f_unit')||0,packCost:+g('f_pack')||0,price:+g('f_price')||0,artStatus:g('f_art'),prodStatus:g('f_prod'),artist:g('f_artist'),pic:g('f_pic'),notes:g('f_notes')};
  if(!data.name){toast('Name required');return;}
  if(id){Object.assign(DB.products.find(x=>x.id===id),data);logAct('UPDATE_ITEM',data.name);}
  else{DB.products.push({id:uid(),eventId:DB.activeEvent,...data,created:nowISO()});logAct('CREATE_ITEM',data.name);}
  closeModal();save();render();
 },
 openVariant(pid,vid){
  const v=DB.variants.find(x=>x.id===vid)||{productId:pid,talentId:null,unitCostOverride:null,priceOverride:null,notes:''};
  const talentOptions=DB.talents.map(t=>`<option value="${t.id}" ${UI.opt(t.id,v.talentId)}>${esc(t.name)}</option>`).join('');
  openModal(`<h2>${vid?'Edit':'New'} talent variant</h2>
   ${fld('Talent',`<div style="display:flex;gap:6px"><select id="f_tal" style="flex:1"><option value="">— Shared / Group —</option>${talentOptions}</select><button type="button" class="btn ghost w0" onclick="UI.newTalentInline('${pid}','${vid||''}')">+ New</button></div>`)}
   <div class="row"><div><label>Unit cost override (blank = product default)</label><input id="f_uco" type="number" min="0" value="${v.unitCostOverride??''}" placeholder="default"></div>
   <div><label>Price override</label><input id="f_po" type="number" min="0" value="${v.priceOverride??''}" placeholder="default"></div></div>
   ${fld('Notes','<input id="f_vn" value="'+esc(v.notes||'')+'">')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveVariant('${vid||''}','${v.productId}')">Save</button></div>`);
 },
 saveVariant(vid,pid){
  const g=i=>document.getElementById(i).value;
  const tal=document.getElementById('f_tal').value;
  const data={talentId:tal||null,unitCostOverride:g('f_uco')===''?null:+g('f_uco'),priceOverride:g('f_po')===''?null:+g('f_po'),notes:g('f_vn')};
  if(vid)Object.assign(DB.variants.find(x=>x.id===vid),data);
  else DB.variants.push({id:uid(),productId:pid,...data,created:nowISO()});
  logAct(vid?'UPDATE_ITEM':'CREATE_ITEM','variant '+(talentName(DB.variants.find(x=>x.id===vid||x))||'shared'));closeModal();save();render();
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
 openLot(vid, lotId=null){
    const v=vid2var()[vid];
    const p=v? pid2prod()[v.productId] : null;
    const lot=lotId? DB.lots.find(l=>l.id===lotId) : null;
    const defaultVendorId = lot?.vendorId || p?.vendorId || '';
    const curStatus = lot?.status || 'todo';
    const curSource = lot?.source || 'OTS';
    const curOrd = lot? lot.qtyOrdered : 50;
    const curDel = lot? (lot.qtyDelivered!==undefined? lot.qtyDelivered : curOrd) : 0;
    const curBatch = lot?.batch || ('B'+(evList(DB.lots).length+1));

    openModal(`<h2>${lotId?'Edit':'New'} Stock Lot — ${esc(variantLabel(v))}</h2>
      <p class="sub">4-stage workflow: To Do → Ordered → On Delivery → Arrived. Stock is only active when Arrived.</p>
      <div class="row">
        <div style="flex:1.5"><label>Vendor</label>
          <select id="f_lot_vendor">
            <option value="">— None —</option>
            ${DB.vendors.map(vn=>`<option value="${vn.id}" ${UI.opt(vn.id, defaultVendorId)}>${esc(vn.name)}</option>`).join('')}
          </select>
        </div>
        <div><label>Status</label>
          <select id="f_lot_status" onchange="UI.onLotStatusChange()">
            ${LOT_STATUSES.map(st=>`<option value="${st}" ${UI.opt(st, curStatus)}>${st.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        <div><label>Source / Channel</label>
          <select id="f_lot_source" onchange="document.getElementById('f_lot_custom_wrap').style.display=this.value==='Custom'?'block':'none'">
            ${LOT_SOURCES.map(s=>`<option value="${s}" ${UI.opt(s, curSource)}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="f_lot_custom_wrap" style="display:${curSource==='Custom'?'block':'none'};margin-top:10px">
        ${fld('Custom Purpose Notes (Required for Custom)','<input id="f_lot_purpose" value="'+esc(lot?.purposeNotes||'')+'" placeholder="e.g. VIP gift / Booth display decoration">')}
      </div>
      <div class="row" style="margin-top:10px">
        <div><label>Qty Ordered</label><input id="f_lot_ord" type="number" min="0" value="${curOrd}" oninput="if(document.getElementById('f_lot_status').value==='arrived'&&!document.getElementById('f_lot_del').dataset.touched)document.getElementById('f_lot_del').value=this.value"></div>
        <div id="f_lot_del_wrap" style="display:${curStatus==='arrived'?'block':'none'}">
          <label>Qty Delivered (Arrived)</label>
          <input id="f_lot_del" type="number" min="0" value="${curDel}" oninput="this.dataset.touched='1';UI.checkLotDefect()">
        </div>
        <div><label>Batch #</label><input id="f_lot_b" value="${esc(curBatch)}"></div>
      </div>
      <div id="f_lot_defect_wrap" style="display:none;margin-top:10px">
        ${fld('Defect / Missing Notes','<input id="f_lot_defect" value="'+esc(lot?.defectNotes||'')+'" placeholder="e.g. 2 misprinted / broken during transit">')}
      </div>
      <div class="row" style="margin-top:10px">
        <div><label>Unit cost snapshot (Rp)</label><input id="f_lot_uc" type="number" min="0" value="${lot?.unitCost ?? costOf(v)}"></div>
        <div><label>PIC</label><input id="f_lot_pic" value="${esc(lot?.pic || p?.pic || 'Toyo')}"></div>
      </div>
      <div class="actions">
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn" onclick="UI.saveLot('${vid}', '${lotId||''}')">Save lot</button>
      </div>`);
    setTimeout(()=>{ UI.onLotStatusChange(); }, 0);
  },
  onLotStatusChange(){
    const st = document.getElementById('f_lot_status')?.value;
    const delWrap = document.getElementById('f_lot_del_wrap');
    if(delWrap) delWrap.style.display = (st==='arrived') ? 'block' : 'none';
    if(st==='arrived'){
      const delInp = document.getElementById('f_lot_del');
      const ordInp = document.getElementById('f_lot_ord');
      if(delInp && ordInp && !delInp.value) delInp.value = ordInp.value;
    }
    UI.checkLotDefect();
  },
  checkLotDefect(){
    const st = document.getElementById('f_lot_status')?.value;
    const ord = +document.getElementById('f_lot_ord')?.value || 0;
    const del = +document.getElementById('f_lot_del')?.value || 0;
    const wrap = document.getElementById('f_lot_defect_wrap');
    if(wrap){
      wrap.style.display = (st==='arrived' && del < ord) ? 'block' : 'none';
    }
  },
  saveLot(vid, lotId=''){
    const g=i=>document.getElementById(i)?.value;
    const vendorId=g('f_lot_vendor')||null;
    const status=g('f_lot_status')||'todo';
    const source=g('f_lot_source')||'OTS';
    const purposeNotes=source==='Custom'? (g('f_lot_purpose')||'').trim() : '';
    const qtyOrdered=+g('f_lot_ord')||0;
    const qtyDelivered=(status==='arrived')? (+g('f_lot_del')||0) : 0;
    const defectNotes=(status==='arrived'&&qtyDelivered<qtyOrdered)? (g('f_lot_defect')||'').trim() : '';
    const unitCost=+g('f_lot_uc')||0;
    const pic=g('f_lot_pic')||'';
    const batch=g('f_lot_b')||'B1';

    if(source==='Custom' && !purposeNotes){
      toast('Custom purpose requires notes'); return;
    }

    const data={
      vendorId, status, source, purposeNotes, qtyOrdered, qtyDelivered,
      defectNotes, unitCost, pic, batch
    };

    if(lotId){
      const lot=DB.lots.find(l=>l.id===lotId);
      if(lot) Object.assign(lot, data);
      logAct('UPDATE_LOT', variantLabel(vid2var()[vid])+' '+batch+' ('+status+')');
    } else {
      const lot={
        id: uid(), eventId: DB.activeEvent, variantId: vid,
        ...data, created: nowISO()
      };
      DB.lots.push(lot);
      logAct('CREATE_LOT', variantLabel(vid2var()[vid])+' '+batch+' ('+status+')');
    }
    closeModal(); save(); render();
  },
  openTransfer(vid){
    const v=vid2var()[vid];
    const arrivedLots=evList(DB.lots).filter(l=>l.variantId===vid && (l.status==='arrived'||!l.status) && (l.qtyDelivered||0)>0);
    if(!arrivedLots.length){
      toast('No arrived stock available to transfer'); return;
    }
    openModal(`<h2>Transfer Stock — ${esc(variantLabel(v))}</h2>
      <p class="sub">Reclassify stock between channels (e.g. OTS → Gacha/Giveaway). Retains full audit log.</p>
      ${fld('Source Lot', `<select id="f_tr_lot" onchange="UI.updateTransferMax()">
        ${arrivedLots.map(l=>`<option value="${l.id}">${esc(l.batch||'Lot')} (${esc(l.source)}) — ${l.qtyDelivered} pcs</option>`).join('')}
      </select>`)}
      <div class="row">
        <div><label>Qty to transfer</label><input id="f_tr_qty" type="number" min="1" max="${arrivedLots[0].qtyDelivered}" value="1"></div>
        <div><label>Target Channel</label>
          <select id="f_tr_target">
            ${LOT_SOURCES.map(s=>`<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
      </div>
      ${fld('Notes / Reason', '<input id="f_tr_notes" placeholder="e.g. Needed for gacha filler prizes">')}
      <div class="actions">
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn" onclick="UI.execTransfer()">Transfer Stock</button>
      </div>`);
  },
  updateTransferMax(){
    const lotId=document.getElementById('f_tr_lot')?.value;
    const lot=DB.lots.find(l=>l.id===lotId);
    const qtyInp=document.getElementById('f_tr_qty');
    if(lot && qtyInp){
      qtyInp.max = lot.qtyDelivered||0;
      if(+qtyInp.value > lot.qtyDelivered) qtyInp.value = lot.qtyDelivered;
    }
  },
  execTransfer(){
    const lotId=document.getElementById('f_tr_lot')?.value;
    const qty=+document.getElementById('f_tr_qty')?.value||0;
    const target=document.getElementById('f_tr_target')?.value;
    const notes=document.getElementById('f_tr_notes')?.value||'';
    if(qty<=0){ toast('Quantity must be greater than 0'); return; }
    if(transferStock(lotId, qty, target, notes)){
      closeModal();
    }
  },
 openTodo(id){
  const t=DB.todos.find(x=>x.id===id)||{title:'',assignee:'',due:'',notes:'',done:false};
  openModal(`<h2>${id?'Edit':'New'} task</h2>${fld('Title','<input id="f_name" value="'+esc(t.title)+'">')}
   <div class="row"><div><label>Assignee</label><input id="f_as" value="${esc(t.assignee)}"></div><div><label>Due</label><input id="f_due" type="date" value="${t.due||''}"></div></div>
   ${fld('Notes','<input id="f_notes" value="'+esc(t.notes||'')+'">')}
   <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveTodo('${id||''}')">Save</button></div>`);
 },
 toggleBundleView(){
    const sec = document.getElementById('bundlesSection');
    if(!sec) return;
    const isHidden = sec.style.display === 'none';
    sec.style.display = isHidden ? 'block' : 'none';
    const btn = document.getElementById('bundleToggleBtn');
    if(btn) btn.classList.toggle('on', isHidden);
    if(isHidden) UI.renderBundles();
  },
  renderBundles(){
    const sec = document.getElementById('bundlesSection');
    if(!sec) return;
    const e = ev();
    const bundles = (DB.bundles||[]).filter(b=>!e||b.eventId===e.id);
    sec.innerHTML = `<div class="card" style="border:2px solid var(--accent)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div>
          <b style="font-size:1.1rem">🎁 Product Bundles</b>
          <span class="sub" style="margin-left:8px">Create bundles with free item(s) or global discounts across variants and talents.</span>
        </div>
        <button class="btn sm" onclick="UI.openBundle()">+ New Bundle</button>
      </div>
      <div class="grid g2">
        ${bundles.map(b=>{
          const base = bundleBasePrice(b);
          const pr = bundlePrice(b);
          const st = bundleStock(b);
          const pricingDesc = b.discountMode==='free_items'
            ? `<span class="chip ok">Free item(s) included</span>`
            : `<span class="chip acc">${b.discountType==='percent'? (b.discountValue||0)+'% off' : rp(b.discountValue||0)+' discount'}</span>`;
          return `<div class="card" style="background:var(--bg)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <b>${esc(b.name)}</b> ${pricingDesc}
                <div style="margin-top:4px;font-size:.85rem">
                  Price: <b class="num" style="color:var(--accent);font-size:1.05rem">${rp(pr)}</b>
                  ${base!==pr?`<span class="mut" style="text-decoration:line-through;margin-left:6px">${rp(base)}</span>`:''}
                  · <span class="mut">Stock avail: <b class="num">${st}</b></span>
                </div>
              </div>
              <div>
                <button class="btn sm ghost" onclick="UI.openBundle('${b.id}')">Edit</button>
                <button class="btn sm ghost" style="color:var(--danger)" onclick="UI.del('bundle','${b.id}')">✕</button>
              </div>
            </div>
            <div style="margin-top:8px;font-size:.82rem;border-top:1px solid var(--border);padding-top:6px">
              ${(b.items||[]).map(i=>{
                const v = vid2var()[i.variantId];
                return `<div>• ${esc(v? variantLabel(v) : '?')} ×${i.qty||1} ${i.isFree?'<b style="color:var(--ok)">(FREE)</b>':''}</div>`;
              }).join('')||'<span class="mut">No items in bundle</span>'}
            </div>
          </div>`;
        }).join('') || '<div class="empty" style="grid-column:1/-1;padding:12px">No bundles created yet. Click "+ New Bundle" to define one.</div>'}
      </div>
    </div>`;
  },
  openBundle(id=null){
    const e = ev();
    const b = id ? (DB.bundles||[]).find(x=>x.id===id) : null;
    const curName = b?.name || '';
    const curMode = b?.discountMode || 'free_items';
    const curType = b?.discountType || 'percent';
    const curVal = b?.discountValue || 10;
    const curNotes = b?.notes || '';
    window.__bundleItems = b ? JSON.parse(JSON.stringify(b.items||[])) : [];

    const vs = DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===e?.id);

    openModal(`<h2>${id?'Edit':'New'} Bundle</h2>
      <p class="sub">Choose component items. Select either Free Items mode OR a Global Discount.</p>
      ${fld('Bundle Name', `<input id="f_bd_name" value="${esc(curName)}" placeholder="e.g. Nana Full Set / Pair Box">`)}
      <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
        <label>Bundle Components</label>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <select id="f_bd_item_sel" style="flex:2">
            ${vs.map(v=>`<option value="${v.id}">${esc(variantLabel(v))} — ${rp(priceOf(v))}</option>`).join('')}
          </select>
          <input type="number" id="f_bd_item_qty" min="1" value="1" style="width:70px" title="Qty">
          <button class="btn sm ghost w0" type="button" onclick="UI.addBundleItem()">+ Add</button>
        </div>
        <div id="f_bd_items_list"></div>
      </div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
        <label>Pricing Mode</label>
        <div style="display:flex;gap:18px;margin:8px 0">
          <label style="font-weight:normal;display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="radio" name="f_bd_mode" value="free_items" ${curMode==='free_items'?'checked':''} onchange="UI.onBundleModeChange()">
            <span>Free Item(s)</span>
          </label>
          <label style="font-weight:normal;display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="radio" name="f_bd_mode" value="discount" ${curMode==='discount'?'checked':''} onchange="UI.onBundleModeChange()">
            <span>Global Discount</span>
          </label>
        </div>
        <div id="f_bd_discount_wrap" style="display:${curMode==='discount'?'block':'none'};margin-top:10px">
          <div class="row">
            <div><label>Discount Type</label>
              <select id="f_bd_disc_type" onchange="UI.updateBundlePreview()">
                <option value="percent" ${curType==='percent'?'selected':''}>Percentage (%)</option>
                <option value="fixed" ${curType==='fixed'?'selected':''}>Fixed Amount (Rp)</option>
              </select>
            </div>
            <div><label>Discount Value</label>
              <input type="number" id="f_bd_disc_val" min="0" value="${curVal}" oninput="UI.updateBundlePreview()">
            </div>
          </div>
        </div>
      </div>
      <div id="f_bd_preview" class="card" style="background:var(--bg);margin-bottom:12px;padding:10px"></div>
      ${fld('Notes', `<input id="f_bd_notes" value="${esc(curNotes)}" placeholder="Optional internal notes">`)}
      <div class="actions">
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
        <button class="btn" onclick="UI.saveBundle('${id||''}')">Save Bundle</button>
      </div>`);

    UI.drawBundleItems();
    UI.updateBundlePreview();
  },
  onBundleModeChange(){
    const mode = document.querySelector('input[name="f_bd_mode"]:checked')?.value;
    const discWrap = document.getElementById('f_bd_discount_wrap');
    if(discWrap) discWrap.style.display = (mode==='discount') ? 'block' : 'none';
    UI.drawBundleItems();
    UI.updateBundlePreview();
  },
  drawBundleItems(){
    const wrap = document.getElementById('f_bd_items_list');
    if(!wrap) return;
    const mode = document.querySelector('input[name="f_bd_mode"]:checked')?.value || 'free_items';
    const items = window.__bundleItems || [];
    if(!items.length){
      wrap.innerHTML = '<small class="mut">No items added to bundle yet.</small>';
      return;
    }
    wrap.innerHTML = items.map((i,ix)=>{
      const v = vid2var()[i.variantId];
      return `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="flex:2"><b>${esc(v? variantLabel(v) : '?')}</b> <span class="mut">(${rp(v?priceOf(v):0)})</span></span>
        <span class="num" style="width:60px">×${i.qty||1}</span>
        ${mode==='free_items'?`
          <label style="display:flex;align-items:center;gap:4px;font-size:.78rem;cursor:pointer;margin:0">
            <input type="checkbox" ${i.isFree?'checked':''} onchange="window.__bundleItems[${ix}].isFree=this.checked;UI.updateBundlePreview()">
            <span style="color:var(--ok);font-weight:700">FREE</span>
          </label>
        `:''}
        <button class="btn sm ghost w0" type="button" style="color:var(--danger)" onclick="window.__bundleItems.splice(${ix},1);UI.drawBundleItems();UI.updateBundlePreview()">✕</button>
      </div>`;
    }).join('');
  },
  addBundleItem(){
    const vid = document.getElementById('f_bd_item_sel')?.value;
    const qty = +document.getElementById('f_bd_item_qty')?.value || 1;
    if(!vid) return;
    if((window.__bundleItems||[]).some(x=>x.variantId===vid)){
      toast('Item already in bundle'); return;
    }
    window.__bundleItems.push({ variantId: vid, qty, isFree: false });
    UI.drawBundleItems();
    UI.updateBundlePreview();
  },
  updateBundlePreview(){
    const wrap = document.getElementById('f_bd_preview');
    if(!wrap) return;
    const mode = document.querySelector('input[name="f_bd_mode"]:checked')?.value || 'free_items';
    const type = document.getElementById('f_bd_disc_type')?.value || 'percent';
    const val = +document.getElementById('f_bd_disc_val')?.value || 0;
    const tempBundle = {
      discountMode: mode, discountType: type, discountValue: val,
      items: window.__bundleItems || []
    };
    const base = bundleBasePrice(tempBundle);
    const finalPrice = bundlePrice(tempBundle);
    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="mut" style="font-size:.85rem">Catalog Total: <b>${rp(base)}</b></span>
        <span>Bundle Price: <b class="num" style="color:var(--accent);font-size:1.15rem">${rp(finalPrice)}</b></span>
      </div>
      <div class="mut" style="font-size:.75rem;margin-top:2px">Savings: ${rp(Math.max(0, base - finalPrice))}</div>
    `;
  },
  saveBundle(id=''){
    const name = (document.getElementById('f_bd_name')?.value||'').trim();
    if(!name){ toast('Bundle name required'); return; }
    if(!window.__bundleItems || !window.__bundleItems.length){ toast('Add at least one item to bundle'); return; }
    const discountMode = document.querySelector('input[name="f_bd_mode"]:checked')?.value || 'free_items';
    const discountType = document.getElementById('f_bd_disc_type')?.value || 'percent';
    const discountValue = +document.getElementById('f_bd_disc_val')?.value || 0;
    const notes = document.getElementById('f_bd_notes')?.value || '';

    const data = {
      name, discountMode, discountType, discountValue, notes,
      items: window.__bundleItems.map(x=>({ variantId: x.variantId, qty: x.qty||1, isFree: discountMode==='free_items'? !!x.isFree : false }))
    };

    if(id){
      const b = (DB.bundles||[]).find(x=>x.id===id);
      if(b) Object.assign(b, data);
      logAct('UPDATE_BUNDLE', name);
    } else {
      DB.bundles = DB.bundles || [];
      DB.bundles.push({ id: uid(), eventId: DB.activeEvent, ...data, created: nowISO() });
      logAct('CREATE_BUNDLE', name);
    }
    closeModal(); save(); render();
    UI.renderBundles();
  },
 saveTodo(id){const g=i=>document.getElementById(i).value;const data={title:g('f_name').trim(),assignee:g('f_as'),due:g('f_due'),notes:g('f_notes')};
  if(!data.title){toast('Title required');return;}
  if(id)Object.assign(DB.todos.find(x=>x.id===id),data);else DB.todos.push({id:uid(),eventId:DB.activeEvent,...data,done:false});
  logAct(id?'UPDATE_TODO':'CREATE_TODO',data.title);closeModal();save();render();},
 openBooking(id){
  const b=DB.bookings.find(x=>x.id===id)||{customer:'',contact:'',items:[],status:'pending',fulfil:'pickup',address:'',shipFee:0,notes:''};
  const vs=DB.variants.filter(v=>pid2prod()[v.productId]?.eventId===DB.activeEvent);
  const bundles=(DB.bundles||[]).filter(bd=>bd.eventId===DB.activeEvent);
  openModal(`<h2>${id?'Edit':'New'} booking</h2>
    <div class="row"><div style="flex:2"><label>Customer</label><input id="f_name" value="${esc(b.customer)}"></div><div><label>Contact</label><input id="f_ct" value="${esc(b.contact)}"></div></div>
    ${fld('Add Item or Bundle',`
       <div style="display:flex;gap:8px;align-items:center;flex-wrap:nowrap">
         <select id="f_bi_type" style="width:110px;flex:0 0 110px" onchange="UI.onBookTypeChange()">
           <option value="item">Item</option>
           <option value="bundle">Bundle</option>
         </select>
         <select id="f_bi" style="flex:1;min-width:0">
           ${vs.map(v=>`<option value="${v.id}">${esc(variantLabel(v))} — ${rp(priceOf(v))}</option>`).join('')}
         </select>
         <select id="f_bb" style="flex:1;min-width:0;display:none">
           ${bundles.map(bd=>`<option value="${bd.id}">🎁 ${esc(bd.name)} — ${rp(bundlePrice(bd))}</option>`).join('')}
         </select>
         <div style="width:75px;flex:0 0 75px">
           <input id="f_bq" type="number" min="1" value="1" style="width:100%" title="Qty">
         </div>
         <button class="btn sm ghost w0" type="button" onclick="UI.addBookItem()">+ Add</button>
       </div>
       <div id="f_bitems" style="margin-top:10px"></div>`)}
    <div class="row"><div><label>Payment status</label><select id="f_st">${PAYSTAGES.map(s=>`<option ${UI.opt(s,b.status)}>${s}</option>`).join('')}</select></div>
    <div><label>Fulfilment</label><select id="f_fu" onchange="document.getElementById('f_mailbox').style.display=this.value==='mail'?'block':'none'">
    <option value="pickup" ${UI.opt('pickup',b.fulfil)}>Booth pickup</option><option value="mail" ${UI.opt('mail',b.fulfil)}>Mail order</option></select></div>
    <div><label>Shipping fee</label><input id="f_sf" type="number" min="0" value="${b.shipFee||0}"></div></div>
    <div id="f_mailbox" style="display:${b.fulfil==='mail'?'block':'none'};margin-top:10px">${fld('Shipping address','<textarea id="f_addr" rows="2">'+esc(b.address||'')+'</textarea>')}</div>
    <div class="actions"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn" onclick="UI.saveBooking('${id||''}')">Save</button></div>`);
   window.__bitems=JSON.parse(JSON.stringify(b.items||[]));UI.drawBookItems();
 },
 onBookTypeChange(){
    const t = document.getElementById('f_bi_type')?.value;
    const itemSel = document.getElementById('f_bi');
    const bundleSel = document.getElementById('f_bb');
    if(itemSel && bundleSel){
      itemSel.style.display = (t==='bundle') ? 'none' : 'block';
      bundleSel.style.display = (t==='bundle') ? 'block' : 'none';
    }
  },
 drawBookItems(){
    document.getElementById('f_bitems').innerHTML=(window.__bitems||[]).map((i,ix)=>{
      let label = '?';
      let price = 0;
      if(i.bundleId){
        const bundle = (DB.bundles||[]).find(bd=>bd.id===i.bundleId);
        label = bundle ? `🎁 Bundle: ${bundle.name}` : 'Unknown bundle';
        price = i.price ?? (bundle ? bundlePrice(bundle) : 0);
      } else {
        const v = vid2var()[i.variantId];
        label = v ? variantLabel(v) : '?';
        price = i.price ?? (v ? priceOf(v) : 0);
      }
      return `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="flex:1"><b>${esc(label)}</b> ×${i.qty}</span>
        <span class="num" style="font-weight:600">${rp(price * i.qty)}</span>
        <button class="btn sm ghost w0" style="color:var(--danger)" onclick="window.__bitems.splice(${ix},1);UI.drawBookItems()">✕</button>
      </div>`;
    }).join('')||'<small class="mut">No lines yet.</small>';
  },
 addBookItem(){
    const type = document.getElementById('f_bi_type')?.value || 'item';
    const q = +document.getElementById('f_bq')?.value || 1;
    if(type==='bundle'){
      const bundleId = document.getElementById('f_bb')?.value;
      if(!bundleId){ toast('Select a bundle'); return; }
      const bundle = (DB.bundles||[]).find(bd=>bd.id===bundleId);
      const pr = bundle ? bundlePrice(bundle) : 0;
      window.__bitems.push({ bundleId, variantId: null, qty: q, price: pr });
    } else {
      const vid = document.getElementById('f_bi')?.value;
      if(!vid){ toast('Select an item'); return; }
      const v = vid2var()[vid];
      window.__bitems.push({ variantId: vid, bundleId: null, qty: q, price: v?priceOf(v):0 });
    }
    UI.drawBookItems();
  },
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
document.addEventListener('click',e=>{
  const n=e.target.closest('[data-nav]');if(n)UI.goto(n.dataset.nav);
  const g=e.target.closest('[data-goto]');if(g)UI.goto(g.dataset.goto);
  if(!e.target.closest('.action-dropdown')) UI.closeAllMenus();
  if(!e.target.closest('.stock-total-badge') && !e.target.closest('.stock-channel-popover')) UI.closeAllPopovers();
});
window.addEventListener('hashchange',()=>{const v=location.hash.replace('#/','');if(['dashboard','event','vendors','gacha','bookings','sales','todo','calculator','sync'].includes(v)&&v!==UI.view){UI.view=v;render();}});

function render(){
  document.querySelectorAll('.navlink[data-nav]').forEach(n=>n.classList.toggle('on',n.dataset.nav===UI.view));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on',v.id==='v-'+UI.view));
  const e=ev();
  const $=id=>document.getElementById(id);
  if($('dashEvent'))$('dashEvent').textContent=e?(e.name+(e.archived?' — ARCHIVED (read-only)':'')):'No active event';
  if($('catFilters'))$('catFilters').innerHTML=['',...CATS].map(c=>`<button class="fbtn ${UI.itemCat===c?'on':''}" onclick="UI.itemCat='${c}';render()">${c||'All'}</button>`).join('');
  if($('itemsList'))UI.renderItems();
  const bSec = $('bundlesSection');
  if(bSec && bSec.style && bSec.style.display !== 'none') UI.renderBundles();
  if($('vendorsList'))UI.renderVendors();
  if($('poolsList'))UI.renderPools();
  if($('packsList'))UI.renderPacks();
  if($('bookingsList'))UI.renderBookings();
  if($('salesStats'))UI.renderSales();
  if($('todoList'))UI.renderTodo();
  if(UI.view==='calculator'&&$('calcLines'))UI.renderCalc();
  if($('logTable'))UI.renderSync();
  if($('tallyGrid'))UI.renderEvent();
  if($('dashStats')){$('dashStats').innerHTML=UI.dashStats();$('dashDemand').innerHTML=UI.dashDemand();$('dashTodos').innerHTML=UI.dashTodos();$('dashLow').innerHTML=UI.dashLow();}
  if($('dashVendorOrders'))$('dashVendorOrders').innerHTML=UI.dashVendorOrders();
  const sb=document.getElementById('sidebar');if(sb)sb.classList.remove('open');
  enhanceNumberInputs(document.body);
}
async function initApp() {
  applyTheme();
  if (IS_TALENTS_PAGE) { UI.view = 'talents'; }
  if (IS_BOOKINGS_PAGE) { UI.view = 'bookings'; window.__bkBoot = true; }
  if (IS_PACKAGING_PAGE) { UI.view = 'packaging'; }
  if (IS_ITEMS_PAGE) { UI.view = 'items'; }

  const loaded = await load();
  if (!loaded) return; // Server error displayed, do not render broken shell

  render();
  if (!IS_BOOKINGS_PAGE && !IS_ITEMS_PAGE && !IS_TALENTS_PAGE && location.hash) {
    const v = location.hash.replace('#/', '');
    if (['dashboard', 'event', 'vendors', 'gacha', 'bookings', 'sales', 'todo', 'calculator', 'sync'].includes(v)) UI.goto(v);
  } else if (IS_BOOKINGS_PAGE) {
    document.querySelectorAll('.navlink[data-nav]').forEach(n => {
      if (n.dataset.nav !== 'bookings' && n.dataset.nav !== 'theme') n.dataset.exit = '1';
    });
  }
}
initApp();
