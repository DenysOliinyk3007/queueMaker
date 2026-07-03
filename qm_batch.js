// simulate two batches with different methods, Thermo
function instMethod(c){const f=(c.thermoPath||'').replace(/[\/]+$/,'');return f?f+'\'+c.MSmethod:c.MSmethod;}
function fullExp(c,l){return l?c.expID+'_'+l:c.expID;}
function prefix(c,l,tag){return c.dateID+'_'+c.instName+c.instNo+'_Evo'+c.evosepNo+'_'+c.gradientID+'_'+tag+'_'+c.personalID+'_'+fullExp(c,l);}
function sampleName(c,l,w){return prefix(c,l,'SA')+'_'+w;}
function mkRow(cfg,inst,name,rack,well){return inst==='Thermo'?[name,'D:\',instMethod(cfg),'S'+rack+':'+well]:[name,cfg.MSmethod,cfg.LCmethod];}
const base={dateID:'20260703',instName:'OA',instNo:'2',evosepNo:'13',gradientID:'Whisper80',personalID:'DeOl',expID:'experiment',thermoPath:'C:\Xcalibur\methods\Denys\'};
const batches=[
  {cfg:{...base,MSmethod:'Method_A'},items:[{type:'sample',rack:1,well:'A1',label:'plate1'},{type:'sample',rack:1,well:'A2',label:'plate1'}]},
  {cfg:{...base,MSmethod:'Method_B'},items:[{type:'sample',rack:1,well:'B1',label:'plate1'}]},
];
const items=[]; batches.forEach(b=>b.items.forEach(it=>items.push({...it,cfg:b.cfg})));
console.log('File Name  |  Instrument Method');
items.forEach(it=>{const r=mkRow(it.cfg,'Thermo',sampleName(it.cfg,it.label,it.well),it.rack,it.well);console.log(r[0]+'  |  '+r[2]);});
