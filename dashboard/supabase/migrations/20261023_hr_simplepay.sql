-- HR Connect: SimplePay as a fourth source of the employee list (23 Oct 2026).
alter table hr_submissions drop constraint if exists hr_submissions_source_check;
alter table hr_submissions add constraint hr_submissions_source_check
  check (source in ('csv','talenox','simplepay','workday','manual'));
