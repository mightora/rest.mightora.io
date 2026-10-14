#!/usr/bin/env python3
"""Build hosted and local-only editions from the SAME maintained HTML/CSS/JS."""
from pathlib import Path
from html import escape
import os, re, base64, shutil, zipfile, json

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
DOWNLOADS=DIST/'downloads'
LOGO='https://raw.githubusercontent.com/mightora/mightora.io/main/static/images/mightoraIoLogo4-200x900.png'

def svg_data(text):
    return 'data:image/svg+xml;base64,'+base64.b64encode(text.encode()).decode()
def placeholder(text):
    return svg_data('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 200"><rect width="900" height="200" fill="white"/><text x="25" y="140" font-family="Arial,sans-serif" font-weight="800" font-size="110" fill="#17355d">'+escape(text)+'</text></svg>')
def logo_data():
    path=ROOT/'assets/mightora-logo.png'
    if path.exists():
        data=path.read_bytes()
        assert data[:8]==b'\x89PNG\r\n\x1a\n', 'Logo must be PNG'
        return 'data:image/png;base64,'+base64.b64encode(data).decode()
    if os.environ.get('REQUIRE_OFFICIAL_LOGO')=='1':
        raise RuntimeError('Official logo missing; release requires its exact original image')
    return placeholder('mightora.io')

def asset_text(name):
    path=ROOT/'assets'/name
    if path.exists():
        return path.read_text(encoding='utf8')
    if os.environ.get('REQUIRE_OFFICIAL_LOGO')=='1':
        raise RuntimeError('Missing required bundled shared UI asset: '+name)
    return ''

def asset_png(name, fallback):
    path=ROOT/'assets'/name
    if path.exists():
        data=path.read_bytes()
        assert data[:8]==b'\x89PNG\r\n\x1a\n', 'Expected PNG for '+name
        return 'data:image/png;base64,'+base64.b64encode(data).decode()
    if os.environ.get('REQUIRE_OFFICIAL_LOGO')=='1':
        raise RuntimeError('Missing required shared UI image: '+name)
    return placeholder(fallback)

def normalized_footer_yaml():
    yaml=asset_text('footer.yaml')
    # The shared Mightora footer contains root-relative corporate links.
    # Ensure these resolve to Mightora.io, not /about on each tools subdomain.
    return re.sub(r'(?m)^(\s*url:\s*)"/([^"]+)"',
                  lambda m: m.group(1)+'"https://mightora.io/'+m.group(2)+'"', yaml)

def portable_html():
    source=(ROOT/'index.html').read_text(encoding='utf8')
    css=(ROOT/'src/styles.css').read_text(encoding='utf8')
    js=(ROOT/'src/app.js').read_text(encoding='utf8')
    assert '</script' not in js.lower(), 'Unsafe closing script tag in source'
    logo=logo_data()
    shared_css=asset_text('shared.css')
    shared_js=asset_text('components.js')
    yaml_js=asset_text('js-yaml.min.js')
    footer_yaml=normalized_footer_yaml()
    # The shared author banner image must be embedded, not fetched offline.
    banner=asset_png('ian-tweedie-presenting-4.png','Mightora')
    shared_css=shared_css.replace("url('https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/ian-tweedie-presenting-4.png')", "url('"+banner+"')")
    for body in (shared_js, yaml_js):
        assert '</script' not in body.lower(), 'Unexpected closing script tag in shared UI'
    source=source.replace('<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/shared.css">','<style>'+shared_css+'</style>')
    source=source.replace('<link rel="stylesheet" href="src/styles.css">','<style>'+css.replace('</style','<\\/style')+'</style>')
    favicon=(ROOT/'assets/favicon.svg').read_text(encoding='utf8')
    source=source.replace('<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">','<link rel="icon" type="image/svg+xml" href="'+svg_data(favicon)+'">')
    source=re.sub(r'<script>\s*// Required Mightora footer\.yaml.*?</script>','',source,flags=re.DOTALL)
    # The fetch shim must be installed BEFORE the custom elements register:
    # customElements.define immediately connects existing footer elements.
    shim='window.MIGHTORA_OFFLINE=true; const footerYaml='+json.dumps(footer_yaml)+'; window.fetch=(input)=>{const url=typeof input==="string"?input:input.url;return url.includes("footer.yaml")?Promise.resolve(new Response(footerYaml,{status:200,headers:{"Content-Type":"text/yaml"}})):Promise.reject(new TypeError("Offline edition blocks network requests"));};'
    source=source.replace('<script defer src="https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js"></script>','<script>'+shim+'</script><script>'+yaml_js+'</script>')
    source=source.replace('<script defer src="https://cdn.jsdelivr.net/gh/mightora/shared-ui@main/components.js"></script>','<script>'+shared_js+'</script>')
    source=source.replace('<script defer src="src/app.js"></script>','<script>\n'+js+'\n</script>')
    source=source.replace(LOGO,logo)
    source=source.replace('https://techtweedie.github.io/images/author/ian-tweedie-sq2_hu_a380911c6f4726de.png',asset_png('ian-tweedie-sq2.png','IT'))
    source=source.replace('https://raw.githubusercontent.com/TechTweedie/techtweedie.github.io/v2/assets/images/site/main-logo.png',asset_png('main-logo.png','TT'))
    # Replace third-party evidence badge images with text linking to the same evidence.
    source=re.sub(r'<img alt="Build and deploy status" src="[^"]+">','<span class="evidence-label">Build and deployment evidence ↗</span>',source)
    source=re.sub(r'<img alt="CodeQL analysis status" src="[^"]+">','<span class="evidence-label">CodeQL workflow ↗</span>',source)
    source=re.sub(r'<img alt="MIT licence" src="[^"]+">','<span class="evidence-label">MIT licence ↗</span>',source)
    source=source.replace('<button id="previewWidget" class="btn primary" type="button">Open panel preview ↗</button>','<span>Floating panel preview is available in the hosted edition.</span>')
    source=source.replace('<a id="downloadHtml" class="btn primary" href="downloads/rest-studio-offline.html" download>Download standalone HTML</a>','<span>Already using the standalone offline HTML</span>')
    source=source.replace('<a id="downloadZip" class="btn subtle" href="downloads/mightora-rest-studio-offline.zip" download>Download offline ZIP</a>','')
    source=source.replace('<meta name="referrer" content="strict-origin-when-cross-origin">',"""<meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">""")
    return source

def main():
    DOWNLOADS.mkdir(parents=True,exist_ok=True)
    files=['index.html','widget.js','src/app.js','src/styles.css','assets/favicon.svg','LICENSE','README.md','CNAME','robots.txt','sitemap.xml']
    for relative in files:
        target=DIST/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT/relative,target)
    (DIST/'.nojekyll').write_text('')
    # The online footer uses the latest official shared YAML at build time.
    (DIST/'footer.yaml').write_text(normalized_footer_yaml(), encoding='utf8')
    offline=portable_html()
    html_path=DOWNLOADS/'rest-studio-offline.html'
    html_path.write_text(offline,encoding='utf8')
    with zipfile.ZipFile(DOWNLOADS/'mightora-rest-studio-offline.zip','w',zipfile.ZIP_DEFLATED) as z:
        z.write(html_path,'index.html')
        z.write(ROOT/'README.md','README.md')
        z.write(ROOT/'LICENSE','LICENSE')
    print('Built REST Studio Pages app + locally self-contained offline HTML/ZIP')
if __name__=='__main__':main()
