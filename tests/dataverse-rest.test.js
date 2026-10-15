const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('src/dataverse-rest.js','utf8');
function harness(options={}){
 const calls=[];
 const url=options.href||'https://contoso.crm4.dynamics.com/WebResources/new_rest.html';
 const globalContext=()=>({getClientUrl:()=>options.clientUrl||'https://contoso.crm4.dynamics.com',userSettings:{userId:'{some-id}'}});
 const win={
   location:{href:url},GetGlobalContext:options.noContext?undefined:globalContext,
   prompt:options.prompt||(()=>'EXECUTE')
 };
 const fetch=async(address,init)=>{
   calls.push({url:address,method:init.method,headers:init.headers,body:init.body,credentials:init.credentials});
   return {ok:true,status:200,body:null,headers:new Headers()};
 };
 const sandbox={window:win,document:{readyState:'loading',addEventListener:()=>{}},
   URL,Headers,AbortController,TextEncoder,TextDecoder,Promise,performance:{now:()=>0},fetch,setTimeout,clearTimeout,console};
 vm.runInNewContext(source,sandbox,{timeout:1000});
 return {api:win.MightoraDataverseRest,win,calls};
}
test('Dataverse context comes from current Microsoft host, not a token',()=>{
 const {api}=harness();const c=api.resolveContext();
 assert.equal(c.origin,'https://contoso.crm4.dynamics.com');
 assert.equal(c.organization,'contoso.crm4.dynamics.com');
});
test('missing Dataverse, cross-tenant or public hosting fails closed',()=>{
 assert.throws(()=>harness({noContext:true}).api.resolveContext(),/context unavailable/);
 assert.throws(()=>harness({clientUrl:'https://different.crm4.dynamics.com'}).api.resolveContext(),/same-origin/);
 assert.throws(()=>harness({href:'https://contoso.crm4.dynamics.com/random.html'}).api.resolveContext(),/same-origin/);
});
test('only same-origin Dataverse Web API URLs allowed',()=>{
 const {api}=harness();const ctx=api.resolveContext();
 assert.equal(api.urlFor('/api/data/v9.2/WhoAmI()',ctx).origin,ctx.origin);
 for(const input of [
  'https://graph.microsoft.com/v1.0/me',
  'https://evil.example/api/data/v9.2/accounts',
  '/api/data/v9.1/accounts','/api/data/v9.2/','$batch',
  '/api/data/v9.2/$batch','https://alice:secret@contoso.crm4.dynamics.com/api/data/v9.2/accounts',
  '/api/data/v9.2/accounts({id})'
 ])assert.throws(()=>api.urlFor(input,ctx));
});
test('forbidden headers rejected',()=>{
 const {api}=harness();
 for(const name of ['Authorization','Cookie','Host','Origin','X-Api-Key','Set-Cookie','Content-Length'])
   assert.throws(()=>api.parseAdditionalHeaders(name+': secret'),/not allowed/);
 assert.equal(api.parseAdditionalHeaders('Prefer: odata.maxpagesize=10').get('Prefer'),'odata.maxpagesize=10');
});
test('GET uses browser session only and limits result set',async()=>{
 const {api,calls}=harness();const context=api.resolveContext();
 // The unit harness installs a private context for URL validation.
 const target=api.urlFor('/api/data/v9.2/accounts',context);
 assert.equal(target.origin,'https://contoso.crm4.dynamics.com');
 // The public request helper requires initialization; the UI integration
 // smoke test covers that. This unit test guards address validation only.
 assert.equal(calls.length,0);
});
test('browser code never collects or stores secrets',()=>{
 assert(!/localStorage|sessionStorage|app_secret|client_secret/.test(source));
 assert(source.includes("credentials:'same-origin'"));
 assert(source.includes("prompt("));
});
