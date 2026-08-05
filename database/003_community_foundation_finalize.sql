-- Appended to the packaged v0.3 migration.
-- Pending applications are enforced in application logic so users may reapply after a prior denial or withdrawal.

ALTER TABLE team_applications
  DROP INDEX team_application_open_unique,
  ADD KEY team_applications_team_user_status_idx (team_id, applicant_user_id, status);
