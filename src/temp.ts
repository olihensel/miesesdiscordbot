require('dotenv').config();
import { Client, Intents } from 'discord.js';
import 'reflect-metadata';

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
  ],
});

const suuncordServerId = '717034183465107456';
client.on('error', console.error);
client.on('ready', async () => {
  console.log(`Logged in as ${client?.user?.tag}!`);
  for (const [, guild] of client.guilds.cache) {
    console.log(`${guild.name} | ${guild.id}`);
    if (guild.id !== suuncordServerId) {
      console.log('skipping guild', guild.name);
      continue;
    }

    // build cache of all members DiscordAPIError: Missing Access
    console.log(
      (await guild.members.list({ limit: 1000 })).map((m) => ({
        id: m.user.id,
        displayName: m.nickname ?? m.user.username,
        username: m.user.tag,
        avatarUrl: m.displayAvatarURL(),
      })),
    );
  }
  client.destroy();
});

client.login(process.env.DISCORD_BOT_TOKEN);
