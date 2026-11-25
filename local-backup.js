/* ZEN — cópias automáticas locais via IndexedDB; sem nuvem. */
(function(){
"use strict";
const DB="zen_local_backups_v1",STORE="snapshots",KEEP=7,STALE=36*60*60*1000;
let dbPromise=null,userId=null,getSnapshot=null,onRestore=null,timer=null;
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!("indexedDB" in window)){reject(new Error("IndexedDB indisponível."));return;}
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE)){const st=d.createObjectStore(STORE,{keyPath:"id"});st.createIndex("userId","userId",{unique:false});}};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Falha ao abrir banco local."));
 });
 return dbPromise;
}
function run(mode,fn){return openDB().then(db=>new Promise((resolve,reject)=>{
 const t=db.transaction(STORE,mode),st=t.objectStore(STORE);let req;
 try{req=fn(st);}catch(e){reject(e);return;}
 t.oncomplete=()=>resolve(req&&req.result!==undefined?req.result:undefined);
 t.onerror=()=>reject(t.error||new Error("Falha no armazenamento local."));
 t.onabort=()=>reject(t.error||new Error("Operação cancelada."));
}));}
function list(){return openDB().then(db=>new Promise((resolve,reject)=>{
 const q=db.transaction(STORE,"readonly").objectStore(STORE).index("userId").getAll(userId);
 q.onsuccess=()=>resolve((q.result||[]).sort((a,b)=>b.createdAt-a.createdAt));q.onerror=()=>reject(q.error);
}));}
async function refresh(){
 const box=document.getElementById("zen-local-backup-status"),warning=document.getElementById("zen-local-backup-warning");
 if(!box)return;
 try{
  const items=await list(),last=items[0],btn=document.getElementById("zen-local-restore-btn");
  if(!last){box.textContent="Nenhum backup automático encontrado.";warning.textContent="O ZEN ainda não possui uma cópia local.";warning.classList.remove("hidden");if(btn)btn.disabled=true;return;}
  const age=Date.now()-last.createdAt;box.textContent="Último backup automático: "+new Date(last.createdAt).toLocaleString("pt-BR")+" · "+items.length+" cópia(s) mantida(s).";
  if(btn)btn.disabled=false;
  if(age>STALE){warning.textContent="Atenção: o último backup tem mais de 36 horas. Mantenha o ZEN aberto para a próxima cópia automática.";warning.classList.remove("hidden");}
  else{warning.textContent="Cópia local atualizada. O ZEN mantém até "+KEEP+" versões diárias neste navegador.";warning.classList.add("hidden");}
 }catch(e){box.textContent="Não foi possível consultar os backups locais: "+e.message;warning.textContent="Verifique se o navegador permite armazenamento local.";warning.classList.remove("hidden");}
}
async function capture(reason){
 if(!userId||!getSnapshot)return false;
 try{
  const data=getSnapshot();
  if(!data||!Array.isArray(data.tasks)||!Array.isArray(data.reminders)||!Array.isArray(data.pieceTypes))throw new Error("Dados do backup inválidos.");
  const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
  const item={id:userId+"|"+day,userId,createdAt:now,reason:String(reason||"automatico"),data:JSON.parse(JSON.stringify(data))};
  await run("readwrite",st=>st.put(item));
  const items=await list();
  await run("readwrite",st=>{items.slice(KEEP).forEach(x=>st.delete(x.id));});
  await refresh();return true;
 }catch(e){
  console.error("Falha no backup local:",e);
  const box=document.getElementById("zen-local-backup-status"),warning=document.getElementById("zen-local-backup-warning");
  if(box)box.textContent="Falha ao criar backup local.";
  if(warning){warning.textContent="Não foi possível criar a cópia automática. Exporte um backup JSON ou criptografado e confira o espaço disponível.";warning.classList.remove("hidden");}
  return false;
 }
}
async function restoreLatest(){
 try{
  const items=await list(),last=items[0];if(!last)return alert("Nenhum backup local disponível.");
  if(!confirm("Restaurar a cópia local de "+new Date(last.createdAt).toLocaleString("pt-BR")+"? Os registros atuais desta conta serão substituídos."))return;
  await onRestore(JSON.parse(JSON.stringify(last.data)));alert("Backup local restaurado com sucesso.");await refresh();
 }catch(e){console.error(e);alert("Não foi possível restaurar o backup local: "+e.message);}
}
async function start(id,snapshot,restore){
 userId=id;getSnapshot=snapshot;onRestore=restore;
 try{
  const items=await list(),today=new Date().toISOString().slice(0,10);
  if(!items.some(x=>x.id===userId+"|"+today))await capture("inicio-do-dia");else await refresh();
  if(timer)clearInterval(timer);
  timer=setInterval(async()=>{const current=await list().catch(()=>[]),day=new Date().toISOString().slice(0,10);if(!current.some(x=>x.id===userId+"|"+day))await capture("rotina-diaria");else await refresh();},30*60*1000);
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>false);
 }catch(e){console.error(e);const box=document.getElementById("zen-local-backup-status"),warning=document.getElementById("zen-local-backup-warning");if(box)box.textContent="Backup automático indisponível.";if(warning){warning.textContent="O navegador não disponibilizou armazenamento local de backups. Faça uma exportação externa.";warning.classList.remove("hidden");}}
}
window.ZEN_LOCAL_BACKUP={start,capture,refresh,restoreLatest};
})();