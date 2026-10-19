import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createHandler}=require('../api/moments-feed.js');
const metadata=[{id:'a'.repeat(20),caption:'Moments from my phone',date:null,width:1800,height:2400,location:{label:'Oregon',latitude:42.123456,longitude:-121.654321}}];
const url='https://vdbjlgmbpykjblprqnak.supabase.co/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/asset/image.jpg';
const asset={assetKey:'moment-'+metadata[0].id,url,privateInfo:'omit'};
function response(){return{headers:{},statusCode:0,body:null,setHeader(k,v){this.headers[k]=v},end(text){this.body=JSON.parse(text)}}}
async function invoke(images,method='GET'){const res=response();await createHandler({metadata,fetcher:async()=>new Response(JSON.stringify({images}))})({method},res);return res;}
test('joins only reviewed published photos and exposes only display metadata',async()=>{
 const res=await invoke([asset,{assetKey:'moment-'+ 'b'.repeat(20),url}]);
 assert.equal(res.statusCode,200);assert.equal(res.body.images.length,1);assert.equal(res.body.images[0].date,null);assert.equal(res.body.images[0].location.latitude,42.12);assert.equal(res.body.images[0].location.longitude,-121.65);assert.equal(res.body.images[0].privateInfo,undefined);
});
test('removed or unpublished assets disappear from the collection',async()=>{const res=await invoke([]);assert.deepEqual(res.body.images,[]);});
test('rejects private URLs and external destinations',async()=>{
 for(const bad of ['https://example.com/photo.jpg',url.replace('/public/','/sign/'),url.replace('/851e334c-2ed7-4c82-9690-27f9ff8792d4/','/other-website/')]){const res=await invoke([{...asset,url:bad}]);assert.deepEqual(res.body.images,[]);}
});
test('fails closed when N3XRA is unavailable',async()=>{const res=response();await createHandler({fetcher:async()=>new Response('',{status:503})})({method:'GET'},res);assert.equal(res.statusCode,502);assert.equal(res.headers['Cache-Control'],'no-store');});
test('rejects writes without contacting N3XRA',async()=>{const res=await invoke([], 'POST');assert.equal(res.statusCode,405);assert.equal(res.headers.Allow,'GET');});
