import crypto from "crypto";

const FB_API_VERSION = "v19.0";
const FB_EVENTS_URL = (pixelId: string) =>
  `https://graph.facebook.com/${FB_API_VERSION}/${pixelId}/events`;

export interface FbEventData {
  eventName: string;
  /** UUID shared with the browser pixel for deduplication */
  eventId?: string;
  /** Full URL the event happened on (https://example.com/checkout?utm_source=...) */
  eventSourceUrl?: string;
  value?: number;
  currency?: string;
  orderId?: string;
  contentIds?: string[];
  contentName?: string;
  contentType?: string;
  numItems?: number;
  customData?: Record<string, unknown>;

  /** User identifiers — collected automatically from the request when possible */
  userIp?: string;
  userAgent?: string;
  /** _fbp cookie value (e.g. "fb.1.1234567890.987654321") */
  fbp?: string;
  /** _fbc cookie value (e.g. "fb.1.1234567890.IwAR...") */
  fbc?: string;
  /** Plain-text email — will be normalized + SHA-256 hashed before sending */
  email?: string;
  /** Plain-text phone — will be normalized + SHA-256 hashed before sending */
  phone?: string;
  /** Plain-text first name */
  firstName?: string;
  /** Plain-text last name */
  lastName?: string;
  /** External user id (e.g. our internal user id) */
  externalId?: string | number;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  // Strip everything except digits. Meta expects E.164 without the leading +.
  return phone.replace(/[^0-9]/g, "");
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Send an event to Facebook Conversions API.
 *
 * The browser pixel (if any) should fire the same event_name with the same
 * event_id so Meta deduplicates them. See:
 * https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
 */
export async function sendFbEvent(
  pixelId: string,
  accessToken: string,
  data: FbEventData,
  testEventCode?: string,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const eventTime = Math.floor(Date.now() / 1000);

    const userData: Record<string, unknown> = {};
    if (data.userIp) userData.client_ip_address = data.userIp;
    if (data.userAgent) userData.client_user_agent = data.userAgent;
    if (data.fbp) userData.fbp = data.fbp;
    if (data.fbc) userData.fbc = data.fbc;
    if (data.email) userData.em = [sha256(normalizeEmail(data.email))];
    if (data.phone) {
      const np = normalizePhone(data.phone);
      if (np) userData.ph = [sha256(np)];
    }
    if (data.firstName) userData.fn = [sha256(normalizeName(data.firstName))];
    if (data.lastName) userData.ln = [sha256(normalizeName(data.lastName))];
    if (data.externalId !== undefined && data.externalId !== null) {
      userData.external_id = [sha256(String(data.externalId).trim().toLowerCase())];
    }

    const customData: Record<string, unknown> = { ...(data.customData ?? {}) };
    if (data.value !== undefined) customData.value = Number(data.value).toFixed(2);
    if (data.currency) customData.currency = data.currency;
    if (data.orderId) customData.order_id = data.orderId;
    if (data.contentIds) customData.content_ids = data.contentIds;
    if (data.contentName) customData.content_name = data.contentName;
    if (data.contentType) customData.content_type = data.contentType;
    if (data.numItems !== undefined) customData.num_items = data.numItems;

    // Make sure the value field (if user provided it via customData) becomes a number string
    if (customData.value !== undefined && typeof customData.value === "number") {
      customData.value = (customData.value as number).toFixed(2);
    }

    const eventPayload: Record<string, unknown> = {
      event_name: data.eventName,
      event_time: eventTime,
      action_source: "website",
      user_data: userData,
    };
    if (data.eventId) eventPayload.event_id = data.eventId;
    if (data.eventSourceUrl) eventPayload.event_source_url = data.eventSourceUrl;
    if (Object.keys(customData).length > 0) eventPayload.custom_data = customData;

    const body: Record<string, unknown> = { data: [eventPayload] };
    if (testEventCode) body.test_event_code = testEventCode;

    const url = new URL(FB_EVENTS_URL(pixelId));
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as unknown;
    if (!res.ok) {
      const errMsg = (json as { error?: { message?: string } })?.error?.message ?? "Facebook API error";
      return { success: false, error: errMsg };
    }
    return { success: true, result: json };
  } catch (err: unknown) {
    return { success: false, error: String(err) };
  }
}

/**
 * Convenience wrapper for the admin/affiliate "Send Test Event" feature.
 * Hits the same endpoint with `test_event_code` so it shows up in the
 * Events Manager → Test Events tab.
 */
export async function sendFbTestEvent(
  pixelId: string,
  accessToken: string,
  testEventCode: string,
  eventName: "InitiateCheckout" | "Purchase" | "Lead" | "PageView",
  value: number,
  userIp?: string,
  userAgent?: string,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  return sendFbEvent(
    pixelId,
    accessToken,
    {
      eventName,
      value,
      currency: "INR",
      userIp: userIp ?? "127.0.0.1",
      userAgent,
    },
    testEventCode,
  );
}
