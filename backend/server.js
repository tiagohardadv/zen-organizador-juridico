/**
 * ZEN — backend de autenticação e sincronização
 * Não inserir credenciais, tokens ou dados de clientes neste arquivo.
 */
"use strict";

const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Firestore, FieldValue } = require("@google-cloud/firestore");
const { google } = require("googleapis");

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    const allowed = FRONTEND_URL ? new URL(FRONTEND_URL).origin : null;
    if (!origin || origin === allowed) return callback(null, true);
    return callback(new Error("Origem não autorizada."), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600
}));
app.use(express.json({ limit: "6mb" }));

const PORT = Number(process.env.PORT || 8080);
const FRONTEND_URL = process.env.FRONTEND_URL;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI;
const ALLOWED_EMAIL = (process.env.ALLOWED_GOOGLE_EMAIL || "").trim().toLowerCase();
const TOKEN_KEY_B64 = process.env.TOKEN_ENCRYPTION_KEY || "";
const COLLECTION = process.env.FIRESTORE_COLLECTION || "zen";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const BACKUP_LIMIT = 20;

const firestore = new Firestore();
const db = (name) => firestore.collection(COLLECTION).doc(name);
const oauthConfigured = () => Boolean(FRONTEND_URL && CLIENT_ID && CLIENT_SECRET && REDIRECT_URI && ALLOWED_EMAIL);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
function encryptionKey() {
  const key = Buffer.from(TOKEN_KEY_B64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY deve ser uma chave Base64 de 32 bytes.");
  return key;
}
function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  };
}
function decryptSecret(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final()
  ]).toString("utf8");
}
function makeOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}
function requireConfig(res) {
  if (!oauthConfigured()) {
    res.status(503).json({ error: "Configuração OAuth incompleta no servidor." });
    return false;
  }
  return true;
}
function requireBearer(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer ([A-Za-z0-9_-]{40,})$/);
  if (!match) return res.status(401).json({ error: "Sessão ausente ou inválida." });
  req.sessionHash = sha256(match[1]);
  next();
}
async function getSession(req, res, next) {
  try {
    const ref = db("sessions").collection("items").doc(req.sessionHash);
    const snap = await ref.get();
    if (!snap.exists || snap.data().expiresAt <= Date.now()) {
      return res.status(401).json({ error: "Sessão expirada. Conecte novamente o Google Drive." });
    }
    req.accountKey = snap.data().accountKey;
    req.sessionRef = ref;
    next();
  } catch (error) {
    console.error("Falha ao validar sessão:", error.message);
    res.status(503).json({ error: "Não foi possível validar a sessão." });
  }
}
async function getGoogleClient(accountKey) {
  const snap = await db("accounts").collection("items").doc(accountKey).get();
  if (!snap.exists || !snap.data().encryptedRefreshToken) {
    throw new Error("Conta Google não autorizada. Faça a conexão novamente.");
  }
  const refreshToken = decryptSecret(snap.data().encryptedRefreshToken);
  const auth = makeOAuthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return { auth, drive: google.drive({ version: "v3", auth }), account: snap.data() };
}
function validateZenData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.tasks) || !Array.isArray(data.reminders) || !Array.isArray(data.pieceTypes)) return false;
  if (data.tasks.length > 100000 || data.reminders.length > 100000 || data.pieceTypes.length > 5000) return false;
  return true;
}
async function readDriveJson(drive, fileId) {
  const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  const chunks = [];
  for await (const chunk of response.data) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}
async function ensureDriveStructure(drive, accountRef, accountData) {
  let folderId = accountData.driveFolderId;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: {
        name: "ZEN - ORGANIZADOR JURÍDICO",
        mimeType: "application/vnd.google-apps.folder"
      },
      fields: "id,name"
    });
    folderId = created.data.id;
    await accountRef.set({ driveFolderId: folderId }, { merge: true });
  }
  let backupsFolderId = accountData.backupsFolderId;
  if (!backupsFolderId) {
    const created = await drive.files.create({
      requestBody: {
        name: "Backups",
        mimeType: "application/vnd.google-apps.folder",
        parents: [folderId]
      },
      fields: "id,name"
    });
    backupsFolderId = created.data.id;
    await accountRef.set({ backupsFolderId }, { merge: true });
  }
  return { folderId, backupsFolderId };
}
async function pruneBackups(drive, folderId) {
  const result = await drive.files.list({
    q: "'" + folderId + "' in parents and trashed = false",
    orderBy: "createdTime desc",
    pageSize: 100,
    fields: "files(id,name,createdTime)"
  });
  const files = result.data.files || [];
  for (const file of files.slice(BACKUP_LIMIT)) {
    await drive.files.delete({ fileId: file.id }).catch((error) => {
      console.warn("Não foi possível remover backup antigo:", error.message);
    });
  }
}
async function acquireSyncLock(accountRef, expectedRevision) {
  const lockId = randomToken(16);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(accountRef);
    const data = snap.exists ? snap.data() : {};
    const now = Date.now();
    if (data.syncLockUntil && data.syncLockUntil > now) {
      const error = new Error("Outra sincronização está em andamento.");
      error.status = 423;
      throw error;
    }
    const revision = Number(data.revision || 0);
    if (revision !== expectedRevision) {
      const error = new Error("Conflito: a versão na nuvem foi alterada em outro dispositivo.");
      error.status = 409;
      error.currentRevision = revision;
      throw error;
    }
    tx.set(accountRef, { syncLockId: lockId, syncLockUntil: now + 90000 }, { merge: true });
  });
  return lockId;
}
async function releaseSyncLock(accountRef, lockId, updates = {}) {
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(accountRef);
    if (snap.exists && snap.data().syncLockId === lockId) {
      tx.set(accountRef, {
        ...updates,
        syncLockId: FieldValue.delete(),
        syncLockUntil: FieldValue.delete()
      }, { merge: true });
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "zen-backend", configured: oauthConfigured() });
});

app.get("/auth/google", async (_req, res) => {
  if (!requireConfig(res)) return;
  try {
    const state = randomToken(32);
    await db("oauth_states").collection("items").doc(sha256(state)).set({
      createdAt: Date.now(),
      expiresAt: Date.now() + STATE_TTL_MS
    });
    const client = makeOAuthClient();
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"],
      state
    });
    res.redirect(url);
  } catch (error) {
    console.error("Falha ao iniciar OAuth:", error.message);
    res.status(500).json({ error: "Não foi possível iniciar a autorização Google." });
  }
});

app.get("/auth/google/callback", async (req, res) => {
  if (!requireConfig(res)) return;
  const { code, state, error: oauthError } = req.query;
  if (oauthError) return res.status(400).send("A autorização Google foi cancelada ou recusada.");
  if (typeof code !== "string" || typeof state !== "string") return res.status(400).send("Retorno OAuth inválido.");
  try {
    const stateRef = db("oauth_states").collection("items").doc(sha256(state));
    const stateSnap = await stateRef.get();
    if (!stateSnap.exists || stateSnap.data().expiresAt < Date.now()) {
      return res.status(400).send("Solicitação OAuth expirada ou inválida. Inicie novamente pelo ZEN.");
    }
    await stateRef.delete();

    const client = makeOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const profile = await oauth2.userinfo.get();
    const email = String(profile.data.email || "").toLowerCase();
    if (!profile.data.verified_email || email !== ALLOWED_EMAIL) {
      return res.status(403).send("Esta conta Google não está autorizada para este ZEN.");
    }

    const accountKey = sha256(email);
    const accountRef = db("accounts").collection("items").doc(accountKey);
    const previous = await accountRef.get();
    let refreshToken = tokens.refresh_token;
    if (!refreshToken && previous.exists && previous.data().encryptedRefreshToken) {
      refreshToken = decryptSecret(previous.data().encryptedRefreshToken);
    }
    if (!refreshToken) {
      return res.status(400).send("O Google não forneceu um refresh token. Revogue a autorização antiga e tente conectar novamente.");
    }
    await accountRef.set({
      email,
      encryptedRefreshToken: encryptSecret(refreshToken),
      tokenUpdatedAt: Date.now()
    }, { merge: true });

    const oneTimeCode = randomToken(32);
    await db("login_codes").collection("items").doc(sha256(oneTimeCode)).set({
      accountKey,
      expiresAt: Date.now() + 2 * 60 * 1000
    });
    res.redirect(FRONTEND_URL + "?zen_oauth_code=" + encodeURIComponent(oneTimeCode));
  } catch (error) {
    console.error("Falha no callback OAuth:", error.message);
    res.status(500).send("Não foi possível concluir a conexão Google. Tente novamente.");
  }
});

app.post("/auth/session", async (req, res) => {
  const code = req.body && req.body.code;
  if (typeof code !== "string" || code.length < 30) return res.status(400).json({ error: "Código de conexão inválido." });
  try {
    const codeRef = db("login_codes").collection("items").doc(sha256(code));
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists || codeSnap.data().expiresAt < Date.now()) {
      return res.status(400).json({ error: "Código de conexão expirado ou já utilizado." });
    }
    const { accountKey } = codeSnap.data();
    await codeRef.delete();
    const sessionToken = randomToken(40);
    await db("sessions").collection("items").doc(sha256(sessionToken)).set({
      accountKey,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS
    });
    res.set("Cache-Control", "no-store").json({ sessionToken, expiresIn: SESSION_TTL_MS / 1000 });
  } catch (error) {
    console.error("Falha ao criar sessão:", error.message);
    res.status(500).json({ error: "Não foi possível criar a sessão do ZEN." });
  }
});

app.post("/auth/logout", requireBearer, getSession, async (req, res) => {
  await req.sessionRef.delete();
  res.json({ ok: true });
});

app.get("/api/sync", requireBearer, getSession, async (req, res) => {
  try {
    const accountRef = db("accounts").collection("items").doc(req.accountKey);
    const snap = await accountRef.get();
    const account = snap.data() || {};
    if (!account.driveFileId) return res.json({ data: null, revision: Number(account.revision || 0) });
    const { drive } = await getGoogleClient(req.accountKey);
    const data = await readDriveJson(drive, account.driveFileId);
    if (!validateZenData(data)) throw new Error("O arquivo principal do ZEN no Drive possui estrutura inválida.");
    res.set("Cache-Control", "no-store").json({ data, revision: Number(account.revision || 0), modifiedAt: account.modifiedAt || null });
  } catch (error) {
    console.error("Falha ao ler sincronização:", error.message);
    res.status(502).json({ error: "Não foi possível recuperar os dados do Google Drive. Os dados locais devem ser preservados." });
  }
});

app.put("/api/sync", requireBearer, getSession, async (req, res) => {
  const data = req.body && req.body.data;
  const expectedRevision = Number(req.body && req.body.expectedRevision);
  if (!validateZenData(data) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return res.status(400).json({ error: "Dados ou revisão enviados em formato inválido." });
  }
  const accountRef = db("accounts").collection("items").doc(req.accountKey);
  let lockId;
  try {
    lockId = await acquireSyncLock(accountRef, expectedRevision);
    const { drive, account } = await getGoogleClient(req.accountKey);
    const { folderId, backupsFolderId } = await ensureDriveStructure(drive, accountRef, account);
    let fileId = account.driveFileId || null;

    if (fileId) {
      const previousData = await readDriveJson(drive, fileId);
      if (!validateZenData(previousData)) throw new Error("O arquivo atual do Drive não passou na validação.");
      const backupName = "zen_backup_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
      await drive.files.create({
        requestBody: { name: backupName, mimeType: "application/json", parents: [backupsFolderId] },
        media: { mimeType: "application/json", body: Readable.from([JSON.stringify(previousData, null, 2)]) },
        fields: "id,name"
      });
      await drive.files.update({
        fileId,
        media: { mimeType: "application/json", body: Readable.from([JSON.stringify(data, null, 2)]) }
      });
      await pruneBackups(drive, backupsFolderId);
    } else {
      const created = await drive.files.create({
        requestBody: { name: "ZEN_DADOS.json", mimeType: "application/json", parents: [folderId] },
        media: { mimeType: "application/json", body: Readable.from([JSON.stringify(data, null, 2)]) },
        fields: "id,name,modifiedTime"
      });
      fileId = created.data.id;
    }

    const newRevision = expectedRevision + 1;
    await releaseSyncLock(accountRef, lockId, {
      driveFolderId: folderId,
      backupsFolderId,
      driveFileId: fileId,
      revision: newRevision,
      modifiedAt: new Date().toISOString()
    });
    lockId = null;
    res.set("Cache-Control", "no-store").json({ ok: true, revision: newRevision });
  } catch (error) {
    if (lockId) await releaseSyncLock(accountRef, lockId).catch(() => {});
    const status = error.status || 502;
    if (status === 409) return res.status(409).json({ error: error.message, currentRevision: error.currentRevision });
    if (status === 423) return res.status(423).json({ error: error.message });
    console.error("Falha ao gravar sincronização:", error.message);
    res.status(status).json({ error: "Não foi possível salvar no Google Drive. Os dados locais foram preservados." });
  }
});

app.get("/api/backups", requireBearer, getSession, async (req, res) => {
  try {
    const { drive, account } = await getGoogleClient(req.accountKey);
    if (!account.backupsFolderId) return res.json({ backups: [] });
    const result = await drive.files.list({
      q: "'" + account.backupsFolderId + "' in parents and trashed = false",
      orderBy: "createdTime desc",
      pageSize: BACKUP_LIMIT,
      fields: "files(id,name,createdTime,size)"
    });
    res.json({ backups: result.data.files || [] });
  } catch (error) {
    console.error("Falha ao listar backups:", error.message);
    res.status(502).json({ error: "Não foi possível listar os backups." });
  }
});

app.use((error, _req, res, _next) => {
  console.error("Erro não tratado:", error.message);
  res.status(500).json({ error: "Erro interno do backend." });
});

app.listen(PORT, () => {
  console.log("ZEN backend ativo na porta " + PORT);
});
