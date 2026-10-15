# Discord Orb Bot

Bot seguro para **registrar manualmente** missões e recompensas de Orbs no Discord.

> Este bot não abre anúncios, não simula visualizações, não usa self-bot e não automatiza sua conta. Você registra a recompensa depois de concluir a missão manualmente.

## Comandos

- `/orb saldo` — mostra o saldo registrado do usuário.
- `/orb registrar quantidade:<número> missão:<nome>` — registra Orbs recebidos manualmente.
- `/orb historico` — mostra os últimos registros do usuário.
- `/orb ranking` — mostra o ranking do servidor com base nos registros.
- `/orb ajuda` — exibe a ajuda.

## Instalação

1. Instale Node.js 20 ou superior.
2. Crie um aplicativo em [Discord Developer Portal](https://discord.com/developers/applications).
3. Em **Bot**, crie o bot e copie o token. Nunca envie esse token para ninguém.
4. Em **OAuth2 > URL Generator**, selecione os scopes `bot` e `applications.commands`.
5. Dê somente as permissões necessárias: `View Channels`, `Send Messages` e `Use Slash Commands`.
6. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN` e `CLIENT_ID`.
7. Para testes, preencha também `GUILD_ID` com o ID do seu servidor.
8. Execute:

```bash
npm install
npm start
```

## Armazenamento

Os registros ficam em `data/orbs.json`, localmente. O arquivo é ignorado pelo Git. Faça backup privado se necessário e não publique dados pessoais.

## Segurança

- Não coloque o token no código.
- Não dê permissões de administrador ao bot.
- Não use automação para assistir anúncios ou concluir missões.
- Se o token vazar, gere outro imediatamente no Developer Portal.
