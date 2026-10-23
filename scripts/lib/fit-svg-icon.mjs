import sharp from 'sharp';
export async function fitIcon(svg,color,size=108,style){
 const body=svg.replace(/^.*?<svg\b[^>]*>/s,'').replace(/<\/svg>\s*$/,'').replace(/currentColor/g,color);
 const probe=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="white">${body}</svg>`);
 const data=await sharp(probe).ensureAlpha().raw().toBuffer();let x1=256,y1=256,x2=0,y2=0;
 for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(data[(y*256+x)*4+3]){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);}
 const scale=size/Math.max(x2-x1+1,y2-y1+1);
 if(style){
  const width=style.width/scale;
  return `<g transform="translate(64 64) scale(${scale}) translate(${-(x1+x2+1)/2} ${-(y1+y2+1)/2})" fill="${color}" stroke="${style.outline}" stroke-width="${width}" stroke-linejoin="round" paint-order="stroke fill">${body}</g>`;
 }
 return `<g fill="${color}" transform="translate(64 64) scale(${scale}) translate(${-(x1+x2+1)/2} ${-(y1+y2+1)/2})">${body}</g>`;
}
