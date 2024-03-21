import { model, Schema } from 'mongoose';

const warnSchema = new Schema({
    _id: Schema.Types.ObjectId,
    userId: String,
    reason: String,
    moderatorId: String,
});

export default model('Warn', warnSchema, 'warns');
