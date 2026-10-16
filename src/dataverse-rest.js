/* Mightora REST Studio – Dataverse single-file edition. MIT.
 * Reuses the public Swagger engine but only calls the signed-in Dataverse origin.
 * There is deliberately no token collection, proxy, telemetry or persistence.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const MAX_BODY=65536,MAX_RESPONSE=1024*1024,MAX_ROWS=50;
const LOGICAL=/^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const ALLOWED_METHODS=new Set(['GET','HEAD','POST','PATCH','DELETE']);
const SAFE_HEADERS=new Set(['prefer','if-match','if-none-match','accept-language','consistencylevel']);
let environment=null, active=null,tableCache=[],selected=null,imported=null,responseRaw='',responsePretty='',lastRequest=null;
const domready=()=>new Promise(resolve=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
function notify(message,isError=false){
 const el=$('responseStatus');el.textContent=message;el.style.color=isError?'#a42a2a':'#236355';
}
function setConnection(text,status=''){
 $('connection').textContent=text;$('connection').className='connection '+status;
}
function describe(error){
 let message=String(error&&error.message||error||'Unknown error').slice(0,700);
 // Never include response bodies in errors: these could contain customer records or tokens.
 if(/401/.test(message))message='401 — Dataverse session not available or expired. Reload your model-driven app and sign in again.';
 else if(/403/.test(message))message='403 — The current user is not permitted to access this data or action.';
 else if(/404/.test(message))message='404 — The API endpoint, table or record was not found.';
 return message;
}
function resolveContext(win=window){
 let gc=null;
 try{if(typeof win.GetGlobalContext==='function')gc=win.GetGlobalContext()}catch{}
 // Xrm is not generally available in a sitemap web resource. Use it only if
 // available in a trusted hosting context, never assume parent.Xrm works.
 if(!gc){try{const x=win.Xrm||win.parent?.Xrm;if(x?.Utility?.getGlobalContext)gc=x.Utility.getGlobalContext()}catch{}}
 if(!gc||typeof gc.getClientUrl!=='function')throw Error('Dataverse context unavailable. Upload this HTML as a Dataverse Webpage web resource and open it from a signed-in model-driven app. The Microsoft ClientGlobalContext.js.aspx helper must load successfully.');
 const clientUrl=new URL(gc.getClientUrl());
 const pageUrl=new URL(win.location.href);
 if(clientUrl.protocol!=='https:'||clientUrl.origin!==pageUrl.origin||!/(?:^|\/)WebResources\//i.test(decodeURIComponent(pageUrl.pathname))){
   throw Error('This page is not running as a same-origin Dataverse web resource. Live requests have been disabled.');
 }
 return {origin:clientUrl.origin,userId:String(gc.userSettings?.userId||'').replace(/[{}]/g,''),organization:gc.organizationSettings?.uniqueName||clientUrl.hostname};
}
function urlFor(raw,ctx=environment){
 if(!ctx)throw Error('Connect to Dataverse before sending a request.');
 const value=String(raw||'').trim();
 if(!value||value.length>3072)throw Error('Enter a Dataverse Web API endpoint no longer than 3,072 characters.');
 let url;
 try{url=new URL(value,ctx.origin)}catch{throw Error('Enter a valid Dataverse URL or relative /api/data/v9.2/ path.');}
 if(url.origin!==ctx.origin||url.protocol!=='https:'||url.username||url.password)
   throw Error('Only the current Dataverse environment is permitted; other sites and embedded credentials are blocked.');
 if(!/^\/api\/data\/v9\.2\/.+/i.test(url.pathname)||/%2f|%5c|(?:^|\/)\.\.(?:\/|$)/i.test(url.pathname))
   throw Error('Only URLs under /api/data/v9.2/ are supported. No other Microsoft services or endpoints are available.');
 if(/(?:\$batch)(?:\/|$)/i.test(url.pathname)||url.pathname.includes('\\'))
   throw Error('Batch and unusual request paths are not supported in this embedded tool.');
 if(/%7b|%7d|\{|\}/i.test(url.pathname))throw Error('Replace any Swagger {parameter} placeholder with a real record identifier.');
 return url;
}
function parseAdditionalHeaders(lines){
 if(String(lines).length>2200)throw Error('Too many additional headers.');
 const headers=new Headers();
 for(const line of String(lines).split(/\r?\n/)){
   if(!line.trim())continue;
   const ix=line.indexOf(':');if(ix<=0)throw Error('Header must be entered as Name: value.');
   const key=line.slice(0,ix).trim(),value=line.slice(ix+1).trim();
   if(!SAFE_HEADERS.has(key.toLowerCase()))throw Error('Header '+key+' is not allowed. Only Prefer, If-Match, If-None-Match, Accept-Language and ConsistencyLevel are supported.');
   if(value.length>450||/[\r\n]/.test(value))throw Error('Invalid header value.');
   headers.set(key,value);
 }
 return headers;
}
function buildHeaders(raw=''){
 const headers=parseAdditionalHeaders(raw);
 headers.set('Accept','application/json');
 headers.set('OData-Version','4.0');
 headers.set('OData-MaxVersion','4.0');
 if(!headers.has('Prefer'))headers.set('Prefer','odata.maxpagesize=50');
 return headers;
}
async function readLimited(res){
 if(!res.body)return '';
 const reader=res.body.getReader(),parts=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
   if(total+value.length>MAX_RESPONSE){parts.push(value.subarray(0,MAX_RESPONSE-total));total=MAX_RESPONSE;await reader.cancel().catch(()=>{});break;}
   parts.push(value);total+=value.length;}}
 finally{reader.releaseLock()}
 const buffer=new Uint8Array(total);let off=0;
 for(const part of parts){buffer.set(part,off);off+=part.length}
 return new TextDecoder().decode(buffer)+(total===MAX_RESPONSE?'\n[Output capped at 1 MiB]':'');
}
async function request({method='GET',url,body='',headersText='',confirmWrite=true},onResponse=null){
 const httpMethod=String(method).toUpperCase();if(!ALLOWED_METHODS.has(httpMethod))throw Error('Unsupported HTTP method.');
 if(active)throw Error('A request is already running. Cancel it first.');
 const target=urlFor(url),text=String(body||'');
 if(new TextEncoder().encode(text).length>MAX_BODY)throw Error('Body exceeds the 64 KiB safety limit.');
 if(['GET','HEAD','DELETE'].includes(httpMethod)&&text.trim())throw Error('GET, HEAD and DELETE do not accept a request body in REST Studio.');
 const headers=buildHeaders(headersText);
 const isWrite=['POST','PATCH','DELETE'].includes(httpMethod);
 if(isWrite&&confirmWrite){
   const confirmation=window.prompt(
     'LIVE DATAVERSE WRITE\n'+httpMethod+' '+target.pathname+'\nThis could change or remove data under your current permissions.\nType EXECUTE to continue.');
   if(confirmation!=='EXECUTE')throw Error('Write cancelled. No request was sent.');
 }
 if((httpMethod==='POST'||httpMethod==='PATCH')&&text.trim()){
   try{JSON.parse(text)}catch{throw Error('POST/PATCH body must be valid JSON.')}
   headers.set('Content-Type','application/json');
   // Prevent an accidental UPSERT when updating by PATCH.
   if(httpMethod==='PATCH'&&!headers.has('If-Match'))headers.set('If-Match','*');
 }
 // Read-only data previews are capped to reduce accidental large queries.
 if(httpMethod==='GET'&&!target.searchParams.has('$top')&&
    !/\/(?:\$metadata|WhoAmI\(\)|RetrieveVersion\(\))$/i.test(target.pathname))
   target.searchParams.set('$top',String(MAX_ROWS));
 const abort=new AbortController();active=abort;
 const timeout=setTimeout(()=>abort.abort(),25000);
 try{
   const started=performance.now();
   const result=await fetch(target.href,{method:httpMethod,headers,body:['POST','PATCH'].includes(httpMethod)&&text.trim()?text:undefined,
     credentials:'same-origin',mode:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal,referrerPolicy:'no-referrer'});
   const raw=await readLimited(result);
   const details={status:result.status,ok:result.ok,raw,method:httpMethod,url:target.href,time:Math.round(performance.now()-started),headers:[...result.headers.entries()]};
   if(onResponse)onResponse(details);
   if(!result.ok)throw Error('HTTP '+result.status+' — The request was rejected by Dataverse. See the response panel for safe details.');
   return details;
 }finally{clearTimeout(timeout);active=null;}
}
function format(text){try{return JSON.stringify(JSON.parse(text),null,2)}catch{return text}}
function show(details){
 responseRaw=details.raw;responsePretty=format(details.raw);lastRequest=details;
 $('response').textContent=responsePretty||'(empty response)';
 $('requestDiagnostics').textContent=details.method+' · '+details.status+' · '+details.time+' ms · '+new TextEncoder().encode(details.raw).length+' bytes';
 notify('HTTP '+details.status+(details.ok?' · success':' · denied or invalid'),!details.ok);
}
function setPending(pending){$('send').disabled=pending||!environment;$('cancel').disabled=!pending;$('discover').disabled=pending||!environment;}
function setSample(key){
 const samples={
  whoami:['GET','/api/data/v9.2/WhoAmI()'],
  version:['GET','/api/data/v9.2/RetrieveVersion()'],
  tables:['GET','/api/data/v9.2/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName&$top=20'],
  accounts:['GET','/api/data/v9.2/accounts?$select=name,accountid&$top=10'],
  contacts:['GET','/api/data/v9.2/contacts?$select=fullname,contactid&$top=10']
 };
 if(!samples[key])return;
 $('method').value=samples[key][0];$('endpoint').value=samples[key][1];$('body').value='';$('headerText').value='';
 notify('Sample loaded — press Send request.');
}
async function runClick(){
 setPending(true);notify('Sending…');
 try{
  const method=$('method').value,endpoint=$('endpoint').value,body=$('body').value,headersText=$('headerText').value;
  const result=await request({method,url:endpoint,body,headersText},show);
  if(!result)notify('Nothing was sent.');
 }catch(error){notify(describe(error),true);$('requestDiagnostics').textContent=describe(error);}
 finally{setPending(false);}
}
function setTables(items){
 tableCache=items.slice(0,75);filterTables();
}
function friendly(table){
 const display=table?.DisplayName?.UserLocalizedLabel?.Label||table?.DisplayName?.LocalizedLabels?.[0]?.Label||table.LogicalName||'(unknown)';
 return display===table.LogicalName?display:display+' · '+table.LogicalName;
}
function filterTables(){
 const needle=$('tableFilter').value.trim().toLowerCase(),select=$('tables');select.replaceChildren();
 for(const row of tableCache){
  if(!row.LogicalName||!LOGICAL.test(row.LogicalName))continue;
  const label=friendly(row);
  if(needle&&!label.toLowerCase().includes(needle))continue;
  const option=document.createElement('option');option.value=row.LogicalName;option.textContent=label;select.append(option);
 }
 selected=null;for(const id of ['tableQuery','columns','relationships'])$(id).disabled=true;
}
function getSelected(){const key=$('tables').value;return tableCache.find(v=>v.LogicalName===key)||null}
function setSelected(){
 selected=getSelected();const has=!!selected;
 $('selectedTableName').textContent=has?friendly(selected):'Select a table';
 $('tableDetail').textContent=has?'Entity set: '+(selected.EntitySetName||'not provided'):'Choose a table to see its details.';
 for(const id of ['tableQuery','columns','relationships'])$(id).disabled=!has;
 $('metadata').textContent=has?JSON.stringify({logicalName:selected.LogicalName,entitySetName:selected.EntitySetName,
   displayName:selected.DisplayName?.UserLocalizedLabel?.Label},null,2):'Table details appear here.';
}
async function discover(){
 $('discover').disabled=true;$('discoveryStatus').textContent='Loading metadata…';
 try{
  const x=await request({url:'/api/data/v9.2/EntityDefinitions?$select=LogicalName,EntitySetName,DisplayName&$top=75',confirmWrite:false});
  const parsed=JSON.parse(x.raw);setTables(Array.isArray(parsed.value)?parsed.value:[]);
  $('discoveryStatus').textContent='Loaded '+tableCache.length+' table definitions. Search or select a table.';
 }catch(e){$('discoveryStatus').textContent=describe(e);}
 finally{$('discover').disabled=!environment;}
}
async function metadata(kind){
 if(!selected||!LOGICAL.test(selected.LogicalName))return;
 const logical=selected.LogicalName;
 let endpoint;
 if(kind==='columns')endpoint="/api/data/v9.2/EntityDefinitions(LogicalName='"+logical+"')/Attributes?$select=LogicalName,DisplayName,AttributeType&$top=75";
 else endpoint="/api/data/v9.2/EntityDefinitions(LogicalName='"+logical+"')/ManyToOneRelationships?$select=SchemaName,ReferencedEntity,ReferencingAttribute&$top=50";
 $('discoveryStatus').textContent='Loading '+kind+'…';
 try{
  const x=await request({url:endpoint});
  const values=JSON.parse(x.raw).value||[];
  const list=values.slice(0,75).map(v=>kind==='columns'
    ? {name:v.DisplayName?.UserLocalizedLabel?.Label||v.LogicalName,logicalName:v.LogicalName,type:v.AttributeType}
    :{schemaName:v.SchemaName,relatedTable:v.ReferencedEntity,field:v.ReferencingAttribute});
  $('metadata').textContent=JSON.stringify(list,null,2);
  $('discoveryStatus').textContent=list.length+' '+kind+' found (first page only).';
 }catch(e){$('discoveryStatus').textContent=describe(e);}
}
function useTable(){
 if(!selected)return;
 if(!selected.EntitySetName||!LOGICAL.test(selected.EntitySetName)){
   $('discoveryStatus').textContent='This table has no readable collection name in its metadata.';return;
 }
 $('method').value='GET';
 $('endpoint').value='/api/data/v9.2/'+selected.EntitySetName+'?$top=10';
 $('body').value='';$('headerText').value='';
 document.getElementById('request').scrollIntoView({block:'start'});
 notify('Table query prepared. Click Send request.');
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);notify('Copied to clipboard');}
 catch{notify('Clipboard blocked. Select the text manually.');}
}
function download(contents,name,kind){
 const blob=new Blob([contents],{type:kind});
 const blobUrl=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=blobUrl;link.download=name;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(blobUrl),1500);
}
function curl(){
 try{
  const url=urlFor($('endpoint').value);
  const method=$('method').value;const q=x=>"'"+String(x).replace(/'/g,"'\\''")+"'";
  let command='curl -X '+method+' '+q(url.href)+' -H '+q('Accept: application/json');
  if(['POST','PATCH'].includes(method)&&$('body').value.trim())command+=' -H '+q('Content-Type: application/json')+' --data '+q($('body').value);
  // Authentication intentionally omitted; a browser session is not a cURL credential.
  return '# Authentication intentionally omitted; do not copy session cookies.\n'+command;
 }catch(e){return '# '+describe(e);}
}
function loadSwagger(){
 const idx=Number($('swaggerOps').value);if(!imported||!Number.isInteger(idx))return;
 const op=imported.operations[idx];if(!op)return;
 if(!/^https?:/i.test(op.request.url))return;
 let input=op.request.url;
 for(const param of op.pathParams||[]){
  const answer=prompt('Supply a Dataverse value for '+param.key,param.value||'');
  if(answer===null)return;if(!answer.trim()){ $('swaggerStatus').textContent='Provide all path parameters.';return;}
  input=input.replace('{'+param.key+'}',encodeURIComponent(answer.trim()));
 }
 try{
  const target=urlFor(input);$('method').value=op.request.method;
  $('endpoint').value=target.href;
  $('body').value=op.request.body||'';
  $('headerText').value=(op.request.headers||[]).filter(x=>SAFE_HEADERS.has(x.key.toLowerCase())).map(x=>x.key+': '+x.value).join('\n');
  $('swaggerStatus').textContent='Operation loaded from Swagger. Review before sending.';
  $('request').scrollIntoView({block:'start'});
 }catch(e){$('swaggerStatus').textContent='Imported operation is not on this Dataverse environment: '+describe(e);}
}
async function importSwagger(event){
 const file=event.target.files?.[0];if(!file)return;
 const select=$('swaggerOps');select.replaceChildren();
 try{
  if(file.size>2*1024*1024)throw Error('Swagger file exceeds 2 MiB.');
  const text=await file.text();
  imported=window.MightoraSwagger.importSwagger(text);
  for(const [i,op] of imported.operations.entries()){
   const option=document.createElement('option');option.value=String(i);option.textContent=op.method+' '+op.path+' · '+op.label;select.append(option);
  }
  select.disabled=false;$('loadSwagger').disabled=false;
  $('swaggerStatus').textContent='Loaded '+imported.operations.length+' operations from '+imported.title+'. External API hosts cannot be called from this Dataverse edition.';
 }catch(e){imported=null;select.disabled=true;$('loadSwagger').disabled=true;$('swaggerStatus').textContent=describe(e);}
 finally{event.target.value='';}
}
function exportSwagger(yaml=false){
 try{
  const target=urlFor($('endpoint').value);
  const obj={method:$('method').value,url:target.href,headers:[],params:[],body:$('body').value,
    bodyType:$('body').value.trim()?'json':'none'};
  const output=window.MightoraSwagger.exportSwagger([obj],$('swaggerTitle').value.trim()||'Dataverse REST Studio API');
  const data=yaml?window.jsyaml.dump(output.doc,{noRefs:true}):JSON.stringify(output.doc,null,2);
  download(data,'Mightora-REST-Dataverse-Swagger-2.0.'+(yaml?'yaml':'json'),yaml?'text/yaml':'application/json');
  $('swaggerStatus').textContent='Exported a request-based Swagger 2.0 starter definition for the current environment.';
 }catch(e){$('swaggerStatus').textContent=describe(e);}
}
async function initialise(){
 // The Dataverse-provided ClientGlobalContext.js.aspx executes before this script;
 // Xrm is deliberately not assumed to exist in sitemap navigation web resources.
 try{
  environment=resolveContext();
  $('environment').textContent=environment.origin;
  $('userInfo').textContent=environment.userId?'Current user: '+environment.userId:'Signed-in user session';
  setConnection('Connected to Dataverse','connected');
  $('discoveryStatus').textContent='Connected. Select Discover tables to read metadata.';
  setPending(false);
 }catch(e){setConnection('Connection unavailable','failed');$('environment').textContent='Not in a supported Dataverse host';$('requestDiagnostics').textContent=describe(e);setPending(false);}
 $('send').addEventListener('click',runClick);
 $('cancel').addEventListener('click',()=>active?.abort());
 $('sample').addEventListener('change',e=>setSample(e.target.value));
 $('discover').addEventListener('click',discover);
 $('tableFilter').addEventListener('input',filterTables);
 $('tables').addEventListener('change',setSelected);
 $('columns').addEventListener('click',()=>metadata('columns'));
 $('relationships').addEventListener('click',()=>metadata('relationships'));
 $('tableQuery').addEventListener('click',useTable);
 $('format').addEventListener('click',()=>{$('response').textContent=responsePretty||'(no response yet)'});
 $('raw').addEventListener('click',()=>{$('response').textContent=responseRaw||'(no response yet)'});
 $('copyResponse').addEventListener('click',()=>copy($('response').textContent));
 $('downloadResponse').addEventListener('click',()=>download($('response').textContent,'dataverse-response.txt','text/plain'));
 $('copyCurl').addEventListener('click',()=>copy(curl()));
 $('clear').addEventListener('click',()=>{
  $('endpoint').value='/api/data/v9.2/WhoAmI()';$('method').value='GET';$('body').value='';$('headerText').value='';
  $('response').textContent='Workspace cleared. No data was saved.';notify('Ready');
 });
 $('swaggerFile').addEventListener('change',importSwagger);
 $('swaggerOps').addEventListener('change',()=>{$('loadSwagger').disabled=!$('swaggerOps').value});
 $('loadSwagger').addEventListener('click',loadSwagger);
 $('exportSwaggerJson').addEventListener('click',()=>exportSwagger(false));
 $('exportSwaggerYaml').addEventListener('click',()=>exportSwagger(true));
}
window.MightoraDataverseRest=Object.freeze({resolveContext,urlFor,parseAdditionalHeaders,request});
domready().then(initialise).catch(e=>{if($('connection'))setConnection('Unable to initialise','failed');});
})();
