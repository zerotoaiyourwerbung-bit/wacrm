/**
 * Intelligent phone number cleaner for Meta WhatsApp API.
 * Meta requires digits only with international country code (E.164 without '+').
 *
 * Automatically handles:
 * - Stripping +, spaces, brackets, dashes, dots, and float artifacts (e.g. "918359847846.0")
 * - Stripping international exit prefix "00" (e.g. "00918359847846" → "918359847846")
 * - Stripping domestic trunk prefix 0 (e.g. "08359847846" → "918359847846")
 * - Stripping trunk 0 after country code (e.g. "9108359847846" → "918359847846")
 * - Prepending default country code (default: '91' for India) when a 10-digit mobile number is given without country code
 *   (e.g. "8359847846" → "918359847846")
 * - Preserving already-valid international numbers (e.g. "+1 (415) 555-1212" → "14155551212")
 */
export function cleanPhoneForWhatsApp(
  input: string | number | null | undefined,
  defaultCountryCode = '91'
): string {
  if (input === null || input === undefined) return ''
  let str = String(input).trim()
  if (!str) return ''

  // 1. Strip spreadsheet float artifacts (e.g. "918359847846.0" from CSVs or numeric JSON)
  if (/\.\d+$/.test(str)) {
    str = str.replace(/\.\d+$/, '')
  }

  // Detect explicit international format (+ prefix)
  const hasLeadingPlus = str.startsWith('+')

  // 2. Keep digits only
  let digits = str.replace(/\D/g, '')
  if (!digits) return ''

  // 3. Strip international dial exit code "00" (e.g. "00918359847846" -> "918359847846")
  if (digits.startsWith('00') && digits.length >= 10) {
    digits = digits.slice(2)
  }

  // 4. Strip domestic trunk 0 for 11-digit numbers (e.g. "08359847846" -> "8359847846")
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1)
  }

  // 5. Prepend default country code if 10-digit number without explicit + (e.g. "8359847846" -> "918359847846")
  if (digits.length === 10 && !hasLeadingPlus) {
    const cc = defaultCountryCode.replace(/\D/g, '')
    digits = `${cc}${digits}`
  }

  // 6. Handle country code followed by trunk 0 (e.g. "9108359847846" -> 13 digits: "91" + "0" + 10-digit number)
  if (digits.startsWith('910') && digits.length === 13) {
    digits = `91${digits.slice(3)}`
  }

  return digits
}

/**
 * Sanitize phone number for Meta WhatsApp API.
 * Delegates to cleanPhoneForWhatsApp.
 */
export function sanitizePhoneForMeta(
  phone: string | number | null | undefined,
  defaultCountryCode = '91'
): string {
  return cleanPhoneForWhatsApp(phone, defaultCountryCode)
}

/**
 * Normalize phone number to canonical Meta-ready format.
 * Used for comparing phone numbers in different formats.
 */
export function normalizePhone(phone: string): string {
  return cleanPhoneForWhatsApp(phone)
}

/**
 * Compare two phone numbers accounting for trunk prefix differences.
 * e.g. "370063949836" (with trunk 0) matches "37063949836" (without trunk 0)
 * by comparing the last 8 digits, or by cleaned phone equivalence.
 */
export function phonesMatch(phone1: string, phone2: string): boolean {
  if (!phone1 || !phone2) return false
  const c1 = cleanPhoneForWhatsApp(phone1)
  const c2 = cleanPhoneForWhatsApp(phone2)
  if (c1 === c2) return true

  const n1 = normalizePhone(phone1)
  const n2 = normalizePhone(phone2)
  if (n1 === n2) return true
  if (n1.length >= 8 && n2.length >= 8) {
    return n1.slice(-8) === n2.slice(-8)
  }
  return false
}

/**
 * Validate phone number is E.164-like format (7-15 digits starting with non-zero).
 * Accepts with or without + prefix.
 */
export function isValidE164(phone: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(phone)
}

/**
 * Generate plausible phone number variants for retry when Meta's
 * sandbox rejects a number with error #131030 ("not in allowed list").
 */
export function phoneVariants(sanitized: string): string[] {
  if (!sanitized) return []
  const seen = new Set<string>()
  const push = (v: string) => {
    if (v && !seen.has(v)) seen.add(v)
  }

  // 1. Original
  push(sanitized)

  // 2. Insert a 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen) continue
    const cc = sanitized.slice(0, ccLen)
    const rest = sanitized.slice(ccLen)
    if (!rest.startsWith('0')) {
      push(cc + '0' + rest)
    }
  }

  // 3. Remove a leading 0 after each plausible country-code length
  for (const ccLen of [1, 2, 3]) {
    if (sanitized.length <= ccLen + 1) continue
    const cc = sanitized.slice(0, ccLen)
    const rest = sanitized.slice(ccLen)
    if (rest.startsWith('0')) {
      push(cc + rest.slice(1))
    }
  }

  return [...seen]
}

/**
 * Returns true when the Meta API error indicates the recipient
 * phone number isn't in the allowed list (sandbox restriction).
 * Detected via error code 131030 or the standard error text.
 */
export function isRecipientNotAllowedError(message: string): boolean {
  return /131030|not in allowed list|not in the allowed list/i.test(message)
}
