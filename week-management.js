// Calendar weeks are local Monday–Sunday; opening the app never advances a saved plan.
const STORAGE_KEY_WEEKS = 'frugal_calendar_weeks_v1';
const WEEK_FIELDS = ['weeklyPlan','checkedItems','cookedDays','shoppingDays','customShoppingItems','servings','targetBudget'];
let calendarWeeks = {};
let activeWeekStart = '';
let calendarWeeksReady = false;
function copyWeekData(value) { return JSON.parse(JSON.stringify(value)); }
function weekDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function mondayKey(date = new Date()) {
  const d = new Date(date.getFullYear(),date.getMonth(),date.getDate(),12);
  d.setDate(d.getDate()-(d.getDay()+6)%7);
  return weekDateKey(d);
}
function shiftWeek(key, offset) {
  const d = new Date(key+'T12:00:00'); d.setDate(d.getDate()+offset*7); return weekDateKey(d);
}
function validWeekKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(key+'T12:00:00');
  return !isNaN(d) && weekDateKey(d) === key && d.getDay() === 1;
}
function validWeekRecord(record) {
  return record && typeof record === 'object' && record.weeklyPlan &&
    ['mon','tue','wed','thu','fri','sat','sun'].every(day=>
      ['main','side','soup'].every(cat=>typeof record.weeklyPlan[day]?.[cat] === 'string')) &&
    Number.isInteger(record.servings) && record.servings>=1 && record.servings<=7 &&
    Number.isFinite(record.targetBudget) && record.targetBudget>0 &&
    record.checkedItems && typeof record.checkedItems==='object' && !Array.isArray(record.checkedItems) &&
    Array.isArray(record.cookedDays) && Array.isArray(record.shoppingDays) && Array.isArray(record.customShoppingItems);
}
function currentWeekRecord() {
  return copyWeekData(Object.fromEntries(WEEK_FIELDS.map(field=>[field,state[field]])));
}
function persistCalendarWeeks() {
  if (!calendarWeeksReady) return;
  calendarWeeks[activeWeekStart] = currentWeekRecord();
  localStorage.setItem(STORAGE_KEY_WEEKS,JSON.stringify({version:1,activeWeekStart,weeks:calendarWeeks}));
}
function restoreWeekRecord(record) {
  for (const field of WEEK_FIELDS) state[field] = copyWeekData(record[field]);
}
function initializeCalendarWeeks() {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY_WEEKS)||'null');
    if (saved?.version===1 && validWeekKey(saved.activeWeekStart) && validWeekRecord(saved.weeks?.[saved.activeWeekStart])) {
      calendarWeeks=Object.fromEntries(Object.entries(saved.weeks).filter(([key,value])=>validWeekKey(key)&&validWeekRecord(value)));
      activeWeekStart=saved.activeWeekStart;
      restoreWeekRecord(calendarWeeks[activeWeekStart]);
    }
  } catch (error) { console.warn('Week storage could not be read',error); }
  // Keep the original storage keys intact as a migration backup.
  if (!activeWeekStart) {
    if (!localStorage.getItem('frugal_before_calendar_migration_v1')) localStorage.setItem('frugal_before_calendar_migration_v1',JSON.stringify(currentWeekRecord()));
    activeWeekStart=mondayKey();
  }
  calendarWeeksReady=true;
  persistCalendarWeeks();
}
function calendarWeekRange(key=activeWeekStart) {
  const first=new Date(key+'T12:00:00'); const last=new Date(first); last.setDate(last.getDate()+6);
  return `${first.getFullYear()}/${first.getMonth()+1}/${first.getDate()}〜${last.getFullYear()}/${last.getMonth()+1}/${last.getDate()}`;
}
function calendarWeekLabel(key=activeWeekStart) {
  return key===mondayKey() ? '今週' : key===shiftWeek(mondayKey(),1) ? '来週' : '保存した週';
}
function saveWeekLegacyMirror() {
  for (const [field,key] of [['weeklyPlan',STORAGE_KEY_PLAN],['checkedItems',STORAGE_KEY_CHECKED],['cookedDays',STORAGE_KEY_COOKED_DAYS],['shoppingDays',STORAGE_KEY_SHOPPING_DAYS],['customShoppingItems',STORAGE_KEY_CUSTOM_SHOPPING]]) localStorage.setItem(key,JSON.stringify(state[field]));
  localStorage.setItem(STORAGE_KEY_SERVINGS,String(state.servings));
  localStorage.setItem(STORAGE_KEY_BUDGET,String(state.targetBudget));
}
window.selectCalendarWeek = function(key) {
  if (!validWeekKey(key)||key===activeWeekStart) return;
  persistCalendarWeeks();
  const previous=activeWeekStart;
  const before=currentWeekRecord();
  activeWeekStart=key;
  if (calendarWeeks[key]) restoreWeekRecord(calendarWeeks[key]);
  else {
    // Generate into a new slot only after the existing week has been saved.
    state.checkedItems={}; state.cookedDays=[];
    state.shoppingDays=['mon','tue','wed','thu','fri','sat','sun']; state.customShoppingItems=[];
    if (!generateRandomWeeklyPlan(false)) {
      activeWeekStart=previous; restoreWeekRecord(before); saveWeekLegacyMirror(); persistCalendarWeeks(); render(true); return;
    }
  }
  mealSwapUndo=null;
  mealSwapHistory.clear();
  state.activeSwipeDayIndex=0; state.activeRecipeSwipeDayIndex=0;
  saveWeekLegacyMirror(); persistCalendarWeeks(); clearPlanGenerationError(); render(true);
};
function renderCalendarWeekControls() {
  if (!calendarWeeksReady) return;
  for (const host of document.querySelectorAll('[data-calendar-week-controls]')) {
    host.hidden=!['weekly','shopping','recipes'].includes(state.activeTab);
    host.replaceChildren();
    const range=document.createElement('p'); range.textContent=`${calendarWeekLabel()}：${calendarWeekRange()}`; range.style.fontWeight='800'; host.appendChild(range);
    const row=document.createElement('div'); row.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:8px';
    for (const [label,key] of [['今週',mondayKey()],['来週',shiftWeek(mondayKey(),1)]]) {
      const button=document.createElement('button');button.type='button';button.textContent=calendarWeeks[key]?.weeklyPlan?label:`${label}を作る`;
      button.setAttribute('aria-pressed',String(key===activeWeekStart));button.onclick=()=>selectCalendarWeek(key);
      button.style.cssText=`min-height:44px;padding:8px 16px;border:1px solid #667a5f;border-radius:12px;background:${key===activeWeekStart?'#52644c':'#fff'};color:${key===activeWeekStart?'#fff':'#33442e'}`;row.appendChild(button);
    }
    const savedKeys=Object.keys(calendarWeeks).filter(key=>calendarWeeks[key]?.weeklyPlan).sort().reverse();
    if (savedKeys.length) {
      const select=document.createElement('select');select.setAttribute('aria-label','保存した週を選ぶ');select.style.cssText='min-height:44px;max-width:100%;padding:8px;border:1px solid #667a5f;border-radius:12px;background:#fff';
      for (const key of savedKeys) {const option=document.createElement('option');option.value=key;option.textContent=calendarWeekRange(key);option.selected=key===activeWeekStart;select.appendChild(option);}
      select.onchange=()=>selectCalendarWeek(select.value);row.appendChild(select);
    }
    host.appendChild(row);
  }
}
function calendarSyncFields() {
  persistCalendarWeeks();
  return {weekStart:activeWeekStart,weeks:copyWeekData(calendarWeeks),cookedDays:state.cookedDays};
}
function prepareCalendarRemoteData(data, allowLegacyImport = false) {
  if (!calendarWeeksReady) return data;
  persistCalendarWeeks();
  // Old clients have no week identity: keep all dated plans and import into a separate slot.
  if (!validWeekKey(data.weekStart)) {
    if (!data.weeklyPlan) return data;
    // Undated plans must never overwrite a calendar week during background sync.
    if (!allowLegacyImport) return null;
    const receiptKey = 'frugal_legacy_share_receipt_v1';
    const signature = JSON.stringify([state.familySyncCode || '', data]);
    let receipts = [];
    try { receipts = JSON.parse(localStorage.getItem(receiptKey) || '[]'); } catch (_) {}
    if (!Array.isArray(receipts)) receipts = [];
    if (receipts.includes(signature)) return null;
    const accepted = window.confirm(
      '共有された献立を受け取りますか？\\n\\n' +
      'この献立には週の日付が付いていません。\\n' +
      'OK：表示中の週（' + calendarWeekRange() + '）の献立・予算・人数・苦手食材・買い物リストを共有内容に置き換えます。ほかの週の献立は残ります。\\n' +
      'キャンセル：今の内容を残します。\\n\\n同じ共有内容の確認は、次回から表示しません。'
    );
    try { localStorage.setItem(receiptKey, JSON.stringify([...receipts, signature].slice(-12))); } catch (_) {}
    if (!accepted) return null;
    return {...data,cookedDays:[]};
  }
  const records=data.weeks||{};
  for (const [key,record] of Object.entries(records)) if(validWeekKey(key)&&validWeekRecord(record)) calendarWeeks[key]=copyWeekData(record);
  if (!validWeekRecord(calendarWeeks[data.weekStart])) return null;
  // Preserve this device's selected week while updating the corresponding dated records.
  const local=calendarWeeks[activeWeekStart];
  return {...data,...copyWeekData(local)};
}

// Relative to the week being prepared, exclude only the four preceding saved weeks.
function getRecentCalendarMains() {
  const recent=new Set();
  if (!calendarWeeksReady) return recent;
  const first=shiftWeek(activeWeekStart,-4);
  for (const [key,record] of Object.entries(calendarWeeks)) {
    if (key<first || key>=activeWeekStart) continue;
    for (const day of Object.values(record.weeklyPlan||{})) if(day.main)recent.add(day.main);
  }
  return recent;
}
function calendarPlanRepeatScore(plan,recent=getRecentCalendarMains()) {
  let score=0;
  for(const category of ['main','side','soup']) {
    const seen=new Set();
    for(const day of Object.values(plan||{})) {
      const id=day[category];
      if(seen.has(id))score+=100;
      seen.add(id);
      if(category==='main' && recent.has(id) && !state.favoriteRecipeIds.includes(id))score++;
    }
  }
  return score;
}
