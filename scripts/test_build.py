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
assert 'https://cdn.jsdelivr.net' not in html
assert not re.search(r'<script[^>]*\bsrc=',html)
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
print('PASS: same sources, local-only offline edition, restricted CSP, current ZIP and CNAME')
