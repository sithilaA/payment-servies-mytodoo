import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Default } from 'sequelize-typescript';
import { Payment } from './Payment';

@Table({
  tableName: 'refunds',
  timestamps: true,
  underscored: true
})
export class Refund extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @ForeignKey(() => Payment)
  @Column({
    type: DataType.UUID,
    allowNull: false
  })
  payment_id!: string;

  @BelongsTo(() => Payment)
  payment!: Payment;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  amount!: number; // Amount refunded to Poster

  @Default(0)
  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  penalty_amount!: number; // Penalty charged to Tasker (if any)

  @Column({
    type: DataType.ENUM('STANDARD', 'PENALTY', 'FULL'),
    allowNull: false
  })
  type!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  reason?: string;

  @Default('PENDING')
  @Column({
    type: DataType.ENUM('PENDING', 'COMPLETED', 'FAILED'),
    allowNull: false
  })
  status!: string;
}
