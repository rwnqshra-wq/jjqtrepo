const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  ref: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  email: { type: String, default: '' },
  country: { type: String, default: '' },
  status: { type: String, default: 'new' },
  is_read: { type: Boolean, default: false },
  waiting_for_decision: { type: Boolean, default: false },
  service: { type: String, default: '' },
  total_price: { type: String, default: '' },
  current_page: { type: String, default: '' },
  last_activity: { type: Date, default: Date.now }
}, { 
  timestamps: { createdAt: 'created_at', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

userSchema.index({ last_activity: -1 });
userSchema.index({ is_read: 1, waiting_for_decision: 1 });

module.exports = mongoose.model('User', userSchema);
