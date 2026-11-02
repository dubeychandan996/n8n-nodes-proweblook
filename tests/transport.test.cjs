// Real n8n HTTP conversion/authentication + loopback server; never contacts ProWebLook.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
process.env.N8N_USER_FOLDER = fs.mkdtempSync(
	path.join(os.tmpdir(), "proweblook-n8n-transport-"),
);
process.env.N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = "false";
const coreRoot = path.dirname(require.resolve("n8n-core/package.json"));
const { getRequestHelperFunctions } = require(
	path.join(
		coreRoot,
		"dist/execution-engine/node-execution-context/utils/request-helper-functions.js",
	),
);
const { ProWebLook } = require("../dist/nodes/ProWebLook/ProWebLook.node.js");
const {
	ProWebLookApi,
} = require("../dist/credentials/ProWebLookApi.credentials.js");

for (const source of ["node", "credential", "node401"]) {
	test(`real HTTP helper sends JSON object bytes and header-only authentication for ${source} balance test`, async () => {
		const requests = [];
		const server = http.createServer(async (req, res) => {
			const chunks = [];
			for await (const chunk of req) chunks.push(chunk);
			requests.push({
				method: req.method,
				url: req.url,
				headers: req.headers,
				body: Buffer.concat(chunks).toString(),
			});
			res.statusCode = source === "node401" ? 401 : 200;
			res.setHeader("Content-Type", "application/json");
			res.end(
				JSON.stringify({
					ok: true,
					data: {
						email: { amount: 1, unlimited: false },
						phone: { amount: 1, unlimited: false },
						whatsapp: { amount: 1, unlimited: false },
					},
				}),
			);
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		try {
			const node = { name: "Synthetic", type: "proWebLook", parameters: {} };
			const helpers = getRequestHelperFunctions(
				{},
				node,
				{
					credentialsHelper: {
						getParentTypes: () => [],
						preAuthentication: async () => undefined,
						authenticate: async (data, _type, options) => ({
							...options,
							headers: {
								...options.headers,
								Authorization: "Bearer " + data.apiKey,
							},
						}),
					},
				},
				{},
				[],
			);
			const context = {
				getNode: () => node,
				getItemIndex: () => 0,
				getNodeParameter: () => "get_balance",
				continueOnFail: () => false,
				helpers,
			};
			const send = async (options) =>
				helpers.httpRequestWithAuthentication.call(
					context,
					"proWebLookApi",
					{
						...options,
						baseURL: `http://127.0.0.1:${server.address().port}`,
						returnFullResponse: true,
					},
					{
						credentialsDecrypted: {
							data: { apiKey: "synthetic-local-only-key" },
						},
					},
				);
			if (source === "credential") {
				await send(new ProWebLookApi().test.request);
			} else {
				const description = new ProWebLook().description;
				const op = description.properties
					.find((p) => p.name === "operation")
					.options.find((o) => o.value === "get_balance");
				context.makeRoutingRequest = async (request) =>
					op.routing.output.postReceive[0].call(
						context,
						[],
						await send(request.options),
					);
				const result = op.routing.operations.pagination.call(context, {
					options: { ...description.requestDefaults, ...op.routing.request },
					preSend: [],
					postReceive: [],
				});
				if (source === "node401")
					await assert.rejects(result, /Authentication failed/);
				else await result;
			}
			assert.equal(requests.length, 1);
			assert.equal(requests[0].method, "POST");
			assert.equal(requests[0].url, "/get_balance");
			assert.equal(
				requests[0].headers.authorization,
				"Bearer synthetic-local-only-key",
			);
			assert.match(requests[0].headers["content-type"], /^application\/json/);
			assert.equal(
				requests[0].body,
				"{}",
				"backend requires a JSON object; empty HTTP body is invalid",
			);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
}
