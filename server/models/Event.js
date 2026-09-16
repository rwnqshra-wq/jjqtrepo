const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  type: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  payload: { type: Object, required: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('Event', eventSchema);
