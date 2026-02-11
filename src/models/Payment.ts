import { Table, Column, Model, DataType, Default, Unique } from 'sequelize-typescript';

@Table({
  tableName: 'payments',
  timestamps: true,
  underscored: true
})
export class Payment extends Model {
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
  user_id!: string;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  amount!: number; // Total amount paid (Base + Fee)

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  service_fee!: number; // Fee portion

  @Column({
    type: DataType.DECIMAL(19, 4),
    defaultValue: 0
  })
  commission!: number; // Commission to be deducted from Tasker later

  @Default(process.env.DEFAULT_CURRENCY || 'USD')
  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  currency!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  stripe_payment_intent_id?: string;

  @Default('PENDING')
  @Column({
    type: DataType.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'REFUNDED_FULL', 'REFUNDED_KEEP_FEE', 'REFUNDED_WITH_PENALTY'),
    allowNull: false
  })
  status!: string;

  @Unique
  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  related_task_id?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  receipt_url?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    validate: { isEmail: true }
  })
  poster_email?: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
    validate: { isEmail: true }
  })
  tasker_email?: string;
}
