import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from "n8n-workflow";

export class ProWebLookApi implements ICredentialType {
	name = "proWebLookApi";
	displayName = "ProWebLook API";
	documentationUrl = "https://proweblook.com/documentation";
	icon = "file:../nodes/ProWebLook/proweblook.png" as const;
	properties: INodeProperties[] = [
		{
			displayName: "API Key",
			name: "apiKey",
			type: "string",
			typeOptions: { password: true },
			required: true,
			default: "",
			description:
				"Your ProWebLook account API key. Testing credentials reads balances for free.",
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: "generic",
		properties: {
			headers: { Authorization: "=Bearer {{$credentials.apiKey}}" },
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: "https://proweblook.com/api/v1/n8n",
			url: "/get_balance",
			method: "POST",
			// n8n's HTTP converter omits an empty object; send its literal JSON representation.
			body: "{}",
			headers: { "Content-Type": "application/json" },
			json: true,
			disableFollowRedirect: true,
		},
		rules: [
			{
				type: "responseSuccessBody",
				properties: {
					key: "ok",
					value: false,
					message:
						"ProWebLook could not authenticate this API key. Check that the key and account are enabled.",
				},
			},
		],
	};
}
