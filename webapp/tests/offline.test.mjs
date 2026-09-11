import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

test('cached modules load despite Vary: Origin and private API requests bypass the worker',async()=>{
 const handlers={},cached={ok:true,body:'cached-module'};
 const source=(await fs.readFile('public/workspace-sw.js','utf8')).replace("['__PRECACHE__']",JSON.stringify(['index.html','assets/app.js']));
 vm.runInNewContext(source,{URL,self:{location:new URL('https://example.test/EIA_toolkitt/workspace-sw.js'),addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({match:async(_url,options)=>options?.ignoreVary?cached:undefined})},fetch:async()=>{throw new Error('Origin unreachable')}});
 let response;
 handlers.fetch({request:{url:'https://example.test/EIA_toolkitt/assets/app.js',method:'GET',mode:'cors'},respondWith:p=>response=p});
 assert.equal(await response,cached);
 let intercepted=false;
 handlers.fetch({request:{url:'https://example.supabase.co/rest/v1/projects',method:'GET',mode:'cors'},respondWith:()=>intercepted=true});
 assert.equal(intercepted,false);
});
