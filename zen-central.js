/* ZEN — Fundação da Central compartilhada e ativação de dispositivos.
   Etapa 1: estrutura da pasta, manifesto, convites e solicitações de autorização.
   Ainda não sincroniza tarefas nem substitui a autenticação local. */
(function () {
  "use strict";

  const DB = "zen_central_device_v1";
  const STORE = "handles";
  const VERSION = 1;
  const ROOT = "ZEN_CENTRAL";
  let directory = null;
  let currentUser = null;
  let busy = false;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function current() {
    try { return window.ZEN_AUTH && ZEN_AUTH.getCurrentUser ? ZEN_AUTH.getCurrentUser() : null; }
    catch (_) { return null; }
  }
  function isAdmin() {
    try { return !!(window.ZEN_AUTH && ZEN_AUTH.isAdmin && ZEN_AUTH.isAdmin()); }
    catch (_) { return false; }
  }
  function id() {
    return "PC-" + Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Não foi possível abrir o armazenamento da central."));
    });
  }
  async function saveHandle(handle, deviceId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key: "central", handle, deviceId: deviceId || null });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  async function loadHandle() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get("central");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  function b64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }
  function fromB64(value) {
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
  }
  async function sha256(value) {
    return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
  }
  async function readJson(dir, name) {
    const file = await (await dir.getFileHandle(name)).getFile();
    return JSON.parse(await file.text());
  }
  async function writeJson(dir, name, value) {
    const file = await dir.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    await writable.close();
  }
  async function ensureDir(parent, name) {
    return parent.getDirectoryHandle(name, { create: true });
  }
  async function buildStructure(root) {
    const dirs = ["CENTRAL", "ADMIN", "ADMIN/CONVITES", "OPERACOES", "SOLICITACOES", "DADOS", "DADOS/tarefas", "DADOS/lembretes", "DADOS/tipos-pecas", "DADOS/compartilhamentos", "HISTORICO", "CONFLITOS", "BACKUPS"];
    for (const path of dirs) {
      let node = root;
      for (const part of path.split("/")) node = await ensureDir(node, part);
    }
  }
  async function setupCentral() {
    if (!isAdmin()) throw new Error("Somente o administrador pode configurar a Central ZEN.");
    if (!window.showDirectoryPicker) throw new Error("Este navegador não oferece seleção de pastas compatível. Utilize Chrome ou Edge atualizado.");
    alert("Selecione a pasta sincronizada do Google Drive onde o ZEN deverá criar a subpasta ZEN_CENTRAL.");
    const parent = await window.showDirectoryPicker({ id: "zen-central-root", mode: "readwrite" });
    const root = await parent.getDirectoryHandle(ROOT, { create: true });
    const central = await root.getDirectoryHandle("CENTRAL", { create: true });
    try {
      const existing = await readJson(central, "identificacao.json");
      if (existing && existing.centralId) {
        if (!confirm("Esta pasta já contém uma Central ZEN (" + existing.centralId + "). Deseja apenas reconectar?")) return;
        directory = root;
        await ensureLocalDeviceIdentity(existing);
        renderStatus("Central existente reconhecida: " + existing.centralId);
        return;
      }
    } catch (_) {}
    await buildStructure(root);
    const centralId = "ZEN-" + crypto.randomUUID();
    const now = new Date().toISOString();
    await writeJson(central, "identificacao.json", {
      product: "ZEN", schemaVersion: 1, centralId, createdAt: now,
      storageModel: "google-drive-synced-folder", operationModel: "append-only-per-device"
    });
    await writeJson(central, "configuracao.json", {
      schemaVersion: 1, syncIntervalSeconds: 10, hybridRecords: true,
      administratorUserId: current().id, createdAt: now
    });
    const admin = await root.getDirectoryHandle("ADMIN");
    await writeJson(admin, "dispositivos.json", { schemaVersion: 1, devices: [] });
    await writeJson(admin, "usuarios.json", { schemaVersion: 1, users: [] });
    directory = root;
    await saveHandle(root, null);
    await ensureLocalDeviceIdentity({centralId});
    renderStatus("Central criada e dispositivo administrador registrado: " + centralId + ".");
    alert("Estrutura da Central ZEN criada com sucesso. Faça uma cópia de segurança da pasta e compartilhe-a somente com os computadores autorizados.");
  }
  async function chooseCentral() {
    if (!window.showDirectoryPicker) throw new Error("Use Chrome ou Edge atualizado para selecionar a pasta.");
    const root = await window.showDirectoryPicker({ id: "zen-central-root", mode: "readwrite" });
    const central = await root.getDirectoryHandle("CENTRAL");
    const manifest = await readJson(central, "identificacao.json");
    if (!manifest || manifest.product !== "ZEN" || !manifest.centralId) throw new Error("A pasta selecionada não contém uma Central ZEN válida.");
    directory = root;
    await saveHandle(root, null);
    return manifest;
  }
  async function loadDeviceSecrets(deviceId) {
    const db=await openDB();
    return new Promise((resolve,reject)=>{const req=db.transaction(STORE,"readonly").objectStore(STORE).get("device-private-"+deviceId);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
  }
  async function deriveBundleKey(privateKey,publicJwk,salt,centralId,deviceId) {
    const pub=await crypto.subtle.importKey("jwk",publicJwk,{name:"ECDH",namedCurve:"P-256"},false,[]);
    const secret=await crypto.subtle.deriveBits({name:"ECDH",public:pub},privateKey,256);
    const material=await crypto.subtle.importKey("raw",secret,"HKDF",false,["deriveKey"]);
    return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt,info:encoder.encode("ZEN-CENTRAL-USERS|"+centralId+"|"+deviceId)},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function encryptUsersForDevice(users,exchangePublicKey,centralId,deviceId) {
    const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const ephemeralPublicKey=await crypto.subtle.exportKey("jwk",pair.publicKey);
    const key=await deriveBundleKey(pair.privateKey,exchangePublicKey,salt,centralId,deviceId);
    const plain=encoder.encode(JSON.stringify({schemaVersion:1,centralId,deviceId,users,createdAt:new Date().toISOString()}));
    const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
    return {schemaVersion:1,centralId,deviceId,ephemeralPublicKey,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher)),createdAt:new Date().toISOString()};
  }
  async function decryptUsersBundle(bundle,privateKey,centralId,deviceId) {
    if(!bundle||bundle.centralId!==centralId||bundle.deviceId!==deviceId)throw new Error("Pacote de credenciais não corresponde a este computador.");
    const key=await deriveBundleKey(privateKey,bundle.ephemeralPublicKey,fromB64(bundle.salt),centralId,deviceId);
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(bundle.iv)},key,fromB64(bundle.ciphertext));
    const data=JSON.parse(decoder.decode(plain));
    if(data.centralId!==centralId||data.deviceId!==deviceId||!Array.isArray(data.users))throw new Error("Conteúdo de credenciais inválido.");
    return data.users;
  }
  async function requestActivation() {
    const manifest=await chooseCentral();
    const code=prompt("Informe o código de ativação individual fornecido pelo administrador:");
    if(!code)return;
    const codeHash=await sha256(code.trim().toUpperCase());
    const invites=await directory.getDirectoryHandle("ADMIN").then(d=>d.getDirectoryHandle("CONVITES"));
    let invitation=null;
    for await(const [name,entry] of invites.entries()){if(entry.kind!=="file"||!name.endsWith(".json"))continue;try{const item=await readJson(invites,name);if(item.codeHash===codeHash&&!item.usedAt&&new Date(item.expiresAt).getTime()>Date.now()){invitation={name,item};break;}}catch(_){}}
    if(!invitation)throw new Error("Código inválido, expirado ou já utilizado.");
    const deviceId=id();
    const signing=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
    const exchange=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
    const publicKey=await crypto.subtle.exportKey("jwk",signing.publicKey);
    const exchangePublicKey=await crypto.subtle.exportKey("jwk",exchange.publicKey);
    const proof=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},signing.privateKey,encoder.encode(manifest.centralId+"|"+deviceId+"|ZEN-DEVICE-ACTIVATION"));
    const request={schemaVersion:2,requestId:crypto.randomUUID(),centralId:manifest.centralId,deviceId,deviceLabel:"Computador "+deviceId.slice(-6),publicKey,exchangePublicKey,proof:b64(new Uint8Array(proof)),invitationFile:invitation.name,codeHash,requestedAt:new Date().toISOString(),status:"pending"};
    await writeJson(await directory.getDirectoryHandle("SOLICITACOES"),deviceId+".json",request);
    await saveHandle(directory,deviceId);
    const db=await openDB();
    await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put({key:"device-private-"+deviceId,signingPrivateKey:signing.privateKey,exchangePrivateKey:exchange.privateKey,exchangePublicKey,centralId:manifest.centralId});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    renderStatus("Solicitação enviada. Dispositivo: "+deviceId);
    alert("Solicitação enviada. Após a aprovação do administrador, clique novamente em “Ativar / conectar este computador” para carregar os usuários.");
  }
  async function checkActivation() {
    const saved=await loadHandle();
    if(!saved||!saved.handle||!saved.deviceId)throw new Error("Este computador ainda não enviou solicitação de ativação.");
    directory=saved.handle;
    const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json");
    const request=await readJson(await directory.getDirectoryHandle("SOLICITACOES"),saved.deviceId+".json");
    if(request.status==="pending"){renderStatus("Aguardando aprovação do administrador.");alert("O administrador ainda não aprovou este computador. Tente novamente depois da autorização.");return false;}
    if(request.status!=="approved")throw new Error("A solicitação deste computador não foi aprovada.");
    const secrets=await loadDeviceSecrets(saved.deviceId);
    if(!secrets||!secrets.exchangePrivateKey)throw new Error("A chave privada local não foi encontrada. Será necessário solicitar nova ativação.");
    const bundle=await readJson(await directory.getDirectoryHandle("ADMIN").then(d=>d.getDirectoryHandle("CREDENCIAIS")),saved.deviceId+".json");
    const list=await decryptUsersBundle(bundle,secrets.exchangePrivateKey,manifest.centralId,saved.deviceId);
    const count=ZEN_AUTH.importCentralUsers(list);
    renderStatus("Computador ativado. "+count+" usuário(s) carregado(s).");
    alert("Computador autorizado e usuários carregados. Entre com uma conta cadastrada no computador administrador.");
    if(ZEN_AUTH.showLogin)ZEN_AUTH.showLogin();
    startBackgroundSync();
    return true;
  }
  async function activateBeforeLogin() {
    const saved=await loadHandle();
    if(saved&&saved.deviceId)return checkActivation();
    return requestActivation();
  }
  async function reconnectCentral(){
    const saved=await loadHandle();
    if(!saved||!saved.handle)throw new Error("Este computador ainda não tem uma pasta Central ZEN vinculada. Conecte a pasta novamente.");
    directory=saved.handle;
    if(directory.requestPermission){
      let permission=await directory.queryPermission({mode:"readwrite"});
      if(permission!=="granted")permission=await directory.requestPermission({mode:"readwrite"});
      if(permission!=="granted")throw new Error("Permissão de leitura e gravação na pasta central não concedida.");
    }
    const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json");
    if(!saved.deviceId&&isAdmin())await ensureLocalDeviceIdentity(manifest);
    if(typeof tasks!=="undefined"&&Array.isArray(tasks))await publishTasks(tasks.filter(t=>!t._sharedOwnerId));
    const result=await syncNow();
    startBackgroundSync();
    renderStatus("Diagnóstico: "+result.received+" recebida(s) · "+result.jsonFiles+" arquivo(s) · "+result.authorizedSenders+" remetente(s) autorizado(s) · "+result.unknownSenders+" remetente(s) desconhecido(s) · "+result.signatureInvalid+" assinatura(s) inválida(s) · "+result.decryptErrors+" falha(s) de descriptografia · "+result.alreadyProcessed+" já processada(s)"+(result.reason?" · "+result.reason:"")+(result.permissionRequired?" · permissão pendente":""));
    return result;
  }
  async function createInvitation() {
    if (!isAdmin()) throw new Error("Somente o administrador pode emitir convites.");
    if (!directory) {
      const saved = await loadHandle();
      if (saved && saved.handle) directory = saved.handle;
      else await chooseCentral();
    }
    const manifest = await readJson(await directory.getDirectoryHandle("CENTRAL"), "identificacao.json");
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
    const code = raw.match(/.{1,4}/g).join("-");
    const codeHash = await sha256(code);
    const invitationId = crypto.randomUUID();
    const inviteDir = await directory.getDirectoryHandle("ADMIN").then(d => d.getDirectoryHandle("CONVITES"));
    await writeJson(inviteDir, invitationId + ".json", {
      schemaVersion: 1, invitationId, centralId: manifest.centralId,
      codeHash, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), usedAt: null
    });
    renderStatus("Convite emitido, válido por 24 horas.");
    showInvitationCode(code);
  }
  function showInvitationCode(code) {
    const previous = document.getElementById("zen-central-code-modal");
    if (previous) previous.remove();
    const modal = document.createElement("div");
    modal.id = "zen-central-code-modal";
    modal.style.cssText = "position:fixed;inset:0;z-index:1000001;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:18px";
    modal.innerHTML = '<section style="width:min(100%,440px);background:var(--surface,#fff);color:var(--text,#111827);border:1px solid var(--border,#ddd);border-radius:14px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.3);text-align:center">' +
      '<h2 style="margin:0 0 8px">Código de ativação</h2>' +
      '<p style="font-size:.85rem;color:var(--text-muted);margin:0 0 16px">Código de uso único. Válido por 24 horas.</p>' +
      '<div id="zen-central-code-value" style="font-size:1.35rem;font-weight:800;letter-spacing:.09em;padding:15px 10px;border:1px dashed var(--border,#aaa);border-radius:9px;background:var(--surface-subtle,#f5f5f5);user-select:all;overflow-wrap:anywhere"></div>' +
      '<button type="button" class="btn btn-primary" id="zen-central-copy-code" style="width:100%;margin-top:14px">Copiar código</button>' +
      '<p id="zen-central-copy-feedback" role="status" style="min-height:1.2em;font-size:.8rem;color:var(--text-muted)"></p>' +
      '<button type="button" class="btn btn-ghost" id="zen-central-close-code" style="width:100%">Fechar</button>' +
      '<p style="font-size:.72rem;color:var(--text-muted);margin:12px 0 0">Se a cópia automática não funcionar, selecione o código acima e use Ctrl+C.</p>' +
      '</section>';
    document.body.appendChild(modal);
    modal.querySelector("#zen-central-code-value").textContent = code;
    const feedback = modal.querySelector("#zen-central-copy-feedback");
    modal.querySelector("#zen-central-copy-code").onclick = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(code);
        } else {
          const field = document.createElement("textarea");
          field.value = code;
          field.setAttribute("readonly", "");
          field.style.cssText = "position:fixed;opacity:0;left:-9999px;top:0";
          document.body.appendChild(field);
          field.select();
          const copied = document.execCommand("copy");
          field.remove();
          if (!copied) throw new Error("Cópia automática indisponível.");
        }
        feedback.textContent = "Código copiado. Agora você pode colá-lo no outro computador.";
      } catch (_) {
        feedback.textContent = "Não foi possível copiar automaticamente. Selecione o código e pressione Ctrl+C.";
      }
    };
    modal.querySelector("#zen-central-close-code").onclick = () => modal.remove();
    modal.addEventListener("click", event => { if (event.target === modal) modal.remove(); });
  }
  async function reviewRequests() {
    if(!isAdmin())throw new Error("Somente o administrador pode autorizar dispositivos.");
    if(!directory){const saved=await loadHandle();if(saved&&saved.handle)directory=saved.handle;else await chooseCentral();}
    const requestDir=await directory.getDirectoryHandle("SOLICITACOES"),adminDir=await directory.getDirectoryHandle("ADMIN");
    const devicesFile=await readJson(adminDir,"dispositivos.json"),pending=[];
    for await(const [name,entry] of requestDir.entries()){if(entry.kind!=="file"||!name.endsWith(".json"))continue;try{const req=await readJson(requestDir,name);if(req.status==="pending")pending.push({name,req});}catch(_){}}
    if(!pending.length){alert("Não há solicitações pendentes.");return;}
    const listing=pending.map((x,i)=>(i+1)+". "+x.req.deviceLabel+" — "+x.req.deviceId).join("\n");
    const choice=prompt("Solicitações pendentes:\n\n"+listing+"\n\nInforme o número do computador:");
    const selected=pending[Number(choice)-1];if(!selected)return;
    if(!confirm("Autorizar "+selected.req.deviceId+" e disponibilizar a base de usuários criptografada para este computador?"))return;
    const inviteDir=await adminDir.getDirectoryHandle("CONVITES");
    if(!/^[a-f0-9-]{36}\.json$/i.test(selected.req.invitationFile||""))throw new Error("Referência de convite inválida.");
    const invite=await readJson(inviteDir,selected.req.invitationFile);
    if(invite.centralId!==selected.req.centralId||invite.codeHash!==selected.req.codeHash||invite.usedAt||new Date(invite.expiresAt).getTime()<=Date.now())throw new Error("Convite inválido, expirado ou já utilizado.");
    const signingKey=await crypto.subtle.importKey("jwk",selected.req.publicKey,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},signingKey,fromB64(selected.req.proof),encoder.encode(selected.req.centralId+"|"+selected.req.deviceId+"|ZEN-DEVICE-ACTIVATION"));
    if(!valid)throw new Error("Prova criptográfica do dispositivo inválida.");
    if(!selected.req.exchangePublicKey||selected.req.exchangePublicKey.kty!=="EC")throw new Error("Chave de criptografia do dispositivo ausente.");
    await crypto.subtle.importKey("jwk",selected.req.exchangePublicKey,{name:"ECDH",namedCurve:"P-256"},false,[]);
    const users=ZEN_AUTH.exportCredentialRecords();
    if(!users.length||!users.some(u=>u.active&&u.role==="admin"))throw new Error("A base local não contém administrador ativo.");
    const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json");
    const bundle=await encryptUsersForDevice(users,selected.req.exchangePublicKey,manifest.centralId,selected.req.deviceId);
    const credentialDir=await adminDir.getDirectoryHandle("CREDENCIAIS",{create:true});
    await writeJson(credentialDir,selected.req.deviceId+".json",bundle);
    const device={deviceId:selected.req.deviceId,deviceLabel:selected.req.deviceLabel,publicKey:selected.req.publicKey,exchangePublicKey:selected.req.exchangePublicKey,authorizedAt:new Date().toISOString(),status:"active"};
    devicesFile.devices=Array.isArray(devicesFile.devices)?devicesFile.devices:[];
    if(devicesFile.devices.some(d=>d.deviceId===device.deviceId))throw new Error("Dispositivo já cadastrado.");
    devicesFile.devices.push(device);await writeJson(adminDir,"dispositivos.json",devicesFile);
    const publicUsers=users.map(u=>({id:u.id,name:u.name,username:u.username,role:u.role,active:u.active}));
    await writeJson(adminDir,"usuarios.json",{schemaVersion:2,updatedAt:new Date().toISOString(),users:publicUsers});
    invite.usedAt=new Date().toISOString();invite.usedByDeviceId=device.deviceId;await writeJson(inviteDir,selected.req.invitationFile,invite);
    selected.req.status="approved";selected.req.approvedAt=new Date().toISOString();await writeJson(requestDir,selected.name,selected.req);
    renderStatus("Dispositivo autorizado e credenciais criptografadas: "+device.deviceId);
    alert("Dispositivo autorizado. No PC correspondente, clique em “Ativar / conectar este computador” para carregar os usuários.");
  }
  async function publishUsers(users) {
    if(!isAdmin()||!Array.isArray(users))return;
    if(!directory){const saved=await loadHandle();if(!saved||!saved.handle)return;directory=saved.handle;}
    const adminDir=await directory.getDirectoryHandle("ADMIN"),devices=await readJson(adminDir,"dispositivos.json");
    const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json");
    const credentialDir=await adminDir.getDirectoryHandle("CREDENCIAIS",{create:true});
    for(const device of (devices.devices||[]).filter(d=>d.status==="active"&&d.exchangePublicKey)){
      const bundle=await encryptUsersForDevice(users,device.exchangePublicKey,manifest.centralId,device.deviceId);
      await writeJson(credentialDir,device.deviceId+".json",bundle);
    }
    const publicUsers=users.map(u=>({id:u.id,name:u.name,username:u.username,role:u.role,active:u.active}));
    await writeJson(adminDir,"usuarios.json",{schemaVersion:2,updatedAt:new Date().toISOString(),users:publicUsers});
  }

  async function ensureLocalDeviceIdentity(manifest){
    const saved=await loadHandle();
    if(saved&&saved.deviceId&&await loadDeviceSecrets(saved.deviceId)){directory=saved.handle;return saved.deviceId;}
    const deviceId=id(),signing=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]),exchange=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]);
    const publicKey=await crypto.subtle.exportKey("jwk",signing.publicKey),exchangePublicKey=await crypto.subtle.exportKey("jwk",exchange.publicKey),db=await openDB();
    await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put({key:"device-private-"+deviceId,signingPrivateKey:signing.privateKey,exchangePrivateKey:exchange.privateKey,exchangePublicKey,centralId:manifest.centralId});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    const admin=await directory.getDirectoryHandle("ADMIN");let reg;try{reg=await readJson(admin,"dispositivos.json");}catch(_){reg={devices:[]};}
    reg.devices=Array.isArray(reg.devices)?reg.devices:[];reg.devices.push({deviceId,deviceLabel:"Computador administrador",publicKey,exchangePublicKey,authorizedAt:new Date().toISOString(),status:"active",adminDevice:true});
    await writeJson(admin,"dispositivos.json",reg);await saveHandle(directory,deviceId);return deviceId;
  }
  async function taskOpKey(privateKey,publicJwk,salt,centralId,deviceId){
    const pub=await crypto.subtle.importKey("jwk",publicJwk,{name:"ECDH",namedCurve:"P-256"},false,[]),bits=await crypto.subtle.deriveBits({name:"ECDH",public:pub},privateKey,256),mat=await crypto.subtle.importKey("raw",bits,"HKDF",false,["deriveKey"]);
    return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt,info:encoder.encode("ZEN-TASKS|"+centralId+"|"+deviceId)},mat,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function writeTaskOp(payload,device,manifest,secrets,senderId){
    const eph=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveBits"]),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await taskOpKey(eph.privateKey,device.exchangePublicKey,salt,manifest.centralId,device.deviceId),cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(JSON.stringify(payload)));
    const env={schemaVersion:1,centralId:manifest.centralId,operationId:crypto.randomUUID(),senderDeviceId:senderId,recipientDeviceId:device.deviceId,createdAt:new Date().toISOString(),ephemeralPublicKey:await crypto.subtle.exportKey("jwk",eph.publicKey),salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))};
    env.signature=b64(new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},secrets.signingPrivateKey,encoder.encode(JSON.stringify(env)))));
    const ops=await directory.getDirectoryHandle("OPERACOES",{create:true}),from=await ops.getDirectoryHandle(senderId,{create:true}),to=await from.getDirectoryHandle(device.deviceId,{create:true});
    await writeJson(to,env.operationId+".json",env);
  }
  function taskCache(){try{return JSON.parse(localStorage.getItem("zen_central_shared_tasks_v1")||'{"entries":{}}');}catch(_){return {entries:{}};}}
  async function publishTasks(records){
    const saved=await loadHandle();if(!saved||!saved.handle||!saved.deviceId)return;directory=saved.handle;
    const secrets=await loadDeviceSecrets(saved.deviceId);if(!secrets||!secrets.signingPrivateKey)return;
    const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json"),reg=await readJson(await directory.getDirectoryHandle("ADMIN"),"dispositivos.json"),user=current();
    if(!user)return;const devices=(reg.devices||[]).filter(d=>d.status==="active"&&d.deviceId!==saved.deviceId&&d.exchangePublicKey),stateKey="zen_central_task_outbox_"+manifest.centralId+"_"+saved.deviceId;
    let prev={};try{prev=JSON.parse(localStorage.getItem(stateKey)||"{}");}catch(_){}const next={};
    for(const record of (records||[]).filter(r=>r&&r.id&&!r._sharedOwnerId&&Array.isArray(r.sharedWith)&&r.sharedWith.length)){
      const grants=record.sharedWith.filter(x=>x&&x.userId).map(x=>({userId:x.userId,permission:x.permission==="edit"?"edit":"view"}));const targets=grants.map(x=>x.userId);if(!targets.length)continue;
      for(const device of devices){const k=record.id+"|"+device.deviceId,fp=await sha256(JSON.stringify({record,grants,schema:2}));next[k]={recordId:record.id,deviceId:device.deviceId,fingerprint:fp};
        if(!prev[k]||prev[k].fingerprint!==fp)await writeTaskOp({kind:"task.snapshot",recordId:record.id,ownerUserId:user.id,ownerName:user.name||user.username,ownerDeviceId:saved.deviceId,targetUserIds:targets,targetPermissions:grants,record},device,manifest,secrets,saved.deviceId);
      }
    }
    for(const k of Object.keys(prev)){if(next[k])continue;const old=prev[k],device=devices.find(d=>d.deviceId===old.deviceId);if(device)await writeTaskOp({kind:"task.revoke",recordId:old.recordId,ownerUserId:user.id,ownerName:user.name||user.username,targetUserIds:[]},device,manifest,secrets,saved.deviceId);}
    localStorage.setItem(stateKey,JSON.stringify(next));
  }
  async function submitTaskEdit(record){
    if(!record||!record._centralRemote||record._sharedPermission!=="edit")return false;
    const saved=await loadHandle();if(!saved||!saved.handle||!saved.deviceId)return false;directory=saved.handle;
    const user=current();if(!user)return false;
    if(record.updatedAt&&record._centralBaseUpdatedAt&&record.updatedAt===record._centralBaseUpdatedAt)return false;
    const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json");
    const secrets=await loadDeviceSecrets(saved.deviceId);if(!secrets||!secrets.signingPrivateKey)return false;
    const reg=await readJson(await directory.getDirectoryHandle("ADMIN"),"dispositivos.json");
    const ownerDevice=(reg.devices||[]).find(d=>d.deviceId===record._centralOwnerDeviceId&&d.status==="active"&&d.exchangePublicKey);
    if(!ownerDevice)throw new Error("O computador proprietário da tarefa não está disponível na Central.");
    const clean={...record};["_sharedOwnerId","_sharedOwnerName","_sharedPermission","_centralRemote","_centralOwnerDeviceId","_centralBaseUpdatedAt"].forEach(k=>delete clean[k]);
    const fingerprint=await sha256(JSON.stringify({record:clean,base:record._centralBaseUpdatedAt||null,userId:user.id}));
    const key="zen_central_edit_outbox_"+manifest.centralId+"_"+saved.deviceId;
    let sent={};try{sent=JSON.parse(localStorage.getItem(key)||"{}");}catch(_){}
    const itemKey=record._sharedOwnerId+"|"+record.id;
    if(sent[itemKey]===fingerprint)return false;
    await writeTaskOp({kind:"task.edit.request",requestId:crypto.randomUUID(),recordId:record.id,ownerUserId:record._sharedOwnerId,editorUserId:user.id,baseUpdatedAt:record._centralBaseUpdatedAt||null,record:clean},ownerDevice,manifest,secrets,saved.deviceId);
    sent[itemKey]=fingerprint;localStorage.setItem(key,JSON.stringify(sent));
    return true;
  }
  async function syncNow(){
    const stats={deviceId:null,centralId:null,senderFolders:0,authorizedSenders:0,unknownSenders:0,recipientFolders:0,missingRecipientFolders:0,jsonFiles:0,jsonReadErrors:0,alreadyProcessed:0,centralMismatch:0,recipientMismatch:0,senderMismatch:0,signatureInvalid:0,decryptErrors:0,invalidPayload:0,received:0};
    const saved=await loadHandle();
    if(!saved||!saved.handle||!saved.deviceId)return {...stats,reason:"dispositivo-nao-vinculado"};
    directory=saved.handle;stats.deviceId=saved.deviceId;
    if(directory.queryPermission&&await directory.queryPermission({mode:"readwrite"})!=="granted")return {...stats,permissionRequired:true};
    const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json");
    stats.centralId=manifest.centralId;
    const secrets=await loadDeviceSecrets(saved.deviceId);
    const reg=await readJson(await directory.getDirectoryHandle("ADMIN"),"dispositivos.json");
    if(!secrets||!secrets.exchangePrivateKey)return {...stats,reason:"chave-privada-do-dispositivo-ausente"};
    const cache=taskCache();cache.entries=cache.entries||{};
    const pkey="zen_central_processed_"+saved.deviceId;
    let processed=[];try{processed=JSON.parse(localStorage.getItem(pkey)||"[]");}catch(_){}
    const ops=await directory.getDirectoryHandle("OPERACOES",{create:true});
    for await(const [senderId,from] of ops.entries()){
      if(from.kind!=="directory"||senderId===saved.deviceId)continue;
      stats.senderFolders++;
      const sender=(reg.devices||[]).find(d=>d.deviceId===senderId&&d.status==="active");
      if(!sender||!sender.publicKey){stats.unknownSenders++;continue;}
      stats.authorizedSenders++;
      let to;try{to=await from.getDirectoryHandle(saved.deviceId);stats.recipientFolders++;}
      catch(_){stats.missingRecipientFolders++;continue;}
      for await(const [filename,entry] of to.entries()){
        if(entry.kind!=="file"||!filename.endsWith(".json"))continue;
        stats.jsonFiles++;
        let env;try{env=await readJson(to,filename);}catch(_){stats.jsonReadErrors++;continue;}
        if(processed.includes(env.operationId)){stats.alreadyProcessed++;continue;}
        if(env.centralId!==manifest.centralId){stats.centralMismatch++;continue;}
        if(env.recipientDeviceId!==saved.deviceId){stats.recipientMismatch++;continue;}
        if(env.senderDeviceId!==senderId){stats.senderMismatch++;continue;}
        const unsigned={...env};delete unsigned.signature;
        let signatureOK=false;
        try{
          const pub=await crypto.subtle.importKey("jwk",sender.publicKey,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
          signatureOK=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},pub,fromB64(env.signature),encoder.encode(JSON.stringify(unsigned)));
        }catch(_){}
        if(!signatureOK){stats.signatureInvalid++;continue;}
        let p;
        try{
          const key=await taskOpKey(secrets.exchangePrivateKey,env.ephemeralPublicKey,fromB64(env.salt),manifest.centralId,saved.deviceId);
          const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(env.iv)},key,fromB64(env.ciphertext));
          p=JSON.parse(decoder.decode(plain));
        }catch(e){stats.decryptErrors++;console.warn("ZEN Central: falha ao descriptografar operação.",e);continue;}
        if(p.kind==="task.edit.request"){
          if(!p.recordId||!p.ownerUserId||!p.editorUserId||!p.record||p.record.id!==p.recordId){stats.invalidPayload++;continue;}
          if(typeof window.ZEN_APPLY_CENTRAL_EDIT!=="function")continue;
          let applied=false;try{applied=await window.ZEN_APPLY_CENTRAL_EDIT(p);}catch(e){console.warn("ZEN Central: não foi possível aplicar edição compartilhada.",e);}
          if(!applied)continue;
          processed.push(env.operationId);stats.received++;continue;
        }
        if(!p.recordId||!p.ownerUserId||(p.kind==="task.snapshot"&&(!p.record||!Array.isArray(p.targetUserIds)))){stats.invalidPayload++;continue;}
        const ck=p.ownerUserId+"|"+p.recordId,old=cache.entries[ck];
        if(!old||new Date(env.createdAt).getTime()>=new Date(old.updatedAt||0).getTime()){
          cache.entries[ck]=p.kind==="task.snapshot"
            ?{record:p.record,ownerUserId:p.ownerUserId,ownerName:p.ownerName,ownerDeviceId:p.ownerDeviceId,targetUserIds:p.targetUserIds,targetPermissions:Array.isArray(p.targetPermissions)?p.targetPermissions:[],updatedAt:env.createdAt,deleted:false}
            :{ownerUserId:p.ownerUserId,targetUserIds:[],targetPermissions:[],updatedAt:env.createdAt,deleted:true};
        }
        processed.push(env.operationId);stats.received++;
      }
    }
    localStorage.setItem("zen_central_shared_tasks_v1",JSON.stringify(cache));
    localStorage.setItem(pkey,JSON.stringify(processed.slice(-5000)));
    if(stats.received)window.dispatchEvent(new CustomEvent("zen-central-updated",{detail:{received:stats.received}}));
    return stats;
  }
  function getSharedTasks(userId){if(!userId)return [];return Object.values(taskCache().entries||{}).filter(x=>!x.deleted&&x.record&&Array.isArray(x.targetUserIds)&&x.targetUserIds.includes(userId)).map(x=>{const grant=(x.targetPermissions||[]).find(g=>g.userId===userId);return {...x.record,_sharedOwnerId:x.ownerUserId,_sharedOwnerName:x.ownerName||"Usuário",_sharedPermission:grant&&grant.permission==="edit"?"edit":"view",_centralRemote:true,_centralOwnerDeviceId:x.ownerDeviceId||null,_centralBaseUpdatedAt:x.record.updatedAt||null};});}
  function startBackgroundSync(){
    if(window.__ZEN_CENTRAL_SYNC_TIMER)return;
    const run=async()=>{
      if(!current())return;
      try{
        const saved=await loadHandle();
        if(saved&&saved.handle&&!saved.deviceId&&isAdmin()){
          directory=saved.handle;
          const manifest=await readJson(await directory.getDirectoryHandle("CENTRAL"),"identificacao.json");
          await ensureLocalDeviceIdentity(manifest);
        }
        if(typeof tasks!=="undefined"&&Array.isArray(tasks))await publishTasks(tasks.filter(t=>!t._sharedOwnerId));
        await syncNow();
      }catch(e){console.warn("ZEN Central sync:",e);}
    };
    run();
    window.__ZEN_CENTRAL_SYNC_TIMER=setInterval(run,10000);
  }

  function renderStatus(message) {
    const el = document.getElementById("zen-central-status");
    if (el) el.textContent = message;
  }
  function mount() {
    if (document.getElementById("zen-central-entry")) return;
    const header = document.querySelector(".header-actions");
    if (!header) return;
    const button = document.createElement("button");
    button.id = "zen-central-entry";
    button.className = "btn btn-ghost";
    button.textContent = "☁ Central ZEN";
    button.style.fontSize = ".8rem";
    button.onclick = openPanel;
    header.appendChild(button);
  }
  function openPanel() {
    if (document.getElementById("zen-central-modal")) return;
    const admin = isAdmin();
    const modal = document.createElement("div");
    modal.id = "zen-central-modal";
    modal.style.cssText = "position:fixed;inset:0;z-index:999990;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(4px)";
    modal.innerHTML = '<section style="width:min(100%,620px);max-height:90vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#0f172a);border:1px solid var(--border,#ddd);border-radius:14px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.25)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 style="margin:0">Central de Informações ZEN</h2><button class="btn btn-ghost" id="zen-central-close">Fechar</button></div>' +
      '<p style="color:var(--text-muted);font-size:.86rem;line-height:1.5">A Central ZEN sincroniza tarefas compartilhadas entre computadores autorizados. Lembretes e dados particulares permanecem locais. A sincronização ocorre enquanto o aplicativo está aberto e a pasta do Google Drive está disponível.</p>' +
      '<div id="zen-central-status" role="status" style="padding:10px;background:var(--surface-subtle);border:1px solid var(--border);border-radius:8px;font-size:.82rem;margin:12px 0">Nenhuma central conectada nesta sessão.</div>' +
      (admin ? '<div style="display:grid;gap:9px"><button class="btn btn-primary" id="zen-central-setup">Criar / conectar central (administrador)</button><button class="btn btn-ghost" id="zen-central-invite">Gerar convite de dispositivo</button><button class="btn btn-ghost" id="zen-central-review">Analisar solicitações e autorizar dispositivo</button><button class="btn btn-ghost" id="zen-central-sync">Reconectar / sincronizar agora</button></div>' : '<div style="display:grid;gap:9px"><button class="btn btn-primary" id="zen-central-request">Conectar e solicitar ativação</button><button class="btn btn-ghost" id="zen-central-sync">Reconectar / sincronizar agora</button></div>') +
      '<p style="font-size:.75rem;color:var(--text-muted);margin-top:14px">Acesso à pasta é concedido pelo Google Drive. Os controles internos do ZEN não impedem que alguém com permissão direta de edição altere arquivos manualmente. Não armazene dados reais nesta central experimental até concluir as etapas de segurança e sincronização.</p></section>';
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector("#zen-central-close").onclick = close;
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
    const run = async fn => {
      if (busy) return;
      busy = true;
      try { await fn(); }
      catch (e) { console.error("ZEN Central:", e); alert(e.message || "Não foi possível concluir a operação."); }
      finally { busy = false; }
    };
    const setup = modal.querySelector("#zen-central-setup");
    if (setup) setup.onclick = () => run(setupCentral);
    const invite = modal.querySelector("#zen-central-invite");
    if (invite) invite.onclick = () => run(createInvitation);
    const review = modal.querySelector("#zen-central-review");
    if (review) review.onclick = () => run(reviewRequests);
    const request = modal.querySelector("#zen-central-request");
    if (request) request.onclick = () => run(requestActivation);
    const sync = modal.querySelector("#zen-central-sync");
    if (sync) sync.onclick = () => run(reconnectCentral);
    (async () => {
      try {
        const saved = await loadHandle();
        if (saved && saved.handle) {
          directory = saved.handle;
          const manifest = await readJson(await directory.getDirectoryHandle("CENTRAL"), "identificacao.json");
          renderStatus("Central reconhecida: " + manifest.centralId + (saved.deviceId ? " · Dispositivo: " + saved.deviceId : ""));
        }
      } catch (_) { renderStatus("Pasta não autorizada ou indisponível. Reconecte a central."); }
    })();
  }
  function boot() {
    const user = current();
    if (!user) return;
    currentUser = user;
    mount();
    startBackgroundSync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  const watcher = setInterval(() => {
    const user = current();
    if (user && (!currentUser || currentUser.id !== user.id)) { currentUser = user; mount(); startBackgroundSync(); }
    if (!user) { currentUser = null; const b = document.getElementById("zen-central-entry"); if (b) b.remove(); }
  }, 1200);
  window.ZEN_CENTRAL = {
    version: 2,
    setup: setupCentral,
    requestActivation,
    activateBeforeLogin,
    checkActivation,
    publishUsers,
    publishTasks,
    submitTaskEdit,
    syncNow,
    reconnectCentral,
    getSharedTasks,
    createInvitation,
    reviewRequests,
    getStatus: () => ({ connected: !!directory, stage: "encrypted-task-sharing-sync", intervalSeconds: 10 })
  };
})();