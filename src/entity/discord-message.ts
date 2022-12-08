import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { DiscordChannel } from './discord-channel';
import { DiscordAttachment, DiscordEmbed } from './discord-json-types';
import { DiscordReaction } from './discord-reaction';
import { DiscordUser } from './discord-user';
@Entity()
export class DiscordMessage {
  @PrimaryColumn({ nullable: false })
  id!: string;

  @Column({ nullable: false })
  plainText!: string;

  @ManyToOne(() => DiscordUser, { nullable: false })
  from!: DiscordUser;

  @ManyToOne(() => DiscordChannel, { nullable: false })
  channel!: DiscordChannel;

  @Index({ unique: false })
  @Column({ type: String, array: true })
  words!: string[];

  @ManyToMany(() => DiscordUser)
  @JoinTable({ name: 'discord_message_mentions' })
  mentions!: DiscordUser[];

  @OneToMany(() => DiscordReaction, (reaction) => reaction.message)
  reactions!: DiscordReaction[];

  @Column({ type: String, array: true, nullable: false })
  @Index({ unique: false })
  emotes!: string[];

  @Column({ nullable: false })
  messageLength!: number;

  @Column({ nullable: false })
  wordCount!: number;

  @Column({ nullable: false })
  @Index({ unique: false })
  timestamp!: Date;

  @Column({ nullable: true })
  @Index({ unique: false })
  referencedMessage?: string;

  @Column({ nullable: true, type: 'jsonb' })
  embeds?: DiscordEmbed[];

  @Column({ nullable: true, type: 'jsonb' })
  attachments?: DiscordAttachment[];
}
