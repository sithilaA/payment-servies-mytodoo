import { Table, Column, Model, DataType, Unique } from 'sequelize-typescript';

@Table({
  tableName: 'stripe_error_codes',
  timestamps: true,
  underscored: true
})
export class StripeErrorCode extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Unique
  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  error_code!: string; // e.g., 'balance_insufficient', 'api_connection_error'

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  description?: string;
}
