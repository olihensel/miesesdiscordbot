import { ClassConstructor, plainToInstance } from 'class-transformer';
import 'reflect-metadata';
import { createConnection } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import * as ormConfig from '../ormconfig.json';
import { DiscordChannel } from './entity/discord-channel';
import { DiscordMessage } from './entity/discord-message';
import { DiscordReaction } from './entity/discord-reaction';
import { DiscordUser } from './entity/discord-user';
if (ormConfig.type !== 'postgres') {
  throw new Error('Only postgres is supported');
}
const suuncordServerId = '717034183465107456';

function createInstance<T>(classType: ClassConstructor<T>, plainObj: T): T {
  return plainToInstance(classType, plainObj);
}
createConnection({ ...ormConfig, type: 'postgres', namingStrategy: new SnakeNamingStrategy() })
  .then(async (connection) => {
    console.log('Inserting a new user into the database...');

    const user = createInstance(DiscordUser, { id: '2', displayName: 'dummy3', username: 'dummy3#1232' });
    await connection.manager.save(user);

    const channel = createInstance(DiscordChannel, { id: '2', displayName: 'Allgemein', displayNamePath: 'Quatsch/Allgemein' });
    await connection.manager.save(channel);

    const mentioned = createInstance(DiscordUser, { id: '5', displayName: 'mentioned', username: 'mentioned#1232' });
    await connection.manager.save(mentioned);
    const message = createInstance(DiscordMessage, {
      id: '2',
      from: user,
      channel: channel,
      emotes: ['PEPE', 'POLO', 'PAGA'],
      mentions: [mentioned, user],
      plainText: 'das ist ein text',
      words: ['das', 'ist', 'ein', 'text'],
      reactions: [],
      timestamp: new Date(),
    });

    await connection.manager.save(DiscordMessage, message);

    await connection.manager.save(createInstance(DiscordReaction, { count: 3, emote: 'PEPE', message: message }));
    await connection.manager.save(createInstance(DiscordReaction, { count: 4, emote: 'KEKE', message: message }));

    console.log('Saved a new user with id: ' + user.id);

    console.log('Loading users from the database...');
    const users = await connection.manager.findOne(DiscordMessage, {
      where: { id: '2' },
      relations: ['from', 'channel', 'reactions', 'mentions'],
    });
    console.log('Loaded users: ', users);

    console.log('Here you can setup and run express/koa/any other framework.');
  })
  .catch((error) => console.log(error));
