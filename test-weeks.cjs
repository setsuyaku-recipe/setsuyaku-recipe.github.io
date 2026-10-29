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
