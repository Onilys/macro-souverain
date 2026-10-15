import { LoroDoc } from "loro-crdt";
import type { Miniflare } from "miniflare";
import { assert, beforeAll, describe, expect, test } from "vitest";
import { FromPeer, FromRemote } from "../bebop/generated/schema";
import {
	connectToDocumentForTesting,
	createDocument,
	createTestUser,
	setupMiniflare,
} from "./utils";

let mf: Miniflare;

beforeAll(async () => {
	mf = await setupMiniflare();
});

describe("document sync tests", () => {
	test("should be able to load initial sync into loro", async () => {
		const ws = await connectToDocumentForTesting(mf, "test");
		const next = await ws.waitForNextMessage();

		const message = FromRemote.decode(new Uint8Array(next));
		assert(message.isRemoteInitialSync());
		const loroDoc = new LoroDoc();
		const status = loroDoc.import(message.value.snapshot);
		assert(Object.entries(status.pending ?? {})?.length === 0);
	});

	test("changes should transmit between users", async () => {
		const wsA = await connectToDocumentForTesting(mf, "test");
		const wsB = await connectToDocumentForTesting(mf, "test");
		const next = await wsA.waitForNextMessage();

		const message = FromRemote.decode(new Uint8Array(next));
		const loroDoc = new LoroDoc();
		assert(message.isRemoteInitialSync());
		loroDoc.import(message.value.snapshot);

		loroDoc.getText("content").push("hello world");
		loroDoc.commit();

		const update = loroDoc.export({ mode: "update" });

		wsA.send(
			FromPeer.fromPeerUpdate({
				updates: [update],
				id: crypto.randomUUID(),
			}).encode(),
		);

		const bFirstMessage = await wsB.waitForNextMessage();
		const bSecondMessage = await wsB.waitForNextMessage();

		const bInitialSync = FromRemote.decode(new Uint8Array(bFirstMessage));
		assert(bInitialSync.isRemoteInitialSync());
		const bSync = FromRemote.decode(new Uint8Array(bSecondMessage));
		assert(bSync.isRemoteUpdate());

		const loroDocB = new LoroDoc();
		loroDocB.import(bInitialSync.value.snapshot);
		loroDocB.import(bSync.value.update);
		expect(loroDocB.getText("content").toString()).toBe("hello world");
	});

	test("user connecting in middle of sync should receive all changes", async () => {
		const userA = await createTestUser(mf, "1234");
		expect(userA.getState()).toBe("");
		const userB = await createTestUser(mf, "1234");
		const userC = await createTestUser(mf, "1234");
		userA.makeChange("hello world");
		userB.import(await userB.readSyncMessage());
		userC.import(await userC.readSyncMessage());

		expect(userA.getState()).toBe("hello world");
		expect(userB.getState()).toBe("hello world");
		expect(userC.getState()).toBe("hello world");

		userB.makeChange(" goodbye world");
		userA.import(await userA.readSyncMessage());
		userC.import(await userC.readSyncMessage());

		expect(userA.getState()).toBe("hello world goodbye world");
		expect(userB.getState()).toBe("hello world goodbye world");
		expect(userC.getState()).toBe("hello world goodbye world");

		userB.makeChange(" hello again world");
		// Wait for the accepted update before racing a new connection against it.
		userA.import(await userA.readSyncMessage());
		const userD = await createTestUser(mf, "1234");

		expect(userD.getState()).toBe(
			"hello world goodbye world hello again world",
		);
	});

	test("non-text based exampe", async () => {
		const docA = new LoroDoc();
		const connectionA = await connectToDocumentForTesting(mf, "12347");

		const docB = new LoroDoc();
		const connectionB = await connectToDocumentForTesting(mf, "12347");
		await connectionB.waitForNextMessage();

		const tree = docA.getTree("tree");

		for (let i = 0; i < 10; i++) {
			const node = tree.createNode(undefined, i);
			node.data.set("test", i);
		}

		docA.commit();
		connectionA.send(
			FromPeer.fromPeerUpdate({
				updates: [docA.export({ mode: "update" })],
				id: crypto.randomUUID(),
			}).encode(),
		);

		const meessage = await connectionB.waitForNextMessage();
		const sync = FromRemote.decode(new Uint8Array(meessage));
		assert(sync.isRemoteUpdate());
		docB.import(sync.value.update);

		expect(docB.toJSON()).toStrictEqual(docA.toJSON());
	});

	test("document state persists after 15 second timeout", async () => {
		const doc = await createDocument(mf);
		const [userA, userB] = await doc.createMultipleUsers(2);

		userA.makeChange("hello world");
		userB.import(await userB.readSyncMessage());
		userB.makeChange(" goodbye world");
		userA.import(await userA.readSyncMessage());

		expect(userA.getState()).toBe("hello world goodbye world");
		expect(userB.getState()).toBe("hello world goodbye world");

		await new Promise((resolve) => setTimeout(resolve, 15000));

		const userC = await doc.createUser();
		expect(userC.getState()).toBe("hello world goodbye world");
	}, 30000);

	test("user gets remote update-ack", async () => {
		const doc = await createDocument(mf);
		const userA = await doc.createUser();
		userA.makeChange("hello world");
		expect(userA.getState()).toBe("hello world");
		expect((await userA.readNextMessage()).isRemoteUpdateAck()).toBeTruthy();
	}, 30000);
});
