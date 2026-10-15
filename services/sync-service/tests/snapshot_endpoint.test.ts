import { LoroDoc } from "loro-crdt";
import type { Miniflare } from "miniflare";
import { beforeEach, describe, expect, test } from "vitest";
import { createTestUser, getTokenForDocument, setupMiniflare } from "./utils";

let mf: Miniflare;

beforeEach(async () => {
	mf = await setupMiniflare();
});

describe("snapshot endpoint tests", async () => {
	test("should create document and fetch via snapshot endpoint", async () => {
		// Create a document with some content
		const user = await createTestUser(mf, "test-doc");
		const HELLO_MSG = "hello world test snapshots";
		user.makeChange(HELLO_MSG);

		expect((await user.readNextMessage()).isRemoteUpdateAck()).toBe(true);

		// Get token for API access
		const token = getTokenForDocument("test-doc", "test-user", "owner");

		// Fetch document via raw endpoint
		const response = await mf.dispatchFetch(
			"http://localhost:8787/document/test-doc/snapshot",
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);

		expect(response.status).toBe(200);

		const rawData = await response.arrayBuffer();
		const doc = new LoroDoc();
		doc.import(Buffer.from(rawData));
		expect(doc.getText("content").toString()).toBe(HELLO_MSG);

		// Clean up
		user.connection.getWebSocket().close();
	});

	test("should fetch snapshot for document with multiple changes", async () => {
		// Create document and make multiple changes
		const user = await createTestUser(mf, "test-doc");
		const changes = ["First change", " - Second change", " - Third change"];
		user.makeChange(changes[0]);
		user.makeChange(changes[1]);
		user.makeChange(changes[2]);

		for (const _change of changes) {
			expect((await user.readNextMessage()).isRemoteUpdateAck()).toBe(true);
		}

		const token = getTokenForDocument("test-doc", "test-user", "owner");

		// Fetch raw data
		const response = await mf.dispatchFetch(
			"http://localhost:8787/document/test-doc/snapshot",
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);

		expect(response.status).toBe(200);
		const rawData = await response.arrayBuffer();
		const doc = new LoroDoc();
		doc.import(Buffer.from(rawData));
		expect(doc.getText("content").toString()).toBe(changes.join(""));

		user.connection.getWebSocket().close();
	});

	test("should require authentication for snapshot endpoint", async () => {
		// Try to fetch without token
		const responseWithoutAuth = await mf.dispatchFetch(
			"http://localhost:8787/document/test-doc/snapshot",
		);

		expect(responseWithoutAuth.status).toBe(401);

		// Try with invalid token
		const responseWithBadToken = await mf.dispatchFetch(
			"http://localhost:8787/document/test-doc/snapshot",
			{
				headers: {
					Authorization: "Bearer invalid-token",
				},
			},
		);

		expect(responseWithBadToken.status).toBe(401);
	});

	test("should return 404 for non-existent document", async () => {
		const token = getTokenForDocument("non-existent-doc", "test-user", "owner");

		const response = await mf.dispatchFetch(
			"http://localhost:8787/document/non-existent-doc/snapshot",
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);

		expect(response.status).toBe(404);
	});
});
