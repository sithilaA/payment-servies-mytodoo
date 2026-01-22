import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index, Default } from 'sequelize-typescript';
import { Wallet } from './Wallet';
import { PlatformAccount } from './PlatformAccount';

@Table({
  tableName: 'transactions',
  timestamps: true,
  underscored: true
})
export class Transaction extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => Wallet)
  @Column({ type: DataType.UUID, allowNull: true })
  from_wallet_id?: string;

  @BelongsTo(() => Wallet, 'from_wallet_id')
  fromWallet?: Wallet;

  @ForeignKey(() => Wallet)
  @Column({ type: DataType.UUID, allowNull: true })
  to_wallet_id?: string;

  @BelongsTo(() => Wallet, 'to_wallet_id')
  toWallet?: Wallet;

  @ForeignKey(() => PlatformAccount)
  @Column({ type: DataType.UUID, allowNull: true })
  platform_account_id?: string;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  amount!: number;

  @Default(process.env.DEFAULT_CURRENCY || 'USD')
  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  currency!: string;

  @Column({
    type: DataType.ENUM(
      'DEPOSIT', 
      'PAYMENT', 
      'FEE', 
      'STRIPE_CHARGE', 
      'TRANSFER', 
      'ESCROW_LOCK', 
      'ESCROW_RELEASE', 
      'PAYOUT', 
      'REFUND',
      'EARNING',
      'COMMISSION',
      'EARNING_PENDING',
      'FEE_PENDING'
    ),
    allowNull: false
  })
  type!: string;

  @Default('PENDING')
  @Column({
    type: DataType.ENUM('PENDING', 'COMPLETED', 'FAILED'),
    allowNull: false
  })
  status!: string;

  @Index
  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  reference_id?: string; // Stripe ID or Internal Task ID
}
