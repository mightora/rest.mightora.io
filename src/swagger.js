/* Mightora REST Studio — Swagger 2.0 importer/exporter. All processing remains in the browser. MIT. */
(() => {
 'use strict';
 const METHODS = new Set(['get','post','put','patch','delete','head','options']);
 const SECRET = /authorization|cookie|password|secret|token|api[-_]?key|x-auth/i;
 const MAX_OPERATIONS = 250;
 const plain = v=>v && typeof v==='object' && !Array.isArray(v);
 const clean = v=>String(v==null?'':v);
 const safeRows=rows=>rows.filter(v=>!SECRET.test(v.key)).slice(0,60);
 function validate(doc){
   if(!plain(doc) || doc.swagger!=='2.0' || !plain(doc.paths) || !plain(doc.info) || !doc.info.title)
     throw Error('Please choose a valid Swagger/OpenAPI 2.0 document with info.title and paths. OpenAPI 3.x uses a different format and is not supported by this importer.');
   if(Object.keys(doc.paths).length>MAX_OPERATIONS)throw Error('Swagger has too many paths for this browser tool (limit 250).');
 }
 function parse(text) {
   if(typeof text!=='string'||text.length>2*1024*1024)throw Error('Swagger import limit is 2 MiB.');
   let doc;
   try { doc=JSON.parse(text); }
   catch { if(!window.jsyaml?.load)throw Error('YAML parser is not available. Import a Swagger 2.0 JSON file.');doc=window.jsyaml.load(text,{json:true}); }
   validate(doc);
   return doc;
 }
 function ref(doc,object,depth=0,seen=new Set()) {
   if(!object?.$ref)return object;
   const pointer=String(object.$ref);
   if(!pointer.startsWith('#/') || depth>12 || seen.has(pointer))
     throw Error('Only non-circular references inside the imported Swagger file are supported: '+pointer.slice(0,120));
   const segments=pointer.slice(2).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
   let current=doc;
   for(const seg of segments){if(!current || !Object.prototype.hasOwnProperty.call(current,seg))throw Error('Missing Swagger reference: '+pointer);current=current[seg];}
   const next=new Set(seen);next.add(pointer);
   return ref(doc,current,depth+1,next);
 }
 function sampleValue(doc,schema,depth=0){
   if(depth>5)return null;
   const model=ref(doc,schema||{});
   if(!plain(model))return null;
   if(model.example!==undefined)return model.example;
   if(model.default!==undefined)return model.default;
   if(model.type==='array')return [sampleValue(doc,model.items,depth+1)];
   if(model.type==='object'||model.properties){
     let result={};
     for(const [name,value] of Object.entries(model.properties||{}).slice(0,25))result[name]=sampleValue(doc,value,depth+1);
     return result;
   }
   if(model.enum?.length)return model.enum[0];
   if(model.type==='integer'||model.type==='number')return 0;
   if(model.type==='boolean')return false;
   return model.type==='string' ? '' : null;
 }
 function asValue(parameter) {
   if(parameter['x-example']!==undefined)return clean(parameter['x-example']);
   if(parameter.default!==undefined)return clean(parameter.default);
   if(parameter.example!==undefined)return clean(parameter.example);
   if(Array.isArray(parameter.enum)&&parameter.enum.length)return clean(parameter.enum[0]);
   return '';
 }
 function resolveUrl(document, rawPath, override=''){
   const schemes=Array.isArray(document.schemes)?document.schemes:[];
   const protocol=schemes.includes('https')?'https':schemes.includes('http')?'http':'https';
   const prefix=override?override.replace(/\/$/,''):document.host?(protocol+'://'+document.host.replace(/\/$/,'')+(document.basePath||'')):'https://api.example.com'+(document.basePath||'');
   const url=new URL(prefix.endsWith('/')?prefix+rawPath.replace(/^\//,''):prefix+'/'+rawPath.replace(/^\//,''));
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Swagger host must use HTTP/HTTPS without embedded credentials.');
   return url;
 }
 function importSwagger(text,override=''){
   const doc=parse(text);
   const operations=[];
   for(const [path,rawPath] of Object.entries(doc.paths)){
     if(!path.startsWith('/'))throw Error('Swagger path must begin with /: '+path);
     const group=ref(doc,rawPath);
     for(const [method,rawOperation] of Object.entries(group||{})){
       if(!METHODS.has(method.toLowerCase()))continue;
       const op=ref(doc,rawOperation);
       if(!plain(op))continue;
       const url=resolveUrl(doc,path,override);
       const query=[], headers=[], pathParams=[];
       let body='', bodyType='none';
       const params=[...(Array.isArray(group.parameters)?group.parameters:[]),...(Array.isArray(op.parameters)?op.parameters:[])];
       const unique=new Map();
       for(const rawParam of params){const p=ref(doc,rawParam);if(!p||!p.in||!p.name)continue;unique.set(p.in+':'+p.name,p);}
       for(const p of unique.values()){
         if(p.in==='query')query.push({key:p.name,value:asValue(p)});
         else if(p.in==='header'&&!SECRET.test(p.name))headers.push({key:p.name,value:asValue(p)});
         else if(p.in==='path')pathParams.push({key:p.name,value:asValue(p)});
         else if(p.in==='body'){
           const example=sampleValue(doc,p.schema);
           body=typeof example==='string'&&op.consumes?.includes('text/plain')?example:JSON.stringify(example??{},null,2);
           bodyType='json';
         }else if(p.in==='formData'){
           // The builder currently supports JSON/text bodies, not multipart form uploads.
           bodyType='none';
         }
       }
       const selectedBody=(op.consumes||doc.consumes||[]).includes('application/json');
       if(body && !selectedBody && (op.consumes||doc.consumes||[]).includes('text/plain'))bodyType='text';
       if(bodyType==='json')headers.push({key:'Content-Type',value:'application/json'});
       const templatedUrl=url.href.replace(/%7B/ig,'{').replace(/%7D/ig,'}');
       const request={method:method.toUpperCase(),url:templatedUrl,params:safeRows(query),headers:safeRows(headers),body,bodyType};
       // A template path is never substituted with guessed identifiers.
       operations.push({id:'swagger-'+operations.length,label:clean(op.summary||op.operationId||method.toUpperCase()+' '+path).slice(0,140),
         method:method.toUpperCase(),path,description:clean(op.description||''),pathParams,request});
       if(operations.length>MAX_OPERATIONS)throw Error('Swagger has too many operations (limit 250).');
     }
   }
   if(!operations.length)throw Error('This Swagger 2.0 document has no supported HTTP operations.');
   return {title:clean(doc.info.title),version:clean(doc.info.version||''),operations,origin:doc.host||'(unspecified)'};
 }
 function inferSchema(body,kind){
   if(kind!=='json')return {type:'string',example:body};
   let value;try{value=JSON.parse(body);}catch{return {type:'string',example:body};}
   function traverse(v,depth=0){
     if(depth>4)return {type:'string'};
     if(v===null)return {type:'string'};
     if(Array.isArray(v))return {type:'array',items:v.length?traverse(v[0],depth+1):{type:'string'}};
     if(typeof v==='object'){
       let properties={};for(const [k,item] of Object.entries(v).slice(0,25))properties[k]=traverse(item,depth+1);
       return {type:'object',properties};
     }
     return {type:typeof v==='number'?(Number.isInteger(v)?'integer':'number'):typeof v==='boolean'?'boolean':'string',example:v};
   }
   return traverse(value);
 }
 function exportSwagger(requests,title='Mightora REST Studio API'){
   if(!Array.isArray(requests)||!requests.length)throw Error('Add or save at least one request before exporting Swagger 2.0.');
   const permitted=requests.filter(r=>r?.url && /^https?:\/\//i.test(r.url));
   if(!permitted.length)throw Error('Swagger export requires at least one HTTP/HTTPS request (not the local demo).');
   const initial=new URL(permitted[0].url);
   if(initial.username||initial.password)throw Error('URLs containing credentials cannot be exported.');
   const host=initial.host,scheme=initial.protocol.slice(0,-1);
   const paths={};let skipped=0,count=0;
   for(const request of permitted.slice(0,MAX_OPERATIONS)){
     const url=new URL(request.url);
     if(url.host!==host||url.protocol!==initial.protocol){skipped++;continue;}
     const method=String(request.method||'GET').toLowerCase();
     if(!METHODS.has(method)){skipped++;continue;}
     const path=(url.pathname||'/').replace(/%7B/ig,'{').replace(/%7D/ig,'}');
     if(!paths[path])paths[path]={};
     if(paths[path][method]){skipped++;continue;}
     const p=[];
     const query=new URLSearchParams(url.search);
     for(const row of request.params||[])if(row.key && !SECRET.test(row.key))query.set(row.key,row.value);
     for(const [key,value] of query)if(!SECRET.test(key))p.push({name:key,in:'query',required:false,type:'string',default:value});
     const templated=[...path.matchAll(/\{([^}]+)\}/g)];
     for(const [,name] of templated)p.push({name,in:'path',required:true,type:'string'});
     for(const row of request.headers||[]){
       if(row.key&&!SECRET.test(row.key)&&!/^content-type$/i.test(row.key))p.push({name:row.key,in:'header',required:false,type:'string',default:row.value});
     }
     if(request.bodyType!=='none' && request.body && !['get','head'].includes(method))
       p.push({name:'body',in:'body',required:false,schema:inferSchema(request.body,request.bodyType)});
     paths[path][method]={summary:method.toUpperCase()+' '+path,description:'Request template exported from Mightora REST Studio. Response and schema details are illustrative.',parameters:p,responses:{'200':{description:'Example success response; confirm with API owner.'}}};
     if(request.bodyType==='json')paths[path][method].consumes=['application/json'];
     count++;
   }
   if(!count)throw Error('No exportable operations belong to '+host+'. Select a request from the target API.');
   const doc={swagger:'2.0',info:{title,version:'1.0.0',description:'Scaffold generated from saved REST Studio requests. Review parameter types, schemas, responses, authentication and examples before publishing.'},host,basePath:'/',schemes:[scheme],produces:['application/json'],paths};
   return {doc,count,skipped,host};
 }
 window.MightoraSwagger=Object.freeze({parse,importSwagger,exportSwagger});
})();
