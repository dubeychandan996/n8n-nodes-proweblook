const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ProWebLook } = require("../dist/nodes/ProWebLook/ProWebLook.node.js");
const description = new ProWebLook().description;
const operation = (name) =>
	description.properties
		.find((p) => p.name === "operation")
		.options.find((o) => o.value === name);

async function run(
	name,
	parameters,
	response,
	index = 0,
	continueOnFail = false,
) {
	const op = operation(name);
	let calls = 0;
	let sent;
	const context = {
		getNode: () => ({
			name: "ProWebLook",
			type: "proWebLook",
			typeVersion: 1,
			parameters: {},
		}),
		getItemIndex: () => index,
		getNodeParameter: (key, fallback) =>
			({ operation: name, ...parameters })[key] ?? fallback,
		continueOnFail: () => continueOnFail,
		makeRoutingRequest: async (request) => {
			calls++;
			sent = request.options;
			if (response instanceof Error) throw response;
			return op.routing.output.postReceive[0].call(context, [], {
				statusCode: 200,
				headers: {},
				...response,
			});
		},
	};
	try {
		const result = await op.routing.operations.pagination.call(context, {
			options: { ...description.requestDefaults, ...op.routing.request },
			preSend: [],
			postReceive: [],
		});
		return { result, calls, sent };
	} catch (error) {
		return { error, calls, sent };
	}
}

test("one request per item preserves plus signs and pairs negative or unknown verdicts", async () => {
	for (const verdict of ["invalid", "unknown", "catch_all"]) {
		const data = {
			verdict,
			valid: false,
			phone_number: "+12025550123",
			reason_code: "synthetic",
		};
		const output = await run(
			"validate_phone",
			{ phoneNumber: "+12025550123" },
			{ body: { ok: true, data } },
			4,
		);
		assert.equal(output.calls, 1);
		assert.deepEqual(output.sent.body, { phone_number: "+12025550123" });
		assert.deepEqual(output.result, [{ json: data, pairedItem: { item: 4 } }]);
		assert.equal(output.sent.disableFollowRedirect, true);
		assert.equal(
			output.sent.ignoreHttpStatusErrors,
			true,
			"n8n helper must not retry 401",
		);
	}
});

test("balance is free, sends empty JSON and returns all three product pools", async () => {
	const data = {
		email: { amount: 3, unlimited: false },
		phone: { amount: 0, unlimited: false },
		whatsapp: { amount: 0, unlimited: true },
	};
	const out = await run("get_balance", {}, { body: { ok: true, data } });
	assert.equal(out.calls, 1);
	assert.equal(out.sent.body, "{}");
	assert.deepEqual(out.result[0].json, data);
});

test("national phone input uses optional uppercase ISO country and email sends only one target", async () => {
	const phone = await run(
		"validate_phone",
		{ phoneNumber: "2025550123", countryCode: "us" },
		{ body: { ok: true, data: { valid: true } } },
	);
	assert.deepEqual(phone.sent.body, {
		phone_number: "2025550123",
		country_code: "US",
	});
	const email = await run(
		"verify_email",
		{ email: "person+tag@example.com" },
		{ body: { ok: true, data: { verdict: "unknown" } } },
	);
	assert.deepEqual(email.sent.body, { email: "person+tag@example.com" });
});

test("missing/malformed email, numeric phone, noninternational WhatsApp and malformed country never dispatch", async () => {
	const cases = [
		["verify_email", { email: "" }],
		["verify_email", { email: "bad" }],
		["validate_phone", { phoneNumber: 12025550123 }],
		["check_whatsapp", { phoneNumber: "2025550123" }],
		["validate_phone", { phoneNumber: "+12025550123", countryCode: "USA" }],
		["validate_phone", { phoneNumber: "2025550123" }],
	];
	for (const [name, parameters] of cases) {
		const out = await run(name, parameters, { body: { ok: true, data: {} } });
		assert.equal(out.calls, 0, name);
		assert.match(out.error.message, /valid|country|international|email|phone/i);
	}
});

test("API/auth/credit/provider errors and HTTP-200 application errors become fixed safe errors", async () => {
	for (const statusCode of [200, 400, 401, 402, 429, 500, 502, 503, 504]) {
		const out = await run(
			"verify_email",
			{ email: "person@example.com" },
			{
				statusCode,
				body: {
					ok: false,
					error: {
						code: "provider_error",
						message: "DO_NOT_ECHO_SECRET_OR_PROVIDER_BODY",
					},
				},
			},
		);
		assert.equal(out.calls, 1);
		assert.ok(out.error);
		assert.doesNotMatch(JSON.stringify(out.error), /DO_NOT_ECHO/);
	}
});

test("network errors never retry or retain diagnostic causes and continuation retains pairing", async () => {
	const error = new Error("DO_NOT_ECHO_SECRET_OR_PROVIDER_BODY");
	error.request = { headers: { Authorization: "Bearer DO_NOT_ECHO" } };
	const stopped = await run(
		"check_whatsapp",
		{ phoneNumber: "+12025550123" },
		error,
	);
	assert.equal(stopped.calls, 1);
	assert.doesNotMatch(JSON.stringify(stopped.error), /DO_NOT_ECHO/);
	assert.match(stopped.error.message, /credit|completion|request|connect/i);
	const continued = await run(
		"check_whatsapp",
		{ phoneNumber: "+12025550123" },
		error,
		2,
		true,
	);
	assert.equal(continued.calls, 1);
	assert.deepEqual(continued.result[0].pairedItem, { item: 2 });
	assert.equal(typeof continued.result[0].json.error, "string");
	assert.doesNotMatch(JSON.stringify(continued.result), /DO_NOT_ECHO/);
});

test("invalid envelopes and redirects fail without returning arbitrary payloads", async () => {
	for (const response of [
		{ statusCode: 302, body: "DO_NOT_ECHO" },
		{ body: { ok: true, data: "DO_NOT_ECHO" } },
		{ body: { status: false, error: "DO_NOT_ECHO" } },
	]) {
		const out = await run("get_balance", {}, response);
		assert.ok(out.error);
		assert.doesNotMatch(JSON.stringify(out.error), /DO_NOT_ECHO/);
	}
});

test("upstream NodeOperationError messages are untrusted and cannot expose credentials", async () => {
	const { NodeOperationError } = require("n8n-workflow");
	const injected = new NodeOperationError(
		{ name: "Synthetic node", parameters: {} },
		"DO_NOT_ECHO fixture API key",
	);
	const out = await run(
		"verify_email",
		{ email: "person@example.com" },
		injected,
	);
	assert.equal(out.calls, 1);
	assert.ok(out.error);
	assert.doesNotMatch(JSON.stringify(out.error), /DO_NOT_ECHO/);
});
