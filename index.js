import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'orbs.json');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

const token = required('DISCORD_TOKEN');
const clientId = required('CLIENT_ID');
const guildId = process.env.GUILD_ID?.trim();

const commands = [
  new SlashCommandBuilder().setName('orb').setDescription('Controla seus registros de Orbs')
    .addSubcommand((sub) => sub.setName('saldo').setDescription('Mostra seu saldo registrado'))
    .addSubcommand((sub) => sub.setName('registrar').setDescription('Registra Orbs recebidos manualmente')
      .addIntegerOption((opt) => opt.setName('quantidade').setDescription('Quantidade de Orbs').setRequired(true).setMinValue(1).setMaxValue(1000000))
      .addStringOption((opt) => opt.setName('missao').setDescription('Nome da missão').setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) => sub.setName('historico').setDescription('Mostra seus últimos registros'))
    .addSubcommand((sub) => sub.setName('ranking').setDescription('Mostra o ranking deste servidor'))
    .addSubcommand((sub) => sub.setName('ajuda').setDescription('Mostra como usar o bot'))
    .toJSON(),
];

async function loadDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = { users: {} };
    await saveDb(initial);
    return initial;
  }
}

async function saveDb(db) {
  const temp = `${DATA_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(temp, DATA_FILE);
}

function userRecord(db, userId, username) {
  db.users[userId] ??= { username, total: 0, entries: [] };
  db.users[userId].username = username;
  return db.users[userId];
}

function safeMission(value) {
  return value.replace(/[\n\r]/g, ' ').trim().slice(0, 100);
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
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
      return interaction.reply({ ephemeral: true, content: '**Bot seguro de Orbs**\nUse `/orb registrar` depois de concluir uma missão manualmente. Este bot não assiste anúncios nem automatiza o Discord.' });
    }

    if (sub === 'saldo') {
      return interaction.reply({ content: `**${interaction.user.username}**, seu saldo registrado é **${record.total.toLocaleString('pt-BR')} Orbs**.` });
    }

    if (sub === 'registrar') {
      const amount = interaction.options.getInteger('quantidade', true);
      const mission = safeMission(interaction.options.getString('missao', true));
      record.total += amount;
      record.entries.push({ amount, mission, at: new Date().toISOString(), guildId: interaction.guildId });
      record.entries = record.entries.slice(-50);
      await saveDb(db);
      return interaction.reply({ content: `Registro salvo: **+${amount.toLocaleString('pt-BR')} Orbs** pela missão **${mission}**. Saldo: **${record.total.toLocaleString('pt-BR')} Orbs**.` });
    }

    if (sub === 'historico') {
      const entries = record.entries.slice(-10).reverse();
      if (!entries.length) return interaction.reply({ ephemeral: true, content: 'Você ainda não tem registros.' });
      const lines = entries.map((entry) => `• **+${entry.amount.toLocaleString('pt-BR')}** — ${entry.mission}`);
      return interaction.reply({ ephemeral: true, content: `**Seu histórico recente**\n${lines.join('\n')}` });
    }

    if (sub === 'ranking') {
      const rows = Object.values(db.users).sort((a, b) => b.total - a.total).slice(0, 10);
      const lines = rows.length ? rows.map((row, i) => `${i + 1}. **${row.username}** — ${row.total.toLocaleString('pt-BR')} Orbs`) : ['Ainda não há registros.'];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Ranking de Orbs').setDescription(lines.join('\n')).setColor(0x5865f2)] });
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
