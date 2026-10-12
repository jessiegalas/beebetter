const assert = require('node:assert/strict');
const { hooks, load } = require('./test-harness.cjs');
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function flush() { for (let i = 0; i < 4; i++) await pause(); }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children), ...nodes(value.props?.ListHeaderComponent)];
const find = (tree, predicate) => nodes(tree).find(predicate);
const button = (tree, label) => find(tree, n => n.type === 'Button' && n.props.label === label);
const viewTab = (tree, label) => find(tree, n => typeof n.type === 'function' && n.props.label === label && 'selected' in n.props);
const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n?.props?.children ?? '');
const tokens = require('../src/constants/design-tokens.json');
const c = { ...tokens.light, ink: tokens.light.foreground, honey: tokens.light.accent, honeyDark: tokens.light.primary, honeyDeep: tokens.light.foreground, honeySoft: tokens.light.surface, surfaceWarm: tokens.light.surface };
const native = Object.fromEntries(['ActivityIndicator','FlatList','Modal','RefreshControl','Switch','TouchableOpacity','View','ScrollView','Pressable','TextInput'].map(n => [n,n]));
native.StyleSheet = { create: x => x }; native.Platform = { OS:'web' }; native.useWindowDimensions = () => ({width:375,fontScale:1});
const presentation = { Button:'Button', IconButton:'IconButton', Surface:'Surface', ScreenFrame:'ScreenFrame', Sheet:'Sheet', Field:'Field', ChoiceChip:'ChoiceChip', StatusMessage:'StatusMessage' };
const features = load('src/constants/features.ts');
const theme = { Borders:tokens.borders, Controls:tokens.controls, Layout:tokens.layout, Spacing:tokens.spacing, States:tokens.states, Typography:tokens.typography, Fonts: { sans: 'sans-serif' }, BeeBetterColors:c, Radii:tokens.radii, MaxContentWidth:720, useBeePalette:()=>c, useBeeStyles:fn=>fn(c) };
function basics(h) { return { react:h.react, 'expo-image':{Image:'Image'}, '../../assets/images/beebetter-logo.png':5, '../../../assets/svg/book-svgrepo-com.svg':1, '../../../assets/svg/health-insurance-round-svgrepo-com.svg':2, '../../../assets/svg/user-social-network-svgrepo-com.svg':3, '../../../assets/svg/infinite-symbol-svgrepo-com.svg':4, '@/constants/features':features, 'react-native':native, 'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'}, '@expo/vector-icons':{Ionicons:'Icon'}, '@/constants/theme':theme, '@/components/themed-text':{ThemedText:'Text'}, './themed-text':{ThemedText:'Text'}, '@/components/mobile-ui':presentation, '@/components/xp-visuals':{XpBadge:'XpBadge',QuestReward:'QuestReward',XpProgress:'XpProgress'}, '@/components/bee-visuals':{BeeMark:'BeeMark'}, '@/components/user-avatar':{UserAvatar:'Avatar'}, '@/components/home-menu':{HomeMenu:'HomeMenu'}, '@/hooks/use-app-appearance':{useAppAppearance:()=>({scheme:'light',toggleTheme(){}})}, '@/context/location-context':{useLocationContext:()=>({locations:[]})} }; }
const quests = [
 {id:'q1',title:'A long quest title that wraps instead of losing useful information',category:'Academics',status:'active',xp:25,requires_proof:false},
 {id:'q2',title:'Walk outdoors',category:'Health',status:'active',xp:15,requires_proof:true},
 {id:'q3',title:'Locked step',category:'Habits',status:'active',xp:20,prerequisite_quest_id:'missing'},
 {id:'q4',title:'Pending step',category:'Social',status:'pending',xp:20},
 {id:'q5',title:'Completed step',category:'Social',status:'completed',xp:20},
];
quests.forEach(q => { q.created_at = '2026-10-06T00:00:00Z'; });
function questScreen(overrides = {}) {
 const h=hooks(), routes=[],events=[],alerts=[],data={user:{id:'a'},levelProgress:{level:2},questsHasMore:false,isLoading:false,isRefreshing:false,workspaceErrors:{},refresh:async()=>{},retryWorkspace:async scope=>routes.push(['retry',scope]),completeQuest:async()=>({success:true}),deleteQuest:async()=>{},...overrides};
 let params={}, candidates=quests;const router={push:r=>routes.push(r),setParams:p=>{params={...params,...p};h.render();}};
 const ranked=()=>candidates.map(q=>({quest:q,locked:!!q.prerequisite_quest_id,reasons:['Fits your goal'],reasonCodes:['goal_alignment'],tier:'available'}));
 const mod=load('src/app/(tabs)/quests.tsx',{...basics(h),'react-native':{...native,Alert:{alert:(...a)=>alerts.push(a)}},'expo-router':{router,useLocalSearchParams:()=>params},'expo-image-picker':{},'expo-document-picker':{},'@/hooks/use-user-data':{useUserData:()=>data},'@/hooks/use-quest-categories':{useQuestCategories:()=>({categories:[]})},'@/context/quest-priority-context':{useQuestPriority:()=>({ranked:ranked(),locationAvailable:false,now:Date.now()})},'@/lib/quest-discovery':load('src/lib/quest-discovery.ts', { './quest-time': load('src/lib/quest-time.ts') }), '@/lib/recommendation-events':{createRecommendationSession:()=> 'test',recordRecommendationEvent:async e=>events.push(e)}});
 h.mount(()=>mod.default().type());
 const list=()=>find(h.value,n=>n.type==='FlatList');const row=id=>{const p=list().props;const index=p.data.findIndex(item=>item.quest.id===id);return p.renderItem({item:p.data[index],index});};const detail=()=>find(h.value,n=>typeof n.type==='function'&&n.props.details);
 const renderCard=element=>{const ch=hooks();const m=load('src/app/(tabs)/quests.tsx',{...basics(ch),'react-native':{...native,Alert:{alert(){}}},'expo-router':{router,useLocalSearchParams:()=>params},'expo-image-picker':{},'expo-document-picker':{},'@/hooks/use-user-data':{useUserData:()=>data},'@/hooks/use-quest-categories':{useQuestCategories:()=>({categories:[]})},'@/context/quest-priority-context':{useQuestPriority:()=>({ranked:ranked(),locationAvailable:false,now:Date.now()})},'@/lib/quest-discovery':load('src/lib/quest-discovery.ts', { './quest-time': load('src/lib/quest-time.ts') }),'@/lib/recommendation-events':{createRecommendationSession:()=> 'test',recordRecommendationEvent:async()=>{}}});ch.mount(()=>{const tree=m.default().type();const lp=find(tree,n=>n.type==='FlatList').props;const target=lp.renderItem({item:{quest:element.props.quest,reasons:[],locked:element.props.locked},index:0});return target.type(element.props);});return ch;};
 return {h,data,list,row,detail,routes,events,alerts,router,renderCard,accountKey:()=>mod.default().props.key,setCandidates(q){candidates=q;h.render();}};
}
const cases=[];const test=(name,fn)=>cases.push({name,fn});
test('only active unlocked proof-free rows offer quick completion',()=>{const s=questScreen();viewTab(s.h.value,'All Quests').props.onPress();s.h.render();for(const q of quests){const element=s.row(q.id),card=s.renderCard(element);assert.equal(!!button(card.value,'Complete'),q.id==='q1');assert.equal(!!find(card.value,n=>n.props?.label==='Edit quest'),false);card.unmount();}s.h.unmount();});
test('quest IDs, detail route, and recommendation selection stay stable',()=>{const s=questScreen();assert.equal(s.list().props.keyExtractor({quest:quests[0]}),'q1');s.row('q1').props.onOpen();assert.equal(s.detail().props.quest.id,'q1');assert.equal(s.events.filter(e=>e.eventType==='selection').length,1);s.h.unmount();});
test('completion deduplicates while pending and displays the reward after success',async()=>{const wait=deferred();let calls=0;const s=questScreen({completeQuest:()=>{calls++;return wait.promise}});const action=s.row('q1').props.onComplete;action();action();await flush();assert.equal(calls,1);assert.equal(s.events.filter(e=>e.eventType==='selection').length,1);assert.equal(s.row('q1').props.completing,true);wait.resolve({success:true});await flush();assert.ok(find(s.h.value,n=>n.type==='QuestReward'));s.h.unmount();});
test('failed completion retains proof and permits a retry',async()=>{let calls=0;const s=questScreen({completeQuest:async()=>{calls++;throw Error('offline')}});const proof={uri:'file:///synthetic',name:'proof.jpg',mimeType:'image/jpeg'};s.row('q2').props.onProofChange(proof);await flush();s.row('q2').props.onComplete(proof);await flush();assert.equal(s.row('q2').props.proof.name,'proof.jpg');assert.equal(s.row('q2').props.completing,false);s.row('q2').props.onComplete(proof);await flush();assert.equal(calls,2);s.h.unmount();});
test('proof survives row virtualization, closing details, and filtering',async()=>{const s=questScreen();s.row('q2').props.onProofChange({name:'proof.jpg',uri:'file:///synthetic'});await flush();s.row('q2').props.onOpen();assert.equal(s.detail().props.proof.name,'proof.jpg');s.router.setParams({questId:''});s.setCandidates([quests[0]]);s.setCandidates(quests);s.router.setParams({questId:'q2'});assert.equal(s.detail().props.proof.name,'proof.jpg');s.h.unmount();});
test('account-keyed quest lifetime clears drafts and ignores late completions',async()=>{const wait=deferred();const s=questScreen({completeQuest:()=>wait.promise});s.row('q2').props.onProofChange({name:'old.jpg'});await flush();s.row('q1').props.onComplete();s.h.unmount();const other=questScreen({user:{id:'b'}});assert.equal(s.accountKey(),'a');assert.equal(other.accountKey(),'b');assert.equal(other.row('q2').props.proof,undefined);wait.resolve({success:false,error:'old account'});await flush();assert.equal(s.alerts.length,0);assert.equal(find(other.h.value,n=>n.type==='QuestReward'),undefined);other.h.unmount();});
test('filter dismissal discards edits while apply changes the visible list',async()=>{const s=questScreen();viewTab(s.h.value,'All Quests').props.onPress();await flush();button(s.h.value,'Filters').props.onPress();await flush();const group=()=>find(s.h.value,n=>typeof n.type==='function'&&n.props.label==='Category');group().props.onChange('Health');await flush();find(s.h.value,n=>n.props?.accessibilityLabel==='Close filters without applying').props.onPress();await flush();assert.equal(s.list().props.data.length,5);button(s.h.value,'Filters').props.onPress();await flush();assert.equal(group().props.value,'');group().props.onChange('Health');await flush();find(s.h.value,n=>n.type==='TouchableOpacity'&&text(n)==='Apply Filters').props.onPress();await flush();assert.equal(s.list().props.data.length,1);assert.equal(s.list().props.data[0].quest.id,'q2');s.h.unmount();});
test('scoped quest failure retains cached rows and exposes its retry callback',async()=>{const s=questScreen({workspaceErrors:{quests:'Could not refresh'},isLoading:true});assert.ok(s.list().props.data.length);button(s.h.value,'Retry quests').props.onPress();await flush();assert.deepEqual(s.routes[0],['retry','quests']);s.h.unmount();});
test('header-free quests show counts and preserve creation and All Quests destinations', async () => {
 const s=questScreen();s.setCandidates([]);
 const header=s.h.value;
 assert.equal(button(header,'New quest'),undefined);
 assert.equal(text(header).includes('Suggestions for your day'),false);
 assert.equal(button(header,'Filters').props.disabled,true);
 assert.equal(find(header,n=>n.props?.label==='Open notifications'),undefined);
 assert.equal(find(header,n=>n.type==='Text'&&text(n)==='Quests'),undefined);
 assert.ok(find(header,n=>n.type==='Text'&&text(n)==='0 quests'));
 assert.equal(viewTab(header,'Recommended').props.selected,true);
 let empty=s.list().props.ListEmptyComponent;
 assert.equal(empty.props.subtitle,'Create a small, specific quest to get started.');
 assert.equal(empty.props.actionLabel,'New quest');empty.props.onPress();assert.equal(s.routes[0],'/add-quest');
 empty.props.onBrowse();await flush();
 assert.equal(viewTab(s.h.value,'All Quests').props.selected,true);
 assert.equal(s.list().props.ListEmptyComponent.props.onBrowse,undefined);
 assert.equal(button(s.h.value,'Filters').props.disabled,false);
 assert.ok(find(s.h.value,n=>n.type==='Text'&&text(n)==='0 quests'));
 s.setCandidates([quests[0]]);assert.ok(find(s.h.value,n=>n.type==='Text'&&text(n)==='1 quest'));s.h.unmount();
 const signedOut=questScreen({user:null});signedOut.setCandidates([]);
 signedOut.list().props.ListEmptyComponent.props.onPress();assert.equal(signedOut.routes[0],'/auth');signedOut.h.unmount();
});
test('filtered empty quests reset filters without creating a quest', async () => {
 const s=questScreen();viewTab(s.h.value,'All Quests').props.onPress();await flush();
 button(s.h.value,'Filters').props.onPress();await flush();
 find(s.h.value,n=>typeof n.type==='function'&&n.props.label==='Category').props.onChange('Missing category');await flush();
 find(s.h.value,n=>n.type==='TouchableOpacity'&&text(n)==='Apply Filters').props.onPress();await flush();
 assert.equal(s.list().props.data.length,0);
 const empty=s.list().props.ListEmptyComponent;assert.equal(empty.props.actionLabel,'Reset filters');
 empty.props.onPress();await flush();assert.equal(s.list().props.data.length,5);assert.equal(s.routes.length,0);s.h.unmount();
});
test('All Quests retains dismissal spacing with an inactive dismissal control', async () => {
 const s=questScreen();const recommended=s.renderCard(s.row('q1'));
 assert.equal(button(recommended.value,'Not now').props.disabled,false);recommended.unmount();
 viewTab(s.h.value,'All Quests').props.onPress();await flush();
 const all=s.renderCard(s.row('q1'));const dismiss=button(all.value,'Not now');
 assert.equal(dismiss.props.disabled,true);const before=s.events.length;dismiss.props.onPress();
 assert.equal(s.events.length,before);all.unmount();s.h.unmount();
});
test('quest loading and failures keep the creation empty state hidden', () => {
 const loading=questScreen({isLoading:true});loading.setCandidates([]);
 assert.equal(loading.list().props.ListEmptyComponent.type,'View');loading.h.unmount();
 const failed=questScreen({workspaceErrors:{quests:'Offline'}});failed.setCandidates([]);
 assert.equal(failed.list().props.ListEmptyComponent,null);assert.ok(button(failed.h.value,'Retry quests'));failed.h.unmount();
});
test('disclosure exposes state and reveals its existing contents',async()=>{const h=hooks();const mod=load('src/components/mobile-ui.tsx',basics(h));h.mount(()=>mod.Disclosure({title:'History',children:'Saved history'}));let trigger=find(h.value,n=>n.type==='Pressable');assert.equal(trigger.props.accessibilityState.expanded,false);trigger.props.onPress();await flush();trigger=find(h.value,n=>n.type==='Pressable');assert.equal(trigger.props.accessibilityState.expanded,true);assert.ok(text(h.value).includes('Saved history'));h.unmount();});
test('shared buttons expose loading and keyboard focus feedback',async()=>{const h=hooks();const mod=load('src/components/mobile-ui.tsx',basics(h));h.mount(()=>mod.Button({label:'Save',onPress(){},loading:true}));assert.equal(h.value.props.disabled,true);assert.equal(h.value.props.accessibilityState.busy,true);h.value.props.onFocus();await flush();const styles=h.value.props.style({pressed:false});assert.equal(styles[1].borderColor,c.primaryForeground);assert.equal(styles[0].minHeight,48);h.unmount();});
test('button intents stay distinct in both themes through pressed and disabled states', () => {
 for (const palette of [tokens.light, tokens.dark]) {
  const h=hooks();const mod=load('src/components/mobile-ui.tsx',{...basics(h),'@/constants/theme':{...theme,useBeePalette:()=>palette}});
  const backgrounds={primary:palette.primary,secondary:palette.card,quiet:'transparent',destructive:palette.danger,accent:palette.accent,'accent-quiet':'transparent'};
  const pressed={primary:palette.primaryPressed,secondary:palette.surfaceMuted,quiet:palette.surfaceMuted,destructive:palette.dangerPressed,accent:palette.accent,'accent-quiet':'transparent'};
  for(const intent of Object.keys(backgrounds)) {
   h.mount(()=>mod.Button({label:'Action',intent,onPress(){}}));
   assert.equal(h.value.props.style({pressed:false})[1].backgroundColor,backgrounds[intent]);
   assert.equal(h.value.props.style({pressed:true})[1].backgroundColor,pressed[intent]);
   h.mount(()=>mod.Button({label:'Action',intent,disabled:true,onPress(){}}));
   assert.equal(h.value.props.disabled,true);
   assert.equal(h.value.props.style({pressed:false})[1].backgroundColor,palette.disabled);
  }
  h.unmount();
 }
});
test('field focus and validation survive caller styling without moving the input', async () => {
 const h=hooks();let focuses=0,blurs=0;let error;let editable=true;
 const mod=load('src/components/mobile-ui.tsx',basics(h));
 h.mount(()=>mod.Field({label:'Name',error,editable,style:{borderWidth:1,borderColor:c.border},onFocus(){focuses++;},onBlur(){blurs++;}}));
 const input=()=>find(h.value,n=>n.type==='TextInput');
 const style=()=>Object.assign({},...input().props.style);
 const width=style().borderWidth;assert.equal(style().borderColor,c.input);
 input().props.onFocus({});await flush();assert.equal(focuses,1);assert.equal(style().borderColor,c.focus);assert.equal(style().borderWidth,width);
 error='Check your name';h.render();assert.equal(style().borderColor,c.danger);assert.ok(find(h.value,n=>n.props?.accessibilityRole==='alert'));
 input().props.onBlur({});await flush();assert.equal(blurs,1);assert.equal(style().borderWidth,width);
 editable=false;h.render();assert.equal(style().backgroundColor,c.disabled);assert.equal(style().color,c.disabledForeground);h.unmount();
});
test('disclosure focus remains visible while opening and closing content', async () => {
 const h=hooks();const mod=load('src/components/mobile-ui.tsx',basics(h));h.mount(()=>mod.Disclosure({title:'History',children:'Recorded history'}));
 const trigger=()=>find(h.value,n=>n.type==='Pressable');const style=()=>Object.assign({},...trigger().props.style({pressed:false}));
 const width=style().borderWidth;trigger().props.onFocus();await flush();assert.equal(style().borderColor,c.focus);
 trigger().props.onPress();await flush();assert.equal(trigger().props.accessibilityState.expanded,true);assert.equal(style().borderWidth,width);
 trigger().props.onBlur();await flush();assert.equal(style().borderColor,'transparent');h.unmount();
});
test('Home keeps cached progress, scoped retries and the recommended quest destination', () => {
 const h=hooks(),routes=[],retries=[];
 const data={profile:{display_name:'Alex',current_streak:3},progressSummary:{totalCompleted:12},levelProgress:{},workspaceErrors:{progress:'Offline',quests:'Offline'},isLoading:false,isRefreshing:false,refresh(){},retryWorkspace(scope){retries.push(scope);}};
 const mod=load('src/app/(tabs)/index.tsx',{...basics(h),'expo-router':{router:{push:route=>routes.push(route)}},'@/hooks/use-user-data':{useUserData:()=>data},'@/context/quest-priority-context':{useQuestPriority:()=>({ranked:[{quest:quests[0],locked:false,tier:'available',reasons:['Fits your goal']}],locationAvailable:false})},'@/lib/quest-discovery':load('src/lib/quest-discovery.ts',{'./quest-time':load('src/lib/quest-time.ts')})});
 h.mount(()=>mod.default());assert.ok(text(h.value).includes('12'));
 button(h.value,'Retry progress').props.onPress();button(h.value,'Retry quests').props.onPress();assert.deepEqual(retries,['progress','quests']);
 button(h.value,'View quest').props.onPress();assert.equal(routes[0].pathname,'/quests');assert.equal(routes[0].params.questId,'q1');h.unmount();
});
test('retained Home wellness disclosure preserves destinations when explicitly enabled',async()=>{const h=hooks(),routes=[];const data={profile:{display_name:'Student'},progressSummary:{totalCompleted:1},levelProgress:{},workspaceErrors:{},isLoading:false,isRefreshing:false,refresh(){},retryWorkspace(){}};const mod=load('src/app/(tabs)/index.tsx',{...basics(h),'@/constants/features':{MOBILE_WELLNESS_AND_SUPPORT_ENABLED:true},'expo-router':{router:{push:r=>routes.push(r)}},'@/hooks/use-user-data':{useUserData:()=>data},'@/context/quest-priority-context':{useQuestPriority:()=>({ranked:[],locationAvailable:false})},'@/lib/quest-discovery':load('src/lib/quest-discovery.ts', { './quest-time': load('src/lib/quest-time.ts') })});h.mount(()=>mod.default());const entry=find(h.value,n=>typeof n.type==='function'&&n.props.title==='Wellness');entry.props.onPress();await flush();const sheet=find(h.value,n=>n.type==='Sheet');assert.equal(sheet.props.visible,true);for(const label of ['Daily check-in','Self-management reflection','My history and trends'])button(h.value,label).props.onPress();assert.deepEqual(routes,['/wellness-check-in','/self-management-reflection','/wellness-history']);h.unmount();});
test('provisional wellness and support are absent from Home',()=>{
 const h=hooks(),routes=[];
 const mod=load('src/app/(tabs)/index.tsx',{...basics(h),'expo-router':{router:{push:r=>routes.push(r)}},'@/hooks/use-user-data':{useUserData:()=>({profile:{display_name:'Student'},progressSummary:{totalCompleted:1},levelProgress:{},workspaceErrors:{},isLoading:false,isRefreshing:false,refresh(){},retryWorkspace(){}})},'@/context/quest-priority-context':{useQuestPriority:()=>({ranked:[],locationAvailable:false})},'@/lib/quest-discovery':load('src/lib/quest-discovery.ts',{'./quest-time':load('src/lib/quest-time.ts')})});
 h.mount(()=>mod.default());
 assert.equal(features.MOBILE_WELLNESS_AND_SUPPORT_ENABLED,false);
 assert.equal(find(h.value,n=>n.type==='Sheet'),undefined);
 assert.equal(find(h.value,n=>typeof n.type==='function'&&['Wellness','Request OSAS support'].includes(n.props.title)),undefined);
 assert.equal(text(h.value).includes('A moment for you'),false);
 button(h.value,'Explore quests').props.onPress();
 find(h.value,n=>n.props?.label==='Open menu').props.onPress();
 assert.deepEqual(routes,['/quests']);h.unmount();
});
test('disabled wellness performs no recommendation reads or subscriptions across accounts',async()=>{
 const h=hooks();let user={id:'a'},reads=0,subscriptions=0;const contexts=[];
 const mod=load('src/context/quest-priority-context.tsx',{...basics(h),'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},'./user-data-context':{useUserData:()=>({user,profile:{goal:'Study'},quests:[],completionHistory:[]})},'./location-context':{useLocationContext:()=>({coords:null,locationUpdatedAt:null,locations:[],permissionStatus:'denied'})},'@/lib/quest-priority':{hasFreshPosition:()=>false,prioritizeQuests:(_,context)=>{contexts.push(context);return[]}},'@/lib/geofence-events':{readGeofenceEvents:async()=>({}),subscribeGeofenceEvents:()=>()=>{}},'@/lib/wellbeing-data':{getMyRecommendationWellnessContext:async()=>{reads++;return{}},subscribeRecommendationContext:()=>{subscriptions++;return()=>{}}}});
 h.mount(()=>mod.QuestPriorityProvider({children:null}));await flush();user={id:'b'};h.render();await flush();
 assert.equal(reads,0);assert.equal(subscriptions,0);assert.ok(contexts.length);assert.ok(contexts.every(context=>context.wellness===null));h.unmount();
});
test('navigation keeps four routes with Home and Quests visible and a separate create action', () => {
 const h=hooks(), Tabs=Object.assign(()=>{},{Screen:'TabScreen'});
 const mod=load('src/components/app-navigation.tsx',{...basics(h),'expo-router':{Tabs},'./app-bottom-bar':{AppBottomBar:'AppBottomBar'}});
 const tree=mod.default(), screens=nodes(tree).filter(n=>n.type==='TabScreen');
 assert.deepEqual(screens.map(n=>n.props.name),['index','quests','skill-tree','profile']);
 assert.equal(tree.props.screenOptions.sceneStyle.backgroundColor,'transparent');
 assert.deepEqual(screens.filter(n=>n.props.options.href!==null).map(n=>n.props.name),['index','quests']);
 const routes=[],events=[];
 const bar=load('src/components/app-bottom-bar.tsx',{...basics(h),'./themed-text':{ThemedText:'Text'},'react-native-svg':{__esModule:true,default:'Svg',Path:'Path',Polygon:'Polygon'},'expo-router':{router:{push:r=>routes.push(r)}}});
 const state={index:0,routes:[{key:'home-key',name:'index'},{key:'quest-key',name:'quests'}]};
 let prevent=false;
 const element=bar.AppBottomBar({state,navigation:{emit:e=>{events.push(e);return {defaultPrevented:prevent}},navigate:(name,params)=>routes.push([name,params])}});
 element.props.onQuests();assert.equal(routes[0][0],'quests');assert.equal(events[0].target,'quest-key');
 prevent=true;element.props.onHome();assert.equal(routes.length,1);
 element.props.onCreate();assert.equal(routes[1],'/add-quest');
 h.mount(()=>bar.BottomNavigation(element.props));
 assert.equal(find(h.value,n=>n.props?.accessibilityLabel==='Create quest').props.style({pressed:false})[0].minHeight,68);
 assert.equal(find(h.value,n=>n.props?.edges).props.edges[0],'bottom');h.unmount();
});
test('two-step creation preserves its draft after failure and deduplicates save taps',async()=>{
 const h=hooks(), wait=deferred();let calls=0,backs=0,draft;const data={user:{id:'a'},quests:[],isLoading:false,refresh(){},addQuest:value=>{calls++;draft=value;return wait.promise}};
 const mod=load('src/app/add-quest.tsx',{...basics(h),'@/constants/theme':{...theme,useAppColorScheme:()=> 'light'},'@/components/quest-wizard':Object.fromEntries(['QuestAccordion','QuestCard','QuestChoice','QuestFieldLabel','QuestIcon','QuestNote','QuestSelect','QuestText','QuestWizardFooter','QuestWizardHeader'].map(name=>[name,name])),'react-native':{...native,Keyboard:{dismiss(){}},BackHandler:{addEventListener:()=>({remove(){}})},KeyboardAvoidingView:'KeyboardAvoidingView'},'expo-router':{router:{back:()=>backs++,push(){}},useLocalSearchParams:()=>({}),useFocusEffect:fn=>h.react.useEffect(fn,[fn])},'@/components/quest-time-input':{QuestTimeInput:'TimeInput'},'@/hooks/use-user-data':{useUserData:()=>data},'@/hooks/use-quest-categories':{useQuestCategories:()=>({categories:[{id:'academic',name:'Academics'}],loading:false,error:null,refresh(){},createCategory(){}})},'@/context/location-context':{useLocationContext:()=>({activeLocations:[],isLoadingLocations:false})},'@/lib/quest-suggestions':{getQuestIdeas:()=>[]},'@/lib/quest-time':load('src/lib/quest-time.ts')});
 const footer=()=>find(h.value,n=>n.type==='QuestWizardFooter');const header=()=>find(h.value,n=>n.type==='QuestWizardHeader');
 h.mount(()=>mod.default().type({}));assert.equal(header().props.step,1);footer().props.onPress();await flush();assert.match(footer().props.feedback,/name/);assert.equal(calls,0);
 find(h.value,n=>n.props?.accessibilityLabel==='Quest name').props.onChangeText('Review my notes');await flush();find(h.value,n=>typeof n.type==='function'&&n.props.label==='Academics').props.onPress();await flush();footer().props.onPress();await flush();assert.equal(header().props.step,2);
 find(h.value,n=>n.type==='QuestChoice'&&n.props.label==='Daily').props.onPress();await flush();header().props.onBack();await flush();assert.equal(find(h.value,n=>n.props?.accessibilityLabel==='Quest name').props.value,'Review my notes');footer().props.onPress();await flush();
 const save=footer().props.onPress;save();save();await flush();assert.equal(calls,1);assert.equal('recurrence' in draft,false);wait.resolve({success:false,error:'Network unavailable'});await flush();assert.equal(backs,0);assert.equal(footer().props.feedback,'Network unavailable');header().props.onBack();await flush();assert.equal(find(h.value,n=>n.props?.accessibilityLabel==='Quest name').props.value,'Review my notes');h.unmount();
});
test('new sheets honor reduced motion and clean up the listener',async()=>{
 const h=hooks();let removed=false;const mod=load('src/components/mobile-ui.tsx',{...basics(h),'react-native':{...native,AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){removed=true}})}}});h.mount(()=>mod.Sheet({title:'Wellness',visible:true,onClose(){},children:'Private choices'}));await flush();assert.equal(h.value.props.animationType,'none');h.unmount();assert.equal(removed,true);
});
function backgroundHarness(width = 375, height = 812) {
 const h = hooks(), calls = []; let phase, animatedStyle, stateListener, removed = false, setReduced;
 const reanimated = {
  default: { View: 'AnimatedView' }, __esModule: true, Easing: { linear: 'linear' }, ReduceMotion: { System: 'system' },
  useSharedValue(initial) { phase = h.react.useRef({ value: initial }).current; return phase; },
  useAnimatedStyle(fn) { animatedStyle = fn; return {}; },
  withTiming(to, config) { return { to, config }; },
  withRepeat(animation, repetitions, reverse) { calls.push({ ...animation, repetitions, reverse }); return phase.value; },
  cancelAnimation() { calls.push('cancel'); },
 };
 const mod = load('src/components/hexagon-background.tsx', {
  react: h.react, '@/constants/theme': theme,
  '@/components/mobile-ui': { useReducedMotion() { const [reduced, set] = h.react.useState(true); setReduced = set; return reduced; } },
  'react-native': { ...native, useWindowDimensions: () => ({ width, height }), StyleSheet: { create: x => x, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } }, AppState: { currentState: 'active', addEventListener(_, fn) { stateListener = fn; return { remove() { removed = true; } }; } } },
  'react-native-reanimated': reanimated,
  'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', G: 'G', Pattern: 'Pattern', Polygon: 'Polygon', Rect: 'Rect' },
 });
 h.mount(() => mod.HexagonBackground());
 return { h, calls, get phase() { return phase; }, style: () => animatedStyle(), reduce: v => setReduced(v), state: v => stateListener(v), get removed() { return removed; } };
}
test('background stays static for reduced motion, pauses while inactive and resumes its phase', async () => {
 const b = backgroundHarness();
 assert.equal(b.calls.filter(x => x !== 'cancel').length, 0);
 assert.equal(b.h.value.props.pointerEvents, 'none');
 assert.equal(b.h.value.props.importantForAccessibility, 'no-hide-descendants');
 b.reduce(false); await flush();
 assert.equal(b.calls.filter(x => x !== 'cancel').length, 1);
 const first = b.calls.find(x => x !== 'cancel');
 assert.equal(first.config.easing, 'linear'); assert.equal(first.reverse, false); assert(first.config.duration >= 240000);
 b.phase.value = 0.375; const tree = b.h.value; b.style(); assert.equal(b.h.value, tree);
 b.state('background'); await flush(); assert.equal(b.phase.value, 0.375);
 b.state('active'); await flush(); assert.equal(b.calls.filter(x => x !== 'cancel').at(-1).to, 1.375);
 b.reduce(true); await flush(); assert.equal(b.phase.value, 0.375);
 const starts = b.calls.filter(x => x !== 'cancel').length; b.state('active'); await flush();
 assert.equal(b.calls.filter(x => x !== 'cancel').length, starts);
 b.h.unmount(); assert.equal(b.removed, true); assert.equal(b.calls.at(-1), 'cancel');
});
test('rotated background covers portrait, landscape and wide screens throughout a tile-period loop', () => {
 for (const [width, height] of [[320,568],[375,812],[812,375],[1024,1366],[1366,1024],[2560,1080]]) {
  const b = backgroundHarness(width, height);
  const plane = find(b.h.value, n => n.props?.style?.transform?.[0]?.rotate)?.props.style;
  const tile = find(b.h.value, n => n.type === 'Pattern').props;
  const angle = parseFloat(plane.transform[0].rotate) * Math.PI / 180;
  assert(parseFloat(plane.transform[0].rotate) >= -25 && parseFloat(plane.transform[0].rotate) <= -15);
  b.phase.value = 0.5; const middle = b.style().transform;
  assert.equal((middle[0].translateX * 2) % tile.width, 0);
  assert.equal((middle[1].translateY * 2) % tile.height, 0);
  for (const phase of [0,0.25,0.5,0.75,0.999999,1]) {
   b.phase.value = phase; const shift = b.style().transform;
   for (const x of [0,width]) for (const y of [0,height]) {
    const dx = x - width/2, dy = y - height/2;
    const localX = dx*Math.cos(angle) + dy*Math.sin(angle) + plane.width/2 - shift[0].translateX;
    const localY = -dx*Math.sin(angle) + dy*Math.cos(angle) + plane.height/2 - shift[1].translateY;
    assert(localX >= 0 && localX <= plane.width && localY >= 0 && localY <= plane.height, `${width}x${height} has a gap at phase ${phase}`);
   }
  }
  b.phase.value = 1; assert.equal(b.style().transform[0].translateX, 0); assert.equal(b.style().transform[1].translateY, 0);
  b.h.unmount();
 }
});
test('Home header, shortcuts and recommendation use existing account and quest data', async () => {
 const h=hooks(),routes=[];
 const data={user:{email:'fallback@example.test',user_metadata:{avatar_url:'https://example.test/avatar.jpg'}},profile:{display_name:'Brightsteel',current_streak:7},progressSummary:{totalCompleted:19},levelProgress:{level:4,currentLevelXp:23,xpForNextLevel:100,progressPercent:23},workspaceErrors:{},isLoading:false,isRefreshing:false,refresh(){},retryWorkspace(){}};
 const quest={...quests[0],description:'Actual quest description',location_id:'place-1',xp:25};
 const mod=load('src/app/(tabs)/index.tsx',{...basics(h),'react-native':{...native,useWindowDimensions:()=>({width:320,fontScale:1})},'expo-router':{router:{push:r=>routes.push(r)}},'@/hooks/use-user-data':{useUserData:()=>data},'@/context/location-context':{useLocationContext:()=>({locations:[{id:'place-1',name:'Library'}]})},'@/context/quest-priority-context':{useQuestPriority:()=>({ranked:[{quest,reasons:['Actual ranking reason']}],locationAvailable:true})},'@/lib/quest-discovery':load('src/lib/quest-discovery.ts',{'./quest-time':load('src/lib/quest-time.ts')})});
 h.mount(()=>mod.default());
 const content=text(h.value);assert.ok(content.includes('Hi, Brightsteel!'));assert.ok(content.indexOf('Actual quest description')<content.indexOf('Your progress'));assert.ok(content.includes('Library'));assert.ok(content.includes('+25 XP'));assert.equal(text(find(h.value,n=>n.props?.accessibilityLabel==='Current streak: 7 days')),'7');assert.ok(content.includes('19'));
 const greeting=find(h.value,n=>n.type==='Text'&&text(n)==='Hi, Brightsteel!');assert.equal(greeting.props.numberOfLines,1);
 assert.equal(find(h.value,n=>n.type==='Avatar'),undefined);assert.equal(find(h.value,n=>n.type==='HomeMenu').props.avatarUri,data.user.user_metadata.avatar_url);
 assert.equal(find(h.value,n=>n.type==='XpProgress').props.progress,data.levelProgress);
 // A changed recommendation category updates the image without a separate state.
 for(const [category,asset] of [['Academics',1],['Health',2],['Social',3],['Habits',4],[' health ',2],['My custom category',1],['__proto__',1],[null,1]]) {
  quest.category=category;h.render();assert.equal(find(h.value,n=>n.type==='Image').props.source,asset);
 }
 assert.equal(find(h.value,n=>n.props?.label==='Switch to dark mode'),undefined);
 find(h.value,n=>n.props?.label==='Open notifications').props.onPress();
 find(h.value,n=>n.props?.accessibilityLabel==='Open Skill Tree, level 4').props.onPress();
 assert.equal(content.includes('all time'),false);
 find(h.value,n=>n.props?.label==='Open menu').props.onPress();await flush();assert.equal(find(h.value,n=>n.type==='HomeMenu').props.visible,true);
 for(const label of ['Profile','Save Places','Skill Tree'])find(h.value,n=>typeof n.type==='function'&&n.props.label===label).props.onPress();
 assert.deepEqual(routes,['/notifications','/skill-tree','/profile','/manage-locations','/skill-tree']);button(h.value,'View quest').props.onPress();assert.equal(routes.at(-1).params.questId,quest.id);
 data.user.user_metadata={};data.profile.display_name='';h.render();assert.ok(text(h.value).includes('Hi, fallback!'));assert.equal(find(h.value,n=>n.type==='Avatar'),undefined);assert.equal(find(h.value,n=>n.type==='HomeMenu').props.avatarUri,undefined);h.unmount();
});
test('side panel preserves destinations and provider logout, with requested placeholder buttons', () => {
 const h=hooks(),routes=[],alerts=[];let closed=0,signouts=0;
 const data={levelProgress:{level:3,currentLevelXp:40,xpForNextLevel:100,progressPercent:40},isSigningOut:false,signOut:()=>signouts++};
 const mod=load('src/components/home-menu.tsx',{...basics(h),'./mobile-ui':{...presentation,useReducedMotion:()=>true},'./themed-text':{ThemedText:'Text'},'./user-avatar':{UserAvatar:'Avatar'},'react-native':{...native,Alert:{alert:(...args)=>alerts.push(args)}},'expo-router':{router:{push:r=>routes.push(r)}},'@/hooks/use-user-data':{useUserData:()=>data}});
 h.mount(()=>mod.HomeMenu({visible:true,onClose:()=>closed++,displayName:'Actual Student'}));
 assert.equal(h.value.props.animationType,'none');assert.equal(find(h.value,n=>n.props?.accessibilityViewIsModal).props.accessibilityViewIsModal,true);
 assert.equal(find(h.value,n=>typeof n.type==='function'&&n.props.label==='Profile'),undefined);
 find(h.value,n=>n.props?.accessibilityLabel==='Open profile for Actual Student, level 3').props.onPress();
 for(const label of ['Save Places','Skill Tree','Notifications','Settings'])find(h.value,n=>typeof n.type==='function'&&n.props.label===label).props.onPress();
 assert.deepEqual(routes,['/profile','/manage-locations','/skill-tree','/notifications','/settings']);assert.equal(closed,5);
 for(const label of ['Help & Support']){const item=find(h.value,n=>typeof n.type==='function'&&n.props.label===label);assert.equal(item.props.disabled,true);assert.equal(item.props.onPress,undefined);}
 find(h.value,n=>typeof n.type==='function'&&n.props.label==='Log Out').props.onPress();assert.equal(signouts,0);alerts[0][2].find(b=>b.style==='destructive').onPress();assert.equal(signouts,1);
 data.isSigningOut=true;h.render();find(h.value,n=>typeof n.type==='function'&&n.props.label==='Log Out').props.onPress();assert.equal(alerts.length,1);h.unmount();
});
test('avatar uses Reusables images and initials for missing photos', () => {
 const h=hooks();let props={uri:'https://example.test/avatar.png',name:'Actual Student'};
 const mod=load('src/components/user-avatar.tsx',{...basics(h),'@/components/ui/avatar':{Avatar:'Avatar',AvatarImage:'AvatarImage',AvatarFallback:'AvatarFallback'},'@/components/ui/text':{Text:'Text'}});
 h.mount(()=>mod.UserAvatar(props));
 assert.equal(find(h.value,n=>n.type==='AvatarImage').props.source.uri,'https://example.test/avatar.png');
 assert.equal(find(h.value,n=>n.type==='Avatar').props.alt,"Actual Student's avatar");
 assert.equal(text(find(h.value,n=>n.type==='AvatarFallback')),'AS');
 props={name:'  Actual   Student '};h.render();
 assert.equal(find(h.value,n=>n.type==='AvatarImage'),undefined);
 assert.equal(text(find(h.value,n=>n.type==='AvatarFallback')),'AS');
 props={name:' '};h.render();assert.equal(text(find(h.value,n=>n.type==='AvatarFallback')),'E');h.unmount();
});
test('appearance restores a saved preference, protects startup taps and serializes rapid writes', async () => {
 const h=hooks(),read=deferred(),firstWrite=deferred(),saved=[];let scheme='light';
 const mod=load('src/hooks/use-app-appearance.ts',{react:h.react,'@/constants/theme':{APP_COLOR_SCHEME:'light',useAppColorScheme:()=>scheme},nativewind:{colorScheme:{set:v=>{scheme=v}}},'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:()=>read.promise,setItem:async(_,value)=>{saved.push(value);if(saved.length===1)await firstWrite.promise}}}});
 h.mount(()=>{mod.useRestoreAppAppearance();return mod.useAppAppearance()});
 h.value.toggleTheme();await flush();assert.equal(scheme,'dark');read.resolve('light');await flush();assert.equal(scheme,'dark');
 h.render();h.value.toggleTheme();await flush();assert.equal(scheme,'light');assert.deepEqual(saved,['dark']);
 firstWrite.resolve();await flush();assert.deepEqual(saved,['dark','light']);h.unmount();
 const restored=hooks();const second=load('src/hooks/use-app-appearance.ts',{react:restored.react,'@/constants/theme':{APP_COLOR_SCHEME:'light',useAppColorScheme:()=>scheme},nativewind:{colorScheme:{set:v=>{scheme=v}}},'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async()=>saved.at(-1),setItem:async()=>{}}}});
 restored.mount(()=>second.useRestoreAppAppearance());await flush();assert.equal(scheme,'light');restored.unmount();
});
test('compact XP presentation retains accurate progress and the default profile presentation', async () => {
 const h=hooks();let progress={level:3,currentLevelXp:40,xpForNextLevel:100,progressPercent:40},compact=true;
 class Value {constructor(v){this.value=v}stopAnimation(){}setValue(v){this.value=v}interpolate(){const self=this;return {get value(){return self.value+'%'}}}}
 const mod=load('src/components/xp-visuals.tsx',{...basics(h),'@/components/mobile-ui':{Badge:'Badge',Button:'Button'},'react-native':{...native,Animated:{Value,View:'AnimatedView'},AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})}}});
 h.mount(()=>mod.XpProgress({progress,compact}));await flush();assert.equal(find(h.value,n=>n.type==='AnimatedView').props.style[1].width.value,'40%');assert.ok(text(h.value).includes('40 / 100 XP'));assert.ok(text(h.value).includes('60 XP'));
 progress={...progress,currentLevelXp:75,progressPercent:75};h.render();await flush();assert.equal(find(h.value,n=>n.props?.accessibilityRole==='progressbar').props.accessibilityValue.now,75);assert.equal(find(h.value,n=>n.type==='AnimatedView').props.style[1].width.value,'75%');
 compact=false;h.render();assert.ok(text(h.value).includes('Level 3'));h.unmount();
});

test('Settings opens General and its Dark Mode switch uses the saved appearance owner', () => {
 const routes=[];let scheme='light';const saved=[];const h=hooks();
 const router={push:r=>routes.push(r),back:()=>routes.push('back')};
 const settings=load('src/app/settings/index.tsx',{...basics(h),'expo-router':{router}});
 h.mount(()=>settings.default());button(h.value,'General').props.onPress();assert.equal(routes[0],'/settings/general');
 find(h.value,n=>n.props?.label==='Back from Settings').props.onPress();assert.equal(routes[1],'back');h.unmount();
 const g=hooks();const general=load('src/app/settings/general.tsx',{...basics(g),'expo-router':{router},'@/hooks/use-app-appearance':{useAppAppearance:()=>({scheme}),setAppAppearance:next=>{saved.push(next);scheme=next}}});
 g.mount(()=>general.default());const toggle=()=>find(g.value,n=>n.type==='Switch');
 assert.equal(toggle().props.value,false);toggle().props.onValueChange(true);g.render();assert.equal(toggle().props.value,true);
 toggle().props.onValueChange(false);g.render();assert.equal(toggle().props.value,false);assert.deepEqual(saved,['dark','light']);g.unmount();
});

(async()=>{for(const {name,fn} of cases){await fn();console.log('PASS '+name)}console.log(cases.length+' mobile UI regressions passed.')})().catch(error=>{console.error(error);process.exitCode=1});
