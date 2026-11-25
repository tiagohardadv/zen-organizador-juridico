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
- O compartilhamento local de lembretes permanece restrito ao mesmo navegador; a Central ZEN sincroniza tarefas compartilhadas entre computadores autorizados. Lembretes e registros particulares não são sincronizados em tempo real, mas podem integrar backups criptografados individuais.

## Central compartilhada e armazenamento

O ZEN continua sendo uma aplicação estática, sem servidor próprio, banco de dados remoto ou autenticação hospedada. As contas e os registros particulares permanecem no armazenamento local de cada navegador. A Central ZEN utiliza uma pasta compartilhada e sincronizada pelo Google Drive para computador para transportar operações de tarefas compartilhadas e armazenar backups criptografados. O Drive é o meio de transporte/armazenamento de arquivos; não é um backend do aplicativo.

## Migração dos dados existentes

Na primeira configuração da conta administradora, o aplicativo copia os dados antigos das chaves locais do ZEN para o espaço dessa conta. A migração não apaga as chaves antigas. Faça um backup JSON antes de atualizar, por precaução.

## Backups automáticos na Central ZEN

Na janela **Central ZEN**, cada usuário pode ativar/desbloquear, criar manualmente e restaurar backups da própria conta. Os arquivos são gravados em `ZEN_CENTRAL/BACKUPS/<userId>/<deviceId>/` na pasta compartilhada do Google Drive. Cada dispositivo mantém até 7 versões diárias; o arquivo do dia é atualizado quando há alterações salvas e uma nova versão diária é criada enquanto o ZEN permanece aberto.

O conteúdo inclui tarefas e lembretes próprios do usuário, além dos tipos de peças. Os registros compartilhados de terceiros não são incluídos como se fossem propriedade do usuário. Os backups usam AES-256-GCM e PBKDF2-SHA-256 (310.000 iterações). Cada usuário define uma senha exclusiva de pelo menos 12 caracteres. A senha fica somente na memória durante a sessão e precisa ser informada novamente após recarregar o ZEN ou entrar em outro computador. Para restaurar em outro dispositivo, use a mesma conta e a mesma senha do backup.

A restauração permite selecionar uma versão de qualquer computador autorizado que tenha acesso à pasta central. O conteúdo é **mesclado** com os registros atuais: IDs já existentes não são sobrescritos nem apagados. Assim, a restauração recupera registros ausentes, mas não reverte alterações de registros que já existam na base atual.

Os backups automáticos só são gravados enquanto o ZEN está aberto, o dispositivo está conectado à Central e a pasta sincronizada está acessível e autorizada. O Google Drive pode atrasar a sincronização. Quem tiver permissão direta de edição na pasta pode excluir arquivos manualmente; o ZEN não consegue impedir isso. Restrinja a pasta a computadores e pessoas confiáveis. Se a senha for perdida, o conteúdo criptografado não poderá ser recuperado.

As opções antigas de proteção local no IndexedDB e de backup automático em pasta escolhida pelo usuário deixaram de ser carregadas pelo aplicativo. Os dados já existentes no IndexedDB e os arquivos `.zen` antigos não são apagados por esta atualização. A exportação manual JSON/.zen e a restauração manual de arquivo sincronizado continuam disponíveis como alternativas.
## Limites importantes

O login organiza o acesso entre usuários do mesmo navegador, mas não criptografa os registros armazenados no localStorage. Uma pessoa com acesso técnico ao perfil do navegador ou ao dispositivo pode inspecionar ou alterar esses dados. Proteja o dispositivo, o perfil do navegador e os backups. O login local não equivale a uma autenticação com servidor nem protege dados contra um usuário com controle do próprio navegador.

## Publicação

O site é servido pelo GitHub Pages a partir da branch main. O arquivo principal é index.html. Os módulos auxiliares incluem auth.js, backup-security.js e zen-central.js. Os módulos legados local-backup.js e external-backup.js permanecem no repositório, mas não são carregados pela aplicação.


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
- Esta etapa sincroniza **cadastros e credenciais**. A sincronização de tarefas compartilhadas é descrita na seção própria abaixo; lembretes e sessões ainda permanecem locais.
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

Esta seção documenta a fundação inicial de ativação e estrutura. As funcionalidades posteriores de sincronização de tarefas compartilhadas estão descritas abaixo. O login e os registros continuam locais no navegador, sem servidor confiável. Não considere a central pronta para produção. O controle administrativo na interface não substitui as permissões do Google Drive: quem possui acesso direto de edição à pasta pode modificar ou excluir arquivos manualmente. A sincronização de arquivos pelo Drive pode atrasar ou entregar arquivos em ordens diferentes.


## Sincronização de tarefas compartilhadas — etapa inicial

A Central ZEN publica tarefas com compartilhamento ativo em operações individuais por dispositivo. O conteúdo das operações usa ECDH P-256, HKDF-SHA-256 e AES-256-GCM; cada envelope é assinado com ECDSA P-256 e verificado pelo destinatário antes de ser aceito.

O recebimento ocorre enquanto o ZEN está aberto, com consulta periódica de 10 segundos. O computador administrador também recebe uma identidade criptográfica de dispositivo quando configura ou reconecta a central. Alterações na lista de compartilhamento geram novas operações; remoções de acesso e exclusões geram operações de revogação. Os arquivos são append-only e separados por dispositivo de origem e destinatário.

**Edição compartilhada:** quando uma tarefa é compartilhada com permissão de edição, o computador destinatário pode enviar uma solicitação criptografada ao dispositivo proprietário. O proprietário valida novamente a permissão e a versão-base da tarefa antes de aplicar a alteração; em seguida, publica um novo snapshot para os dispositivos autorizados. Exclusões continuam reservadas ao proprietário. Se a tarefa tiver sido alterada no computador proprietário desde a versão recebida, a solicitação é registrada como conflito e não sobrescreve a versão mais recente. O computador proprietário precisa estar com o ZEN aberto e conectado para processar solicitações; o Google Drive pode atrasar a entrega.

**Limitações e segurança:** esta etapa implementa edição de tarefas, não edição de lembretes. A validação da permissão ocorre no computador proprietário, mas a identidade do usuário editor é informada pelo navegador do dispositivo remetente; como não há servidor nem assinatura criptográfica individual por usuário, isso não equivale a uma autenticação forte contra alguém que controle o navegador ou o computador autorizado. A revogação impede a exibição do registro após o recebimento da operação, mas não apaga cópias ou informações que alguém já tenha visualizado ou extraído. Os dados descriptografados ficam no armazenamento local do navegador; restrinja a pasta do Drive e os computadores autorizados a pessoas confiáveis.

