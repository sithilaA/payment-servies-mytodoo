import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
  tableName: 'failed_payout_requests',
  timestamps: true,
  underscored: true
})
export class FailedPayout extends Model {
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
  task_id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  user_id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  stripe_connect_account_id!: string;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  amount!: number;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  currency!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  error_code!: string;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  retry_count!: number;

  @Default('PENDING')
  @Column({
    type: DataType.ENUM('PENDING', 'SUCCESS', 'FAILED'),
    allowNull: false
  })
  status!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true
  })
  last_error_message?: string;
}
