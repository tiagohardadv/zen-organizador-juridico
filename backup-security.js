/* ZEN — backups criptografados localmente (AES-GCM + PBKDF2) */
(function () {
  "use strict";
  const FORMAT = "ZEN-ENCRYPTED-BACKUP";
  const ITERATIONS = 310000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function toBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  function fromBase64(value) {
    if (typeof value !== "string" || value.length > 50000000) throw new Error("Campo codificado inválido.");
    return Uint8Array.from(atob(value), c => c.charCodeAt(0));
  }
  async function deriveKey(password, salt, iterations) {
    const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  function download(content, filename) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.exportEncryptedBackup = async function () {
    if (!window.crypto || !crypto.subtle) return alert("A criptografia exige navegador atualizado em conexão HTTPS.");
    const password = prompt("Crie uma senha exclusiva para este backup criptografado (mínimo de 12 caracteres):");
    if (password === null) return;
    if (password.length < 12) return alert("A senha do backup deve ter pelo menos 12 caracteres.");
    const confirmation = prompt("Digite novamente a senha do backup:");
    if (confirmation === null) return;
    if (password !== confirmation) return alert("As senhas não conferem. Nenhum backup foi criado.");

    try {
      const current = ZEN_AUTH.getCurrentUser();
      if (!current) throw new Error("Sessão não autenticada.");
      const ownTasks = tasks.filter(t => !t._sharedOwnerId && (!t._sharedOwnerId));
      const ownReminders = reminders.filter(r => !r._sharedOwnerId);
      const payload = {
        version: 5.1,
        exportDate: new Date().toISOString(),
        tasks: ownTasks.map(({ sharedWith, ...record }) => record),
        reminders: ownReminders.map(({ sharedWith, ...record }) => record),
        pieceTypes: pieceTypes
      };
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(password, salt, ITERATIONS);
      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(payload)));
      const envelope = {
        format: FORMAT,
        version: 1,
        algorithm: "AES-256-GCM",
        kdf: "PBKDF2-SHA-256",
        iterations: ITERATIONS,
        salt: toBase64(salt),
        iv: toBase64(iv),
        ciphertext: toBase64(new Uint8Array(encrypted))
      };
      download(JSON.stringify(envelope, null, 2), "zen_backup_criptografado_" + new Date().toISOString().slice(0, 10) + ".zen");
      alert("Backup criptografado criado. Guarde a senha: ela não pode ser recuperada.");
    } catch (error) {
      console.error("Falha ao criptografar backup:", error);
      alert("Não foi possível criar o backup criptografado.");
    }
  };

  window.importEncryptedBackup = async function () {
    const input = document.getElementById("file-import-encrypted");
    const status = document.getElementById("import-status");
    const file = input && input.files && input.files[0];
    if (!file) { status.textContent = "Selecione um backup criptografado."; return; }
    if (file.size > 25 * 1024 * 1024) { status.textContent = "O arquivo excede o limite de 25 MB."; return; }
    try {
      if (!window.crypto || !crypto.subtle) throw new Error("Criptografia indisponível neste navegador.");
      const envelope = JSON.parse(await file.text());
      if (!envelope || envelope.format !== FORMAT || envelope.version !== 1 ||
          envelope.algorithm !== "AES-256-GCM" || envelope.kdf !== "PBKDF2-SHA-256" ||
          !Number.isInteger(envelope.iterations) || envelope.iterations < 100000 || envelope.iterations > 1000000) {
        throw new Error("Formato de backup incompatível.");
      }
      const password = prompt("Informe a senha usada para criptografar este backup:");
      if (password === null) return;
      const salt = fromBase64(envelope.salt);
      const iv = fromBase64(envelope.iv);
      const ciphertext = fromBase64(envelope.ciphertext);
      if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16) throw new Error("Estrutura criptográfica inválida.");
      const key = await deriveKey(password, salt, envelope.iterations);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const data = JSON.parse(decoder.decode(plain));
      if (!data || !Array.isArray(data.tasks) || data.tasks.length > 10000 ||
          (data.reminders !== undefined && (!Array.isArray(data.reminders) || data.reminders.length > 10000)) ||
          (data.pieceTypes !== undefined && (!Array.isArray(data.pieceTypes) || data.pieceTypes.length > 500))) {
        throw new Error("Conteúdo do backup inválido.");
      }
      const jsonFile = new File([JSON.stringify(data)], "zen_backup_descriptografado.json", { type: "application/json" });
      const transfer = new DataTransfer();
      transfer.items.add(jsonFile);
      document.getElementById("file-import").files = transfer.files;
      input.value = "";
      importJSON();
    } catch (error) {
      console.error("Falha ao importar backup criptografado:", error);
      status.textContent = "Não foi possível abrir o backup. Confira a senha e a integridade do arquivo.";
    }
  };
})();