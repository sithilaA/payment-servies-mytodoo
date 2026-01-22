import { Table, Column, Model, DataType, HasMany, Default, Index, Unique } from 'sequelize-typescript';
import { Transaction } from './Transaction';
import { Payout } from './Payout';
import { Earning } from './Earning';

@Table({
  tableName: 'wallets',
  timestamps: true,
  underscored: true,
  version: true // Optimistic locking
})
export class Wallet extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Index({ unique: true })
  @Unique
  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  external_user_id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  external_username!: string;

  @Column({
    type: DataType.ENUM('admin', 'customer', 'service_provider'),
    allowNull: true // Optional, depending on if we strictly need it
  })
  role?: string;

  @Default(process.env.DEFAULT_CURRENCY || 'USD')
  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  currency!: string;

  // IMPORTANT: DECIMAL(19,4) for financial precision
  @Default(0)
  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  available_balance!: number;

  @Default(0)
  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  pending_balance!: number;

  @Default(0)
  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  escrow_balance!: number;

  // Stripe Connect Fields
  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  stripe_account_id?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  stripe_bank_account_id?: string;

  @Default('PENDING')
  @Column({
    type: DataType.ENUM('PENDING', 'ACTIVE', 'RESTRICTED'),
    allowNull: true
  })
  stripe_account_status?: string;

  @HasMany(() => Transaction)
  transactions!: Transaction[];

  @HasMany(() => Payout)
  payouts!: Payout[];

  @HasMany(() => Earning)
  earnings!: Earning[];
}
