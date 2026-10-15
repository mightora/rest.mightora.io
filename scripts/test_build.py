from pathlib import Path
import zipfile,re
from html.parser import HTMLParser
root=Path(__file__).resolve().parents[1]
dist=root/'dist'
src=(root/'src/app.js').read_text()
css=(root/'src/styles.css').read_text()
html=(dist/'downloads/rest-studio-offline.html').read_text()
assert src in html, 'Offline JS must use maintained source'
assert css in html, 'Offline CSS must use maintained source'
assert 'window.MIGHTORA_OFFLINE=true' in html
assert "connect-src 'none'" in html
assert 'Offline Edition – No Internet Connection Required' in html
assert 'logo-light="data:image/' in html
# Comments and source strings may mention URLs; only actual loaded resources count.
assert 'class MightoraFooter extends HTMLElement' in html
assert 'window.fetch=(input)' in html
assert html.index('window.fetch=(input)') < html.index('customElements.define(\'mightora-footer\'')
assert 'https://mightora.io/about/' in html
assert '<mightora-footer yaml-url="footer.yaml">' in html
assert "url('https://cdn.jsdelivr.net" not in html
assert 'https://mightora.io/about/' in (dist/'footer.yaml').read_text()
assert 'url: "/about/"' not in (dist/'footer.yaml').read_text()
class ExternalResources(HTMLParser):
    def __init__(self): super().__init__();self.matches=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','img','iframe','source') or tag=='link' and a.get('rel') in ('stylesheet','preload','icon'):
            for key in ('src','href','srcset'):
                if a.get(key,'').startswith(('http:','https:','//')):self.matches.append((tag,key,a[key]))
p=ExternalResources();p.feed(html)
assert not p.matches,p.matches
if __import__('os').environ.get('REQUIRE_OFFICIAL_LOGO')=='1':assert 'data:image/png;base64' in html
with zipfile.ZipFile(dist/'downloads/mightora-rest-studio-offline.zip') as z:
    assert set(z.namelist())=={'index.html','README.md','LICENSE'}
    assert z.read('index.html')==html.encode()
assert (dist/'src/app.js').read_text()==src
assert (dist/'widget.js').read_text()==(root/'widget.js').read_text()
assert (dist/'CNAME').read_text().strip()=='rest.mightora.io'
print('PASS: shared Mightora footer renders offline, no external resources, current ZIP and CNAME')


# Dataverse edition: independently verify the single-file bundle, its CSP,
# live-only platform dependency, and ZIP parity.
import hashlib,base64
dv=(dist/'dataverse/rest.html').read_text(encoding='utf8')
dv_source=(root/'src/dataverse-rest.js').read_text(encoding='utf8')
dv_css=(root/'src/dataverse-rest.css').read_text(encoding='utf8')
assert dv_source in dv
assert dv_css in dv
assert (root/'src/swagger.js').read_text(encoding='utf8') in dv
assert 'data:image/png;base64' in dv or __import__('os').environ.get('REQUIRE_OFFICIAL_LOGO')!='1'
assert 'ClientGlobalContext.js.aspx' in dv
assert "connect-src 'self'" in dv
assert "script-src 'self'" in dv
assert "object-src 'none'" in dv and "base-uri 'none'" in dv
assert 'https://rest.mightora.io/widget.js' not in dv
assert '<mightora-footer' not in dv
csp=re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)">',dv)
assert csp is not None,'Dataverse edition must have a CSP'
policy=csp.group(1)
for script in re.findall(r'<script(?:\s+[^>]*)?>([\s\S]*?)</script>',dv):
    if not script.strip():continue  # Dataverse-provided helper has src and no inline code
    digest=base64.b64encode(hashlib.sha256(script.encode('utf8')).digest()).decode('ascii')
    assert "'sha256-"+digest+"'" in policy,'Inline JS missing its exact CSP hash'
for style in re.findall(r'<style>([\s\S]*?)</style>',dv):
    digest=base64.b64encode(hashlib.sha256(style.encode('utf8')).digest()).decode('ascii')
    assert "'sha256-"+digest+"'" in policy,'Inline CSS missing its exact CSP hash'
class DataverseAssets(HTMLParser):
    def __init__(self):super().__init__();self.loaded=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ('script','img','iframe','link'):
            source=a.get('src',a.get('href',''))
            if source:self.loaded.append((tag,source))
assets=DataverseAssets();assets.feed(dv)
assert [(tag,src) for tag,src in assets.loaded if tag=='script']==[('script','ClientGlobalContext.js.aspx')]
assert all(not src.startswith(('https:','http:','//')) for _,src in assets.loaded)
with zipfile.ZipFile(dist/'downloads/rest-Dataverse.zip') as z:
    assert set(z.namelist())=={'rest.html','mightora_rest_command.js','README.md','LICENSE'}
    assert z.read('rest.html')==dv.encode('utf8')
    assert z.read('README.md')==(root/'dataverse/README.md').read_bytes()
    assert z.read('mightora_rest_command.js')==(root/'dataverse/mightora_rest_command.js').read_bytes()
print('PASS: self-contained Dataverse HTML, CSP hashes, Microsoft platform helper and ZIP parity')
