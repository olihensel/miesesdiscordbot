import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DiscordMessage } from './discord-message';
import { DiscordUser } from './discord-user';

@Entity()
export class DiscordReaction {
  @PrimaryGeneratedColumn()
  id?: string;

  @ManyToOne(() => DiscordMessage, (message) => message.reactions, { nullable: false })
  message!: DiscordMessage;

  @Column({ nullable: false })
  @Index({ unique: false })
  emote!: string;

  @Column({ nullable: false })
  @Index({ unique: false })
  count!: number;

  @ManyToMany(() => DiscordUser)
  @JoinTable({ name: 'discord_reaction_users' })
  users?: DiscordUser[];
}
