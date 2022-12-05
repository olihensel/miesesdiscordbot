require('dotenv').config();
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { AnyThreadChannel, ChannelType, Client, GatewayIntentBits, Guild, MessageReaction, User } from 'discord.js';
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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageTyping,
  ],
});
const delayAsync = async (delay: number) => await new Promise((resolve) => setTimeout(resolve, delay));

function createInstance<T>(classType: ClassConstructor<T>, plainObj: T): T {
  return plainToInstance(classType, plainObj);
}
const suuncordServerId = '717034183465107456';
const oliServerId = '703705066351362068';
client.on('error', console.error);
client.on('ready', async () => {
  console.log(`Logged in as ${client?.user?.tag}!`);
  const minDateFullRange = moment('1900-01-01');
  const connection = await createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });
  for (const [, guild] of client.guilds.cache) {
    console.log(
      `${guild.name} | ${guild.id}`,
      //guild.members.me?.permissions?.serialize(true),
      // guild.members.me?.roles.cache.map((role) => console.log(role.name, role.permissions.serialize(true))),
    );
    console.log(
      (
        await Promise.all(
          [...guild.channels.cache.map((a) => a)].map(async (channel) => {
            let channelPath = channel.name;
            let tempChannel = channel;
            while (tempChannel.parent) {
              channelPath = `${tempChannel.parent?.name}/${channelPath}`;
              tempChannel = tempChannel.parent;
            }
            let output = [`${channel.isTextBased()} - ${channelPath}`];
            if (
              guild.members.me &&
              channel.permissionsFor(guild.members.me).has('ViewChannel') &&
              (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
            ) {
              try {
                const threads = await channel.threads.fetchArchived({ type: 'public' });
                output.push(...threads.threads.map((t) => `THREAD - ${channelPath}/${t.name}`));
              } catch (e) {
                console.log(e);
              }
              try {
                const threads = await channel.threads.fetchActive();
                output.push(...threads.threads.map((t) => `THREAD - ${channelPath}/${t.name}`));
              } catch (e) {
                console.log(e);
              }
            }
            return output;
          }),
        )
      ).flatMap((a) => a),
    );

    if (guild.id !== suuncordServerId) {
      console.log('skipping guild', guild.name);
      continue;
    }
    const seenMessages = new Set<string>();
    // build cache of all members DiscordAPIError: Missing Access
    // await guild.members.list({ limit: 1000 });

    // NOTE: the map(x => x) are necessary, because of discord.js specific itteratable? TODO: check if Array.from would also work
    const channelsAndThreads = [
      ...guild.channels.cache.map((channel) => channel),
      ...(
        await Promise.all(
          guild.channels.cache.map(async (channel) => {
            const channelThreads: AnyThreadChannel[] = [];
            if (
              guild.members.me &&
              // if readmessagehistory is true but viewchannel is false, api still refuses.
              channel.permissionsFor(guild.members.me).has('ViewChannel') &&
              channel.permissionsFor(guild.members.me).has('ReadMessageHistory') &&
              (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
            ) {
              try {
                const threads = await channel.threads.fetchArchived({ type: 'public' });
                channelThreads.push(...threads.threads.map((t) => t));
              } catch (e) {
                console.error(e);
              }
              try {
                const threads = await channel.threads.fetchActive();
                channelThreads.push(...threads.threads.map((t) => t));
              } catch (e) {
                console.error(e);
              }
            }
            return channelThreads;
          }),
        )
      ).flatMap((arr) => arr),
    ];
    const channelsWithHistoryAccess = channelsAndThreads.filter(
      (channel) =>
        guild.members.me &&
        // if readmessagehistory is true but viewchannel is false, api still refuses.
        channel.permissionsFor(guild.members.me).has('ViewChannel') &&
        channel.permissionsFor(guild.members.me).has('ReadMessageHistory'),
    );
    for (const channel of uniqBy(channelsWithHistoryAccess, 'id')) {
      let channelPath = channel.name;
      let tempChannel = channel;
      while (tempChannel.parent) {
        channelPath = `${tempChannel.parent?.name}/${channelPath}`;
        tempChannel = tempChannel.parent;
      }
      console.log(`${guild.name} => ${channel.id} | ${channelPath}`, channel.isTextBased(), channel.isThread());
      if (!channel.isTextBased()) {
        continue;
      }
      const dbChannel = await connection.manager.save(
        createInstance(DiscordChannel, {
          id: channel.id,
          displayName: channel.name,
          displayNamePath: channelPath,
          isThread: channel.isThread(),
        }),
      );

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
              message.flags;
              const emoteRegex = /<a?:([a-zA-Z0-9_~\-+]+):\d+>/g;
              let match;
              let emotes: string[] = [];
              while ((match = emoteRegex.exec(sanitizedMessageContent))) {
                emotes.push(match?.[1]);
              }
              if (emotes) {
                emotes = compact(emotes);
              }
              const unorderedWords = sanitizedMessageContent
                .replace(/<a?:[a-zA-Z0-9_~\-+]+:\d+>/g, '') // emotes
                .replace(/<@[!&]?\d+>/g, '') // mentiones
                .replace(/<#[!&]?\d+>/g, '') // channel-links
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
              const existingReactions = await connection.manager.find(DiscordReaction, { message: { id: message.id } });
              const reactionsOnMessage = Array.from(message.reactions.cache.entries());
              if (
                existingReactions.length === reactionsOnMessage.length &&
                reactionsOnMessage.every(
                  ([reaction, reactionInfo]) =>
                    existingReactions.find((r) => r.emote === (reactionInfo.emoji?.name ?? reaction))?.count === reactionInfo.count,
                )
              ) {
                // console.log('skipping reactions for msg', message.id);
              } else {
                await connection.manager.delete(DiscordReaction, { message: { id: message.id } });
                const reactions: DiscordReaction[] = [];
                for (const [reaction, reactionInfo] of reactionsOnMessage) {
                  // sync to prevent rate limit
                  reactions.push(await getReactionWithUsers(reactionInfo, reaction, dbMessage, guild));
                }

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
          }
          lastLength = count;
          console.log(JSON.stringify({ channelPath, lastLength, lastOldest, lastOldestDate }));
        } catch (e) {
          console.error(e);
          lastLength = 0;
        }
      }
    }
  }
  client.destroy();
});

client.login(process.env.DISCORD_BOT_TOKEN);
async function getReactionWithUsers(
  reactionInfo: MessageReaction,
  reaction: string,
  dbMessage: DiscordMessage,
  guild: Guild,
): Promise<DiscordReaction> {
  const users: User[] = [];
  let hasMore = true;
  let lastUser: string | undefined;
  while (hasMore) {
    const newUsers = await (await reactionInfo.users.fetch({ limit: 100, after: lastUser })).map((u) => u);
    // prevent rate limiting.. i think discord.js is kinda broken here.
    await delayAsync(20);
    hasMore = newUsers.length === 100;
    users.push(...newUsers);
    lastUser = newUsers.pop()?.id;
  }
  return createInstance(DiscordReaction, {
    count: reactionInfo.count,
    emote: reactionInfo.emoji?.name ?? reaction,
    message: dbMessage,
    users: users.map((user) => {
      return createInstance(DiscordUser, {
        id: user.id,
        displayName: guild.members.cache.get(user.id)?.nickname ?? user.username,
        username: user.tag,
      });
    }),
  });
}
