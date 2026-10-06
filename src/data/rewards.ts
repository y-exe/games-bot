import {UserError} from '../errors.js';
export const rewards={janken:{win:40n,lose:-15n,draw:8n},connectfour:{win:180n,lose:-45n,draw:40n}};
export const botRewards={janken:{win:25n,lose:-10n,draw:5n},connectfour:{win:120n,lose:-30n,draw:25n}};
export function othelloReward(size:number,difference:number,early=false,bot=false) {
  const index=[6,8,10].indexOf(size);if(index<0)throw new UserError('盤面は6・8・10から選んでください。');
  const win=(early?(bot?[60,80,100]:[90,120,150]):(bot?[80,100,140]:[120,150,210]))[index]!;
  const step=(bot?[1,2,3]:[2,3,5])[index]!;
  return {win:BigInt(win+Math.max(0,difference)*step),lose:BigInt((bot?[-20,-25,-30]:[-30,-40,-45])[index]!),draw:BigInt((bot?[20,25,35]:[30,40,50])[index]!)};
}