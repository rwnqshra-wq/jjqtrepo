const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  page_key: { type: String, default: '' },
  page_label: { type: String, default: '' },
  summary: { type: String, default: '' },
  payload: { type: Object, required: true } // JSON payload
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

submissionSchema.index({ user_id: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
