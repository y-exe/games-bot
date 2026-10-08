import {UserError} from '../errors.js';

export function outlineDistances(alpha:Uint8Array,width:number,height:number) {
  if(width<1||height<1||alpha.length!==width*height)throw new UserError('文字輪郭のサイズが不正です。');
  const distances=new Float32Array(width*height),far=width+height+1;
  if(!alpha.some(value=>value>=128)){distances.fill(Infinity);return distances;}
  for(let y=0;y<height;y++) {
    let last=-far;const row=y*width;
    for(let x=0;x<width;x++){if(alpha[row+x]!>=128)last=x;distances[row+x]=(x-last)**2;}
    last=width+far;
    for(let x=width-1;x>=0;x--){if(alpha[row+x]!>=128)last=x;distances[row+x]=Math.min(distances[row+x]!, (last-x)**2);}
  }
  const values=new Float64Array(height),sites=new Int32Array(height),cuts=new Float64Array(height+1);
  for(let x=0;x<width;x++) {
    for(let y=0;y<height;y++)values[y]=distances[y*width+x]!;
    let k=0;sites[0]=0;cuts[0]=-Infinity;cuts[1]=Infinity;
    for(let y=1;y<height;y++) {
      let site=sites[k]!,intersection=((values[y]!+y*y)-(values[site]!+site*site))/(2*(y-site));
      while(k>0&&intersection<=cuts[k]!){site=sites[--k]!;intersection=((values[y]!+y*y)-(values[site]!+site*site))/(2*(y-site));}
      sites[++k]=y;cuts[k]=intersection;cuts[k+1]=Infinity;
    }
    k=0;
    for(let y=0;y<height;y++){while(cuts[k+1]!<y)k++;const site=sites[k]!;distances[y*width+x]=(y-site)**2+values[site]!;}
  }
  return distances;
}
export function outlineCoverage(distances:Float32Array,radius:number) {
  if(!Number.isFinite(radius)||radius<0)throw new UserError('縁取りの太さが不正です。');
  const result=Buffer.alloc(distances.length);
  for(let i=0;i<result.length;i++)result[i]=Math.round(Math.min(1,Math.max(0,radius+.5-Math.sqrt(distances[i]!)))*255);
  return result;
}
