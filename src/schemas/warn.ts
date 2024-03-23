import { model, Schema } from 'mongoose';

const warnSchema = new Schema({
    _id: Schema.Types.ObjectId,
    warnIndex: Number,
    userId: String,
    reason: String,
    moderatorId: String,
    actionTaken: String,
    timestamp: Date,
});

export default model('Warn', warnSchema, 'warns');
