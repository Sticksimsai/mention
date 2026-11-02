/** Claim must be durable before sending. Never retry an ambiguous remote write. */
export async function sendOnce<T>(deps:{claim:()=>Promise<boolean>;send:()=>Promise<T>;complete:(value:T)=>Promise<void>;uncertain:()=>Promise<void>}):Promise<'sent'|'already-claimed'>{
 if(!await deps.claim())return 'already-claimed';
 try{const value=await deps.send();await deps.complete(value);return 'sent';}
 catch(error){await deps.uncertain();throw error;}
}
