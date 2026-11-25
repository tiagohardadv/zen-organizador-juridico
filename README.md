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

O site é servido pelo GitHub Pages a partir da branch main. O arquivo principal é index.html e o módulo de autenticação é auth.js.


## Restaurar backup de pasta sincronizada

Na área “Backup & Dados”, o botão “Restaurar backup de pasta sincronizada” abre o seletor de arquivos do computador para escolher um arquivo .zen salvo em uma pasta sincronizada pelo Google Drive para computador, OneDrive, Dropbox ou outro serviço equivalente. O ZEN não usa API desses serviços, não acessa a conta online e não pesquisa arquivos na nuvem. A pasta precisa estar disponível no computador (ou o arquivo precisa ser baixado previamente). Após selecionar o arquivo, informe a senha; o conteúdo é descriptografado e passa pela confirmação e pelo fluxo de importação já existente, que **mescla** os registros com os dados atuais e evita duplicar IDs existentes. Não substitui nem apaga automaticamente a base atual.
