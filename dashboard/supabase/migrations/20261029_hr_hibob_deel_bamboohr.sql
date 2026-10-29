-- HR Connect: HiBob, Deel and BambooHR as sources of the employee list (29 Oct 2026).
-- Supersedes 20261023_hr_simplepay.sql (same constraint, now with every source).
alter table hr_submissions drop constraint if exists hr_submissions_source_check;
alter table hr_submissions add constraint hr_submissions_source_check
  check (source in ('csv','talenox','simplepay','workday','hibob','deel','bamboohr','manual'));
