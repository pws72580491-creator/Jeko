'use strict';


// ── 품목 정의 ──
const INBOUND_ITEMS  = ['왕란','특란','대란','중란','등외란','구운란','군망','방사란','유정란','유정15구','유정10구','메추리','깐메추리'];
const FINISHED_ITEMS = ['명품특란','초란','퓨왕','영왕','영특','퓨특','10왕','10대','방사10구','군10구','판왕','판특','판대','한일대란','한일특란','한일유정','방사'];
const EGG_ITEMS      = [...INBOUND_ITEMS, ...FINISHED_ITEMS];

// 판당 개수 (기본 30)
const ITEM_PCS_PER_FLAT = {'퓨왕':15,'영왕':15,'유정15구':15,'영특':10,'10왕':10,'10대':10,'방사10구':10,'유정10구':10,'군10구':10,'메추리':1,'깐메추리':1};
const ITEM_FLAT_PER_TONG = {'메추리':24,'깐메추리':10};
const FINISHED_SOURCE = {
  '초란':      {source:'중란',   ratio:1},
  '판왕':      {source:'왕란',   ratio:1},
  '판특':      {source:'특란',   ratio:1},
  '판대':      {source:'대란',   ratio:1},
  '명품특란':  {source:'특란',   ratio:1},
  '퓨왕':      {source:'왕란',   ratio:15},
  '퓨특':      {source:'특란',   ratio:10},
  '영왕':      {source:'왕란',   ratio:15},
  '영특':      {source:'특란',   ratio:10},
  '10왕':      {source:'왕란',   ratio:10},
  '10대':      {source:'대란',   ratio:10},
  '방사10구':  {source:'방사란', ratio:10},
  '군10구':    {source:'구운란', ratio:10},
  '한일대란':  {source:'대란',   ratio:360},
  '한일특란':  {source:'특란',   ratio:360},
  '한일유정':  {source:'유정란', ratio:360},
  '방사':      {source:'방사란', ratio:1},
};

const DEFAULT_STAFF = ['김성수','박우석','박성훈','문영재'];

function getPcsPerFlat(item)  { return ITEM_PCS_PER_FLAT[item]  || 30; }
function getFlatPerTong(item) { return ITEM_FLAT_PER_TONG[item] || 150; }
function getPcsPerTong(item)  { return getFlatPerTong(item) * getPcsPerFlat(item); }
function calcPcs(tong, flat, item) { return (parseInt(tong)||0)*getPcsPerTong(item) + (parseInt(flat)||0)*getPcsPerFlat(item); }
function pcsToUnits(pcs, item) {
  const ppt=getPcsPerTong(item||'왕란'), ppf=getPcsPerFlat(item||'왕란');
  return { tong:Math.floor(pcs/ppt), flat:Math.floor((pcs%ppt)/ppf) };
}
function fmtQty(pcs, item) {
  if(!pcs) return '0개';
  const {tong,flat}=pcsToUnits(pcs,item);
  let s=''; if(tong) s+=tong+'통'; if(flat) s+=(s?' ':'')+flat+'판';
  return (s||'') + `(${pcs.toLocaleString()}개)`;
}
function fmtMoney(n) { return (n||0).toLocaleString()+'원'; }
function today() { return new Date().toISOString().slice(0,10); }
function fmtDate(d) { return d?d.replace(/-/g,'.'):'-'; }
function toArray(val) { if(!val) return []; if(Array.isArray(val)) return val.filter(v=>v!=null); return Object.values(val).filter(v=>v!=null); }
function emptyRow(c) { return `<tr><td colspan="${c}" style="text-align:center;color:var(--muted);padding:20px">내역 없음</td></tr>`; }

// ── State ──
let state = { transactions:[], staff:[...DEFAULT_STAFF], nextId:1 };
let pendingDeleteId = null;

// Firebase 상태 변수 및 설정은 config.js 참조


function setFbStatus(cls, text) {
  const btn=document.getElementById('fbStatusBtn');
  if(!btn) return;
  btn.className='fb-status '+cls;
  btn.textContent=text;
}

function startFbListener() {
  if(!fbRef||fbListening) return;
  fbListening=true;
  fbRef.on('value', snap => {
    setFbStatus('connected','🟢 온라인');
    const data=snap.val();
    if(data) {
      state.transactions = toArray(data.transactions);
      state.staff        = toArray(data.staff);
      state.nextId       = data.nextId||1;
      DEFAULT_STAFF.forEach(n=>{ if(!state.staff.includes(n)) state.staff.push(n); });
      try { localStorage.setItem('egg_v5', JSON.stringify(state)); } catch(e){}
      renderAll();
    } else {
      setFbStatus('connected','🟢 온라인');
      if(state.transactions.length>0||state.staff.length>0) {
        fbRef.set(state).catch(e=>console.warn('초기 업로드 실패',e));
      }
    }
  }, err => {
    console.warn('Firebase 오류:', err.code, err.message);
    fbListening=false;
    if(err.code==='PERMISSION_DENIED') {
      setFbStatus('disconnected','🔴 권한오류(탭하여 확인)');
      document.getElementById('fbStatusBtn').onclick = () => {
        alert('⚠️ Firebase 보안 규칙 만료!\n\n아래 URL에서 규칙 재설정 후 게시:\nconsole.firebase.google.com/project/inventory-639a0/database/inventory-639a0-default-rtdb/rules\n\n규칙:\n{\n  "rules":{\n    ".read":true,\n    ".write":true\n  }\n}');
      };
    } else {
      setFbStatus('disconnected','🔴 오프라인('+err.code+')');
    }
    renderAll();
  });
}

async function connectFirebase() {
  setFbStatus('syncing','🟡 연결 중...');
  try {
    if(firebase.apps.length) await firebase.app().delete();
    firebase.initializeApp(FIREBASE_CONFIG);
    fbDb=firebase.database();
    fbRef=fbDb.ref('egg_data');
    startFbListener();
    setTimeout(()=>{
      const btn=document.getElementById('fbStatusBtn');
      if(btn&&btn.classList.contains('syncing')&&!fbListening) {
        setFbStatus('disconnected','🔴 연결시간초과');
        renderAll();
      }
    }, 8000);
  } catch(e) {
    console.warn('Firebase 초기화 실패:', e.message);
    setFbStatus('disconnected','🔴 오프라인');
    renderAll();
  }
}

async function saveState() {
  try { localStorage.setItem('egg_v5', JSON.stringify(state)); } catch(e){}
  if(fbRef) {
    try { await fbRef.set(state); }
    catch(e) { console.warn('Firebase 저장 실패:', e); setFbStatus('disconnected','🔴 저장실패'); }
  }
}

function showFbModal() { document.getElementById('fbModal').classList.add('open'); }
function closeFbModal() { document.getElementById('fbModal').classList.remove('open'); }

async function resetAllData() {
  if(!confirm('⚠️ 정말 초기화하시겠습니까?\n모든 거래 내역이 삭제됩니다.')) return;
  if(!confirm('마지막 확인입니다.\n정말 전체 데이터를 삭제하시겠습니까?')) return;
  state = { transactions:[], staff:[...DEFAULT_STAFF], nextId:1 };
  try { localStorage.removeItem('egg_v5'); } catch(e){}
  if(fbRef) {
    try { await fbRef.set(state); } catch(e){ console.warn('Firebase 초기화 실패',e); }
  }
  renderAll();
  closeFbModal();
  alert('✅ 초기화 완료');
}

// ── 재고 계산 ──
function calcStockByItem(item) {
  const isFin = FINISHED_ITEMS.includes(item);
  return (state.transactions||[]).filter(t=>t&&t.item===item).reduce((a,t)=>{
    if(isFin) {
      if(t.category==='make') return a+(t.pcs||0);
      if(t.category==='finished_out') return a-(t.pcs||0);
      return a;
    } else {
      return a+(t.type==='in'?(t.pcs||0):-(t.pcs||0));
    }
  },0);
}

// ── 화면 전환 ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  if(pg) pg.classList.add('active');
  document.querySelectorAll('nav button').forEach(b=>{
    const isAct=b.getAttribute('onclick')?.includes("'"+id+"'");
    b.classList.toggle('active', isAct);
    if(isAct) b.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  });
  if(id==='stats') renderStats();
}

// ── 스와이프 ──
const pageOrder = ['dashboard','inbound','outbound','make','finished','stats'];
let touchStartX = 0, touchEndX = 0;

function handleSwipe() {
  const swipeThreshold = 50;
  const diff = touchStartX - touchEndX;

  if(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA') return;

  const currentPageBtn = document.querySelector('nav button.active');
  if(!currentPageBtn) return;
  const currentId = currentPageBtn.getAttribute('onclick').match(/'([^']+)'/)[1];
  const currentIndex = pageOrder.indexOf(currentId);

  if(Math.abs(diff) > swipeThreshold) {
    if(diff > 0 && currentIndex < pageOrder.length-1) showPage(pageOrder[currentIndex+1]);
    else if(diff < 0 && currentIndex > 0) showPage(pageOrder[currentIndex-1]);
  }
}

let swipeBlocked = false;
function inTableWrap(el) {
  while(el && el!==document.body) {
    if(el.classList?.contains('table-wrap')) return true;
    if(el.tagName==='NAV') return true;
    el=el.parentElement;
  }
  return false;
}
document.addEventListener('touchstart', e=>{ touchStartX = e.changedTouches[0].clientX; swipeBlocked = inTableWrap(e.target); }, {passive:true});
document.addEventListener('touchend',   e=>{ touchEndX   = e.changedTouches[0].clientX; if(!swipeBlocked) handleSwipe(); }, {passive:true});

// ── 셀렉트 구성 ──
function buildSelects() {
  const inOpts  = INBOUND_ITEMS.map(i=>`<option value="${i}">${i}</option>`).join('');
  const finOpts = FINISHED_ITEMS.map(i=>`<option value="${i}">${i}</option>`).join('');
  const allFopt = '<option value="">전체</option>'+EGG_ITEMS.map(i=>`<option value="${i}">${i}</option>`).join('');
  const inFopt  = '<option value="">전체</option>'+inOpts;
  const staffOpts = state.staff.map(s=>`<option value="${s}">${s}</option>`).join('');
  const staffFopt = '<option value="">전체</option>'+staffOpts;
  const staffAll  = '<option value="">공통</option>'+staffOpts;

  document.getElementById('inItem').innerHTML      = inOpts;
  document.getElementById('inFilterItem').innerHTML= inFopt;
  document.getElementById('outItem').innerHTML     = inOpts;
  document.getElementById('outFilterItem').innerHTML=inFopt;
  document.getElementById('outFilterStaff').innerHTML=staffFopt;
  document.getElementById('outStaff').innerHTML    = staffAll;
  document.getElementById('mkItem').innerHTML      = finOpts;
  document.getElementById('finItem').innerHTML     = finOpts;
  document.getElementById('finStaff').innerHTML    = staffAll;
}

// ── 입고 저장 ──
async function saveInbound() {
  const date=document.getElementById('inDate').value;
  const item=document.getElementById('inItem').value;
  const tong=parseInt(document.getElementById('inQtyTong').value)||0;
  const flat=parseInt(document.getElementById('inQtyFlat').value)||0;
  const ea=parseInt(document.getElementById('inQtyEa').value)||0;
  const pcs=calcPcs(tong,flat,item)+ea;
  const price=parseFloat(document.getElementById('inPrice').value)||0;
  const memo=document.getElementById('inMemo').value.trim();
  if(!date) return alert('날짜를 입력하세요');
  if(pcs<=0) return alert('수량을 입력하세요');
  state.transactions.push({id:state.nextId++,type:'in',category:'inbound',date,item,tong,flat,pcs,price,amount:pcs*price,memo});
  await saveState();
  document.getElementById('inQtyTong').value=0; document.getElementById('inQtyFlat').value=0; document.getElementById('inQtyEa').value=0;
  document.getElementById('inPrice').value=''; document.getElementById('inMemo').value='';
  updateInCalc(); renderAll();
  alert(`✅ [${item}] 입고 완료\n${fmtQty(pcs,item)}`);
}

// ── 원란 출고 저장 ──
async function saveOutbound() {
  const date=document.getElementById('outDate').value;
  const item=document.getElementById('outItem').value;
  const staff=document.getElementById('outStaff').value;
  const tong=parseInt(document.getElementById('outQtyTong').value)||0;
  const flat=parseInt(document.getElementById('outQtyFlat').value)||0;
  const ea=parseInt(document.getElementById('outQtyEa').value)||0;
  const pcs=calcPcs(tong,flat,item)+ea;
  const price=parseFloat(document.getElementById('outPrice').value)||0;
  const memo=document.getElementById('outMemo').value.trim();
  if(!date) return alert('날짜를 입력하세요');
  if(pcs<=0) return alert('수량을 입력하세요');
  const stock=calcStockByItem(item);
  if(pcs>stock) return alert(`⚠️ [${item}] 재고 부족!\n현재: ${fmtQty(stock,item)}\n요청: ${fmtQty(pcs,item)}`);
  state.transactions.push({id:state.nextId++,type:'out',category:'raw',date,item,staff,tong,flat,pcs,price,amount:pcs*price,memo});
  await saveState();
  document.getElementById('outQtyTong').value=0; document.getElementById('outQtyFlat').value=0; document.getElementById('outQtyEa').value=0;
  document.getElementById('outPrice').value=''; document.getElementById('outMemo').value='';
  updateOutCalc(); renderAll();
  alert(`✅ [${item}] 출고 완료\n${fmtQty(pcs,item)}`);
}

// ── 완제품 제작 저장 ──
async function saveMake() {
  const date=document.getElementById('mkDate').value;
  const item=document.getElementById('mkItem').value;
  const tong=parseInt(document.getElementById('mkQtyTong').value)||0;
  const flat=parseInt(document.getElementById('mkQtyFlat').value)||0;
  const ea=parseInt(document.getElementById('mkQtyEa').value)||0;
  const pcs=calcPcs(tong,flat,item)+ea;
  const memo=document.getElementById('mkMemo').value.trim();
  if(!date) return alert('날짜를 입력하세요');
  if(pcs<=0) return alert('수량을 입력하세요');
  const src=FINISHED_SOURCE[item];
  if(src) {
    const need=Math.ceil(pcs*src.ratio);
    if(need>calcStockByItem(src.source)) return alert(`⚠️ [${src.source}] 원료 부족!\n필요: ${fmtQty(need,src.source)}`);
  }
  state.transactions.push({id:state.nextId++,type:'in',category:'make',date,item,tong,flat,pcs,price:0,amount:0,memo:memo||'완제품 제작'});
  if(src) {
    const need=Math.ceil(pcs*src.ratio);
    const u=pcsToUnits(need,src.source);
    state.transactions.push({id:state.nextId++,type:'out',category:'consumption',date,item:src.source,tong:u.tong,flat:u.flat,pcs:need,price:0,amount:0,memo:`[자동] ${item} 제작 원료`});
  }
  await saveState();
  document.getElementById('mkQtyTong').value=0; document.getElementById('mkQtyFlat').value=0; document.getElementById('mkQtyEa').value=0; document.getElementById('mkMemo').value='';
  updateMkCalc(); renderAll();
  const srcMsg=src?`\n📥 ${src.source} ${fmtQty(Math.ceil(pcs*src.ratio),src.source)} 차감`:'';
  alert(`✅ [${item}] 제작 완료\n${fmtQty(pcs,item)}${srcMsg}`);
}

// ── 완제품 출고 저장 ──
async function saveFinished() {
  const date=document.getElementById('finDate').value;
  const item=document.getElementById('finItem').value;
  const staff=document.getElementById('finStaff').value;
  const tong=parseInt(document.getElementById('finQtyTong').value)||0;
  const flat=parseInt(document.getElementById('finQtyFlat').value)||0;
  const ea=parseInt(document.getElementById('finQtyEa').value)||0;
  const pcs=calcPcs(tong,flat,item)+ea;
  const price=parseFloat(document.getElementById('finPrice').value)||0;
  const memo=document.getElementById('finMemo').value.trim();
  if(!date) return alert('날짜를 입력하세요');
  if(pcs<=0) return alert('수량을 입력하세요');
  const stock=calcStockByItem(item);
  if(pcs>stock) return alert(`⚠️ [${item}] 완제품 재고 부족!\n현재: ${fmtQty(stock,item)}\n💡 먼저 완제품 제작을 등록하세요`);
  state.transactions.push({id:state.nextId++,type:'out',category:'finished_out',date,item,staff,tong,flat,pcs,price,amount:pcs*price,memo});
  await saveState();
  document.getElementById('finQtyTong').value=0; document.getElementById('finQtyFlat').value=0; document.getElementById('finQtyEa').value=0;
  document.getElementById('finPrice').value=''; document.getElementById('finMemo').value='';
  updateFinCalc(); renderAll();
  alert(`✅ [${item}] 완제품 출고 완료\n${fmtQty(pcs,item)}`);
}

// ── 실시간 계산 ──
function updateInCalc() {
  const item=document.getElementById('inItem').value;
  const ea=parseInt(document.getElementById('inQtyEa').value)||0;
  const pcs=calcPcs(document.getElementById('inQtyTong').value,document.getElementById('inQtyFlat').value,item)+ea;
  const price=parseFloat(document.getElementById('inPrice').value)||0;
  const el=document.getElementById('inCalcInfo');
  if(el) el.textContent=`합계: ${fmtQty(pcs,item)} | 금액: ${fmtMoney(pcs*price)}`;
}
function updateOutCalc() {
  const item=document.getElementById('outItem').value;
  const ea=parseInt(document.getElementById('outQtyEa').value)||0;
  const pcs=calcPcs(document.getElementById('outQtyTong').value,document.getElementById('outQtyFlat').value,item)+ea;
  const price=parseFloat(document.getElementById('outPrice').value)||0;
  const stock=calcStockByItem(item);
  const el=document.getElementById('outCalcInfo');
  if(el) el.innerHTML=`합계: ${fmtQty(pcs,item)} | 금액: ${fmtMoney(pcs*price)}<br><span style="color:${pcs>stock?'var(--red)':'var(--green)'}">현재 재고: ${fmtQty(stock,item)}</span>`;
}
function updateMkCalc() {
  const item=document.getElementById('mkItem').value;
  const ea=parseInt(document.getElementById('mkQtyEa').value)||0;
  const pcs=calcPcs(document.getElementById('mkQtyTong').value,document.getElementById('mkQtyFlat').value,item)+ea;
  const src=FINISHED_SOURCE[item];
  const el=document.getElementById('mkCalcInfo');
  if(!el) return;
  let txt=`제작량: ${fmtQty(pcs,item)}`;
  if(src&&pcs>0) {
    const need=Math.ceil(pcs*src.ratio); const srcStock=calcStockByItem(src.source);
    txt+=`<br><span style="color:${need>srcStock?'var(--red)':'var(--green)'}">원료 [${src.source}] ${fmtQty(need,src.source)} 차감 필요 (현재: ${fmtQty(srcStock,src.source)})</span>`;
  } else if(item&&!src) {
    txt+=`<br><span style="color:var(--muted)">원료 매핑 없음 - 차감 없이 제작</span>`;
  }
  el.innerHTML=txt;
}
function updateFinCalc() {
  const item=document.getElementById('finItem').value;
  const ea=parseInt(document.getElementById('finQtyEa').value)||0;
  const pcs=calcPcs(document.getElementById('finQtyTong').value,document.getElementById('finQtyFlat').value,item)+ea;
  const price=parseFloat(document.getElementById('finPrice').value)||0;
  const stock=calcStockByItem(item);
  const el=document.getElementById('finCalcInfo');
  if(el) el.innerHTML=`합계: ${fmtQty(pcs,item)} | 금액: ${fmtMoney(pcs*price)}<br><span style="color:${pcs>stock?'var(--red)':'var(--green)'}">완제품 재고: ${fmtQty(stock,item)}</span>`;
}

// ── 렌더 전체 ──
function renderAll() {
  buildSelects();
  populateStatsYears();
  renderDashboard();
  renderInboundTable();
  renderOutboundTable();
  renderMakeTable();
  renderFinishedTable();
}

function fmtStatSub(pcs, item) {
  if(!pcs) return '0개';
  const {tong, flat} = pcsToUnits(pcs, item||'왕란');
  const ea = pcs - tong*getPcsPerTong(item||'왕란') - flat*getPcsPerFlat(item||'왕란');
  let s = '';
  if(tong) s += tong+'통 ';
  if(flat) s += flat+'판 ';
  if(ea)   s += ea+'개';
  return s.trim() || pcs+'개';
}

function renderDashboard() {
  const t=today(), ym=t.slice(0,7);
  const txs=(state.transactions||[]).filter(x=>x&&x.type&&x.date);
  const todayIn  = txs.filter(x=>x.category==='inbound'&&x.date===t).reduce((a,x)=>a+(x.pcs||0),0);
  const todayOut = txs.filter(x=>x.category==='raw'&&x.date===t).reduce((a,x)=>a+(x.pcs||0),0);
  const rawStock = INBOUND_ITEMS.reduce((a,it)=>a+calcStockByItem(it),0);
  const finStock = FINISHED_ITEMS.reduce((a,it)=>a+calcStockByItem(it),0);

  document.getElementById('dashRawStock').textContent=rawStock.toLocaleString();
  document.getElementById('dashRawSub').textContent=fmtStatSub(rawStock);
  document.getElementById('dashTodayIn').textContent=todayIn.toLocaleString();
  document.getElementById('dashTodayInSub').textContent=fmtStatSub(todayIn);
  document.getElementById('dashTodayOut').textContent=todayOut.toLocaleString();
  document.getElementById('dashTodayOutSub').textContent=fmtStatSub(todayOut);
  document.getElementById('dashFinStock').textContent=finStock.toLocaleString();
  document.getElementById('dashFinSub').textContent=fmtStatSub(finStock);

  function makeChip(item) {
    const s=calcStockByItem(item);
    const {tong,flat}=pcsToUnits(s,item);
    const sub=s===0?'없음':(tong?tong+'통':'')+(flat?flat+'판':'');
    return `<div class="stock-chip">
      <div class="name">${item}</div>
      <div class="qty">${s.toLocaleString()}</div>
      <div class="sub">${sub||s+'개'}</div>
    </div>`;
  }
  document.getElementById('stockGridInbound').innerHTML=INBOUND_ITEMS.map(makeChip).join('');
  document.getElementById('stockGridFinished').innerHTML=FINISHED_ITEMS.map(makeChip).join('');

  const catLabel={inbound:'입고',raw:'원란출고',finished_out:'완제품출고',make:'제작',consumption:'소모'};
  const catBadge={inbound:'badge-in',raw:'badge-out',finished_out:'badge-fin',make:'badge-make',consumption:'badge-con'};
  const recent=(state.transactions||[]).filter(t=>t&&t.id&&t.type&&t.item).sort((a,b)=>b.id-a.id).slice(0,20);
  document.getElementById('recentTable').innerHTML=recent.length?recent.map(r=>`
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td><span class="badge ${catBadge[r.category]||'badge-in'}">${catLabel[r.category]||r.type}</span></td>
      <td>${r.item}</td>
      <td>${fmtQty(r.pcs,r.item)}</td>
      <td>${r.amount?fmtMoney(r.amount):'-'}</td>
      <td><button onclick="askDelete(${r.id})" style="background:var(--red);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;">삭제</button>
      <button onclick="openEdit(${r.id})" style="background:var(--brown-light);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;margin-left:3px;">수정</button></td>
    </tr>`).join(''):emptyRow(6);
}

function renderInboundTable() {
  const fi=document.getElementById('inFilterItem').value;
  let data=(state.transactions||[]).filter(t=>t&&t.category==='inbound');
  if(fi) data=data.filter(t=>t.item===fi);
  data=data.sort((a,b)=>b.id-a.id).slice(0,50);
  document.getElementById('inboundTable').innerHTML=data.length?data.map(r=>{
    const {tong,flat}=pcsToUnits(r.pcs,r.item);
    return `<tr>
      <td>${fmtDate(r.date)}</td><td>${r.item}</td>
      <td>${r.tong!=null?r.tong:tong}</td>
      <td>${r.flat!=null?r.flat:flat}</td>
      <td>${r.pcs.toLocaleString()}</td>
      <td>${r.price?r.price.toLocaleString()+'원':'-'}</td>
      <td>${r.amount?fmtMoney(r.amount):'-'}</td>
      <td><button onclick="askDelete(${r.id})" style="background:var(--red);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;">삭제</button>
      <button onclick="openEdit(${r.id})" style="background:var(--brown-light);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;margin-left:3px;">수정</button></td>
    </tr>`;}).join(''):emptyRow(8);
}

function renderOutboundTable() {
  const fi=document.getElementById('outFilterItem').value;
  const fs=document.getElementById('outFilterStaff').value;
  let data=(state.transactions||[]).filter(t=>t&&t.category==='raw');
  if(fi) data=data.filter(t=>t.item===fi);
  if(fs) data=data.filter(t=>t.staff===fs);
  data=data.sort((a,b)=>b.id-a.id).slice(0,50);
  document.getElementById('outboundTable').innerHTML=data.length?data.map(r=>{
    const {tong,flat}=pcsToUnits(r.pcs,r.item);
    return `<tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.staff||'-'}</td><td>${r.item}</td>
      <td>${r.tong!=null?r.tong:tong}</td>
      <td>${r.flat!=null?r.flat:flat}</td>
      <td>${r.pcs.toLocaleString()}</td>
      <td>${r.amount?fmtMoney(r.amount):'-'}</td>
      <td><button onclick="askDelete(${r.id})" style="background:var(--red);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;">삭제</button>
      <button onclick="openEdit(${r.id})" style="background:var(--brown-light);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;margin-left:3px;">수정</button></td>
    </tr>`;}).join(''):emptyRow(8);
}

function renderMakeTable() {
  let data=(state.transactions||[]).filter(t=>t&&t.category==='make').sort((a,b)=>b.id-a.id).slice(0,50);
  document.getElementById('makeTable').innerHTML=data.length?data.map(r=>{
    const src=FINISHED_SOURCE[r.item];
    const srcInfo=src?`${src.source} ${fmtQty(Math.ceil((r.pcs||0)*src.ratio),src.source)} 차감`:'-';
    return `<tr>
      <td>${fmtDate(r.date)}</td><td>${r.item}</td>
      <td>${fmtQty(r.pcs,r.item)}</td>
      <td style="font-size:11px;color:var(--muted)">${srcInfo}</td>
      <td style="color:var(--muted)">${r.memo||''}</td>
      <td><button onclick="askDelete(${r.id})" style="background:var(--red);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;">삭제</button>
      <button onclick="openEdit(${r.id})" style="background:var(--brown-light);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;margin-left:3px;">수정</button></td>
    </tr>`;}).join(''):emptyRow(6);
}

function renderFinishedTable() {
  let data=(state.transactions||[]).filter(t=>t&&t.category==='finished_out').sort((a,b)=>b.id-a.id).slice(0,50);
  document.getElementById('finishedTable').innerHTML=data.length?data.map(r=>{
    const {tong,flat}=pcsToUnits(r.pcs,r.item);
    return `<tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.staff||'-'}</td><td>${r.item}</td>
      <td>${r.tong!=null?r.tong:tong}</td>
      <td>${r.flat!=null?r.flat:flat}</td>
      <td>${r.pcs.toLocaleString()}</td>
      <td>${r.amount?fmtMoney(r.amount):'-'}</td>
      <td><button onclick="askDelete(${r.id})" style="background:var(--red);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;">삭제</button>
      <button onclick="openEdit(${r.id})" style="background:var(--brown-light);color:#fff;border:none;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;margin-left:3px;">수정</button></td>
    </tr>`;}).join(''):emptyRow(8);
}

function renderStats() {
  const year=document.getElementById('statsYear').value;
  const month=parseInt(document.getElementById('statsMonth').value);
  let data=(state.transactions||[]).filter(t=>t&&t.date&&t.date.startsWith(year));
  if(month>0) data=data.filter(t=>parseInt(t.date.slice(5,7))===month);
  const totalIn  = data.filter(t=>t.category==='inbound').reduce((a,t)=>a+(t.pcs||0),0);
  const totalOut = data.filter(t=>t.category==='raw').reduce((a,t)=>a+(t.pcs||0),0);
  const inAmt    = data.filter(t=>t.category==='inbound').reduce((a,t)=>a+(t.amount||0),0);
  const outAmt   = data.filter(t=>t.category==='raw').reduce((a,t)=>a+(t.amount||0),0);
  document.getElementById('statIn').textContent=totalIn.toLocaleString();
  document.getElementById('statOut').textContent=totalOut.toLocaleString();
  document.getElementById('statInAmt').textContent=inAmt.toLocaleString();
  document.getElementById('statOutAmt').textContent=outAmt.toLocaleString();
}

function populateStatsYears() {
  const sel=document.getElementById('statsYear');
  const years=new Set((state.transactions||[]).filter(t=>t&&t.date).map(t=>t.date.slice(0,4)));
  years.add(new Date().getFullYear().toString());
  const sorted=[...years].sort().reverse();
  const cur=sel.value||sorted[0];
  sel.innerHTML=sorted.map(y=>`<option value="${y}">${y}년</option>`).join('');
  sel.value=sorted.includes(cur)?cur:sorted[0];
}

// ── 빠른 입력 ──
let voiceParsed = null;

function openVoiceModal() {
  voiceParsed = null;
  document.getElementById('voiceTextInput').value = '';
  document.getElementById('voiceStatus').textContent = '';
  document.getElementById('voiceResult').style.display = 'none';
  document.getElementById('voiceApplyBtn').style.display = 'none';
  document.getElementById('voiceModal').classList.add('open');
  setTimeout(()=>document.getElementById('voiceTextInput').focus(), 100);
}
function closeVoiceModal() {
  document.getElementById('voiceModal').classList.remove('open');
}

function parseTextInput() {
  const text = document.getElementById('voiceTextInput').value.trim();
  if(!text) return;
  document.getElementById('voiceStatus').textContent = 'AI가 분석 중...';
  document.getElementById('voiceResult').style.display = 'none';
  document.getElementById('voiceApplyBtn').style.display = 'none';
  parseVoiceWithAI(text);
}

function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) {
    document.getElementById('voiceStatus').textContent = '⚠️ 음성인식은 HTTPS 환경에서만 작동해요. 텍스트로 입력해주세요.';
    return;
  }
  const rec = new SR();
  rec.lang = 'ko-KR';
  rec.interimResults = true;
  const btn = document.getElementById('micBtn');
  btn.textContent = '🔴';
  document.getElementById('voiceStatus').textContent = '말씀하세요...';
  rec.onresult = e => {
    const t = [...e.results].map(r=>r[0].transcript).join('');
    document.getElementById('voiceTextInput').value = t;
  };
  rec.onend = () => {
    btn.textContent = '🎤';
    const text = document.getElementById('voiceTextInput').value.trim();
    if(text) { document.getElementById('voiceStatus').textContent = 'AI가 분석 중...'; parseVoiceWithAI(text); }
    else document.getElementById('voiceStatus').textContent = '인식된 내용이 없어요.';
  };
  rec.onerror = e => {
    btn.textContent = '🎤';
    document.getElementById('voiceStatus').textContent = '오류: ' + e.error;
  };
  rec.start();
}

// Enter키로도 분석
document.addEventListener('DOMContentLoaded', ()=>{
  const el = document.getElementById('voiceTextInput');
  if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter') parseTextInput(); });
});

function parseVoiceWithAI(text) {
  // ── 오프라인 규칙 기반 파서 (API 불필요) ──
  const t = text.trim();

  // 1) 카테고리 감지
  const catMap = [
    {keys:['완제품출고','완품출고'], cat:'완제품출고'},
    {keys:['완제품제작','제작','가공'], cat:'완제품제작'},
    {keys:['원란출고','원란 출고','출고'], cat:'원란출고'},
    {keys:['입고'], cat:'입고'},
  ];
  let category = '입고'; // 기본값
  for(const {keys, cat} of catMap) {
    if(keys.some(k => t.includes(k))) { category = cat; break; }
  }

  // 2) 품목 감지 (긴 이름 우선 매칭)
  const allItems = [...FINISHED_ITEMS, ...INBOUND_ITEMS]
    .sort((a,b) => b.length - a.length);
  let item = '';
  for(const it of allItems) {
    if(t.includes(it)) { item = it; break; }
  }
  // 없으면 유사도 매칭 (초성/일부 포함)
  if(!item) {
    const alias = {
      '왕':'왕란','특':'특란','대':'대란','중':'중란',
      '등외':'등외란','구운':'구운란','방사':'방사란',
      '유정':'유정란','메추':'메추리','퓨왕':'퓨왕',
      '명품':'명품특란','초란':'초란','영왕':'영왕','영특':'영특',
    };
    for(const [k,v] of Object.entries(alias)) {
      if(t.includes(k)) { item = v; break; }
    }
  }
  if(!item) item = '왕란'; // fallback

  // 3) 수량 파싱 (숫자+단위)
  const numBefore = (unit) => {
    const m = t.match(new RegExp('(\d+)\s*' + unit));
    return m ? parseInt(m[1]) : 0;
  };
  const tong = numBefore('통');
  const flat = numBefore('판');
  const ea   = numBefore('개');

  // 4) 결과 표시
  voiceParsed = { category, item, tong, flat, ea, memo: '' };

  const catLabel = {입고:'📥 입고', 원란출고:'📤 원란출고', 완제품제작:'🏭 완제품제작', 완제품출고:'📦 완제품출고'};
  document.getElementById('voiceResult').style.display = 'block';
  document.getElementById('voiceResult').innerHTML =
    `<b>${catLabel[category]||category}</b><br>` +
    `품목: <b>${item}</b> | 통: ${tong} | 판: ${flat} | 개: ${ea}` +
    `<br><span style="font-size:11px;color:var(--muted)">품목·수량이 다르면 직접 수정 후 저장하세요</span>`;
  document.getElementById('voiceApplyBtn').style.display = 'inline-block';
  document.getElementById('voiceStatus').textContent = '결과를 확인하고 적용하세요';
}

function applyVoiceResult() {
  if(!voiceParsed) return;
  const p = voiceParsed;
  const pageMap = {입고:'inbound', 원란출고:'outbound', 완제품제작:'make', 완제품출고:'finished'};
  const page = pageMap[p.category];
  if(!page) return alert('구분을 인식하지 못했어요');

  showPage(page);

  const pfx = {inbound:'in', outbound:'out', make:'mk', finished:'fin'}[page];

  // 품목 설정
  const itemSel = document.getElementById(pfx+'Item');
  if(itemSel) {
    const opt = [...itemSel.options].find(o=>o.value===p.item);
    if(opt) itemSel.value = p.item;
  }
  // 수량 설정
  const setVal = (id, v) => { const el=document.getElementById(id); if(el) el.value=v||0; };
  setVal(pfx+'QtyTong', p.tong);
  setVal(pfx+'QtyFlat', p.flat);
  setVal(pfx+'QtyEa',   p.ea);
  if(p.memo) setVal(pfx+'Memo', p.memo);

  // 실시간 계산 갱신
  const calcMap = {in:updateInCalc, out:updateOutCalc, mk:updateMkCalc, fin:updateFinCalc};
  if(calcMap[pfx]) calcMap[pfx]();

  closeVoiceModal();
}

// ── 수정 ──
let pendingEditId = null;

function openEdit(id) {
  const t=(state.transactions||[]).find(x=>x&&x.id===id);
  if(!t) return;
  pendingEditId = id;

  // 품목 옵션 구성
  const items = t.category==='make'||t.category==='finished_out' ? FINISHED_ITEMS : INBOUND_ITEMS;
  document.getElementById('editItem').innerHTML = items.map(i=>`<option value="${i}">${i}</option>`).join('');

  // 직원 필드 표시 여부
  const hasStaff = t.category==='raw'||t.category==='finished_out';
  document.getElementById('editStaffGroup').style.display = hasStaff ? '' : 'none';
  if(hasStaff) {
    document.getElementById('editStaff').innerHTML =
      '<option value="">공통</option>'+state.staff.map(s=>`<option value="${s}">${s}</option>`).join('');
    document.getElementById('editStaff').value = t.staff||'';
  }

  // 단가 필드 표시 여부 (make/consumption은 단가 없음)
  const hasPrice = t.category!=='make'&&t.category!=='consumption';
  document.getElementById('editPriceGroup').style.display = hasPrice ? '' : 'none';

  // 값 채우기
  document.getElementById('editDate').value = t.date||'';
  document.getElementById('editItem').value = t.item||'';
  const {tong,flat} = pcsToUnits(t.pcs||0, t.item);
  const ea = (t.pcs||0) - tong*getPcsPerTong(t.item) - flat*getPcsPerFlat(t.item);
  document.getElementById('editTong').value = t.tong!=null ? t.tong : tong;
  document.getElementById('editFlat').value = t.flat!=null ? t.flat : flat;
  document.getElementById('editEa').value = ea||0;
  document.getElementById('editPrice').value = t.price||0;
  document.getElementById('editMemo').value = t.memo||'';

  updateEditCalc();
  document.getElementById('editModal').classList.add('open');
}

function updateEditCalc() {
  const item = document.getElementById('editItem').value;
  const tong = parseInt(document.getElementById('editTong').value)||0;
  const flat = parseInt(document.getElementById('editFlat').value)||0;
  const ea   = parseInt(document.getElementById('editEa').value)||0;
  const pcs  = calcPcs(tong, flat, item) + ea;
  const price= parseFloat(document.getElementById('editPrice').value)||0;
  const el   = document.getElementById('editCalcInfo');
  if(el) el.textContent = `합계: ${fmtQty(pcs,item)} | 금액: ${fmtMoney(pcs*price)}`;
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  pendingEditId = null;
}

async function confirmEdit() {
  const t=(state.transactions||[]).find(x=>x&&x.id===pendingEditId);
  if(!t) return;

  const item  = document.getElementById('editItem').value;
  const tong  = parseInt(document.getElementById('editTong').value)||0;
  const flat  = parseInt(document.getElementById('editFlat').value)||0;
  const ea    = parseInt(document.getElementById('editEa').value)||0;
  const pcs   = calcPcs(tong, flat, item) + ea;
  const price = parseFloat(document.getElementById('editPrice').value)||0;

  if(pcs<=0) return alert('수량을 입력하세요');

  t.date  = document.getElementById('editDate').value;
  t.item  = item;
  t.tong  = tong;
  t.flat  = flat;
  t.pcs   = pcs;
  t.price = price;
  t.amount= pcs * price;
  t.memo  = document.getElementById('editMemo').value.trim();
  if(t.category==='raw'||t.category==='finished_out') {
    t.staff = document.getElementById('editStaff').value;
  }

  // make 수정 시 연결된 consumption 트랜잭션도 동기화 [Bug2 Fix]
  if(t.category==='make') {
    const src=FINISHED_SOURCE[item];
    const autoKey='[자동] ';
    const conIdx=(state.transactions||[]).findIndex(x=>x&&x.category==='consumption'&&x.date===t.date&&x.memo&&x.memo.startsWith(autoKey));
    if(src) {
      const need=Math.ceil(pcs*src.ratio);
      const u=pcsToUnits(need,src.source);
      if(conIdx>=0) {
        Object.assign(state.transactions[conIdx],{date:t.date,item:src.source,tong:u.tong,flat:u.flat,pcs:need,memo:`[자동] ${item} 제작 원료`});
      } else {
        state.transactions.push({id:state.nextId++,type:'out',category:'consumption',date:t.date,item:src.source,tong:u.tong,flat:u.flat,pcs:need,price:0,amount:0,memo:`[자동] ${item} 제작 원료`});
      }
    } else if(conIdx>=0) {
      state.transactions=state.transactions.filter((_,i)=>i!==conIdx);
    }
  }

  await saveState();
  renderAll();
  closeEditModal();
}

// ── 삭제 ──
function askDelete(id) {
  pendingDeleteId=id;
  const t=(state.transactions||[]).find(x=>x&&x.id===id);
  document.getElementById('deleteModalMsg').textContent=t?`[${t.category||t.type}] ${fmtDate(t.date)} / ${t.item} / ${fmtQty(t.pcs,t.item)} 을 삭제합니다.`:'';
  document.getElementById('deleteModal').classList.add('open');
}
function closeDeleteModal() { document.getElementById('deleteModal').classList.remove('open'); pendingDeleteId=null; }
async function confirmDelete() {
  const target=(state.transactions||[]).find(t=>t&&t.id===pendingDeleteId);
  if(target?.category==='make') {
    const key=`[자동] ${target.item}`;
    state.transactions=(state.transactions||[]).filter(t=>{
      if(!t) return false;
      if(t.id===pendingDeleteId) return false;
      if(t.category==='consumption'&&t.date===target.date&&t.memo?.startsWith(key)) return false;
      return true;
    });
  } else {
    state.transactions=(state.transactions||[]).filter(t=>t&&t.id!==pendingDeleteId);
  }
  await saveState(); renderAll(); closeDeleteModal();
}

// ── 엑셀 ──
function exportExcel() {
  if(!(state.transactions||[]).length) return alert('데이터가 없습니다');
  const catLabel={inbound:'입고',raw:'원란출고',finished_out:'완제품출고',make:'완제품제작',consumption:'원료소모'};
  const rows=[...state.transactions].filter(t=>t&&t.item).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.id-b.id).map(t=>{
    const {tong,flat}=pcsToUnits(t.pcs||0,t.item||'왕란');
    return {'날짜':t.date,'구분':catLabel[t.category]||t.type,'품목':t.item,'통':t.tong??tong,'판':t.flat??flat,'합계(개)':t.pcs||0,'단가':t.price||'','금액':t.amount||'','메모':t.memo||''};
  });
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'거래내역');
  XLSX.writeFile(wb,`계란재고_${today()}.xlsx`);
}


// ── 초기화 ──
window.onload = async () => {
  // 로컬 데이터 먼저 로드
  try {
    const raw=localStorage.getItem('egg_v5');
    if(raw) { state=JSON.parse(raw); if(!state.transactions) state.transactions=[]; if(!state.staff) state.staff=[...DEFAULT_STAFF]; if(!state.nextId) state.nextId=1; }
  } catch(e){}
  DEFAULT_STAFF.forEach(n=>{ if(!state.staff.includes(n)) state.staff.push(n); });

  // 날짜 초기값
  [['inDate'],['outDate'],['mkDate'],['finDate']].forEach(([id])=>{ const el=document.getElementById(id); if(el) el.valueAsDate=new Date(); });

  // 이벤트
  ['inQtyTong','inQtyFlat','inQtyEa','inPrice','inItem'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',updateInCalc); });
  ['outQtyTong','outQtyFlat','outQtyEa','outPrice','outItem'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',updateOutCalc); });
  ['mkQtyTong','mkQtyFlat','mkQtyEa','mkItem'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',updateMkCalc); });
  ['finQtyTong','finQtyFlat','finQtyEa','finPrice','finItem'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',updateFinCalc); });
  ['editTong','editFlat','editEa','editPrice','editItem'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',updateEditCalc); });

  populateStatsYears();
  renderAll();

  // Firebase 자동 연결
  await connectFirebase();
};