import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    orderId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    txHash: { type: String },
  },
  { timestamps: true },
);

export default mongoose.models.Transaction || mongoose.model("Transaction", TransactionSchema);
