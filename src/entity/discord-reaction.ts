import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DiscordMessage } from './discord-message';

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
}
