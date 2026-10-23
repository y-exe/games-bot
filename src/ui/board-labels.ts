export function boardLabel(value:number):string {
  if(!Number.isInteger(value)||value<0||value>35)throw new RangeError('盤面ラベルは0〜35で指定してください。');
  return value<10?String(value):String.fromCharCode(65+value-10);
}

export function boardLabelEmoji(value:number,color:'blue'|'green'|'red'='blue'):string {
  const label=boardLabel(value);
  return `${color==='blue'?'b':color==='green'?'g':'r'}_${label}`;
}
