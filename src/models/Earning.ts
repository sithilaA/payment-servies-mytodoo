import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Index, Default } from 'sequelize-typescript';
import { Wallet } from './Wallet';

@Table({
  tableName: 'earnings',
  timestamps: true,
  underscored: true
})
export class Earning extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Index
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
  task_price!: number;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  service_fee!: number;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  commission_fee!: number;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  net_earning!: number;

  @Default('PROCESSED')
  @Column({
    type: DataType.ENUM('PROCESSED'),
    allowNull: false
  })
  status!: string;

  @Index
  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  transaction_ref?: string; // From Main Backend
}
