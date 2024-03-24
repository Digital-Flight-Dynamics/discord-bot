import { model, Schema } from 'mongoose';

const warningSchema = new Schema({
    _id: Schema.Types.ObjectId,
    userId: String,
    reason: String,
    moderatorId: String,
    actionTaken: String,
    timestamp: Date,
});

export default model('Warning', warningSchema, 'warnings');
