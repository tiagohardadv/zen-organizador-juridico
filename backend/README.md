# ZEN — Backend de sincronização

Backend separado do aplicativo principal. O arquivo `index.html` não é alterado por este serviço.

## Componentes

- Node.js 22 + Express no Google Cloud Run.
- Google OAuth Authorization Code Flow.
- Google Drive API com escopo `drive.file`.
- Firestore para metadados, estados OAuth, sessões e token criptografado.
- Refresh token criptografado com AES-256-GCM. A chave de criptografia deve vir do Secret Manager.
- Arquivo principal `ZEN_DADOS.json` na pasta `ZEN - ORGANIZADOR JURÍDICO` do Drive.
- Backups históricos em subpasta `Backups` (retenção automática dos 20 mais recentes).

## Endpoints

- `GET /health` — verificação do serviço.
- `GET /auth/google` — inicia OAuth.
- `GET /auth/google/callback` — callback OAuth.
- `POST /auth/session` — troca código de uso único por sessão do ZEN.
- `POST /auth/logout` — encerra a sessão.
- `GET /api/sync` — recupera o JSON e a revisão da nuvem.
- `PUT /api/sync` — grava JSON com controle otimista de revisão.
- `GET /api/backups` — lista backups.

## Variáveis e segredos

Configurar no Cloud Run:
- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` (Secret Manager)
- `OAUTH_REDIRECT_URI` (URL final do serviço + `/auth/google/callback`)
- `ALLOWED_GOOGLE_EMAIL`
- `TOKEN_ENCRYPTION_KEY` (Secret Manager; Base64 de exatamente 32 bytes)
- `FIRESTORE_COLLECTION=zen`

Não criar arquivo `.env` com credenciais no GitHub. O `.env.example` contém apenas marcadores.

## Implantação — não executar antes da configuração

1. Criar/selecionar o banco Firestore em modo Native no mesmo projeto Google Cloud.
2. Ativar Cloud Run, Cloud Build, Artifact Registry, Firestore e Google Drive API.
3. Criar uma conta de serviço dedicada para o Cloud Run e conceder somente acesso necessário ao Firestore e aos segredos.
4. Criar os segredos `GOOGLE_CLIENT_SECRET` e `TOKEN_ENCRYPTION_KEY` no Secret Manager.
5. Implantar esta pasta como serviço Cloud Run.
6. Copiar a URL HTTPS gerada e configurar `OAUTH_REDIRECT_URI` como `URL/auth/google/callback`.
7. Adicionar essa URI exata em Google Auth Platform → Clients → cliente Web application → Authorized redirect URIs.
8. Configurar a conta Google autorizada em `ALLOWED_GOOGLE_EMAIL`.
9. Testar `/health`, OAuth, leitura e gravação antes de conectar o aplicativo principal.

## Limitações desta primeira entrega

Esta é a base do serviço, ainda não a integração ativa do frontend. O aplicativo atual continua local e inalterado. A camada de sincronização do frontend deverá implementar: recuperação somente quando não houver dados locais, fila/debounce, sincronização periódica, tratamento de conflito 409, exclusões/tombstones e restauração de backup. Não conectar dados reais antes de concluir essa etapa e testar o fluxo completo.

## Segurança

- Não registrar tokens, conteúdo do JSON ou dados de clientes nos logs.
- Não armazenar Client Secret ou Refresh Token no frontend ou no repositório.
- Não abrir o serviço para origens diferentes do GitHub Pages configurado.
- O backend restringe a autorização à conta informada em `ALLOWED_GOOGLE_EMAIL`.
- A sessão do ZEN é um token opaco e revogável; o refresh token Google permanece no servidor criptografado.
