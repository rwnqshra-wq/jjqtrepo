const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  command: { type: String, required: true },
  issued_by: { type: String, default: '' },
  consumed_at: { type: Date, default: null }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

commandSchema.index({ user_id: 1, consumed_at: 1 });

module.exports = mongoose.model('Command', commandSchema);
