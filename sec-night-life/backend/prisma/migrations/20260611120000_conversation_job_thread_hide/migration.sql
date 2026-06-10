-- Per-user conversation hide + venue/applicant job thread hide
ALTER TABLE "conversations" ADD COLUMN "participant_a_hidden_at" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN "participant_b_hidden_at" TIMESTAMP(3);

ALTER TABLE "job_applications" ADD COLUMN "venue_hidden_at" TIMESTAMP(3);
ALTER TABLE "job_applications" ADD COLUMN "applicant_hidden_at" TIMESTAMP(3);
