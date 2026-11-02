import { NodeOperationError } from "n8n-workflow";
import type {
	DeclarativeRestApiSettings,
	IDataObject,
	IExecutePaginationFunctions,
	IExecuteSingleFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
} from "n8n-workflow";

const messages: Record<number, string> = {
	400: "Invalid input. Check the email, phone number or country code.",
	401: "Authentication failed. Check your ProWebLook API key and account status.",
	402: "Insufficient product credits. Check balances and add credits before running again.",
	403: "This ProWebLook account cannot perform this operation. Check account permissions.",
	429: "ProWebLook rate limit reached. Space requests out before running again.",
	503: "ProWebLook is unavailable or completion is uncertain. Check your balance before rerunning; another attempt may consume credits.",
};
const uncertain =
	"Request completion could not be confirmed. Check your balance before rerunning; another attempt can consume another credit.";

// Private marker: only errors created here may carry a user-visible message.
class SafeRequestError extends Error {}

/** No upstream error or cause is retained in workflow output. */
function fail(this: IExecuteSingleFunctions, message: string): never {
	throw new SafeRequestError(message);
}

/** A routing lifecycle callback, deliberately bounded to one request, without pagination or retries. */
export async function requestOnce(
	this: IExecutePaginationFunctions,
	request: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	try {
		const operation = this.getNodeParameter("operation") as string;
		const body: IDataObject = {};
		if (operation === "verify_email") {
			const email = this.getNodeParameter("email", "");
			if (
				typeof email !== "string" ||
				email.length > 254 ||
				!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
			) {
				fail.call(this, "Enter one valid email address.");
			}
			body.email = email;
		} else if (
			operation === "validate_phone" ||
			operation === "check_whatsapp"
		) {
			const phone = this.getNodeParameter("phoneNumber", "");
			const country =
				operation === "validate_phone"
					? this.getNodeParameter("countryCode", "")
					: "";
			if (typeof phone !== "string" || !/^\+?[0-9]{4,15}$/.test(phone)) {
				fail.call(
					this,
					"Enter one valid phone string using digits and an optional leading +.",
				);
			}
			if (
				typeof country !== "string" ||
				(country !== "" && !/^[a-zA-Z]{2}$/.test(country))
			) {
				fail.call(
					this,
					"Enter a valid two-letter ISO country code, or leave it empty for international input.",
				);
			}
			if (
				operation === "check_whatsapp" &&
				!/^\+[1-9][0-9]{6,14}$/.test(phone as string)
			) {
				fail.call(
					this,
					"WhatsApp requires an international phone string beginning with + and the country calling code.",
				);
			}
			if (
				operation === "validate_phone" &&
				!(phone as string).startsWith("+") &&
				!country
			) {
				fail.call(
					this,
					"A country code is required for a national phone number.",
				);
			}
			body.phone_number = phone;
			if (country) body.country_code = (country as string).toUpperCase();
		} else if (operation !== "get_balance") {
			fail.call(this, "Select a valid ProWebLook operation.");
		}
		// n8n's converter omits an empty object, so preserve the JSON object bytes for balances.
		request.options.body = operation === "get_balance" ? "{}" : body;
		return await this.makeRoutingRequest(request);
	} catch (error) {
		// Only our fixed local messages are safe; network/library errors may contain request headers.
		const message =
			error instanceof SafeRequestError ? error.message : uncertain;
		if (this.continueOnFail()) {
			return [
				{ json: { error: message }, pairedItem: { item: this.getItemIndex() } },
			];
		}
		throw new NodeOperationError(this.getNode(), message, {
			itemIndex: this.getItemIndex(),
		});
	}
}

export async function receiveResult(
	this: IExecuteSingleFunctions,
	_items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const body = response.body as { ok?: boolean; data?: unknown } | null;
	if (response.statusCode < 200 || response.statusCode >= 300) {
		fail.call(this, messages[response.statusCode] ?? uncertain);
	}
	if (
		!body ||
		body.ok !== true ||
		!body.data ||
		typeof body.data !== "object" ||
		Array.isArray(body.data)
	) {
		fail.call(
			this,
			"ProWebLook returned an invalid or unsuccessful response. Check the account and balance before rerunning.",
		);
	}
	return [
		{
			json: (body as { data: IDataObject }).data,
			pairedItem: { item: this.getItemIndex() },
		},
	];
}
