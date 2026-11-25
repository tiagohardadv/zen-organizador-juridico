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
        await saveHandle(root, null);
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
    renderStatus("Central criada: " + centralId + ". A sincronização de registros ainda não foi ativada.");
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
  async function requestActivation() {
    const manifest = await chooseCentral();
    const user = current();
    if (!user) throw new Error("Entre no ZEN antes de solicitar a ativação.");
    const code = prompt("Informe o código de ativação individual fornecido pelo administrador:");
    if (!code) return;
    const codeHash = await sha256(code.trim());
    const invitesDir = await directory.getDirectoryHandle("ADMIN").then(d => d.getDirectoryHandle("CONVITES"));
    let invitation = null;
    for await (const [name, entry] of invitesDir.entries()) {
      if (entry.kind !== "file" || !name.endsWith(".json")) continue;
      try {
        const item = await readJson(invitesDir, name);
        if (item.codeHash === codeHash && !item.usedAt && new Date(item.expiresAt).getTime() > Date.now()) {
          invitation = { name, item }; break;
        }
      } catch (_) {}
    }
    if (!invitation) throw new Error("Código inválido, expirado ou já utilizado.");
    const deviceId = id();
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const proof = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, encoder.encode(manifest.centralId + "|" + deviceId + "|" + user.id));
    const request = {
      schemaVersion: 1, requestId: crypto.randomUUID(), centralId: manifest.centralId,
      deviceId, userId: user.id, username: user.username, displayName: user.name,
      publicKey, proof: b64(new Uint8Array(proof)), invitationFile: invitation.name, codeHash,
      requestedAt: new Date().toISOString(), status: "pending"
    };
    const requests = await directory.getDirectoryHandle("SOLICITACOES");
    await writeJson(requests, deviceId + ".json", request);
    await saveHandle(directory, deviceId);
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key: "device-private-" + deviceId, privateKey: keys.privateKey, publicKey: keys.publicKey, userId: user.id, centralId: manifest.centralId });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    renderStatus("Solicitação enviada. Aguarde a aprovação do administrador. Dispositivo: " + deviceId);
    alert("Solicitação enviada ao administrador. Este computador ainda não está autorizado a sincronizar dados.");
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
    alert("Código de ativação (uso único, válido por 24 horas):\n\n" + code + "\n\nEntregue-o diretamente ao responsável pelo computador.");
  }
  async function reviewRequests() {
    if (!isAdmin()) throw new Error("Somente o administrador pode autorizar dispositivos.");
    if (!directory) {
      const saved = await loadHandle();
      if (saved && saved.handle) directory = saved.handle;
      else await chooseCentral();
    }
    const requestDir = await directory.getDirectoryHandle("SOLICITACOES");
    const adminDir = await directory.getDirectoryHandle("ADMIN");
    const devicesFile = await readJson(adminDir, "dispositivos.json");
    const pending = [];
    for await (const [name, entry] of requestDir.entries()) {
      if (entry.kind !== "file" || !name.endsWith(".json")) continue;
      try {
        const req = await readJson(requestDir, name);
        if (req.status === "pending") pending.push({ name, req });
      } catch (_) {}
    }
    if (!pending.length) { alert("Não há solicitações pendentes."); return; }
    const listing = pending.map((x, i) => (i + 1) + ". " + x.req.deviceId + " — " + x.req.username + " (" + x.req.displayName + ")").join("\n");
    const choice = prompt("Solicitações pendentes:\n\n" + listing + "\n\nInforme o número do dispositivo que deseja autorizar:");
    const selected = pending[Number(choice) - 1];
    if (!selected) return;
    if (!confirm("Autorizar " + selected.req.deviceId + " para o usuário " + selected.req.username + "?")) return;
    const inviteDir = await adminDir.getDirectoryHandle("CONVITES");
    if (!/^[a-f0-9-]{36}\\.json$/i.test(selected.req.invitationFile || "")) throw new Error("Referência de convite inválida.");
    const invite = await readJson(inviteDir, selected.req.invitationFile);
    if (invite.centralId !== selected.req.centralId || invite.codeHash !== selected.req.codeHash || invite.usedAt || new Date(invite.expiresAt).getTime() <= Date.now()) throw new Error("O convite foi utilizado, expirou ou não corresponde à solicitação.");
    const importedKey = await crypto.subtle.importKey("jwk", selected.req.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const proofValid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, importedKey, fromB64(selected.req.proof), encoder.encode(selected.req.centralId + "|" + selected.req.deviceId + "|" + selected.req.userId));
    if (!proofValid) throw new Error("A prova criptográfica do dispositivo é inválida.");
    const device = {
      deviceId: selected.req.deviceId, userId: selected.req.userId,
      username: selected.req.username, displayName: selected.req.displayName,
      publicKey: selected.req.publicKey, authorizedAt: new Date().toISOString(),
      status: "active"
    };
    devicesFile.devices = Array.isArray(devicesFile.devices) ? devicesFile.devices : [];
    if (devicesFile.devices.some(d => d.deviceId === device.deviceId)) throw new Error("Este dispositivo já está cadastrado.");
    devicesFile.devices.push(device);
    await writeJson(adminDir, "dispositivos.json", devicesFile);
    invite.usedAt = new Date().toISOString();
    invite.usedByDeviceId = device.deviceId;
    await writeJson(inviteDir, selected.req.invitationFile, invite);
    selected.req.status = "approved";
    selected.req.approvedAt = new Date().toISOString();
    await writeJson(requestDir, selected.name, selected.req);
    renderStatus("Dispositivo autorizado: " + device.deviceId + ". A sincronização de dados ainda será habilitada em etapa posterior.");
    alert("Dispositivo autorizado. A etapa de sincronização de tarefas e lembretes ainda não está ativa.");
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
      '<p style="color:var(--text-muted);font-size:.86rem;line-height:1.5">Fundação da central compartilhada. Nesta etapa são configuradas a pasta e a autorização de dispositivos. Tarefas, lembretes e autenticação ainda permanecem no armazenamento local.</p>' +
      '<div id="zen-central-status" role="status" style="padding:10px;background:var(--surface-subtle);border:1px solid var(--border);border-radius:8px;font-size:.82rem;margin:12px 0">Nenhuma central conectada nesta sessão.</div>' +
      (admin ? '<div style="display:grid;gap:9px"><button class="btn btn-primary" id="zen-central-setup">Criar / conectar central (administrador)</button><button class="btn btn-ghost" id="zen-central-invite">Gerar convite de dispositivo</button><button class="btn btn-ghost" id="zen-central-review">Analisar solicitações e autorizar dispositivo</button></div>' : '<div style="display:grid;gap:9px"><button class="btn btn-primary" id="zen-central-request">Conectar e solicitar ativação</button></div>') +
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
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  const watcher = setInterval(() => {
    const user = current();
    if (user && (!currentUser || currentUser.id !== user.id)) { currentUser = user; mount(); }
    if (!user) { currentUser = null; const b = document.getElementById("zen-central-entry"); if (b) b.remove(); }
  }, 1200);
  window.ZEN_CENTRAL = {
    version: 1,
    setup: setupCentral,
    requestActivation,
    createInvitation,
    reviewRequests,
    getStatus: () => ({ connected: !!directory, deviceId: null, stage: "foundation-only" })
  };
})();