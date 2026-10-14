const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Mightora shared UI and author are included',()=>{let h=read('index.html');for(let x of ['mightora-header','mightora-footer','mightora-author','shared-ui@main/shared.css'])assert(h.includes(x));assert(h.indexOf('js-yaml.min.js')<h.indexOf('shared-ui@main/components.js'));assert(h.indexOf('id="evidence"')<h.indexOf('<mightora-footer>'));});
test('Host and canonical point to correct repository',()=>{let h=read('index.html');assert(h.includes('https://rest.mightora.io/'));assert(h.includes('mightora/rest.mightora.io'));assert.equal(read('CNAME').trim(),'rest.mightora.io');});
test('Browser requests are not proxied and omit credentials',()=>{let s=read('src/app.js');assert(s.includes("credentials:'omit'"));assert(s.includes("mode:'cors'"));assert(!/cors-anywhere|corsproxy|api\.allorigins/.test(s));});
test('Widget uses iframe isolation',()=>{let s=read('widget.js');assert(s.includes('iframe.sandbox'));assert(s.includes('no-referrer'));assert(s.includes('Escape'));});
test('Saved request sanitises secrets',()=>{let s=read('src/app.js');assert(s.includes('SENSITIVE'));assert(s.includes('safeSaved'));});
test('CI and CodeQL workflows exist',()=>{assert(read('.github/workflows/deploy.yml').includes('deploy-pages@v4'));assert(read('.github/workflows/codeql.yml').includes('codeql-action/analyze@v3'));});
