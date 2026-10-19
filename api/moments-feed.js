// Join reviewed metadata with N3XRA's existing public asset manifest.
// Only explicitly reviewed identities can appear; no account credentials are used.
const reviewed = require('../moments/feed.json').images;
const STORAGE = 'https://vdbjlgmbpykjblprqnak.supabase.co';
const PREFIX = '/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/';
function publicImage(value) {
  try {const url=new URL(value);return url.origin===STORAGE && url.pathname.startsWith(PREFIX) && !url.username && !url.password;}
  catch {return false;}
}
function createHandler({fetcher=fetch, metadata=reviewed}={}) {
  return async function handler(req,res) {
    res.setHeader('Content-Type','application/json');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
    if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Method not allowed'});}
    try {
      const response=await fetcher(`https://www.n3xra.com/api/website-asset-manifest?slug=quentin-nichols&collection=moments&minute=${Math.floor(Date.now()/60000)}`,{redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Manifest unavailable');
      const manifest=await response.json();
      if(!Array.isArray(manifest.images))throw Error('Invalid manifest');
      const assets=new Map(manifest.images.filter(asset=>publicImage(asset.url)).map(asset=>[asset.assetKey,asset]));
      const images=metadata.flatMap(photo=>{
        const asset=assets.get(`moment-${photo.id}`);
        if(!asset)return [];
        const image={id:photo.id,caption:photo.caption,date:photo.date || null,image:asset.url,thumbnail:asset.url,width:photo.width,height:photo.height,location:null};
        const point=photo.location;
        if(point && Number.isFinite(point.latitude) && Math.abs(point.latitude)<=90 && Number.isFinite(point.longitude) && Math.abs(point.longitude)<=180 && typeof point.label==='string')image.location={label:point.label,latitude:Number(point.latitude.toFixed(2)),longitude:Number(point.longitude.toFixed(2)),precision:'approximate',source:'photo_metadata'};
        return [image];
      });
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=60');
      return send(200,{updatedAt:manifest.generatedAt || null,images});
    }catch{return send(502,{error:'Collection unavailable'});}
  };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
