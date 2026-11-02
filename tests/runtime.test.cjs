// Actual n8n RoutingNode and item expression contexts; only the HTTP boundary is mocked.
// Fixed production URL is asserted but never contacted.
const { test } = require("node:test");
const os = require("node:os");
const fs = require("node:fs");
// n8n imports initialize settings; isolate those dev-only side effects before loading the runtime.
process.env.N8N_USER_FOLDER = fs.mkdtempSync(
	require("node:path").join(os.tmpdir(), "proweblook-n8n-runtime-"),
);
process.env.N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = "false";
const assert = require("node:assert/strict");
const path = require("node:path");
const coreRoot = path.dirname(require.resolve("n8n-core/package.json"));
const { RoutingNode } = require(
	path.join(coreRoot, "dist/execution-engine/routing-node.js"),
);
const { WorkflowExecute } = require(
	path.join(coreRoot, "dist/execution-engine/workflow-execute.js"),
);
const { ExecuteContext } = require(
	path.join(
		coreRoot,
		"dist/execution-engine/node-execution-context/execute-context.js",
	),
);
const { InstanceSettings } = require(
	path.join(coreRoot, "dist/instance-settings"),
);
const { Container } = require("@n8n/di");
const { Workflow, createEmptyRunExecutionData } = require("n8n-workflow");
const { ProWebLook } = require("../dist/nodes/ProWebLook/ProWebLook.node.js");

// Prevent the runtime from creating real n8n settings/encryption-key files.
Container.set(InstanceSettings, {
	instanceId: "synthetic-local-test",
	n8nFolder: "/unused",
});

async function run(
	items,
	{ onError = "stopWorkflow", failIndex, invalidIndex, delay = false } = {},
) {
	const type = new ProWebLook();
	const node = {
		id: "proweblook",
		name: "ProWebLook",
		type: "n8n-nodes-proweblook.proWebLook",
		typeVersion: 1,
		position: [0, 0],
		parameters: { operation: "verify_email", email: "={{ $json.email }}" },
		onError,
		credentials: { proWebLookApi: { id: "synthetic", name: "Synthetic" } },
	};
	const nodeTypes = {
		getByNameAndVersion: () => type,
		getKnownTypes: () => ({}),
	};
	const workflow = new Workflow({
		id: "synthetic",
		name: "Offline routing test",
		nodes: [node],
		connections: {},
		active: false,
		nodeTypes,
	});
	const input = items.map((email) => ({ json: { email } }));
	const inputData = { main: [input] };
	const runData = createEmptyRunExecutionData();
	const executeData = { node, data: inputData, source: null };
	const additionalData = {
		currentNodeExecutionIndex: 0,
		executionId: "synthetic",
		credentialsHelper: {},
		hooks: {},
		logAiEvent: () => {},
	};
	const context = new ExecuteContext(
		workflow,
		node,
		additionalData,
		"manual",
		runData,
		0,
		input,
		inputData,
		executeData,
	);
	const routing = new RoutingNode(context, type, {
		id: "synthetic",
		name: "Synthetic",
		type: "proWebLookApi",
		data: { apiKey: "synthetic-not-a-real-key" },
	});
	const requests = [];
	routing.rawRoutingRequest = async (single, request, credentialType) => {
		const index = single.getItemIndex();
		assert.equal(credentialType, "proWebLookApi");
		assert.equal(request.options.baseURL, "https://proweblook.com/api/v1/n8n");
		assert.equal(request.options.url, "/verify_email");
		assert.equal(request.options.method, "POST");
		assert.equal(request.options.ignoreHttpStatusErrors, true);
		assert.equal(request.options.disableFollowRedirect, true);
		assert.deepEqual(request.options.body, { email: items[index] });
		requests.push(index);
		if (delay)
			await new Promise((resolve) =>
				setTimeout(resolve, (items.length - index) * 3),
			);
		if (index === failIndex)
			throw Object.assign(
				new Error("DO_NOT_ECHO synthetic credential diagnostics"),
				{ request: { headers: { Authorization: "Bearer DO_NOT_ECHO" } } },
			);
		if (index === invalidIndex)
			return {
				statusCode: 401,
				headers: {},
				body: {
					ok: false,
					error: { message: "DO_NOT_ECHO", code: "unauthorized" },
				},
			};
		return {
			statusCode: 200,
			headers: {},
			body: {
				ok: true,
				data: {
					email: items[index],
					verdict: index % 2 ? "unknown" : "undeliverable",
					valid: false,
				},
			},
		};
	};
	try {
		const outputs = await routing.runNode();
		if (onError === "continueErrorOutput") {
			WorkflowExecute.prototype.handleNodeErrorOutput.call(
				{
					additionalData,
					mode: "manual",
					runExecutionData: runData,
					abortController: new AbortController(),
				},
				workflow,
				executeData,
				outputs,
				0,
			);
		}
		return { outputs, requests };
	} catch (error) {
		return { error, requests };
	}
}

test("real n8n runtime resolves each input expression and preserves output order and item links", async () => {
	const emails = [
		"first+tag@example.com",
		"second@example.com",
		"third@example.com",
	];
	const result = await run(emails, { delay: true });
	assert.ifError(result.error);
	assert.deepEqual(result.requests, [0, 1, 2]);
	assert.deepEqual(
		result.outputs[0].map((i) => i.json.email),
		emails,
	);
	assert.deepEqual(
		result.outputs[0].map((i) => i.pairedItem),
		[{ item: 0 }, { item: 1 }, { item: 2 }],
	);
	assert.deepEqual(
		result.outputs[0].map((i) => i.json.verdict),
		["undeliverable", "unknown", "undeliverable"],
	);
});

test("real runtime continuation keeps the failed middle item linked and never retries", async () => {
	const emails = [
		"first@example.com",
		"second@example.com",
		"third@example.com",
	];
	for (const mode of ["continueRegularOutput", "continueErrorOutput"]) {
		const result = await run(emails, { onError: mode, failIndex: 1 });
		assert.ifError(result.error);
		assert.deepEqual(result.requests, [0, 1, 2]);
		if (mode === "continueErrorOutput") {
			assert.equal(result.outputs[0].length, 2);
			assert.equal(result.outputs[1].length, 1);
			assert.deepEqual(
				result.outputs[0].map((i) => i.pairedItem),
				[{ item: 0 }, { item: 2 }],
			);
			assert.deepEqual(result.outputs[1][0].pairedItem, { item: 1 });
			assert.equal(typeof result.outputs[1][0].json.error, "string");
		} else {
			assert.equal(result.outputs[0].length, 3);
			assert.equal(typeof result.outputs[0][1].json.error, "string");
			assert.deepEqual(
				result.outputs[0].map((i) => i.pairedItem),
				[{ item: 0 }, { item: 1 }, { item: 2 }],
			);
		}
		assert.doesNotMatch(
			JSON.stringify(result.outputs),
			/DO_NOT_ECHO|synthetic-not-a-real-key/,
		);
	}
});

test("real runtime stops by default on non2xx and marks no application error successful", async () => {
	const result = await run(["first@example.com", "second@example.com"], {
		invalidIndex: 0,
	});
	assert.ok(result.error);
	assert.deepEqual(result.requests, [0, 1]);
	assert.doesNotMatch(
		JSON.stringify(result.error),
		/DO_NOT_ECHO|synthetic-not-a-real-key/,
	);
});
