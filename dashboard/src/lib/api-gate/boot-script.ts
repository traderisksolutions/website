import { API_KEY_HEADER } from './verify'

// Attaching the API key to every dashboard fetch.
//
// This app has 372 `fetch('/api/...')` call sites across 88 files. Editing
// each to add a header would be 372 chances to miss one, and a miss would
// not surface until that particular button was clicked in production. So
// the header is attached once, here, by wrapping window.fetch before any
// application code runs.
//
// Monkey-patching a global is not free and is not a thing to reach for
// often. It earns its place on three counts: the wrapper is total (a call
// site cannot forget), it is scoped to same-origin /api/ requests and
// leaves every other fetch exactly as it found it, and it runs from an
// inline <script> in the document head, so no component can fire a request
// before it is in place. A React provider would lose that last property.
//
// It deliberately does NOT touch the browser's direct Supabase traffic —
// chat queries, Realtime subscriptions, Storage uploads all go to
// supabase.co, a different origin. Those are governed by RLS and are
// outside this gate entirely.
//
// The key is public: it is in the page source, by necessity, for any
// browser client. It is not what protects the data. The gate only honours
// a browser key alongside a Supabase session (src/lib/api-gate/verify.ts),
// so a copy lifted out of the page reaches nothing on its own.
//
// A caller that sets x-api-key itself is left alone, so an explicit
// caller always wins over this wrapper.

/** An IIFE, safe to inline. Returns '' when no key is configured, so a
 * deployment without one renders no script rather than a broken one. */
export function apiKeyBootScript(key: string | undefined): string {
  if (!key) return ''

  return `(function(){
  var KEY=${JSON.stringify(key)},HEADER=${JSON.stringify(API_KEY_HEADER)};
  if(!window.fetch)return;
  var original=window.fetch;
  function ours(input){
    try{
      var raw=typeof input==="string"?input:(input&&input.url)||String(input);
      var u=new URL(raw,location.href);
      return u.origin===location.origin&&u.pathname.indexOf("/api/")===0;
    }catch(e){return false;}
  }
  window.fetch=function(input,init){
    try{
      if(ours(input)){
        if(typeof Request!=="undefined"&&input instanceof Request&&!init){
          var rh=new Headers(input.headers);
          if(!rh.has(HEADER)){rh.set(HEADER,KEY);return original(new Request(input,{headers:rh}));}
        }else{
          init=init||{};
          var h=new Headers(init.headers||(typeof Request!=="undefined"&&input instanceof Request?input.headers:undefined));
          if(!h.has(HEADER)){h.set(HEADER,KEY);init.headers=h;}
        }
      }
    }catch(e){/* never let this break a request it was only meant to annotate */}
    return original(input,init);
  };
})();`
}
