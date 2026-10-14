/* Mightora REST Studio — Microsoft Entra delegated auth using OAuth 2.0 code + PKCE.
 * Zero secrets, no app-only tokens, no storage of auth codes/access tokens. MIT. */
(() => {
  'use strict';
  let session = null;
  let active = null;
  const scopes = new Set(['User.Read','Mail.ReadBasic','Calendars.ReadBasic','Files.Read','User.ReadBasic.All']);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function encodeBase64Url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function randomBytes(length) { const data=new Uint8Array(length);crypto.getRandomValues(data);return data; }
  function randomState(){return [...randomBytes(32)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function challenge(verifier) {
    const raw=new TextEncoder().encode(verifier);
    return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)));
  }
  function validate(args) {
    if (window.MIGHTORA_OFFLINE || location.protocol!=='https:')
      throw new Error('Entra sign-in only works on the secure online REST Studio site, not the downloaded offline edition.');
    if (window.self!==window.top)
      throw new Error('For Microsoft sign-in, open REST Studio in a full browser tab instead of the embedded panel.');
    const tenant=String(args.tenant||'').trim();
    const clientId=String(args.clientId||'').trim();
    const scope=String(args.scope||'').trim();
    if(!uuid.test(clientId))throw new Error('Enter the Application (client) ID from Entra. It is a GUID, not the application name or secret.');
    if(!uuid.test(tenant) && !/^(?:[a-z0-9][a-z0-9-]{0,61}\.)+[a-z]{2,63}$/i.test(tenant))
      throw new Error('Enter your Directory (tenant) ID or verified tenant domain, such as contoso.onmicrosoft.com.');
    if(!scopes.has(scope))throw new Error('Choose one of the supported read-only delegated Microsoft Graph permissions.');
    if(active)throw new Error('An Entra sign-in is already open. Complete or close it first.');
    if(!window.crypto?.subtle)throw new Error('Your browser does not support secure PKCE. Use a current browser over HTTPS.');
    return {tenant,clientId,scope,redirectUri:new URL('auth-callback.html',location.href).href};
  }
  function diagnostic(error) {
    let msg=String(error?.message||error||'Unknown sign-in error').replace(/\s+/g,' ').slice(0,600);
    if(/AADSTS50011/i.test(msg))msg+=' Check that the exact callback URL is registered under the Single-page application platform.';
    if(/AADSTS700016/i.test(msg))msg+=' Check the application ID and tenant. The app may not exist in this directory.';
    if(/AADSTS65001|consent_required|admin_consent_required/i.test(msg))msg+=' This permission may require user or administrator consent in your tenant.';
    if(/AADSTS50020/i.test(msg))msg+=' Check that this work or school account belongs to the chosen tenant.';
    if(/popup|blocked/i.test(msg))msg+=' Allow popups for rest.mightora.io and try again.';
    return msg;
  }
  function disconnect() {session=null; }
  function current() {
    if(!session)return null;
    if(Date.now()>=session.expiresAt-30000){session=null;return null;}
    return {tenant:session.tenant,clientId:session.clientId,scope:session.scope,expiresAt:session.expiresAt};
  }
  function bearer(targetUrl,requiredScope='') {
    const s=current();
    if(!s)throw new Error('No active Graph connection. Select a permission and sign in under Microsoft Graph Explorer.');
    const url=new URL(targetUrl);
    if(url.protocol!=='https:' || url.hostname!=='graph.microsoft.com'||url.port||!/^\/(v1\.0|beta)\//.test(url.pathname))
      throw new Error('An Entra Graph token can only be sent to https://graph.microsoft.com/v1.0/ or /beta/ (not third-party APIs).');
    if(requiredScope && s.scope.toLowerCase()!==requiredScope.toLowerCase())
      throw new Error('This sample needs '+requiredScope+'. Your current sign-in has '+s.scope+'. Select '+requiredScope+' and sign in again.');
    return session.accessToken;
  }
  function login(args) {
    let params;try{params=validate(args);}catch(e){return Promise.reject(e);}
    // Open immediately in the direct click handler, before async PKCE generation.
    const popup=window.open('about:blank','mightora-rest-entra','popup=yes,width=560,height=700,noopener=no');
    if(!popup)return Promise.reject(new Error('Sign-in popup blocked. Enable popups for this site.'));
    popup.document.title='Opening Microsoft sign-in…';
    popup.document.body.textContent='Opening Microsoft sign-in…';
    const state=randomState(),verifier=encodeBase64Url(randomBytes(64));
    return new Promise((resolve,reject)=>{
      let done=false, timer=null, poll=null, channel=null;
      function cleanup() {
        if(done)return;done=true;
        clearTimeout(timer);clearInterval(poll);
        window.removeEventListener('message',onWindowMessage);
        try{channel?.close()}catch{}
        active=null;
      }
      function fail(error) {cleanup();try{popup.close()}catch{};reject(new Error(diagnostic(error)));}
      async function finish(message) {
        if(done || !message || message.type!=='mightora-rest-entra-callback'||message.state!==state)return;
        cleanup();
        try{popup.close()}catch{}
        if(message.error) {reject(new Error(diagnostic(message.error+': '+(message.errorDescription||''))));return;}
        if(!message.code){reject(new Error('The Microsoft sign-in callback did not contain an authorisation code.'));return;}
        try{
          const form=new URLSearchParams({
            client_id:params.clientId,scope:params.scope,grant_type:'authorization_code',
            code:message.code,redirect_uri:params.redirectUri,code_verifier:verifier
          });
          const result=await fetch('https://login.microsoftonline.com/'+encodeURIComponent(params.tenant)+'/oauth2/v2.0/token',{
            method:'POST',body:form,headers:{'Content-Type':'application/x-www-form-urlencoded'},credentials:'omit',cache:'no-store',mode:'cors',referrerPolicy:'no-referrer'
          });
          const data=await result.json();
          if(!result.ok || !data.access_token || data.token_type?.toLowerCase()!=='bearer')
            throw new Error(data.error_description||data.error||'Microsoft did not issue a Graph access token.');
          if(!String(data.scope||'').split(' ').some(s=>s.toLowerCase()===params.scope.toLowerCase()))
            throw new Error('Microsoft returned a token without the requested '+params.scope+' permission.');
          session={accessToken:data.access_token,scope:params.scope,clientId:params.clientId,tenant:params.tenant,expiresAt:Date.now()+Math.max(0,Number(data.expires_in)||0)*1000};
          resolve(current());
        }catch(err){session=null;reject(new Error(diagnostic(err)));}
      }
      function onWindowMessage(event) {
        if(event.origin!==location.origin || event.source!==popup)return;
        void finish(event.data);
      }
      window.addEventListener('message',onWindowMessage);
      try{
        channel=new BroadcastChannel('mightora-rest-auth-'+state);
        channel.onmessage=event=>void finish(event.data);
      }catch{}
      timer=setTimeout(()=>fail(new Error('Sign-in timed out. Close the Microsoft window and try again.')),120000);
      poll=setInterval(()=>{if(!done && popup.closed)fail(new Error('The sign-in popup was closed before connecting.'));},600);
      active={state};
      (async()=>{
        try{
          const pkce=await challenge(verifier);
          if(done)return;
          const url=new URL('https://login.microsoftonline.com/'+encodeURIComponent(params.tenant)+'/oauth2/v2.0/authorize');
          for(const [key,value] of Object.entries({
            client_id:params.clientId,response_type:'code',redirect_uri:params.redirectUri,response_mode:'query',
            scope:params.scope,state,code_challenge:pkce,code_challenge_method:'S256'
          }))url.searchParams.set(key,value);
          popup.location.replace(url.href);
        }catch(err){fail(err);}
      })();
    });
  }
  window.MightoraEntra=Object.freeze({login,disconnect,current,bearer,diagnostic,scopes:Object.freeze([...scopes])});
})();
