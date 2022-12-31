import NSpell from 'nspell';
import { Connection, createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { promisify } from 'util';
import * as ormConfig from '../ormconfig.json';

import Axios from 'axios';
import { orderBy } from 'lodash';

const getDictCallback = require('dictionary-de');

const getDict = promisify(getDictCallback);
let _nspell: NSpell | undefined = undefined;
async function getNspell() {
  if (!_nspell) {
    const dict = await getDict();
    // console.log(dict);
    _nspell = NSpell(dict);
  }
  return _nspell;
}

export async function getWordOfTheYearForUser(connection: Connection, userId: string) {
  const nspell = await getNspell();
  const wordEntriesForUser: Array<{ count: number; word: string }> = await connection.query(
    `
  SELECT count(word) as count, word
  FROM "discord_message_flat_words"
  WHERE timestamp between '2022-01-01' and '2023-01-01'
  AND from_id = $1
  -- exclude words that i missed in indexing
  AND NOT word = 'everyone'
  GROUP BY word
  ORDER BY count desc
  LIMIT 1000`,
    [userId],
  );
  const wordEntriesForAllUsers = (await connection.query(
    `
  SELECT count(word) as count, word
  FROM "discord_message_flat_words"
  WHERE timestamp between '2022-01-01' and '2023-01-01'
  -- exclude words that i missed in indexing
  AND NOT word = 'everyone'
  GROUP BY word
  ORDER BY count desc`,
  )) as Array<{ count: number; word: string }>;

  // get factor of usages of the word of total usages per word and sort by that
  const wordsWithFactors = wordEntriesForUser.map((word) => {
    const totalWordCount = wordEntriesForAllUsers.find((entry) => entry.word === word.word)?.count;
    return { word, factor: totalWordCount && totalWordCount > 0 ? word.count / totalWordCount : 1 };
  });
  const orderedByFactor = orderBy(wordsWithFactors, 'factor', 'desc');

  // console.log(orderedByFactor.slice(0, 10));
  const orderedByCount = orderBy(
    wordsWithFactors.filter((w) => w.factor > 0.2),
    'count',
    'desc',
  );

  // console.log(orderedByCount.slice(0, 10));
  return { orderedByFactor: orderedByFactor.slice(0, 10), orderedByCount: orderedByCount.slice(0, 10) };
}

async function main() {
  const wikipediaWordFrequencyFile = await Axios.get<string>(
    'https://raw.githubusercontent.com/IlyaSemenov/wikipedia-word-frequency/master/results/dewiki-2022-08-29.txt',
    { responseType: 'text' },
  );
  const topWordsWikipedia = wikipediaWordFrequencyFile.data
    .split('\n')
    .map((line) => line.split(/\s/)[0])
    .slice(0, 500);

  const connection = await createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });
  const nspell = await getNspell();

  const wordEntries: Array<{ count: number; word: string }> = await connection.query(`
  SELECT count(word) as count, word
  FROM "discord_message_flat_words"
  WHERE timestamp between '2022-01-01' and '2023-01-01'
  GROUP BY word
  ORDER BY count desc
  LIMIT 5000`);
  let counter = 0;
  for (const wordEntry of wordEntries) {
    if (
      !(
        nspell.correct(wordEntry.word) || nspell.suggest(wordEntry.word).some((res) => res.toLowerCase() === wordEntry.word.toLowerCase())
      ) &&
      !topWordsWikipedia.includes(wordEntry.word)
    ) {
      console.log(wordEntry);
      if (counter++ > 30) {
        break;
      }
    }
  }
}

if (require.main === module) {
  main();
  /*(async () => {
    const connection = await createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() });
    await getWordOfTheYearForUser(connection, process.argv.pop() ?? '');
    await connection.close();
  })().catch(console.error);*/
}
