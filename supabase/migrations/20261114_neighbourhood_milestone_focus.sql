-- Allow milestone 0 ("focus") on neighbourhood_milestones: a
-- neighbourhood the cluster is working in that hasn't reached
-- Milestone 1 yet. No row still means "not a focus neighbourhood".

alter table neighbourhood_milestones drop constraint if exists neighbourhood_milestones_milestone_check;
alter table neighbourhood_milestones
  add constraint neighbourhood_milestones_milestone_check check (milestone between 0 and 3);
