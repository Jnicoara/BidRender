-- What is at each end of a traced run, and this run's own elevations.
--
-- ONE ALTER carrying five ADDs rather than five ALTERs — see 0046. MySQL
-- applies a single ALTER as one unit, so these five columns either all arrive
-- or none of them do, and there is no state where a run has three of them.
--
-- All five are nullable and all five stay NULL on every existing row. A run
-- with no `startKind` and no `endKind` counts no vertical, which is exactly
-- what every run in every existing bid did the day before this ran.
--
-- The KIND is stored here; the HEIGHT is not. How high a receptacle sits is
-- resolved live through run → job → company → shipped every time a number is
-- shown, so changing a setting re-prices the runs that inherit it. The two
-- `*HeightInches` columns are the per-run OVERRIDE of that, for the run the job
-- does not fit — NULL means "follow the setting", never "zero".
ALTER TABLE `takeoff_runs`
	ADD `startKind` varchar(64),
	ADD `endKind` varchar(64),
	ADD `startHeightInches` int,
	ADD `endHeightInches` int,
	ADD `distributionHeightInches` int;
