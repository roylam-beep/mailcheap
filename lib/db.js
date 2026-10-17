import mongoose from "mongoose";

const cached = globalThis.__mailcheapMongoose ?? { connection: null, promise: null };
globalThis.__mailcheapMongoose = cached;

export async function connectDb() {
	if (cached.connection) return cached.connection;
	if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");

	// A failed attempt must not stick, or the process can never reach the database again.
	cached.promise ??= mongoose
		.connect(process.env.MONGODB_URI, {
			maxPoolSize: 10,
			serverSelectionTimeoutMS: 5000,
		})
		.catch((error) => {
			cached.promise = null;
			throw error;
		});

	try {
		cached.connection = await cached.promise;
	} catch (error) {
		cached.promise = null;
		throw error;
	}
	return cached.connection;
}
