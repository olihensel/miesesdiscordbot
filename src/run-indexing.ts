require('dotenv').config();
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { Client, Intents } from 'discord.js';
import { compact, uniq, uniqBy } from 'lodash';
import moment from 'moment';
import 'reflect-metadata';
import { createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as ormConfig from '../ormconfig.json';
import { DiscordChannel } from './entity/discord-channel';
import { DiscordMessage } from './entity/discord-message';
import { DiscordReaction } from './entity/discord-reaction';
import { DiscordUser } from './entity/discord-user';

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

function createInstance<T>(classType: ClassConstructor<T>, plainObj: T): T {
  return plainToInstance(classType, plainObj);
}
const suuncordServerId = '717034183465107456';
client.on('error', console.error);
client.on('ready', async () => {
  console.log(`Logged in as ${client?.user?.tag}!`);
  const minDateFullRange = moment('2021-01-01');
  const connection = await createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });
  for (const [, guild] of client.guilds.cache) {
    console.log(`${guild.name} | ${guild.id}`);
    if (guild.id !== suuncordServerId) {
      console.log('skipping guild', guild.name);
      continue;
    }

    const seenMessages = new Set<string>();
    // build cache of all members DiscordAPIError: Missing Access
    // await guild.members.list({ limit: 1000 });

    for (const [, channel] of await guild.channels.cache) {
      console.log(`${guild.name} => ${channel.id} | ${channel.name}`, channel.isText(), channel.isThread());
      let channelPath = channel.name;
      let tempChannel = channel;
      while (tempChannel.parent) {
        channelPath = `${tempChannel.parent?.name}/${channelPath}`;
        tempChannel = tempChannel.parent;
      }
      const dbChannel = await connection.manager.save(
        createInstance(DiscordChannel, { id: channel.id, displayName: channel.name, displayNamePath: channelPath }),
      );

      if (channel.isText()) {
        const limit = 100;
        let lastLength = limit;
        let lastOldest: string | undefined;
        let lastOldestDate: Date | undefined;
        while (lastLength >= limit) {
          try {
            const messages = await channel.messages.fetch({ limit, ...(lastOldest ? { before: lastOldest } : {}) });
            let count = 0;
            for (const [, message] of messages) {
              if (seenMessages.has(message.id)) {
                console.log('duplicate', message.id);
                continue;
              }
              seenMessages.add(message.id);
              if (moment(message.createdAt).isAfter(minDateFullRange)) {
                count++;
                lastOldest = message.id;
                lastOldestDate = message.createdAt;

                const from = await connection.manager.save(
                  createInstance(DiscordUser, {
                    id: message.author.id,
                    displayName: guild.members.cache.get(message.author.id)?.nickname ?? message.author.username,
                    username: message.author.tag,
                  }),
                );
                let mentions = uniqBy(
                  Array.from(message.mentions.users?.entries() ?? []).map(([_, mentionedMemberInfo]) => {
                    return createInstance(DiscordUser, {
                      id: mentionedMemberInfo.id,
                      displayName: guild.members.cache.get(mentionedMemberInfo.id)?.nickname ?? mentionedMemberInfo.username,
                      username: mentionedMemberInfo.tag,
                    });
                  }),
                  'id',
                );
                if (mentions.length > 0) {
                  mentions = await connection.manager.save(mentions);
                }
                const sanitizedMessageContent = message.content.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');

                const emoteRegex = /<:([a-zA-Z0-9_~\-+]+):\d+>/g;
                let match;
                let emotes: string[] = [];
                while ((match = emoteRegex.exec(sanitizedMessageContent))) {
                  emotes.push(match?.[1]);
                }
                if (emotes) {
                  emotes = uniq(compact(emotes));
                }
                const unorderedWords = sanitizedMessageContent
                  .replace(/<:[a-zA-Z0-9_~\-+]+:\d+>/g, '') // emotes
                  .replace(/<@[!&]\d+>/g, '') // mentiones
                  .split(/[^0-9a-zA-ZäöüÄÖÜß]/)
                  .filter((s) => s.length > 1);

                const words = uniq(unorderedWords.map((w) => w.toLowerCase()));

                const dbMessage = await connection.manager.save(
                  createInstance(DiscordMessage, <DiscordMessage>{
                    id: message.id,
                    channel: dbChannel,
                    emotes,
                    from,
                    mentions,
                    plainText: message.content,
                    messageLength: message.content.trim().length,
                    wordCount: unorderedWords.length,
                    timestamp: message.createdAt,
                    words,
                  }),
                );
                await connection.manager.delete(DiscordReaction, { message: { id: message.id } });

                const reactionPromises = Array.from(await message.reactions.cache.entries()).map(async ([reaction, reactionInfo]) => {
                  return createInstance(DiscordReaction, {
                    count: reactionInfo.count,
                    emote: reactionInfo.emoji?.name ?? reaction,
                    message: dbMessage,
                    users: (await reactionInfo.users.fetch({ limit: 100 })).map((user) => {
                      return createInstance(DiscordUser, {
                        id: user.id,
                        displayName: guild.members.cache.get(user.id)?.nickname ?? user.username,
                        username: user.tag,
                      });
                    }),
                  });
                });
                const reactions = await Promise.all(reactionPromises);

                if (reactions.length > 0) {
                  const reactionUsers = uniqBy(
                    reactions.flatMap((r) => r.users ?? []),
                    'id',
                  );
                  if (reactionUsers.length > 0) {
                    await connection.manager.save(reactionUsers);
                  }
                  await connection.manager.save(reactions);
                }
              }
            }
            lastLength = count;
            console.log(JSON.stringify({ lastLength, lastOldest, lastOldestDate }));
          } catch (e) {
            console.error(e);
            lastLength = 0;
          }
        }
      }
    }
  }
  client.destroy();
});

client.login(process.env.DISCORD_BOT_TOKEN);
