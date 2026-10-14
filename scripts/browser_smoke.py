#!/usr/bin/env python3
"""Verify both online build and offline edition execute JavaScript and display recipes."""
from html.parser import HTMLParser
from pathlib import Path
import http.server
import socketserver
import subprocess
import tempfile
import threading
import os

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(DIST),**kwargs)
    def log_message(self,*args): pass

class DOM(HTMLParser):
    def __init__(self):
        super().__init__()
        self.public=0
        self.graph=0
        self.wizard=0
        self.swagger=0
        self.current=None
        self.level=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='div' and a.get('id') in ('publicSampleGrid','graphSampleGrid'):
            self.current=a['id'];self.level=1;return
        if self.current:
            if tag=='div':self.level+=1
            if tag=='article' and 'example-card' in a.get('class',''):
                if self.current=='publicSampleGrid':self.public+=1
                else:self.graph+=1
        if a.get('id')=='graphWizardProgress':self.wizard+=1
        if a.get('id')=='swaggerFile':self.swagger+=1
    def handle_endtag(self,tag):
        if tag=='div' and self.current:
            self.level-=1
            if self.level==0:self.current=None

def chrome_dom(address):
    cmd=['google-chrome','--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--disable-extensions','--disable-background-networking','--no-first-run','--virtual-time-budget=6000',
      '--dump-dom',address]
    result=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
    if result.returncode or '<html' not in result.stdout:
        raise RuntimeError('Browser failed '+address+': '+result.stderr[-1800:])
    dom=DOM();dom.feed(result.stdout)
    assert dom.public>=6, f'Expected populated public API gallery: {dom.public}'
    assert dom.graph>=5, f'Expected populated Graph recipes: {dom.graph}'
    assert dom.wizard==1 and dom.swagger==1, 'Guided wizard or Swagger importer missing'
    print(f'{address}: {dom.public} public samples, {dom.graph} Graph samples, wizard and Swagger UI present')

with socketserver.TCPServer(('127.0.0.1',0),Handler) as server:
    port=server.server_address[1]
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:chrome_dom(f'http://127.0.0.1:{port}/')
    finally:server.shutdown()
chrome_dom((DIST/'downloads/rest-studio-offline.html').resolve().as_uri())
print('PASS: hosted and offline Swagger 2.0 / Graph guides render in Chrome')
