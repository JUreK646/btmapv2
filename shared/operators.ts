export const OPERATORS=[
  {name:'Orange',color:'#ff7900'},
  {name:'T-Mobile',color:'#e20074'},
  {name:'Play',color:'#6c43bf'},
  {name:'Plus',color:'#13fb76'},
  {name:'Inne',color:'#788992'},
] as const;

export function operatorName(value:string){
  const name=value.trim().toLocaleLowerCase('pl-PL').replace(/[\u2010-\u2015]/g,'-');
  if(/\borange\b/.test(name))return 'Orange';
  if(/\bt[\s-]*mobile\b/.test(name))return 'T-Mobile';
  if(/\bplay\b|\bp4\b|\bon\s*tower\s+poland\b/.test(name))return 'Play';
  if(/\bplus\b|\bpolkomtel\b|\btowerlink\b|\baero\s*2\b/.test(name))return 'Plus';
  return 'Inne';
}
export const operatorColor=(name:string)=>OPERATORS.find(op=>op.name===operatorName(name))!.color;
