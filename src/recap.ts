require('dotenv').config();
import { Client, GatewayIntentBits, Message, MessageType, NewsChannel, TextChannel, ThreadChannel, User } from 'discord.js';
import { random } from 'faker';
import { writeFileSync } from 'fs';
import { compact, times, uniq } from 'lodash';
import moment from 'moment';
import { chromium } from 'playwright';
import 'reflect-metadata';
import { createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as ormConfig from '../ormconfig.json';
import { DiscordMessage } from './entity/discord-message';
import { renderCalendar } from './image-renderer';
import { getWordOfTheYearForUser } from './word-of-the-year';
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
const connectionPromise = createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });
const suuncordServerId = '717034183465107456';
const nilpferdServerId = '703705066351362068';
const oli = '267745416186036225';

const rangeStartDate = moment('2022-01-01').startOf('day').toDate();
const rangeEndDate = moment('2022-12-31').endOf('day').toDate();

const suunEmotesMsg = `<:suunAngry:947921898229084251><:suunCake:947921897390219294><:suunCmon:947921888020160532><:suunComfy:947921899000844308><:suunDerp:947921896933031986><:suunDrum:947921899810324520><:suunG:947921895234359307><:suunGuitar:947921899000844309><:suunHehe:947921881481248858><:suunHi:947921897390219295><:suunHype:947921887135166515><:suunHide:947921891702755348><:suunJammies:958833101621039105><:suunLost:947921898229084250><:suunLove:947921889869856788><:suunLurk:947921895234359306><:suunMS:748515853623885845><:suunMusic:1001217805154275409><:suunCozy:947921883632914442><:suunNom:947921892583538728><:suunHe:818255003524399136><:suunPop:947921875051352064><:suunSad:947921886266949692><:suunSit:964903087095554099><:suunSleep:947921896102584320><:suunWTF:1001217804126654474><:suunWiggle:955194092567031878><:suunWoah:947921885302235186><:suunWow:959572956323905567><:ms_Cookie:818275844304535552>`;
const suunEmotes = suunEmotesMsg.split(/[<:>]/g).filter((t) => /^\d+$/g.test(t));
console.log(suunEmotes);
client.on('error', console.error);
let isReady = false;
client.on('ready', async () => {
  isReady = true;

  // const channel = client.guilds.cache.get('703705066351362068')?.channels.cache.get('703705066351362071');
  // if (channel?.isTextBased()) {
  //   const msg = await channel.messages.fetch('1049427095777968228');
  //   console.log(msg);
  // }
  /*
  const testUsers = [
    oli,
    '368923494538412034',
    '616563729932484647',
    '731838778976501781',
    '399686518253420564',
    '890539960808140800',
    '539087313989402674',
    '458653317053022218',
    '700077923847110756',
  ];

  for (const user of testUsers) {
    const stats = await generateStats(user);
    console.log(stats);
  }
*/
  // client.destroy();

  console.log(`Logged in as ${client?.user?.tag}!`);
  // const channel = client.guilds.cache.get('703705066351362068')?.channels.cache.get('890737558894567554');
  client.on('messageCreate', async (msg) => {
    if (msg.channelId !== '1058804666802114671') return;
    if (msg.guildId !== suuncordServerId) return;
    if (!msg.channel.isTextBased()) return;
    console.log(msg.author.username, msg.content);
    let user: User | undefined;
    if (msg.content.startsWith('!recapfor')) {
      if (!['267745416186036225'].includes(msg.author.id)) {
        msg.reply('Insufficient permissions to use this command!');
        return;
      }
      user = msg.mentions.users.first();
    }
    if (msg.content === '!recap') {
      user = msg.author;
    }

    if (user) {
      try {
        const stats = await generateStats(user.id);
        const member = user.username.replace(/[\W_]+/g, '');

        let content = `Hier ist dein suuN-Discord Recap für das Jahr 2022, <@${user.id}>!`;
        if (stats.mostLikedMessageUrl) {
          content += '\n' + `Link zu deiner Nachricht mit den meisten Reaktionen: ${stats.mostLikedMessageUrl}`;
        }

        try {
          const connection = await connectionPromise;

          const topGifs = await connection.query(
            //`SELECT * from discord_message_reaction_count where from_id = $3 AND timestamp between $1 and $2 AND plain_text != '' LIMIT 1`,
            `select max(m.plain_text) as plain_text, count(split_part(COALESCE(m.embeds->0->'thumbnail'->>'url', m.embeds->0->'image'->>'url'), '?', 1)) as count, split_part(COALESCE(m.embeds->0->'video'->>'url', m.embeds->0->'thumbnail'->>'url', m.embeds->0->'image'->>'url'), '?', 1) as url from discord_message m
            WHERE m.embeds is not null
            AND from_id = $3 
            AND m.timestamp between $1 and $2 
            AND (
              (m.embeds->0->>'type' = 'gifv') 
              OR (m.embeds->0->>'type' = 'image' AND m.embeds->0->'thumbnail'->>'url' LIKE '%.gif')
            )
            GROUP BY url
            ORDER BY count desc
            LIMIT 1`,
            [rangeStartDate, rangeEndDate, user.id],
          );
          const topGif: { plain_text: string; count: number; url: string } | undefined = topGifs?.[0];

          const url = topGif?.plain_text.match(/(https?:\/\/[^\s]+)/g)?.[0] ?? topGif?.url;
          content += `\nDein meistgesendetes GIF: ${url} (${topGif?.count}x)`;
        } catch (e) {}
        // msg.reply(new MessageAttachment(buffer, `SUUNCORD-Recap_${member}.png`));
        await msg.reply({
          content: content,
          files: [{ attachment: stats.buffer, name: `SUUNCORD-Recap-2022_${member}.png` }],
        });
      } catch (e: unknown) {
        console.error(e);
        await msg.reply({ content: 'A Error occured while generating the recap: ' + (e as any)?.message });
      }
      /*
      await msg.author
        ?.send(
          `Du hast Dir folgende Nachrichten mit peepoNotes oder suunG markiert:\n${(await getSavedMessages(msg.author.id))
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
  if (!channel?.isTextBased()) {
    return emoteName;
  }
  const dcMessage = await channel.messages.fetch(messageId);
  const reactionEmote = dcMessage?.reactions.cache.find((r) => r.emoji?.name === emoteName);
  if (reactionEmote) {
    return `<:${emoteName}:${reactionEmote.emoji.id}>`;
  }
}

export async function generateStats(userId: string, hideWordOfTheYear: boolean = true) {
  console.log('generating user', userId);
  if (!isReady) {
    throw new Error('Discord client is not ready yet');
  }
  const connection = await connectionPromise;
  const user = await client.users.fetch(userId);
  const guild = await client.guilds.fetch(suuncordServerId);

  let member;
  try {
    member = await guild.members.fetch(userId);
  } catch (e) {
    console.error('error fetching user', e);
  }
  const firstMessageOfUser: { timestamp: string }[] = await connection.query(
    `
  SELECT timestamp from discord_message 
  WHERE from_id = $1
  ORDER BY timestamp asc
  LIMIT 1`,
    [userId],
  );
  const timestampFirstMessage = firstMessageOfUser?.[0].timestamp ? moment(firstMessageOfUser?.[0].timestamp) : undefined;
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
  let mostReactedMessageDiscord: Message<boolean> | undefined;
  let mostReactedMessageDb: DiscordMessage | undefined;
  if (mostReactedMessage) {
    const channel = guild.channels.cache.get(mostReactedMessage.channel_id);
    if (channel && channel.isTextBased()) {
      mostReactedMessageDiscord = await channel.messages.fetch(mostReactedMessage.id);
    }
    mostReactedMessageDb = await connection
      .getRepository(DiscordMessage)
      .findOne(mostReactedMessage.id, { relations: ['reactions', 'reactions.users'] });
  }

  const mostReactedMessagesByUniqueUsers = await connection.query(
    //`SELECT * from discord_message_reaction_count where from_id = $3 AND timestamp between $1 and $2 AND plain_text != '' LIMIT 1`,
    `SELECT * 
    from discord_message_reaction_user_count
    where from_id = $3 
    AND timestamp between $1 and $2 
    LIMIT 1`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const mostReactedMessageByUniqueUsers = mostReactedMessagesByUniqueUsers?.[0];
  let mostReactedMessageDiscordByUniqueUsers: Message<boolean> | undefined;
  let mostReactedMessageDbByUniqueUsers: DiscordMessage | undefined;
  if (mostReactedMessageByUniqueUsers) {
    const channel = guild.channels.cache.get(mostReactedMessageByUniqueUsers.channel_id);
    if (channel && channel.isTextBased()) {
      mostReactedMessageDiscordByUniqueUsers = await channel.messages.fetch(mostReactedMessageByUniqueUsers.id);
    }
    mostReactedMessageDbByUniqueUsers = await connection
      .getRepository(DiscordMessage)
      .findOne(mostReactedMessageByUniqueUsers.id, { relations: ['reactions', 'reactions.users'] });
  }
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

  const sentGifsCount = (
    await connection.query(
      `SELECT count(id) as count
  FROM discord_message 
  WHERE from_id = $3 
  AND timestamp between $1 and $2
  AND embeds is not null
  AND (
    (embeds->0->>'type' = 'gifv') 
    OR (embeds->0->>'type' = 'image' AND embeds->0->'thumbnail'->>'url' LIKE '%.gif')
  )`,
      [rangeStartDate, rangeEndDate, userId],
    )
  )?.[0]?.count;

  const sentMessagesWithAttachments = (
    await connection.query(
      `SELECT count(id) as count
  FROM discord_message 
  WHERE from_id = $3 
  AND timestamp between $1 and $2
  AND attachments is not null`,
      [rangeStartDate, rangeEndDate, userId],
    )
  )?.[0]?.count;

  const messageCountPerMonthResp: { count: string; month: string }[] = await connection.query(
    `SELECT count(id) as count, 
    EXTRACT(MONTH FROM timestamp) as month 
    FROM discord_message 
    WHERE from_id = $3 
    AND timestamp between $1 and $2 
    GROUP BY month`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const sortedMonths = groupByMonth(messageCountPerMonthResp);

  const messageCountDayOfWeekResp: { count: string; dow: string }[] = await connection.query(
    `SELECT count(id) as count, 
    EXTRACT(DOW FROM timestamp) as dow 
    from discord_message 
    where from_id = $3 
    AND timestamp between $1 and $2 
    GROUP BY dow`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const sortedDayOfWeeks = groupByDayOfWeek(messageCountDayOfWeekResp);

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
  const sortedHours = groupByHour(messageCountPerHourResp);
  /*
  const receivedReactionsPerMonthResp: { count: string; month: string }[] = await connection.query(
    `SELECT count(r.message_id) as count, EXTRACT(MONTH FROM timestamp) as month
    FROM discord_reaction r
    LEFT JOIN discord_message m ON m.id = r.message_id
    WHERE m.from_id = $3
    AND m.timestamp between $1 and $2
    GROUP BY month`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const sortedReceivedReactionsMonths = groupByMonth(receivedReactionsPerMonthResp);

  const sentGifsPerMonthResp: { count: string; month: string }[] = await connection.query(
    `SELECT count(id) as count, 
    EXTRACT(MONTH FROM timestamp) as month 
    FROM discord_message 
    WHERE from_id = $3 
    AND timestamp between $1 and $2
    AND embeds is not null
    AND (
      (embeds->0->>'type' = 'gifv') 
      OR (embeds->0->>'type' = 'image' AND embeds->0->'thumbnail'->>'url' LIKE '%.gif')
    )
    GROUP BY month`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const sortedSentGifsPerMonths = groupByMonth(sentGifsPerMonthResp);
*/

  const wordOfTheYearForUser = hideWordOfTheYear ? undefined : await getWordOfTheYearForUser(connection, userId);
  const showWordOfTheYear = (wordOfTheYearForUser?.orderedByCount?.[0]?.word?.count ?? 0) > 10;

  const mostUsedEmotes: { count: string; emote: string }[] = await connection.query(
    `SELECT count(emote) as count, emote
    FROM "discord_message_flat_emotes"
    WHERE from_id = $3 
    AND timestamp between $1 and $2 
    GROUP BY emote
    ORDER BY count(emote) desc
    LIMIT ${showWordOfTheYear ? 5 : 7}`,
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
    LIMIT ${showWordOfTheYear ? 5 : 7}`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const mostReceivedReaction: { count: string; emote: string }[] = await connection.query(
    `SELECT sum(r.count) as count, r.emote
    FROM discord_reaction r
    LEFT JOIN discord_message m ON m.id = r.message_id
    WHERE m.from_id = $3
    AND m.timestamp between $1 and $2
    GROUP BY r.emote
    ORDER BY count desc
    LIMIT ${showWordOfTheYear ? 5 : 7}`,
    [rangeStartDate, rangeEndDate, userId],
  );

  const mostMessagesByChannel: { count: string; channel: string }[] = await connection.query(
    `SELECT m.count as count, c.display_name as channel
    FROM (SELECT count(m.channel_id) as count, m.channel_id as channel_id from discord_message m
          WHERE m.from_id = $3
          AND m.timestamp between $1 and $2
          GROUP BY m.channel_id
          ORDER BY count(m.channel_id) desc) m
    LEFT JOIN discord_channel c on c.id = m.channel_id
    ORDER BY count desc
    LIMIT ${showWordOfTheYear ? 5 : 7}`,
    [rangeStartDate, rangeEndDate, userId],
  );

  const activeDaysPerMonthResp: { count: string; month: string }[] = await connection.query(
    `SELECT month, count(month) as count 
    from (SELECT DISTINCT EXTRACT(MONTH FROM timestamp) as month,
          EXTRACT(DAY FROM timestamp) as day
          from discord_message 
          WHERE from_id = $3 
          AND timestamp between $1 and $2 
          ORDER BY month, day) timestamps
    GROUP BY month
    ORDER BY month`,
    [rangeStartDate, rangeEndDate, userId],
  );
  const activeDaysPerMonth = groupByMonth(activeDaysPerMonthResp);

  const activeDays = (
    (await connection.query(
      `SELECT DISTINCT DATE(timestamp) as date, count(*) as count
  from discord_message 
  WHERE from_id = $3 
  AND timestamp between $1 and $2
  GROUP BY date
  ORDER BY date desc`,
      ['2022-01-01', '2023-01-01', userId],
    )) as { date: string; count: number }[]
  ).map((entry) => ({ day: moment(entry.date).format('YYYY-MM-DD'), count: entry.count }));

  const activeDaysImage = await renderCalendar(activeDays);

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
  const showFooter = mostReactedMessageDb && !!mostReactedMessage?.reactions;
  const showFooterRight =
    mostReactedMessageDbByUniqueUsers &&
    mostReactedMessageDbByUniqueUsers?.id !== mostReactedMessageDb?.id &&
    !!mostReactedMessageByUniqueUsers?.reactions;
  let content = `
<html>
  <head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji">

    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        font-family: sans-serif, "Noto Color Emoji";
        background-color: #333;
        border-radius: 5px;
        color: #ddd;
      }
      .container {
        display: grid;
        grid-template-columns: 25% 30% 25% 20%;

        grid-template-rows: auto;
        grid-template-areas:
          "headerimg header header header"
          "left left right right"
          ${showFooterRight ? '"footer footer footerright footerright"' : '"footer footer footer footer"'};
        width: 100%;
      }
      .headerimg {
        grid-area: headerimg;
        background-image: url(${(member || user).displayAvatarURL()});
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
      
      .footer {
        grid-area: footer;
      }
      .footerright {
        grid-area: footerright;
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
      hr {
        margin-top: 15px;
        margin-bottom: 15px;
      }
      .emotecontainer {
        display: grid;
        grid-template-columns: 33.3% 33.3% 33.3%;

        grid-template-rows: auto;
        grid-template-areas: "leftemote centeremote rightemote";
        width: 100%;
      }
      .emotecontainer div {
        padding: 5px;
        display: inline-flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
      }
      .leftemote {
        grid-area: leftemote;
      }
      .rightemote {
        grid-area: rightemote;
      }
      .centeremote {
        grid-area: centeremote;
      }
      .top-message-reaction {
        background-color: #444;
        border-radius: 3px;
        padding: 4px 3px 2px 3px;
        margin: 3px;
        white-space: nowrap;
      }
      .top-message-reaction img {
        margin-top: 3px;
        margin-bottom: -3px;
      }
      .background-suunemote {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 25vw;
        opacity: 5%;
        filter: grayscale(90%)
      }
    </style>
  </head>
  <body>
    <img class="background-suunemote" src="https://cdn.discordapp.com/emojis/${random.arrayElement(suunEmotes)}.png" />
    <div class="container">
      <div class="headerimg"></div>
      <div class="header">
        <h2>suuN-Discord Recap <strong>2022</strong></h2>
        <h3>
          von ${member?.nickname ?? member?.user?.username ?? user.username} (${member?.user?.tag ?? user.tag})
        </h3>
        ${
          member?.joinedAt && moment(member.joinedAt).isBefore(timestampFirstMessage)
            ? `<span>seit <strong>${moment(member.joinedAt).format('DD.MM.YYYY')}</strong> dabei</span>`
            : timestampFirstMessage
            ? `<span>erste Nachricht am <strong>${moment(timestampFirstMessage).format('DD.MM.YYYY')}</strong></span>`
            : ''
        }
      </div>
      <div class="left">
        <table>
          <tr>
            <td><strong>Gesendete Nachrichten:</strong>&nbsp;&nbsp;&nbsp;</td>
            <td>${numberFormatter.format(messageCount)}</td>
          </tr>
          <tr>
            <td><strong>Gesendete Worte:</strong>&nbsp;&nbsp;&nbsp;</td>
            <td>${numberFormatter.format(wordCount)}</td>
          </tr>
          <tr>
            <td><strong>Gesendete Zeichen:</strong>&nbsp;&nbsp;&nbsp;</td>
            <td>${numberFormatter.format(messageLength)}</td>
          </tr>
          <tr>
            <td><strong>Gesendete Gifs:</strong>&nbsp;&nbsp;&nbsp;</td>
            <td>${numberFormatter.format(sentGifsCount)}</td>
          </tr>
          <tr>
            <td><strong>Aktive Tage:</strong>&nbsp;&nbsp;&nbsp;</td>
            <td>${numberFormatter.format(activeDaysPerMonth.reduce((acc, next) => Number(acc) + Number(next), 0))}</td>
          </tr>
          <tr>
            <td><strong>Hochgeladene Bilder/Videos:</strong>&nbsp;&nbsp;&nbsp;</td>
            <td>${numberFormatter.format(sentMessagesWithAttachments)}</td>
          </tr>
        </table>
        <hr width="100%" />
        <div class="emotecontainer">
          <div class="leftemote">
            <span style="margin-bottom: 8px; height: 2.5em;"><strong>Lieblings-Emotes</strong></span>
            <ol style="margin: 0px; font-size: 2em;">
              ${(
                await Promise.all(
                  mostUsedEmotes.map(
                    async (emote) => `<li>${await getEmoteTag(emote.emote)}<span style="font-size: 0.5em;"> ${emote.count}x</span></li>`,
                  ),
                )
              ).join('\n')}
            </ol>
          </div>
          <div class="centeremote">
            <span style="margin-bottom: 8px; height: 2.5em;"><strong>Lieblings-Reactions</strong></span>
            <ol style="margin: 0px; font-size: 2em;">
            ${(
              await Promise.all(
                mostUsedReactions.map(
                  async (emote) => `<li>${await getEmoteTag(emote.emote)}<span style="font-size: 0.5em;"> ${emote.count}x</span></li>`,
                ),
              )
            ).join('\n')}
            </ol>
          </div>
          <div class="rightemote">
            <span style="margin-bottom: 8px; height: 2.5em;"><strong>Erhaltene Reactions</strong></span>
            <ol style="margin: 0px; font-size: 2em;">
            ${(
              await Promise.all(
                mostReceivedReaction.map(
                  async (emote) => `<li>${await getEmoteTag(emote.emote)}<span style="font-size: 0.5em;"> ${emote.count}x</span></li>`,
                ),
              )
            ).join('\n')}
            </ol>
          </div>
        </div>
        <hr width="100%" />
        <div>
          <span style="margin-bottom: 8px"><strong>Lieblings-Channel</strong></span>
          <ol style="margin: 0px; font-size: 2em;">
          ${(
            await Promise.all(
              mostMessagesByChannel.map(
                async (channel) =>
                  `<li><span style="font-size: 0.5em; font-weight: bold;">${channel.channel}</span> <span style="font-size: 0.5em;">${channel.count} Nachrichten</span></li>`,
              ),
            )
          ).join('\n')}
          </ol>
        </div>
        ${
          showWordOfTheYear
            ? `
        <hr width="100%" />
        
        <div>
          <span style="margin-bottom: 8px"><strong>Wörter, die fast nur du verwendest</strong></span>
          <ol style="margin: 0px; font-size: 2em;">
          ${wordOfTheYearForUser?.orderedByCount
            .slice(0, 5)
            .map(
              (word) =>
                `<li><span style="font-size: 0.5em; font-weight: bold;">${word.word.word}</span> <span style="font-size: 0.5em;">${word.word.count}x</span></li>`,
            )
            .join('\n')}
          </ol>
        </div>
        `
            : ''
        }
        
      </div>
      <div class="right">
        <canvas id="chart1" width="390" height="190"></canvas>
        <canvas id="chart2" width="390" height="190"></canvas>
        <canvas id="chart3" width="390" height="190"></canvas>
        <canvas id="chart4" width="390" height="190"></canvas>
        <img src="${activeDaysImage.dataUri}" style="width: 92%; height: auto; margin-left: 8%; margin-top: -5px; object-fit: fill;" />
      </div>
      <div class="footer">
        ${
          showFooter
            ? formatMostReactedMessage(mostReactedMessageDiscord, mostReactedMessageDb!, 'Deine Nachricht mit den meisten Reaktionen:')
            : ''
        }
      </div>
      ${
        showFooterRight
          ? `<div class="footerright"> ${formatMostReactedMessage(
              mostReactedMessageDiscordByUniqueUsers,
              mostReactedMessageDbByUniqueUsers!,
              'Deine Nachricht mit den meisten reagierenden Personen:',
            )}</div>`
          : ''
      }
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
            label: "Gesendete Nachrichten nach Monat",
            data: ${JSON.stringify(sortedMonths)},
            borderWidth: 2,
            borderColor: "#00969E",
          },
        ],
      },
      options: {
        pointRadius: 0,
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
            label: "Gesendete Nachrichten nach Wochentag",
            data: ${JSON.stringify(sortedDayOfWeeks)},
            borderWidth: 2,
            borderColor: "#00969E",
          },
        ],
      },
      options: {
        pointRadius: 0,
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
            label: "Gesendete Nachrichten nach Uhrzeit",
            data: ${JSON.stringify(sortedHours)},
            borderWidth: 2,
            borderColor: "#00969E",
          },
        ],
      },
      options: {
        pointRadius: 0,
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

    
    const chart4Ctx = document.getElementById("chart4").getContext("2d");
    const chart4 = new Chart(chart4Ctx, {
      type: "bar",

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
            label: "Aktive Tage nach Monat",
            data: ${JSON.stringify(activeDaysPerMonth)},
            borderWidth: 0,
            borderColor: "#00969E",
            color: "#00969E",
            backgroundColor: "#00969E",
            fill: "#00969E",
          },
        ],
      },
      options: {
        pointRadius: 0,
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
  content = await replaceChannelsInHtml(content);
  // writeFileSync(`data/recap/recap_${(member?.nickname ?? member?.user.tag ?? user.tag)?.replace(/[\W_]+/g, '')}_${userId}.html`, content);

  await page.setContent(content);

  await page.waitForTimeout(1000);
  const buffer = await page.screenshot({ type: 'png', fullPage: true });
  writeFileSync(`data/recap/recap_${(member?.nickname ?? member?.user.tag ?? user.tag)?.replace(/[\W_]+/g, '')}_${userId}.png`, buffer);
  console.log('done');
  await browser.close();
  return { buffer, mostLikedMessageUrl: mostReactedMessageDiscord ? mostReactedMessageDiscord.url : undefined };
}

function formatMostReactedMessage(dcMessage: Message<boolean> | undefined, mostReactedMessageDb: DiscordMessage, title: string) {
  return `
        <hr width="100%" />
        <p style="margin-top: 4px; max-width: 100%;">
          <strong>${title}</strong>
          <br />
          <br />
          <span style="overflow-wrap: break-word; word-wrap: break-word; ">"${
            dcMessage?.type === MessageType.UserJoin
              ? 'ist dem Server beigetreten.'
              : mostReactedMessageDb?.plainText || '-- Kein Inhalt --'
          }"<i> am ${moment(mostReactedMessageDb?.timestamp).format('DD.MM.YYYY')} um ${moment(mostReactedMessageDb?.timestamp).format(
    'HH:mm',
  )}${
    dcMessage?.channel &&
    dcMessage.channel.isTextBased() &&
    (dcMessage.channel instanceof NewsChannel || dcMessage.channel instanceof ThreadChannel || dcMessage.channel instanceof TextChannel)
      ? ` in #${dcMessage.channel.name}`
      : ''
  }</i></span>
          <br />
          ${
            [
              ...(dcMessage?.attachments?.filter((a) => a.contentType?.startsWith('image') ?? false)?.map((a) => a.url) ?? []),
              ...(dcMessage?.embeds?.map((e) => e.image?.url ?? e.thumbnail?.url) ?? []),
            ]
              ?.map((url) => `<img src="${url}" style="max-height: 100px; max-width: 100px; margin: 3px;" />`)
              ?.join('') ?? ''
          }
          <br />
          <span style="line-height: 170%">
          ${
            dcMessage?.reactions.cache
              .map(
                (r) =>
                  `<span class="top-message-reaction" style="">${r.count}x&nbsp;${
                    r.emoji.id ? `<:${r.emoji.name}:${r.emoji.id}>` : r.emoji.name
                  }</span>`,
              )
              .join('') ?? ''
          }
          </span>
          <br />
          <strong>➡ ${mostReactedMessageDb?.reactions?.reduce((acc, next) => acc + next.count, 0) ?? 0} Reaktionen von ${
    uniq(mostReactedMessageDb.reactions.flatMap((re) => re.users?.map((u) => u.id))).length
  } Personen <:suunHype:890275297969176656> </strong>
        </p>
        `;
}

function groupByHour(messageCountPerHourResp: { count: string; hour: string }[]) {
  const unsortedHours = messageCountPerHourResp.reduce((acc: any, next) => {
    acc[Number(next.hour)] = next.count;
    return acc;
  }, {});
  const sortedHours = times(24, (i) => i).map((i) => unsortedHours[i] ?? 0);
  return sortedHours;
}

function groupByDayOfWeek(messageCountDayOfWeekResp: { count: string; dow: string }[]) {
  const unsortedDayOfWeeks = messageCountDayOfWeekResp.reduce((acc: any, next: any) => {
    acc[Number(next.dow)] = next.count;
    return acc;
  }, {});
  const sortedDayOfWeeks = times(7, (i) => i).map((i) => unsortedDayOfWeeks[i] ?? 0);
  return sortedDayOfWeeks;
}

function groupByMonth(messageCountPerMonthResp: { count: string; month: string }[]) {
  const unsortedMonths: Record<string, number> = messageCountPerMonthResp.reduce((acc: any, next: any) => {
    acc[Number(next.month)] = next.count;
    return acc;
  }, {});
  const sortedMonths = times(12, (i) => i + 1).map((i) => unsortedMonths[i] ?? 0);
  return sortedMonths;
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
    let nick;
    try {
      nick = (await client.guilds?.cache?.get(suuncordServerId)?.members?.fetch(mention.id))?.nickname;
    } catch (e) {}
    try {
      if (!nick) {
      }
      nick = (await client.users.fetch(mention.id)).tag;
    } catch (e) {}

    message = message.replace(mention.tag, `@${nick ?? mention.id}`);
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
  AND (r.emote = 'peepoNotes' OR r.emote = 'suunG')
  ORDER BY m.timestamp DESC`,
    [rangeStartDate, rangeEndDate, userId],
  );
  return messages;
}
