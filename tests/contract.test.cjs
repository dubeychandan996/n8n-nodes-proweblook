const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");

test("publishable package exposes one declarative node and password credential without runtime dependencies", () => {
	assert.ok(
		fs.existsSync(path.join(root, "package.json")),
		"native package metadata must exist",
	);
	const pkg = require("../package.json");
	assert.equal(pkg.name, "n8n-nodes-proweblook");
	assert.deepEqual(pkg.dependencies ?? {}, {});
	const { ProWebLook } = require("../dist/nodes/ProWebLook/ProWebLook.node.js");
	const {
		ProWebLookApi,
	} = require("../dist/credentials/ProWebLookApi.credentials.js");
	const node = new ProWebLook();
	const credential = new ProWebLookApi();
	assert.equal(node.execute, undefined);
	assert.equal(
		node.description.usableAsTool,
		undefined,
		"absent opt-in disables AI tool usability",
	);
	assert.equal(
		node.description.requestDefaults.baseURL,
		"https://proweblook.com/api/v1/n8n",
	);
	assert.equal(credential.properties[0].typeOptions.password, true);
	assert.deepEqual(Object.keys(credential.authenticate.properties), [
		"headers",
	]);
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		"=Bearer {{$credentials.apiKey}}",
	);
	assert.equal(credential.test.request.method, "POST");
	assert.equal(credential.test.request.url, "/get_balance");
	assert.equal(credential.test.request.body, "{}");
	assert.equal(
		credential.httpRequestNode,
		undefined,
		"credential restricted to fixed first-party node",
	);
	const operation = node.description.properties.find(
		(p) => p.name === "operation",
	);
	assert.deepEqual(operation.options.map((o) => o.value).sort(), [
		"check_whatsapp",
		"get_balance",
		"validate_phone",
		"verify_email",
	]);
	for (const op of operation.options) {
		assert.equal(op.routing.request.method, "POST");
		assert.equal(op.routing.request.url, "/" + op.value);
	}
});

test("examples are inactive, synthetic, manual-only and contain no saved credentials", () => {
	const examples = fs.readdirSync(path.join(root, "examples"));
	assert.equal(examples.length, 4);
	for (const file of examples) {
		const data = JSON.parse(
			fs.readFileSync(path.join(root, "examples", file), "utf8"),
		);
		assert.equal(data.active, false);
		assert.equal(data.nodes[0].type, "n8n-nodes-base.manualTrigger");
		assert.equal(data.nodes[1].retryOnFail, false);
		assert.equal(data.nodes[1].credentials, undefined);
		assert.equal(data.nodes.length, 2);
	}
});
