const mongoose = require("mongoose");

const slideSchema = new mongoose.Schema({
  id: { type: String, required: true },
  elements: [
    {
      id: String,
      content: String,
      x: Number,
      y: Number,
    },
  ],
});

const presentationSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  slides: [slideSchema],
  creatorId: { type: String, default: null },
  users: {
    type: Map,
    of: new mongoose.Schema({
      nickname: String,
      role: String,
    }),
    default: {},
  },
});

module.exports = mongoose.model("Presentation", presentationSchema);