require('dotenv').config();
import { Client, GuildChannel, Intents, TextChannel } from 'discord.js';
import { head, orderBy, uniq } from 'lodash';
import moment from 'moment';

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

    const message = `Quatsch des Tages für ${moment(startOfDay).subtract(1, 'day').format('DD.MM.YYYY')}\n\n- Wort des Tages: ${
      (topWordNewcomer?.increaseFactorAverage ?? 0) > 1
        ? `${topWordNewcomer?.text} (+${(100 * (topWordNewcomer?.increaseFactorAverage ?? 0) - 100).toFixed(0)}%, ${
            topWordNewcomer?.inCurrentRange
          }x)`
        : '*keines*'
    }\n- Emote des Tages: ${
      (topEmote?.inCurrentRange ?? 0) > 1 ? `${topEmote?.text} (${topEmote?.inCurrentRange}x)` : '*keines*'
    }\n- Emote-Newcomer des Tages: ${
      (topEmoteNewcomer?.increaseFactorAverage ?? 0) > 1
        ? `${topEmoteNewcomer?.text} (+${(100 * (topEmoteNewcomer?.increaseFactorAverage ?? 0) - 100).toFixed(0)}%, ${
            topEmoteNewcomer?.inCurrentRange
          }x)`
        : '*keines*'
    }\n- Reaction des Tages: ${
      (topReaction?.inCurrentRange ?? 0) > 1 ? `${topReaction?.text} (${topReaction?.inCurrentRange}x)` : '*keines*'
    }\n- Reaction-Newcomer des Tages: ${
      (topReactionNewcomer?.increaseFactorAverage ?? 0) > 1
        ? `${topReactionNewcomer?.text} (+${(100 * (topReactionNewcomer?.increaseFactorAverage ?? 0) - 100).toFixed(0)}%, ${
            topReactionNewcomer?.inCurrentRange
          }x)`
        : '*keines*'
    }\n\n<:peepoQuatsch:875141585224994837>`;
    console.log(message);

    await channelToSendTo.send(message);
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
  const emotesRegexExecArr = /(<:[a-zA-Z0-9]+:\d+>)/g.exec(message);
  const words = message
    .replace(/<:[a-zA-Z0-9]+:\d+>/g, '')
    .replace(/<@[!&]\d+>/g, '')
    .split(/[^0-9a-zA-ZäöüÄÖÜß]/)
    .filter((s) => s.length > 1);
  let emotes: string[] = [];
  if (emotesRegexExecArr) {
    emotes = Array.from(emotesRegexExecArr);
  }

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
