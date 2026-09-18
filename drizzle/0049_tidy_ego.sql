-- This job's distribution height. NULL inherits the company's.
--
-- Already one statement as generated. Additive and nullable, so the running
-- build — which has never heard of this column — goes on reading `bids`
-- exactly as before. That is what makes migrating BEFORE deploying safe, and
-- deploying first unsafe: nearly every read here is a bare select() that names
-- every column the RUNNING code knows about.
ALTER TABLE `bids` ADD `distributionHeightInches` int;
