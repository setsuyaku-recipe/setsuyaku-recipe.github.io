const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const storage=new Map();
const context=vm.createContext({console,Date,URLSearchParams,TextEncoder,TextDecoder,setTimeout,clearTimeout,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))},
  window:{addEventListener(){},location:{search:'',hash:'',pathname:'/'},confirm:()=>true},
  document:{addEventListener(){},getElementById:()=>null,querySelectorAll:()=>[]},navigator:{},
});
function run(s){return vm.runInContext(s,context);}
run(fs.readFileSync('recipes.js','utf8'));
run(fs.readFileSync('week-management.js','utf8'));
run(fs.readFileSync('app.js','utf8'));
run(`render=()=>persistCalendarWeeks(); showToast=()=>{}; clearPlanGenerationError=()=>{}; reportPlanGenerationError=()=>false;`);
run(`state.servings=5;state.targetBudget=10000;generateRandomWeeklyPlan(false);state.checkedItems={'人参_g':true};state.cookedDays=['mon'];state.customShoppingItems=[{id:'note',name:'牛乳',isChecked:true}];initializeCalendarWeeks();`);
const original=run('JSON.stringify(currentWeekRecord())');
run(`window.selectCalendarWeek(shiftWeek(activeWeekStart,1))`);
assert.equal(run('state.cookedDays.length'),0);
assert.equal(run('Object.keys(state.checkedItems).length'),0);
assert.equal(run('state.customShoppingItems.length'),0);
assert.ok(run('calculatePlanTotalCost(state.weeklyPlan)<=state.targetBudget'));
run(`state.checkedItems={next:true};state.cookedDays=['tue'];persistCalendarWeeks();window.selectCalendarWeek(shiftWeek(activeWeekStart,-1));`);
assert.equal(run('JSON.stringify(currentWeekRecord())'),original);
run('initializeCalendarWeeks()');
assert.equal(run('JSON.stringify(currentWeekRecord())'),original);
// A failed third-week generation must preserve both existing weeks and history.
run('state.targetBudget=1;persistCalendarWeeks()');
const beforeFailure=run('JSON.stringify({week:activeWeekStart,record:currentWeekRecord(),history:state.historyRecipeIds})');
run('window.selectCalendarWeek(shiftWeek(activeWeekStart,2))');
assert.equal(run('JSON.stringify({week:activeWeekStart,record:currentWeekRecord(),history:state.historyRecipeIds})'),beforeFailure);
assert.equal(run('Object.keys(calendarWeeks).length'),2);
// Remote data updates a dated week without moving this device to that week.
run(`state.targetBudget=10000;persistCalendarWeeks();globalThis.selected=activeWeekStart;globalThis.remoteWeek=shiftWeek(activeWeekStart,1);globalThis.payload={...getSyncPayload(),weekStart:remoteWeek};payload.weeks[remoteWeek].checkedItems={remote:true};globalThis.prepared=prepareCalendarRemoteData(payload);`);
assert.equal(run('activeWeekStart'),run('selected'));
assert.equal(run('calendarWeeks[remoteWeek].checkedItems.remote'),true);
assert.equal(run('prepared.checkedItems["人参_g"]'),true);
assert.equal(run(`mondayKey(new Date(2027,0,1))`),'2026-12-28');
assert.equal(run(`shiftWeek('2026-12-28',1)`),'2027-01-04');
assert.equal(run(`validWeekKey('2026-02-30')`),false);
console.log('PASS migration, isolated weeks, restart, budget failure rollback, dated sync, year boundary');

// Date window includes -4, excludes -5, the selected week, and future weeks.
run(`calendarWeeks={};activeWeekStart='2026-10-26';
for(const [offset,id] of [[-5,'too-old'],[-4,'boundary'],[-1,'recent'],[0,'discarded'],[1,'future']]) calendarWeeks[shiftWeek(activeWeekStart,offset)]={weeklyPlan:{mon:{main:id,side:'side',soup:'soup'}}};`);
assert.deepEqual(JSON.parse(run('JSON.stringify([...getRecentCalendarMains()].sort())')),['boundary','recent']);
run(`state.favoriteRecipeIds=['recent'];`);
assert.equal(run(`calendarPlanRepeatScore({mon:{main:'recent',side:'s1',soup:'p1'}})`),0);
assert.equal(run(`calendarPlanRepeatScore({mon:{main:'boundary',side:'s1',soup:'p1'}})`),1);
assert.equal(run(`calendarPlanRepeatScore({mon:{main:'x',side:'same',soup:'p1'},tue:{main:'y',side:'same',soup:'p2'}})`),100);
// Full generation derives history from saved weeks and does not append discarded candidates.
run(`calendarWeeks={};state.historyRecipeIds=['legacy-only'];state.targetBudget=10000;state.servings=5;generateRandomWeeklyPlan(false);persistCalendarWeeks();globalThis.priorMains=Object.values(state.weeklyPlan).map(d=>d.main);window.selectCalendarWeek(shiftWeek(activeWeekStart,1));`);
assert.equal(run('JSON.stringify(state.historyRecipeIds)'), '["legacy-only"]');
assert.equal(run('Object.values(state.weeklyPlan).filter(d=>priorMains.includes(d.main)).length'),0);
assert.equal(run('new Set(Object.values(state.weeklyPlan).map(d=>d.side)).size'),7);
assert.equal(run('new Set(Object.values(state.weeklyPlan).map(d=>d.soup)).size'),7);
console.log('PASS saved-week history, four-week window, favorites, within-week variety, discarded generation');
run(`RECIPES_DATA.push({id:'test-base',category:'main',baseIngredientsGroup:'test',containsDislikes:['カレー']},{id:'test-alt',category:'main',baseIngredientsGroup:'test',ingredients:[]});state.childrenCount=2;state.childrenPreferences={child1:{dislikes:[]},child2:{dislikes:['カレー']}};state.blacklistedRecipeIds=[];`);
assert.equal(run(`getChildMenuResolution(getRecipeById('test-base')).unresolved.length`),0);
assert.equal(run(`getChildMenuResolution(getRecipeById('test-base')).alternatives[0].childId`),'child2');
run(`state.blacklistedRecipeIds=['test-alt']`);
assert.equal(run(`getChildMenuResolution(getRecipeById('test-base')).unresolved[0]`),2);
run(`state.blacklistedRecipeIds=[];getRecipeById('test-alt').containsDislikes=['カレー'];`);
assert.equal(run(`getChildMenuResolution(getRecipeById('test-base')).unresolved[0]`),2);
run(`getRecipeById('test-alt').containsDislikes=[];getRecipeById('test-alt').category='soup';`);
assert.equal(run(`getChildMenuResolution(getRecipeById('test-base')).unresolved[0]`),2);
console.log('PASS child-specific alternatives, blacklist, unsafe alternatives, category mismatch');
run(`renderShoppingList=()=>{};updateSummaryBadge=()=>{};updateCoreFlowSummary=()=>{};state.childrenCount=0;state.servings=5;RECIPES_DATA.push({id:'shopping-test',category:'main',ingredients:[{name:'テスト食材',amount:10,unit:'g'}]});state.weeklyPlan=Object.fromEntries(DAYS_OF_WEEK.map(d=>[d.id,{main:'shopping-test',side:null,soup:null}]));state.checkedItems={keep:true};globalThis.beforeShoppingPlan=JSON.stringify(state.weeklyPlan);window.setShoppingDays(['mon','tue']);`);
assert.equal(run(`calculateAggregatedShoppingList()['テスト食材__all'].amount`),100);
assert.equal(run(`selectedShoppingDaysLabel()`),'月・火の2日分');
assert.equal(run(`JSON.stringify(state.weeklyPlan)`),run('beforeShoppingPlan'));
assert.equal(run(`state.checkedItems.keep`),true);
run(`window.setShoppingDays([])`);
assert.equal(run(`Object.keys(calculateAggregatedShoppingList()).length`),0);
run(`window.setShoppingDays(['wed','fri']);initializeCalendarWeeks()`);
assert.equal(run(`JSON.stringify(state.shoppingDays)`),'["wed","fri"]');
console.log('PASS two-day aggregation, arbitrary days, empty selection, plan and checks retained, selection persistence');
run(`globalThis.panelMock={open:true,querySelector:()=>({focus(){}})};document.getElementById=id=>id==='shopping-days-panel'?panelMock:null;state.shoppingDays=['mon','tue'];window.beginShoppingDayEdit();window.editShoppingDay('mon',false);window.editShoppingDay('fri',true);`);
assert.equal(run('JSON.stringify(state.shoppingDays)'),'["mon","tue"]');
run('window.confirmShoppingDays()');
assert.equal(run('JSON.stringify(state.shoppingDays)'),'["tue","fri"]');
assert.equal(run('panelMock.open'),false);
run(`panelMock.open=true;window.beginShoppingDayEdit();window.clearShoppingDraft();window.confirmShoppingDays();`);
assert.equal(run('JSON.stringify(state.shoppingDays)'),'["tue","fri"]');
run(`panelMock.open=false;window.beginShoppingDayEdit();panelMock.open=true;window.beginShoppingDayEdit();`);
assert.equal(run('JSON.stringify(shoppingDaysDraft)'),'["tue","fri"]');
console.log('PASS draft selection, explicit commit and collapse, empty commit guard, abandoned draft reset');
