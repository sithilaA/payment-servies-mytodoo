import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
  tableName: 'escrows',
  timestamps: true,
  underscored: true
})
export class Escrow extends Model {
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
  payer_external_id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  payee_external_id!: string;

  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  amount!: number;

  @Default('HELD')
  @Column({
    type: DataType.ENUM('HELD', 'RELEASED', 'REFUNDED', 'DISPUTED'),
    allowNull: false
  })
  status!: string;

  @Column({
    type: DataType.STRING,
    allowNull: true
  })
  related_task_id?: string;

  @Column({
    type: DataType.DECIMAL(19, 4),
    defaultValue: 0
  })
  service_fee!: number;

  @Column({
    type: DataType.DECIMAL(19, 4),
    defaultValue: 0
  })
  commission!: number;

  @Column({
    type: DataType.DECIMAL(19, 4),
    defaultValue: 0
  })
  total_amount!: number; // Gross amount blocked
}
