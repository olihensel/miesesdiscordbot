require('dotenv').config();
import axios from 'axios';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { AttachmentBuilder, Client, GatewayIntentBits, GuildChannel, Message, MessageType, TextChannel } from 'discord.js';
import { appendFileSync, readFileSync, writeFileSync } from 'fs';
import { compact, head, orderBy, pick, shuffle, uniq } from 'lodash';
import moment from 'moment';
import replaceEmoji from 'replace-emoji';
import { render } from './render';

const logfile = './history.jsonlist';
const blockChannels = [
  '754680666645594112', // suuncord streams
];
const userPlaceholder = 'Userplatzhalter';
const channelPlaceholder = 'Channelplatzhalter';
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', async () => {
  console.log(`Logged in as ${client?.user?.tag}!`);
  const startOfDay = moment().startOf('day');
  const minDateFullRange = moment(startOfDay).subtract(2, 'weeks');
  const minDataCurrentRange = moment(startOfDay).subtract(1, 'day');
  console.log({
    startOfDay: startOfDay.format(),
    minDateFullRange: minDateFullRange.format(),
    minDataCurrentRange: minDataCurrentRange.format(),
  });

  const secondsFullRange = minDataCurrentRange.unix() - minDateFullRange.unix();
  const secondsCurrentRange = moment(startOfDay).unix() - minDataCurrentRange.unix();
  const currentRangesInFullRange = secondsFullRange / secondsCurrentRange;

  for (const [, guild] of client.guilds.cache) {
    try {
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
          hasWritePermission: channel.permissionsFor(user)?.has('SendMessages') ?? false,
          rawPosition: (channel as GuildChannel).rawPosition,
          isText: channel.isTextBased(),
          isThread: channel.isThread(),
        }));

        const orderedChannels = orderBy(
          channelsWithPos.filter((c) => c.isText && c.hasWritePermission && !c.isThread),
          ['rawPosition'],
        );
        // isThread is false!, isText is true
        const allgeschwein = channelsWithPos.find((c) => c.channel?.id === '717034183465107459')?.channel as TextChannel;
        channelToSendTo = allgeschwein || (orderedChannels[0]?.channel as TextChannel);
        console.log('channelToSendTo', channelToSendTo.name);
      }

      if (!channelToSendTo) {
        console.log('no suitable channel found');
        continue;
      }
      const seenMessageHashes = new Set<string>();
      let wholeDayMessage = '';
      let messageWithMostReactions: { msg: Message<true>; count: number } | undefined;

      for (const [, channel] of await guild.channels.cache) {
        console.log(`${guild.name} => ${channel.id} | ${channel.name}`, channel.isTextBased(), channel.isThread());

        if (channel.isTextBased() && !blockChannels.includes(channel.id)) {
          const limit = 100;
          let lastLength = limit;
          let lastOldest: string | undefined;
          let lastOldestDate: Date | undefined;
          let channelMessage = '';
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
                let analyzableMsg = message.cleanContent.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
                // let analyzableMsg = message.content.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
                // analyzableMsg = replaceMentionsAndChannels(analyzableMsg, userPlaceholder, channelPlaceholder);
                analyzableMsg = replaceEmotes(analyzableMsg);
                analyzableMsg = analyzableMsg.replaceAll('\n', '. ');
                analyzableMsg = replaceEmoji(analyzableMsg, '') as string;
                const sentiment = await evaluateSentiment(analyzableMsg);

                const reactions = Array.from(message.reactions.cache.entries()).map(([reaction, reactionInfo]) => ({
                  key: reactionInfo.emoji?.id ? `<:${reactionInfo.emoji.name}:${reactionInfo.emoji.id}>` : reaction,
                  count: reactionInfo.count,
                }));

                if (
                  message.author.id !== guild.client.user?.id &&
                  moment(message.createdAt).isAfter(minDataCurrentRange) &&
                  moment(message.createdAt).isBefore(startOfDay) &&
                  analyzableMsg.length > 0
                ) {
                  // allow minimally negative messages
                  if (sentiment.average > -0.02) {
                    // add to complete chatlog for wordcloud
                    channelMessage = analyzableMsg + '\n' + channelMessage;

                    // update message with most reactions
                    const reactionCount = reactions.reduce((acc, cur) => acc + cur.count, 0);
                    if (!messageWithMostReactions || reactionCount > messageWithMostReactions.count) {
                      messageWithMostReactions = { msg: message, count: reactionCount };
                    }
                  } else {
                    console.log('skipping negative message', analyzableMsg, pick(sentiment, 'score', 'numWords', 'numHits', 'average'));
                  }
                }
                if (moment(message.createdAt).isAfter(minDateFullRange)) {
                  count++;
                  lastOldest = message.id;
                  lastOldestDate = message.createdAt;
                  let isDuplicateMessage = false;
                  const messageHash = createHash('sha256')
                    .update(
                      `${moment(message.createdAt).format('YYYY-MM-DD')}-${message.author.id}-${message.content
                        .toLowerCase()
                        .trim()
                        .replace(/\ \ /g, ' ')}`,
                    )
                    .digest('base64');
                  if (seenMessageHashes.has(messageHash)) {
                    console.log('duplicate hash, ignoring words', message.content, messageHash);
                    isDuplicateMessage = true;
                  }
                  if (!isDuplicateMessage) {
                    seenMessageHashes.add(messageHash);
                  }

                  const sanitizedMessageContent = message.content.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
                  // add to map depending on date range
                  if (moment(message.createdAt).isBefore(startOfDay)) {
                    if (moment(message.createdAt).isAfter(minDataCurrentRange)) {
                      analyze(
                        sanitizedMessageContent,
                        reactions,
                        wordMapCurrentRange,
                        emoteMapCurrentRange,
                        reactionMapCurrentRange,
                        isDuplicateMessage,
                      );
                    } else {
                      analyze(
                        sanitizedMessageContent,
                        reactions,
                        wordMapFullRange,
                        emoteMapFullRange,
                        reactionMapFullRange,
                        isDuplicateMessage,
                      );
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

          if (channelMessage.length > 0) {
            // wholeDayMessage += `Channel: ${channel.name}\n`;
            wholeDayMessage += channelMessage;
            wholeDayMessage += '\n\n';
          }
        }
      }

      writeFileSync(`data/daily/${guild.name}_${moment(startOfDay).subtract(1, 'day').format('YYYY-MM-DD')}_chatlog.json`, wholeDayMessage);
      type WordResp = {
        text: string;
        lemma: string;
        norm: string;
        lower: string;
        sentiment: string;
        ent_type: string;
        pos: string;
        tag: string;
        dep: string;
        head: string;
        is_alpha: string;
        is_digit: string;
        is_stop: string;
        is_punct: string;
        is_url: string;
        is_num: string;
        is_email: string;
        language: string;
      };

      const spacyResp = await axios.post<
        {
          sentence: string;
          words: WordResp[];
        }[]
      >('http://localhost:46464/all_pos', { model: 'de_core_news_sm', text: wholeDayMessage });
      const additionalStopWords = ['ne', 'ja', userPlaceholder, channelPlaceholder].map((w) => w.toLowerCase());
      const allWords = spacyResp.data.flatMap((s) => s.words);

      writeFileSync(
        `data/daily/${guild.name}_${moment(startOfDay).subtract(1, 'day').format('YYYY-MM-DD')}_allwords.json`,
        JSON.stringify(allWords, null, 2),
      );
      const allNouns = allWords
        .filter((w) => ['NE', 'NN', 'NNE', 'ITJ', 'ADJA', 'ADJD'].includes(w.tag))
        .reduce(
          // map to text of first occurence of lemma
          (acc, next) => {
            if (acc.lemmas.has(next.lemma)) {
              acc.nouns.push(acc.lemmas.get(next.lemma)?.text || next.text);
              return acc;
            }
            acc.lemmas.set(next.lemma, next);
            acc.nouns.push(next.text);
            return acc;
          },
          { nouns: [] as string[], lemmas: new Map<string, WordResp>() },
        )
        .nouns.filter((n) => n.length > 1 && !additionalStopWords.includes(n.toLowerCase()));

      //

      writeFileSync(
        `data/daily/${guild.name}_${moment(startOfDay).subtract(1, 'day').format('YYYY-MM-DD')}_allnouns.json`,
        JSON.stringify(allNouns, null, 2),
      );
      const wordCloudBuff = await createWordCloud(allNouns);
      const emoteFactors = calculateFactorsForUsageMaps(emoteMapCurrentRange, emoteMapFullRange, currentRangesInFullRange);
      const wordFactors = calculateFactorsForUsageMaps(wordMapCurrentRange, wordMapFullRange, currentRangesInFullRange);
      const reactionsFactors = calculateFactorsForUsageMaps(reactionMapCurrentRange, reactionMapFullRange, currentRangesInFullRange);

      const topEmoteNewcomer = head(orderBy(emoteFactors, 'increaseFactorAverage', 'desc'));
      const topWordNewcomer = head(orderBy(wordFactors, 'increaseFactorAverage', 'desc'));
      const topReactionNewcomer = head(orderBy(reactionsFactors, 'increaseFactorAverage', 'desc'));

      const topEmote = head(orderBy(emoteFactors, 'inCurrentRange', 'desc'));
      const topWord = head(orderBy(wordFactors, 'inCurrentRange', 'desc'));
      const topReaction = head(orderBy(reactionsFactors, 'inCurrentRange', 'desc'));

      const renderedQuatschOfTheDayBuffer = await render(wordCloudBuff, {
        day: moment(startOfDay).subtract(1, 'day').format('DD.MM.YYYY'),
        awards: [
          `Wort des Tages: ${
            (topWordNewcomer?.increaseFactorAverage ?? 0) > 1
              ? `${topWordNewcomer?.text} (${topWordNewcomer?.inCurrentRange}x)`
              : '*keines*'
          }`,
          `Emote des Tages: ${(topEmote?.inCurrentRange ?? 0) > 1 ? `${topEmote?.text} (${topEmote?.inCurrentRange}x)` : '*keines*'}`,
          `Emote-Newcomer des Tages: ${
            (topEmoteNewcomer?.increaseFactorAverage ?? 0) > 1
              ? `${topEmoteNewcomer?.text} (${topEmoteNewcomer?.inCurrentRange}x)`
              : '*keines*'
          }`,
          `Reaction des Tages: ${
            (topReaction?.inCurrentRange ?? 0) > 1 ? `${topReaction?.text} (${topReaction?.inCurrentRange}x)` : '*keines*'
          }`,
          `Reaction-Newcomer des Tages: ${
            (topReactionNewcomer?.increaseFactorAverage ?? 0) > 1
              ? `${topReactionNewcomer?.text} (${topReactionNewcomer?.inCurrentRange}x)`
              : '*keines*'
          }`,
          ...(messageWithMostReactions
            ? [
                `Nachricht des Tages mit den meisten Reaktionen: ${
                  messageWithMostReactions.msg.member?.nickname ?? messageWithMostReactions.msg.author.username
                } - <i>"${
                  messageWithMostReactions.msg?.type === MessageType.UserJoin
                    ? 'ist dem Server beigetreten.'
                    : messageWithMostReactions.msg.cleanContent || '-- Kein Text --'
                }"</i> in #${messageWithMostReactions.msg.channel.name} (${messageWithMostReactions.count}x) <br />${
                  [
                    ...(messageWithMostReactions.msg?.attachments
                      ?.filter((a) => a.contentType?.startsWith('image') ?? false)
                      ?.map((a) => a.url) ?? []),
                    ...(messageWithMostReactions.msg?.embeds?.map((e) => e.image?.url ?? e.thumbnail?.url) ?? []),
                  ]
                    ?.map((url) => `<img src="${url}" style="max-height: 100px; max-width: 100px; margin: 3px;" />`)
                    ?.join('') ?? ''
                }`,
              ]
            : []),
        ],
      });

      writeFileSync(
        `data/daily/${guild.name}_${moment(startOfDay).subtract(1, 'day').format('YYYY-MM-DD')}_message.png`,
        renderedQuatschOfTheDayBuffer,
      );

      // send renderedQuatschOfTheDayBuffer to channelToSendTo

      const builder = new AttachmentBuilder(renderedQuatschOfTheDayBuffer, {
        name: `Quatsch-des-Tages_${moment(startOfDay).subtract(1, 'day').format('YYYY-MM-DD')}.png`,
      });
      const sentMessage = await channelToSendTo.send({ files: [builder] });
      console.log('sentMessage', sentMessage);

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
    } catch (e) {
      console.error('error handing guild', guild.id, guild.name, e);
    }
  }
  client.destroy();
});

function replaceMentionsAndChannels(message: string, userPlaceholder: string, channelPlaceholder: string): string {
  return message.replaceAll(/<(@[!&]?|#)(\d{17,19})>/g, (match, type, id) => {
    switch (type) {
      case '@':
      case '@!':
      case '@&': {
        return userPlaceholder;
      }
      case '#': {
        return channelPlaceholder;
      }
      default: {
        return match;
      }
    }
  });
}

function replaceEmotes(message: string): string {
  const emoteRegex = /<a?:([a-zA-Z0-9_~\-+]+):(\d+)>/g;
  let match;
  let emotes: { tag: string; name: string; id: string }[] = [];
  while ((match = emoteRegex.exec(message))) {
    emotes.push({ tag: match[0], name: match[1], id: match[2] });
  }
  if (emotes) {
    emotes = compact(emotes);
  }
  for (const emote of emotes) {
    message = message.replaceAll(
      emote.tag,
      '',
      //emote.name,
      // `<img src="https://cdn.discordapp.com/emojis/${emote.id}.png" style="width: 1em; height: 1em;" />`,
    );
  }
  return message;
}

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
  isDuplicateMessage: boolean,
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

  if (!isDuplicateMessage) {
    for (const word of uniq(words.map((w) => w.toLowerCase()))) {
      wordMap.set(word, (wordMap.get(word) ?? 0) + 1);
    }
  }

  for (const emote of uniq(emotes)) {
    emoteMap.set(emote, (emoteMap.get(emote) ?? 0) + 1);
  }

  for (const reaction of reactions) {
    reactionMap.set(reaction.key, (reactionMap.get(reaction.key) ?? 0) + reaction.count);
  }
}

// NOTE: mustnot be called in parallel!
async function createWordCloud(words: string[]) {
  console.log('creating wordcloud with', words.length, 'words');
  await writeFileSync('data/words.txt', shuffle(words).join(' '));
  await execSync(
    '/usr/local/bin/wordcloud_cli --text data/words.txt --imagefile data/wordcloud.png --width 540 --height 540 --margin 5 --scale 2 --max_words 50 --relative_scaling 0.4 --min_font_size 8 --fontfile ./unicode.impact.ttf --mode RGBA --colormap tab20 --background "#00000000" --regexp "[\\w@\\#][\\w\']+"',
  );
  // console.log({ stdout, stderr });
  return await readFileSync('data/wordcloud.png');
}
client.login(process.env.DISCORD_BOT_TOKEN);

// no typescript types :Sadge:
const { Container } = require('@nlpjs/core');
const { SentimentAnalyzer } = require('@nlpjs/sentiment');
const { LangDe } = require('@nlpjs/lang-de');

async function evaluateSentiment(cleanMsg: string): Promise<{
  score: number;
  numWords: number;
  numHits: number;
  average: number;
  type: string;
  locale: string;
  vote: 'positive' | 'neutral' | 'negative';
}> {
  const container = new Container();
  container.use(LangDe);
  const sentiment = new SentimentAnalyzer({ container });
  const result = await sentiment.process({ locale: 'de', text: cleanMsg });
  // console.log(result.sentiment);
  return result.sentiment;
}
