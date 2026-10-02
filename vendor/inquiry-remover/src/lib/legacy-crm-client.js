"use strict";

/**
 * -client.js — CRM API Client
 *
 * Thin wrapper for contact operations.
 * Uses Private API Key (location-level) authentication.
 *
 * Follows the same pattern as the underwrite-iq-lite -contact-service.js
 * but scoped to inquiry-removal needs (custom field updates + notes).
 */

const = "https://services..com";
const = "2021-07-28";

function getConfig() {
  return { apiKey, locationId };
}

function isConfigured() {
}

async function legacyCrmFetch(path, options = {}) {
  const { apiKey } = getConfig();
 const url = `${}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
 Version: ,
      ...options.headers
    }
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
 ` ${options.method || "GET"} ${path} failed: ${resp.status} ${text.substring(0, 300)}`
    );
  }

  return resp.json();
}

// ---------------------------------------------------------------------------
// Update Contact Custom Fields
// ---------------------------------------------------------------------------

/**
 * Update custom fields on a contact.
 *
 * @param {string} contactId - contact ID
 * @param {Object} customFields - Key/value pairs to set, e.g. { ai_call_master_status: "completed" }
 * @returns {Promise<Object>} API response
 */
async function updateContactCustomFields(contactId, customFields) {
  if (!contactId) throw new Error("contactId is required");

 // expects: customFields: [{ key: "field_name", field_value: "value" }]
  const customFieldsArray = Object.entries(customFields).map(([key, value]) => ({
    key,
    field_value: String(value)
  }));

  return legacyCrmFetch(`/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify({ customFields: customFieldsArray })
  });
}

// ---------------------------------------------------------------------------
// Add Note to Contact
// ---------------------------------------------------------------------------

/**
 * Add a note to a contact's activity timeline.
 *
 * @param {string} contactId - contact ID
 * @param {string} body - Note text content
 * @returns {Promise<Object>} API response
 */
async function addContactNote(contactId, body) {
  if (!contactId) throw new Error("contactId is required");
  if (!body) throw new Error("Note body is required");

  return legacyCrmFetch(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

// ---------------------------------------------------------------------------
// Add Tag to Contact
// ---------------------------------------------------------------------------

/**
 * Add tags to a contact.
 *
 * @param {string} contactId - contact ID
 * @param {string[]} tags - Tags to add
 * @returns {Promise<Object>} API response
 */
async function addContactTags(contactId, tags) {
  if (!contactId) throw new Error("contactId is required");

  return legacyCrmFetch(`/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags })
  });
}

module.exports = {
  isConfigured,
  updateContactCustomFields,
  addContactNote,
  addContactTags,
  getCalendars,
  getFreeSlots,
  createAppointment,
  getContactByPhone
};

// ---------------------------------------------------------------------------
// Calendar Operations
// ---------------------------------------------------------------------------

/**
 * List all calendars in the location.
 * @returns {Promise<Object[]>} Array of calendar objects
 */
async function getCalendars() {
  const data = await legacyCrmFetch("/calendars/");
  return data.calendars || [];
}

/**
 * Get free appointment slots for a calendar.
 *
 * @param {string} calendarId
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {string} endDate - ISO date string (YYYY-MM-DD)
 * @param {string} [timezone="America/New_York"]
 * @returns {Promise<Object>} Slot map keyed by date
 */
async function getFreeSlots(calendarId, startDate, endDate, timezone = "America/New_York") {
  if (!calendarId) throw new Error("calendarId is required");
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const params = new URLSearchParams({
    startDate: String(startMs),
    endDate: String(endMs),
    timezone
  });
  return legacyCrmFetch(`/calendars/${calendarId}/free-slots?${params}`);
}

/**
 * Create an appointment on a calendar.
 *
 * @param {Object} opts
 * @param {string} opts.calendarId
 * @param {string} opts.contactId - contact ID
 * @param {string} opts.startTime - ISO 8601 timestamp
 * @param {string} opts.endTime - ISO 8601 timestamp
 * @param {string} [opts.title="FundHub Credit Consultation"]
 * @param {string} [opts.assignedUserId]
 * @returns {Promise<Object>} Created appointment
 */
async function createAppointment({ calendarId, contactId, startTime, endTime, title, assignedUserId }) {
  if (!calendarId) throw new Error("calendarId is required");
  if (!contactId) throw new Error("contactId is required");
  if (!startTime) throw new Error("startTime is required");

  const { locationId } = getConfig();
  const body = {
    calendarId,
    locationId,
    contactId,
    startTime,
    endTime: endTime || new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(),
    title: title || "FundHub Credit Consultation",
    appointmentStatus: "confirmed"
  };
  if (assignedUserId) body.assignedUserId = assignedUserId;

  return legacyCrmFetch("/calendars/events/appointments", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/**
 * Search for a contact by phone number.
 *
 * @param {string} phone - Phone number (E.164 or 10-digit)
 * @returns {Promise<Object|null>} Contact object or null
 */
async function getContactByPhone(phone) {
  if (!phone) throw new Error("phone is required");
  const { locationId } = getConfig();
  const params = new URLSearchParams({
    locationId,
    query: phone
  });
  const data = await legacyCrmFetch(`/contacts/?${params}`);
  const contacts = data.contacts || [];
  return contacts.length > 0 ? contacts[0] : null;
}
