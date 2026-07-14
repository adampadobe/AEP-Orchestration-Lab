/**
 * Lab profile email + phone format guardrails (Portal parity).
 * Scaled pattern: <local>+DDMMYYYY-N@<domain> or <local>+tag-DDMMYYYY-N@<domain>
 */

import { LAB_DEFAULT_MOBILE_PHONE } from './labFramework.mjs';

export const LAB_EMAIL_PATTERN_DESCRIPTION =
  '<local>+DDMMYYYY-N@<domain> (daily counter N per uid+sandbox; if local already has +tag, appends -DDMMYYYY-N)';

/** Matches scaleEmail output from labProfileGenerationPrefsStore. */
export const SCALED_LAB_EMAIL_REGEX =
  /^[^\s@]+(?:\+[^\s@-]*)?[\+\-](\d{2})(\d{2})(\d{4})-(\d+)@[^\s@]+\.[^\s@]+$/;

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * @param {Date} [date]
 */
export function formatExampleScaledEmail(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `apalmer+${dd}${mm}${yyyy}-1@adobetest.com`;
}

/**
 * @returns {{
 *   emailPattern: string,
 *   example: string,
 *   defaultMobile: string,
 *   storedPrefsPath: string,
 *   rejectExamples: string[],
 *   coworkerWorkflow: string[],
 * }}
 */
export function buildEmailFormatRules() {
  const example = formatExampleScaledEmail();
  return {
    emailPattern: LAB_EMAIL_PATTERN_DESCRIPTION,
    example,
    defaultMobile: LAB_DEFAULT_MOBILE_PHONE,
    storedPrefsPath: 'Profile Viewer → Profile Generation base email field, or lab_set_generation_prefs',
    rejectExamples: [
      'travel.demo+001@adobetest.com (legacy +001 — missing DDMMYYYY-N)',
      'homepage.jane@customer.com (persona slug — never use for lab profiles)',
    ],
    coworkerWorkflow: [
      '1. Call lab_confirm_profile_generation (or lab_get_generation_prefs) and show colleague the next preview email.',
      '2. Ask colleague to confirm base email + domain OR approve stored prefs defaults.',
      '3. Omit email on lab_generate_profile (use_stored_prefs default) to atomically reserve the counter.',
      '4. Custom email only when it already matches +DDMMYYYY-N; otherwise configure prefs first.',
    ],
  };
}

/**
 * @param {string} email
 * @param {object} [opts]
 * @param {boolean} [opts.requireTodayDate]
 */
export function validateScaledLabEmail(email, opts = {}) {
  const value = String(email || '').trim();
  if (!value) {
    return {
      ok: false,
      error: 'email is required',
      coworkerPrompt: 'Ask the colleague for a base email and domain, or omit email to use Firestore generation prefs.',
    };
  }

  const match = value.match(SCALED_LAB_EMAIL_REGEX);
  if (!match) {
    const rules = buildEmailFormatRules();
    return {
      ok: false,
      error: `Email does not match lab scaled format (${LAB_EMAIL_PATTERN_DESCRIPTION}).`,
      coworkerPrompt:
        `Lab profiles must use plus-addressing with today's date and daily counter N. ` +
        `Expected example: ${rules.example}. ` +
        `Ask colleague to confirm base email + domain, then call lab_set_generation_prefs or omit email on generate.`,
      expectedPattern: LAB_EMAIL_PATTERN_DESCRIPTION,
      example: rules.example,
      provided: value,
    };
  }

  if (opts.requireTodayDate) {
    const [, dd, mm, yyyy] = match;
    const now = new Date();
    const todayDd = String(now.getDate()).padStart(2, '0');
    const todayMm = String(now.getMonth() + 1).padStart(2, '0');
    const todayYyyy = String(now.getFullYear());
    if (dd !== todayDd || mm !== todayMm || yyyy !== todayYyyy) {
      return {
        ok: false,
        error: `Email date ${dd}${mm}${yyyy} does not match today ${todayDd}${todayMm}${todayYyyy}.`,
        coworkerPrompt:
          'Counter emails are dated per day. Omit email to reserve today\'s next counter via lab_generate_profile, or update the date segment.',
        expectedPattern: LAB_EMAIL_PATTERN_DESCRIPTION,
        example: formatExampleScaledEmail(),
        provided: value,
      };
    }
  }

  return { ok: true, email: value };
}

/**
 * @param {string} phone
 */
export function validateE164MobilePhone(phone) {
  const value = String(phone || '').trim();
  if (!value) {
    return {
      ok: false,
      error: 'mobile phone is required',
      coworkerPrompt: `Ask colleague for E.164 mobile or use lab default ${LAB_DEFAULT_MOBILE_PHONE} via generation prefs.`,
    };
  }
  if (!E164_REGEX.test(value)) {
    return {
      ok: false,
      error: 'mobile phone must be E.164 format (e.g. +447425627462)',
      coworkerPrompt: 'Ask colleague for international format starting with + and country code.',
      provided: value,
      example: LAB_DEFAULT_MOBILE_PHONE,
    };
  }
  return { ok: true, phone: value };
}

/**
 * Questions Coworker should ask before first generate on a sandbox.
 * @param {object} [prefs]
 */
export function buildProfileGenerationConfirmQuestions(prefs = {}) {
  const rules = buildEmailFormatRules();
  const hasBase = !!String(prefs.baseEmail || '').trim();
  return {
    formatRules: rules,
    questionsForColleague: [
      'Which sandbox are we generating test profiles for?',
      hasBase
        ? `Confirm base email stays ${prefs.baseEmail} (next scaled: ${prefs.nextScaledEmail || 'set counter via Portal'})?`
        : 'What base email should we store (e.g. apalmer@adobetest.com or colleague@customer.com)?',
      `Confirm mobile phone for profiles (lab default ${rules.defaultMobile}, or provide E.164)?`,
      'Should we use the shared Firestore counter (recommended — omit email on generate) or a one-off scaled email you already reserved?',
    ],
    recommendedAction: hasBase
      ? 'Call lab_generate_profile without email (reserves next counter automatically).'
      : 'Call lab_set_generation_prefs with base_email, then lab_confirm_profile_generation with confirmed:true.',
    prefsReady: hasBase,
    nextScaledEmailPreview: prefs.nextScaledEmail || null,
    counterN: prefs.counterN ?? null,
    mobilePhone: prefs.mobilePhone || rules.defaultMobile,
  };
}
