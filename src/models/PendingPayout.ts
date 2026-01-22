import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
    tableName: 'pending_payouts',
    timestamps: true,
    underscored: true
})
export class PendingPayout extends Model {
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
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    amount!: number;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    currency!: string;

    @Default('PENDING')
    @Column({
        type: DataType.ENUM('PENDING', 'PROCESSED', 'FAILED'),
        allowNull: false
    })
    status!: string;
}
