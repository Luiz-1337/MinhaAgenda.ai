/**
 * Evolution API Message Sending Service
 *
 * Handles WhatsApp message sending via Evolution API with:
 * - Circuit breaker protection
 * - Automatic retries
 * - Media support (image, audio, video, document)
 * - Phone number formatting
 */

import { db, salons, agents } from '@repo/db';
import { and, eq } from 'drizzle-orm';
import { getEvolutionClient, evolutionCircuitBreaker, EvolutionAPIError } from './evolution-api.service';
import { CircuitOpenError } from '../circuit-breaker';
import { logger, hashPhone } from '../logger';

/**
 * Media types supported by Evolution API
 */
export type MediaType = 'image' | 'audio' | 'video' | 'document';

/**
 * Message send options
 */
export interface SendMessageOptions {
  mediaUrl?: string;
  mediaType?: MediaType;
  fileName?: string;
  caption?: string;
}

/**
 * WhatsApp Message Send Error
 */
export class WhatsAppMessageError extends Error {
  readonly name = 'WhatsAppMessageError';
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(message: string, retryable = true, statusCode?: number) {
    super(message);
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

/**
 * Evolution API message response
 */
interface SendMessageResponse {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  message?: any;
  messageTimestamp?: number;
}

/**
 * Send WhatsApp message via Evolution API
 *
 * PROTECTED BY CIRCUIT BREAKER:
 * - If Evolution API is down, rejects quickly
 * - 10s timeout per call
 * - Opens circuit after 50% failures in 5+ requests
 *
 * @param to Phone number in E.164 format (e.g., +5511999999999)
 * @param body Message content
 * @param salonId Salon ID (required)
 * @param options Optional media and message options
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
  salonId: string,
  options?: SendMessageOptions
): Promise<{ messageId: string }> {
  const startTime = Date.now();

  // Get salon's Evolution instance
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      evolutionInstanceName: true,
      evolutionConnectionStatus: true,
    },
  });

  if (!salon) {
    throw new WhatsAppMessageError('Salon not found', false);
  }

  if (!salon.evolutionInstanceName) {
    throw new WhatsAppMessageError(
      'Evolution instance not configured for this salon',
      false
    );
  }

  if (salon.evolutionConnectionStatus !== 'connected') {
    throw new WhatsAppMessageError(
      'WhatsApp not connected. Please scan QR code first.',
      false
    );
  }

  // Normalize phone number (Evolution expects E.164 without "whatsapp:")
  const toNumber = normalizePhoneNumber(to);

  const client = getEvolutionClient();

  try {
    // Execute with circuit breaker
    const result = await evolutionCircuitBreaker.fire(async () => {
      // Send text message
      if (!options?.mediaUrl) {
        return client.post<SendMessageResponse>(
          `/message/sendText/${salon.evolutionInstanceName}`,
          {
            number: toNumber,
            textMessage: { text: body },
          }
        );
      }

      // Send media message
      return client.post<SendMessageResponse>(
        `/message/sendMedia/${salon.evolutionInstanceName}`,
        {
          number: toNumber,
          mediatype: options.mediaType || 'image',
          media: options.mediaUrl,
          caption: options.caption || body,
          fileName: options.fileName,
        }
      );
    });

    const duration = Date.now() - startTime;

    logger.info(
      {
        messageId: result.key.id,
        to: hashPhone(toNumber),
        salonId,
        bodyLength: body.length,
        hasMedia: !!options?.mediaUrl,
        mediaType: options?.mediaType,
        duration,
      },
      'WhatsApp message sent successfully via Evolution API'
    );

    return { messageId: result.key.id };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Circuit breaker open error
    if (error instanceof CircuitOpenError) {
      logger.error(
        {
          to: hashPhone(toNumber),
          salonId,
          circuitState: 'OPEN',
          resetIn: error.resetIn,
          duration,
        },
        'WhatsApp send blocked by circuit breaker'
      );
      throw new WhatsAppMessageError(
        'WhatsApp service temporarily unavailable',
        true
      );
    }

    // Evolution API errors
    const apiError = error as EvolutionAPIError;
    const isRetryable = apiError.retryable ?? true;

    logger.error(
      {
        err: error,
        to: hashPhone(toNumber),
        salonId,
        statusCode: apiError.statusCode,
        retryable: isRetryable,
        duration,
      },
      'Failed to send WhatsApp message via Evolution API'
    );

    throw new WhatsAppMessageError(
      apiError.message || 'Error sending WhatsApp message',
      isRetryable,
      apiError.statusCode
    );
  }
}

/**
 * Normalize phone number (remove whatsapp: prefix)
 */
export function normalizePhoneNumber(phone: string): string {
  return phone.replace('whatsapp:', '').trim();
}

/**
 * Format Brazilian phone number to E.164 (+55 DDD number)
 *
 * @param phone Phone number to format
 * @returns Formatted number in E.164 (e.g., +5511986049295) or null if invalid
 */
export function formatPhoneToE164(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Remove spaces, dashes, parentheses, and whatsapp: prefix
  let cleaned = phone
    .trim()
    .replace(/^whatsapp:/i, '')
    .replace(/\s/g, '')
    .replace(/-/g, '')
    .replace(/\(/g, '')
    .replace(/\)/g, '');

  // Remove all non-numeric characters except + at the beginning
  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/\D/g, '');

  if (!digits) return null;

  // If already has country code (+55), return as is (assuming correct)
  if (hasPlus) {
    // Validate has at least +55 + DDD (2) + number (8-9 digits)
    if (digits.length >= 12 && digits.startsWith('55')) {
      return `+${digits}`;
    }
    // If starts with + but not +55, might be another country, return as is
    return cleaned.startsWith('+') ? cleaned : `+${digits}`;
  }

  // If no +, add +55 (Brazil code)
  // Remove leading zeros if any (e.g., 011 -> 11)
  let normalizedDigits = digits.replace(/^0+/, '');

  // Validate Brazilian format: should have 10 or 11 digits (DDD + number)
  // DDD has 2 digits, number has 8 or 9 digits
  if (normalizedDigits.length >= 10 && normalizedDigits.length <= 11) {
    return `+55${normalizedDigits}`;
  }

  // If doesn't match Brazilian pattern, return null
  return null;
}

/**
 * Get WhatsApp number of active agent for salon
 *
 * @param salonId Salon ID
 * @returns Formatted number in E.164 or null if no active agent or number not configured
 */
export async function getActiveAgentWhatsAppNumber(salonId: string): Promise<string | null> {
  try {
    const activeAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
      columns: { whatsappNumber: true },
    });

    if (!activeAgent || !activeAgent.whatsappNumber) {
      return null;
    }

    return formatPhoneToE164(activeAgent.whatsappNumber);
  } catch (error) {
    logger.error(
      { err: error, salonId },
      'Error fetching active agent WhatsApp number'
    );
    return null;
  }
}
