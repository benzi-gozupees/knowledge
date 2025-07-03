import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class Knowledge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column()
  source: string;

  @Column({ nullable: true })
  favicon: string;

  @Column()
  createdBy: string;

  @Column()
  orgId: string;

  @CreateDateColumn()
  createdAt: Date;
}
