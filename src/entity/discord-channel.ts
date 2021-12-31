import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity()
export class DiscordChannel {
  @PrimaryColumn({ nullable: false })
  id!: string;

  @Column({ nullable: false })
  @Index({ unique: false })
  displayName!: string;

  @Column({ nullable: false })
  @Index({ unique: false })
  displayNamePath!: string;
}
