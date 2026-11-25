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

