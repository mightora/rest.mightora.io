const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx={window:{},URL,URLSearchParams};
vm.runInNewContext(fs.readFileSync('src/swagger.js','utf8'),ctx);
const api=ctx.window.MightoraSwagger;
const sample={
 swagger:'2.0',
 info:{title:'Pets API',version:'1.0'},
 schemes:['https'],host:'api.example.org',basePath:'/v2',
 definitions:{Pet:{type:'object',properties:{name:{type:'string',example:'Milo'},age:{type:'integer',example:3}}}},
 paths:{
  '/pets/{petId}':{
   get:{summary:'Find pet',parameters:[{name:'petId',in:'path',required:true,type:'string'},{name:'verbose',in:'query',type:'boolean',default:true}],responses:{'200':{description:'OK'}}},
   post:{summary:'Update pet',consumes:['application/json'],parameters:[{name:'petId',in:'path',required:true,type:'string'},{name:'body',in:'body',schema:{$ref:'#/definitions/Pet'}},{name:'Authorization',in:'header',type:'string',default:'secret'}],responses:{'200':{description:'OK'}}}
  }
 }
};
test('imports Swagger 2.0 paths, local refs and parameters without tokens',()=>{
 const result=api.importSwagger(JSON.stringify(sample));
 assert.equal(result.operations.length,2);
 const get=result.operations[0];
 assert.equal(get.request.url,'https://api.example.org/v2/pets/{petId}');
 assert.equal(get.pathParams[0].key,'petId');
 assert.equal(get.request.params[0].key,'verbose');
 const post=result.operations[1];
 assert.deepEqual(JSON.parse(post.request.body),{name:'Milo',age:3});
 assert.equal(post.request.headers.some(x=>x.key.toLowerCase()==='authorization'),false);
});
test('import supports different API server override',()=>{
 const result=api.importSwagger(JSON.stringify(sample),'https://test.example.org/api');
 assert.equal(result.operations[0].request.url,'https://test.example.org/api/pets/{petId}');
});
test('requires Swagger 2.0 and rejects external references',()=>{
 assert.throws(()=>api.importSwagger(JSON.stringify({openapi:'3.0.0',paths:{},info:{title:'No'}})),/Swagger\/OpenAPI 2.0/);
 const doc=JSON.parse(JSON.stringify(sample));
 doc.paths['/pets/{petId}'].post.parameters[1].schema={$ref:'https://evil.example/schema'};
 assert.throws(()=>api.importSwagger(JSON.stringify(doc)),/Only non-circular references/);
});
test('Swagger export sanitises credentials and groups a single host',()=>{
 const first={method:'GET',url:'https://api.example.org/v1/pets?limit=3&token=secret',params:[{key:'q',value:'cat'},{key:'api_key',value:'do-not-include'}],headers:[{key:'Authorization',value:'Bearer secret'},{key:'X-Trace',value:'test'}],bodyType:'none',body:''};
 const other={method:'GET',url:'https://elsewhere.example.org/v1/foo',params:[],headers:[],bodyType:'none',body:''};
 const result=api.exportSwagger([first,other],'Demo');
 assert.equal(result.count,1);
 assert.equal(result.skipped,1);
 assert.equal(result.doc.swagger,'2.0');
 assert.equal(result.doc.host,'api.example.org');
 const contents=JSON.stringify(result.doc);
 assert.equal(contents.includes('do-not-include'),false);
 assert.equal(contents.includes('secret'),false);
 assert.equal(result.doc.paths['/v1/pets'].get.parameters.some(x=>x.name==='limit'),true);
});
test('exported Swagger 2.0 can be imported again',()=>{
 const s=api.exportSwagger([{method:'POST',url:'https://api.example.com/v1/items',bodyType:'json',body:'{"name":"Hello"}',headers:[],params:[]}]);
 const imported=api.importSwagger(JSON.stringify(s.doc));
 assert.equal(imported.operations[0].request.method,'POST');
 assert.equal(JSON.parse(imported.operations[0].request.body).name,'Hello');
});
