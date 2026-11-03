// X v2 initialize → append → finalize → status. Uploads never create a tweet.
export function validateXMedia(bytes:Buffer,mime:string) {
  const valid=bytes.length>=16&&(mime==='image/gif'?['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)):mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:mime==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':false);
  if(!valid||bytes.length>(mime==='image/gif'?8_000_000:2_000_000))throw new Error('Unsupported or oversized X attachment');
}
export async function uploadXMedia(bytes:Buffer,mime:string,token:string,request:typeof fetch=fetch,wait:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))) {
  validateXMedia(bytes,mime);
  const headers={Authorization:`Bearer ${token}`};
  async function call(path:string,options:RequestInit={}) {
    const res=await request(`https://api.x.com/2/media/upload${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(30000)});
    if(!res.ok)throw new Error(`X media upload failed: HTTP ${res.status}`);
    if(res.status===204)return {};
    return res.json();
  }
  const init=await call('/initialize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({total_bytes:bytes.length,media_type:mime,media_category:mime==='image/gif'?'tweet_gif':'tweet_image'})});
  const id=init.data?.id;
  if(typeof id!=='string'||!/^\d+$/.test(id))throw new Error('X returned no media ID');
  for(let offset=0,index=0;offset<bytes.length;offset+=4_000_000,index++) {
    const form=new FormData();form.set('segment_index',String(index));
    form.set('media',new Blob([new Uint8Array(bytes.subarray(offset,offset+4_000_000))],{type:mime}),'attachment');
    await call(`/${id}/append`,{method:'POST',body:form});
  }
  let result=await call(`/${id}/finalize`,{method:'POST'});
  for(let checks=0;result.data?.processing_info;checks++) {
    const info=result.data.processing_info;
    if(info.state==='succeeded')return id;
    if(info.state==='failed')throw new Error('X rejected the attachment during processing');
    if(!['pending','in_progress'].includes(info.state)||checks>=20)throw new Error('X media processing did not finish in time');
    await wait(Math.min(10,Math.max(1,Number(info.check_after_secs)||1))*1000);
    result=await call(`?command=STATUS&media_id=${id}`);
    if(!result.data?.processing_info)throw new Error('X returned no media processing status');
  }
  if(!result.data?.id)throw new Error('X did not confirm the attachment upload');
  return id;
}
