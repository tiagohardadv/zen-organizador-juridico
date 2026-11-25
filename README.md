# ZEN — Organizador Jurídico

Aplicativo web estático publicado pelo GitHub Pages.

## Autenticação e armazenamento

- Login local com usuário e senha individuais.
- Primeiro acesso: criação da conta administradora.
- O administrador pode criar usuários, alterar nome/perfil, ativar/desativar contas e redefinir senhas.
- Senhas derivadas com PBKDF2 (SHA-256), salt individual e 310.000 iterações.
- A sessão existe apenas em memória; ao recarregar ou fechar o aplicativo, será necessário entrar novamente.
- Tarefas, prazos, lembretes e tipos de peças são separados por usuário no armazenamento local do navegador.
- O administrador não recebe automaticamente acesso aos registros particulares dos demais usuários.
- O proprietário pode compartilhar tarefas e lembretes com permissão de visualização ou edição, podendo alterar ou revogar o compartilhamento.
- Compartilhamento disponível somente entre contas no mesmo navegador e perfil do dispositivo.

## Sem serviços de nuvem

O ZEN não utiliza backend, Firestore, Google Drive ou sincronização remota. O código de autenticação e os dados das contas permanecem no navegador. A pasta backend foi removida do projeto porque o salvamento em nuvem foi descontinuado.

## Migração dos dados existentes

Na primeira configuração da conta administradora, o aplicativo copia os dados antigos das chaves locais do ZEN para o espaço dessa conta. A migração não apaga as chaves antigas. Faça um backup JSON antes de atualizar, por precaução.

## Limites importantes

O login organiza o acesso entre usuários do mesmo navegador, mas não criptografa os registros armazenados no localStorage. Uma pessoa com acesso técnico ao perfil do navegador ou ao dispositivo pode inspecionar ou alterar esses dados. Proteja o dispositivo, o perfil do navegador e os backups. O login local não equivale a uma autenticação com servidor nem protege dados contra um usuário com controle do próprio navegador.

## Publicação

O site é servido pelo GitHub Pages a partir da branch main. O arquivo principal é index.html e o módulo de autenticação é auth.js.
