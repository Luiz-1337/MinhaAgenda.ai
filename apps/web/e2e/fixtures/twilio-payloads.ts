/**
 * Twilio webhook payload templates for testing
 */

/**
 * Options for creating a Twilio payload
 */
export interface TwilioPayloadOptions {
  /** Sender phone number (whatsapp:+...) */
  from: string;
  /** Receiver phone number (whatsapp:+...) */
  to: string;
  /** Message body */
  body?: string;
  /** Message SID (auto-generated if not provided) */
  messageSid?: string;
  /** Number of media items */
  numMedia?: number;
  /** Media content type */
  mediaContentType?: string;
  /** Media URL */
  mediaUrl?: string;
  /** Profile name */
  profileName?: string;
  /** Account SID */
  accountSid?: string;
}

/**
 * Creates a Twilio webhook payload
 */
export function createTwilioPayload(options: TwilioPayloadOptions): URLSearchParams {
  const {
    from,
    to,
    body = "",
    messageSid = generateMessageSid(),
    numMedia = 0,
    mediaContentType,
    mediaUrl,
    profileName,
    accountSid = "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  } = options;

  // Ensure phone numbers have whatsapp: prefix
  const formattedFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const formattedTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  const params = new URLSearchParams();
  
  // Required fields
  params.append("From", formattedFrom);
  params.append("To", formattedTo);
  params.append("Body", body);
  params.append("MessageSid", messageSid);
  params.append("NumMedia", numMedia.toString());
  params.append("AccountSid", accountSid);
  params.append("SmsMessageSid", messageSid);
  params.append("SmsSid", messageSid);
  params.append("SmsStatus", "received");
  params.append("ApiVersion", "2010-04-01");

  // Optional fields
  if (profileName) {
    params.append("ProfileName", profileName);
  }

  // Media fields
  if (numMedia > 0 && mediaContentType) {
    params.append("MediaContentType0", mediaContentType);
    if (mediaUrl) {
      params.append("MediaUrl0", mediaUrl);
    }
  }

  return params;
}

/**
 * Creates a text message payload
 */
export function createTextMessagePayload(
  from: string,
  to: string,
  body: string,
  options?: Partial<TwilioPayloadOptions>
): URLSearchParams {
  return createTwilioPayload({
    from,
    to,
    body,
    numMedia: 0,
    ...options,
  });
}

/**
 * Creates an image message payload
 */
export function createImageMessagePayload(
  from: string,
  to: string,
  imageUrl: string,
  options?: Partial<TwilioPayloadOptions>
): URLSearchParams {
  return createTwilioPayload({
    from,
    to,
    body: "",
    numMedia: 1,
    mediaContentType: "image/jpeg",
    mediaUrl: imageUrl,
    ...options,
  });
}

/**
 * Creates an audio message payload
 */
export function createAudioMessagePayload(
  from: string,
  to: string,
  audioUrl: string,
  options?: Partial<TwilioPayloadOptions>
): URLSearchParams {
  return createTwilioPayload({
    from,
    to,
    body: "",
    numMedia: 1,
    mediaContentType: "audio/ogg",
    mediaUrl: audioUrl,
    ...options,
  });
}

/**
 * Creates a video message payload
 */
export function createVideoMessagePayload(
  from: string,
  to: string,
  videoUrl: string,
  options?: Partial<TwilioPayloadOptions>
): URLSearchParams {
  return createTwilioPayload({
    from,
    to,
    body: "",
    numMedia: 1,
    mediaContentType: "video/mp4",
    mediaUrl: videoUrl,
    ...options,
  });
}

/**
 * Pre-defined test payloads
 */
export const TestPayloads = {
  /** Simple greeting message */
  greeting: (from: string, to: string) =>
    createTextMessagePayload(from, to, "Olá, gostaria de fazer um agendamento"),

  /** Appointment request */
  appointmentRequest: (from: string, to: string) =>
    createTextMessagePayload(from, to, "Quero agendar um corte de cabelo para amanhã às 14h"),

  /** Service inquiry */
  serviceInquiry: (from: string, to: string) =>
    createTextMessagePayload(from, to, "Quais serviços vocês oferecem?"),

  /** Price inquiry */
  priceInquiry: (from: string, to: string) =>
    createTextMessagePayload(from, to, "Quanto custa um corte de cabelo?"),

  /** Availability check */
  availabilityCheck: (from: string, to: string) =>
    createTextMessagePayload(from, to, "Quais horários estão disponíveis para amanhã?"),

  /** Cancel appointment */
  cancelAppointment: (from: string, to: string) =>
    createTextMessagePayload(from, to, "Preciso cancelar meu agendamento"),

  /** Image message */
  imageMessage: (from: string, to: string) =>
    createImageMessagePayload(from, to, "https://example.com/image.jpg"),

  /** Audio message */
  audioMessage: (from: string, to: string) =>
    createAudioMessagePayload(from, to, "https://example.com/audio.ogg"),
};

/**
 * Generates a random MessageSid
 */
function generateMessageSid(): string {
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `MM${hex}`;
}

/**
 * Test phone numbers
 */
export const TestPhones = {
  /** Test customer phone */
  customer: "whatsapp:+5511999999999",
  /** Test salon phone */
  salon: "whatsapp:+5511888888888",
  /** Alternative customer phone */
  customer2: "whatsapp:+5511777777777",
  /** Alternative salon phone */
  salon2: "whatsapp:+5511666666666",
};
