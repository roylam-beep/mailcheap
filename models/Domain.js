import mongoose from "mongoose";

const checkSchema = new mongoose.Schema(
	{
		type: { type: String, enum: ["CNAME", "TXT", "MX"], required: true },
		name: { type: String, required: true },
		status: { type: String, enum: ["found", "missing", "error"], required: true },
	},
	{ _id: false }
);

const domainSchema = new mongoose.Schema(
	{
		hostname: { type: String, required: true, unique: true, lowercase: true, trim: true },
		verifiedForSending: { type: Boolean, default: false },
		dkimStatus: { type: String, default: "NOT_STARTED" },
		dkimTokens: { type: [String], default: [] },
		mailFromDomain: { type: String, default: "" },
		mailFromStatus: { type: String, default: "" },
		sesError: { type: String, default: "" },
		lastCheckedAt: { type: Date },
		note: { type: String, trim: true, default: "" },
		checks: { type: [checkSchema], default: [] },
	},
	{ timestamps: true }
);

export default mongoose.models.Domain || mongoose.model("Domain", domainSchema);
