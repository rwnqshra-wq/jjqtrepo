const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  direction: { type: String, enum: ['in', 'out'], default: 'in' },
  author: { type: String, default: '' },
  body: { type: String, required: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

messageSchema.index({ user_id: 1 });

module.exports = mongoose.model('Message', messageSchema);
