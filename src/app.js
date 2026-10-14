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
  const examples = window.MightoraExamples;
  const sampleData = Object.fromEntries(examples.catalogue.map(item=>[item.id,item.request]));
  let activeGraphScope = '';
  let activeSampleId = '';
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
    if(type==='entra'){
      const p=document.createElement('p');p.className='field-help';
      p.textContent='Use the Microsoft Graph Explorer section to register your own Entra SPA, sign in and request a delegated Graph permission. The temporary token is never shown or saved.';
      host.append(p);
      const a=document.createElement('a');a.href='#graph-explorer';a.textContent='Open Microsoft Graph Explorer ↗';host.append(a);
    }
    for(const [id,name,inputType] of fields){const row=document.createElement('div');row.className='auth-row';const label=document.createElement('label');label.className='field-label';label.htmlFor=id;label.textContent=name;const input=document.createElement('input');input.id=id;input.type=inputType;input.autocomplete='off';input.placeholder=name;if(id==='authKeyName')input.value='X-API-Key';row.append(label,input);host.append(row);}
  }
  function currentState(){syncURL();state.method=$('method').value;state.body=$('body').value;state.bodyType=$('bodyType').value;return safePayload(state);}
  function loadRequest(data,id=''){
    state=safePayload(data);activeSampleId=id;
    const selected=examples.get(id);
    activeGraphScope=selected?.scope||'';
    $('authType').value=selected?.group==='graph'?'entra':'none';
    if(activeGraphScope)$('graphScope').value=activeGraphScope;
    render();updateGraphStatus();
    notify(selected?('Loaded: '+selected.label+'. Press Send request when ready.'):'Ready to send');
  }
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
    if(auth==='entra'){
      // Never attach the user's delegated token to an arbitrary API.
      const accessToken=window.MightoraEntra.bearer(finalURL(),activeGraphScope);
      headers.set('Authorization','Bearer '+accessToken);
    }
    if(!METHOD_WITHOUT_BODY.has(state.method) && state.bodyType==='json' && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
    return headers;
  }
  function finalURL(){
    const value=state.url.trim();if(value===DEMO)return value;
    const url=new URL(value);
    if(url.protocol!=='https:' && url.protocol!=='http:')throw Error('Only http:// and https:// URLs are supported.');
    if(url.username||url.password)throw Error('Credentials in URLs are not supported. Use the Auth tab instead.');
    if(/\\{[^}]+\\}/.test(url.pathname))throw Error('This URL contains a Swagger path placeholder such as {id}. Enter a real resource ID before sending.');
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
    if($('authType').value==='entra')throw Error('For your safety, REST Studio does not copy a signed-in Microsoft Graph token into a cURL command. Use the in-browser Send button.');
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

  function renderExampleGallery(){
    const select=$('sampleSelect');
    select.replaceChildren(new Option('Load a sample…',''));
    for(const [group,label] of Object.entries(examples.groups)){
      const items=examples.catalogue.filter(e=>e.group===group);
      if(!items.length)continue;
      const section=document.createElement('optgroup');section.label=label;
      for(const item of items)section.append(new Option(item.label,item.id));
      select.append(section);
    }
    for(const [group,elementId] of [['public','publicSampleGrid'],['graph','graphSampleGrid']]){
      const host=$(elementId);host.replaceChildren();
      const items=examples.catalogue.filter(e=>e.group===group || (group==='public' && e.group==='local'));
      for(const item of items){
        const card=document.createElement('article');card.className='example-card';
        const badge=document.createElement('span');badge.className='example-method';badge.textContent=item.request.method;
        const title=document.createElement('h4');title.textContent=item.label;
        const p=document.createElement('p');p.textContent=item.description;
        const detail=document.createElement('p');detail.className='field-help';
        detail.textContent=item.scope ? ('Permission: '+item.scope+' — '+examples.scopeHelp[item.scope]) : item.notes;
        const btn=document.createElement('button');btn.type='button';btn.className='btn small subtle';
        btn.textContent='Load in builder ↗';
        btn.setAttribute('aria-label','Load '+item.label+' in REST request builder');
        btn.addEventListener('click',()=>{
          loadRequest(item.request,item.id);
          $('sampleSelect').value=item.id;
          if(item.group==='graph')selectTab('auth');
          $('workspace').scrollIntoView({behavior:'smooth',block:'start'});
        });
        card.append(badge,title,p,detail,btn);host.append(card);
      }
    }
  }
  function updateGraphStatus(message='',isError=false) {
    const session=window.MightoraEntra.current();
    const status=$('graphConnectionStatus');
    if(message){
      status.textContent=message;status.classList.toggle('error',isError);
    } else if(session) {
      const time=new Date(session.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
      status.textContent='Connected to '+session.tenant+' with delegated '+session.scope+'. Access expires around '+time+'. No token is saved.';
      status.classList.remove('error');
    } else {
      status.textContent='Not connected. Choose a read-only permission and sign in to use Graph requests.';
      status.classList.remove('error');
    }
  }
  function initGraphExplorer(){
    const redirect=offline?'https://rest.mightora.io/auth-callback.html':new URL('auth-callback.html',location.href).href;
    $('graphRedirect').value=redirect;
    $('copyGraphRedirect').addEventListener('click',()=>copy(redirect));
    function scopeDescription(){
      const value=$('graphScope').value;
      $('graphScopeDescription').textContent=examples.scopeHelp[value]||'Select a delegated permission.';
    }
    $('graphScope').addEventListener('change',scopeDescription);
    scopeDescription();
    if(offline || widget){
      $('graphConnect').disabled=true;
      updateGraphStatus(offline
        ? 'Offline edition: Microsoft sign-in is disabled. Use the hosted app to connect.'
        : 'Embedded panel: open REST Studio in a full tab to complete Microsoft sign-in safely.');
    }else updateGraphStatus();
    $('graphDisconnect').addEventListener('click',()=>{
      window.MightoraEntra.disconnect();
      updateGraphStatus('Disconnected locally. Microsoft may still remember your browser sign-in; no token is retained here.');
    });
    $('graphConnect').addEventListener('click',async()=>{
      if(offline||widget)return;
      const btn=$('graphConnect');btn.disabled=true;
      updateGraphStatus('Opening Microsoft sign-in…');
      try{
        await window.MightoraEntra.login({
          tenant:$('graphTenant').value,clientId:$('graphClient').value,scope:$('graphScope').value
        });
        updateGraphStatus();
        notify('Microsoft Graph connection ready. Load a Graph sample and press Send.');
      }catch(error){
        updateGraphStatus(error.message,true);
      }finally{btn.disabled=false;}
    });
  }

  let wizardStep = 0;
  let importedSwagger = null;
  function showGraphWizardStep(number){
    wizardStep=Math.max(0,Math.min(4,number));
    for(const el of document.querySelectorAll('[data-graph-step]'))el.hidden=Number(el.dataset.graphStep)!==wizardStep;
    for(const el of document.querySelectorAll('[data-go-step]')){
      const current=Number(el.dataset.goStep)===wizardStep;
      if(current)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');
      el.classList.toggle('active',current);
    }
    $('graphWizardBack').disabled=wizardStep===0;
    $('graphWizardNext').textContent=wizardStep===4?'Open request builder ↗':'Next step →';
    $('graphWizardStatus').textContent='Step '+(wizardStep+1)+' of 5';
  }
  function initGraphWizard(){
    showGraphWizardStep(0);
    for(const btn of document.querySelectorAll('[data-go-step]')){
      btn.addEventListener('click',()=>showGraphWizardStep(Number(btn.dataset.goStep)));
    }
    $('graphWizardBack').addEventListener('click',()=>showGraphWizardStep(wizardStep-1));
    $('graphWizardNext').addEventListener('click',()=>{
      if(wizardStep===2){
        const tenant=$('graphTenant').value.trim(),client=$('graphClient').value.trim();
        const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const domain=/^(?:[a-z0-9][a-z0-9-]{0,61}\\.)+[a-z]{2,63}$/i;
        if(!guid.test(client)||!(guid.test(tenant)||domain.test(tenant))){
          updateGraphStatus('Enter the correct Application ID and tenant ID (or tenant domain) before continuing.',true);
          $('graphWizardStatus').textContent='Check the two IDs in Step 3';
          return;
        }
      }
      if(wizardStep===4){$('workspace').scrollIntoView({behavior:'smooth',block:'start'});return;}
      showGraphWizardStep(wizardStep+1);
    });
    $('wizardLoadMe').addEventListener('click',()=>{
      const example=examples.get('graph');
      loadRequest(example.request,example.id);
      $('sampleSelect').value=example.id;
      selectTab('auth');
      $('workspace').scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  function reportSwagger(message,error=false){
    $('swaggerStatus').textContent=message;
    $('swaggerStatus').style.color=error?'#a64c2b':'';
  }
  function initSwagger(){
    const browse=$('swaggerFile'),picker=$('swaggerOperations');
    function loadOperation(op){
      let request=structuredClone(op.request);
      // Ask the developer for every unresolved path parameter instead of
      // guessing resource identifiers or sending a literal {id} URL.
      for(const param of op.pathParams||[]){
        const value=window.prompt('Path parameter "'+param.key+'": enter a value for '+op.path,param.value||'');
        if(value===null)return;
        if(!value.trim()){reportSwagger('Enter a value for '+param.key+' before loading the operation.',true);return;}
        request.url=request.url.replace('{'+param.key+'}',encodeURIComponent(value.trim()));
      }
      loadRequest(request);
      $('sampleSelect').value='';
      $('workspace').scrollIntoView({behavior:'smooth',block:'start'});
      notify('Imported Swagger operation: '+op.label+'. Review headers and values before sending.');
    }
    picker.addEventListener('change',()=>{$('loadSwaggerOperation').disabled=!picker.value;});
    $('loadSwaggerOperation').addEventListener('click',()=>{
      const item=importedSwagger?.operations[Number(picker.value)];
      if(item)loadOperation(item);
    });
    $('saveSwaggerOperations').addEventListener('click',()=>{
      if(!importedSwagger)return;
      const available=Math.max(0,60-saved.length);
      const newOps=importedSwagger.operations.slice(0,available).map(o=>safeSaved(o.request));
      saved=[...newOps,...saved].slice(0,60);
      persist();renderSaved();
      reportSwagger('Saved '+newOps.length+' Swagger operations in this browser (60 total request limit, secrets excluded). Select the Saved tab to open them.');
    });
    browse.addEventListener('change',async()=>{
      const file=browse.files?.[0];
      if(!file)return;
      picker.disabled=true;picker.replaceChildren(new Option('Import a Swagger 2.0 file first…',''));
      $('loadSwaggerOperation').disabled=true;$('saveSwaggerOperations').disabled=true;
      try{
        if(file.size>2*1024*1024)throw Error('The file must be 2 MiB or smaller.');
        const doc=await file.text();
        const imported=window.MightoraSwagger.importSwagger(doc,$('swaggerHost').value.trim());
        importedSwagger=imported;
        picker.replaceChildren(new Option('Choose an API operation…',''));
        imported.operations.forEach((o,i)=>picker.add(new Option(o.method+' '+o.path+' — '+o.label,String(i))));
        picker.disabled=false;$('saveSwaggerOperations').disabled=false;
        reportSwagger('Imported '+imported.operations.length+' operations from "'+imported.title+'". Choose one to load, or save them locally.');
      }catch(error){importedSwagger=null;reportSwagger(error.message,true);}
      finally{browse.value='';}
    });
    function exportAs(format){
      try{
        const title=$('swaggerTitle').value.trim()||'REST Studio API';
        const current=safeSaved(currentState());
        const result=window.MightoraSwagger.exportSwagger([current,...saved],title);
        const yaml=format==='yaml';
        if(yaml&&!window.jsyaml?.dump)throw Error('YAML exporter unavailable. Please export Swagger 2.0 as JSON.');
        const content=yaml?window.jsyaml.dump(result.doc,{noRefs:true,lineWidth:120}):JSON.stringify(result.doc,null,2);
        download(content,'mightora-swagger-2.0.'+(yaml?'yaml':'json'),yaml?'text/yaml':'application/json');
        reportSwagger('Exported '+result.count+' operations for '+result.host+'. '+(result.skipped?'Skipped '+result.skipped+' operations on other hosts or with the same path and method. ':'')+'Review the definition before sharing.');
      }catch(error){reportSwagger(error.message,true);}
    }
    $('exportSwaggerJson').addEventListener('click',()=>exportAs('json'));
    $('exportSwaggerYaml').addEventListener('click',()=>exportAs('yaml'));
  }
  function init(){
    if(widget)document.body.classList.add('widget-mode');
    if(offline){$('offlineBanner').hidden=false;$('modeNote').textContent='Offline mode: live API calls are disabled. Build requests, try the local demo, save locally, and export cURL.';document.querySelectorAll('.badge-links img').forEach(img=>{const span=document.createElement('span');span.textContent=img.alt+' ↗';span.className='evidence-label';img.replaceWith(span);});}
    readSaved();render();selectTab('params');changeResponse('pretty');
    renderExampleGallery();initGraphExplorer();initGraphWizard();initSwagger();
    for(const tab of document.querySelectorAll('[data-tab]'))tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
    for(const tab of document.querySelectorAll('[data-response]'))tab.addEventListener('click',()=>changeResponse(tab.dataset.response));
    $('addParam').addEventListener('click',()=>{state.params.push({key:'',value:''});renderRows('params');});
    $('addHeader').addEventListener('click',()=>{state.headers.push({key:'',value:''});renderRows('headers');});
    $('method').addEventListener('change',()=>{state.method=$('method').value;$('requestDetail').textContent=state.method+' request';});
    $('bodyType').addEventListener('change',()=>{$('body').disabled=$('bodyType').value==='none';});
    $('authType').addEventListener('change',renderAuthFields);
    $('url').addEventListener('input',()=>{activeGraphScope='';activeSampleId='';});
    $('sendRequest').addEventListener('click',send);
    $('cancelRequest').addEventListener('click',()=>controller?.abort());
    $('newRequest').addEventListener('click',()=>{loadRequest({method:'GET',url:'',headers:[],params:[],body:'',bodyType:'none'});});
    $('sampleSelect').addEventListener('change',event=>{const id=event.target.value;const data=sampleData[id];if(data)loadRequest(data,id);});
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

