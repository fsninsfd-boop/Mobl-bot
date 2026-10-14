# Mobl-bot

Bot Discord para registrar e consultar Orbs obtidos manualmente em missões.

## Requisitos

- Node.js 20 ou superior;
- Uma aplicação criada no [Discord Developer Portal](https://discord.com/developers/applications);
- Token do bot e o Application ID (`CLIENT_ID`).

## Configuração

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Copie `.env.example` para `.env` e preencha os valores:

   ```bash
   cp .env.example .env
   ```

   `GUILD_ID` é opcional. Quando informado, os comandos são registrados imediatamente no servidor de teste; sem ele, são registrados globalmente e podem levar algum tempo para aparecer.

3. No Developer Portal, convide o bot com os escopos `bot` e `applications.commands`.

4. Inicie:

   ```bash
   npm start
   ```

## Comandos

- `/orb ajuda` — mostra as instruções;
- `/orb registrar quantidade:<n> missao:<nome>` — registra Orbs recebidos manualmente;
- `/orb saldo` — mostra o saldo do usuário no servidor atual;
- `/orb historico` — mostra os dez registros mais recentes do usuário no servidor atual;
- `/orb ranking` — mostra os dez maiores saldos do servidor atual.

Os dados são salvos em `data/orbs.json`, criado automaticamente. O bot não automatiza anúncios, cliques ou ações de usuário no Discord.

## Desenvolvimento

Valide a sintaxe antes de iniciar:

```bash
node --check index.js
```
