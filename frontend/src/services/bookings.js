import api from "./api";

/**
 * Create a new booking
 * @param {Object} payload - Booking data
 * @param {number} payload.lawyer_id - ID of the lawyer
 * @param {number} [payload.branch_id] - Optional branch ID
 * @param {string} [payload.scheduled_at] - ISO datetime string for scheduled time
 * @param {string} [payload.note] - Optional note/description
 * @returns {Promise<Object>} Created booking object
 */
export const createBooking = async (payload) => {
  const { data } = await api.post("/api/bookings", payload);
  return data;
};

/**
 * List bookings for the current user
 * - Clients see their own bookings
 * - Lawyers see bookings assigned to them
 * @returns {Promise<Array>} Array of booking objects
 */
export const listMyBookings = async () => {
  const { data } = await api.get("/api/bookings/my");
  return data;
};

/**
 * List booking summaries for the current user (with related info).
 * @returns {Promise<Array>} Array of booking summary objects
 */
export const listMyBookingSummaries = async () => {
  const { data } = await api.get("/api/bookings/my/summary");
  return data;
};

/**
 * List bookings for a specific case (client or lawyer only)
 * @param {number} caseId
 * @returns {Promise<Array>}
 */
export const listBookingsByCaseId = async (caseId) => {
  const { data } = await api.get("/api/bookings", { params: { case_id: caseId } });
  return data;
};

/**
 * Get a specific booking by ID
 * Only accessible by the booking's client or lawyer
 * @param {number} id - Booking ID
 * @returns {Promise<Object>} Booking object
 */
export const getBookingById = async (id) => {
  const { data } = await api.get(`/api/bookings/${id}`);
  return data;
};

/**
 * Cancel a booking
 * Only the client who owns the booking can cancel it
 * @param {number} id - Booking ID
 * @returns {Promise<Object>} Cancelled booking object with status
 */
export const cancelBooking = async (id) => {
  const { data } = await api.patch(`/api/bookings/${id}/cancel`);
  return data;
};

/**
 * List incoming booking requests for lawyer (status: pending)
 * Lawyer only endpoint
 * @returns {Promise<Array>} Array of pending booking objects
 */
export const lawyerListIncomingBookings = async (status) => {
  const params = status ? { status } : undefined;
  const { data } = await api.get("/api/bookings/lawyer/incoming", { params });
  return data;
};

/**
 * Confirm a booking request (lawyer only)
 * Only the assigned lawyer can confirm, only if status is PENDING
 * @param {number} bookingId - Booking ID
 * @returns {Promise<Object>} Confirmed booking object
 */
export const lawyerConfirmBooking = async (bookingId) => {
  const { data } = await api.patch(`/api/bookings/${bookingId}/confirm`);
  return data;
};

/**
 * Reject a booking request (lawyer only)
 * Only the assigned lawyer can reject, only if status is PENDING
 * @param {number} bookingId - Booking ID
 * @returns {Promise<Object>} Rejected booking object
 */
export const lawyerRejectBooking = async (bookingId) => {
  const { data } = await api.patch(`/api/bookings/${bookingId}/reject`);
  return data;
};

/**
 * Get incoming booking requests for lawyer (status: pending)
 * Lawyer only endpoint
 * @returns {Promise<Array>} Array of pending booking objects
 */
export const getLawyerIncomingBookings = async (status) => {
  const params = status ? { status } : undefined;
  const { data } = await api.get("/api/bookings/lawyer/incoming", { params });
  return data;
};

/**
 * Confirm a booking request (lawyer only)
 * Only the assigned lawyer can confirm, only if status is PENDING
 * @param {number} id - Booking ID
 * @returns {Promise<Object>} Confirmed booking object
 */
export const confirmBooking = async (id) => {
  const { data } = await api.patch(`/api/bookings/${id}/confirm`);
  return data;
};

/**
 * Reject a booking request (lawyer only)
 * Only the assigned lawyer can reject, only if status is PENDING
 * @param {number} id - Booking ID
 * @returns {Promise<Object>} Rejected booking object
 */
export const rejectBooking = async (id) => {
  const { data } = await api.patch(`/api/bookings/${id}/reject`);
  return data;
};

/**
 * Public: list active service packages for a lawyer (users.id)
 * @param {number} lawyerId
 * @returns {Promise<Array>}
 */
export const getLawyerServicePackages = async (lawyerId) => {
  const { data } = await api.get(`/api/lawyers/${lawyerId}/service-packages`);
  return data;
};

/**
 * Map a user_id (users table) to a lawyer profile (returns users.id).
 * @param {number} userId
 * @returns {Promise<number>} lawyer_id
 */
export const getLawyerIdByUser = async (userId) => {
  const { data } = await api.get(`/api/lawyers/by-user/${userId}`);
  return data?.lawyer_id;
};

/**
 * List cases for current client
 */
export const listMyCases = async () => {
  const { data } = await api.get("/api/cases/my");
  return data;
};

/**
 * Create a new case for current client
 */
export const createCase = async (payload) => {
  const { data } = await api.post("/api/cases", payload);
  return data;
};
