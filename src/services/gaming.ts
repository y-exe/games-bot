import sharp from 'sharp';

export function gamingFrame(rgba:Uint8Array,frame:number) {
  const output=Buffer.from(rgba);const shift=Math.trunc(frame*10*255/360);
  for(let p=0;p<rgba.length;p+=4) {
    const r=rgba[p]!,g=rgba[p+1]!,b=rgba[p+2]!;
    const v=Math.max(r,g,b),min=Math.min(r,g,b),difference=v-min;
    if(!difference)continue;
    const s=Math.trunc(Math.fround(difference/v)*255);
    const rc=Math.fround((v-r)/difference),gc=Math.fround((v-g)/difference),bc=Math.fround((v-b)/difference);
    const raw=r===v?Math.fround(bc-gc):g===v?Math.fround(2+rc-bc):Math.fround(4+gc-rc);
    const h=(Math.trunc(Math.fround((raw/6+1)%1)*255)+shift)%256;
    const sector=Math.floor(h*6/255),fraction=Math.fround(h*6/255-sector),saturation=Math.fround(s/255);
    const low=Math.round(v*(1-saturation));
    const falling=Math.round(v*(1-Math.fround(saturation*fraction)));
    const rising=Math.round(v*(1-saturation*(1-fraction)));
    const rgb=[[v,rising,low],[falling,v,low],[low,v,rising],[low,falling,v],[rising,low,v],[v,low,falling]][sector%6]!;
    output[p]=rgb[0]!;output[p+1]=rgb[1]!;output[p+2]=rgb[2]!;
  }
  return output;
}
export async function generateGamingGif(bytes:Buffer) {
  const {data,info}=await sharp(bytes,{limitInputPixels:30_000_000}).autoOrient().resize(256,256,{fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const frames=Array.from({length:36},(_,f)=>gamingFrame(data,f));
  return sharp(Buffer.concat(frames),{raw:{width:info.width,height:info.height*36,channels:4,pageHeight:info.height}}).gif({delay:Array(36).fill(50),loop:0,effort:3,keepDuplicateFrames:true}).toBuffer();
}
