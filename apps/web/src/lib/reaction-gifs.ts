import {loadImage} from './media';
export const REACTION_GIFS=[
 ['gm','Community'],['gn','Community'],['we’re so back','Hype'],['let’s cook','Hype'],['still here','Community'],['built different','Hype'],['send it','Hype'],['locked in','Hype'],
 ['respect','Community'],['thank you','Community'],['welcome in','Community'],['good vibes','Community'],['not leaving','Community'],['we build','Community'],['together','Community'],['community wins','Community'],
 ['big mood','Reactions'],['wait what','Reactions'],['oh no','Reactions'],['bruh','Reactions'],['interesting','Reactions'],['say less','Reactions'],['I see you','Reactions'],['real','Reactions'],
 ['loading…','Reactions'],['thinking…','Reactions'],['one more time','Reactions'],['taking notes','Reactions'],['eyes on this','Reactions'],['plot twist','Reactions'],['fair enough','Reactions'],['all good','Reactions'],
 ['nice','Celebration'],['W','Celebration'],['LFG','Celebration'],['cheers','Celebration'],['GG','Celebration'],['well played','Celebration'],['nailed it','Celebration'],['we did it','Celebration'],
 ['patience','Trading'],['zoom out','Trading'],['hold on','Trading'],['touch grass','Trading'],['stay curious','Trading'],['check the chart','Trading'],['do your research','Trading'],['no rush','Trading'],
].map(([label,category],i)=>({id:`reaction-${i}`,label,category,color:['#a3ed00','#a78bfa','#38bdf8','#fb7185','#fbbf24'][i%5],style:i%6}));
export async function makeReactionGif({label,color,ticker='',pfpUrl,style=0}:{label:string;color:string;ticker?:string;pfpUrl?:string;style?:number}):Promise<Blob>{
 const {GIFEncoder,quantize,applyPalette}=await import('gifenc');
 const avatar=pfpUrl?await loadImage(pfpUrl):null;
 const canvas=document.createElement('canvas');canvas.width=500;canvas.height=500;
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;const gif=GIFEncoder();let palette:number[][]|undefined;
 const words=label.toUpperCase().split(' ');const lines:string[]=[];let line='';for(const word of words){if((line+' '+word).trim().length>12&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);
 for(let frame=0;frame<20;frame++){
  const phase=frame/20*Math.PI*2,wave=Math.sin(phase),bounce=Math.sin(phase)*9;
  ctx.fillStyle=style%2?'#171913':'#10120f';ctx.fillRect(0,0,500,500);
  ctx.fillStyle=color;ctx.globalAlpha=.08;for(let y=12;y<500;y+=24)for(let x=12;x<500;x+=24){ctx.fillRect(x+(style===3?wave*4:0),y,2,2);}ctx.globalAlpha=1;
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(20,20,460,460);
  ctx.fillStyle=color;ctx.font='bold 18px monospace';ctx.textAlign='center';ctx.fillText(ticker?`$${ticker}`:'mentions.',250,62);
  if(avatar){
   ctx.save();ctx.translate(250,225+bounce);ctx.rotate(style===1?wave*.09:0);const scale=style===2?1+wave*.06:1;ctx.scale(scale,scale);
   ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,118,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(0,0,110,0,Math.PI*2);ctx.clip();
   const side=Math.min(avatar.width,avatar.height);ctx.drawImage(avatar,(avatar.width-side)/2,(avatar.height-side)/2,side,side,-110,-110,220,220);ctx.restore();
   ctx.font=`900 ${Math.min(lines.length>2?34:40,400/(Math.max(...lines.map(l=>l.length))*.65))}px sans-serif`;ctx.fillStyle='#f5f4e9';lines.slice(0,3).forEach((l,i)=>ctx.fillText(l,250,380+i*42));
  }else{
   ctx.save();ctx.translate(250,250);ctx.rotate(style===1?wave*.045:0);const scale=style===2?1+wave*.06:1;ctx.scale(scale,scale);ctx.fillStyle=color;ctx.font=`900 ${lines.some(l=>l.length>9)?52:72}px sans-serif`;
   lines.forEach((l,i)=>{const y=(i-(lines.length-1)/2)*80+22+(style===0?bounce:0);ctx.fillText(l,style===3?Math.sin(phase+i)*10:0,y);});ctx.restore();
   ctx.fillStyle='#a2a995';ctx.font='14px monospace';ctx.fillText('made for the feed.',250,438);
  }
  ctx.fillStyle=color;for(let j=0;j<4;j++){const x=45+j*135, y=100+j*80+Math.sin(phase+j)*18;ctx.globalAlpha=.25;ctx.fillRect(x,y,7,7);}ctx.globalAlpha=1;
  const pixels=ctx.getImageData(0,0,500,500).data;if(!palette)palette=quantize(pixels,128);gif.writeFrame(applyPalette(pixels,palette),500,500,{palette:frame===0?palette:undefined,delay:80,repeat:0});
  await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
 }
 gif.finish();return new Blob([new Uint8Array(gif.bytes())],{type:'image/gif'});
}
