import type {PemAntenna,PemReport} from '../shared/pem.ts';

export type PdfToken={s:string;x:number;y:number;w:number};
export type PdfLine={x1:number;y1:number;x2:number;y2:number};
const fold=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').trim();
const numeric=(s:string)=>{const v=s.replace(/[\s*]/g,'').replace(',','.');return /^-?\d+(?:\.\d+)?$/.test(v)?Number(v):null;};
const unique=(values:number[])=>[...new Set(values.map(v=>Math.round(v*10)/10))].sort((a,b)=>a-b);
const identity=(s:string,id:string)=>new RegExp(`(^|[^\\p{L}\\p{N}_-])${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}($|[^\\p{L}\\p{N}_-])`,'iu').test(s);
function textLines(tokens:PdfToken[]){
  const rows:{y:number;tokens:PdfToken[]}[]=[];
  for(const token of [...tokens].sort((a,b)=>b.y-a.y||a.x-b.x)){
    let row=rows.find(r=>Math.abs(r.y-token.y)<2);if(!row){row={y:token.y,tokens:[]};rows.push(row);}row.tokens.push(token);
  }
  return rows.sort((a,b)=>b.y-a.y).map(r=>r.tokens.sort((a,b)=>a.x-b.x).map(t=>t.s).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
}
export function parseAntennaPage(tokens:PdfToken[],lines:PdfLine[],stationIds:string[],page:number):PemAntenna[]{
  const az=tokens.find(t=>/^azymut(?:\s*\[.*)?$/.test(fold(t.s))),power=tokens.find(t=>/^eirp(?:\s.*)?$/.test(fold(t.s)));
  if(!az||!power||Math.abs(az.y-power.y)>45)return [];
  const near=tokens.filter(t=>Math.abs(t.y-az.y)<40),head=(re:RegExp)=>near.find(t=>re.test(fold(t.s)));
  const model=head(/^(typ|model)(?:\s|$)|^producent.*anten/),height=head(/^h$|^wysokosc/),band=head(/^pasm[oa]|^czestotliwosc/),id=head(/^identyfikator$|^id stacji/);
  if(!model||!height||!band||!id)return [];
  const xs=unique(lines.filter(l=>Math.abs(l.x1-l.x2)<1&&Math.abs(l.y1-l.y2)>10&&Math.max(l.y1,l.y2)>az.y-180&&Math.min(l.y1,l.y2)<az.y).map(l=>l.x1));
  const column=(t:PdfToken|undefined)=>{
    if(!t)return null;const x=t.x+t.w/2,i=xs.findIndex((v,i)=>i<xs.length-1&&v<x&&xs[i+1]>x);
    return i<0?null:{left:xs[i],right:xs[i+1],center:(xs[i]+xs[i+1])/2};
  };
  const mc=column(model),hc=column(height),ac=column(az),pc=column(power),bc=column(band),ic=column(id);
  if(!mc||!hc||!ac||!pc||!bc||!ic)return [];
  const tilt=column(head(/^tilt$|^pochylenie$/)),actualTilt=column(head(/^tilt w trakcie|^pochylenie.*pomiar/));
  const boundaries=(x:number)=>unique(lines.filter(l=>Math.abs(l.y1-l.y2)<1&&Math.min(l.x1,l.x2)<x&&Math.max(l.x1,l.x2)>x).map(l=>l.y1)).sort((a,b)=>b-a);
  const ys=boundaries(mc.center).filter(y=>y<Math.min(az.y,power.y,model.y)-2),idYs=boundaries(ic.center);
  const cell=(c:NonNullable<ReturnType<typeof column>>,bottom:number,top:number)=>textLines(tokens.filter(t=>t.x+t.w/2>c.left+.3&&t.x+t.w/2<c.right-.3&&t.y>bottom+.3&&t.y<top-.3));
  const powerUnits=cell(pc,ys[0]||0,az.y).join(' '),powerScale=/\[?kw\]?/i.test(powerUnits)?1000:/\[w\]/i.test(powerUnits)?1:null;
  const bandUnits=cell(bc,ys[0]||0,az.y).join(' '),bandScale=/ghz/i.test(bandUnits)?1000:1;
  const result:PemAntenna[]=[];
  for(let i=0;i<ys.length-1;i++){
    const top=ys[i],bottom=ys[i+1],mid=(top+bottom)/2;
    const idTop=[...idYs].reverse().find(y=>y>mid),idBottom=idYs.find(y=>y<mid);
    if(idTop===undefined||idBottom===undefined||!stationIds.some(s=>identity(cell(ic,idBottom,idTop).join(' '),s)))continue;
    const modelLines=cell(mc,bottom,top),azimuth=numeric(cell(ac,bottom,top).join('')),h=numeric(cell(hc,bottom,top).join(''));
    if(!modelLines.length||azimuth===null||azimuth<0||azimuth>360||h===null||h<0||h>1000)continue;
    const manufacturer=modelLines.find(v=>/^(huawei|andrew|commscope|kathrein|ericsson|nokia|amphenol|rfs|kmw|ace|tongyu|prose|rosenberger)\b/i.test(v)&&!/[0-9]/.test(v))||'';
    const modelName=modelLines.filter(v=>v!==manufacturer).join(' ');if(!modelName)continue;
    const bands=cell(bc,bottom,top).flatMap(v=>v.split(/\s*[,;/]\s*/)).filter(Boolean).map(v=>bandScale===1000&&numeric(v)!==null?String(numeric(v)!*1000):v);
    const ranges=tilt?cell(tilt,bottom,top).join('\n').replace(/-\s*\n\s*/g,'-').split('\n'):[];
    const actuals=actualTilt?cell(actualTilt,bottom,top).map(numeric):ranges.map(numeric);
    const settings=bands.map((band,j)=>{
      const range=(ranges[j]||ranges[0]||'').match(/^\s*(-?\d+(?:[,.]\d+)?)\s*[-–]\s*(-?\d+(?:[,.]\d+)?)\s*$/);
      return {band,tilt:actuals[j]??(actuals.length===1?actuals[0]:null)??null,min:range?numeric(range[1]):null,max:range?numeric(range[2]):null};
    });
    const actualValues=[...new Set(settings.flatMap(s=>s.tilt===null?[]:[s.tilt]))],mins=settings.flatMap(s=>s.min===null?[]:[s.min]),maxs=settings.flatMap(s=>s.max===null?[]:[s.max]);
    const rawPower=cell(pc,bottom,top).join(''),eirp=numeric(rawPower);
    result.push({id:`${page}-${i}`,model:modelName,manufacturer,azimuth:azimuth%360,height:h,bands:[...new Set(bands)],tilt:actualValues.length===1?actualValues[0]:null,tiltMin:mins.length?Math.min(...mins):null,tiltMax:maxs.length?Math.max(...maxs):null,eirp:eirp!==null&&powerScale!==null?eirp*powerScale:null,settings,sourcePage:page,eirpCombined:rawPower.includes('*')});
  }
  return result;
}

type Matrix=number[];
// Some laboratories publish a station-wide sector table without a merged ID column.
// Only read it when the document itself names the selected station.
export function parseSectorAntennaPage(tokens:PdfToken[],stationIds:string[],documentText:string,page:number,lines:PdfLine[]=[]):PemAntenna[]{
  if(!stationIds.some(id=>identity(documentText,id)))return [];
  const section=tokens.find(t=>/anteny sektorowe/.test(fold(t.s)));if(!section)return [];
  const end=tokens.find(t=>t.y<section.y&&/anteny radioliniowe/.test(fold(t.s)))?.y||0;
  const area=tokens.filter(t=>t.y<section.y&&t.y>end),az=area.find(t=>fold(t.s)==='azymut');if(!az)return [];
  const header=(re:RegExp)=>area.find(t=>Math.abs(t.y-az.y)<22&&re.test(fold(t.s)));
  const heads=[header(/^lp\.$/),header(/^czestotliwosc lub/),header(/^typ\/producent/),header(/^liczba$/),az,header(/^sredni kat/),header(/^zakres katow/),header(/^wysokosc$/),header(/^eirp$/)];
  if(heads.some(h=>!h))return [];
  const centers=heads.map(h=>h!.x+h!.w/2);
  if(centers.some((x,i)=>i>0&&x<=centers[i-1]))return [];
  const anchors=area.filter(t=>t.y<az.y-30&&Math.abs(t.x+t.w/2-centers[0])<6&&/^\d+$/.test(t.s)).sort((a,b)=>b.y-a.y);
  const result:PemAntenna[]=[];
  const bounds=unique(lines.filter(l=>Math.abs(l.y1-l.y2)<1&&Math.min(l.x1,l.x2)<centers[4]&&Math.max(l.x1,l.x2)>centers[4]).map(l=>l.y1)).sort((a,b)=>b-a);
  anchors.forEach((anchor,i)=>{
    const top=[...bounds].reverse().find(y=>y>anchor.y)??(i?((anchors[i-1].y+anchor.y)/2):az.y-25),bottom=bounds.find(y=>y<anchor.y)??(i+1<anchors.length?(anchors[i+1].y+anchor.y)/2:end+12);
    const cell=(column:number)=>textLines(area.filter(t=>t.y<top&&t.y>bottom&&t.x+t.w/2>(column?(centers[column-1]+centers[column])/2:0)&&t.x+t.w/2<(column<8?(centers[column]+centers[column+1])/2:600))).join('').trim();
    const bands=cell(1).split('/'),model=cell(2),count=numeric(cell(3)),azimuth=numeric(cell(4)),height=numeric(cell(7)),eirp=numeric(cell(8));
    if(!model||count!==1||azimuth===null||azimuth<0||azimuth>360||height===null||height<0||height>1000||!bands.every(b=>/^\d+(?:[,.]\d+)?$/.test(b)))return;
    const modelParts=model.split('/'),manufacturer=modelParts.length>1?modelParts.pop()!.trim():'';
    const actuals=cell(5).split('/').map(numeric),ranges=cell(6).split('/');
    const settings=bands.map((band,j)=>{const range=(ranges[j]||ranges[0]||'').match(/^(-?\d+(?:[,.]\d+)?)[–-](-?\d+(?:[,.]\d+)?)$/);return {band,tilt:actuals[j]??null,min:range?numeric(range[1]):null,max:range?numeric(range[2]):null};});
    const tilts=[...new Set(settings.flatMap(s=>s.tilt===null?[]:[s.tilt]))];
    result.push({id:`${page}-sector-${i}`,model:modelParts.join('/').trim(),manufacturer,azimuth:azimuth%360,height,bands,tilt:tilts.length===1?tilts[0]:null,tiltMin:null,tiltMax:null,eirp,settings,sourcePage:page});
  });
  return result;
}
const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export async function readPemPdf(bytes:Uint8Array,entry:PemReport):Promise<PemReport>{
  const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true,stopAtErrors:true});
  try{
    const pdf=await task.promise;if(pdf.numPages>60)throw new Error('Ten PDF jest zbyt obszerny do odczytu. Otwórz dokument źródłowy.');
    const antennas:PemAntenna[]=[];let documentText='';
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      const page=await pdf.getPage(pageNumber),content=await page.getTextContent();
      const tokens:PdfToken[]=content.items.flatMap(t=>'str' in t&&t.str.trim()?[{s:t.str.trim(),x:t.transform[4],y:t.transform[5],w:t.width}]:[]);
      documentText+=textLines(tokens).join('\n')+'\n';if(documentText.length>1_000_000)throw new Error('PDF przekracza limit odczytu tekstu.');
      if(!tokens.some(t=>fold(t.s).includes('eirp'))){page.cleanup();continue;}
      const operations=await page.getOperatorList(),lines:PdfLine[]=[],stack:Matrix[]=[];let matrix:Matrix=[1,0,0,1,0,0];
      for(let i=0;i<operations.fnArray.length;i++){
        const op=operations.fnArray[i],args=operations.argsArray[i];
        if(op===OPS.save)stack.push([...matrix]);else if(op===OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];
        else if(op===OPS.transform)matrix=multiply(matrix,args as number[]);
        else if(op===OPS.constructPath&&args?.[2]?.length===4){
          const b=args[2] as Float32Array;
          if(Math.abs(b[2]-b[0])>.8&&Math.abs(b[3]-b[1])>.8)continue;
          const point=(x:number,y:number)=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]];
          const a=point(b[0],b[1]),z=point(b[2],b[3]);lines.push({x1:a[0],y1:a[1],x2:z[0],y2:z[1]});
        }
      }
      const gridAntennas=parseAntennaPage(tokens,lines,entry.stationIds,pageNumber);
      antennas.push(...(gridAntennas.length?gridAntennas:parseSectorAntennaPage(tokens,entry.stationIds,documentText,pageNumber,lines)));page.cleanup();
    }
    const number=documentText.match(/\b\d{2,7}\s*\/\s*20\d{2}\s*\/\s*[A-Z]{1,10}\b/)?.[0].replace(/\s+/g,'')||entry.number;
    return {...entry,number,antennas,pdfPages:pdf.numPages,pdfStatus:antennas.length?'parsed':'unrecognized'};
  }finally{await task.destroy();}
}
