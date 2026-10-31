import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'orbs.json');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

const token = required('DISCORD_TOKEN');
const clientId = required('CLIENT_ID');
const guildId = process.env.GUILD_ID?.trim();
const RANDOM_ROLE_NAMES = ['Explorador', 'Guardião', 'Estrategista', 'Pioneiro', 'Comandante', 'Aventureiro', 'Arquiteto', 'Sentinela', 'Mestre', 'Cronista'];

const commands = [
  new SlashCommandBuilder().setName('orb').setDescription('Controla seus registros de Orbs')
    .addSubcommand((sub) => sub.setName('saldo').setDescription('Mostra seu saldo registrado'))
    .addSubcommand((sub) => sub.setName('registrar').setDescription('Registra Orbs recebidos manualmente')
      .addIntegerOption((opt) => opt.setName('quantidade').setDescription('Quantidade de Orbs').setRequired(true).setMinValue(1).setMaxValue(1000000))
      .addStringOption((opt) => opt.setName('missao').setDescription('Nome da missão').setRequired(true).setMaxLength(100)))
    .addSubcommand((sub) => sub.setName('historico').setDescription('Mostra seus últimos registros'))
    .addSubcommand((sub) => sub.setName('ranking').setDescription('Mostra o ranking deste servidor'))
    .addSubcommand((sub) => sub.setName('meta').setDescription('Mostra seu progresso para a meta'))
    .addSubcommand((sub) => sub.setName('definir-meta').setDescription('Define sua meta pessoal de Orbs')
      .addIntegerOption((opt) => opt.setName('quantidade').setDescription('Meta de Orbs').setRequired(true).setMinValue(1).setMaxValue(1000000000)))
    .addSubcommand((sub) => sub.setName('resumo').setDescription('Mostra estatísticas dos seus registros'))
    .addSubcommand((sub) => sub.setName('exportar').setDescription('Exporta seu histórico em formato resumido'))
    .addSubcommand((sub) => sub.setName('cargo-aleatorio').setDescription('Cria e atribui um cargo seguro com nome aleatório')
      .addUserOption((opt) => opt.setName('membro').setDescription('Membro que receberá o cargo; padrão: você')))
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
  db.users[userId] ??= { username, total: 0, goal: 0, entries: [] };
  db.users[userId].username = username;
  db.users[userId].goal ??= 0;
  db.users[userId].entries ??= [];
  return db.users[userId];
}

function safeMission(value) {
  return value.replace(/[\\n\\r]/g, ' ').trim().slice(0, 100);
}

function formatNumber(value) {
  return Number(value).toLocaleString('pt-BR');
}

function randomRoleName() {
  const name = RANDOM_ROLE_NAMES[Math.floor(Math.random() * RANDOM_ROLE_NAMES.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${name} ${suffix}`;
}

function progressBar(total, goal) {
  if (!goal) return 'Nenhuma meta definida.';
  const percent = Math.min(100, Math.round((total / goal) * 100));
  const filled = Math.round(percent / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${percent}%`;
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);
  await rest.put(route, { body: commands });
  console.log(guildId ? 'Comandos registrados no servidor de teste.' : 'Comandos globais registrados.');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', () => console.log(`Bot conectado como ${client.user.tag}`));

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'orb') return;
  try {
    const db = await loadDb();
    const record = userRecord(db, interaction.user.id, interaction.user.username);
    const sub = interaction.options.getSubcommand();

    if (sub === 'ajuda') {
      return interaction.reply({ ephemeral: true, content: '**Bot seguro de Orbs**\nUse `/orb registrar` depois de concluir uma missão manualmente. O bot não assiste anúncios nem automatiza o Discord.\n\nComandos: `saldo`, `registrar`, `historico`, `ranking`, `meta`, `definir-meta`, `resumo`, `exportar` e `cargo-aleatorio`.' });
    }
    if (sub === 'saldo') {
      return interaction.reply({ content: `**${interaction.user.username}**, seu saldo registrado é **${formatNumber(record.total)} Orbs**.` });
    }
    if (sub === 'registrar') {
      const amount = interaction.options.getInteger('quantidade', true);
      const mission = safeMission(interaction.options.getString('missao', true));
      record.total += amount;
      record.entries.push({ amount, mission, at: new Date().toISOString(), guildId: interaction.guildId });
      record.entries = record.entries.slice(-100);
      await saveDb(db);
      return interaction.reply({ content: `Registro salvo: **+${formatNumber(amount)} Orbs** pela missão **${mission}**. Saldo: **${formatNumber(record.total)} Orbs**.` });
    }
    if (sub === 'historico') {
      const entries = record.entries.slice(-10).reverse();
      if (!entries.length) return interaction.reply({ ephemeral: true, content: 'Você ainda não tem registros.' });
      const lines = entries.map((entry) => `• **+${formatNumber(entry.amount)}** — ${entry.mission}`);
      return interaction.reply({ ephemeral: true, content: `**Seu histórico recente**\n${lines.join('\n')}` });
    }
    if (sub === 'ranking') {
      const rows = Object.values(db.users).sort((a, b) => b.total - a.total).slice(0, 10);
      const lines = rows.length ? rows.map((row, i) => `${i + 1}. **${row.username}** — ${formatNumber(row.total)} Orbs`) : ['Ainda não há registros.'];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('Ranking de Orbs').setDescription(lines.join('\n')).setColor(0x5865f2)] });
    }
    if (sub === 'meta') {
      return interaction.reply({ ephemeral: true, content: record.goal ? `Sua meta é **${formatNumber(record.goal)} Orbs**.\nProgresso: **${formatNumber(record.total)} / ${formatNumber(record.goal)}**\n${progressBar(record.total, record.goal)}` : 'Você ainda não definiu uma meta. Use `/orb definir-meta quantidade:<valor>`.' });
    }
    if (sub === 'definir-meta') {
      record.goal = interaction.options.getInteger('quantidade', true);
      await saveDb(db);
      return interaction.reply({ ephemeral: true, content: `Meta definida para **${formatNumber(record.goal)} Orbs**.\n${progressBar(record.total, record.goal)}` });
    }
    if (sub === 'resumo') {
      const count = record.entries.length;
      const average = count ? Math.round(record.total / count) : 0;
      const last = record.entries.at(-1);
      return interaction.reply({ ephemeral: true, content: `**Seu resumo**\nTotal: **${formatNumber(record.total)} Orbs**\nRegistros: **${formatNumber(count)}**\nMédia por registro: **${formatNumber(average)} Orbs**\nÚltimo registro: ${last ? `+${formatNumber(last.amount)} — ${last.mission}` : 'nenhum'}` });
    }
    if (sub === 'cargo-aleatorio') {
      if (!interaction.inGuild()) return interaction.reply({ ephemeral: true, content: 'Este comando só pode ser usado dentro de um servidor.' });
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ ephemeral: true, content: 'Você precisa da permissão **Gerenciar Cargos** para usar este comando.' });
      const target = interaction.options.getMember('membro') || interaction.member;
      const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.reply({ ephemeral: true, content: 'O bot precisa da permissão **Gerenciar Cargos**.' });
      const name = randomRoleName();
      const role = await interaction.guild.roles.create({ name, reason: `Cargo aleatório solicitado por ${interaction.user.tag}` });
      if (role.position >= me.roles.highest.position) {
        await role.delete('Cargo fora da hierarquia do bot');
        return interaction.reply({ ephemeral: true, content: 'Não consegui atribuir o cargo porque ele ficou acima do cargo mais alto do bot.' });
      }
      await target.roles.add(role, `Cargo aleatório solicitado por ${interaction.user.tag}`);
      db.audit ??= [];
      db.audit.push({ action: 'random_role_created_and_assigned', roleId: role.id, roleName: role.name, memberId: target.id, by: interaction.user.id, at: new Date().toISOString() });
      db.audit = db.audit.slice(-500);
      await saveDb(db);
      return interaction.reply({ content: `Cargo **${role.name}** criado e atribuído a **${target.user.username}**.` });
    }
    if (sub === 'exportar') {
      const entries = record.entries.slice(-50).reverse();
      const text = entries.length ? entries.map((entry) => `${entry.at} | +${entry.amount} Orbs | ${entry.mission}`).join('\n') : 'Nenhum registro.';
      return interaction.reply({ ephemeral: true, content: `\`\`\`text\nSaldo: ${record.total} Orbs\nMeta: ${record.goal || 'não definida'}\n\n${text.slice(0, 1800)}\n\`\`\`` });
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
