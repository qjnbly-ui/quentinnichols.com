import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createHandler}=require('../api/moments-map-config.js');
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v},end(s){this.body=JSON.parse(s)}}}
async function invoke(token){const r=res();const html='<astro-island props="'+JSON.stringify({mapboxToken:[0,token]}).replaceAll('"','&quot;')+'"></astro-island>';await createHandler({fetcher:async()=>new Response(html)})({method:'GET'},r);return r;}
test('uses only the public browser token from the existing N3XRA map configuration',async()=>{const r=await invoke('pk.public-browser-configuration');assert.equal(r.statusCode,200);assert.deepEqual(r.body,{mapboxToken:'pk.public-browser-configuration'});});
test('never exposes a secret token as browser configuration',async()=>{const r=await invoke(['s','k','.private'].join(''));assert.equal(r.statusCode,502);assert.equal(r.headers['Cache-Control'],'no-store');});
