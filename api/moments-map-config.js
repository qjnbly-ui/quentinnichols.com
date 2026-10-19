// Reuse only the public browser configuration already served by N3XRA Maps.
function createHandler({fetcher=fetch}={}) {
 return async function handler(req,res) {
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  if(req.method!=='GET'){res.setHeader('Allow','GET');return send(405,{error:'Method not allowed'});}
  try {
   const response=await fetcher('https://www.n3xra.com/maps/app',{redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('Configuration unavailable');
   const html=await response.text();
   const match=html.match(/props="([^"\n]*mapboxToken[^"\n]*)"/);
   if(!match)throw Error('Configuration unavailable');
   const props=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));
   const token=props.mapboxToken?.[1];
   if(typeof token!=='string' || !/^pk\.[A-Za-z0-9_.-]+$/.test(token))throw Error('Public configuration required');
   res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');
   return send(200,{mapboxToken:token});
  }catch{return send(502,{error:'Map configuration unavailable'});}
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
