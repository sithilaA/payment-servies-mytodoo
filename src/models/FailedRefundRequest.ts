import { Table, Column, Model, DataType, Default, ForeignKey, Index } from 'sequelize-typescript';
import { Payment } from './Payment';

@Table({
    tableName: 'failed_refund_requests',
    timestamps: true,
    underscored: true
})
export class FailedRefundRequest extends Model {
    @Column({
        type: DataType.UUID,
        defaultValue: DataType.UUIDV4,
        primaryKey: true,
    })
    id!: string;

    @ForeignKey(() => Payment)
    @Index
    @Column({
        type: DataType.UUID,
        allowNull: false
    })
    payment_id!: string;

    @Index
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

    @Column({
        type: DataType.ENUM('CANCEL', 'CANCEL_FULL', 'REFUND'),
        allowNull: false
    })
    action!: string;

    @Column({
        type: DataType.STRING,
        allowNull: true
    })
    error_code?: string;

    @Column({
        type: DataType.TEXT,
        allowNull: true
    })
    error_message?: string;

    @Default('PENDING')
    @Index
    @Column({
        type: DataType.ENUM('PENDING', 'RETRYING', 'SUCCESS', 'FAILED'),
        allowNull: false
    })
    status!: string;

    @Default(0)
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    retry_count!: number;

    @Column({
        type: DataType.DATE,
        allowNull: true
    })
    last_retry_at?: Date;
}
