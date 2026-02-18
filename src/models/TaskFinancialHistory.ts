import { Table, Column, Model, DataType, Default, Unique, Index } from 'sequelize-typescript';

@Table({
    tableName: 'task_financial_history',
    timestamps: true,
    underscored: true,
    updatedAt: false // Only created_at, no updated_at
})
export class TaskFinancialHistory extends Model {
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
    task_id!: string;

    @Index
    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    poster_user_id!: string; // External user id

    @Index
    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    tasker_user_id!: string; // External user id

    @Column({
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    task_price!: number;

    @Default('complete')
    @Column({
        type: DataType.ENUM('complete', 'refund', 'refund_with_penalty', 'payout_complete'),
        allowNull: false
    })
    status!: string;

    @Default('none')
    @Column({
        type: DataType.ENUM('tasker', 'poster', 'none'),
        allowNull: false
    })
    penalty_owner!: string;

    @Default(0)
    @Column({
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    penalty_amount!: number;

    @Default(0)
    @Column({
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    refund_amount!: number;

    @Default(0)
    @Column({
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    payout_amount!: number;
}
