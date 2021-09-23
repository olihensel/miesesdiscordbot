require('dotenv').config();
import { Client, Intents } from 'discord.js';
import * as faker from 'faker';
import { head, orderBy, uniq } from 'lodash';
import moment from 'moment';

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

client.on('ready', async () => {
  console.log(`Logged in as ${client?.user?.tag}!`);

  const minDateFullRange = moment().subtract(1, 'month');
  const minDataCurrentRange = moment().subtract(1, 'day');

  const secondsFullRange = minDataCurrentRange.unix() - minDateFullRange.unix();
  const secondsCurrentRange = moment().unix() - minDataCurrentRange.unix();
  const currentRangesInFullRange = secondsFullRange / secondsCurrentRange;

  for (const [, guild] of client.guilds.cache) {
    console.log(`${guild.name} | ${guild.id}`);

    const wordMapFullRange = new Map<string, number>();
    const emoteMapFullRange = new Map<string, number>();
    const reactionMapFullRange = new Map<string, number>();

    const wordMapCurrentRange = new Map<string, number>();
    const emoteMapCurrentRange = new Map<string, number>();
    const reactionMapCurrentRange = new Map<string, number>();

    for (const [, channel] of await guild.channels.cache) {
      console.log(`${guild.name} => ${channel.id} | ${channel.name}`, channel.isText(), channel.isThread());

      if (channel.isText()) {
        const limit = 50;
        let lastLength = limit;
        let lastOldest: string | undefined;
        while (lastLength >= limit) {
          try {
            const messages = await channel.messages.fetch({ limit, ...(lastOldest ? { before: lastOldest } : {}) });
            let count = 0;
            for (const [, message] of messages) {
              if (moment(message.createdAt).isAfter(minDateFullRange)) {
                count++;
                lastOldest = message.id;
                const reactions = Array.from(message.reactions.cache.entries()).map(([reaction, reactionInfo]) => ({
                  key: reaction,
                  count: reactionInfo.count,
                }));

                const sanitizedMessageContent = message.content.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
                // add to map depending on date range
                if (moment(message.createdAt).isAfter(minDataCurrentRange)) {
                  analyze(sanitizedMessageContent, reactions, wordMapCurrentRange, emoteMapCurrentRange, reactionMapCurrentRange);
                } else {
                  analyze(sanitizedMessageContent, reactions, wordMapFullRange, emoteMapFullRange, reactionMapFullRange);
                }
              }
            }
            lastLength = count;
            console.log({ lastLength, lastOldest });
          } catch (e) {
            lastLength = 0;
          }
        }
      }
    }
    const emoteFactors = calculateFactorsForUsageMaps(emoteMapCurrentRange, emoteMapFullRange, currentRangesInFullRange);
    const wordFactors = calculateFactorsForUsageMaps(wordMapCurrentRange, wordMapFullRange, currentRangesInFullRange);
    const reactionsFactors = calculateFactorsForUsageMaps(reactionMapCurrentRange, reactionMapFullRange, currentRangesInFullRange);

    const orderedEmotes = orderBy(emoteFactors, 'increaseFactorAverage', 'desc');
    const topEmote = head(orderedEmotes);
    const orderedWords = orderBy(wordFactors, 'increaseFactorAverage', 'desc');
    const topWord = head(orderedWords);
    const orderedReactions = orderBy(reactionsFactors, 'increaseFactorAverage', 'desc');
    const topReaction = head(orderedReactions);
    console.log(orderedEmotes);
    console.log(orderedWords);
    console.log(orderedReactions);

    const message = `Quatsch des Tages für ${moment().subtract(1, 'day').format('DD.MM.YYYY')}\n\n- Wort des Tages: ${
      (topWord?.increaseFactorAverage ?? 0) > 1
        ? `${topWord?.text} (+${(100 * (topWord?.increaseFactorAverage ?? 0) - 100).toFixed(0)}%, insg. ${topWord?.inCurrentRange} mal)`
        : '*keines*'
    }\n- Emote des Tages: ${
      (topEmote?.increaseFactorAverage ?? 0) > 1
        ? `${topEmote?.text} (+${(100 * (topEmote?.increaseFactorAverage ?? 0) - 100).toFixed(0)}%, insg. ${topEmote?.inCurrentRange} mal)`
        : '*keines*'
    }\n- Reaction des Tages: ${
      (topReaction?.increaseFactorAverage ?? 0) > 1
        ? `${topReaction?.text} (+${(100 * (topReaction?.increaseFactorAverage ?? 0) - 100).toFixed(0)}%, insg. ${
            topReaction?.inCurrentRange
          } mal)`
        : '*keines*'
    }\n\n<:peepoQuatsch:875141585224994837>`;
    console.log(message);

    const randomChannel = faker.random.arrayElement(Array.from(client.channels.cache.values()).filter((i) => i.isText()));
    if (randomChannel?.isText()) {
      await randomChannel.send(message);
    }
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

  for (const word of uniq(words.map((w) => w.toUpperCase()))) {
    wordMap.set(word, (wordMap.get(word) ?? 0) + 1);
  }
  for (const emote of uniq(emotes)) {
    emoteMap.set(emote, (emoteMap.get(emote) ?? 0) + 1);
  }

  for (const reaction of reactions) {
    const reactionKey = /^\d{10,}$/.test(reaction.key) ? `<:id:${reaction.key}>` : reaction.key;
    reactionMap.set(reactionKey, (reactionMap.get(reactionKey) ?? 0) + reaction.count);
  }
}
client.login(process.env.DISCORD_BOT_TOKEN);
