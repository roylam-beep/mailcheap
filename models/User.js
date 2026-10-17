import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
	{
		email: { type: String, required: true, unique: true, lowercase: true, trim: true },
		passwordHash: { type: String, required: true },
		name: { type: String, trim: true, default: "" },
		role: { type: String, enum: ["owner", "member"], required: true },
	},
	{ timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
