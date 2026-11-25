# ZEN — Organizador Jurídico

Aplicativo web estático publicado pelo GitHub Pages.

## Autenticação e armazenamento

- Login local com usuário e senha individuais.
- Primeiro acesso: criação da conta administradora.
- O administrador pode criar usuários, alterar nome/perfil, ativar/desativar contas e redefinir senhas.
- Senhas derivadas com PBKDF2 (SHA-256), salt individual e 310.000 iterações.
- A sessão é mantida no armazenamento local do perfil do navegador até o usuário clicar em “Deslogar”; não equivale a uma sessão autenticada por servidor.
- Tarefas, prazos, lembretes e tipos de peças são separados por usuário no armazenamento local do navegador.
- O administrador não recebe automaticamente acesso aos registros particulares dos demais usuários.
- O proprietário pode compartilhar tarefas e lembretes com permissão de visualização ou edição, podendo alterar ou revogar o compartilhamento.
- Compartilhamento disponível somente entre contas no mesmo navegador e perfil do dispositivo.

## Sem serviços de nuvem

O ZEN não utiliza backend, Firestore, Google Drive ou sincronização remota. O código de autenticação e os dados das contas permanecem no navegador. A pasta backend foi removida do projeto porque o salvamento em nuvem foi descontinuado.

## Migração dos dados existentes

Na primeira configuração da conta administradora, o aplicativo copia os dados antigos das chaves locais do ZEN para o espaço dessa conta. A migração não apaga as chaves antigas. Faça um backup JSON antes de atualizar, por precaução.

## Backups automáticos locais

O ZEN mantém até 7 cópias diárias dos dados da conta no IndexedDB do navegador. A cópia é criada ao entrar no sistema, atualizada quando há alterações salvas e verificada periodicamente enquanto o aplicativo permanece aberto. A área “Backup & Dados” informa a data da última cópia e permite restaurar a cópia local mais recente.

Essas cópias permanecem no mesmo perfil do navegador e dispositivo. Elas não substituem a exportação periódica de arquivos JSON ou .zen para outro local seguro. O navegador pode limpar dados locais, e a recuperação local não estará disponível se o perfil for apagado ou o dispositivo for perdido.

### Backup externo em pasta escolhida

Em Chrome ou Edge atualizado no computador, o usuário pode escolher uma pasta e autorizar o ZEN a gravar nela arquivos diários `.zen` criptografados com AES-256-GCM e PBKDF2-SHA-256. O arquivo do dia é atualizado quando os dados são salvos e o aplicativo mantém até 7 arquivos diários identificados pelo usuário. A limpeza automática alcança somente arquivos `.zen` com o prefixo exclusivo da conta e padrão de data reconhecido.

A senha do backup externo não é armazenada: fica apenas na memória enquanto a sessão da página está aberta. Após recarregar o ZEN, pode ser necessário clicar em “Desbloquear / autorizar pasta” e informar novamente a senha; a permissão de acesso à pasta também pode precisar ser renovada. O navegador deve permanecer aberto para que os backups ocorram. Se a pasta estiver em unidade removível, ela precisa estar conectada. Guarde a senha: sem ela, os arquivos não podem ser descriptografados. A API de seleção de pastas não é amplamente suportada em Firefox e Safari; nesses navegadores, utilize o backup local e a exportação manual.

## Limites importantes

O login organiza o acesso entre usuários do mesmo navegador, mas não criptografa os registros armazenados no localStorage. Uma pessoa com acesso técnico ao perfil do navegador ou ao dispositivo pode inspecionar ou alterar esses dados. Proteja o dispositivo, o perfil do navegador e os backups. O login local não equivale a uma autenticação com servidor nem protege dados contra um usuário com controle do próprio navegador.

## Publicação

O site é servido pelo GitHub Pages a partir da branch main. O arquivo principal é index.html. Os módulos auxiliares incluem auth.js, local-backup.js, external-backup.js e zen-central.js.


## Restaurar backup de pasta sincronizada

Na área “Backup & Dados”, o botão “Restaurar backup de pasta sincronizada” abre o seletor de arquivos do computador para escolher um arquivo .zen salvo em uma pasta sincronizada pelo Google Drive para computador, OneDrive, Dropbox ou outro serviço equivalente. O ZEN não usa API desses serviços, não acessa a conta online e não pesquisa arquivos na nuvem. A pasta precisa estar disponível no computador (ou o arquivo precisa ser baixado previamente). Após selecionar o arquivo, informe a senha; o conteúdo é descriptografado e passa pela confirmação e pelo fluxo de importação já existente, que **mescla** os registros com os dados atuais e evita duplicar IDs existentes. Não substitui nem apaga automaticamente a base atual.


## Ativação de computador e credenciais centralizadas

- A tela de primeiro acesso permite solicitar ativação antes de criar uma conta local ou fazer login.
- O dispositivo seleciona a pasta `ZEN_CENTRAL`, informa o convite de uso único e gera chaves criptográficas próprias.
- O administrador aprova o dispositivo e o ZEN gera um pacote de credenciais cifrado especificamente para a chave pública daquele computador (ECDH P-256 + HKDF-SHA-256 + AES-256-GCM).
- A chave privada de troca permanece não exportável no IndexedDB do perfil do navegador do dispositivo.
- Depois da aprovação, o computador solicita o pacote e importa localmente os usuários, incluindo os verificadores PBKDF2 já existentes. O usuário então entra com a mesma conta e senha cadastradas no PC administrador.
- Alterações de usuários feitas por um administrador são republicadas em pacotes criptografados para os dispositivos ativos, quando a pasta central está acessível e autorizada.
- A pasta compartilhada contém metadados públicos dos usuários e pacotes criptografados por dispositivo; não contém a lista de hashes em texto aberto.
- Esta etapa sincroniza **cadastros e credenciais**, não tarefas, prazos, lembretes, permissões de registros ou sessões. Os dados jurídicos continuam locais em cada computador.
- A autenticação continua sendo executada no navegador, sem servidor confiável. Um usuário com controle do próprio computador pode inspecionar o armazenamento local e tentar ataques offline contra verificadores de senha; use senhas fortes e restrinja o compartilhamento da pasta do Drive. Isso não equivale a autenticação centralizada por servidor.

## Central ZEN — fundação experimental

O módulo `zen-central.js` inicia a estrutura da central compartilhada em uma pasta local sincronizada pelo Google Drive para computador. O administrador seleciona a pasta sincronizada; o ZEN cria nela a subpasta `ZEN_CENTRAL`, com diretórios para administração, solicitações de dispositivos, operações, dados, histórico, conflitos e backups.

Nesta primeira etapa estão disponíveis:
- criação do manifesto e das configurações iniciais da central;
- reconexão à pasta central pelo seletor de diretórios;
- emissão de convites de ativação de uso único, válidos por 24 horas;
- solicitação de ativação por um computador que já tenha acesso à pasta compartilhada;
- geração de par de chaves ECDSA P-256 por dispositivo e prova criptográfica da solicitação;
- análise e aprovação administrativa de solicitações, com cadastro do dispositivo autorizado.

O módulo é uma fundação e **não sincroniza tarefas, lembretes, usuários ou permissões entre computadores nesta etapa**. O login e os registros atuais continuam locais no navegador. Não migre dados reais nem considere a central pronta para produção. O controle administrativo na interface não substitui as permissões do Google Drive: quem possui acesso direto de edição à pasta pode modificar ou excluir arquivos manualmente. A sincronização de arquivos pelo Drive pode atrasar ou entregar arquivos em ordens diferentes; a próxima etapa deverá implementar protocolo de operações, idempotência, validação e recuperação antes de conectar os dados jurídicos.
