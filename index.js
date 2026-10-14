import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'orbs.json');
const MAX_HISTORY = 50;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

const token = required('DISCORD_TOKEN');
const clientId = required('CLIENT_ID');
const guildId = process.env.GUILD_ID?.trim();

const commands = [
  new SlashCommandBuilder()
    .setName('orb')
    .setDescription('Controla seus registros de Orbs')
    .addSubcommand((sub) => sub.setName('saldo').setDescription('Mostra seu saldo registrado'))
    .addSubcommand((sub) =>
      sub
        .setName('registrar')
        .setDescription('Registra Orbs recebidos manualmente')
        .addIntegerOption((opt) =>
          opt
            .setName('quantidade')
            .setDescription('Quantidade de Orbs')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1_000_000),
        )
        .addStringOption((opt) =>
          opt
            .setName('missao')
            .setDescription('Nome da missão')
            .setRequired(true)
            .setMaxLength(100),
        ),
    )
    .addSubcommand((sub) => sub.setName('historico').setDescription('Mostra seus últimos registros'))
    .addSubcommand((sub) => sub.setName('ranking').setDescription('Mostra o ranking deste servidor'))
    .addSubcommand((sub) => sub.setName('ajuda').setDescription('Mostra como usar o bot'))
    .toJSON(),
];

let writeQueue = Promise.resolve();

async function saveDb(db) {
  const temp = `${DATA_FILE}.tmp`;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(temp, DATA_FILE);
}

async function loadDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.users || typeof parsed.users !== 'object') {
      throw new Error('Banco de dados inválido: o campo users não existe.');
    }
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = { version: 1, users: {} };
    await saveDb(initial);
    return initial;
  }
}

function persist(db) {
  writeQueue = writeQueue.then(() => saveDb(db));
  return writeQueue;
}

function userRecord(db, userId, username) {
  db.users[userId] ??= { username, total: 0, entries: [] };
  db.users[userId].username = username;
  db.users[userId].entries ??= [];
  db.users[userId].total = Number.isFinite(db.users[userId].total) ? db.users[userId].total : 0;
  return db.users[userId];
}

function cleanMission(value) {
  return value.replace(/[\n\r]/g, ' ').trim().slice(0, 100);
}

function displayName(interaction, userId, fallback) {
  return interaction.guild?.members.cache.get(userId)?.displayName ?? fallback;
}

function entriesForGuild(record, guildId) {
  return record.entries.filter((entry) => entry.guildId === guildId);
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body: commands });
  console.log(guildId ? 'Comandos registrados no servidor de teste.' : 'Comandos globais registrados.');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'orb') return;

  try {
    const db = await loadDb();
    const record = userRecord(db, interaction.user.id, interaction.user.username);
    const sub = interaction.options.getSubcommand();

    if (sub === 'ajuda') {
      return interaction.reply({
        ephemeral: true,
        content:
          '**Bot de Orbs**\nUse `/orb registrar` após concluir uma missão manualmente, `/orb saldo` para consultar seu total, `/orb historico` para ver lançamentos recentes e `/orb ranking` para consultar o servidor.\n\nO bot não assiste anúncios nem automatiza ações do Discord.',
      });
    }

    if (sub === 'saldo') {
      const total = entriesForGuild(record, interaction.guildId).reduce((sum, entry) => sum + entry.amount, 0);
      return interaction.reply({
        content: `**${interaction.user.username}**, seu saldo neste servidor é **${total.toLocaleString('pt-BR')} Orbs**.`,
      });
    }

    if (sub === 'registrar') {
      const amount = interaction.options.getInteger('quantidade', true);
      const mission = cleanMission(interaction.options.getString('missao', true));
      if (!mission) return interaction.reply({ ephemeral: true, content: 'Informe um nome de missão válido.' });
      record.entries.push({ amount, mission, at: new Date().toISOString(), guildId: interaction.guildId });
      record.entries = record.entries.slice(-MAX_HISTORY);
      await persist(db);
      const total = entriesForGuild(record, interaction.guildId).reduce((sum, entry) => sum + entry.amount, 0);
      return interaction.reply({
        content: `Registro salvo: **+${amount.toLocaleString('pt-BR')} Orbs** pela missão **${mission}**. Saldo: **${total.toLocaleString('pt-BR')} Orbs**.`,
      });
    }

    if (sub === 'historico') {
      const entries = entriesForGuild(record, interaction.guildId).slice(-10).reverse();
      if (!entries.length) return interaction.reply({ ephemeral: true, content: 'Você ainda não tem registros neste servidor.' });
      const lines = entries.map((entry) => `• **+${entry.amount.toLocaleString('pt-BR')}** — ${entry.mission}`);
      return interaction.reply({ ephemeral: true, content: `**Seu histórico recente**\n${lines.join('\n')}` });
    }

    if (sub === 'ranking') {
      if (!interaction.guildId) return interaction.reply({ ephemeral: true, content: 'O ranking só funciona dentro de um servidor.' });
      const rows = Object.entries(db.users)
        .map(([userId, row]) => ({
          userId,
          username: row.username,
          total: entriesForGuild(row, interaction.guildId).reduce((sum, entry) => sum + entry.amount, 0),
        }))
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      const lines = rows.length
        ? rows.map((row, i) => `${i + 1}. **${displayName(interaction, row.userId, row.username)}** — ${row.total.toLocaleString('pt-BR')} Orbs`)
        : ['Ainda não há registros neste servidor.'];
      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Ranking de Orbs').setDescription(lines.join('\n')).setColor(0x5865f2)],
      });
    }
  } catch (error) {
    console.error(error);
    const message = 'Não foi possível concluir a operação. Verifique a configuração do bot.';
    if (interaction.replied || interaction.deferred) return interaction.followUp({ content: message, ephemeral: true });
    return interaction.reply({ content: message, ephemeral: true });
  }
});

await registerCommands();
await client.login(token);
