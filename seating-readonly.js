(function(){
 'use strict';
 const cloud=window.DutyCloud,key='find-person-seating-cloud-cache-v1';
 let busy=false,generation=0,cache=null,lastSync='',activeController=null;
 const tools=document.querySelector('.seating-tools'),status=document.createElement('p');
 status.id='seatingCloudStatus';status.className='swipe-tip';document.getElementById('seatingBoard').before(status);
 const connect=document.createElement('button'),refresh=document.createElement('button');
 for(const button of [connect,refresh]){button.type='button';button.className='layout-toggle';tools.append(button);}
 connect.textContent='☁️ 连接';refresh.textContent='同步座位';connect.onclick=cloud.open;
 // This click is the only entry point that may request seating data.
 refresh.onclick=sync;
 function message(text){status.textContent=text;}
 function timeText(){return lastSync?new Date(lastSync).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'';}
 function dirty(){return cache?.seating&&state.seating&&JSON.stringify(cache.seating)!==JSON.stringify(state.seating);}
 function saveCache(){try{localStorage.setItem(key,JSON.stringify(cache));}catch{}}
 async function sync(){
  if(busy)return;
  busy=true;refresh.disabled=true;const ticket=generation;
  let timer,controller;
  try{
   await window.findPersonReady;
   if(ticket!==generation)return;
   if(!cloud.ready()){message('请先连接服务器，再点击“同步座位”。');return;}
   if(state.seatingEdit){message('正在本机调整座位，完成调整后再点击“同步座位”。');return;}
   if(dirty()&&!confirm('本机座位有调整，是否用服务器最新座位替换？请先导出需要保留的本机座位。'))return;
   const c=cloud.getConfig(),before=JSON.stringify(state.seating);
   const known=cache?.scope===c.scope&&!dirty()?cache?.revision:undefined;
   controller=new AbortController();activeController=controller;timer=setTimeout(()=>controller.abort(),15000);
   message('正在同步本次座位…');
   const response=await fetch(c.url,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'seating-read',token:c.token,...(known?{known}:{})}),signal:controller.signal});
   const result=await response.json();
   if(!response.ok||!result.ok)throw Error(result.error||'同步失败');
   if(ticket!==generation)return;
   if(result.access!=='board')throw Error('请导入白板只读连接文件');
   if(result.revision===null){message('服务器尚未保存座位，当前显示本机座位；需要时再点击同步。');return;}
   if(state.seatingEdit||cloud.getConfig().scope!==c.scope||before!==JSON.stringify(state.seating)){message('本机座位已修改，本次未替换；需要时再点击同步。');return;}
   if(!result.seating){
    if(!known||result.revision!==known)throw Error('服务器座位响应不完整');
    lastSync=new Date().toISOString();cache.lastSync=lastSync;saveCache();
    message('座位无变化 · 本次检查 '+timeText()+' · 仅手动同步');
    return; // Keep the existing board and horizontal scroll position untouched.
   }
   validateSeating(result.seating);
   await dbSet('seating',result.seating);
   if(ticket!==generation)return;
   state.seating=result.seating;lastSync=new Date().toISOString();
   cache={scope:c.scope,seating:JSON.parse(JSON.stringify(result.seating)),revision:result.revision,lastSync};saveCache();
   renderAll();message('已同步工作台座位 · '+timeText()+' · 仅手动同步');
  }catch(error){if(ticket===generation)message('本次同步失败，保留本机座位'+(lastSync?' · 上次同步 '+timeText():'')+'：'+(error.name==='AbortError'?'连接超时':error.message)+'；需要时再点击同步。');}
  finally{clearTimeout(timer);if(activeController===controller)activeController=null;busy=false;refresh.disabled=false;}
 }
 async function configure(){
  const ticket=++generation;activeController?.abort();
  await window.findPersonReady;if(ticket!==generation)return;
  cache=null;lastSync='';
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(cloud.ready()&&saved?.scope===cloud.getConfig().scope){validateSeating(saved.seating);cache=saved;lastSync=saved.lastSync||'';}}catch{}
  if(cloud.ready())message((lastSync?'上次同步 '+timeText()+' · ':'')+'仅点击“同步座位”时获取服务器数据。');
  else{localStorage.removeItem(key);message('请先连接服务器，再点击“同步座位”；不会自动联网同步座位。');}
 }
 window.addEventListener('duty-cloud-config',configure);
 configure(); // Local connection/cache display only; no network request.
})();
