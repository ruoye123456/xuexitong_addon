const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
function page(html) {
 const dom = new JSDOM(html,{runScripts:'outside-only'});const w=dom.window;
 w.chrome={storage:{onChanged:{addListener(){}},local:{get:async()=>({cx_is_answering:true,cx_answer_source:'deepseek'})}}};
 w.HTMLElement.prototype.getClientRects=()=>[{}];
 w.eval(fs.readFileSync('ai-solver.js','utf8')+'\nwindow.solver=AISolver');
 w.document.querySelectorAll('.answerBg').forEach(el=>el.onclick=()=>{
  const span=el.querySelector('span');
  if(span.classList.contains('num_option_dx'))span.classList.toggle('check_answer_dx');
  else {el.parentNode.querySelectorAll('span').forEach(s=>s.classList.remove('check_answer'));span.classList.add('check_answer');}
 });
 return {w,s:w.solver,root:w.document.body};
}
const option=(label,text,multi=false)=>`<div class="answerBg"><span class="${multi?'num_option_dx':'num_option'}" data="${label}">${label}</span><p class="answer_p">${text}</p></div>`;
test('single choice uses scanned labels including shuffled options',()=>{
 const {s,root}=page('<h3 class="mark_name">1. 单选题 2+2？</h3>'+option('B','4')+option('A','3'));
 const p=s.read(root);assert.equal(p.question.type,'single');assert.equal(p.question.options[0].label,'B');assert.ok(s.apply(p,{answers:['B']}));
 assert.equal(s.apply(p,{answers:['Z']}),false);
});
test('multiple choice removes stale choices and is idempotent',()=>{
 const {s,root}=page('<h3 class="mark_name">多选题</h3>'+option('A','甲',true)+option('B','乙',true)+option('C','丙',true));
 const p=s.read(root);p.nodes[1].click();assert.ok(s.apply(p,{answers:['A','C']}));assert.ok(s.apply(p,{answers:['A','C']}));assert.equal(s.selected(p.nodes[1]),false);
});
test('blank answers preserve punctuation and dispatch input/change',()=>{
 const {s,w,root}=page('<div class="Zy_TItle">填空题</div><textarea></textarea><input type="text">');
 const p=s.read(root);let count=0;p.fields[0].addEventListener('input',()=>count++);p.fields[0].addEventListener('change',()=>count++);
 assert.ok(s.apply(p,{answers:['a, b','(x+y)']}));assert.equal(p.fields[0].value,'a, b');assert.equal(count,2);assert.equal(s.apply(p,{answers:['x']}),false);
});
test('pause while API is pending prevents filling',async()=>{
 const {s,w}=page('<div class="questionLi"><h3 class="mark_name">单选题</h3>'+option('A','甲')+option('B','乙')+'</div>');
 let enabled=true,release; s.enabled=async()=>enabled;
 w.chrome.runtime={sendMessage:()=>new Promise(r=>release=r)};
 const run=s.run();await new Promise(r=>setImmediate(r));enabled=false;release({ok:true,answers:['A']});await run;
 assert.equal(w.document.querySelector('.check_answer'),null);
});
function background(fetchImpl) {
 let handler;let calls=0;const local={cx_ai_model:'deepseek-flash',cx_is_answering:true,cx_answer_source:'deepseek'};
 const ctx={Map,Promise,URL,AbortController,setTimeout,clearTimeout,fetch:async(...args)=>{calls++;return fetchImpl(...args)},chrome:{runtime:{id:'abc',getURL:p=>'chrome-extension://abc/'+p,onMessage:{addListener:f=>handler=f}},storage:{local:{get:async()=>local,set:async d=>Object.assign(local,d)},session:{get:async()=>({cx_deepseek_key:'test-secret'}),set:async()=>{},remove:async()=>{}}}}};
 vm.runInNewContext(fs.readFileSync('background.js','utf8'),ctx);
 return {send:(msg,sender={id:'abc',url:'https://mooc1.chaoxing.com/test',tab:{id:1}})=>new Promise(r=>handler(msg,sender,r)),calls:()=>calls};
}
const question={title:'单选题',type:'single',options:[{label:'A',text:'甲'},{label:'B',text:'乙'}],blanks:0};
test('background authenticates sender and deduplicates simultaneous requests',async()=>{
 const b=background(async(url,init)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(JSON.parse(init.body).model,'deepseek-flash');return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"answers":["B"],"explanation":"解析"}'}}]})}});
 const msg={type:'CX_AI_SOLVE',question};const [a,c]=await Promise.all([b.send(msg),b.send(msg)]);assert.ok(a.ok);assert.ok(c.ok);assert.equal(b.calls(),1);
 assert.equal((await b.send(msg,{id:'abc',url:'https://evil.example/'})).ok,false);
 assert.equal((await b.send({type:'CX_AI_CONFIG'})).ok,false);
});
test('background rejects invalid model labels, truncated JSON and auth errors',async()=>{
 for(const response of [
 {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"answers":["Z"]}'}}]})},
 {ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{"answers":["A"]}'}}]})},
 {ok:false,status:401}]){
 const b=background(async()=>response);assert.equal((await b.send({type:'CX_AI_SOLVE',question})).ok,false);
 }
});
