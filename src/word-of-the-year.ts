import NSpell from 'nspell';
import { createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { promisify } from 'util';
import * as ormConfig from '../ormconfig.json';

const getDictCallback = require('dictionary-de');

const getDict = promisify(getDictCallback);

async function main() {
  const connection = await createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });
  const dict = await getDict();
  console.log(dict);
  const nspell = NSpell(dict);

  const wordEntries: Array<{ count: number; word: string }> = await connection.query(`
  SELECT count(word) as count, word
  FROM "discord_message_flat_words"
  GROUP BY word
  ORDER BY count desc
  LIMIT 5000`);
  let counter = 0;
  for (const wordEntry of wordEntries) {
    if (
      !(nspell.correct(wordEntry.word) || nspell.suggest(wordEntry.word).some((res) => res.toLowerCase() === wordEntry.word.toLowerCase()))
    ) {
      console.log(wordEntry);
      if (counter++ > 30) {
        break;
      }
    }
  }
}

main().catch(console.error);
