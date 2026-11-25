/* ZEN — autenticação local/offline */
(function () {
"use strict";
const USERS_KEY="zen_auth_users_v1", LOCK_KEY="zen_auth_lock_v1", SESSION_KEY="zen_auth_session_v1", ITERATIONS=310000;
let currentUser=null, bootCallback=null;
const enc=new TextEncoder();
const b64=function(v){return btoa(String.fromCharCode.apply(null,new Uint8Array(v)));};
const un64=function(v){return Uint8Array.from(atob(v),function(c){return c.charCodeAt(0);});};
const users=function(){try{const v=JSON.parse(localStorage.getItem(USERS_KEY)||"[]");return Array.isArray(v)?v:[];}catch(e){return[];}};
const saveUsers=function(v){localStorage.setItem(USERS_KEY,JSON.stringify(v));};
const norm=function(v){return String(v||"").trim().toLowerCase();};
const rand=function(n){return crypto.getRandomValues(new Uint8Array(n));};
const esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
async function derive(pass,salt){const key=await crypto.subtle.importKey("raw",enc.encode(pass),"PBKDF2",false,["deriveBits"]);return b64(await crypto.subtle.deriveBits({name:"PBKDF2",salt:salt,iterations:ITERATIONS,hash:"SHA-256"},key,256));}
async function credentials(pass){const salt=rand(16);return {salt:b64(salt),passwordHash:await derive(pass,salt),iterations:ITERATIONS};}
async function verify(pass,user){const a=un64(await derive(pass,un64(user.salt))),b=un64(user.passwordHash);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
function message(id,text,error){const e=document.getElementById(id);if(e){e.textContent=text;e.style.color=error?"#b91c1c":"#64748b";}}
function styles(){if(document.getElementById("zen-auth-style"))return;const s=document.createElement("style");s.id="zen-auth-style";s.textContent=
"body.zen-locked{overflow:hidden}"+
"#zen-auth-screen{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(circle at 15% 10%,#dbeafe 0,transparent 35%),linear-gradient(135deg,#f8fafc,#e2e8f0);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}"+
"#zen-auth-screen .auth-card{width:min(100%,420px);background:#fff;border:1px solid #dbe3ee;border-radius:18px;padding:30px;box-shadow:0 24px 70px rgba(15,23,42,.16);color:#0f172a}"+
"#zen-auth-screen .auth-mark{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#2563eb,#1e3a8a);color:#fff;font-size:22px;font-weight:800;margin-bottom:18px}"+
"#zen-auth-screen h1{margin:0;font-size:23px}#zen-auth-screen p{color:#64748b;font-size:13px;line-height:1.5}"+
"#zen-auth-screen label{display:block;margin:13px 0 5px;font-size:12px;font-weight:700;color:#475569}"+
"#zen-auth-screen input{width:100%;padding:12px 13px;border:1px solid #cbd5e1;border-radius:9px;font-size:14px;background:#fff;color:#0f172a}"+
"#zen-auth-screen button{border:0;border-radius:9px;padding:11px 15px;font-weight:700;cursor:pointer;font-size:13px}"+
"#zen-auth-screen .auth-primary{background:#2563eb;color:#fff;width:100%;margin-top:20px}"+
"#zen-auth-screen .auth-message{min-height:18px;margin:12px 0 0;font-size:12px}"+
"#zen-auth-screen .auth-foot{margin-top:22px;padding-top:14px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;text-align:center}"+
"#zen-user-tools{display:flex;align-items:center;gap:7px;flex-wrap:wrap}#zen-user-tools .user-name{font-size:12px;color:var(--text-muted);font-weight:700}"+
"#zen-admin-modal{position:fixed;inset:0;z-index:99990;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px}"+
"#zen-admin-modal .admin-card{background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:14px;padding:24px;width:min(100%,900px);max-height:92vh;overflow:auto;box-shadow:0 24px 70px rgba(15,23,42,.25)}"+
"#zen-admin-modal .admin-card h2{font-size:19px;color:var(--text)}#zen-admin-modal .admin-card label{display:block;font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:5px}#zen-admin-modal .admin-card .btn{min-height:32px}#zen-admin-modal .admin-card table{min-width:680px}#zen-admin-modal .admin-card .table-container{border-radius:9px}#zen-admin-modal .admin-card .admin-grid>div{min-width:0}"+
"#zen-admin-modal input{padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);width:100%}"+
"#zen-admin-modal .admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:12px 0}"+
"#zen-admin-modal .admin-actions{display:flex;gap:6px;flex-wrap:wrap}"+
"#zen-admin-modal{backdrop-filter:blur(5px)}"+
"#zen-admin-modal .admin-card{width:min(100%,980px);padding:0;overflow:hidden;display:flex;flex-direction:column;max-height:min(92vh,900px)}"+
"#zen-admin-modal .admin-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 26px;background:var(--surface-subtle);border-bottom:1px solid var(--border)}"+
"#zen-admin-modal .admin-title{margin:0!important;padding:0!important;border:0!important;font-size:19px!important;font-weight:800}"+
"#zen-admin-modal .admin-subtitle{margin:4px 0 0;color:var(--text-muted);font-size:12px}"+
"#zen-admin-modal .admin-content{padding:22px 26px;overflow:auto}"+
"#zen-admin-modal .admin-create{display:block!important;background:var(--surface-subtle);border:1px solid var(--border);border-radius:10px;padding:16px;margin:0 0 20px}"+
"#zen-admin-modal .admin-create h3{margin:0 0 12px;font-size:14px;color:var(--text)}"+
"#zen-admin-modal .admin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 14px}"+
"#zen-admin-modal .admin-field{min-width:0}"+
"#zen-admin-modal .admin-field label{display:block;margin:0 0 6px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}"+
"#zen-admin-modal .admin-field input,#zen-admin-modal .admin-field select{height:38px;width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text);font:inherit;font-size:13px}"+
"#zen-admin-modal .admin-create-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}"+
"#zen-admin-modal #admin-message{font-size:12px;color:var(--text-muted)}"+
"#zen-admin-modal .admin-users-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}"+
"#zen-admin-modal .admin-users-head h3{margin:0;font-size:14px}"+
"#zen-admin-modal .table-container{margin:0;max-height:42vh;overflow:auto}"+
"#zen-admin-modal .admin-card table{width:100%;min-width:700px}"+
"#zen-admin-modal .admin-card th{position:sticky;top:0;z-index:1}"+
"#zen-admin-modal .admin-card td{padding:10px}"+
"#zen-admin-modal .admin-actions{display:flex;gap:6px;flex-wrap:wrap}"+
"#zen-admin-modal .admin-actions .btn{padding:6px 9px;font-size:11px}"+
"#zen-admin-modal .admin-foot{margin:14px 0 0;color:var(--text-muted);font-size:11px;line-height:1.5}"+
"@media(max-width:760px){#zen-admin-modal .admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#zen-admin-modal .admin-top,#zen-admin-modal .admin-content{padding:16px}}"+
"@media(max-width:480px){#zen-admin-modal{padding:8px}#zen-admin-modal .admin-grid{grid-template-columns:1fr}#zen-admin-modal .admin-card{max-height:96vh}#zen-admin-modal .table-container{max-height:38vh}}"+
"@media(max-width:560px){#zen-auth-screen .auth-card{padding:23px}#zen-user-tools .user-name{display:none}}";
document.head.appendChild(s);}
function formMarkup(setup){let html='<div id="zen-auth-screen"><div class="auth-card"><div class="auth-mark">Z</div><h1>'+(setup?"Configuração inicial":"Acesse o ZEN")+'</h1><p>'+(setup?"Crie a conta administradora para gerenciar os usuários.":"Entre com seu usuário e senha para acessar o organizador.")+'</p>';
if(setup){html+='<form id="zen-setup"><label>Nome do administrador</label><input id="setup-name" required maxlength="60"><label>Nome de usuário</label><input id="setup-user" required minlength="3" maxlength="32" autocomplete="username"><label>Senha (mínimo 10 caracteres)</label><input id="setup-pass" type="password" required minlength="10" autocomplete="new-password"><label>Confirmar senha</label><input id="setup-confirm" type="password" required minlength="10"><button class="auth-primary">Criar administrador</button></form>';}
else{html+='<form id="zen-login"><label>Usuário</label><input id="login-user" required autocomplete="username"><label>Senha</label><input id="login-pass" type="password" required autocomplete="current-password"><button class="auth-primary">Entrar no ZEN</button></form>';}
html+='<div id="zen-auth-message" class="auth-message" role="status"></div><div class="auth-foot">ZEN Jurídico · Acesso local neste navegador</div></div></div>';return html;}
function showScreen(setup){styles();document.body.classList.add("zen-locked");const old=document.getElementById("zen-auth-screen");if(old)old.remove();document.body.insertAdjacentHTML("afterbegin",formMarkup(setup));if(setup){document.getElementById("zen-setup").addEventListener("submit",createAdmin);}else{document.getElementById("zen-login").addEventListener("submit",login);}}
function migrate(id){[["zen_pro_tasks_v5","tasks"],["zen_pro_reminders_v2","reminders"],["zen_pro_types_v5","types"]].forEach(function(pair){const target="zen_user_"+id+"_"+pair[1];if(localStorage.getItem(target)===null){const old=localStorage.getItem(pair[0]);if(old!==null)localStorage.setItem(target,old);}});}
async function createAdmin(e){e.preventDefault();const name=document.getElementById("setup-name").value.trim(),username=norm(document.getElementById("setup-user").value),pass=document.getElementById("setup-pass").value,confirm=document.getElementById("setup-confirm").value;if(username.length<3||!/^[a-z0-9._-]+$/.test(username))return message("zen-auth-message","Usuário inválido: use letras, números, ponto, hífen ou sublinhado.",true);if(pass.length<10)return message("zen-auth-message","A senha deve ter pelo menos 10 caracteres.",true);if(pass!==confirm)return message("zen-auth-message","As senhas não conferem.",true);try{const user=Object.assign({id:"u_"+b64(rand(12)).replace(/[+/=]/g,"").toLowerCase(),name:name,username:username,role:"admin",active:true,createdAt:new Date().toISOString()},await credentials(pass));saveUsers([user]);migrate(user.id);await establish(user);}catch(err){console.error(err);message("zen-auth-message","Falha ao criar a conta. Abra o ZEN em HTTPS.",true);}}
function lockData(){try{return JSON.parse(localStorage.getItem(LOCK_KEY)||"{}");}catch(e){return{};}}
function fail(name){const all=lockData(),v=all[name]||{count:0,until:0};v.count++;if(v.count>=5){v.count=0;v.until=Date.now()+60000;}all[name]=v;localStorage.setItem(LOCK_KEY,JSON.stringify(all));}
function clearFail(name){const all=lockData();delete all[name];localStorage.setItem(LOCK_KEY,JSON.stringify(all));}
async function login(e){e.preventDefault();const name=norm(document.getElementById("login-user").value),pass=document.getElementById("login-pass").value,lock=lockData()[name];if(lock&&lock.until>Date.now())return message("zen-auth-message","Muitas tentativas. Aguarde "+Math.ceil((lock.until-Date.now())/1000)+" segundo(s).",true);const user=users().find(u=>u.username===name);if(!user||!user.active){fail(name);return message("zen-auth-message","Usuário ou senha inválidos, ou conta desativada.",true);}try{if(!await verify(pass,user)){fail(name);return message("zen-auth-message","Usuário ou senha inválidos.",true);}const latest=users().find(u=>u.id===user.id);if(!latest||!latest.active)return message("zen-auth-message","Conta desativada.",true);clearFail(name);await establish(latest,true);}catch(err){console.error(err);message("zen-auth-message","Não foi possível validar a senha.",true);}}
let explicitLoginInProgress=false;async function establish(user,explicitLogin){currentUser={id:user.id,name:user.name,username:user.username,role:user.role};explicitLoginInProgress=explicitLogin===true;localStorage.setItem(SESSION_KEY,user.id);document.getElementById("zen-auth-screen")?.remove();document.body.classList.remove("zen-locked");document.querySelector("header")?.classList.remove("hidden");document.querySelector(".app-layout")?.classList.remove("hidden");document.querySelector("footer")?.classList.remove("hidden");injectTools();if(typeof bootCallback==="function")await bootCallback();explicitLoginInProgress=false;}
function injectTools(){const actions=document.querySelector(".header-actions");if(!actions)return;document.getElementById("zen-user-tools")?.remove();const wrap=document.createElement("div");wrap.id="zen-user-tools";wrap.innerHTML='<span class="user-name">'+esc(currentUser.name)+'</span><button type="button" class="btn btn-ghost" id="zen-logout">Deslogar</button>';actions.appendChild(wrap);document.getElementById("zen-logout").addEventListener("click",logout);}
function logout(){localStorage.removeItem(SESSION_KEY);currentUser=null;document.getElementById("zen-user-tools")?.remove();document.querySelector("header")?.classList.add("hidden");document.querySelector(".app-layout")?.classList.add("hidden");document.querySelector("footer")?.classList.add("hidden");showScreen(false);}
function key(suffix){if(!currentUser)throw new Error("Usuário não autenticado.");return "zen_user_"+currentUser.id+"_"+suffix;}
function isCurrentAdmin(){if(!currentUser)return false;const fresh=users().find(function(u){return u.id===currentUser.id;});return !!fresh&&fresh.active===true&&fresh.role==="admin";}
function activeAdminCount(list){return list.filter(function(u){return u.active===true&&u.role==="admin";}).length;}
function logAdmin(action,detail){try{const all=JSON.parse(localStorage.getItem("zen_admin_logs_v1")||"[]");all.unshift({at:new Date().toISOString(),username:currentUser?currentUser.username:"",name:currentUser?currentUser.name:"",action:String(action),details:String(detail||"").slice(0,250)});localStorage.setItem("zen_admin_logs_v1",JSON.stringify(all.slice(0,1500)));}catch(e){}}
function adminModal(){
if(!isCurrentAdmin())return;
document.getElementById("zen-admin-modal")?.remove();
const modal=document.createElement("div");
modal.id="zen-admin-modal";
modal.setAttribute("role","presentation");
modal.style.cssText="position:fixed!important;inset:0!important;z-index:2147483000!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:18px!important;box-sizing:border-box!important;background:rgba(15,23,42,.62)!important;backdrop-filter:blur(5px)!important;overflow:auto!important;";
modal.innerHTML='<style>'+
'#zen-admin-modal *{box-sizing:border-box}'+
'#zen-admin-modal .zen-users-card{width:min(960px,100%);max-height:calc(100vh - 36px);background:var(--surface,#fff);color:var(--text,#1e293b);border:1px solid var(--border,#e2e8f0);border-radius:16px;box-shadow:0 25px 80px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden;font-family:inherit}'+
'#zen-admin-modal .zen-users-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 26px;background:var(--surface-subtle,#f8fafc);border-bottom:1px solid var(--border,#e2e8f0);flex:none}'+
'#zen-admin-modal .zen-users-head h2{margin:0;font-size:19px;line-height:1.3;font-weight:800;color:var(--text,#1e293b)}'+
'#zen-admin-modal .zen-users-head p{margin:5px 0 0;font-size:12px;color:var(--text-muted,#64748b)}'+
'#zen-admin-modal .zen-users-body{padding:22px 26px;overflow:auto;min-height:0}'+
'#zen-admin-modal .zen-users-create{display:block!important;margin:0 0 22px;padding:17px;border:1px solid var(--border,#e2e8f0);border-radius:11px;background:var(--surface-subtle,#f8fafc)}'+
'#zen-admin-modal .zen-users-create h3,#zen-admin-modal .zen-users-list-head h3{margin:0 0 13px;font-size:14px;font-weight:750;color:var(--text,#1e293b)}'+
'#zen-admin-modal .zen-users-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}'+
'#zen-admin-modal .zen-users-field{min-width:0}'+
'#zen-admin-modal .zen-users-field label{display:block;margin:0 0 6px;font-size:11px;font-weight:700;color:var(--text-muted,#64748b)}'+
'#zen-admin-modal .zen-users-field input,#zen-admin-modal .zen-users-field select{display:block;width:100%;height:40px;margin:0;padding:8px 11px;border:1px solid var(--border,#cbd5e1);border-radius:8px;background:var(--surface,#fff);color:var(--text,#1e293b);font:inherit;font-size:13px;box-shadow:none}'+
'#zen-admin-modal .zen-users-form-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}'+
'#zen-admin-modal #admin-message{font-size:12px;color:var(--text-muted,#64748b)}'+
'#zen-admin-modal .zen-users-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}'+
'#zen-admin-modal .zen-users-list-head h3{margin:0}'+
'#zen-admin-modal .zen-users-table-wrap{width:100%;overflow:auto;border:1px solid var(--border,#e2e8f0);border-radius:9px}'+
'#zen-admin-modal table{width:100%;min-width:680px;border-collapse:collapse;font-size:12px}'+
'#zen-admin-modal th{padding:11px 12px;text-align:left;background:var(--surface-subtle,#f8fafc);color:var(--text-muted,#64748b);font-size:10px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border,#e2e8f0)}'+
'#zen-admin-modal td{padding:11px 12px;text-align:left;vertical-align:middle;border-bottom:1px solid var(--border,#e2e8f0);color:var(--text,#1e293b)}'+
'#zen-admin-modal tbody tr:last-child td{border-bottom:0}'+
'#zen-admin-modal .admin-actions{display:flex;gap:6px;flex-wrap:wrap}'+
'#zen-admin-modal .admin-actions .btn{min-height:30px;padding:5px 9px;font-size:11px}'+
'#zen-admin-modal .zen-users-foot{margin:14px 0 0;font-size:11px;line-height:1.5;color:var(--text-muted,#64748b)}'+
'#zen-admin-modal .zen-users-close{flex:none}'+
'@media(max-width:600px){#zen-admin-modal{padding:8px!important}#zen-admin-modal .zen-users-card{max-height:calc(100vh - 16px)}#zen-admin-modal .zen-users-head,#zen-admin-modal .zen-users-body{padding:16px}#zen-admin-modal .zen-users-grid{grid-template-columns:1fr}}'+
'</style>'+
'<section class="zen-users-card" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">'+
'<header class="zen-users-head"><div><h2 id="admin-modal-title">Gerenciamento de usuários</h2><p>Cadastre contas e controle os acessos ao ZEN neste navegador.</p></div><button type="button" class="btn btn-ghost zen-users-close" id="admin-close">Fechar</button></header>'+
'<div class="zen-users-body">'+
'<form id="new-user-form" class="zen-users-create"><h3>Novo usuário</h3>'+
'<div class="zen-users-grid">'+
'<div class="zen-users-field"><label for="new-name">Nome completo</label><input id="new-name" required maxlength="60" placeholder="Nome de exibição"></div>'+
'<div class="zen-users-field"><label for="new-username">Usuário de acesso</label><input id="new-username" required minlength="3" maxlength="32" autocomplete="off" placeholder="ex.: joao.silva"></div>'+
'<div class="zen-users-field"><label for="new-password">Senha inicial</label><input id="new-password" type="password" required minlength="10" autocomplete="new-password" placeholder="Mínimo de 10 caracteres"></div>'+
'<div class="zen-users-field"><label for="new-role">Perfil de acesso</label><select id="new-role"><option value="user">Usuário</option><option value="admin">Administrador</option></select></div>'+
'</div><div class="zen-users-form-actions"><button type="submit" class="btn btn-primary">+ Criar usuário</button><span id="admin-message" role="status"></span></div></form>'+
'<div class="zen-users-list-head"><h3>Contas cadastradas</h3><span id="admin-user-count" class="admin-muted"></span></div>'+
'<div class="zen-users-table-wrap"><table><thead><tr><th>Nome / Usuário</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody id="users-body"></tbody></table></div>'+
'<p class="zen-users-foot">As contas e os dados ficam armazenados localmente neste navegador. Desativar uma conta impede novos acessos neste dispositivo. A senha nunca é exibida após o cadastro.</p>'+
'</div></section>';
document.body.appendChild(modal);
const close=function(){modal.remove();document.removeEventListener("keydown",onKey);};
const onKey=function(e){if(e.key==="Escape"&&document.getElementById("zen-admin-modal")===modal)close();};
document.getElementById("admin-close").addEventListener("click",close);
modal.addEventListener("click",function(e){if(e.target===modal)close();});
document.addEventListener("keydown",onKey);
document.getElementById("new-user-form").addEventListener("submit",createUser);
renderUsers();
}function renderUsers(){const body=document.getElementById("users-body");if(!body)return;const allUsers=users();const count=document.getElementById("admin-user-count");if(count)count.textContent=allUsers.length+" conta(s)";body.innerHTML="";allUsers.forEach(function(u){const tr=document.createElement("tr");const self=u.id===currentUser.id;tr.innerHTML='<td><strong>'+esc(u.name)+'</strong><div style="font-size:11px;color:var(--text-muted)">'+esc(u.username)+'</div></td><td>'+(u.role==="admin"?"Administrador":"Usuário")+'</td><td>'+(u.active?'<span class="badge badge-concluido">Ativo</span>':'<span class="badge badge-atraso">Desativado</span>')+'</td><td><div class="admin-actions"><button class="btn btn-ghost" data-action="edit" data-id="'+esc(u.id)+'">Editar</button><button class="btn btn-ghost" data-action="reset" data-id="'+esc(u.id)+'">Redefinir senha</button>'+(self?"":'<button class="btn '+(u.active?"btn-danger":"btn-primary")+'" data-action="toggle" data-id="'+esc(u.id)+'">'+(u.active?"Desativar":"Ativar")+'</button>')+'</div></td>';body.appendChild(tr);});body.querySelectorAll("button").forEach(function(b){b.addEventListener("click",function(){manage(b.dataset.action,b.dataset.id);});});}
async function createUser(e){e.preventDefault();if(!isCurrentAdmin())return alert("Ação permitida somente a administradores ativos.");const name=document.getElementById("new-name").value.trim(),username=norm(document.getElementById("new-username").value),pass=document.getElementById("new-password").value,role=document.getElementById("new-role").value,all=users();if(username.length<3||!/^[a-z0-9._-]+$/.test(username))return message("admin-message","Nome de usuário inválido.",true);if(!["user","admin"].includes(role))return message("admin-message","Perfil inválido.",true);if(all.some(u=>u.username===username))return message("admin-message","Usuário já cadastrado.",true);if(pass.length<10)return message("admin-message","A senha deve ter pelo menos 10 caracteres.",true);const user=Object.assign({id:"u_"+b64(rand(12)).replace(/[+/=]/g,"").toLowerCase(),name:name,username:username,role:role,active:true,createdAt:new Date().toISOString()},await credentials(pass));all.push(user);saveUsers(all);logAdmin("usuário criado",username+" ("+role+")");document.getElementById("new-user-form").reset();message("admin-message","Usuário criado.");renderUsers();}
async function manage(action,id){if(!isCurrentAdmin())return alert("Ação permitida somente a administradores ativos.");const all=users(),u=all.find(x=>x.id===id);if(!u)return;if(action==="toggle"){if(u.id===currentUser.id&&u.active)return alert("Você não pode desativar a própria conta durante a sessão.");if(u.active&&u.role==="admin"&&activeAdminCount(all)<=1)return alert("Não é possível desativar o último administrador ativo.");u.active=!u.active;saveUsers(all);logAdmin(u.active?"conta ativada":"conta desativada",u.username);renderUsers();return;}if(action==="edit"){const name=prompt("Nome de exibição:",u.name);if(name===null)return;if(!name.trim())return alert("Informe um nome válido.");const role=prompt("Perfil: digite A para administrador ou U para usuário:",u.role==="admin"?"A":"U");if(role===null)return;if(!["A","U","a","u"].includes(role.trim()))return alert("Perfil inválido.");const nextRole=role.toLowerCase()==="a"?"admin":"user";if(u.id===currentUser.id&&nextRole!=="admin")return alert("Você não pode remover seu próprio perfil de administrador.");if(u.active&&u.role==="admin"&&nextRole!=="admin"&&activeAdminCount(all)<=1)return alert("Não é possível rebaixar o último administrador ativo.");u.name=name.trim();u.role=nextRole;saveUsers(all);logAdmin("usuário editado",u.username+" — perfil "+nextRole);renderUsers();return;}if(action==="reset"){const pass=prompt("Nova senha para "+u.username+" (mínimo 10 caracteres):");if(pass===null)return;if(pass.length<10)return alert("A senha deve ter pelo menos 10 caracteres.");Object.assign(u,await credentials(pass));saveUsers(all);logAdmin("senha redefinida",u.username);alert("Senha redefinida.");}}
function boot(callback){bootCallback=callback;document.querySelector("header")?.classList.add("hidden");document.querySelector(".app-layout")?.classList.add("hidden");document.querySelector("footer")?.classList.add("hidden");const savedId=localStorage.getItem(SESSION_KEY);if(savedId){const savedUser=users().find(function(u){return u.id===savedId&&u.active===true;});if(savedUser){establish(savedUser,false).catch(function(err){console.error("Falha ao restaurar sessão:",err);localStorage.removeItem(SESSION_KEY);showScreen(false);});return;}localStorage.removeItem(SESSION_KEY);}showScreen(users().length===0);}
window.ZEN_AUTH={boot:boot,key:key,getCurrentUser:function(){return currentUser?Object.assign({},currentUser):null;},getUsers:function(){return users().map(function(u){return {id:u.id,name:u.name,username:u.username,role:u.role,active:u.active};});},isAdmin:function(){return isCurrentAdmin();},wasExplicitLogin:function(){return explicitLoginInProgress;},openAdmin:function(){if(isCurrentAdmin())adminModal();}};
})();