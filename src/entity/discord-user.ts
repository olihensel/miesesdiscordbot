import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity()
export class DiscordUser {
  @PrimaryColumn({ nullable: false })
  id!: string;

  @Column({ nullable: false })
  @Index({ unique: false })
  displayName!: string;

  @Column({ nullable: false })
  @Index({ unique: false })
  username!: string;
}
