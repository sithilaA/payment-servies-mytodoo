import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
    tableName: 'failed_requests_admin_review',
    timestamps: true,
    underscored: true
})
export class FailedRequestAdminReview extends Model {
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

    @Column({
        type: DataType.TEXT,
        allowNull: true
    })
    last_error_message?: string;

    @Default('ADMIN_REVIEW_REQUIRED')
    @Column({
        type: DataType.ENUM('ADMIN_REVIEW_REQUIRED', 'RETRYING', 'PROCESSED'),
        allowNull: false
    })
    status!: string;
}
