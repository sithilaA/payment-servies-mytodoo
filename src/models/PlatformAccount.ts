import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
  tableName: 'platform_accounts',
  timestamps: true,
  underscored: true
})
export class PlatformAccount extends Model {
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
    primaryKey: true,
  })
  id!: string;

  @Default(0)
  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  balance!: number; // Available Balance

  @Default(0)
  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  pending_balance!: number; // Pending Balance (Held)

  @Default(0)
  @Column({
    type: DataType.DECIMAL(19, 4),
    allowNull: false
  })
  total_revenue!: number;
}
