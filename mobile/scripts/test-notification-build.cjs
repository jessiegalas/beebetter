const fs=require('fs');
const cp=require('child_process');
const os=require('os');
const path=require('path');
const assert=require('assert/strict');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'beebetter-push-build-'));
const config=path.resolve('app.config.js');
const base={...process.env,EAS_BUILD_PLATFORM:'android',EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:'test'};
delete base.GOOGLE_SERVICES_JSON;
function load(env) { const result=cp.spawnSync(process.execPath,['-e','require('+JSON.stringify(config)+')'],{env,encoding:'utf8'}); if(result.error) throw result.error; return result; }
try {
 assert.notEqual(load(base).status,0,'cloud Android build without file must fail');
 const file=path.join(scratch,'firebase.json');
 fs.writeFileSync(file,'{broken');
 assert.notEqual(load({...base,GOOGLE_SERVICES_JSON:file}).status,0,'malformed file must fail');
 fs.writeFileSync(file,JSON.stringify({client:[{client_info:{android_client_info:{package_name:'wrong.package'}}}]}));
 assert.notEqual(load({...base,GOOGLE_SERVICES_JSON:file}).status,0,'wrong package must fail');
 fs.writeFileSync(file,JSON.stringify({client:[{client_info:{android_client_info:{package_name:'com.anonymous.beebetter'}}}]}));
 assert.equal(load({...base,GOOGLE_SERVICES_JSON:file}).status,0,'matching file must load');
 const local={...base}; delete local.EAS_BUILD_PLATFORM;
 assert.equal(load(local).status,0,'local ignored-file fallback must remain supported');
 console.log('PASS cloud Firebase file requirement, corruption, package matching and local fallback');
} finally { fs.rmSync(scratch,{recursive:true,force:true}); }
