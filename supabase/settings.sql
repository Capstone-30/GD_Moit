-- Replace every NULL with an approved operating value before executing.
-- The NOT NULL constraints deliberately prevent an unconfigured signup launch.
insert into public.app_settings
  (id, school_name, email_domain, semester, weekdays, period_count, retention_policy, public_places)
values (
  true,
  null, -- School name
  null, -- Exact lowercase email domain (without @)
  null, -- Semester identifier
  null, -- Distinct weekdays in order: Monday=1 ... Sunday=7, e.g. array[1,2,3,4,5]
  null, -- Number of periods, 1..99
  null, -- Approved retention period and deletion policy, including comments and reports
  null  -- Approved public campus places, e.g. array['중앙도서관 1층 로비']
);
