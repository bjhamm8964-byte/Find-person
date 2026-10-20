document.body.dataset.dutyCloudRole="board";
// Shared by both standalone managers and the board. No embedded endpoint or credentials.
(function(){
 'use strict';
 const role=document.body.dataset.dutyCloudRole, key='find-person-duty-readonly-connection-v1';
 let config={};try{config=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
 const style=document.createElement('style');style.textContent=`.dc-modal{box-sizing:border-box;width:min(520px,92vw);max-height:88vh;overflow:auto;border:1px solid #cddcd3;border-radius:16px;padding:22px;color:#17332d;background:white;font:16px/1.5 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}.dc-modal::backdrop{background:#163a3066}.dc-modal h2{font-size:22px;margin:0 0 12px;padding-right:52px}.dc-modal #dc-close{position:absolute;top:12px;right:12px;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:2px solid #d68181;border-radius:12px;background:#fff0f0;color:#a32929;font:700 32px/1 sans-serif}.dc-modal #dc-close:focus-visible{outline:3px solid #a32929;outline-offset:3px}.dc-modal p,.dc-modal small{color:#60786c}.dc-modal label{display:block;margin:14px 0}.dc-modal input{box-sizing:border-box;width:100%;padding:10px;border:1px solid #bdcec3;border-radius:8px;font:16px sans-serif;min-height:44px}.dc-modal button{font:15px sans-serif;min-height:44px;padding:9px 12px;border:1px solid #cbd9ce;border-radius:8px;cursor:pointer}.dc-modal .dc-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.dc-modal .dc-primary{background:#216b50;color:white}.dc-message{white-space:pre-wrap;overflow-wrap:anywhere;color:#28694f;min-height:24px}#dc-status{font-size:12px;color:#506e60;line-height:1.5;display:block;margin:6px 0}#dc-config{margin-top:8px}#dc-publish{background:#216b50;color:white}#dc-board-status{font-size:13px;color:#416c58;max-width:260px;line-height:1.3;overflow-wrap:anywhere}.dc-busy{opacity:.6;pointer-events:none}`;document.head.append(style);
 const modal=document.createElement('dialog');modal.className='dc-modal';modal.innerHTML='<button id="dc-close" type="button" aria-label="关闭云同步设置" title="关闭云同步设置">×</button><h2>☁️ 教室云同步</h2><p>'+(role==='board'?'只接收已发布公告，不能修改安排。':'云端保存已发布公告与验收次数。照片及完整学生资料留在本机。')+'</p><label>公告接口地址（HTTPS）<input id="dc-url" type="url" placeholder="https://…/duty-sync" autocomplete="off"></label><label>'+(role==='board'?'白板查看凭证':'教师发布凭证')+'<input id="dc-token" type="password" autocomplete="off" spellcheck="false" autocapitalize="none"></label><small>凭证只保存在此浏览器，不加入公告或备份。仅在自己或教室专用设备连接。</small><div class="dc-message" id="dc-message" role="status"></div><input id="dc-connection-file" type="file" accept=".json,application/json" hidden><div class="dc-row"><button id="dc-import">📂 导入连接文件</button><button id="dc-save" class="dc-primary">保存并测试连接</button><button id="dc-disconnect">断开连接</button></div>';document.body.append(modal);
 const el=id=>document.getElementById(id);
 function valid(c){let u;try{u=new URL(c.url);}catch{throw Error('请填写完整的HTTPS接口地址');}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('接口需为HTTPS地址，不应包含密码、参数或片段');if(!/^[A-Za-z0-9_-]{43,128}$/.test(c.token||''))throw Error('请填写生成的完整连接凭证');return c;}
 async function request(data,c=config){if(data.action!=='read')throw Error('此入口只允许查看');valid(c);const control=new AbortController(),timer=setTimeout(()=>control.abort(),15000);try{const endpoint=String(data.action||'').startsWith('counts-')?c.url.replace(/\/duty-sync$/,'/duty-counts'):c.url;const res=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({...data,token:c.token}),signal:control.signal});let result;try{result=await res.json();}catch{throw Error('接口未返回公告数据，请检查云函数URL化地址');}if(!res.ok||!result.ok){const e=Error(result.error||'连接失败（'+res.status+'）');e.status=res.status;throw e;}return result;}catch(e){if(e.name==='AbortError')throw Error('连接超时，请检查网络');if(e instanceof TypeError)throw Error('无法连接，请检查网络、接口地址及允许来源设置');throw e;}finally{clearTimeout(timer);}}
 function ready(){return !!config.url&&!!config.token;}
 function notify(){window.dispatchEvent(new Event('duty-cloud-config'));}
 function open(){el('dc-url').value=config.url||'';el('dc-token').value=config.token||'';el('dc-message').textContent=ready()?'已保存连接，可修改后重新测试。':'尚未连接，先部署云服务，再填写地址与凭证。';modal.showModal();}
 el('dc-close').onclick=()=>modal.close();
 el('dc-save').onclick=async()=>{const button=el('dc-save');button.disabled=true;try{const candidate=valid({url:el('dc-url').value.trim().replace(/\/$/,''),token:el('dc-token').value.trim()});const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());const result=await request({action:'read',dates:[date]},candidate);if(result.access!==role)throw Error(role==='board'?'请使用白板只读凭证，不要使用教师发布凭证':'请使用教师发布凭证，查看凭证不能发布');if(candidate.url!==config.url||candidate.token!==config.token)candidate.scope=Date.now().toString(36)+Math.random().toString(36).slice(2);else candidate.scope=config.scope;localStorage.setItem(key,JSON.stringify(candidate));config=candidate;el('dc-token').value='';el('dc-message').textContent='连接成功，已保存。';notify();}catch(e){el('dc-message').textContent=e.message;}finally{button.disabled=false;}};
 el('dc-import').onclick=()=>el('dc-connection-file').click();
 el('dc-connection-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000)throw Error('请选择本系统连接JSON文件');const data=JSON.parse(await file.text());if(data.schema!=='duty-cloud-connection-v1'||data.role!==role)throw Error(role==='board'?'请选择教室白板只读连接文件':'请选择教师管理连接文件');const candidate=valid(data);el('dc-url').value=candidate.url;el('dc-token').value=candidate.token;await el('dc-save').onclick();}catch(error){el('dc-message').textContent=error.message;}finally{e.target.value='';}};
 el('dc-disconnect').onclick=()=>{localStorage.removeItem(key);localStorage.removeItem('find-person-duty-readonly-cache-v1');config={};el('dc-url').value='';el('dc-token').value='';el('dc-message').textContent='已断开连接；本机管理数据不受影响。';notify();};
 window.DutyCloud={request,ready,open,getConfig:()=>({...config})};
})();

(function(){
 const cloud=window.DutyCloud, key='find-person-duty-readonly-cache-v1';
 let generation=0, busy=false, days={},today='',selected='';
 window.FindDuty={date:'',plan:null,lastSync:'',error:'',connected:false};
 const dateKey=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
 const dates=()=>[-1,0,1].map(offset=>{const d=new Date(dateKey()+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()+offset);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(d);});
 const calendar=document.createElement('div');calendar.className='duty-calendar';calendar.setAttribute('aria-label','选择值日日期');$('dutyWeekNotice').before(calendar);
 function show(){
  const range=dates();if(today!==range[1]){today=range[1];selected=today;}
  for(const date of Object.keys(days))if(!range.includes(date))delete days[date];
  const entry=days[selected]||{};
  Object.assign(FindDuty,{date:selected,plan:entry.plan||null,lastSync:entry.lastSync||'',error:entry.error||'',connected:cloud.ready()});
  calendar.replaceChildren();range.forEach((date,index)=>{const button=document.createElement('button');button.type='button';button.className='secondary-button compact-button';button.setAttribute('aria-pressed',String(date===selected));button.textContent=['昨天','今天','明天'][index]+' '+date.slice(5);button.onclick=()=>{selected=date;show();sync();};calendar.append(button);});renderDuty();
 }
 function save(){try{localStorage.setItem(key,JSON.stringify({scope:cloud.getConfig().scope,days}));}catch{for(const date of dates())if(days[date])days[date].error='缓存空间不足，关闭后可能无法离线查看';}}
 function validate(plan,date){
  if(plan?.schema!=='duty-board-v1'||plan.version!==1||plan.date!==date||!Array.isArray(plan.assignments)||plan.assignments.length>100)throw Error('公告格式或日期错误');
  for(const row of plan.assignments){if(typeof row.area!=='string'||typeof row.task!=='string'||!Array.isArray(row.names)||row.names.length>20||row.names.some(n=>typeof n!=='string'||!n.trim()||n.length>60))throw Error('公告岗位格式错误');}
  return plan;
 }
 async function sync(){
  if(busy||!cloud.ready())return;
  busy=true;const ticket=generation,range=dates();$('dutyRefresh').disabled=true;
  range.forEach(date=>{days[date]={...days[date],error:'正在获取…'};});show();
  try{
   // The cloud endpoint accepts at most two dates per request.
   await Promise.all([[range[1],range[2]],[range[0]]].map(async batch=>{
    try{const result=await cloud.request({action:'read',dates:batch});if(ticket!==generation)return;if(result.access!=='board')throw Error('请使用白板只读连接文件');
     for(const date of batch){const entry=result.entries?.find(e=>e.date===date);if(!entry)throw Error('公告响应缺少日期');if(entry.revision!==null&&!entry.plan)throw Error('公告响应不完整');const plan=entry.revision===null?null:validate(entry.plan,date);days[date]={plan,lastSync:new Date().toISOString(),error:''};}
    }catch(e){if(ticket===generation)batch.forEach(date=>{days[date]={...days[date],error:'获取失败：'+e.message};});}
   }));
   if(ticket===generation){show();save();}
  }finally{busy=false;$('dutyRefresh').disabled=false;show();if(ticket!==generation&&cloud.ready())sync();}
 }
 function configure(){
  generation++;days={};today=dateKey();selected=today;
  try{const cached=JSON.parse(localStorage.getItem(key)||'null');if(cloud.ready()&&cached?.scope===cloud.getConfig().scope){const stored=cached.days||(cached.date?{[cached.date]:cached}:{});for(const date of dates()){const entry=stored[date];if(entry)days[date]={plan:entry.plan?validate(entry.plan,date):null,lastSync:entry.lastSync||'',error:''};}}}catch{}
  show();if(cloud.ready())sync();
 }
 window.refreshFindDuty=sync;$('dutyConnect').onclick=cloud.open;$('dutyRefresh').onclick=sync;
 window.addEventListener('duty-cloud-config',configure);
 window.addEventListener('online',()=>{if(state.mode==='duty')sync();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.mode==='duty')sync();});
 setInterval(()=>{if(today!==dateKey()){show();save();if(cloud.ready())sync();}},30000);
 configure();
})();
