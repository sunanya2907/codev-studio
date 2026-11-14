import "server-only";
// Doctor / clinic / patient apps: extra rules for the agents (see lib/agents.ts).
// Combined with lib/tracking.ts when the idea also needs GPS (home visits, ambulance, nearby doctors).

const HEALTH_RE =
  /\b(doctor|doctors|clinic|hospital|patient|patients|appointment|appointments|telemedicine|telehealth|medical|healthcare|health care|pharmacy|ambulance|nurse|physician|dentist|diagnostic|opd|ehr|prescription)\b/i;

export const isHealthcareIdea = (idea: string) => HEALTH_RE.test(idea);

const CORE = `
HEALTHCARE RULES (this is a doctor / patient app; it handles sensitive personal data):
Entities: User with role PATIENT | DOCTOR | ADMIN; DoctorProfile (userId, specialty, licenseNumber, bio, clinicName, clinicAddress, consultationFee, languages, verified, acceptsHomeVisits); AvailabilitySlot (doctorId, weekday, startMinute, endMinute); Appointment (patientId, doctorId, type CLINIC | HOME_VISIT | VIDEO, status REQUESTED | CONFIRMED | IN_PROGRESS | COMPLETED | CANCELLED | NO_SHOW, scheduledAt, reason, patientAddress for home visits, meetingUrl for video, notes visible to the doctor only); Prescription (appointmentId, medicines JSON, advice, issuedAt); Review (appointmentId, rating 1-5, comment); AuditLog (actorId, action, entity, entityId, createdAt).
Flows and pages: patient registers, searches doctors by specialty / location / availability, books a slot (no double booking: check in a transaction), sees upcoming and past appointments, cancels, reads prescriptions, leaves a review. Doctor sets availability, accepts / declines requests, starts and completes a visit, writes a prescription. Admin verifies doctors. Video visits only store a meeting link (no video engine). Payments are out of scope (show the fee only).
Safety and privacy (must appear in the SRS and the code): patients can read only their own records and doctors only their own patients' records for appointments they hold; every read or write of prescriptions or notes writes an AuditLog row; show a clear notice "This app does not give medical advice. In an emergency call your local emergency number."; a consent checkbox at registration; no diagnosis or AI medical advice features; never put medical details in URLs, logs or error messages; a way to export and delete my data; mention the applicable laws (e.g. India DPDP Act, HIPAA, GDPR) as a compliance checklist item rather than claiming compliance.`;

const GPS_PART = `
LOCATION in this healthcare app: the doctor's live location is shared ONLY while a HOME_VISIT or ambulance appointment is IN_PROGRESS (or CONFIRMED within 60 minutes of scheduledAt) and only with that appointment's patient. The doctor starts and stops sharing explicitly (consent), and sees a visible "sharing" indicator. Patients never see other patients' or other doctors' locations. Location points of finished visits are deleted or anonymised after 30 days. Use the Device model as "the doctor's phone" linked to the Appointment (appointmentId on the share session) and make GET /api/live return only the doctor attached to the logged-in patient's active visit.`;

export const SRS_HEALTH_ADDENDUM = (tracking: boolean) =>
  `\n${CORE}${tracking ? GPS_PART : ""}\nPages must include: "/" (landing + doctor search), "/doctors/[id]", "/appointments", "/appointments/[id]", "/doctor" (doctor dashboard), "/doctor/availability", "/prescriptions", "/admin/doctors", "/privacy".`;

export const FRONTEND_HEALTH_ADDENDUM = (tracking: boolean) =>
  `\n${CORE}${tracking ? GPS_PART : ""}\nUI: mobile-first (it will be installed as an app on a phone), large touch targets, clear status chips for appointment states, an emergency notice in the footer, demo doctors, slots and appointments in the offline demo mode, and a visible consent step before any location sharing.`;

export const BACKEND_HEALTH_ADDENDUM = (tracking: boolean) =>
  `\n${CORE}${tracking ? GPS_PART : ""}\nEnforce role checks (PATIENT / DOCTOR / ADMIN) in every route, create appointments inside a Prisma transaction to prevent double booking, write AuditLog rows for prescription and notes access, and return 403 (not 404 details) for records that belong to someone else.`;

export const DATABASE_HEALTH_ADDENDUM = `\n${CORE}\nAdd @@unique([doctorId, scheduledAt]) on Appointment (or an equivalent guard), indexes on [patientId], [doctorId, scheduledAt] and AuditLog [entity, entityId], and enums for role, appointment type and status.`;

export const QA_HEALTH_ADDENDUM = `
Also check this healthcare app specifically: (1) role-based access on every route and no patient can read another patient's records; (2) double-booking protection; (3) AuditLog entries for prescription / notes access; (4) the "no medical advice / emergency" notice and consent step exist; (5) no medical details in URLs, logs or error messages; (6) data export / delete exist; (7) if location is shared, it is consent-based, limited to the active visit and the visit's patient, and deleted after the retention period. State clearly that the app is not certified for any medical regulation and needs a legal / compliance review before real patients use it.`;
