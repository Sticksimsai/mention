import {api} from './api';
export async function uploadMedia(file:Blob){
 if(file.size>(file.type==='image/gif'?8_000_000:2_000_000))throw new Error('GIFs must be under 8 MB; images under 2 MB');
 const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Could not read file'));r.readAsDataURL(file);});
 return api<{id:string;url:string}>('/v1/media',{method:'POST',body:{data}});
}
export function loadImage(url:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load token image. Try uploading an image in community settings.'));image.src=url;});}
