import { Table, Column, Model, DataType, Default, Index, Unique } from 'sequelize-typescript';

@Table({
    tableName: 'poster_list',
    timestamps: false,
    underscored: true
})
export class PosterList extends Model {
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
    user_id!: string; // External auth user id

    @Default(0)
    @Column({
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    total_payment!: number;

    @Default(0)
    @Column({
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    total_refund!: number;

    @Default(0)
    @Column({
        type: DataType.DECIMAL(19, 4),
        allowNull: false
    })
    current_balance!: number;

    @Column({
        type: DataType.DATE,
        allowNull: false,
        defaultValue: DataType.NOW
    })
    last_updated_at!: Date;
}
