require('dotenv').config();
import { Client, Intents, Message, NewsChannel, TextChannel, ThreadChannel } from 'discord.js';
import { writeFileSync } from 'fs';
import { compact, times } from 'lodash';
import moment from 'moment';
import { chromium } from 'playwright';
import 'reflect-metadata';
import { createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as ormConfig from '../ormconfig.json';
import { DiscordMessage } from './entity/discord-message';
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
  ],
});
const connectionPromise = createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });

const suuncordServerId = '717034183465107456';
const oli = '267745416186036225';

const rangeStartDate = moment('2021-01-01').startOf('day').toDate();
const rangeEndDate = moment('2021-12-31').endOf('day').toDate();

client.on('error', console.error);
let isReady = false;
client.on('ready', async () => {
  isReady = true;

  /*
  const testUsers = [oli];

  for (const user of testUsers) {
    console.log('generating user', user);
    await generateStats(user);
  }
  */

  console.log(`Logged in as ${client?.user?.tag}!`);
  // const channel = client.guilds.cache.get('703705066351362068')?.channels.cache.get('890737558894567554');
  client.on('messageCreate', async (msg) => {
    if (
      msg.content === '!recap' &&
      msg.channel.isText() &&
      msg.guildId === '703705066351362068' &&
      msg.channelId === '890737558894567554'
    ) {
      const buffer = await generateStats(msg.author.id);
      const member = msg.author?.username;

      // msg.reply(new MessageAttachment(buffer, `SUUNCORD-Recap_${member}.png`));
      await msg.reply({
        files: [{ attachment: buffer, name: `SUUNCORD-Recap-2021_${member}.png` }],
      });
      /*
      await msg.author
        ?.send(
          `Du hast Dir folgende Nachrichten mit peepoNotes markiert:\n${(await getSavedMessages(msg.author.id))
            .map(
              (m) =>
                ` - ${m.plain_text.replace(/\n/g, '')} (https://discordapp.com/channels/${suuncordServerId}/${m.channel_id}/${
                  m.message_id
                })`,
            )
            .join('\n')}`,
        )
        .catch(console.error);
      */
    }
  });
  // client.destroy();
});

client.login(process.env.DISCORD_BOT_TOKEN);

export async function getEmoteTag(emoteName: string) {
  if (!emoteName.match(/^[a-zA-Z0-9_~\-+]+$/)) {
    // directly return 🥒 :D
    return emoteName;
  }
  const connection = await connectionPromise;
  const discordMessageResult = await connection.query(
    // TODO: check param in array query
    `SELECT id FROM "discord_message" WHERE emotes && '{"${emoteName}"}' ORDER BY timestamp desc LIMIT 1`,
  );
  let messageId = discordMessageResult[0]?.id;
  if (!messageId) {
    const reactionResult = await connection.query(
      // FIXME: QueryFailedError: bind message supplies 1 parameters, but prepared statement "" requires 0
      `SELECT message_id FROM "discord_reaction" WHERE emote = '${emoteName}' ORDER BY message_id desc LIMIT 1`,
      // [emoteName],
    );
    messageId = reactionResult[0]?.message_id;
  }
  if (!messageId) {
    return emoteName;
  }
  const message = await connection.getRepository(DiscordMessage).findOne(messageId, { relations: ['channel'] });
  if (!message) {
    return emoteName;
  }
  const emoteRegex = new RegExp(`(<a?:${emoteName}:\\d+>)`, 'g');
  const match = emoteRegex.exec(message.plainText);
  if (match?.[1]) {
    return match[1];
  }

  const channel = client.guilds.cache.get(suuncordServerId)?.channels.cache.get(message?.channel?.id);
  if (!channel?.isText()) {
    return emoteName;
  }
  const dcMessage = await channel.messages.fetch(messageId);
  const reactionEmote = dcMessage?.reactions.cache.find((r) => r.emoji?.name === emoteName);
  if (reactionEmote) {
    return `<:${emoteName}:${reactionEmote.emoji.id}>`;
  }
}

export async function generateStats(userId: string) {
  if (!isReady) {
    throw new Error('Discord client is not ready yet');
  }
  const connection = await connectionPromise;
  const user = await client.users.fetch(userId);
  const guild = await client.guilds.fetch(suuncordServerId);
  const member = await guild.members.fetch(userId);
  const mostReactedMessages = await connection.query(
    //`SELECT * from discord_message_reaction_count where from_id = $3 AND timestamp between $1 and $2 AND plain_text != '' LIMIT 1`,
    `SELECT * 
    from discord_message_reaction_count 
    where from_id = $3 
    AND timestamp between $1 and $2 
    LIMIT 1`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const mostReactedMessage = mostReactedMessages?.[0];
  let dcMessage: Message<boolean> | undefined;
  if (mostReactedMessage) {
    const channel = guild.channels.cache.get(mostReactedMessage.channel_id);
    if (channel && channel.isText()) {
      dcMessage = await channel.messages.fetch(mostReactedMessage.id);
    }
  }
  dcMessage?.reference;

  const numberFormatter = new Intl.NumberFormat('de-DE');
  const messageCountResp: { count: string; word_count: string; message_length: string }[] = await connection.query(
    //`SELECT * from discord_message_reaction_count where from_id = $3 AND timestamp between $1 and $2 AND plain_text != '' LIMIT 1`,
    `SELECT count(id) as count, 
    sum(word_count) as word_count,
    sum(message_length) as message_length 
    from discord_message 
    where from_id = $3 
    AND timestamp between $1 and $2 
    LIMIT 1`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const messageCount = Number(messageCountResp?.[0]?.count ?? '0');
  const wordCount = Number(messageCountResp?.[0]?.word_count ?? '0');
  const messageLength = Number(messageCountResp?.[0]?.message_length ?? '0');

  const messageCountPerMonthResp: { count: string; month: string }[] = await connection.query(
    `SELECT count(id) as count, 
    EXTRACT(MONTH FROM timestamp) as month 
    FROM discord_message 
    WHERE from_id = $3 
    AND timestamp between $1 and $2 
    GROUP BY month`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const unsortedMonths = messageCountPerMonthResp.reduce((acc: any, next: any) => {
    acc[Number(next.month)] = next.count;
    return acc;
  }, {});
  const sortedMonths = times(12, (i) => i + 1).map((i) => unsortedMonths[i] ?? 0);

  const messageCountDayOfWeekResp: { count: string; dow: string }[] = await connection.query(
    `SELECT count(id) as count, 
    EXTRACT(DOW FROM timestamp) as dow 
    from discord_message 
    where from_id = $3 
    AND timestamp between $1 and $2 
    GROUP BY dow`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const unsortedDayOfWeeks = messageCountDayOfWeekResp.reduce((acc: any, next: any) => {
    acc[Number(next.dow)] = next.count;
    return acc;
  }, {});
  const sortedDayOfWeeks = times(7, (i) => i).map((i) => unsortedDayOfWeeks[i] ?? 0);

  // fix order
  const sunday = sortedDayOfWeeks.shift();
  sortedDayOfWeeks.push(sunday);

  const messageCountPerHourResp: { count: string; hour: string }[] = await connection.query(
    `SELECT count(id) as count, 
    EXTRACT(HOUR FROM timestamp) as hour 
    from discord_message 
    where from_id = $3 
    AND timestamp between $1 and $2 
    GROUP BY hour`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const unsortedHours = messageCountPerHourResp.reduce((acc: any, next) => {
    acc[Number(next.hour)] = next.count;
    return acc;
  }, {});
  const sortedHours = times(24, (i) => i).map((i) => unsortedHours[i] ?? 0);

  const mostUsedEmotes: { count: string; emote: string }[] = await connection.query(
    `SELECT count(emote) as count, emote
    FROM "discord_message_flat_emotes"
    WHERE from_id = $3 
    AND timestamp between $1 and $2 
    GROUP BY emote
    ORDER BY count(emote) desc
    LIMIT 5`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const mostUsedReactions: { count: string; emote: string }[] = await connection.query(
    `SELECT count(r.emote) as count, r.emote
    FROM discord_reaction_users u
    LEFT JOIN discord_reaction r ON r.id = u.discord_reaction_id
    LEFT JOIN discord_message m ON m.id = r.message_id
    WHERE u.discord_user_id = $3 
    AND m.timestamp between $1 and $2
    GROUP BY r.emote
    ORDER BY count desc
    LIMIT 5`,
    [rangeStartDate, rangeEndDate, userId],
  );

  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage({
    viewport: {
      width: 800,
      height: 200,
    },
    deviceScaleFactor: 2,
  });
  let content = `
<html>
  <head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        font-family: sans-serif;
        background-color: #333;
        color: #ddd;
      }
      .container {
        display: grid;
        grid-template-columns: 25% 25% 25% 25%;

        grid-template-rows: auto;
        grid-template-areas:
          "headerimg header header header"
          "left left right right";
        width: 100%;
      }
      .headerimg {
        grid-area: headerimg;
        background-image: url(${member.displayAvatarURL()});
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        height: 200px;
        border-radius: 200px;
      }
      .left {
        grid-area: left;
        padding: 5px;
        display: inline-flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
        max-width: 100%;
      }
      .right {
        grid-area: right;
        padding: 5px;
        display: inline-flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
      }

      .header {
        grid-area: header;
        padding: 5px;
        margin-left: 10px;
        height: 200px;
      }
      canvas {
        margin-bottom: 10px;
      }
      .emotecontainer {
        display: grid;
        grid-template-columns: 50% 50%;

        grid-template-rows: auto;
        grid-template-areas: "leftemote rightemote";
        width: 100%;
      }
      .leftemote {
        grid-area: leftemote;
        padding: 5px;
        display: inline-flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
      }
      .rightemote {
        grid-area: rightemote;
        padding: 5px;
        display: inline-flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="headerimg"></div>
      <div class="header">
        <h2>suuN-Discord Recap <strong>2021</strong></h2>
        <h3>
          von ${member.nickname ?? member.user.username} (${member.user.tag})
        </h3>
        ${member.joinedAt ? `<span>seit <strong>${moment(member.joinedAt).format('DD.MM.YYYY')}</strong> dabei</span>` : ''}
      </div>
      <div class="left">
        <table>
          <tr>
            <td>
              <strong>Gesendete Nachrichten:</strong>&nbsp;&nbsp;&nbsp;
            </td>
            <td>
            ${numberFormatter.format(messageCount)}
            </td>
          </tr>
          <tr>
            <td>
            <strong>Gesendete Worte:</strong>&nbsp;&nbsp;&nbsp;
            </td>
            <td>
            ${numberFormatter.format(wordCount)}
            </td>
          </tr>
          <tr>
            <td>
            <strong>Gesendete Zeichen:</strong>&nbsp;&nbsp;&nbsp;
            </td>
            <td>
            ${numberFormatter.format(messageLength)}
            </td>
          </tr>
        </table>
        <hr width="100%" />
        <div class="emotecontainer">
          <div class="leftemote">
            <span style="margin-bottom: 8px"><strong>Liebings-Emotes</strong></span>
            <ol style="margin: 0px; font-size: 2em;">
              ${(
                await Promise.all(
                  mostUsedEmotes.map(
                    async (emote) => `<li>${await getEmoteTag(emote.emote)}<span style="font-size: 0.5em;">: ${emote.count}x</span></li>`,
                  ),
                )
              ).join('\n')}
            </ol>
          </div>
          <div class="rightemote">
            <span style="margin-bottom: 8px"><strong>Lieblings-Reactions</strong></span>
            <ol style="margin: 0px; font-size: 2em;">
            ${(
              await Promise.all(
                mostUsedReactions.map(
                  async (emote) => `<li>${await getEmoteTag(emote.emote)}<span style="font-size: 0.5em;">: ${emote.count}x</span></li>`,
                ),
              )
            ).join('\n')}
            </ol>
          </div>
        </div>
        <hr width="100%" />
        ${
          mostReactedMessage
            ? `
        <p style="margin-top: 4px; max-width: 100%;">
          <strong>Deine beliebteste Nachricht:</strong>
          <br />
          <br />
          <span style="overflow-wrap: break-word; word-wrap: break-word; ">"${
            dcMessage?.type === 'GUILD_MEMBER_JOIN' ? 'ist dem Server beigetreten.' : mostReactedMessage?.plain_text ?? 'Kein Inhalt'
          }" am ${moment(mostReactedMessage?.timestamp).format('DD.MM.YYYY')} um ${moment(mostReactedMessage?.timestamp).format('HH:mm')}${
                dcMessage?.channel &&
                dcMessage.channel.isText() &&
                (dcMessage.channel instanceof NewsChannel ||
                  dcMessage.channel instanceof ThreadChannel ||
                  dcMessage.channel instanceof TextChannel)
                  ? ` in #${dcMessage.channel.name}`
                  : ''
              }</span>
          <br />
          ${
            dcMessage?.attachments
              ?.filter((a) => a.contentType?.startsWith('image') ?? false)
              ?.map((a) => `<img src="${a.url}" style="max-height: 100px; max-width: 100px; margin: 3px;" />`)
              ?.join('') ?? ''
          }
          <br />
          <span style="line-height: 170%">
          ${
            dcMessage?.reactions.cache
              .map(
                (r) =>
                  `<span style="background-color: #444; border-radius: 3px; padding: 4px 3px 2px 3px; margin: 3px; white-space: nowrap;">${
                    r.count
                  }x&nbsp;${r.emoji.id ? `<:${r.emoji.name}:${r.emoji.id}>` : r.emoji.name}</span>`,
              )
              .join('') ?? ''
          }
          </span>
          <br />
          <strong>➡ ${mostReactedMessage?.reactions} Reaktionen <:suunHype:890275297969176656></strong>
        </p>
        `
            : ''
        }
      </div>
      <div class="right">
        <canvas id="chart1" width="390" height="175"></canvas>
        <canvas id="chart2" width="390" height="175"></canvas>
        <canvas id="chart3" width="390" height="175"></canvas>
      </div>
    </div>
  </body>
  <script>
    Chart.defaults.color = "#ddd";
    Chart.defaults.backgroundColor = "rgba(255, 255, 255, 0.5)";
    Chart.defaults.borderColor = "rgba(255, 255, 255, 0.1)";
    Chart.defaults.plugins.legend.display = "true";
    Chart.defaults.plugins.legend.labels.boxWidth = 0;

    const chart1Ctx = document.getElementById("chart1").getContext("2d");
    const chart1 = new Chart(chart1Ctx, {
      type: "line",

      data: {
        labels: [
          "Jan",
          "Feb",
          "Mär",
          "Apr",
          "Mai",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Okt",
          "Nov",
          "Dez",
        ],
        datasets: [
          {
            label: "Nachrichten nach Monat",
            data: ${JSON.stringify(sortedMonths)},
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
          },
        },
        animation: {
          duration: 0,
        },
      },
    });

    const chart2Ctx = document.getElementById("chart2").getContext("2d");
    const chart2 = new Chart(chart2Ctx, {
      type: "line",

      data: {
        labels: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
        datasets: [
          {
            label: "Nachrichten nach Wochentag",
            data: ${JSON.stringify(sortedDayOfWeeks)},
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
          },
        },
        animation: {
          duration: 0,
        },
      },
    });

    const chart3Ctx = document.getElementById("chart3").getContext("2d");
    const chart3 = new Chart(chart3Ctx, {
      type: "line",

      data: {
        labels: [
          "0h",
          "1h",
          "2h",
          "3h",
          "4h",
          "5h",
          "6h",
          "7h",
          "8h",
          "9h",
          "10h",
          "11h",
          "12h",
          "13h",
          "14h",
          "15h",
          "16h",
          "17h",
          "18h",
          "19h",
          "20h",
          "21h",
          "22h",
          "23h",
        ],
        datasets: [
          {
            label: "Nachrichten nach Uhrzeit",
            data: ${JSON.stringify(sortedHours)},
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
          },
        },
        animation: {
          duration: 0,
        },
      },
    });
  </script>
</html>

`;
  content = replaceEmotesInHtml(content);
  content = await replaceMentionsInHtml(content);
  // writeFileSync('recap.html', content);

  await page.setContent(content);

  await page.waitForTimeout(1000);
  const buffer = await page.screenshot({ type: 'png', fullPage: true });
  writeFileSync(`data/recap_${(member.nickname ?? member.user.tag)?.replace(/[\W_]+/g, '')}_${userId}.png`, buffer);
  console.log('done');
  await browser.close();
  return buffer;
}

function replaceEmotesInHtml(message: string): string {
  const emoteRegex = /<a?:[a-zA-Z0-9_~\-+]+:(\d+)>/g;
  let match;
  let emotes: { tag: string; id: string }[] = [];
  while ((match = emoteRegex.exec(message))) {
    emotes.push({ tag: match[0], id: match[1] });
  }
  if (emotes) {
    emotes = compact(emotes);
  }
  for (const emote of emotes) {
    message = message.replace(
      emote.tag,
      `<img src="https://cdn.discordapp.com/emojis/${emote.id}.png" style="width: 1em; height: 1em;" />`,
    );
  }
  return message;
}

async function replaceMentionsInHtml(message: string): Promise<string> {
  const regex = /<@[!&]?(\d+)>/g;
  let match;
  let mentions: { tag: string; id: string }[] = [];
  while ((match = regex.exec(message))) {
    mentions.push({ tag: match[0], id: match[1] });
  }
  if (mentions) {
    mentions = compact(mentions);
  }
  for (const mention of mentions) {
    message = message.replace(
      mention.tag,
      `@${
        (await client.guilds?.cache?.get(suuncordServerId)?.members?.fetch(mention.id))?.nickname ??
        (await client.users.fetch(mention.id)).tag ??
        mention.id
      }`,
    );
  }
  return message;
}
async function replaceChannelsInHtml(message: string): Promise<string> {
  const regex = /<@[!&]?(\d+)>/g;
  let match;
  let mentions: { tag: string; id: string }[] = [];
  while ((match = regex.exec(message))) {
    mentions.push({ tag: match[0], id: match[1] });
  }
  if (mentions) {
    mentions = compact(mentions);
  }
  for (const mention of mentions) {
    message = message.replace(
      mention.tag,
      `#${client.guilds?.cache?.get(suuncordServerId)?.channels?.cache.get(mention.id)?.name ?? mention.id}`,
    );
  }
  return message;
}

async function getSavedMessages(userId: string) {
  const connection = await connectionPromise;
  const messages: { message_id: string; channel_id: string; plain_text: string; timestamp: Date }[] = await connection.query(
    `SELECT m.id as message_id, m.channel_id, m.plain_text, m.timestamp
  FROM discord_reaction r
  LEFT JOIN discord_reaction_users u on u.discord_reaction_id = r.id
  LEFT JOIN discord_message m on m.id = r.message_id
  WHERE u.discord_user_id = $3
  AND m.timestamp between $1 and $2 
  AND r.emote = 'peepoNotes'
  ORDER BY m.timestamp DESC`,
    [rangeStartDate, rangeEndDate, userId],
  );
  return messages;
}
