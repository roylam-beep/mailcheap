import { getConfigProblems } from "./lib/config.js";

// Runs once when a server starts, before it takes requests. Builds skip it, so they need no secrets.
export function register() {
	const problems = getConfigProblems();
	if (problems.length > 0) throw new Error(`Mailcheap can't start. ${problems.join(" ")}`);
	if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MONGODB_URI) {
		void import("./lib/users.js")
			.then(({ ensureOwner }) => ensureOwner())
			.catch((error) => console.error("[auth] Owner bootstrap failed:", error));
	}
}
