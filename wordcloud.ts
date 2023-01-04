require('dotenv').config();
import Axios from 'axios';
import { execSync } from 'child_process';
import { Client, GatewayIntentBits, GuildChannel, TextChannel } from 'discord.js';
import { readFileSync, writeFileSync } from 'fs';
import { compact, orderBy, shuffle, times, uniq } from 'lodash';
import moment from 'moment';
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
  const minDataCurrentRange = moment(startOfDay).subtract(1, 'day');
  console.log({
    startOfDay: startOfDay.format(),
    minDataCurrentRange: minDataCurrentRange.format(),
  });

  for (const [, guild] of client.guilds.cache) {
    console.log(`${guild.name} | ${guild.id}`);

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
      console.log(channelToSendTo);
    }

    if (!channelToSendTo) {
      console.log('no suitable channel found');
      continue;
    }

    let wholeDayMessage = '';
    for (const [, channel] of await guild.channels.cache) {
      console.log(`${guild.name} => ${channel.id} | ${channel.name}`, channel.isTextBased(), channel.isThread());

      if (channel.isTextBased()) {
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
              if (moment(message.createdAt).isAfter(minDataCurrentRange)) {
                count++;
                lastOldest = message.id;
                lastOldestDate = message.createdAt;
                if (moment(message.createdAt).isBefore(startOfDay)) {
                  channelMessage += message.cleanContent.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '') + '\n';
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
    wholeDayMessage = replaceEmotes(wholeDayMessage);
    const spacyResp = await Axios.post<
      {
        sentence: string;
        dep_parse: {
          arcs: { dir: string; end: number; label: string; start: number; text: string }[];
          words: { tag: string; text: string }[];
        };
      }[]
    >('http://localhost:46464/sents_dep', { model: 'de_core_news_sm', text: wholeDayMessage });

    writeFileSync(
      `data/daily/${guild.name}_${moment().format('YYYY-MM-DD')}_spacey.jsonl`,
      spacyResp.data
        .flatMap((s) => s.dep_parse.words)
        .map((w) => JSON.stringify(w))
        .join('\n'),
    );

    console.log(
      spacyResp.data
        .flatMap((s) => s.dep_parse.words)
        .filter((w) => ['NE', 'NN'].includes(w.tag))
        .map((w) => w.text),
    );
    const additionalStopWords = ['ne', 'ja'];
    const allNouns = spacyResp.data
      .flatMap((s) => s.dep_parse.words)
      .filter((w) => ['NE', 'NN'].includes(w.tag))
      .map((w) => w.text)
      .filter((n) => n.length > 1 && !additionalStopWords.includes(n.toLowerCase()));
    writeFileSync(`data/daily/${guild.name}_${moment().format('YYYY-MM-DD')}_nouns.txt`, allNouns.join(' '));
    console.log(uniq(spacyResp.data.flatMap((s) => s.dep_parse.words.map((w) => w.tag))));

    const uniqNouns = allNouns.reduce<{ val: string; count: number }[]>((accum, val) => {
      const dupeIndex = accum.findIndex((arrayItem) => arrayItem.val === val);

      if (dupeIndex === -1) {
        // Not found, so initialize.
        accum.push({
          count: 1,
          val: val,
        });
      } else {
        // Found, so increment counter.
        accum[dupeIndex].count++;
      }
      return accum;
    }, []);

    const orderedNouns = orderBy(uniqNouns, ['count'], ['desc']);
    writeFileSync(
      `data/daily/${guild.name}_${moment().format('YYYY-MM-DD')}_top_25.txt`,
      orderedNouns
        .slice(0, 25)
        .map((n) =>
          times(n.count)
            .map(() => n.val)
            .join(' '),
        )
        .join('\n'),
    );

    const buff = await createWordCloud(allNouns);
    writeFileSync(`data/daily/${guild.name}_${moment().format('YYYY-MM-DD')}.png`, buff);

    writeFileSync(`data/daily/${guild.name}_${moment().format('YYYY-MM-DD')}.txt`, wholeDayMessage);
  }
  client.destroy();
});

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
client.login(process.env.DISCORD_BOT_TOKEN);

// NOTE: mustnot be called in parallel!
async function createWordCloud(words: string[]) {
  await writeFileSync('data/words.txt', shuffle(words).join(' '));
  await execSync(
    'wordcloud_cli --text data/words.txt --imagefile data/wordcloud.png --width 540 --height 540 --margin 5 --scale 2 --max_words 50 --include_numbers --relative_scaling 1 --min_font_size 8 --fontfile ./unicode.impact.ttf --mode RGBA --colormap tab20 --background "#00000000"',
  );
  // console.log({ stdout, stderr });
  return await readFileSync('data/wordcloud.png');
}
