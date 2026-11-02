(function(){
 'use strict';
 const cloud=window.DutyCloud,key='find-person-seating-cloud-cache-v1';let busy=false,generation=0,timer,cache=null,lastSync='';
 const tools=document.querySelector('.seating-tools'),status=document.createElement('p');status.id='seatingCloudStatus';status.className='swipe-tip';document.getElementById('seatingBoard').before(status);
 const connect=document.createElement('button'),refresh=document.createElement('button');for(const b of [connect,refresh]){b.type='button';b.className='layout-toggle';tools.append(b);}connect.textContent='☁️ 连接';refresh.textContent='同步座位';connect.onclick=cloud.open;refresh.onclick=()=>sync(true);
 function message(s){status.textContent=s;}
 function dirty(){return cache?.seating&&state.seating&&JSON.stringify(cache.seating)!==JSON.stringify(state.seating);}
 async function sync(manual=false){
  await window.findPersonReady;
  if(busy)return;if(!cloud.ready()){message('连接服务器后，可自动获取工作台保存的座位。');return;}
  if(state.seatingEdit){message('正在本机调整座位，完成调整后再同步。');return;}
  if(dirty()&&(!manual||!confirm('本机座位有调整，是否用服务器最新座位替换？请先导出需要保留的本机座位。'))){message('本机座位有调整，已暂停自动覆盖；点“同步座位”获取服务器版本。');return;}
  busy=true;refresh.disabled=true;const ticket=generation,c=cloud.getConfig(),before=JSON.stringify(state.seating);
  const controller=new AbortController();timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch(c.url,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'seating-read',token:c.token}),signal:controller.signal});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'同步失败');if(ticket!==generation)return;if(result.access!=='board')throw Error('请导入白板只读连接文件');
   if(result.revision===null){message('服务器尚未保存座位，当前显示本机座位。');return;}
   validateSeating(result.seating);
   if(state.seatingEdit||cloud.getConfig().scope!==c.scope||before!==JSON.stringify(state.seating)){message('本机座位已修改，请手动同步。');return;}
   // Recheck after the request in case an import or a local edit happened in flight.
   if(dirty()&&!manual){message('本机座位已修改，请手动同步。');return;}
   await dbSet('seating',result.seating);if(ticket!==generation)return;state.seating=result.seating;lastSync=new Date().toISOString();cache={scope:c.scope,seating:JSON.parse(JSON.stringify(result.seating)),revision:result.revision,lastSync};try{localStorage.setItem(key,JSON.stringify(cache));}catch{}
   renderAll();message('已同步工作台座位 · '+new Date(lastSync).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}));
  }catch(e){if(ticket===generation)message('同步失败，保留本机座位'+(lastSync?' · 上次同步 '+new Date(lastSync).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'')+'：'+(e.name==='AbortError'?'连接超时':e.message));}
  finally{clearTimeout(timer);busy=false;refresh.disabled=false;if(ticket!==generation&&cloud.ready())sync();}
 }
 async function configure(){generation++;await window.findPersonReady;cache=null;lastSync='';try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(cloud.ready()&&saved?.scope===cloud.getConfig().scope){validateSeating(saved.seating);cache=saved;lastSync=saved.lastSync||'';}}catch{}
 if(cloud.ready())sync();else{localStorage.removeItem(key);message('连接服务器后，可自动获取工作台保存的座位。');}}
 window.refreshFindSeating=sync;window.addEventListener('duty-cloud-config',configure);window.addEventListener('online',()=>{if(state.mode==='seating')sync();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.mode==='seating')sync();});setInterval(()=>{if(!document.hidden&&state.mode==='seating')sync();},60000);configure();
})();
