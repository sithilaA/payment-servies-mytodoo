import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Default } from 'sequelize-typescript';
import { Wallet } from './Wallet';

@Table({
  tableName: 'payouts',
  timestamps: true,
  underscored: true
})
export class Payout extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  external_user_id!: string;

  @ForeignKey(() => Wallet)
  @Column({
    type: DataType.UUID,
    allowNull: false
  })
  wallet_id!: string;

  @BelongsTo(() => Wallet)
  wallet!: Wallet;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  amount!: number;

  @Column({
    type: DataType.ENUM('BANK', 'CARD'),
    allowNull: true
  })
  method?: string;

  @Column({
    type: DataType.JSON,
    allowNull: true
  })
  details?: any;

  @Default('REQUESTED')
  @Column({
    type: DataType.ENUM('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED'),
    allowNull: false
  })
  status!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  stripe_payout_id?: string;
}
