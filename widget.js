/* Mightora REST Studio — isolated floating iframe launcher. MIT licence. */
(()=>{'use strict';if(window.MightoraRestWidget)return;
const script=document.currentScript;const base=new URL('.',script?.src||location.href);
const root=new URL('index.html',base),name='mightora-rest-widget';
const button=document.createElement('button');button.id=name+'-trigger';button.type='button';button.textContent='↗ REST Studio';button.setAttribute('aria-label','Open Mightora REST Studio');button.setAttribute('aria-expanded','false');
const panel=document.createElement('section');panel.id=name+'-panel';panel.hidden=true;panel.setAttribute('aria-label','Mightora REST Studio testing panel');
const bar=document.createElement('div');bar.className=name+'-bar';const heading=document.createElement('strong');heading.textContent='Mightora REST Studio';
const actions=document.createElement('div');const full=document.createElement('a');full.href=root.href;full.target='_blank';full.rel='noopener noreferrer';full.title='Open in full page';full.textContent='↗';
const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close REST Studio');actions.append(full,close);bar.append(heading,actions);
const iframe=document.createElement('iframe');iframe.title='Mightora REST Studio';iframe.loading='lazy';iframe.referrerPolicy='no-referrer';iframe.sandbox='allow-scripts allow-same-origin allow-forms allow-downloads';iframe.src=new URL('index.html?mode=widget',base).href;panel.append(bar,iframe);
const style=document.createElement('style');style.textContent=`
#${name}-trigger{position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483000!important;background:#17355d!important;color:#fff!important;border:2px solid #d6e5ec!important;border-radius:32px!important;padding:12px 18px!important;box-shadow:0 10px 30px #122a4470!important;font:700 14px system-ui,sans-serif!important;cursor:pointer!important}
#${name}-panel{position:fixed!important;right:20px!important;bottom:78px!important;z-index:2147483000!important;display:flex;flex-direction:column;width:min(520px,calc(100vw - 24px));height:min(720px,calc(100dvh - 100px));min-width:300px;min-height:260px;max-width:calc(100vw - 10px);max-height:calc(100dvh - 10px);resize:both;overflow:hidden;border:1px solid #bdcfdc;border-radius:14px;background:#fff;color:#17355d;box-shadow:0 18px 55px #09182865;font:14px system-ui,sans-serif}
#${name}-panel[hidden]{display:none!important}
#${name}-panel .${name}-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:8px 12px;background:#17355d;color:#fff;cursor:move;user-select:none}
#${name}-panel .${name}-bar div{display:flex;gap:8px;align-items:center}
#${name}-panel .${name}-bar button,#${name}-panel .${name}-bar a{color:#fff;background:transparent;border:0;padding:2px 8px;text-decoration:none;font:700 23px system-ui,sans-serif;cursor:pointer}
#${name}-panel iframe{display:block;flex:1;min-height:0;width:100%;border:0}
#${name}-panel :is(button,a):focus-visible,#${name}-trigger:focus-visible{outline:3px solid #12b5a3;outline-offset:2px}
@media(max-width:560px){#${name}-panel{right:7px!important;bottom:67px!important;width:calc(100vw - 14px)!important;height:calc(100dvh - 84px)!important;resize:none}}
`;
function toggle(force){const open=typeof force==='boolean'?force:panel.hidden;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)close.focus();else button.focus();}
button.addEventListener('click',()=>toggle());close.addEventListener('click',()=>toggle(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)toggle(false);});
let drag=null;bar.addEventListener('pointerdown',e=>{if(e.target.closest('button,a')||matchMedia('(max-width:560px)').matches)return;const r=panel.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top};bar.setPointerCapture(e.pointerId);});bar.addEventListener('pointermove',e=>{if(!drag)return;panel.style.left=Math.max(0,Math.min(innerWidth-100,drag.left+e.clientX-drag.x))+'px';panel.style.top=Math.max(0,Math.min(innerHeight-80,drag.top+e.clientY-drag.y))+'px';panel.style.right='auto';panel.style.bottom='auto';});bar.addEventListener('pointerup',()=>drag=null);bar.addEventListener('pointercancel',()=>drag=null);
document.head.append(style);(document.body||document.documentElement).append(button,panel);
window.MightoraRestWidget={toggle,open:()=>toggle(true),close:()=>toggle(false)};
})();