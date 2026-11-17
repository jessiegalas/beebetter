/* global __dirname, Buffer */
// Isolated static screenshot harness. No Auth client or Supabase requests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),cp=require('node:child_process');const mobile=path.resolve(__dirname,'../..');const React=require('react'),RN=require('react-native-web'),ReactDOM=require('react-dom/server'),ts=require('typescript');const glyphs=require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');

// Static React markup does not dispatch native onLayout. Measure the browser
// boxes and paint the same frame geometry the app uses.
function paintPreviewFrames(pathsForSize) {
 const namespace = 'http://www.w3.org/2000/svg';
 for (const frame of document.querySelectorAll('[data-pixel-frame]')) {
  const config = JSON.parse(frame.dataset.pixelFrame);
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
  frame.prepend(svg);
  const paint = () => {
   const box = frame.getBoundingClientRect();
   const width = Math.ceil(box.width), height = Math.ceil(box.height);
   const { minimum, appearance, edge, step, line, pressed, focused, transparent, colors } = config;
   const paths = pathsForSize(width, height, minimum, appearance, edge, step, line, pressed);
   if (!paths) return;
   svg.setAttribute('width', width);
   svg.setAttribute('height', height);
   svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
   const layers = [
    [transparent ? `${paths.outer} ${paths.inset}` : paths.outer, colors.outline],
    [paths.depth, !transparent && colors.depth], [paths.inset, appearance === 'flat' && colors.inset],
    [paths.face, colors.face], [paths.highlight, colors.highlight], [paths.focus, focused && colors.focus],
   ];
   svg.replaceChildren(...layers.filter(([d, fill]) => d && fill).map(([d, fill]) => {
    const layer = document.createElementNS(namespace, 'path');
    layer.setAttribute('d', d);
    layer.setAttribute('fill', fill);
    layer.setAttribute('fill-rule', 'evenodd');
    return layer;
   }));
  };
  paint();
  new ResizeObserver(paint).observe(frame);
 }
}
function render(screen,width,scheme,scale=1,detail='',scenario='',baseline=false,height=812){
 const cache=new Map(),window={};
 const pass = ({ children }) => children ?? null;
 const animation = { duration: () => animation, reduceMotion: () => animation };
 const gesture = new Proxy({}, { get: () => () => gesture });
 const primitive = { Root: RN.View, Item: RN.View, Header: RN.View, Trigger: RN.Pressable,
   Content: () => null, useItemContext: () => ({ isExpanded: false }) };
 const dependencies = {
   '@rn-primitives/avatar': { Root: RN.View, Image: RN.Image, Fallback: RN.View },
   '@rn-primitives/separator': { Root: ({ style, ...props }) => React.createElement(RN.View, { ...props, style: [style, { minHeight: 1 }] }) },
   '@rn-primitives/slot': { View: RN.View, Text: RN.Text, Pressable: RN.Pressable },
   '@rn-primitives/accordion': primitive,
   'react-native-gesture-handler': { GestureHandlerRootView: RN.View, GestureDetector: pass, Gesture: gesture },
   'react-native-worklets': { scheduleOnRN() {} },
   expo: { useEventListener() {} },
   'expo-video': { VideoView: RN.View, useVideoPlayer: () => ({}) },
   'lucide-react-native/icons/chevron-down': { __esModule: true, default: () => null },
   '@/supabase': { supabase: {
     rpc() { throw Error('Unexpected backend call in static preview'); },
     from() { throw Error('Unexpected backend call in static preview'); },
   } },
 };
 const react = {
   ...React,
   useState(initial) {
     if (scenario === 'settled' && initial === true) initial = false;
     if (['all', 'completed'].includes(scenario) && initial === 'context') initial = 'all';
     if (scenario === 'completed' && initial?.status === 'all') initial = { ...initial, status: 'completed' };
     if (screen === 'auth' && scenario.startsWith('signup') && initial === 'sign-in') initial = 'sign-up';
     return React.useState(initial);
   },
 };
 // React Native Web accepts precompiled CSS classes through styleq. Forward
 // NativeWind's className props in this Node-only renderer without Metro.
 const classes = value => value ? { $$css: true, preview: value } : undefined;
 const withClasses = (Component, text = false) => ({
   className, contentContainerClassName, contentContainerStyle, style, cssInterop: _ignored, ...props
 }) => {
   const current = text ? RN.StyleSheet.flatten(style) || {} : {};
   const enlarged = text && scale !== 1 && props.allowFontScaling !== false;
   const scaled = enlarged ? {
     fontSize: current.fontSize ? current.fontSize * scale : undefined,
     lineHeight: current.lineHeight ? current.lineHeight * scale : undefined,
     zoom: current.fontSize ? undefined : scale,
   } : undefined;
   const merge = value => [classes(className), value, scaled];
   return React.createElement(Component, {
     ...props, style: typeof style === 'function' ? state => merge(style(state)) : merge(style),
     ...(contentContainerClassName || contentContainerStyle ? {
       contentContainerStyle: [classes(contentContainerClassName), contentContainerStyle],
     } : {}),
   });
 };
 const rn = {
   ...RN,
   ...Object.fromEntries(['View', 'Pressable', 'ScrollView', 'TextInput', 'KeyboardAvoidingView', 'Switch', 'ActivityIndicator']
     .map(name => [name, withClasses(RN[name])])),
   Text: withClasses(RN.Text, true),
   Modal: ({ visible, children, transparent: _transparent, animationType: _animation, onRequestClose: _close, ...props }) =>
     visible ? React.createElement(RN.View, props, children) : null,
   useColorScheme: () => scheme,
   useWindowDimensions: () => ({ width, height, scale: 1, fontScale: scale }),
 };
 const previewSource=(source,file)=>{
  if(!baseline && file.endsWith('auth.tsx') && screen==='onboarding' && scenario.startsWith('enrollment')){
   return source.replace('const [index, setIndex] = useState(0);','const [index, setIndex] = useState(1);');
  }
  return !baseline && file.endsWith("pixel-frame.tsx") ? source.replace("<View testID={testID} onLayout=", '<View testID={testID} dataSet={{ pixelFrame: JSON.stringify({ minimum, appearance, edge, step, line, pressed, focused, transparent: ramp?.base === null, colors: { outline: ramp?.outline ?? c[border], depth: ramp?.shadow ?? c[depth], inset: innerHighlight && c[innerHighlight], face: ramp ? ramp.base : c[fill], highlight: ramp?.highlight, focus: c[focusColor] } }) }} onLayout=') : screen==='skills'&&scenario==='branch'?source.replace('useState<TreeFocus>({})', "useState<TreeFocus>({ domainId: 'academics' })"):screen==='auth'&&scenario==='confirmation'?source.replace("const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);","const [confirmationEmail, setConfirmationEmail] = useState<string | null>('student@example.test');"):screen==='quests'&&scenario==='reward'?source.replace(/} \| null>\(null\);(?=\s+const \[proofSubmissionError)/, "} | null>({ title: 'Review notes for tomorrow’s class', xp: 35, previousLevel: 2, progress: calculateLevel(210) });"):source;;
 };
 const load=file=>{if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(previewSource(baseline&&file.includes(path.join(mobile,'src'))?cp.execFileSync('git',['show','HEAD:mobile/'+path.relative(mobile,file).replaceAll('\\','/')],{cwd:path.dirname(mobile),encoding:'utf8'}):fs.readFileSync(file,'utf8'),file),{fileName:file,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name in dependencies)return dependencies[name];if(name.endsWith('.css'))return {};if(name==='react')return react;if(name==='nativewind')return {useColorScheme:()=>({colorScheme:scheme}),colorScheme:{set(){}},cssInterop:()=>{}};if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async()=>null,setItem:async()=>{}}};if(name==='expo-image')return {Image:({source,tintColor,contentFit,...props})=>React.createElement(RN.Image,{...props,source:source,tintColor})};if(name.endsWith('.png'))return {uri:'data:image/png;base64,'+Buffer.from(fs.readFileSync(path.resolve(path.dirname(file),name))).toString('base64')};if(name.endsWith('.svg'))return {uri:'data:image/svg+xml;base64,'+Buffer.from(fs.readFileSync(path.resolve(path.dirname(file),name))).toString('base64')};if(name==='react-native')return rn;if(name==='react/jsx-runtime')return require(name);if(name==='react-native-safe-area-context')return {SafeAreaView:rn.View,SafeAreaProvider:rn.View,useSafeAreaInsets:()=>({top:0,left:0,right:0,bottom:0})};if(name==='@expo/vector-icons')return {Ionicons:({name,size,color,...props})=>React.createElement(RN.Text,{...props,style:{fontFamily:'Ionicons',fontSize:size,color}},String.fromCodePoint(glyphs[name]||glyphs['ellipse-outline']))};if(name==='react-native-svg')return {__esModule:true,default:p=>React.createElement('svg',p),...Object.fromEntries(['Circle','ClipPath','Defs','G','Line','Path','Pattern','Polygon','Rect','Text'].map(tag=>[tag,p=>React.createElement(tag.toLowerCase(),p)]))};if(name==='react-native-reanimated')return {__esModule:true,default:{View:RN.View,createAnimatedComponent:component=>component},LayoutAnimationConfig:pass,LinearTransition:animation,FadeOutUp:animation,useAnimatedProps:fn=>fn(),useDerivedValue:fn=>({value:fn()}),useSharedValue:value=>({value}),useAnimatedStyle:fn=>fn(),Easing:{linear:x=>x,out:x=>x,inOut:x=>x,cubic:x=>x,quad:x=>x},ReduceMotion:{System:'system'},cancelAnimation(){},withRepeat:x=>x,withTiming:x=>x};if(name==='expo-image-picker'||name==='expo-document-picker')return {};if(name==='expo-linking')return {createURL:()=> 'beebetter://auth'};if(name==='@/hooks/use-color-scheme')return {useColorScheme:()=>scheme};if(name==='react-native-maps')return {__esModule:true,default:RN.View,Circle:RN.View,Marker:RN.View};if(name==='expo-router/ui')return {Tabs:RN.View,TabSlot:()=>null,TabList:RN.View,TabTrigger:({children,name})=>React.cloneElement(children,{isFocused:name===({home:'index',quests:'quests',profile:'profile',skills:'skill-tree'})[screen]})};if(name==='@/hooks/use-theme')return {useTheme:()=>load(path.join(mobile,'src/constants/theme.ts')).Colors[scheme]};
 const mocks=['@/hooks/use-user-data','@/context/user-data-context','@/context/quest-priority-context','@/context/location-context','@/hooks/use-enrollment-options','@/hooks/use-quest-categories','@/lib/wellbeing-data','@/lib/recommendation-events','@/lib/quest-notifications','expo-router'];if(mocks.includes(name)){const m=load(path.join(__dirname,'fixtures.tsx'));m.useLocalSearchParams=()=>({questId:detail});if(screen==='auth')m.data.access=scenario==='recovery'?'recovery_required':scenario==='checking'?'checking':scenario==='verification-error'?'verification_error':'signed_out';
if(!baseline && screen==='onboarding'){
 m.data.access='onboarding_required';
 m.data.registrationOwner='synthetic';
 m.data.registrationDraft={name:'Alex Reyes',student_number:'123456789',goal:'Build a steady study routine',existingStudent:true};
 if(scenario==='enrollment')m.data.registrationDraft.enrollment={semesterId:m.catalogue.options[0].semester_id,enrollmentOptionId:m.catalogue.options[0].id};
}
if((screen==='auth'||screen==='onboarding')&&m.catalogue){
 if(scenario.endsWith('loading'))Object.assign(m.catalogue,{options:[],status:'loading',loading:true});
 if(scenario.endsWith('empty'))Object.assign(m.catalogue,{options:[],status:'empty'});
 if(scenario.endsWith('error'))Object.assign(m.catalogue,{status:'error',error:'Student options could not be loaded. Please try again.'});
 if(scenario.endsWith('refresh'))Object.assign(m.catalogue,{isRefreshing:true});
 if(scenario==='verification-error')m.data.accessMessage='We could not verify your student account. Check your connection and retry.';
 if(scenario==='correction')m.data.registrationError='This student ID is unavailable. Check it or contact your administrator.';
}if(scenario==='partial')m.data.workspaceErrors={quests:'Could not refresh quests. Check your connection.',progress:'Could not refresh progress.'};if(scenario==='empty')m.qs.length=0;if(scenario==='long'){m.data.profile.display_name='Alexandra Reyes with a longer display name';m.qs[0].title='Prepare my reading notes and review the most important questions for the upcoming student discussion';}return m;}
 if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.join(mobile,'src',name.slice(2)):path.resolve(path.dirname(file),name);for(const ext of ['.web.tsx','.web.ts','.tsx','.ts','.js',''])if(fs.existsSync(base+ext)&&fs.statSync(base+ext).isFile())return load(base+ext);throw Error('Missing '+name)}return require(name);},window,console,setTimeout,clearTimeout,AbortController,URL,URLSearchParams,Date},{filename:file});return module.exports;};
 const files={settings:'app/settings/index.tsx',general:'app/settings/general.tsx',home:'app/(tabs)/index.tsx',quests:'app/(tabs)/quests.tsx',profile:'app/(tabs)/profile.tsx',skills:'app/(tabs)/skill-tree.tsx',create:'app/add-quest.tsx',checkin:'app/wellness-check-in.tsx',reflection:'app/self-management-reflection.tsx',history:'app/wellness-history.tsx',support:'app/support-requests.tsx',notifications:'app/notifications.tsx',auth:'app/auth.tsx',onboarding:baseline?'components/student-onboarding.tsx':'app/auth.tsx',places:'app/manage-locations.tsx'};
 const screenFile=screen==='checkin'&&!baseline?'components/daily-check-in.tsx':files[screen]||files.home;
 const mod=load(screen === 'library' ? path.join(__dirname,'library.tsx') : path.join(mobile,'src',screenFile));
 const Screen=screen==='checkin'&&!baseline ? () => {
  const {Sheet}=load(path.join(mobile,'src/components/mobile-ui.tsx'));
  return React.createElement(Sheet,{title:'Daily check-in',visible:true,expanded:true,onClose(){}},React.createElement(mod.DailyCheckIn,{studentId:'synthetic',day:new Date(),onClose(){},onHistory(){}}));
 } : mod.default||mod.StudentOnboarding;
 const frameModule = !baseline && load(path.join(mobile,'src/components/pixel/pixel-frame.tsx'));
 const frameScript = frameModule ? '<script>' + frameModule.pixelFrameOutline.toString() + '\n(' + paintPreviewFrames.toString() + ')(' + frameModule.pixelFramePaths.toString() + ');</script>' : '';
 const tabs=['home','quests','profile','skills'].includes(screen)&&!detail?load(path.join(mobile,'src/components/app-bottom-bar.tsx')).BottomNavigation:null;const html=ReactDOM.renderToStaticMarkup(React.createElement(React.Fragment,null,!baseline&&React.createElement(load(path.join(mobile,'src/components/hexagon-background.tsx')).HexagonBackground),React.createElement(Screen),tabs&&React.createElement(tabs,{active:({home:'index',quests:'quests'})[screen],onHome(){},onQuests(){},onCreate(){}})));const css=RN.StyleSheet.getSheet().textContent;
 return '<!doctype html><html class="'+scheme+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BeeBetter synthetic screen</title><link rel="stylesheet" href="/preview.css"><style>'+css+'@font-face{font-family:Ionicons;src:url(/ionicons.ttf)}@font-face{font-family:VT323-Regular;src:url(/vt323.ttf)}:root{--font-display:system-ui,sans-serif;--font-mono:monospace}html,body,#root{margin:0;min-height:100vh}#root{display:flex;flex-direction:column;position:relative;height:100vh}html{scrollbar-width:none}body{max-width:100%;width:'+width+'px;background:'+load(path.join(mobile,'src/constants/theme.ts'))[scheme==='dark'?'BeeBetterDarkColors':'BeeBetterColors'].background+'}</style></head><body><div id="root">'+html+'</div>'+frameScript+'</body></html>';
}
module.exports = { render };
async function start() {
 const postcss = require('postcss');
 const tailwind = require('tailwindcss');
 const cssFile = path.join(mobile, 'src/global.css');
 const css = await postcss([tailwind(path.join(mobile, 'tailwind.config.js'))]).process(
   fs.readFileSync(cssFile, 'utf8'), { from: cssFile });
 http.createServer((req,res)=>{
  if (req.url === '/preview.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(css.css);
    return;
  }
  if (req.url === '/vt323.ttf') {
    res.setHeader('Content-Type', 'font/ttf');
    res.end(fs.readFileSync(path.join(mobile, 'assets/fonts/VT323/VT323-Regular.ttf')));
    return;
  }
if(req.url==='/ionicons.ttf'){res.setHeader('Content-Type','font/ttf');res.end(fs.readFileSync(require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')));return}try{const q=new URL(req.url,'http://localhost').searchParams;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(render(q.get('screen')||'home',Number(q.get('width')||375),q.get('theme')||'light',Number(q.get('scale')||1),q.get('detail')||'',q.get('scenario')||'',q.get('baseline')==='1',Number(q.get('height')||812))); }catch(error){console.error(error.message);res.statusCode=500;res.end(error.stack)}}).listen(Number(process.env.UI_PREVIEW_PORT||8081),'127.0.0.1',()=>console.log('Static synthetic UI ready'));

}
if (require.main === module) start().catch(error => { console.error(error); process.exitCode = 1; });
