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

// Reproduce the planner's board-dimension initialization. The board renderer
// uses boardW/boardH in preference to w/h.
for(const era of Object.values(ERA_DATA)){
  for(const def of [...era.residential,...era.goods,...era.lifeSupport]){
    def.boardW=def.w;
    def.boardH=def.h;
  }
}

const context={
  window:{},
  ERA_DATA,
  workspace:{eras:{SAT:null}},
  selectedEra:'SAM',
  colonyConfigCellState:()=> 'empty',
  applyColonyState:()=>true,
  renderBuildMenu:()=>{},
  render:()=>{},
  saveWorkspace:()=>{}
};

vm.runInNewContext(fs.readFileSync('site/sat-building-dimensions.js','utf8'),context,{filename:'site/sat-building-dimensions.js'});
vm.runInNewContext(fs.readFileSync('site/sat-board-orientation.js','utf8'),context,{filename:'site/sat-board-orientation.js'});

const expected=new Map([
  ['heatedResidence',[4,3]],
  ['matterCompressionReactor',[4,6]],
  ['moleculeDrill',[6,4]],
  ['experimentalTestSite',[5,4]],
  ['purificationFacility',[4,5]],
  ['chemicalCleaningPlant',[3,6]]
]);

const defs=[...ERA_DATA.SAT.residential,...ERA_DATA.SAT.goods];
for(const [key,[w,h]] of expected){
  const def=defs.find(item=>item.key===key);
  if(!def){failures.push(`Missing SAT building ${key}`);continue;}
  if(def.w!==w||def.h!==h)failures.push(`${key}: visible dimensions ${def.w}×${def.h}, expected ${w}×${h}`);
  if(def.boardW!==w||def.boardH!==h)failures.push(`${key}: board dimensions ${def.boardW}×${def.boardH}, expected ${w}×${h}`);
  if(def.sizeText!==`${w}×${h}`)failures.push(`${key}: label ${def.sizeText}, expected ${w}×${h}`);
  if(def.requiresPath!==false)failures.push(`${key}: SAT building must not require a path`);
}

if(failures.length){
  console.error(JSON.stringify({ok:false,failures},null,2));
  process.exit(1);
}

console.log(JSON.stringify({ok:true,checked:[...expected.keys()]},null,2));
