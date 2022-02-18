require('dotenv').config();
import { createHash } from 'crypto';
import { Client, GuildChannel, Intents, TextChannel } from 'discord.js';
import { appendFileSync } from 'fs';
import { compact, head, orderBy, uniq } from 'lodash';
import moment from 'moment';

const logfile = './history.jsonlist';

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

client.on('ready', async () => {
  console.log(`Logged in as ${client?.user?.tag}!`);
  const startOfDay = moment().startOf('day');
  const minDateFullRange = moment(startOfDay).subtract(2, 'weeks');
  const minDataCurrentRange = moment(startOfDay).subtract(1, 'day');

  const secondsFullRange = minDataCurrentRange.unix() - minDateFullRange.unix();
  const secondsCurrentRange = moment(startOfDay).unix() - minDataCurrentRange.unix();
  const currentRangesInFullRange = secondsFullRange / secondsCurrentRange;

  for (const [, guild] of client.guilds.cache) {
    console.log(`${guild.name} | ${guild.id}`);

    const wordMapFullRange = new Map<string, number>();
    const emoteMapFullRange = new Map<string, number>();
    const reactionMapFullRange = new Map<string, number>();

    const wordMapCurrentRange = new Map<string, number>();
    const emoteMapCurrentRange = new Map<string, number>();
    const reactionMapCurrentRange = new Map<string, number>();
    const seenMessages = new Set<string>();

    const user = guild.client.user;
    let channelToSendTo: TextChannel | undefined;
    if (user) {
      const channelsWithPos = guild.channels.cache.map((channel) => ({
        channel,
        parentPos: (!channel.parent?.parent && channel.parent?.position) || 99999999,
        position: (channel as GuildChannel).position,
        hasWritePermission: channel.permissionsFor(user)?.has('SEND_MESSAGES') ?? false,
        rawPosition: (channel as GuildChannel).rawPosition,
        isText: channel.isText(),
        isThread: channel.isThread(),
      }));

      const orderedChannels = orderBy(
        channelsWithPos.filter((c) => c.isText && c.hasWritePermission && !c.isThread),
        ['rawPosition'],
      );
      // isThread is false!, isText is true
      channelToSendTo = orderedChannels[0]?.channel as TextChannel;

      console.log(channelToSendTo);
    }
    if (!channelToSendTo) {
      console.log('no suitable channel found');
      continue;
    }
    const seenMessageHashes = new Set<string>();
    for (const [, channel] of await guild.channels.cache) {
      console.log(`${guild.name} => ${channel.id} | ${channel.name}`, channel.isText(), channel.isThread());

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
              const messageHash = createHash('sha256').update(`${moment(message.createdAt).format('YYYY-MM-DD')}-${message.author.id}-${message.content.toLowerCase().trim().replace(/\ \ /g, ' ')}`).digest('base64');
              if (seenMessageHashes.has(messageHash)) {
                console.log('duplicate hash', message.content, messageHash);
                continue;
              }
              seenMessageHashes.add(messageHash);
              if (moment(message.createdAt).isAfter(minDateFullRange)) {
                count++;
                lastOldest = message.id;
                lastOldestDate = message.createdAt;
                const reactions = Array.from(message.reactions.cache.entries()).map(([reaction, reactionInfo]) => ({
                  key: reactionInfo.emoji?.id ? `<:${reactionInfo.emoji.name}:${reactionInfo.emoji.id}>` : reaction,

                  count: reactionInfo.count,
                }));

                const sanitizedMessageContent = message.content.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
                // add to map depending on date range
                if (moment(message.createdAt).isBefore(startOfDay)) {
                  if (moment(message.createdAt).isAfter(minDataCurrentRange)) {
                    analyze(sanitizedMessageContent, reactions, wordMapCurrentRange, emoteMapCurrentRange, reactionMapCurrentRange);
                  } else {
                    analyze(sanitizedMessageContent, reactions, wordMapFullRange, emoteMapFullRange, reactionMapFullRange);
                  }
                }
              }
            }
            lastLength = count;
            console.log(JSON.stringify({ lastLength, lastOldest, lastOldestDate }));
          } catch (e) {
            lastLength = 0;
          }
        }
      }
    }
    const emoteFactors = calculateFactorsForUsageMaps(emoteMapCurrentRange, emoteMapFullRange, currentRangesInFullRange);
    const wordFactors = calculateFactorsForUsageMaps(wordMapCurrentRange, wordMapFullRange, currentRangesInFullRange);
    const reactionsFactors = calculateFactorsForUsageMaps(reactionMapCurrentRange, reactionMapFullRange, currentRangesInFullRange);

    const topEmoteNewcomer = head(orderBy(emoteFactors, 'increaseFactorAverage', 'desc'));
    const topWordNewcomer = head(orderBy(wordFactors, 'increaseFactorAverage', 'desc'));
    const topReactionNewcomer = head(orderBy(reactionsFactors, 'increaseFactorAverage', 'desc'));

    const topEmote = head(orderBy(emoteFactors, 'inCurrentRange', 'desc'));
    const topWord = head(orderBy(wordFactors, 'inCurrentRange', 'desc'));
    const topReaction = head(orderBy(reactionsFactors, 'inCurrentRange', 'desc'));

    const message = `Quatsch des Tages für ${moment(startOfDay).subtract(1, 'day').format('DD.MM.YYYY')}

- Wort des Tages: ${
      (topWordNewcomer?.increaseFactorAverage ?? 0) > 1 ? `${topWordNewcomer?.text} (${topWordNewcomer?.inCurrentRange}x)` : '*keines*'
    }
- Emote des Tages: ${(topEmote?.inCurrentRange ?? 0) > 1 ? `${topEmote?.text} (${topEmote?.inCurrentRange}x)` : '*keines*'}
- Emote-Newcomer des Tages: ${
      (topEmoteNewcomer?.increaseFactorAverage ?? 0) > 1 ? `${topEmoteNewcomer?.text} (${topEmoteNewcomer?.inCurrentRange}x)` : '*keines*'
    }
- Reaction des Tages: ${(topReaction?.inCurrentRange ?? 0) > 1 ? `${topReaction?.text} (${topReaction?.inCurrentRange}x)` : '*keines*'}
- Reaction-Newcomer des Tages: ${
      (topReactionNewcomer?.increaseFactorAverage ?? 0) > 1
        ? `${topReactionNewcomer?.text} (${topReactionNewcomer?.inCurrentRange}x)`
        : '*keines*'
    }

<:peepoQuatsch:875141585224994837>`;
    console.log(message);

    await channelToSendTo.send(message);
    appendFileSync(
      logfile,
      JSON.stringify({
        date: startOfDay.toISOString(),
        guildId: guild.id,
        guildName: guild.name,
        topEmoteNewcomers: orderBy(emoteFactors, 'increaseFactorAverage', 'desc').slice(0, 5),
        topWordNewcomer: orderBy(wordFactors, 'increaseFactorAverage', 'desc').slice(0, 5),
        topReactionNewcomer: orderBy(reactionsFactors, 'increaseFactorAverage', 'desc').slice(0, 5),
        topEmote: orderBy(emoteFactors, 'inCurrentRange', 'desc').slice(0, 5),
        topWord: orderBy(wordFactors, 'inCurrentRange', 'desc').slice(0, 5),
        topReaction: orderBy(reactionsFactors, 'inCurrentRange', 'desc').slice(0, 5),
      }) + '\n',
    );
  }
  client.destroy();
});

function calculateFactorsForUsageMaps(
  mapCurrentRange: Map<string, number>,
  mapFullRange: Map<string, number>,
  currentRangesInFullRange: number,
  minCurrentOccurance: number = 2,
) {
  return Array.from(mapCurrentRange.entries())
    .filter(([, inCurrentRange]) => inCurrentRange >= minCurrentOccurance)
    .map(([key, inCurrentRange]) => {
      const occurancesInFullRange = mapFullRange.get(key);
      const averageOccurancesPerCurrentRangeTime = (occurancesInFullRange || 1) / currentRangesInFullRange;
      return {
        text: key,
        inCurrentRange: inCurrentRange,
        inFullRange: occurancesInFullRange || 0,
        increaseFactorAverage: inCurrentRange / averageOccurancesPerCurrentRangeTime,
      };
    });
}

function analyze(
  message: string,
  reactions: {
    key: string;
    count: number;
  }[],
  wordMap: Map<string, number>,
  emoteMap: Map<string, number>,
  reactionMap: Map<string, number>,
) {
  const emoteRegex = /(<a?:[a-zA-Z0-9_~\-+]+:\d+>)/g;
  let match;
  let emotes: string[] = [];
  while ((match = emoteRegex.exec(message))) {
    emotes.push(match?.[1]);
  }
  if (emotes) {
    emotes = uniq(compact(emotes));
  }
  const words = message
    .replace(/<a?:[a-zA-Z0-9_~\-+]+:\d+>/g, '') // emotes
    .replace(/<@[!&]?\d+>/g, '') // mentiones
    .replace(/<#[!&]?\d+>/g, '') // channel-links
    .split(/[^0-9a-zA-ZäöüÄÖÜß]/)
    .filter((s) => s.length > 1);

  for (const word of uniq(words.map((w) => w.toLowerCase()))) {
    wordMap.set(word, (wordMap.get(word) ?? 0) + 1);
  }

  for (const emote of uniq(emotes)) {
    emoteMap.set(emote, (emoteMap.get(emote) ?? 0) + 1);
  }

  for (const reaction of reactions) {
    reactionMap.set(reaction.key, (reactionMap.get(reaction.key) ?? 0) + reaction.count);
  }
}
client.login(process.env.DISCORD_BOT_TOKEN);
