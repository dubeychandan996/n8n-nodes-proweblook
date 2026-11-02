import { NodeConnectionTypes } from "n8n-workflow";
import type { INodeType, INodeTypeDescription } from "n8n-workflow";
import { receiveResult, requestOnce } from "./routing";

export class ProWebLook implements INodeType {
	description: INodeTypeDescription = {
		displayName: "ProWebLook",
		name: "proWebLook",
		// Use the existing official logo without inventing a vector approximation.
		icon: { light: "file:proweblook.png", dark: "file:proweblook.png" },
		group: ["transform"],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			"Verify email, phone and WhatsApp targets and read product credit balances",
		defaults: { name: "ProWebLook" },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		// The workflow API only accepts true; undefined deliberately leaves AI tool generation disabled.
		usableAsTool: undefined,
		credentials: [{ name: "proWebLookApi", required: true }],
		requestDefaults: {
			baseURL: "https://proweblook.com/api/v1/n8n",
			json: true,
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			disableFollowRedirect: true,
			ignoreHttpStatusErrors: true,
		},
		properties: [
			{
				displayName: "Operation",
				name: "operation",
				type: "options",
				noDataExpression: true,
				default: "get_balance",
				options: [
					{
						name: "Get Balances",
						value: "get_balance",
						action: "Get product credit balances",
						description: "Read email, phone and WhatsApp credit pools for free",
						routing: {
							request: { method: "POST", url: "/get_balance" },
							send: { paginate: true },
							operations: { pagination: requestOnce },
							output: { postReceive: [receiveResult] },
						},
					},
					{
						name: "Validate Phone",
						value: "validate_phone",
						action: "Validate a phone number",
						description:
							"Validate one phone number; consumes up to one phone credit per request",
						routing: {
							request: { method: "POST", url: "/validate_phone" },
							send: { paginate: true },
							operations: { pagination: requestOnce },
							output: { postReceive: [receiveResult] },
						},
					},
					{
						name: "Validate WhatsApp",
						value: "check_whatsapp",
						action: "Validate a whatsapp number",
						description:
							"Check registration only; consumes up to one WhatsApp credit, sends no message or OTP",
						routing: {
							request: { method: "POST", url: "/check_whatsapp" },
							send: { paginate: true },
							operations: { pagination: requestOnce },
							output: { postReceive: [receiveResult] },
						},
					},
					{
						name: "Verify Email",
						value: "verify_email",
						action: "Verify an email address",
						description:
							"Verify one email; consumes one email credit for a completed verdict, including negative results",
						routing: {
							request: { method: "POST", url: "/verify_email" },
							send: { paginate: true },
							operations: { pagination: requestOnce },
							output: { postReceive: [receiveResult] },
						},
					},
				],
			},
			{
				displayName: "Email",
				name: "email",
				type: "string",
				default: "",
				required: true,
				placeholder: "person@example.com",
				description:
					"One email address per input item. Catch-all or unknown results do not prove mailbox existence.",
				displayOptions: { show: { operation: ["verify_email"] } },
			},
			{
				displayName: "Phone Number",
				name: "phoneNumber",
				type: "string",
				default: "",
				required: true,
				placeholder: "+12025550123",
				description:
					"One phone string per input item. Preserve the leading +; WhatsApp requires international format.",
				displayOptions: {
					show: { operation: ["validate_phone", "check_whatsapp"] },
				},
			},
			{
				displayName: "Country Code",
				name: "countryCode",
				type: "string",
				default: "",
				placeholder: "US",
				description:
					"Two-letter ISO country code, required for national phone input. Leave empty for international format.",
				displayOptions: { show: { operation: ["validate_phone"] } },
			},
			{
				displayName:
					"Each input item makes one paid request. Reruns or Retry On Fail can consume credits again. A timeout does not confirm that credits were refunded.",
				name: "creditNotice",
				type: "notice",
				default: "",
				displayOptions: {
					show: {
						operation: ["verify_email", "validate_phone", "check_whatsapp"],
					},
				},
			},
		],
	};
}
