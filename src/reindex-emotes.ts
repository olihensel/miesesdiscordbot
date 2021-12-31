// this file is used to reindex the emotes in the database

import { compact, uniq } from 'lodash';
import { createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as ormConfig from '../ormconfig.json';
import { DiscordMessage } from './entity/discord-message';

async function main() {
  const connection = await createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });

  for (let page = 0; page < 1000; page++) {
    console.log('page', page);
    const messages = await connection.manager.find(DiscordMessage, {
      order: { timestamp: 'ASC' },
      skip: page * 1000,
      take: 1000,
    });
    for (const message of messages) {
      const sanitizedMessageContent = message.plainText.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
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
        .replace(/<@[!&]\d+>/g, '') // mentiones
        .replace(/<#[!&]\d+>/g, '') // channel-links
        .split(/[^0-9a-zA-ZäöüÄÖÜß]/)
        .filter((s) => s.length > 1);

      const words = uniq(unorderedWords.map((w) => w.toLowerCase()));
      if (words.length !== message.words.length) {
        console.log('updating message', message.id, 'new words length', words.length, 'old words length', message.words.length);
      }
      await connection.manager.update(DiscordMessage, message.id, { words, emotes, wordCount: unorderedWords.length });
    }
    if (messages.length < 1000) {
      break;
    }
  }
}

main().catch(console.error);
