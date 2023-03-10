require('dotenv').config();
import axios from 'axios';
import { execSync } from 'child_process';
import { Channel, ChannelType, Client, GatewayIntentBits, Message } from 'discord.js';
import { readFileSync, writeFileSync } from 'fs';
import { compact, pick, shuffle } from 'lodash';
import moment from 'moment';
import replaceEmoji from 'replace-emoji';

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
  const endOfLastMonth = moment().subtract(1, 'month').endOf('month');
  const startOfLastMonth = moment().subtract(1, 'month').startOf('month');
  console.log({
    endOfLastMonth: endOfLastMonth.format(),
    minDataCurrentRange: startOfLastMonth.format(),
  });
  const yearAndMonthString = endOfLastMonth.format('YYYY-MM');
  for (const [, guild] of client.guilds.cache) {
    try {
      console.log(`${guild.name} | ${guild.id}`);

      const seenMessages = new Set<string>();

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
                // let analyzableMsg = message.cleanContent.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
                let analyzableMsg = message.content.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
                analyzableMsg = replaceMentionsAndChannels(analyzableMsg, channel);
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
                  moment(message.createdAt).isAfter(startOfLastMonth) &&
                  moment(message.createdAt).isBefore(endOfLastMonth) &&
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
                if (moment(message.createdAt).isAfter(startOfLastMonth)) {
                  count++;
                  lastOldest = message.id;
                  lastOldestDate = message.createdAt;
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

      writeFileSync(`data/monthly/${guild.name}_${yearAndMonthString}_chatlog.json`, wholeDayMessage);
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

      writeFileSync(`data/monthly/${guild.name}_${yearAndMonthString}_allwords.json`, JSON.stringify(allWords, null, 2));
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

      writeFileSync(`data/monthly/${guild.name}_${yearAndMonthString}_allnouns.json`, JSON.stringify(allNouns, null, 2));
      for (let i = 0; i < 10; i++) {
        console.log('creating wordcloud', i);
        const wordCloudBuff = await createWordCloud(allNouns);
        writeFileSync(`data/monthly/${guild.name}_${yearAndMonthString}_wordcloud_${i.toFixed(0).padStart(2, '0')}.png`, wordCloudBuff);
      }
    } catch (e) {
      console.error('error handing guild', guild.id, guild.name, e);
    }
  }
  client.destroy();
});

function replaceMentionsAndChannels(message: string, channel: Channel): string {
  return message.replaceAll(/<(@[!&]?|#)(\d{17,19})>/g, (match, type, id) => {
    switch (type) {
      case '@':
      case '@!': {
        if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) return match;
        const member = channel.guild?.members.cache.get(id);
        if (member) {
          return `@${member.displayName.replaceAll(/\s/g, '_')}`;
        }

        const user = channel.client.users.cache.get(id);
        return user ? `@${user.username.replaceAll(/\s/g, '_')}` : match;
      }
      case '@&': {
        if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) return match;
        const role = channel.guild.roles.cache.get(id);
        return role ? `@${role.name}` : match;
      }
      case '#': {
        const mentionedChannel = channel.client.channels.cache.get(id);
        return mentionedChannel && mentionedChannel.type !== ChannelType.DM ? `#${mentionedChannel.name}` : match;
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

// NOTE: mustnot be called in parallel!
async function createWordCloud(words: string[]) {
  // remove words that are too long. if they are shorter than 8 chars, none should be removed. from 9 on the probability of a word being removed increases linearly up to 30 chars, where it is 100%.
  words = words.filter((w) => w.length < 8 || Math.random() < 1 - (w.length - 8) / 22);

  console.log('creating wordcloud with', words.length, 'words');
  await writeFileSync('data/words.txt', shuffle(words).join(' '));
  await execSync(
    '/usr/local/bin/wordcloud_cli --text data/words.txt --imagefile data/wordcloud.png --width 1080 --height 1080 --margin 5 --scale 2 --max_words 500 --relative_scaling 0.4 --min_font_size 5 --fontfile ./unicode.impact.ttf --mode RGBA --colormap tab20 --background "#00000000" --regexp "[\\w@\\#][\\w\']+"',
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
