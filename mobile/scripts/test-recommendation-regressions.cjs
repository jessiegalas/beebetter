const assert = require('node:assert/strict');
const { hooks, load } = require('./test-harness.cjs');
const time = load('src/lib/quest-time.ts');
const facts = load('src/lib/recommendation-facts.ts');
const reasons = load('src/lib/recommendation-reasons.ts');
const engine = load('src/lib/quest-priority.ts', { './quest-time':time, './recommendation-facts':facts, './recommendation-reasons':reasons });
const snapshots = load('src/lib/recommendation-snapshot.ts', { './quest-priority':engine, './recommendation-facts':facts });
const discovery = load('src/lib/quest-discovery.ts', { './quest-time':time });
const snooze = load('src/lib/recommendation-snooze.ts');
const measurement = load('src/lib/recommendation-measurement.ts', { './quest-discovery':discovery, './recommendation-snooze':snooze });
const { createStudentWorkspaceReader } = load('src/lib/student-workspace.ts');
const now = new Date(2026,9,14,10,0).getTime(), iso = minutes => new Date(now + minutes * 60000).toISOString();
const q = (id, extra = {}) => ({id,owner_id:'a',title:id,category:'Habits',xp:25,status:'active',created_at:iso(0),updated_at:iso(0),location_id:null,...extra});
const f = (quest, extra={}) => ({quest_id:quest.id,status:quest.status,updated_at:quest.updated_at,prerequisite_quest_id:quest.prerequisite_quest_id??null,prerequisite_status:null,prerequisite_title:null,latest_activity_at:null,latest_category_at:null,...extra});
const place = {id:'p',name:'Library',latitude:14.6,longitude:121,radius:100,is_active:true};
const rank = (quests, extra={}) => engine.prioritizeQuests(quests,{now,coords:null,locationUpdatedAt:null,places:[place],history:[],facts:quests.map(quest=>f(quest)),candidatesUpdatedAt:now,factsUpdatedAt:now,profileUpdatedAt:now,placesUpdatedAt:now,...extra});
const cases=[], test=(name,run)=>cases.push({name,run});
const ok=data=>({data,error:null});
function client(handler) {
 const query=(name,args)=>{
  const result=()=>Promise.resolve().then(()=>handler(name,args)??ok([]));
  const value={select:()=>value,eq:()=>value,abortSignal:()=>value,maybeSingle:result,then:(resolve,reject)=>result().then(resolve,reject)};
  return value;
 };
 return {from:query,rpc:query};
}
const input={user:{id:'a'},student:{goal:'Study'},isCurrent:()=>true};
test('reader to engine to selector unlocks an absent completed parent using authoritative facts',async()=>{
 const child=q('child',{prerequisite_quest_id:'parent',scheduled_at:iso(0)});
 const reader=createStudentWorkspaceReader(client(name=>name==='student_list_recommendation_candidates'?ok([child]):name==='student_get_recommendation_facts'?ok([f(child,{prerequisite_status:'completed',prerequisite_title:'Parent',latest_activity_at:iso(-10000)})]):undefined));
 const value=await reader.read(input);
 const ranked=rank(value.quests,{...value.recommendation,now:Date.now()});
 assert.equal(ranked[0].locked,false);assert.equal(ranked[0].prerequisiteState,'completed');
 assert.equal(discovery.recommendedQuests(ranked)[0].quest.id,'child');assert.equal(value.history.rows.length,0);
});
test('facts failure leaves browsable candidates and unknown prerequisite, without fallback unlocking',async()=>{
 const child=q('child',{prerequisite_quest_id:'parent',deadline_at:iso(20)});
 const reader=createStudentWorkspaceReader(client(name=>name==='student_list_recommendation_candidates'?ok([child]):name==='student_get_recommendation_facts'?{data:null,error:{code:'PGRST202'}}:undefined));
 const value=await reader.read(input,'quests');
 assert.equal(value.quests.length,1);assert(value.recommendation.error);assert.equal(value.recommendation.factsUpdatedAt,null);
 const item=rank(value.quests,{...value.recommendation})[0];assert.equal(item.prerequisiteState,'unknown');assert.equal(discovery.recommendedQuests([item]).length,0);
});
test('version mismatch retries the entire candidate/facts read, then publishes consistent data',async()=>{
 let reads=0;const original=q('one'),changed={...original,updated_at:iso(1)};
 const reader=createStudentWorkspaceReader(client(name=>{
  if(name==='student_list_recommendation_candidates'){reads++;return ok([reads===1?original:changed]);}
  if(name==='student_get_recommendation_facts')return ok([f(changed)]);
 }));
 const value=await reader.read(input,'quests');assert.equal(reads,2);assert.equal(value.quests[0].updated_at,value.recommendation.facts[0].updated_at);
});
test('repeated version mismatch exposes error without combining old candidate and new facts',async()=>{
 let reads=0;const quest=q('one');
 const reader=createStudentWorkspaceReader(client(name=>name==='student_list_recommendation_candidates'?(reads++,ok([quest])):name==='student_get_recommendation_facts'?ok([f(quest,{updated_at:iso(1)})]):undefined));
 const value=await reader.read(input,'quests');assert.equal(reads,2);assert.equal(value.recommendation.facts.length,0);assert(value.recommendation.error);
});
test('completion history truncation cannot erase a full-history activity fact',()=>{
 const quest=q('repeat');const item=rank([quest],{history:Array.from({length:100},(_,i)=>({id:String(i),title:'unrelated',category:'Other',completed_at:iso(-i)})),facts:[f(quest,{latest_activity_at:iso(-10080),latest_category_at:iso(-10080)})]})[0];
 assert(item.reasonCodes.includes('activity_gap'));assert(item.reasons[0].includes('Latest matching completion'));
});
test('history alone never establishes a prerequisite or contributes an activity boost',()=>{
 const quest=q('child',{prerequisite_quest_id:'parent'});
 const item=rank([quest],{facts:[],history:[{quest_id:'parent',title:'child',category:'Habits',completed_at:iso(-10000)}]})[0];
 assert.equal(item.prerequisiteState,'unknown');assert(!item.reasonCodes.includes('activity_gap'));
});
test('incomplete prerequisite is explicit and excluded from recommendation selection',()=>{
 const quest=q('child',{prerequisite_quest_id:'parent'}),item=rank([quest],{facts:[f(quest,{prerequisite_status:'active',prerequisite_title:'Prepare'})]})[0];
 assert.equal(item.prerequisiteState,'incomplete');assert(item.constraints.some(c=>c.includes('Prepare')));assert.equal(discovery.recommendedQuests([item]).length,0);
});
test('stale facts suppress history boosts and immediate recommendations',()=>{
 const quest=q('repeat',{deadline_at:iso(10)}),item=rank([quest],{factsUpdatedAt:now-300001,facts:[f(quest,{latest_activity_at:iso(-10000)})]})[0];
 assert.notEqual(item.tier,'now');assert(!item.reasonCodes.includes('activity_gap'));assert(item.constraints.length);
});
test('stale candidates and stale profile separately disable immediate fit and goal boost',()=>{
 const quest=q('Study',{deadline_at:iso(10)});
 assert.notEqual(rank([quest],{candidatesUpdatedAt:now-300001})[0].tier,'now');
 assert(!rank([quest],{personalGoal:'Study',profileUpdatedAt:now-300001})[0].reasonCodes.includes('goal_alignment'));
});
test('schedule beyond 30 minutes stays upcoming even with an urgent deadline and matching location',()=>{
 const quest=q('later',{scheduled_at:iso(31),deadline_at:iso(60),location_id:'p'}),item=rank([quest],{coords:place,locationUpdatedAt:now})[0];
 assert.equal(discovery.recommendationGroup(item),'upcoming');assert(item.constraints.some(c=>c.includes('Scheduled for later')));assert(item.reasons.some(c=>c.startsWith('Due ')));
 assert.equal(rank([q('boundary',{scheduled_at:iso(30)})])[0].tier,'now');
});
test('far-away future-only candidate is explicitly an alternative',()=>{
 const item=rank([q('later',{scheduled_at:iso(300),location_id:'p'})],{coords:{latitude:15,longitude:121},locationUpdatedAt:now})[0];
 assert.notEqual(discovery.recommendationGroup(item),'now');assert.equal(discovery.recommendedQuests([item]).length,1);assert(item.constraints.length>=2);
});
test('rejected quests are revision work, while pending and completed quests are excluded',()=>{
 const items=rank([q('revision',{status:'rejected',deadline_at:iso(1)}),q('pending',{status:'pending'}),q('done',{status:'completed'})]);
 assert.equal(discovery.recommendedQuests(items).length,1);assert.equal(discovery.recommendationGroup(discovery.recommendedQuests(items)[0]),'revision');
});
test('a newer geofence exit prevents now; a newer valid GPS fix restores fit',()=>{
 const quest=q('urgent',{location_id:'p',deadline_at:iso(10)});
 const base={coords:place,locationUpdatedAt:now-1000,geofenceEvents:{p:{inside:false,timestamp:now}}};
 const exited=rank([quest],base)[0];assert.notEqual(exited.tier,'now');assert(exited.constraints.includes('Outside your saved area; distance is unknown'));
 assert.equal(rank([quest],{...base,locationUpdatedAt:now})[0].tier,'now');
});
test('future or out-of-range coordinates and stale saved places never create a location claim',()=>{
 const quest=q('near',{location_id:'p'});
 for(const extra of [{coords:place,locationUpdatedAt:now+1},{coords:{latitude:100,longitude:121},locationUpdatedAt:now},{coords:place,locationUpdatedAt:now,placesUpdatedAt:now-300001}]){
  const item=rank([quest],extra)[0];assert.equal(item.nearby,false);assert(!item.reasonCodes.includes('location_at'));
 }
});
test('English/Filipino function words, substrings and unrelated goals do not match',()=>{
 for(const [goal,title] of [['Visit the gym','Read the news'],['Gusto kong mag-aral','Gusto kong tumakbo'],['study','studying'],['fitness','Finish thesis']]){
  assert(!rank([q('goal',{title})],{personalGoal:goal})[0].reasonCodes.includes('goal_alignment'));
 }
});
test('Unicode normalization and punctuation produce a conservative named shared topic',()=>{
 const item=rank([q('goal',{title:'ＳＴＵＤＹ: a chapter'})],{personalGoal:'study!'})[0];
 assert(item.reasons.includes('This quest and your goal both mention “study”'));
});
test('all evidence is preserved; critical constraints survive the three-explanation limit',()=>{
 const quest=q('Study',{location_id:'missing',scheduled_at:iso(300),deadline_at:iso(400),importance:'high'});
 const item=rank([quest],{personalGoal:'Study'})[0];
 assert(item.reasons.length<=3);assert(item.constraints.includes('Location unavailable'));assert(item.constraints.some(c=>c.includes('Scheduled for later')));
 const due=item.evidence.find(e=>e.code==='deadline_day');assert.equal(due.values.at,quest.deadline_at);
 assert.equal(item.score,8+item.evidence.reduce((sum,e)=>sum+e.contribution,0));
});
test('unchanged input ordering is deterministic and independent of input array order',()=>{
 const quests=[q('b'),q('a')];assert.deepEqual(rank(quests).map(i=>i.quest.id),rank([...quests].reverse()).map(i=>i.quest.id));assert.equal(discovery.recommendedQuests([]).length,0);
});
function memory(){const values=new Map();return {values,storage:{getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value)}};}
test('snooze survives restart, expires at exactly one hour, and stays account-scoped',async()=>{
 const {storage}=memory();let clock=now;
 const a=snooze.createSnoozeStore(storage,'a',()=>clock);await a.snooze('quest');
 assert.equal((await snooze.createSnoozeStore(storage,'a',()=>clock).load()).quest,now+3600000);
 assert.equal(Object.keys(await snooze.createSnoozeStore(storage,'b',()=>clock).load()).length,0);
 clock+=3599999;assert((await a.load()).quest);clock++;assert.equal(Object.keys(await a.load()).length,0);
});
test('rapid snooze/Undo and Restore are serialized; pruning removes obsolete entries',async()=>{
 const {storage}=memory(),store=snooze.createSnoozeStore(storage,'a',()=>now);
 const tasks=[store.snooze('one'),store.undo('one'),store.snooze('two')];await Promise.all(tasks);
 assert.deepEqual(Object.keys(await store.load()),['two']);await store.prune(new Set());assert.equal(Object.keys(await store.load()).length,0);
 await store.snooze('three');assert.equal(Object.keys(await store.restore()).length,0);
});
test('storage read failure does not erase previously persisted snoozes',async()=>{
 let writes=0;const store=snooze.createSnoozeStore({getItem:async()=>{throw Error('disk')},setItem:async()=>writes++},'a');
 await assert.rejects(store.load());assert.equal(writes,0);
});
function trackerFixture(){
 let clock=now,id=0;const timers=new Map(),events=[];
 const tracker=measurement.createImpressionTracker('quest_board','session',e=>events.push(e),{clock:()=>clock,id:()=>String(++id),schedule:(fn)=>{const timerId=++id;timers.set(timerId,fn);return timerId;},cancel:id=>timers.delete(id)});
 const tick=()=>{clock+=1000;const values=[...timers.values()];timers.clear();values.forEach(fn=>fn());};
 return {tracker,events,timers,tick};
}
test('exposure requires uninterrupted visibility and active focus; background cancels timer',()=>{
 const {tracker,events,timers,tick}=trackerFixture(),items=rank([q('one')]);
 tracker.update(items,new Set(['one']),true);assert.equal(events.length,0);assert.equal(timers.size,1);
 tracker.update(items,new Set(),true);tick();assert.equal(events.length,0);
 tracker.update(items,new Set(['one']),true);tracker.update(items,new Set(['one']),false);tick();assert.equal(events.length,0);
 tracker.update(items,new Set(['one']),true);tick();assert.equal(events[0].eventType,'exposure');
 tracker.update(items,new Set(['one']),true);tick();assert.equal(events.length,1);
 tracker.dispose();
});
test('rapid direct actions retain the impression; material rank changes create a new one',()=>{
 const {tracker,events,tick}=trackerFixture(),item=rank([q('one')])[0];
 tracker.update([item],new Set(['one']),true);tracker.action(item,1,'selection');assert.equal(events[0].eventType,'selection');
 tick();assert.equal(events[0].impressionId,events[1].impressionId);
 tracker.action(item,2,'snooze');assert.notEqual(events[2].impressionId,events[1].impressionId);tracker.dispose();
});
test('changed constraints reset exposure delay and decision identity',()=>{
 const {tracker,events,tick}=trackerFixture(),item=rank([q('one')])[0];
 tracker.update([item],new Set(['one']),true);const changed={...item,constraints:['Location unavailable']};
 tracker.update([changed],new Set(['one']),true);tick();assert.equal(events.length,1);assert(events[0].reasonCodes);tracker.dispose();
});
const event=(id,at=now)=>({questId:'one',impressionId:id,sessionId:'session',surface:'home',group:'other',rank:1,reasonCodes:[],version:'rules-v2',eventType:'exposure',occurredAt:new Date(at).toISOString()});
test('offline events persist and resume without local duplicates or crossing accounts',async()=>{
 const {storage,values}=memory();let online=false;const sent=[];
 const queue=measurement.createRecommendationQueue(storage,'a',async e=>{if(!online)throw Error('offline');sent.push(e)},()=>true,()=>now);
 await queue.enqueue(event('one'));await queue.enqueue(event('one'));assert.equal(JSON.parse([...values.values()][0]).length,1);
 online=true;await queue.flush();assert.equal(sent.length,1);assert.equal(JSON.parse([...values.values()][0]).length,0);
 const b=measurement.createRecommendationQueue(storage,'b',async e=>sent.push(e),()=>true,()=>now);await b.flush();assert.equal(sent.length,1);
});
test('queue bounds are 100 events and 24 hours; account invalidation stops dispatch',async()=>{
 const {storage,values}=memory();let current=true;
 const queue=measurement.createRecommendationQueue(storage,'a',async()=>{throw Error('offline')},()=>current,()=>now);
 await queue.enqueue(event('expired',now-86400001));for(let i=0;i<105;i++)await queue.enqueue(event(String(i)));
 assert.equal(JSON.parse([...values.values()][0]).length,100);
 current=false;let sent=0;await measurement.createRecommendationQueue(storage,'a',async()=>sent++,()=>current,()=>now).flush();assert.equal(sent,0);
});
test('permanent invalid/deleted events do not block later queued events',async()=>{
 const {storage}=memory();let online=false;const sent=[];
 const queue=measurement.createRecommendationQueue(storage,'a',async e=>{if(!online)throw Error('offline');if(e.impressionId==='deleted')throw {code:'P0001'};sent.push(e)},()=>true,()=>now);
 await queue.enqueue(event('deleted'));await queue.enqueue(event('valid'));online=true;await queue.flush();assert.equal(sent.length,1);assert.equal(sent[0].impressionId,'valid');
});
test('telemetry storage read failure preserves persisted queue',async()=>{
 let writes=0;const queue=measurement.createRecommendationQueue({getItem:async()=>{throw Error('disk')},setItem:async()=>writes++},'a',async()=>{},()=>true);
 await assert.rejects(queue.flush());assert.equal(writes,0);
});
test('Home visibility uses the clipped scroll viewport and a 50 percent threshold',()=>{
 const h=hooks(),visible=[];
 const mod=load('src/hooks/use-recommendation-measurement.ts',{react:h.react,'react-native':{useWindowDimensions:()=>({width:400,height:800})},'@/constants/features':{MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED:true},'expo-router':{},'@/context/quest-priority-context':{},'@/context/user-data-context':{},'@/lib/recommendation-measurement':{}});
 const viewport={current:{measureInWindow:fn=>fn(0,100,400,300)}};
 let card={current:{measureInWindow:fn=>fn(0,350,400,200)}};
 const notify=ids=>visible.push([...ids]);
 h.mount(()=>mod.useHomeRecommendationVisibility(card,viewport,'one',true,notify));assert.equal(visible.at(-1).length,0);
 card={current:{measureInWindow:fn=>fn(0,300,400,200)}};h.render();assert.deepEqual(visible.at(-1),['one']);h.unmount();
});
test('separate account lifetimes serialize snooze updates without resurrecting an Undo',async()=>{
 const {storage}=memory(),first=snooze.createSnoozeStore(storage,'a',()=>now),second=snooze.createSnoozeStore(storage,'a',()=>now);
 await Promise.all([first.snooze('one'),second.undo('one')]);assert.equal(Object.keys(await first.load()).length,0);
});
test('new events persist while an earlier network delivery remains pending',async()=>{
 const {storage,values}=memory();let release;const wait=new Promise(resolve=>release=resolve);let calls=0;
 const queue=measurement.createRecommendationQueue(storage,'a',async()=>{if(++calls===1)await wait;},()=>true,()=>now);
 const first=queue.enqueue(event('first'));for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
 const second=queue.enqueue(event('second'));for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(JSON.parse([...values.values()][0]).length,2);release();await Promise.all([first,second]);assert.equal(JSON.parse([...values.values()][0]).length,0);
});
test('every evidence code matches the new server recorder allowlist',()=>{
 const fs=require('fs'),path=require('path'),ts=require('typescript');
 const source=ts.createSourceFile('reasons.ts',fs.readFileSync(path.join(__dirname,'../src/lib/recommendation-reasons.ts'),'utf8'),ts.ScriptTarget.Latest);
 const alias=source.statements.find(s=>s.name?.text==='EvidenceCode');const codes=alias.type.types.map(t=>t.literal.text).sort();
 const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/038_recommendation_measurement.sql'),'utf8');
 const list=sql.match(/allowed_codes constant text\[\]:=array\[([\s\S]*?)\];/)[1];const allowed=[...list.matchAll(/'([^']+)'/g)].map(m=>m[1]).sort();
 assert.deepEqual(codes,allowed);
});
function providerFixture(storage, options={}) {
 const h=hooks();let data;
 const account=id=>{const at=options.clock?.()??Date.now(),quest=q('quest-'+id,{owner_id:id,updated_at:new Date(at).toISOString(),deadline_at:new Date(at+60000).toISOString()});return {user:{id},profile:{goal:'Study'},quests:[quest],completionHistory:[],workspaceErrors:{},retryWorkspace:async()=>{},recommendationData:{facts:[f(quest)],candidatesUpdatedAt:at,factsUpdatedAt:at,profileUpdatedAt:at,error:null}};};
 data=account('a');
 const mod=load('src/context/quest-priority-context.tsx',{react:h.react,'react-native':{Platform:{OS:'web'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},'@react-native-async-storage/async-storage':storage,'@/constants/features':{MOBILE_WELLNESS_AND_SUPPORT_ENABLED:false,MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED:options.enabled??false},'./user-data-context':{useUserData:()=>data},'./location-context':{useLocationContext:()=>({coords:null,locationUpdatedAt:null,locations:[],permissionStatus:'denied',locationsUpdatedAt:null,locationsError:null,refreshLocations:async()=>{}})},'@/lib/quest-priority':engine,'@/lib/recommendation-snapshot':{recommendationSnapshot:(quests,context,errors)=>snapshots.recommendationSnapshot(quests,context,errors,options.clock??Date.now)},'@/lib/recommendation-facts':facts,'@/lib/quest-discovery':discovery,'@/lib/recommendation-snooze':snooze,'@/lib/recommendation-measurement':measurement,'@/lib/recommendation-events':{recordRecommendationEventV2:options.send??(async()=>{})},'@/lib/geofence-events':{readGeofenceEvents:async()=>({}),subscribeGeofenceEvents:()=>()=>{}},'@/lib/wellbeing-data':{getMyRecommendationWellnessContext:async()=>{throw Error('disabled wellness read')},subscribeRecommendationContext:()=>{throw Error('disabled wellness subscription')}}});
 h.mount(()=>mod.QuestPriorityProvider({children:null}));
 return {h,switchAccount(id){data=account(id);h.render();},publish(at){data={...data,recommendationData:{...data.recommendationData,candidatesUpdatedAt:at,factsUpdatedAt:at,profileUpdatedAt:at}};h.render();}};
}
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));};
test('actual provider gates hydration, shares snooze, and restores persisted state after account switches',async()=>{
 const {storage}=memory(),p=providerFixture(storage);assert.equal(p.h.value.snoozesReady,false);assert.equal(p.h.value.recommendations.length,0);
 await settle();assert.equal(p.h.value.recommendations[0].quest.id,'quest-a');p.h.value.snoozeQuest('quest-a');await settle();assert.equal(p.h.value.recommendations.length,0);assert.equal(p.h.value.lastSnoozedId,'quest-a');
 p.switchAccount('b');assert.equal(p.h.value.recommendations.length,0);await settle();assert.equal(p.h.value.recommendations[0].quest.id,'quest-b');assert.equal(p.h.value.lastSnoozedId,null);
 p.switchAccount('a');await settle();assert.equal(p.h.value.recommendations.length,0);p.h.value.restoreSnoozes();await settle();assert.equal(p.h.value.recommendations[0].quest.id,'quest-a');p.h.unmount();
});
test('actual provider rejects late hydration from a previous account',async()=>{
 const m=memory();let release;const wait=new Promise(resolve=>release=resolve);let first=true;
 const storage={...m.storage,getItem:async key=>{if(key.endsWith(':a')&&key.includes('snoozes')&&first){first=false;return wait;}return m.storage.getItem(key);}};
 const p=providerFixture(storage);await settle();p.switchAccount('b');await settle();assert.equal(p.h.value.recommendations[0].quest.id,'quest-b');release(JSON.stringify({'quest-a':Date.now()+3600000}));await settle();assert.equal(p.h.value.recommendations[0].quest.id,'quest-b');p.h.unmount();
});
test('failed provider hydration never forgets a persisted snooze; Retry recovers it',async()=>{
 const m=memory();m.values.set('beebetter:recommendation-snoozes:v2:a',JSON.stringify({'quest-a':Date.now()+3600000}));let failed=true;
 const storage={...m.storage,getItem:async key=>{if(key.includes('snoozes')&&failed)throw Error('disk');return m.storage.getItem(key);}};
 const p=providerFixture(storage);await settle();assert.equal(p.h.value.snoozesReady,false);assert.equal(p.h.value.recommendations.length,0);assert(p.h.value.contextError.includes('could not be loaded'));
 failed=false;p.h.value.retryContext();await settle();assert.equal(p.h.value.snoozesReady,true);assert.equal(p.h.value.recommendations.length,0);assert.equal(p.h.value.snoozedCount,1);p.h.unmount();
});
test('invalid GPS cannot shadow a valid recent saved-place event',()=>{
 const item=rank([q('near',{location_id:'p'})],{coords:place,locationUpdatedAt:now+3600000,geofenceEvents:{p:{inside:true,timestamp:now}}})[0];
 assert.equal(item.nearby,true);assert(item.reasonCodes.includes('location_at'));
});
test('Android notification blur cancels qualification even while AppState remains active',async()=>{
 const h=hooks(),listeners={},updates=[];const recordEvent=()=>{};
 const mod=load('src/hooks/use-recommendation-measurement.ts',{react:h.react,'react-native':{Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:(type,fn)=>{listeners[type]=fn;return {remove(){delete listeners[type]}}}}},'@/constants/features':{MOBILE_RECOMMENDATION_MEASUREMENT_ENABLED:true},'expo-router':{useIsFocused:()=>true},'@/context/quest-priority-context':{useQuestPriority:()=>({recordEvent})},'@/context/user-data-context':{useUserData:()=>({user:{id:'a'}})},'@/lib/recommendation-measurement':{recommendationId:()=> 'session',createImpressionTracker:()=>({update:(_,__,active)=>updates.push(active),action(){},dispose(){}})}});
 h.mount(()=>mod.useRecommendationMeasurement('home',[],true));assert.equal(updates.at(-1),true);
 listeners.blur();await settle();assert.equal(updates.at(-1),false);listeners.focus();await settle();assert.equal(updates.at(-1),true);h.unmount();assert.equal(Object.keys(listeners).length,0);
});
test('disabled measurement hook creates no tracker, IDs, exposure timer or action event',async()=>{
 const h=hooks();let calls=0;const forbidden=()=>{calls++;throw Error('disabled measurement');};
 const mod=load('src/hooks/use-recommendation-measurement.ts',{react:h.react,'react-native':{Platform:{OS:'android'},AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},'expo-router':{useIsFocused:()=>true},'@/constants/features':load('src/constants/features.ts'),'@/context/quest-priority-context':{useQuestPriority:()=>({recordEvent:forbidden})},'@/context/user-data-context':{useUserData:()=>({user:{id:'a'}})},'@/lib/recommendation-measurement':{recommendationId:forbidden,createImpressionTracker:forbidden}});
 h.mount(()=>mod.useRecommendationMeasurement('home',rank([q('quest')])));
 assert.equal(h.value.active,false);h.value.setVisible(new Set(['quest']));await settle();h.value.action(rank([q('quest')])[0],1,'selection');assert.equal(calls,0);h.unmount();
});
test('disabled provider preserves pending telemetry without reads, writes or delivery while snooze works',async()=>{
 const m=memory(),key='beebetter:recommendation-events:v2:a',encoded=JSON.stringify([event('saved',Date.now())]);m.values.set(key,encoded);let telemetryReads=0,telemetryWrites=0,sent=0;
 const storage={getItem:async k=>{if(k.includes('recommendation-events'))telemetryReads++;return m.storage.getItem(k);},setItem:async(k,v)=>{if(k.includes('recommendation-events'))telemetryWrites++;return m.storage.setItem(k,v);}};
 const p=providerFixture(storage,{send:async()=>sent++});await settle();p.h.value.recordEvent(event('new',Date.now()));p.h.value.retryContext();await settle();
 p.h.value.snoozeQuest('quest-a');await settle();assert.equal(p.h.value.recommendations.length,0);p.h.value.undoSnooze();await settle();assert.equal(p.h.value.recommendations.length,1);
 assert.equal(telemetryReads,0);assert.equal(telemetryWrites,0);assert.equal(sent,0);assert.equal(m.values.get(key),encoded);p.h.unmount();
});
test('enabled provider resumes preserved events and prunes expired entries before delivery',async()=>{
 const m=memory(),at=Date.now(),key='beebetter:recommendation-events:v2:a';m.values.set(key,JSON.stringify([event('expired',at-86400001),event('valid',at)]));const sent=[];
 const p=providerFixture(m.storage,{enabled:true,send:async e=>sent.push(e)});await settle();assert.deepEqual(sent.map(e=>e.impressionId),['valid']);
 p.h.value.recordEvent(event('new',Date.now()));await settle();assert.deepEqual(sent.map(e=>e.impressionId),['valid','new']);p.h.unmount();
});
test('prerequisite formatter distinguishes all states without asserting an unknown status',()=>{
 assert.equal(reasons.prerequisiteMessage('unknown'),'Prerequisite status could not be verified. Refresh to check.');
 assert.equal(reasons.prerequisiteMessage('incomplete','Prepare'),'Complete the prerequisite quest first: Prepare');
 for(const state of ['none','completed'])assert.equal(reasons.prerequisiteMessage(state,'Prepare'),'');
});
test('source refreshes between 30-second clock ticks stay fresh throughout repeated idle polls',()=>{
 const quest=q('near',{location_id:'p',deadline_at:iso(60)}),tick=now;
 for(const elapsed of [5000,15000,29000,60000,120000]){
  const readAt=now+elapsed,context={now:tick,coords:place,locationUpdatedAt:readAt,places:[place],placesUpdatedAt:readAt,history:[],facts:[f(quest)],factsUpdatedAt:readAt,candidatesUpdatedAt:readAt,profileUpdatedAt:readAt};
  const old=engine.prioritizeQuests([quest],context)[0];assert.equal(old.fresh,false); // Reproduces the stale sampled-clock bug.
  const current=snapshots.recommendationSnapshot([quest],context,{},()=>readAt+1);
  assert.equal(current.ranked[0].fresh,true);assert.equal(current.ranked[0].tier,'now');assert.equal(current.contextError,null);assert.equal(current.locationAvailable,true);
 }
});
test('provider refresh publication cannot transiently emit a stale-context warning',async()=>{
 let clock=Date.now();const p=providerFixture(memory().storage,{clock:()=>clock});await settle();
 assert.equal(p.h.value.contextError,null);
 for(let i=0;i<4;i++){clock+=15000;p.publish(clock);assert.equal(p.h.value.contextError,null);assert.equal(p.h.value.ranked[0].fresh,true);await settle();assert.equal(p.h.value.contextError,null);}
 p.h.unmount();
});
test('actual stale data stays restricted and irrelevant optional sources produce no warning',()=>{
 const quest=q('urgent',{deadline_at:iso(60)}),context={now,coords:place,locationUpdatedAt:now+3600000,places:[place],placesUpdatedAt:now,history:[],facts:[f(quest)],factsUpdatedAt:now,candidatesUpdatedAt:now,profileUpdatedAt:now};
 const healthy=snapshots.recommendationSnapshot([quest],context,{places:'Places failed',profile:'Profile failed'},()=>now);
 assert.equal(healthy.contextError,null);assert.equal(healthy.locationAvailable,false);assert.equal(healthy.now,now);
 const stale=snapshots.recommendationSnapshot([quest],context,{},()=>now+300001);assert(stale.contextError);assert.notEqual(stale.ranked[0].tier,'now');
 const located={...quest,location_id:'p'};assert(snapshots.recommendationSnapshot([located],context,{places:'Places failed'},()=>now).contextError);
 assert.equal(snapshots.recommendationSnapshot([],{...context,candidatesUpdatedAt:null,factsUpdatedAt:null},{},()=>now).contextError,null);
});
(async()=>{for(const c of cases){await c.run();console.log('PASS '+c.name);}console.log(cases.length+' recommendation regression tests passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
