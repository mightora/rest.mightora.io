/* Mightora REST Studio — MIT licence. All request and collection operations are local. */
(() => {
  'use strict';
  const offline = window.MIGHTORA_OFFLINE === true;
  const widget = new URLSearchParams(location.search).get('mode') === 'widget';
  const $ = id => document.getElementById(id);
  const METHOD_WITHOUT_BODY = new Set(['GET', 'HEAD']);
  const SENSITIVE = /authorization|cookie|password|secret|token|api[-_]?key|x-auth/i;
  const MAX_RESPONSE = 2 * 1024 * 1024;
  const STORAGE = 'mightora-rest-studio-v1';
  const DEMO = 'local://demo';
  const sampleData = {
    local:{method:'GET',url:DEMO,params:[{key:'sample',value:'true'}],headers:[],body:'',bodyType:'none'},
    github:{method:'GET',url:'https://api.github.com/repos/mightora/shared-ui',params:[],headers:[{key:'Accept',value:'application/vnd.github+json'}],body:'',bodyType:'none'},
    jsonplaceholder:{method:'GET',url:'https://jsonplaceholder.typicode.com/posts/1',params:[],headers:[],body:'',bodyType:'none'},
    dataverse:{method:'GET',url:'https://YOUR-ORG.crm4.dynamics.com/api/data/v9.2/accounts',params:[{key:'$top',value:'5'},{key:'$select',value:'name,accountid'}],headers:[{key:'Accept',value:'application/json'},{key:'OData-Version',value:'4.0'}],body:'',bodyType:'none'},
    graph:{method:'GET',url:'https://graph.microsoft.com/v1.0/me',params:[],headers:[{key:'Accept',value:'application/json'}],body:'',bodyType:'none'}
  };
  let state = structuredClone(sampleData.local);
  let saved = [];
  let controller = null;
  let response = {raw:'',headers:'',pretty:'',status:0};
  let responseView = 'pretty';
  let activeTab = 'params';
  let urlBase = '';
  const appUrl = location.href.split('?')[0].split('#')[0];
  // Offline files still show a working hosted embed example; about:blank is used by some test harnesses.
  let widgetUrl;
  try { widgetUrl = offline ? 'https://rest.mightora.io/widget.js' : new URL('widget.js', appUrl).href; }
  catch { widgetUrl = 'https://rest.mightora.io/widget.js'; }
  const snippet = `<script src="${widgetUrl}" defer>` + String.fromCharCode(60) + "/script>";

  function notify(message, kind = 'info') {
    $('statusText').textContent = message;
    $('statusText').style.color = kind === 'error' ? '#a64c2b' : '';
  }
  function parseRows(values) {
    return Array.isArray(values) ? values.slice(0,60).map(p => ({key:String(p.key||'').slice(0,200),value:String(p.value||'').slice(0,8000)})) : [];
  }
  function safePayload(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid request object');
    const method = String(data.method || 'GET').toUpperCase();
    if (!['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(method)) throw new Error('Unsupported method');
    return {method,url:String(data.url||'').slice(0,3000),params:parseRows(data.params),headers:parseRows(data.headers),body:String(data.body||'').slice(0,300000),bodyType:['json','text','none'].includes(data.bodyType)?data.bodyType:'none'};
  }
  function safeSaved(data) {
    const safe = safePayload(data);
    safe.headers = safe.headers.filter(h => !SENSITIVE.test(h.key));
    safe.params = safe.params.filter(p => !SENSITIVE.test(p.key));
    safe.url = cleanUrl(safe.url);
    return safe;
  }
  function cleanUrl(value){
    try {const url = new URL(value);for(const name of [...url.searchParams.keys()])if(SENSITIVE.test(name))url.searchParams.delete(name);return url.toString();}catch{return value.replace(/([?&])([^=&]*(?:token|key|secret|password)[^=&]*)=([^&#]*)/ig,'$1$2=REDACTED');}
  }
  function readSaved(){
    try{const entries = JSON.parse(localStorage.getItem(STORAGE)||'[]');saved = Array.isArray(entries)?entries.slice(0,60).map(safeSaved):[];}catch{saved=[];}
  }
  function persist(){
    try{localStorage.setItem(STORAGE,JSON.stringify(saved));}catch{notify('Browser storage unavailable; use export instead.','error');}
  }
  function renderRows(kind){
    const host = $(kind+'Rows');host.replaceChildren();
    for(const [index,item] of state[kind].entries()){
      const row=document.createElement('div');row.className='kv-row';
      const key=document.createElement('input');key.placeholder=kind==='params'?'Parameter':'Header';key.value=item.key;key.setAttribute('aria-label', `${kind} key ${index+1}`);key.addEventListener('input',()=>{state[kind][index].key=key.value;});
      const val=document.createElement('input');val.placeholder='Value';val.value=item.value;val.setAttribute('aria-label', `${kind} value ${index+1}`);val.addEventListener('input',()=>{state[kind][index].value=val.value;});
      const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Remove row';del.setAttribute('aria-label',`Remove ${kind} row ${index+1}`);del.addEventListener('click',()=>{state[kind].splice(index,1);renderRows(kind);});
      row.append(key,val,del);host.append(row);
    }
    if (!state[kind].length) { const p=document.createElement('p');p.className='field-help';p.textContent='No '+kind+' added';host.append(p); }
  }
  function syncURL(){
    state.url=$('url').value.trim();
  }
  function render(){
    $('method').value=state.method;$('url').value=state.url;$('bodyType').value=state.bodyType;$('body').value=state.body;
    $('body').disabled=state.bodyType==='none';
    renderRows('params');renderRows('headers');
    renderAuthFields();
    $('requestDetail').textContent=state.method+' request';
    renderSaved();
  }
  function renderAuthFields(){
    const type=$('authType').value;const host=$('authFields');host.replaceChildren();
    let fields=[];
    if(type==='bearer')fields=[['authToken','Access token','password']];
    if(type==='basic')fields=[['authUser','Username','text'],['authPass','Password','password']];
    if(type==='apikey')fields=[['authKeyName','Header name','text'],['authKeyValue','API key','password']];
    for(const [id,name,inputType] of fields){const row=document.createElement('div');row.className='auth-row';const label=document.createElement('label');label.className='field-label';label.htmlFor=id;label.textContent=name;const input=document.createElement('input');input.id=id;input.type=inputType;input.autocomplete='off';input.placeholder=name;if(id==='authKeyName')input.value='X-API-Key';row.append(label,input);host.append(row);}
  }
  function currentState(){syncURL();state.method=$('method').value;state.body=$('body').value;state.bodyType=$('bodyType').value;return safePayload(state);}
  function loadRequest(data){state=safePayload(data);$('authType').value='none';render();notify('Ready to send');}
  function selectTab(name){activeTab=name;document.querySelectorAll('[data-tab]').forEach(btn=>{const yes=btn.dataset.tab===name;btn.classList.toggle('active',yes);btn.setAttribute('aria-selected',String(yes));});document.querySelectorAll('.tab-content').forEach(el=>el.hidden=el.id!=='view-'+name);}
  function changeResponse(view){responseView=view;document.querySelectorAll('[data-response]').forEach(btn=>{const yes=btn.dataset.response===view;btn.classList.toggle('active',yes);btn.setAttribute('aria-selected',String(yes));});$('responseOutput').textContent=response[view] || (response.raw?'(empty)':'No response yet');}
  function renderSaved(){const list=$('savedList');list.replaceChildren();if(!saved.length){const li=document.createElement('li');li.textContent='Nothing saved yet.';list.append(li);return;}
    for(const [index,data] of saved.entries()){
      const li=document.createElement('li');const open=document.createElement('button');open.type='button';open.textContent=`${data.method} ${data.url.slice(0,65)}`;open.addEventListener('click',()=>{loadRequest(data);selectTab('params');});const del=document.createElement('button');del.type='button';del.textContent='Delete';del.setAttribute('aria-label','Delete saved request '+(index+1));del.addEventListener('click',()=>{saved.splice(index,1);persist();renderSaved();});li.append(open,del);list.append(li);
    }
  }
  function makeHeaders(){
    const headers=new Headers();
    for(const h of state.headers){if(h.key.trim()){if(/^(host|origin|content-length|cookie|set-cookie)$/i.test(h.key.trim())) throw Error('The browser controls the '+h.key+' header. Remove it and retry.');headers.set(h.key.trim(),h.value);}}
    const auth=$('authType').value;
    if(auth==='bearer' && $('authToken')?.value)headers.set('Authorization','Bearer '+$('authToken').value);
    if(auth==='basic'){
      const user=$('authUser')?.value||'',pass=$('authPass')?.value||'';
      if(user||pass){const binary=new TextEncoder().encode(user+':'+pass);headers.set('Authorization','Basic '+btoa([...binary].map(x=>String.fromCharCode(x)).join('')));}
    }
    if(auth==='apikey' && $('authKeyValue')?.value)headers.set($('authKeyName')?.value||'X-API-Key',$('authKeyValue').value);
    if(!METHOD_WITHOUT_BODY.has(state.method) && state.bodyType==='json' && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
    return headers;
  }
  function finalURL(){
    const value=state.url.trim();if(value===DEMO)return value;
    const url=new URL(value);
    if(url.protocol!=='https:' && url.protocol!=='http:')throw Error('Only http:// and https:// URLs are supported.');
    if(url.username||url.password)throw Error('Credentials in URLs are not supported. Use the Auth tab instead.');
    for(const item of state.params)if(item.key.trim())url.searchParams.set(item.key,item.value);
    return url.href;
  }
  function displayError(error){
    let msg=error?.message||String(error);
    if(error?.name==='TypeError' && /fetch|network|load/i.test(msg))msg+='\n\nPossible causes: CORS / preflight restrictions, DNS, mixed HTTP/HTTPS content, a blocked request, missing VPN access or an unreachable server. Inspect DevTools → Network and your API’s CORS response headers.';
    $('requestError').textContent=msg;$('requestError').hidden=false;notify('Request failed','error');
  }
  function showResponse(raw,headerText,status,duration,bytes){
    let pretty=raw;try{pretty=JSON.stringify(JSON.parse(raw),null,2);}catch{}
    response={raw,pretty,headers:headerText,status};$('requestError').hidden=true;
    $('metricStatus').textContent='Status: '+status;$('metricTime').textContent='Time: '+duration+' ms';$('metricSize').textContent='Size: '+bytes.toLocaleString()+' bytes';
    changeResponse(responseView);
    notify(status>=200&&status<400?'Request complete':'HTTP response received');
  }
  async function readBodyLimited(res){
    if(!res.body)return '';
    const reader=res.body.getReader();let result=[];let size=0;let clipped=false;
    try{while(true){const {done,value}=await reader.read();if(done)break;const remaining=MAX_RESPONSE-size;if(remaining<=0){clipped=true;break;}result.push(value.slice(0,remaining));size+=Math.min(remaining,value.length);if(value.length>remaining){clipped=true;break;}}}
    finally{if(clipped)await reader.cancel().catch(()=>{});reader.releaseLock();}
    const merged=new Uint8Array(size);let offset=0;for(const buf of result){merged.set(buf,offset);offset+=buf.length;}
    return new TextDecoder().decode(merged)+(clipped?'\n[Response truncated at 2 MiB]':'');
  }
  async function send(){
    $('requestError').hidden=true;
    state=currentState();
    let url;
    try{url=finalURL();}catch(error){displayError(error);return;}
    if(url===DEMO){const result={message:'Mightora local demo — no network request was made',success:true,method:state.method,query:Object.fromEntries(state.params.filter(x=>x.key).map(x=>[x.key,x.value])),timestamp:'local simulation',features:['HTTP request builder','JSON formatter','Saved collections','Offline edition']};showResponse(JSON.stringify(result), 'Content-Type: application/json\nX-Mightora-Demo: local-only',200,0,JSON.stringify(result).length);return;}
    if(offline){displayError(Error('Offline mode blocks network requests by design (Content-Security-Policy: connect-src none). Use the hosted app for live API testing, or load the Local Demo sample.'));return;}
    if(!url){displayError(Error('Enter an HTTP or HTTPS URL.'));return;}
    let headers;try{headers=makeHeaders();}catch(err){displayError(err);return;}
    if(!METHOD_WITHOUT_BODY.has(state.method)&&state.bodyType==='json'&&state.body.trim()){
      try{JSON.parse(state.body);}catch(err){displayError(Error('Invalid JSON request body: '+err.message));return;}
    }
    controller=new AbortController();
    const timer=setTimeout(()=>controller?.abort(),30000);
    $('sendRequest').disabled=true;$('cancelRequest').hidden=false;notify('Requesting…');
    const start=performance.now();
    try{
      const options={method:state.method,headers,mode:'cors',credentials:'omit',redirect:'follow',signal:controller.signal,cache:'no-store'};
      if(!METHOD_WITHOUT_BODY.has(state.method) && state.bodyType!=='none')options.body=state.body;
      const res=await fetch(url,options);
      const raw=await readBodyLimited(res);const contentLength=new TextEncoder().encode(raw).length;
      showResponse(raw,[...res.headers.entries()].map(([k,v])=>k+': '+v).join('\n'),res.status,Math.round(performance.now()-start),contentLength);
    }catch(error){displayError(error?.name==='AbortError'?Error('Request cancelled or timed out after 30 seconds.'):error);}
    finally{clearTimeout(timer);controller=null;$('sendRequest').disabled=false;$('cancelRequest').hidden=true;refreshNetwork();}
  }
  function curlString(){
    state=currentState();const url=finalURL();const escape=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";
    const parts=['curl','-X',state.method,escape(url)];
    const headers=makeHeaders();headers.forEach((value,key)=>{parts.push('-H',escape(key+': '+value));});
    if(!METHOD_WITHOUT_BODY.has(state.method)&&state.bodyType!=='none'&&state.body)parts.push('--data-raw',escape(state.body));
    return parts.join(' ');
  }
  async function copy(text){
    try{await navigator.clipboard.writeText(text);notify('Copied to clipboard');}catch{const ta=document.createElement('textarea');ta.value=text;document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();notify(ok?'Copied to clipboard':'Clipboard unavailable; manually select and copy.',ok?'info':'error');}
  }
  function download(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);}
  function formatBody(){try{$('body').value=JSON.stringify(JSON.parse($('body').value),null,2);state.body=$('body').value;notify('JSON formatted');}catch(e){displayError(Error('Invalid JSON: '+e.message));}}
  function refreshNetwork(){
    const list=$('domainList');list.replaceChildren();const set=new Set();
    const resources=performance.getEntriesByType('resource');
    for(const entry of resources){try{const u=new URL(entry.name,location.href);set.add(u.protocol==='file:'?'Local file':u.host);}catch{}}
    if(!set.size)set.add('No external resource entries observed');
    [...set].sort().forEach(s=>{const item=document.createElement('li');item.textContent=s;list.append(item);});
    $('networkNote').textContent=offline?'Offline edition: external site assets are embedded; live API sending is disabled. No analytics or telemetry.':`Online edition: ${resources.length} resource entries currently exposed by Resource Timing. This may omit earlier entries and browser-internal requests.`;
  }
  function init(){
    if(widget)document.body.classList.add('widget-mode');
    if(offline){$('offlineBanner').hidden=false;$('modeNote').textContent='Offline mode: live API calls are disabled. Build requests, try the local demo, save locally, and export cURL.';document.querySelectorAll('.badge-links img').forEach(img=>{const span=document.createElement('span');span.textContent=img.alt+' ↗';span.className='evidence-label';img.replaceWith(span);});}
    readSaved();render();selectTab('params');changeResponse('pretty');
    for(const tab of document.querySelectorAll('[data-tab]'))tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
    for(const tab of document.querySelectorAll('[data-response]'))tab.addEventListener('click',()=>changeResponse(tab.dataset.response));
    $('addParam').addEventListener('click',()=>{state.params.push({key:'',value:''});renderRows('params');});
    $('addHeader').addEventListener('click',()=>{state.headers.push({key:'',value:''});renderRows('headers');});
    $('method').addEventListener('change',()=>{state.method=$('method').value;$('requestDetail').textContent=state.method+' request';});
    $('bodyType').addEventListener('change',()=>{$('body').disabled=$('bodyType').value==='none';});
    $('authType').addEventListener('change',renderAuthFields);
    $('sendRequest').addEventListener('click',send);
    $('cancelRequest').addEventListener('click',()=>controller?.abort());
    $('newRequest').addEventListener('click',()=>{loadRequest({method:'GET',url:'',headers:[],params:[],body:'',bodyType:'none'});});
    $('sampleSelect').addEventListener('change',event=>{const data=sampleData[event.target.value];if(data)loadRequest(data);});
    $('formatBody').addEventListener('click',formatBody);
    $('copyCurl').addEventListener('click',()=>{try{if($('authType').value!=='none'&&!confirm('Copied cURL may include the credentials you entered. Copy this command?'))return;copy(curlString());}catch(error){displayError(error);}});
    $('copyResponse').addEventListener('click',()=>copy(response[responseView]||''));
    $('downloadResponse').addEventListener('click',()=>download(response[responseView]||'','rest-response.'+(responseView==='pretty'?'json':'txt'),'text/plain'));
    $('saveRequest').addEventListener('click',()=>{try{const entry=safeSaved(currentState());if(!entry.url)throw Error('Enter a URL before saving');saved.unshift(entry);saved=saved.slice(0,60);persist();renderSaved();notify('Saved without secrets');}catch(error){displayError(error);}});
    $('exportCollection').addEventListener('click',()=>{const payload={format:'mightora-rest-studio',version:1,requests:saved};download(JSON.stringify(payload,null,2),'mightora-rest-collection.json','application/json');});
    $('importCollection').addEventListener('click',()=>$('fileImport').click());
    $('fileImport').addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{if(file.size>1024*1024)throw Error('Collection larger than 1 MiB.');const contents=JSON.parse(await file.text());if(contents?.format!=='mightora-rest-studio'||!Array.isArray(contents.requests)||contents.requests.length>100)throw Error('Not a supported Mightora collection.');saved=contents.requests.map(safeSaved).slice(0,60);persist();renderSaved();notify('Imported '+saved.length+' requests (secrets removed)');}catch(error){displayError(error);}finally{event.target.value='';}
    });
    $('clearSaved').addEventListener('click',()=>{if(confirm('Delete every saved request from this browser?')){saved=[];persist();renderSaved();}});
    $('embedSnippet').textContent=snippet;
    $('copyEmbed').addEventListener('click',()=>copy(snippet));
    if ($('previewWidget')) $('previewWidget').addEventListener('click',()=>{if(window.MightoraRestWidget?.open){window.MightoraRestWidget.open();return;}const script=document.createElement('script');script.src=widgetUrl;script.onload=()=>window.MightoraRestWidget?.open();script.onerror=()=>notify('Unable to load widget preview. Check CSP and your deployment path.','error');document.body.append(script);});
    $('refreshNetwork').addEventListener('click',refreshNetwork);
    refreshNetwork();window.addEventListener('load',refreshNetwork);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

