import { readFileSync, writeFileSync } from 'fs';
import { compact } from 'lodash';
import { chromium } from 'playwright';

export async function render(wordcloud: Buffer, config: { day: string; awards: string[] }) {
  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage({
    viewport: {
      width: 1920,
      height: 1080,
    },
    deviceScaleFactor: 1,
  });
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  const wordcloudDataUri = `data:image/png;base64,${wordcloud.toString('base64')}`;
  let content = `
  <html>
  <head>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji">
    <style>
      body {
        font-family: sans-serif, "Noto Color Emoji";
        background-color: #333;
        border-radius: 5px;
        color: #ddd;
        padding: 5px;
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
    </style>
  </head>
    <body>
    <div style="display: flex; width: 100%; height: 100%; justify-content: space-between;">
      <div style="flex: 1; width: auto; height: 100%; overflow: auto; font-size: 2.8em;">
        <span style="font-size: 1.5em; font-weight: bold;">Quatsch des Tages für den ${config.day} <:peepoQuatsch:875141585224994837></span>
        <ul>
          ${config.awards.map((a) => `<li style="margin-bottom: 2px;">${a}</li>`).join('')}
        </ul>
      </div>
      <div style="flex: 1; width: 99vh; height: 100vh;">
        <img src="${wordcloudDataUri}" alt="Wordcloud" style="width: 100vh; height: 100vh; object-fit: contain;">
      </div>
    </div>
    </body>
  </html>
  `;
  content = replaceEmotesWithImagesInHtml(content);
  await page.setContent(content);

  await page.waitForTimeout(1000);
  const buffer = await page.screenshot({ type: 'png', fullPage: true, omitBackground: true });
  await page.close();
  await browser.close();
  return buffer;
}

function replaceEmotesWithImagesInHtml(message: string): string {
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
    message = message.replaceAll(
      emote.tag,
      `<img src="https://cdn.discordapp.com/emojis/${emote.id}.png" style="width: 1em; height: 1em; margin-top: 0.1em; margin-bottom: -0.1em;" />`,
    );
  }
  return message;
}

if (require.main === module) {
  render(readFileSync('data/daily/suuN_2023-01-04.png'), {
    day: '01.01.2000',
    awards: [
      'Wort des Tages: nuggets (7x)',
      'Emote des Tages: <:KEKW:818255295041503263> (26x)',
      'Emote-Newcomer des Tages: <:Toxicjustin_LOL:1059515676966002788> (5x)',
      'Reaction des Tages: <:suunLove:947921889869856788> (145x)',
      'Reaction-Newcomer des Tages: <:Sadge:994140290728333312> (9x)',
      'Nachricht mit den meisten Reaktionen: SpaghettiLaranese - "asdfasdf asdfa sdf asdf asdfasdf asd f asdf  asd f adsf  asd f a sdf a sdf as df a sdf a sd fa sd fa sd fa sd f asd f as df a sd f as df a sdf  aweq wmertqewrtwertwertwert we r tw ertwertwertwertwertwertwertwertwert wer twe r tw er t we rt we rt w er tw er a sdfasdf adfasdsfasd fasdf adfasd f asd f asd f asdf  asfd  as df a sdf  as df as df  asd ffasdfasdfasd" (200x)',
    ],
  }).then((buffer) => {
    writeFileSync('out.png', buffer);
  });
}
