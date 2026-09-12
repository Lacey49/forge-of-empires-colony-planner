import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html','utf8');
const failures=[];

function extractConst(source,name){
  const marker=`const ${name}=`;
  const start=source.indexOf(marker);
  if(start<0)throw new Error(`Missing ${name}`);
  const cursor=start+marker.length;
  const opening=source[cursor];
  const closing=opening==='{'?'}':opening==='['?']':null;
  if(!closing)throw new Error(`${name} is not an object or array`);
  let depth=0,quote=null,escaped=false;
  for(let i=cursor;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote=null;
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch===opening)depth++;
    else if(ch===closing&&--depth===0)return source.slice(cursor,i+1);
  }
  throw new Error(`Could not parse ${name}`);
}

const ERA_DATA=JSON.parse(extractConst(html,'ERA_DATA'));

function allDefs(){
  return Object.values(ERA_DATA).flatMap(era=>[
    era.townHall,
    ...era.residential,
    ...era.goods,
    ...era.lifeSupport
  ].filter(Boolean));
}

function eraBuildingByKey(era,key){
  const data=ERA_DATA[era];
  if(!data)return null;
  if(data.townHall?.key===key)return data.townHall;
  return [...data.residential,...data.goods,...data.lifeSupport].find(def=>def.key===key)||null;
}

// Recreate the old split-dimension bug before loading the cleanup module.
for(const def of allDefs()){
  def.boardW=def.w+20;
  def.boardH=def.h+20;
}

const context={
  window:{},
  ERA_DATA,
  eraBuildingByKey,
  boardBuildingDef:def=>def?{...def,w:def.boardW??def.w,h:def.boardH??def.h}:null,
  eraBoardBuildingByKey:(era,key)=>{
    const def=eraBuildingByKey(era,key);
    return def?{...def,w:def.boardW??def.w,h:def.boardH??def.h}:null;
  },
  workspace:{eras:{SAT:null}},
  selectedEra:'SAM',
  colonyConfigCellState:()=> 'empty',
  applyColonyState:()=>true,
  renderBuildMenu:()=>{},
  render:()=>{},
  saveWorkspace:()=>{}
};

vm.runInNewContext(fs.readFileSync('site/dimension-unification.js','utf8'),context,{filename:'site/dimension-unification.js'});

for(const def of allDefs()){
  if(Object.prototype.hasOwnProperty.call(def,'boardW'))failures.push(`${def.name}: boardW still exists`);
  if(Object.prototype.hasOwnProperty.call(def,'boardH'))failures.push(`${def.name}: boardH still exists`);
}

const probe=ERA_DATA.SAM.residential[0];
const unified=context.boardBuildingDef(probe);
if(unified.w!==probe.w||unified.h!==probe.h)failures.push('boardBuildingDef does not use w/h directly');

vm.runInNewContext(fs.readFileSync('site/sat-building-dimensions.js','utf8'),context,{filename:'site/sat-building-dimensions.js'});

const expected=new Map([
  ['heatedResidence',[4,3]],
  ['matterCompressionReactor',[4,6]],
  ['moleculeDrill',[6,4]],
  ['experimentalTestSite',[5,4]],
  ['purificationFacility',[4,5]],
  ['chemicalCleaningPlant',[3,6]],
  ['hotChocolateBar',[4,3]]
]);

for(const [key,[w,h]] of expected){
  const def=eraBuildingByKey('SAT',key);
  if(!def){failures.push(`Missing SAT building ${key}`);continue;}
  if(def.w!==w||def.h!==h)failures.push(`${key}: ${def.w}×${def.h}, expected ${w}×${h}`);
  if(def.sizeText!==`${w}×${h}`)failures.push(`${key}: label ${def.sizeText}, expected ${w}×${h}`);
  if(Object.prototype.hasOwnProperty.call(def,'boardW')||Object.prototype.hasOwnProperty.call(def,'boardH')){
    failures.push(`${key}: duplicate board dimensions were recreated`);
  }
  const boardDef=context.eraBoardBuildingByKey('SAT',key);
  if(boardDef.w!==w||boardDef.h!==h)failures.push(`${key}: board lookup does not use unified w/h`);
}

if(failures.length){
  console.error(JSON.stringify({ok:false,failures},null,2));
  process.exit(1);
}

console.log(JSON.stringify({ok:true,checked:'all building definitions plus verified SAT orientations'},null,2));
